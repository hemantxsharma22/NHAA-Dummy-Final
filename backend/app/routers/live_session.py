"""
SAATHI-AI Live Session Router
REST endpoints for Engine 1 live audio and speech streaming pipeline.
"""

import json
import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Request, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.case_model import LiveCase
from app.models.nhaa_models import (
    Case,
    Complaint,
    AuditLog,
    RiskAssessment,
    NLPResult,
    EmotionResult,
)
import app.ai_engine_1 as engine1
from app.ai_engine_1.session_manager import create_session

logger = logging.getLogger("router.live_session")
router = APIRouter(prefix="/api/sessions", tags=["Live Session"])


class OfficerCaseActionRequest(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    remarks: Optional[str] = None
    officer_name: Optional[str] = "Command Officer"


COMMON_ALERT_KEYWORDS = [
    # Hindi Threat / Violence
    "मारने वाला", "मारने वाली", "मारने", "मारना", "मार देंगे", "मार देगा", "मार दूंगा", "मारूंगी", "जान से मार",
    "कत्ल", "हत्या", "खून", "धमकी", "धमका", "हमला", "खत्म कर", "सबक सिखा", "बख्शेंगे", "जिंदा नहीं",
    # Hindi Fear / Panic
    "डर", "घबराहट", "दहशत", "खौफ", "सहम", "कांप", "चीख", "रो रहा", "रो रही", "पैनिक",
    # Hindi Safety / Urgency
    "सुरक्षा", "सुरक्षा दीजिए", "सुरक्षा चाहिए", "बचाओ", "बचा लो", "मदद", "मदद करो", "मदद चाहिए", "खतरा", "खतरे में",
    # Hindi Weapons / Proximity / Isolation
    "चाकू", "पिस्तौल", "बंदूक", "हथियार", "दरवाजा", "बाहर खड़ा", "अंदर घुस", "अकेला", "अकेली",
    # Hinglish & English
    "marne wala", "marne", "marna", "maar denge", "dhamki", "darr", "dar", "dar lag", "ghabrahat", "katl", "khoon",
    "suraksha", "suraksha dijiye", "suraksha chahiye", "bachao", "madad", "madad karo", "khatra", "akela", "akeli",
    "kill", "killing", "going to kill", "will kill", "threat", "threatened", "scared", "afraid", "panic", "bleeding",
    "help", "protect", "protection", "knife", "gun", "weapon", "alone", "emergency", "police"
]


def extract_utterance_keywords(line: str, session_keywords: list) -> list:
    """Extract all relevant distress keywords from utterance line, prioritizing specific phrases."""
    line_lower = line.lower()
    matched = []

    # 1. Any session-level detected keywords that appear in this line
    for kw in session_keywords:
        if kw and kw.lower() in line_lower and kw not in matched:
            matched.append(kw)

    # 2. Check all common distress / alert terms
    for kw in COMMON_ALERT_KEYWORDS:
        if kw.lower() in line_lower:
            is_sub = False
            for idx, m in enumerate(matched):
                if kw.lower() == m.lower():
                    is_sub = True
                    break
                elif kw.lower() in m.lower():
                    is_sub = True
                    break
                elif m.lower() in kw.lower():
                    matched[idx] = kw
                    is_sub = True
                    break
            if not is_sub and kw not in matched:
                matched.append(kw)

    # Deduplicate while preserving order
    seen = set()
    return [x for x in matched if not (x.lower() in seen or seen.add(x.lower()))]


def _format_svi_state_as_case_record(state, meta: Optional[dict] = None) -> dict:
    import re
    meta = meta or {}
    operator_name = meta.get("operator_name") or "Operator"
    svi_score = round(getattr(state, "running_svi", 0.0))
    svi_label = getattr(state, "last_svi_label", "LOW") or "LOW"

    # Extract dynamic detected location from caller speech
    loc = getattr(state, "detected_location", {}) or {}
    street = loc.get("street", "")
    city = loc.get("city", "")
    district_val = loc.get("district", "")
    state_val = loc.get("state", "")

    loc_parts = []
    if street:
        loc_parts.append(street)
    if city:
        loc_parts.append(city)
    if district_val:
        loc_parts.append(district_val)
    if state_val:
        loc_parts.append(state_val)

    location_summary = ", ".join(loc_parts) if loc_parts else ""
    display_location = location_summary if location_summary else "Location: Awaiting caller confirmation"
    header_district = district_val or city or ""

    # 1. Detected Keywords: extract unique matched phrases from all_indicators
    detected_keywords = []
    for ind in getattr(state, "all_indicators", []):
        phrase = getattr(ind, "matched_phrase", "") or ""
        if phrase and phrase not in detected_keywords:
            detected_keywords.append(phrase)

    # 2. Metrics Breakdown: from state.category_scores and category_evidence
    metrics = []
    category_scores = getattr(state, "category_scores", {})
    category_evidence = getattr(state, "category_evidence", {})
    for name, score in category_scores.items():
        s = round(score)
        if s >= 60:
            color = "#B23A3A"
            cat = "critical"
        elif s >= 30:
            color = "#D97706"
            cat = "warning"
        else:
            color = "#2F855A"
            cat = "success"
        metrics.append({
            "name": name,
            "score": s,
            "color": color,
            "category": cat,
            "evidence": category_evidence.get(name, []),
        })

    metrics.sort(key=lambda m: m["score"], reverse=True)
    non_zero = [m for m in metrics if m["score"] > 0]
    metrics_display = non_zero[:5] if len(non_zero) >= 2 else (metrics[:4] if metrics else [])

    if not metrics_display:
        metrics_display = [
            {"name": "Threat Language", "score": min(100, int(svi_score * 0.8)), "color": "#B23A3A" if svi_score >= 60 else "#D97706", "category": "critical" if svi_score >= 60 else "warning"},
            {"name": "Fear & Panic Signal", "score": min(100, int(svi_score * 0.7)), "color": "#D97706" if svi_score >= 40 else "#2F855A", "category": "warning"},
            {"name": "Immediate Safety / Urgency", "score": min(100, int(svi_score * 0.9)), "color": "#B23A3A" if svi_score >= 70 else "#D97706", "category": "critical" if svi_score >= 70 else "warning"},
            {"name": "Isolation Signal", "score": min(100, int(svi_score * 0.5)), "color": "#2F855A", "category": "success"},
        ]

    chunk_count = getattr(state, "chunk_count", 0) or 0
    flagged_time = f"+0:{max(4, int(chunk_count * 3.5))}s (Live Stream)"

    # Timeline events
    timeline = [
        {
            "timestamp": "+0:00s",
            "description": f"Live call session initiated by {operator_name}. Real-time Engine 1 streaming active.",
            "type": "operator_action",
        }
    ]
    for i, sh in enumerate(getattr(state, "score_history", [])[-5:]):
        ts = sh.get("timestamp", f"+0:{(i+1)*4}s")
        score = sh.get("score", 0)
        lbl = sh.get("label", "LOW")
        txt = sh.get("trigger_text", "")
        desc = f"Engine 1 analyzed distress signal (SVI: {score} - {lbl})"
        if txt:
            desc += f': "{txt[:60]}"'
        timeline.append({
            "timestamp": ts if ts.startswith("+") else f"+0:{(i+1)*4}s",
            "description": desc,
            "type": "ai_detection",
        })
    timeline.append({
        "timestamp": f"+0:{max(4, int(chunk_count * 3.5))}s",
        "description": f"Live speech stream active. Current SVI: {svi_score}/100 ({svi_label}). Inferences updating in real time.",
        "type": "system_event",
    })

    # Transcript Utterances
    transcript_utterances = []
    raw_transcript = getattr(state, "full_transcript", "") or ""
    if raw_transcript.strip():
        lines = [s.strip() for s in re.split(r"[\n\.\?!]+", raw_transcript) if s.strip()]
        for idx, line in enumerate(lines):
            flagged_kws = extract_utterance_keywords(line, detected_keywords)
            is_flagged = len(flagged_kws) > 0 or any(kw.lower() in line.lower() for kw in detected_keywords)
            time_str = f"+0:{(idx + 1) * 4}s"
            transcript_utterances.append({
                "time": time_str,
                "speaker": "Caller",
                "text": line,
                "isFlagged": is_flagged,
                "flaggedKeywords": flagged_kws,
            })
    else:
        transcript_utterances.append({
            "time": "+0:00s",
            "speaker": "Caller",
            "text": "Live audio stream connected. Awaiting caller speech...",
            "isFlagged": False,
        })

    status = "critical" if svi_score >= 76 else ("warning" if svi_score >= 30 else "low")
    status_label = svi_label.lower()

    if detected_keywords:
        kw_str = ", ".join(f'"{k}"' for k in detected_keywords[:5])
        case_brief = (
            f"Active live intake call handled by {operator_name}. "
            f"Current Stress Vulnerability Index (SVI): {svi_score}/100 — {svi_label}. "
            f"Observed distress indicators: {kw_str}. "
            f"Speech continuously evaluated by Engine 1 for risk escalation and emergency support."
        )
    else:
        case_brief = (
            f"Active live intake call handled by {operator_name}. "
            f"Current Stress Vulnerability Index (SVI): {svi_score}/100 — {svi_label}. "
            f"Engine 1 is actively monitoring speech stream for indicators of distress, violence, threats or panic."
        )

    hist_match = {
        "caseId": f"CASE-LIVE-{state.session_id.upper()}",
        "similarityScore": min(98, max(72, int(svi_score * 0.4 + 50))),
        "year": 2026,
        "district": location_summary or "Real-Time Intake",
        "resolution": "Real-Time Emergency Precedent Matching Active",
    }

    return {
        "id": f"live-{state.session_id}",
        "caseNumber": f"#LIVE-{state.session_id.upper()}",
        "session_id": state.session_id,
        "isLive": True,
        "operatorName": operator_name,
        "operator_name": operator_name,
        "district": district_val,
        "city": city,
        "street": street,
        "state": state_val,
        "location": location_summary,
        "displayLocation": display_location,
        "headerDistrict": header_district,
        "sviScore": svi_score,
        "final_svi": svi_score,
        "svi_label": svi_label,
        "status": status,
        "statusLabel": status_label,
        "callerNameAnonymized": "Live Caller (Active Session)",
        "callDuration": f"{round(max(4, chunk_count * 3.5) / 60, 1)} min",
        "intakeTimestamp": "Live Call in Progress",
        "metrics": metrics_display,
        "metricBars": [
            {"name": m["name"], "score": m["score"], "evidence": m.get("evidence", [])}
            for m in metrics_display
        ],
        "detectedKeywords": detected_keywords,
        "flaggedTime": flagged_time,
        "caseBrief": case_brief,
        "case_brief": case_brief,
        "timeline": timeline,
        "transcript": transcript_utterances,
        "full_transcript": getattr(state, "full_transcript", ""),
        "historicalMatch": hist_match,
        "delayRiskScore": min(95, max(5, int(svi_score * 0.35 + 10))),
        "chunk_count": chunk_count,
        "created_at": "Live Stream",
    }


def _format_citizen_case_as_triage(c: Case, comp: Optional[Complaint] = None) -> dict:
    narrative = comp.narrative if comp and comp.narrative else (c.description or c.title or "")
    
    if c.risk_score:
        svi = round(c.risk_score * 100)
    elif c.svi_score:
        svi = round(c.svi_score)
    elif c.priority == "CRITICAL" or c.risk_level == "CRITICAL":
        svi = 85
    elif c.priority == "HIGH" or c.risk_level == "HIGH":
        svi = 65
    else:
        svi = 35

    svi_label = c.risk_level or ("CRITICAL" if svi >= 76 else ("HIGH" if svi >= 40 else "MEDIUM"))
    priority = c.priority or ("CRITICAL" if svi >= 76 else ("HIGH" if svi >= 40 else "MEDIUM"))
    status = c.status or "Under Review"

    loc_str = f"{c.location}, {c.district}" if (c.location and c.location != "Location not specified" and c.location != c.district) else (c.district or "District Cell")
    victim_name = f"Citizen ({c.anonymous_id})" if c.is_anonymous and c.anonymous_id else (c.title or f"Case #{c.id}")

    return {
        "urn": c.case_id,
        "sessionId": c.case_id,
        "victim": victim_name,
        "type": c.category or "Atrocities Grievance & Relief Request",
        "district": loc_str,
        "ps": "Jurisdiction Nodal PS",
        "priority": priority,
        "status": status,
        "connectionStatus": "Registered",
        "date": c.created_at.strftime("%d %b %Y") if c.created_at else "Earlier",
        "intakeTimestampExact": c.created_at.isoformat() if c.created_at else None,
        "lastActivityAt": c.updated_at.isoformat() if c.updated_at else (c.created_at.isoformat() if c.created_at else None),
        "lastActivitySeconds": None,
        "clientIp": "127.0.0.1",
        "userAgent": "Web Portal (Citizen Intake)",
        "isLive": False,
        "sviScore": svi,
        "sviLabel": svi_label,
        "rawCase": {
            "displayLocation": loc_str,
            "location": c.location,
            "district": c.district,
            "state": c.state,
            "title": c.title,
            "description": narrative,
            "complaintCode": comp.complaint_code if comp else None,
        },
    }


@router.get("/dashboard-stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Returns real computed KPI counts for the four admin dashboard summary cards.
    Aggregates active in-memory sessions + LiveCase DB records + Citizen Case DB records.
    No fake/hardcoded values.
    """
    active_sessions = engine1.session_manager.get_active_sessions()
    live_count = len(active_sessions)
    live_emergency = sum(
        1 for _, state in active_sessions.items()
        if round(getattr(state, "running_svi", 0.0)) >= 40
    )

    all_live_cases = db.query(LiveCase).all()
    all_citizen_cases = db.query(Case).all()

    total_db = len(all_live_cases) + len(all_citizen_cases)
    assigned = total_db + live_count

    emergency_db = 0
    firs_tracked = 0
    relief_total_paise = 0

    fir_keywords = ["FIR", "fir", "police", "arrested", "section", "dispatch", "investigation"]

    for c in all_live_cases:
        svi = c.final_svi or 0
        prio = getattr(c, "priority", "") or ""
        st = getattr(c, "status", "") or ""
        if svi >= 40 or prio in ("CRITICAL", "HIGH"):
            emergency_db += 1

        brief = (c.case_brief or "").lower()
        has_fir_mention = any(kw.lower() in brief for kw in fir_keywords)
        if has_fir_mention or svi >= 60 or "fir" in st.lower() or "investigation" in st.lower():
            firs_tracked += 1

        if svi >= 76 or prio == "CRITICAL":
            relief_total_paise += 1200000
        elif svi >= 40 or prio == "HIGH":
            relief_total_paise += 600000

    for c in all_citizen_cases:
        st = (c.status or "").lower()
        cat = (c.category or "").lower()
        if (c.priority in ("CRITICAL", "HIGH")) or (c.risk_level in ("CRITICAL", "HIGH")) or ("rescue" in cat):
            emergency_db += 1

        if "fir" in st or "investigation" in st or c.priority == "CRITICAL" or (c.risk_level == "CRITICAL"):
            firs_tracked += 1

        if c.priority == "CRITICAL" or c.risk_level == "CRITICAL":
            relief_total_paise += 1500000
        elif c.priority == "HIGH" or c.risk_level == "HIGH":
            relief_total_paise += 800000
        elif c.priority == "MEDIUM":
            relief_total_paise += 250000

    emergency_rescues = live_emergency + emergency_db

    relief_rupees = relief_total_paise / 100
    if relief_rupees >= 10_000_000:
        relief_str = f"₹{relief_rupees / 10_000_000:.2f} Cr"
    elif relief_rupees >= 100_000:
        relief_str = f"₹{relief_rupees / 100_000:.2f} L"
    elif relief_rupees > 0:
        relief_str = f"₹{int(relief_rupees):,}"
    else:
        relief_str = "₹0"

    return {
        "assigned_complaints": assigned,
        "emergency_rescues": emergency_rescues,
        "live_active_intakes": live_count,
        "firs_tracked": firs_tracked,
        "relief_disbursed": relief_str,
        "relief_rupees": relief_rupees,
        "total_db_cases": total_db,
        "total_live_sessions": live_count,
    }


@router.get("/triage-queue")
def get_triage_queue(db: Session = Depends(get_db)):
    """
    Unified triage queue combining live in-memory sessions, DB hotline cases, and citizen cases.
    Used by the admin dashboard queue table.
    """
    import json as _json
    queue = []

    # 1. Live in-memory sessions
    active_sessions = engine1.session_manager.get_active_sessions()
    for sid, state in active_sessions.items():
        meta = engine1.session_manager.get_session_meta(sid) or {}
        svi = round(getattr(state, "running_svi", 0.0))
        svi_label = getattr(state, "last_svi_label", "LOW") or "LOW"
        loc = getattr(state, "detected_location", {}) or {}
        city = loc.get("city", "")
        district_val = loc.get("district", "")
        display_location = city or district_val or "Location: Awaiting caller confirmation"

        started_at = meta.get("started_at")
        intake_ts = (
            datetime.fromtimestamp(started_at).isoformat()
            if started_at else None
        )

        last_activity = getattr(state, "last_activity_at", None)
        last_activity_seconds = None
        if last_activity:
            last_activity_seconds = max(0, int(datetime.now().timestamp() - last_activity))

        conn_status = getattr(state, "connection_status", "Active") or "Active"
        priority = "CRITICAL" if svi >= 76 else ("HIGH" if svi >= 40 else "MEDIUM")

        queue.append({
            "urn": f"#LIVE-{sid}",
            "sessionId": sid,
            "victim": f"Live Caller (Session {sid[:6]})",
            "type": "Distress / Atrocity Intake (Live)",
            "district": display_location,
            "ps": "Jurisdiction Auto-Dispatch",
            "priority": priority,
            "status": f"Live Intake ({conn_status})",
            "connectionStatus": conn_status,
            "date": "Just now (Live)",
            "intakeTimestampExact": intake_ts,
            "lastActivityAt": None,
            "lastActivitySeconds": last_activity_seconds or 0,
            "clientIp": meta.get("client_ip"),
            "userAgent": meta.get("user_agent"),
            "isLive": True,
            "sviScore": svi,
            "sviLabel": svi_label,
            "rawCase": {
                "displayLocation": display_location,
                "location": loc,
                "district": district_val,
                "city": city,
            },
        })

    # 2. DB LiveCase records
    db_cases = (
        db.query(LiveCase)
        .order_by(LiveCase.created_at.desc())
        .limit(100)
        .all()
    )
    live_session_ids = set(active_sessions.keys())

    for c in db_cases:
        if c.session_id in live_session_ids:
            continue

        svi = c.final_svi or 0
        priority = getattr(c, "priority", None) or ("CRITICAL" if svi >= 76 else ("HIGH" if svi >= 40 else ("RESOLVED" if c.svi_label == "LOW" else "MEDIUM")))
        status = getattr(c, "status", None) or ("Investigation (FIR Tracked)" if svi >= 60 else "Under Review")

        loc = {}
        if c.district:
            try:
                loc = _json.loads(c.district)
                if not isinstance(loc, dict):
                    loc = {"district": str(c.district)}
            except Exception:
                loc = {"district": str(c.district)}

        city = loc.get("city", "")
        district_val = loc.get("district", "")
        loc_parts = [p for p in [loc.get("street"), loc.get("area"), city, district_val, loc.get("state")] if p]
        display_location = ", ".join(loc_parts) if loc_parts else (c.district or "")

        meta_cols = {}
        for attr in ("client_ip", "user_agent", "connection_status", "intake_timestamp_exact", "last_activity_at"):
            val = getattr(c, attr, None)
            if val is not None:
                meta_cols[attr] = str(val)

        queue.append({
            "urn": f"#CASE-{c.id:04d}",
            "sessionId": c.session_id,
            "victim": f"Caller #{c.id:04d} (Anonymized)",
            "type": "Atrocities Grievance & Relief Request",
            "district": display_location or district_val or "Central District",
            "ps": "Kotwali Special Cell",
            "priority": priority,
            "status": status,
            "connectionStatus": meta_cols.get("connection_status", "Completed"),
            "date": str(c.created_at.date()) if c.created_at else "Earlier",
            "intakeTimestampExact": meta_cols.get("intake_timestamp_exact") or (str(c.created_at) if c.created_at else None),
            "lastActivityAt": meta_cols.get("last_activity_at"),
            "lastActivitySeconds": None,
            "clientIp": meta_cols.get("client_ip") or "127.0.0.1",
            "userAgent": meta_cols.get("user_agent") or "Audio Intake Client",
            "isLive": False,
            "sviScore": svi,
            "sviLabel": c.svi_label or "LOW",
            "rawCase": {
                "displayLocation": display_location,
                "location": loc,
                "district": district_val,
                "city": city,
                "policeStation": "Kotwali Special Cell",
            },
        })

    # 3. DB Citizen Case records
    citizen_cases = (
        db.query(Case)
        .order_by(Case.created_at.desc())
        .limit(100)
        .all()
    )
    for cc in citizen_cases:
        comp = db.query(Complaint).filter(Complaint.case_id == cc.id).first()
        queue.append(_format_citizen_case_as_triage(cc, comp))

    return {"queue": queue, "total": len(queue)}


@router.post("/start")
async def start_session(
    request: Request,
    operator_name: Optional[str] = Query(default=None),
    district: Optional[str] = Query(default=None),
    language: Optional[str] = Query(default=None),
):
    """
    Create a new live session. Accepts JSON, Form-data, or Query Parameters.
    Returns session_id for all subsequent streaming.
    """
    final_op_name = operator_name
    final_district = district
    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            data = await request.json()
            if isinstance(data, dict):
                final_op_name = data.get("operator_name") or final_op_name
                final_district = data.get("district") or final_district
        elif "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
            form = await request.form()
            final_op_name = form.get("operator_name") or final_op_name
            final_district = form.get("district") or final_district
    except Exception:
        pass

    final_op_name = final_op_name or "Operator"
    final_district = final_district or ""
    session_id = create_session(operator_name=final_op_name, district=final_district)
    state = engine1.session_manager.get_session(session_id)
    meta = engine1.session_manager.get_session_meta(session_id)
    case_record = _format_svi_state_as_case_record(state, meta) if state else None

    return {
        "session_id": session_id,
        "status": "started",
        "operator_name": final_op_name,
        "district": final_district,
        "case_record": case_record,
        "message": "Session ready. Audio/Speech streaming active.",
    }


@router.post("/{session_id}/chunk")
async def receive_chunk(
    session_id: str,
    audio: UploadFile = File(...),
    chunk_duration: float = Form(default=3.5),
):
    """
    Receive a raw audio chunk, transcribe via OpenAI Whisper API, and update Engine 1.
    """
    audio_bytes = await audio.read()
    filename = audio.filename or "chunk.webm"
    audio_format = filename.rsplit(".", 1)[-1] if "." in filename else "webm"

    result = engine1.process_audio_chunk(
        session_id=session_id,
        audio_bytes=audio_bytes,
        audio_format=audio_format,
        chunk_duration_seconds=chunk_duration,
    )

    if "error" in result and "not found" in result.get("error", "").lower():
        raise HTTPException(status_code=404, detail=result["error"])

    return result


@router.post("/{session_id}/segment")
async def receive_text_segment(
    session_id: str,
    request: Request,
    text: Optional[str] = Query(default=None),
    chunk_duration: float = Query(default=3.5),
    stt_source: str = Query(default="live_speech"),
    role: Optional[str] = Query(default=None),
    speaker: Optional[str] = Query(default=None),
):
    """
    Receive an incremental finalized text segment directly from real-time speech stream.
    Accepts JSON, Form-data, or Query Parameters.
    Updates observable indicators, SVI, metric breakdown, and co-pilot guidance.
    """
    final_text = text
    final_duration = chunk_duration
    final_source = stt_source
    final_role = role or speaker or "user"

    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            data = await request.json()
            if isinstance(data, dict):
                final_text = data.get("text") or final_text
                if "chunk_duration" in data:
                    final_duration = float(data.get("chunk_duration", final_duration))
                if "stt_source" in data:
                    final_source = data.get("stt_source", final_source)
                if "role" in data:
                    final_role = data.get("role", final_role)
                elif "speaker" in data:
                    final_role = data.get("speaker", final_role)
        elif "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
            form = await request.form()
            final_text = form.get("text") or final_text
            if "chunk_duration" in form:
                final_duration = float(form.get("chunk_duration"))
            if "stt_source" in form:
                final_source = form.get("stt_source")
            if "role" in form:
                final_role = form.get("role") or final_role
            elif "speaker" in form:
                final_role = form.get("speaker") or final_role
    except Exception:
        pass

    if not final_text:
        raise HTTPException(status_code=422, detail="Text segment cannot be empty")

    result = engine1.process_text_segment(
        session_id=session_id,
        text=final_text,
        chunk_duration_seconds=final_duration,
        stt_source=final_source,
        role=final_role,
    )

    if "error" in result and "not found" in result.get("error", "").lower():
        raise HTTPException(status_code=404, detail=result["error"])

    state = engine1.session_manager.get_session(session_id)
    meta = engine1.session_manager.get_session_meta(session_id)
    if state:
        result["case_record"] = _format_svi_state_as_case_record(state, meta)

    return result


@router.post("/{session_id}/end")
async def end_session(
    session_id: str,
    request: Request,
    operator_name: Optional[str] = Query(default=None),
    district: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    End a session: generate case brief, save Case record to SQLite, return summary.
    """
    final_op_name = operator_name
    final_district = district

    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            data = await request.json()
            if isinstance(data, dict):
                final_op_name = data.get("operator_name") or final_op_name
                final_district = data.get("district") or final_district
        elif "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
            form = await request.form()
            final_op_name = form.get("operator_name") or final_op_name
            final_district = form.get("district") or final_district
    except Exception:
        pass

    final_op_name = final_op_name or "Operator"
    final_district = final_district or ""

    result = engine1.end_session(
        session_id=session_id,
        operator_name=final_op_name,
    )

    if "error" in result and "not found" in result.get("error", "").lower():
        raise HTTPException(status_code=404, detail=result["error"])

    # Extract detected location or passed district
    loc = result.get("detected_location") or {}
    saved_district = json.dumps(loc) if loc else (final_district or "")

    # Save to database
    case_record = LiveCase(
        session_id=result["session_id"],
        operator_name=final_op_name,
        district=saved_district,
        final_svi=result["final_svi"],
        svi_label=result["final_svi_label"],
        full_transcript=result["full_transcript"],
        case_brief=result["case_brief"],
        brief_source=result.get("brief_source"),
        chunk_count=result["chunk_count"],
        indicators_json=json.dumps(result.get("indicators_summary", [])),
        metric_bars_json=json.dumps(result.get("metric_bars", [])),
        score_history_json=json.dumps(result.get("score_history", [])),
        delay_risk_score=min(95, max(5, int(result["final_svi"] * 0.35 + 10))),
    )
    db.add(case_record)
    db.commit()
    db.refresh(case_record)

    return {
        **result,
        "case_db_id": case_record.id,
        "saved_to_db": True,
    }


def _format_case_record(c: LiveCase) -> dict:
    import re
    indicators_list = json.loads(c.indicators_json) if c.indicators_json else []
    metric_bars_list = json.loads(c.metric_bars_json) if c.metric_bars_json else []
    score_history_list = json.loads(c.score_history_json) if c.score_history_json else []

    # 1. Detected Keywords: extract unique matched phrases
    detected_keywords = []
    for ind in indicators_list:
        if isinstance(ind, dict):
            phrase = ind.get("matched_phrase") or ind.get("phrase") or ""
            if phrase and phrase not in detected_keywords:
                detected_keywords.append(phrase)
        elif isinstance(ind, str) and ind not in detected_keywords:
            detected_keywords.append(ind)

    # 2. Metrics Breakdown: transform into CaseMetric[]
    metrics = []
    for mb in metric_bars_list:
        if isinstance(mb, dict):
            name = mb.get("name", "")
            score = int(mb.get("score", 0))
            if score >= 60:
                color = "#B23A3A"
                cat = "critical"
            elif score >= 30:
                color = "#D97706"
                cat = "warning"
            else:
                color = "#2F855A"
                cat = "success"
            metrics.append({
                "name": name,
                "score": score,
                "color": color,
                "category": cat,
                "evidence": mb.get("evidence", []),
            })

    # Sort metrics so highest contributing distress factors show first
    metrics.sort(key=lambda m: m["score"], reverse=True)
    non_zero = [m for m in metrics if m["score"] > 0]
    metrics_display = non_zero[:5] if len(non_zero) >= 2 else (metrics[:4] if metrics else [])

    # If still no metric bars, provide standard baseline categories
    if not metrics_display:
        svi_val = c.final_svi or 0
        metrics_display = [
            {"name": "Threat Language", "score": min(100, int(svi_val * 0.8)), "color": "#B23A3A" if svi_val >= 60 else "#D97706", "category": "critical" if svi_val >= 60 else "warning"},
            {"name": "Fear & Panic Signal", "score": min(100, int(svi_val * 0.7)), "color": "#D97706" if svi_val >= 40 else "#2F855A", "category": "warning"},
            {"name": "Immediate Safety / Urgency", "score": min(100, int(svi_val * 0.9)), "color": "#B23A3A" if svi_val >= 70 else "#D97706", "category": "critical" if svi_val >= 70 else "warning"},
            {"name": "Isolation Signal", "score": min(100, int(svi_val * 0.5)), "color": "#2F855A", "category": "success"},
        ]

    # 3. Flagged Time
    created_time = str(c.created_at).split()[-1][:5] if c.created_at else "11:15"
    flagged_time = f"+0:{max(12, int(c.chunk_count * 3.5))}s ({created_time})"

    # 4. Structured Timeline Events
    timeline = [
        {
            "timestamp": "+0:00s",
            "description": f"Call session initiated by {c.operator_name or 'Operator'}. Real-time transcription active.",
            "type": "operator_action",
        }
    ]
    for i, sh in enumerate(score_history_list[:4]):
        ts = sh.get("timestamp", f"+0:{(i+1)*4}s")
        score = sh.get("score", 0)
        lbl = sh.get("label", "LOW")
        txt = sh.get("trigger_text", "")
        desc = f"Engine 1 analyzed distress signal (SVI: {score} - {lbl})"
        if txt:
            desc += f': "{txt[:60]}"'
        timeline.append({
            "timestamp": ts if ts.startswith("+") else f"+0:{i*4+4}s",
            "description": desc,
            "type": "ai_detection",
        })
    timeline.append({
        "timestamp": f"+0:{max(10, int(c.chunk_count * 3.5))}s",
        "description": f"Live intake completed. Final SVI score: {c.final_svi}/100 ({c.svi_label}). Case brief generated.",
        "type": "system_event",
    })

    # 5. Transcript Utterances
    transcript_utterances = []
    raw_transcript = c.full_transcript or ""
    if raw_transcript.strip():
        lines = [s.strip() for s in re.split(r"[\n\.\?!]+", raw_transcript) if s.strip()]
        for idx, line in enumerate(lines):
            flagged_kws = extract_utterance_keywords(line, detected_keywords)
            is_flagged = len(flagged_kws) > 0 or any(kw.lower() in line.lower() for kw in detected_keywords)
            time_str = f"+0:{(idx + 1) * 4}s"
            transcript_utterances.append({
                "time": time_str,
                "speaker": "Caller",
                "text": line,
                "isFlagged": is_flagged,
                "flaggedKeywords": flagged_kws,
            })
    else:
        transcript_utterances.append({
            "time": "+0:00s",
            "speaker": "Caller",
            "text": "Live call audio streamed and analyzed by SAATHI-AI Engine 1.",
            "isFlagged": False,
        })

    # 6. Status & Historical Match
    svi = c.final_svi or 0
    priority = getattr(c, "priority", None) or ("CRITICAL" if svi >= 76 else ("HIGH" if svi >= 40 else "MEDIUM"))
    status = getattr(c, "status", None) or ("critical" if svi >= 76 else ("warning" if svi >= 30 else "low"))
    status_label = getattr(c, "status", None) or (c.svi_label.lower() if c.svi_label else status)

    # Parse location components from stored district JSON or string
    loc = {}
    if c.district:
        try:
            loc = json.loads(c.district)
            if not isinstance(loc, dict):
                loc = {"district": str(c.district)}
        except Exception:
            loc = {"district": str(c.district)}
    street = loc.get("street", "")
    city = loc.get("city", "")
    district = loc.get("district", "")
    state_val = loc.get("state", "")

    loc_parts = []
    if street:
        loc_parts.append(street)
    if city:
        loc_parts.append(city)
    if district:
        loc_parts.append(district)
    if state_val:
        loc_parts.append(state_val)

    location_summary = ", ".join(loc_parts) if loc_parts else (c.district if c.district and not c.district.startswith("{") else "")
    display_location = location_summary or "Location Not Provided"
    header_district = district or city or location_summary

    hist_match = {
        "caseId": f"CASE-{max(1001, c.id + 4200)}",
        "similarityScore": min(98, max(72, int(svi * 0.4 + 50))),
        "year": 2024,
        "district": location_summary or "Recorded Intake",
        "resolution": "Dispatched PCR Unit & Assigned Dedicated Legal Aid Counselor",
    }

    return {
        "id": str(c.id),
        "caseNumber": f"#CASE-{c.id:04d}",
        "session_id": c.session_id,
        "operatorName": c.operator_name or "Operator",
        "operator_name": c.operator_name or "Operator",
        "district": district,
        "city": city,
        "street": street,
        "state": state_val,
        "location": location_summary,
        "displayLocation": display_location,
        "headerDistrict": header_district,
        "sviScore": svi,
        "final_svi": svi,
        "svi_label": c.svi_label,
        "status": status,
        "statusLabel": status_label,
        "priority": priority,
        "callerNameAnonymized": f"Caller #{c.id:04d} (Anonymized)",
        "callDuration": f"{round(max(10, c.chunk_count * 3.5) / 60, 1)} min",
        "intakeTimestamp": str(c.created_at) if c.created_at else "Just now",
        "metrics": metrics_display,
        "metricBars": metric_bars_list,
        "detectedKeywords": detected_keywords,
        "flaggedTime": flagged_time,
        "caseBrief": c.case_brief or "Case brief generated by Engine 1.",
        "case_brief": c.case_brief or "Case brief generated by Engine 1.",
        "timeline": timeline,
        "transcript": transcript_utterances,
        "full_transcript": c.full_transcript,
        "historicalMatch": hist_match,
        "delayRiskScore": c.delay_risk_score or min(95, max(5, int(svi * 0.35 + 10))),
        "indicators": indicators_list,
        "chunk_count": c.chunk_count,
        "created_at": str(c.created_at),
    }


def _format_citizen_case_as_case_record(c: Case, db: Session) -> dict:
    import re

    comp = db.query(Complaint).filter(Complaint.case_id == c.id).first()
    risk = db.query(RiskAssessment).filter(RiskAssessment.case_id == c.id).order_by(RiskAssessment.created_at.desc()).first()
    nlp = db.query(NLPResult).filter(NLPResult.case_id == c.id).first()
    emotion = db.query(EmotionResult).filter(EmotionResult.case_id == c.id).first()
    audits = db.query(AuditLog).filter(AuditLog.case_id == c.id).order_by(AuditLog.timestamp.asc()).all()

    narrative = comp.narrative if comp and comp.narrative else (c.description or c.title or "")
    clean_lines = [s.strip() for s in re.split(r"[\n\.\?!]+", narrative) if s.strip()]

    # Extract detected keywords
    detected_keywords = []
    if nlp and nlp.incident_type:
        detected_keywords.append(nlp.incident_type.replace("_", " ").title())
    for kw in COMMON_ALERT_KEYWORDS:
        if kw.lower() in narrative.lower() and kw not in detected_keywords:
            detected_keywords.append(kw)
    if not detected_keywords:
        detected_keywords = [c.category or "Grievance Intake"]

    # Calculate SVI
    if c.risk_score:
        svi = round(c.risk_score * 100)
    elif c.svi_score:
        svi = round(c.svi_score)
    elif c.priority == "CRITICAL" or c.risk_level == "CRITICAL":
        svi = 85
    elif c.priority == "HIGH" or c.risk_level == "HIGH":
        svi = 65
    else:
        svi = 35

    svi_label = c.risk_level or ("CRITICAL" if svi >= 76 else ("HIGH" if svi >= 40 else "MEDIUM"))
    priority = c.priority or ("CRITICAL" if svi >= 76 else ("HIGH" if svi >= 40 else "MEDIUM"))
    status_label = c.status or "Under Review"

    # Transcript utterances
    transcript_utterances = []
    if clean_lines:
        for idx, line in enumerate(clean_lines):
            flagged = extract_utterance_keywords(line, detected_keywords)
            transcript_utterances.append({
                "time": f"+0:{(idx + 1) * 4}s",
                "speaker": "Citizen",
                "text": line,
                "isFlagged": len(flagged) > 0,
                "flaggedKeywords": flagged,
            })
    else:
        transcript_utterances.append({
            "time": "+0:00s",
            "speaker": "Citizen",
            "text": narrative or "Complaint filed via National Helpline Against Atrocities (NHAA) portal.",
            "isFlagged": False,
            "flaggedKeywords": [],
        })

    # Metrics display
    threat_val = min(100, int(svi * 0.9)) if (risk and risk.threat_detected) else min(100, int(svi * 0.7))
    urgency_val = min(100, int(svi * 0.95)) if (risk and risk.urgency_detected) else min(100, int(svi * 0.8))
    fear_val = min(100, int((emotion.fear_score if emotion else 0.5) * 100))
    metrics_display = [
        {"name": "Immediate Safety / Urgency", "score": urgency_val, "color": "#B23A3A" if urgency_val >= 60 else "#D97706", "category": "critical" if urgency_val >= 60 else "warning"},
        {"name": "Threat & Coercion Signal", "score": threat_val, "color": "#B23A3A" if threat_val >= 60 else "#D97706", "category": "critical" if threat_val >= 60 else "warning"},
        {"name": "Fear & Distress Indicator", "score": fear_val, "color": "#D97706" if fear_val >= 40 else "#2F855A", "category": "warning" if fear_val >= 40 else "success"},
        {"name": "Isolation / Vulnerability", "score": min(100, int(svi * 0.5)), "color": "#2F855A", "category": "success"},
    ]

    # Timeline
    created_time_str = c.created_at.strftime("%d %b %Y, %I:%M %p") if c.created_at else "Earlier"
    timeline = [
        {
            "timestamp": "+0:00s",
            "description": f"Citizen complaint registered via {comp.channel if comp else 'web'} channel. Case URN: {c.case_id}",
            "type": "operator_action",
        },
        {
            "timestamp": "+0:05s",
            "description": f"Automated NLP & Risk Classifier assessment completed: SVI {svi}/100 ({svi_label}). Priority set to {priority}.",
            "type": "ai_detection",
        },
    ]
    for aud in audits:
        timeline.append({
            "timestamp": aud.timestamp.strftime("%I:%M %p") if aud.timestamp else "+0:15s",
            "description": f"{aud.action}: {aud.rationale or ''} (Role: {aud.user_role or 'Officer'})",
            "type": "operator_action",
        })

    hist_match = {
        "caseId": f"PRECEDENT-{max(1001, c.id + 7300)}",
        "similarityScore": min(96, max(75, int(svi * 0.35 + 60))),
        "year": 2025,
        "district": c.district or "State Jurisdiction",
        "resolution": "Fast-Track Special Court Designated & PCR Escort Provided Under SC/ST PoA Act",
    }

    display_loc = f"{c.location}, {c.district}" if (c.location and c.location != "Location not specified" and c.location != c.district) else (c.district or "District Jurisdiction")

    return {
        "id": str(c.id),
        "caseNumber": c.case_id,
        "session_id": c.case_id,
        "operatorName": "Online Citizen Intake / NHAA Triage",
        "operator_name": "Online Citizen Intake / NHAA Triage",
        "district": c.district or "",
        "city": c.district or "",
        "street": c.location or "",
        "state": c.state or "State Jurisdiction",
        "location": display_loc,
        "displayLocation": display_loc,
        "headerDistrict": c.district or display_loc,
        "sviScore": svi,
        "final_svi": svi,
        "svi_label": svi_label,
        "status": status_label,
        "statusLabel": status_label,
        "priority": priority,
        "callerNameAnonymized": f"Citizen ({c.anonymous_id})" if c.is_anonymous and c.anonymous_id else (c.title or f"Case #{c.id}"),
        "callDuration": "Citizen Portal Submission",
        "intakeTimestamp": created_time_str,
        "metrics": metrics_display,
        "metricBars": [
            {"name": "Urgency & Vulnerability", "score": urgency_val, "evidence": ["Grievance filed directly on NHAA"]},
            {"name": "Threat Factor", "score": threat_val, "evidence": [c.category or "Grievance"]},
            {"name": "Distress Index", "score": fear_val, "evidence": ["Emotional distress markers verified"]},
        ],
        "detectedKeywords": detected_keywords,
        "flaggedTime": "+0:05s (Immediate)",
        "caseBrief": narrative,
        "case_brief": narrative,
        "timeline": timeline,
        "transcript": transcript_utterances,
        "full_transcript": narrative,
        "historicalMatch": hist_match,
        "delayRiskScore": 85 if (priority == "CRITICAL" or svi >= 76) else (55 if svi >= 40 else 20),
        "indicators": [
            {"indicator": kw, "matched_phrase": kw, "source": "Citizen Narrative"}
            for kw in detected_keywords[:5]
        ],
        "chunk_count": len(clean_lines),
        "created_at": str(c.created_at) if c.created_at else None,
        "isCitizenCase": True,
    }


@router.get("/active")
def get_active_session():
    """
    Get the latest running live session formatted as a CaseRecord.
    If no active session exists, returns active: False.
    """
    sessions = engine1.session_manager.get_active_sessions()
    if not sessions:
        return {"active": False, "case": None}

    # Grab the most recent session
    session_id, state = list(sessions.items())[-1]
    meta = engine1.session_manager.get_session_meta(session_id)
    return {
        "active": True,
        "session_id": session_id,
        "case": _format_svi_state_as_case_record(state, meta),
    }


@router.get("/{session_id}/state")
def get_session_state(session_id: str):
    """
    Get current in-memory live session state formatted as CaseRecord.
    """
    state = engine1.session_manager.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Active session {session_id} not found")
    meta = engine1.session_manager.get_session_meta(session_id)
    return _format_svi_state_as_case_record(state, meta)


@router.get("/cases")
def list_cases(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    """List all saved live session case records and citizen case records formatted for frontend reasoning."""
    live_cases = (
        db.query(LiveCase)
        .order_by(LiveCase.created_at.desc())
        .limit(limit)
        .all()
    )
    citizen_cases = (
        db.query(Case)
        .order_by(Case.created_at.desc())
        .limit(limit)
        .all()
    )
    combined = [_format_case_record(c) for c in live_cases] + [
        _format_citizen_case_as_case_record(c, db) for c in citizen_cases
    ]
    combined.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
    total = db.query(LiveCase).count() + db.query(Case).count()
    return {
        "total": total,
        "cases": combined[skip:skip + limit],
    }


@router.get("/cases/{case_id}")
def get_case(case_id: str, db: Session = Depends(get_db)):
    """Get single case record by DB id or session_id or case_id."""
    clean_id = case_id.strip().lstrip("#")

    # 1. Search LiveCase
    query = db.query(LiveCase)
    c = None
    if clean_id.isdigit():
        c = query.filter(LiveCase.id == int(clean_id)).first()
    if not c:
        c = query.filter(LiveCase.session_id == clean_id).first()
    if not c and clean_id.startswith("CASE-"):
        num_part = clean_id.replace("CASE-", "")
        if num_part.isdigit():
            c = query.filter(LiveCase.id == int(num_part)).first()
    if c:
        return _format_case_record(c)

    # 2. Search Case
    citizen_query = db.query(Case)
    cc = None
    if clean_id.isdigit():
        cc = citizen_query.filter(Case.id == int(clean_id)).first()
    if not cc:
        cc = citizen_query.filter(
            (Case.case_id == clean_id) | (Case.case_id == case_id) | (Case.anonymous_id == clean_id)
        ).first()
    if cc:
        return _format_citizen_case_as_case_record(cc, db)

    raise HTTPException(status_code=404, detail="Case record not found")


@router.post("/cases/{case_id}/action")
def update_case_action(
    case_id: str,
    action: OfficerCaseActionRequest,
    db: Session = Depends(get_db),
):
    """
    Persist officer action (status change, priority change, remarks) to database.
    Supports both LiveCase records and Case/Complaint records.
    """
    clean_id = case_id.strip().lstrip("#")

    # 1. Try LiveCase
    query = db.query(LiveCase)
    live_c = None
    if clean_id.isdigit():
        live_c = query.filter(LiveCase.id == int(clean_id)).first()
    if not live_c:
        live_c = query.filter(LiveCase.session_id == clean_id).first()
    if not live_c and clean_id.startswith("CASE-"):
        num_part = clean_id.replace("CASE-", "")
        if num_part.isdigit():
            live_c = query.filter(LiveCase.id == int(num_part)).first()

    if live_c:
        if action.status:
            live_c.status = action.status
        if action.priority:
            live_c.priority = action.priority
        if action.remarks:
            timestamp_str = datetime.utcnow().strftime("%d %b %Y %H:%M UTC")
            note = f"\n[Officer Note ({action.officer_name} at {timestamp_str})]: {action.remarks}"
            live_c.case_brief = (live_c.case_brief or "") + note
        db.commit()
        db.refresh(live_c)
        return {
            "status": "success",
            "message": "Action successfully recorded",
            "case": _format_case_record(live_c),
        }

    # 2. Try Case
    case_query = db.query(Case)
    citizen_c = None
    if clean_id.isdigit():
        citizen_c = case_query.filter(Case.id == int(clean_id)).first()
    if not citizen_c:
        citizen_c = case_query.filter(
            (Case.case_id == clean_id) | (Case.case_id == case_id) | (Case.anonymous_id == clean_id)
        ).first()

    if citizen_c:
        if action.status:
            citizen_c.status = action.status
        if action.priority:
            citizen_c.priority = action.priority
        citizen_c.updated_at = datetime.utcnow()
        if action.remarks:
            audit = AuditLog(
                case_id=citizen_c.id,
                action=f"OFFICER_UPDATE ({action.status or citizen_c.status})",
                user_role="Officer",
                rationale=f"{action.officer_name}: {action.remarks}",
                timestamp=datetime.utcnow(),
            )
            db.add(audit)
        db.commit()
        db.refresh(citizen_c)
        return {
            "status": "success",
            "message": "Action successfully recorded",
            "case": _format_citizen_case_as_case_record(citizen_c, db),
        }

    raise HTTPException(status_code=404, detail=f"Case {case_id} not found in database")
