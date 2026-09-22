"""
SAATHI-AI Engine 2 Router: Historical Intelligence & Precedents API
===================================================================
Provides semantic similarity matching, regional cluster detection, delay-risk evaluation,
and statutory legal resolution pathways for live cases.
"""

import json
import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.case_model import LiveCase
from app.models.nhaa_models import User
from app.auth.security import (
    get_current_user,
    require_role,
    ROLE_ADMIN,
    ROLE_NODAL_OFFICER,
    ROLE_OFFICER,
    ROLE_OPERATOR,
    ROLE_VIEWER,
)
from app.services.audit_service import record_audit_log
from app.ai_engine_2.engine2_analytics import (
    HISTORICAL_PRECEDENT_ARCHIVES,
    run_engine2_analysis,
    match_semantic_precedents,
    compute_regional_cluster,
    compute_delay_risk,
)

logger = logging.getLogger("router.engine2")
router = APIRouter(prefix="/api/engine2", tags=["Engine 2 Historical Intelligence"])


@router.get("/match/{case_id}")
def get_engine2_match(case_id: str, db: Session = Depends(get_db)):
    """
    Query full Engine 2 historical intelligence for a real saved case.
    """
    query = db.query(LiveCase)
    if case_id.isdigit():
        case_record = query.filter(LiveCase.id == int(case_id)).first()
    else:
        case_record = query.filter(LiveCase.session_id == case_id).first()

    if not case_record:
        raise HTTPException(
            status_code=404,
            detail=f"No case found with ID '{case_id}'. Complete a live call session to generate a case for Engine 2."
        )

    transcript = case_record.full_transcript or ""
    district = case_record.district or "Sant Kabir Nagar"
    svi_score = case_record.final_svi or 0.0
    chunk_count = case_record.chunk_count or 1

    analysis = run_engine2_analysis(
        transcript=transcript,
        district=district,
        svi_score=svi_score,
        chunk_count=chunk_count,
    )

    return {
        "case": {
            "id": str(case_record.id),
            "caseNumber": f"#CASE-{case_record.id:04d}",
            "district": district,
            "finalSvi": svi_score,
            "sviLabel": case_record.svi_label or "LOW",
            "caseBrief": case_record.case_brief or "",
            "fullTranscript": transcript,
            "createdAt": str(case_record.created_at),
        },
        "closestPrecedent": analysis["closestPrecedent"],
        "topPrecedents": analysis["topPrecedents"],
        "regionalCluster": analysis["regionalCluster"],
        "delayRisk": analysis["delayRisk"],
        "auditReasoning": analysis["auditReasoning"],
    }


@router.get("/precedents")
def list_precedents(
    category: Optional[str] = None,
    district: Optional[str] = None,
):
    """
    List historical incident archives with optional category or district filtering.
    """
    archives = HISTORICAL_PRECEDENT_ARCHIVES
    if category:
        archives = [a for a in archives if a["category"].lower() == category.lower()]
    if district:
        archives = [a for a in archives if district.lower() in a["district"].lower()]
    return {
        "total": len(archives),
        "precedents": archives,
    }


@router.get("/clusters")
def get_clusters():
    """
    Get active regional district clusters and spatial density telemetry.
    """
    districts = ["Sant Kabir Nagar", "Gorakhpur", "Varanasi", "Lucknow", "Ayodhya", "Ballia"]
    clusters = [
        compute_regional_cluster(dist, svi_score=75 if dist == "Sant Kabir Nagar" else (55 if dist == "Gorakhpur" else 20))
        for dist in districts
    ]
    return {"clusters": clusters}


@router.post("/adopt-resolution")
async def adopt_precedent_resolution(
    request: Request,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Log adoption of a precedent resolution by supervisor into the audit trail.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    case_id = body.get("case_id", "")
    precedent_id = body.get("precedent_id", "")
    operator_name = (
        current_user.full_name or current_user.username
        if current_user
        else body.get("operator_name", "Operator")
    )
    resolution_text = body.get("resolution", "")

    # Record sanitized audit log
    record_audit_log(
        db=db,
        action="PRECEDENT_RESOLUTION_ADOPTED",
        rationale=f"Precedent {precedent_id} resolution adopted: {resolution_text[:200]} by {operator_name}.",
        user=current_user,
        ip_address=request.client.host if request.client else None,
    )

    return {
        "status": "success",
        "message": f"Precedent {precedent_id} resolution successfully adopted for Case {case_id}.",
        "logged_by": operator_name,
        "precedent_id": precedent_id,
        "action": "PCR Dispatch & Statutory Pathway Activated",
    }
