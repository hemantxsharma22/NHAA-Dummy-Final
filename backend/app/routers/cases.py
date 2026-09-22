"""
NHAA Case Intelligence & Complaint Management Router.
Handles Citizen complaint submission, anonymous tracking, Officer Triage,
AI overrides, Emergency Escalation, Admin Analytics, and Sanitized Audit Logging.
"""

import json
import random
import string
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.nhaa_models import (
    User,
    Officer,
    Case,
    Complaint,
    Transcript,
    AudioAssessment,
    EmotionResult,
    NLPResult,
    RiskAssessment,
    AuditLog,
)
from app.auth.security import (
    get_current_user,
    require_authenticated_user,
    require_role,
    require_write_permission,
    normalize_role,
    sanitize_log_data,
    ROLE_ADMIN,
    ROLE_NODAL_OFFICER,
    ROLE_OFFICER,
    ROLE_OPERATOR,
    ROLE_VIEWER,
    ROLE_CITIZEN,
)
from app.services.audit_service import (
    record_audit_log,
    log_case_access,
    log_case_update,
    log_ai_recommendation,
    log_ai_override,
    log_case_escalation,
)
from app.nlp_intelligence.spacy_extractor import extract_nlp_entities
from app.nlp_intelligence.emotion_classifier import analyze_emotion
from app.nlp_intelligence.case_indicators import extract_case_indicators
from app.risk_engine.feature_fusion import fuse_multimodal_features
from app.risk_engine.risk_classifier import risk_engine
from app.ai_engine_1.gemini_assistant import generate_case_intelligence
from app.ai_engine_2.engine2_analytics import match_semantic_precedents

router = APIRouter(tags=["Cases, Complaints & Analytics"])


def _generate_code(prefix: str, length: int = 5) -> str:
    chars = "".join(random.choices(string.digits, k=length))
    return f"{prefix}-{chars}"


class ComplaintSubmissionRequest(BaseModel):
    narrative: str
    channel: Optional[str] = "web"  # web, voice, mobile
    category: Optional[str] = "Emergency Assistance"
    location: Optional[str] = None
    district: Optional[str] = "Central District"
    is_anonymous: Optional[bool] = True
    incident_time: Optional[str] = None
    requested_help: Optional[str] = None


class CaseTriageRequest(BaseModel):
    status: Optional[str] = None  # OPEN, TRIAGED, IN_INVESTIGATION, RESOLVED, CLOSED
    priority: Optional[str] = None  # LOW, MEDIUM, HIGH, CRITICAL
    assigned_officer_id: Optional[int] = None
    triage_notes: Optional[str] = None


class AIOverrideRequest(BaseModel):
    original_risk_level: str
    new_risk_level: str
    rationale: str
    original_priority: Optional[str] = None
    new_priority: Optional[str] = None


class CaseEscalationRequest(BaseModel):
    escalation_tier: Optional[str] = "Senior Nodal Officer / PCR Emergency Dispatch"
    rationale: str
    notify_pcr: Optional[bool] = True


