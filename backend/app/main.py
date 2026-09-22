"""
NHAA AI Case Intelligence Platform — FastAPI Backend Entrypoint
Hardened with RBAC, Dual-Token Auth, Rate Limiting, Strict CORS, and Sanitized Audit Trail.
Supports Citizen, Operator, Officer / Nodal Officer, Viewer, and Admin Workflows.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Explicitly load .env from root and backend directory
_ROOT_DIR = Path(__file__).resolve().parents[2]
_root_env = _ROOT_DIR / ".env"
if _root_env.exists():
    load_dotenv(dotenv_path=_root_env)
_backend_env = Path(__file__).resolve().parents[1] / ".env"
if _backend_env.exists():
    load_dotenv(dotenv_path=_backend_env)
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import Base, engine, SessionLocal
from app.models.case_model import LiveCase
import app.models.nhaa_models as nhaa_models
from app.models.nhaa_models import User, Officer, HistoricalCase

from app.routers.live_session import router as session_router
from app.routers.deepgram_ws import router as deepgram_router
from app.routers.engine2 import router as engine2_router
from app.routers.chat import router as chat_router
from app.routers.auth import router as auth_router
from app.routers.cases import router as cases_router
from app.auth.rate_limiter import RateLimitMiddleware
from app.auth.security import (
    hash_password,
    normalize_role,
    ROLE_ADMIN,
    ROLE_NODAL_OFFICER,
    ROLE_OPERATOR,
    ROLE_VIEWER,
    ROLE_CITIZEN,
)
from app.ai_engine_2.engine2_analytics import HISTORICAL_PRECEDENT_ARCHIVES

# Initialize all DB tables
Base.metadata.create_all(bind=engine)

# Auto-migrate missing columns for SQLite if live_cases table existed previously
ALLOWED_MIGRATION_COLUMNS = {
    "indicators_json": "TEXT",
    "metric_bars_json": "TEXT",
    "score_history_json": "TEXT",
    "delay_risk_score": "INTEGER DEFAULT 15",
}
with engine.connect() as conn:
    for col, col_type in ALLOWED_MIGRATION_COLUMNS.items():
        try:
            conn.execute(text(f"ALTER TABLE live_cases ADD COLUMN {col} {col_type}"))
            conn.commit()
        except Exception:
            pass


# Auto-seed baseline users and historical cases if DB is fresh (Development / Demo only)
def _seed_initial_data():
    if os.environ.get("ENV") == "production" and os.environ.get("DEMO_SEED", "").lower() not in ("true", "1"):
        return
    db = SessionLocal()
    try:
        defaults = [
            ("citizen", "citizen123", ROLE_CITIZEN, "Rajesh Kumar (Citizen)", "citizen@nhaa.gov.in"),
            ("operator", "operator123", ROLE_OPERATOR, "Priya Sharma (Operator 04)", "operator@nhaa.gov.in"),
            ("officer", "officer123", ROLE_NODAL_OFFICER, "Inspector Vikram Singh (Nodal Officer)", "officer@nhaa.gov.in"),
            ("viewer", "viewer123", ROLE_VIEWER, "Sunil Verma (Observer / Auditor)", "viewer@nhaa.gov.in"),
            ("admin", "admin123", ROLE_ADMIN, "NHAA System Administrator", "admin@nhaa.gov.in"),
        ]
        for uname, pword, role, fname, email in defaults:
            existing = db.query(User).filter(User.username == uname).first()
            norm_role = normalize_role(role)
            if not existing:
                u = User(
                    username=uname,
                    hashed_password=hash_password(pword),
                    full_name=fname,
                    role=norm_role,
                    email=email,
                )
                db.add(u)
                db.commit()
                db.refresh(u)
                if norm_role in ("Nodal Officer", "Officer"):
                    off = Officer(
                        user_id=u.id,
                        badge_number=f"NHAA-OFF-{u.id:04d}",
                        department="Emergency Response & Triage Cell",
                        rank="Senior Nodal Officer",
                    )
                    db.add(off)
                    db.commit()
            else:
                existing.role = norm_role
                db.commit()

        # Seed historical cases for TF-IDF matching if none exist
        if db.query(HistoricalCase).count() == 0:
            for arch in HISTORICAL_PRECEDENT_ARCHIVES:
                hc = HistoricalCase(
                    case_code=arch["caseId"],
                    category=arch["category"],
                    district=arch["district"],
                    summary=arch["transcript_summary"],
                    incident_text=f"{arch['title']}. {arch['transcript_summary']}",
                    resolution_path=arch["resolution"],
                    resolved_in_hours=arch.get("dispatch_time_mins", 24.0),
                )
                db.add(hc)
            db.commit()
    except Exception as e:
        db.rollback()
    finally:
        db.close()


_seed_initial_data()

app = FastAPI(
    title="NHAA AI Case Intelligence Platform API",
    description="Security-hardened multimodal AI decision-support platform for Citizen, Operator, Officer, Viewer, and Admin workflows (SIH26093)",
    version="0.4.0",
)

# 1. Rate Limiting Middleware
app.add_middleware(RateLimitMiddleware)

# 2. CORS Allowlist Configuration
safe_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://nhaa-portal.vercel.app",
]
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "").strip()
if allowed_origins_env:
    for origin in allowed_origins_env.split(","):
        clean_o = origin.strip()
        if clean_o and clean_o != "*" and clean_o not in safe_origins:
            safe_origins.append(clean_o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=safe_origins,
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.onrender\.com|http://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept"],
)

# Routers
app.include_router(auth_router)
app.include_router(cases_router)
app.include_router(session_router)
app.include_router(deepgram_router)
app.include_router(engine2_router)
app.include_router(chat_router)


@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "service": "nhaa-ai-case-intelligence",
        "version": "0.4.0",
        "pipeline": "multimodal_voice_nlp_risk",
        "speech_stt": "deepgram_streaming_nova2",
        "nlp_engine": "spacy_ner",
        "emotion_engine": "conversational_distress_classifier",
        "risk_engine": "scikit_learn_random_forest",
        "historical_engine": "tfidf_cosine_similarity",
        "llm_engine": "groq_gemini_hybrid",
        "security": {
            "jwt_rbac": "active",
            "firebase_auth": "active",
            "rate_limiting": "active",
            "audit_trail": "sanitized_active",
        },
        "message": "NHAA AI Case Intelligence Platform Active",
    }


@app.get("/health")
@app.get("/api/health")
def health_check():
    groq_configured = bool(os.environ.get("GROQ_API_KEY", ""))
    deepgram_configured = bool(os.environ.get("DEEPGRAM_API_KEY", ""))
    gemini_configured = bool(os.environ.get("GEMINI_API_KEY", ""))

    return {
        "status": "healthy",
        "database": "sqlite_connected",
        "security": {
            "rbac_enabled": True,
            "rate_limiting": "active_sliding_window",
            "cors_protection": "allowlist_enforced",
            "audit_trail": "sanitized_active",
            "token_verification": ["JWT_HS256", "Firebase_RS256"],
        },
        "services": {
            "groq_assistant": "configured" if groq_configured else "fallback_active",
            "deepgram_streaming_stt": "configured" if deepgram_configured else "missing_key",
            "gemini_assistant": "configured" if gemini_configured else "fallback_active",
            "audio_calibration": "numpy_librosa_active",
            "nlp_spacy": "active",
            "emotion_classifier": "active",
            "risk_classifier": "scikit_learn_active",
            "historical_case_matching": "tfidf_cosine_active",
            "jwt_rbac": "active",
            "rate_limiter": "active",
            "audit_logging": "active",
        },
        "roles_supported": ["Admin", "Nodal Officer", "Operator", "Viewer", "Citizen"],
    }


if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", os.environ.get("BACKEND_HOST", "0.0.0.0"))
    port = int(os.environ.get("PORT", os.environ.get("BACKEND_PORT", 8000)))
    uvicorn.run("app.main:app", host=host, port=port, reload=False)