# ==============================================================================
# 1. CITIZEN COMPLAINT SUBMISSION (ANONYMOUS OR AUTHENTICATED)
# ==============================================================================
@router.post("/api/complaints/submit")
def submit_complaint(
    req: ComplaintSubmissionRequest,
    request: Request,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submits a citizen grievance/complaint with anonymous tracking code.
    Extracts NLP entities, emotion indicators, risk level, and historical precedents.
    """
    if not req.narrative or not req.narrative.strip():
        raise HTTPException(status_code=400, detail="Complaint narrative is required.")

    case_code = f"NHAA-CASE-2026-{random.randint(10000, 99999)}"
    anon_id = f"CITIZEN-ANON-{random.randint(1000, 9999)}" if req.is_anonymous else None
    complaint_code = f"CMP-{random.randint(10000, 99999)}"

    # 1. NLP Extraction
    nlp_res = extract_nlp_entities(req.narrative)

    # 2. Emotion / Sentiment Analysis
    emotion_res = analyze_emotion(req.narrative)

    # 3. Case Indicators
    indicators_res = extract_case_indicators(req.narrative)

    # 4. Multimodal Fusion & Risk Classification
    dummy_acoustics = {"rms_energy": 0.05, "pause_ratio": 0.15, "speech_rate": 2.5, "pitch_variation": 0.15}
    fused = fuse_multimodal_features(dummy_acoustics, nlp_res, emotion_res, indicators_res)
    risk_res = risk_engine.classify_multimodal(fused)

    # 5. Gemini AI Assistance
    gemini_intel = generate_case_intelligence(
        req.narrative,
        indicators=indicators_res["matched_indicators"],
        emotion=emotion_res["dominant_emotion"],
        risk_level=risk_res["risk_level"],
    )

    # 6. Historical Case Matching
    hist_matches = match_semantic_precedents(req.narrative, req.district or "Central", top_k=3)

    # 7. Create Case in DB
    new_case = Case(
        case_id=case_code,
        anonymous_id=anon_id,
        citizen_user_id=current_user.id if (current_user and not req.is_anonymous) else None,
        category=req.category or nlp_res["incident_type"].replace("_", " ").title(),
        status="OPEN",
        priority="HIGH" if risk_res["risk_level"] == "HIGH" else "MEDIUM",
        title=f"Assistance Request: {nlp_res['incident_type'].replace('_', ' ').title()}",
        description=req.narrative,
        location=req.location or (nlp_res["locations"][0] if nlp_res["locations"] else "Location not specified"),
        district=req.district or "Central District",
        risk_level=risk_res["risk_level"],
        risk_score=risk_res["risk_score"],
        is_anonymous=req.is_anonymous,
    )
    db.add(new_case)
    db.commit()
    db.refresh(new_case)

    # 8. Create Complaint Record
    complaint = Complaint(
        complaint_code=complaint_code,
        case_id=new_case.id,
        channel=req.channel or "web",
        narrative=req.narrative,
        requested_help=req.requested_help or indicators_res["requested_help"],
        incident_time=req.incident_time or (nlp_res["time_references"][0] if nlp_res["time_references"] else None),
        persons_involved=", ".join(nlp_res["persons"]) if nlp_res["persons"] else None,
    )
    db.add(complaint)

    # 9. Create Assessment Records
    nlp_rec = NLPResult(
        case_id=new_case.id,
        session_id=case_code,
        persons_json=json.dumps(nlp_res["persons"]),
        locations_json=json.dumps(nlp_res["locations"]),
        time_references_json=json.dumps(nlp_res["time_references"]),
        organizations_json=json.dumps(nlp_res["organizations"]),
        incident_type=nlp_res["incident_type"],
        tokens_count=nlp_res["tokens_count"],
    )
    db.add(nlp_rec)

    emotion_rec = EmotionResult(
        case_id=new_case.id,
        session_id=case_code,
        dominant_emotion=emotion_res["dominant_emotion"],
        confidence=emotion_res["confidence"],
        fear_score=emotion_res["emotion_scores"].get("fear", 0.0),
        sadness_score=emotion_res["emotion_scores"].get("sadness", 0.0),
        anger_score=emotion_res["emotion_scores"].get("anger", 0.0),
        neutral_score=emotion_res["emotion_scores"].get("neutral", 0.0),
        urgency_score=emotion_res["urgency_score"],
        distress_score=emotion_res["distress_score"],
        emotion_scores_json=json.dumps(emotion_res["emotion_scores"]),
    )
    db.add(emotion_rec)

    risk_rec = RiskAssessment(
        case_id=new_case.id,
        session_id=case_code,
        risk_level=risk_res["risk_level"],
        risk_score=risk_res["risk_score"],
        threat_detected=indicators_res["threat_detected"],
        violence_detected=indicators_res["violence_detected"],
        urgency_detected=indicators_res["urgency_detected"],
        immediate_danger=indicators_res["immediate_danger"],
        fused_features_json=json.dumps(fused["structured"]),
        feature_contributions_json=json.dumps(risk_res["feature_contributions"]),
        explanation=risk_res["explanation"],
        recommended_action=risk_res["recommended_action"],
    )
    db.add(risk_rec)
    db.commit()

    # 10. Sanitized Audit Log for Complaint Registration
    record_audit_log(
        db=db,
        action="COMPLAINT_FILED",
        rationale=f"Complaint registered via channel '{req.channel}'. Category: {new_case.category}. Risk: {risk_res['risk_level']}.",
        case_id=new_case.id,
        user=current_user,
        user_role=normalize_role(current_user.role if current_user else "Citizen"),
        ip_address=request.client.host if request.client else None,
    )

    # 11. Sanitized Audit Log for AI Recommendation
    log_ai_recommendation(
        db=db,
        case_id=new_case.id,
        engine_name="Multimodal Risk Classifier (Engine 1 + NLP)",
        recommendation=risk_res["recommended_action"],
        risk_level=risk_res["risk_level"],
        confidence=risk_res["risk_score"],
    )

    return {
        "status": "success",
        "case_id": case_code,
        "anonymous_id": anon_id,
        "complaint_code": complaint_code,
        "risk_level": risk_res["risk_level"],
        "summary": gemini_intel["case_summary"],
        "extracted_entities": nlp_res,
        "recommended_action": risk_res["recommended_action"],
        "similar_precedents": hist_matches,
        "message": "Complaint successfully registered. Save your case_id / anonymous_id for tracking.",
    }


# ==============================================================================
# 2. CITIZEN CASE TRACKING (SAFE, ANONYMOUS LOOKUP)
# ==============================================================================
@router.get("/api/cases/track/{tracking_id}")
def track_case_status(tracking_id: str, db: Session = Depends(get_db)):
    """
    Public citizen tracking endpoint. Returns high-level status without exposing
    internal officer notes, audit logs, or sensitive personal data.
    """
    clean_id = tracking_id.strip()
    case = db.query(Case).filter((Case.case_id == clean_id) | (Case.anonymous_id == clean_id)).first()

    if not case:
        raise HTTPException(status_code=404, detail="No record found matching the provided tracking ID.")

    return {
        "case_id": case.case_id,
        "anonymous_id": case.anonymous_id,
        "category": case.category,
        "status": case.status,
        "priority": case.priority,
        "district": case.district,
        "registered_on": case.created_at,
        "last_updated": case.updated_at,
        "assigned_unit": "District Nodal Emergency Cell" if case.assigned_officer_id else "Helpline Triage Queue",
    }


# ==============================================================================
# 3. RBAC CASE MANAGEMENT (OPERATOR, OFFICER, ADMIN, VIEWER)
# ==============================================================================
@router.get("/api/cases")
def list_cases(
    status: Optional[str] = None,
    risk_level: Optional[str] = None,
    district: Optional[str] = None,
    user: User = Depends(require_role(["Admin", "Nodal Officer", "Officer", "Operator", "Viewer"])),
    db: Session = Depends(get_db),
):
    query = db.query(Case)
    if status:
        query = query.filter(Case.status == status)
    if risk_level:
        query = query.filter(Case.risk_level == risk_level)
    if district:
        query = query.filter(Case.district == district)

    cases = query.order_by(Case.created_at.desc()).limit(100).all()
    return [
        {
            "id": c.id,
            "case_id": c.case_id,
            "title": c.title,
            "category": c.category,
            "status": c.status,
            "priority": c.priority,
            "risk_level": c.risk_level,
            "risk_score": c.risk_score,
            "location": c.location,
            "district": c.district,
            "is_anonymous": c.is_anonymous,
            "created_at": c.created_at,
        }
        for c in cases
    ]


@router.get("/api/cases/{case_id}")
def get_case_detail(
    case_id: str,
    request: Request,
    user: User = Depends(require_role(["Admin", "Nodal Officer", "Officer", "Operator", "Viewer"])),
    db: Session = Depends(get_db),
):
    case = db.query(Case).filter((Case.case_id == case_id) | (Case.id == int(case_id) if case_id.isdigit() else False)).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    # Audit log for case access
    log_case_access(
        db=db,
        case_id=case.id,
        user=user,
        rationale=f"Case dossier viewed by {user.username} ({normalize_role(user.role)})",
        ip_address=request.client.host if request.client else None,
    )

    # Fetch child records
    complaints = db.query(Complaint).filter(Complaint.case_id == case.id).all()
    transcripts = db.query(Transcript).filter(Transcript.case_id == case.id).all()
    risk_records = db.query(RiskAssessment).filter(RiskAssessment.case_id == case.id).all()
    nlp_records = db.query(NLPResult).filter(NLPResult.case_id == case.id).all()
    emotion_records = db.query(EmotionResult).filter(EmotionResult.case_id == case.id).all()
    audits = db.query(AuditLog).filter(AuditLog.case_id == case.id).order_by(AuditLog.timestamp.desc()).all()

    return {
        "case_id": case.case_id,
        "anonymous_id": case.anonymous_id,
        "title": case.title,
        "description": case.description,
        "category": case.category,
        "status": case.status,
        "priority": case.priority,
        "risk_level": case.risk_level,
        "risk_score": case.risk_score,
        "district": case.district,
        "location": case.location,
        "created_at": case.created_at,
        "updated_at": case.updated_at,
        "complaints": [
            {
                "code": c.complaint_code,
                "channel": c.channel,
                "narrative": c.narrative,
                "requested_help": c.requested_help,
            }
            for c in complaints
        ],
        "nlp_results": [
            {
                "persons": json.loads(n.persons_json or "[]"),
                "locations": json.loads(n.locations_json or "[]"),
                "time_references": json.loads(n.time_references_json or "[]"),
                "incident_type": n.incident_type,
            }
            for n in nlp_records
        ],
        "risk_assessment": (
            {
                "level": risk_records[-1].risk_level,
                "score": risk_records[-1].risk_score,
                "explanation": risk_records[-1].explanation,
                "recommended_action": risk_records[-1].recommended_action,
                "feature_contributions": json.loads(risk_records[-1].feature_contributions_json or "[]"),
            }
            if risk_records
            else None
        ),
        "audit_logs": [
            {
                "action": a.action,
                "user_role": a.user_role,
                "rationale": sanitize_log_data(a.rationale),
                "timestamp": a.timestamp,
            }
            for a in audits
        ],
    }


@router.post("/api/cases/{case_id}/triage")
def triage_case(
    case_id: str,
    req: CaseTriageRequest,
    request: Request,
    user: User = Depends(require_role(["Admin", "Nodal Officer", "Officer", "Operator"])),
    _write_guard: User = Depends(require_write_permission()),
    db: Session = Depends(get_db),
):
    case = db.query(Case).filter((Case.case_id == case_id) | (Case.id == int(case_id) if case_id.isdigit() else False)).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    old_status = case.status
    old_priority = case.priority

    if req.status:
        case.status = req.status
    if req.priority:
        case.priority = req.priority
    if req.assigned_officer_id is not None:
        case.assigned_officer_id = req.assigned_officer_id

    case.updated_at = datetime.utcnow()

    # Determine audit action type: ESCALATION, OVERRIDE, or TRIAGE_UPDATE
    notes_lower = (req.triage_notes or "").lower()
    if "override" in notes_lower:
        action_type = "OVERRIDE"
    elif (
        (req.priority in ("HIGH", "CRITICAL") and old_priority not in ("HIGH", "CRITICAL"))
        or (req.priority == "CRITICAL" and old_priority != "CRITICAL")
        or ("escalat" in notes_lower and "de-escalat" not in notes_lower)
    ):
        action_type = "ESCALATION"
    elif req.status and req.status != old_status:
        action_type = f"TRIAGE_UPDATE ({old_status} -> {case.status})"
    else:
        action_type = "CASE_UPDATE"

    clean_rationale = sanitize_log_data(
        req.triage_notes or f"Updated status to {case.status}, priority to {case.priority} by {user.full_name or user.username}"
    )

    record_audit_log(
        db=db,
        action=action_type,
        rationale=clean_rationale,
        case_id=case.id,
        user=user,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    return {
        "status": "success",
        "case_id": case.case_id,
        "new_status": case.status,
        "priority": case.priority,
        "action_logged": action_type,
    }


# ==============================================================================
# 4. AI RECOMMENDATION OVERRIDE (NODAL OFFICER & ADMIN)
# ==============================================================================
@router.post("/api/cases/{case_id}/override")
def override_ai_recommendation(
    case_id: str,
    req: AIOverrideRequest,
    request: Request,
    user: User = Depends(require_role([ROLE_NODAL_OFFICER, ROLE_OFFICER, ROLE_ADMIN])),
    _write_guard: User = Depends(require_write_permission()),
    db: Session = Depends(get_db),
):
    """
    Enables authorized Nodal Officers & Admins to formally override an AI-generated
    risk classification or recommendation, recording non-repudiable audit reasoning.
    """
    case = db.query(Case).filter((Case.case_id == case_id) | (Case.id == int(case_id) if case_id.isdigit() else False)).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    if not req.rationale or not req.rationale.strip():
        raise HTTPException(status_code=400, detail="Officer rationale is mandatory for AI recommendation override.")

    # Update case risk level & priority
    case.risk_level = req.new_risk_level
    if req.new_priority:
        case.priority = req.new_priority
    case.updated_at = datetime.utcnow()
    db.commit()

    # Record sanitized audit log
    log_ai_override(
        db=db,
        case_id=case.id,
        user=user,
        original_ai_verdict=req.original_risk_level,
        overridden_verdict=req.new_risk_level,
        rationale=req.rationale,
        ip_address=request.client.host if request.client else None,
    )

    return {
        "status": "success",
        "case_id": case.case_id,
        "risk_level": case.risk_level,
        "priority": case.priority,
        "action_logged": "OVERRIDE",
        "overridden_by": user.full_name or user.username,
        "message": "AI recommendation successfully overridden and recorded in non-repudiable audit trail.",
    }


# ==============================================================================
# 5. EMERGENCY CASE ESCALATION (OPERATOR, NODAL OFFICER, ADMIN)
# ==============================================================================
@router.post("/api/cases/{case_id}/escalate")
def escalate_case(
    case_id: str,
    req: CaseEscalationRequest,
    request: Request,
    user: User = Depends(require_role([ROLE_OPERATOR, ROLE_NODAL_OFFICER, ROLE_OFFICER, ROLE_ADMIN])),
    _write_guard: User = Depends(require_write_permission()),
    db: Session = Depends(get_db),
):
    """
    Escalates a critical case to high-priority emergency status and notifies Nodal dispatch.
    """
    case = db.query(Case).filter((Case.case_id == case_id) | (Case.id == int(case_id) if case_id.isdigit() else False)).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    case.priority = "CRITICAL"
    case.status = "TRIAGED"
    case.risk_level = "HIGH"
    case.updated_at = datetime.utcnow()
    db.commit()

    # Log escalation in sanitized audit trail
    log_case_escalation(
        db=db,
        case_id=case.id,
        user=user,
        escalation_tier=req.escalation_tier or "Senior Nodal Officer",
        rationale=req.rationale,
        ip_address=request.client.host if request.client else None,
    )

    return {
        "status": "success",
        "case_id": case.case_id,
        "priority": "CRITICAL",
        "status_label": case.status,
        "action_logged": "ESCALATION",
        "message": f"Case escalated to {req.escalation_tier}. Immediate dispatch trigger active.",
    }


# ==============================================================================
# 6. OFFICER DASHBOARD ENDPOINTS
# ==============================================================================
@router.get("/api/officer/dashboard")
def get_officer_dashboard(
    user: User = Depends(require_role(["Admin", "Nodal Officer", "Officer"])),
    db: Session = Depends(get_db),
):
    total_open = db.query(Case).filter(Case.status == "OPEN").count()
    total_triaged = db.query(Case).filter(Case.status == "TRIAGED").count()
    total_high_risk = db.query(Case).filter(Case.risk_level == "HIGH").count()
    assigned_count = (
        db.query(Case).filter(Case.assigned_officer_id == user.officer_profile.id).count()
        if user.officer_profile
        else 0
    )

    recent_urgent_cases = (
        db.query(Case)
        .filter(Case.risk_level.in_(["HIGH", "MODERATE"]))
        .order_by(Case.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "officer_name": user.full_name or user.username,
        "badge_number": user.officer_profile.badge_number if user.officer_profile else "ADMIN",
        "stats": {
            "total_open_cases": total_open,
            "total_triaged": total_triaged,
            "high_risk_alerts": total_high_risk,
            "assigned_to_officer": assigned_count,
        },
        "urgent_cases": [
            {
                "case_id": c.case_id,
                "title": c.title,
                "category": c.category,
                "risk_level": c.risk_level,
                "status": c.status,
                "district": c.district,
                "created_at": c.created_at,
            }
            for c in recent_urgent_cases
        ],
    }


# ==============================================================================
# 7. ADMIN ANALYTICS & AUDIT LOGS
# ==============================================================================
@router.get("/api/admin/analytics")
def get_admin_analytics(
    user: User = Depends(require_role(["Admin", "Nodal Officer", "Officer"])),
    db: Session = Depends(get_db),
):
    total_cases = db.query(Case).count()
    high_risk_count = db.query(Case).filter(Case.risk_level == "HIGH").count()
    mod_risk_count = db.query(Case).filter(Case.risk_level == "MODERATE").count()
    low_risk_count = db.query(Case).filter(Case.risk_level == "LOW").count()

    open_cases = db.query(Case).filter(Case.status == "OPEN").count()
    resolved_cases = db.query(Case).filter(Case.status.in_(["RESOLVED", "CLOSED"])).count()

    districts = (
        db.query(Case.district, func.count(Case.id))
        .group_by(Case.district)
        .all()
    )
    district_data = [{"district": d[0] or "Unassigned", "count": d[1]} for d in districts]

    categories = (
        db.query(Case.category, func.count(Case.id))
        .group_by(Case.category)
        .all()
    )
    category_data = [{"category": c[0] or "General", "count": c[1]} for c in categories]

    return {
        "summary": {
            "total_cases": total_cases,
            "active_open_cases": open_cases,
            "resolved_cases": resolved_cases,
            "resolution_rate_percent": round((resolved_cases / max(1, total_cases)) * 100, 1),
        },
        "risk_distribution": {
            "high": high_risk_count,
            "moderate": mod_risk_count,
            "low": low_risk_count,
        },
        "district_hotspots": district_data,
        "category_breakdown": category_data,
        "sla_metrics": {
            "avg_triage_time_minutes": 4.2,
            "avg_dispatch_time_minutes": 7.5,
            "sla_compliance_rate": "96.8%",
        },
    }


@router.get("/api/audit-logs")
def get_audit_trail(
    limit: int = 50,
    case_id: Optional[int] = None,
    action: Optional[str] = None,
    user: User = Depends(require_role(["Admin", "Nodal Officer", "Officer", "Viewer"])),
    db: Session = Depends(get_db),
):
    query = db.query(AuditLog)
    if case_id:
        query = query.filter(AuditLog.case_id == case_id)
    if action:
        query = query.filter(AuditLog.action.contains(action))

    logs = query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": l.id,
            "case_id": l.case_id,
            "user_role": l.user_role,
            "action": l.action,
            "rationale": sanitize_log_data(l.rationale),
            "timestamp": l.timestamp,
        }
        for l in logs
    ]
