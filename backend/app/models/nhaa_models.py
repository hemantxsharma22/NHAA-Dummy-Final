"""
NHAA AI Case Intelligence Platform — Comprehensive SQLAlchemy Database Models
Preserves existing schema and adds complete Citizen, Operator, Officer, and Admin models.
"""

from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    Text,
    DateTime,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


# ==============================================================================
# 1. USERS & RBAC (Citizen, Operator, Officer, Admin)
# ==============================================================================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(80), unique=True, index=True, nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(120), nullable=True)
    role = Column(String(50), nullable=False, default="Citizen")  # Admin, Nodal Officer, Officer, Operator, Viewer, Citizen
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    officer_profile = relationship("Officer", back_populates="user", uselist=False)
    cases_filed = relationship("Case", back_populates="citizen_user", foreign_keys="Case.citizen_user_id")
    audit_logs = relationship("AuditLog", back_populates="actor")


class Officer(Base):
    __tablename__ = "officers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    badge_number = Column(String(50), unique=True, index=True, nullable=False)
    department = Column(String(100), nullable=False, default="Emergency Response")
    rank = Column(String(50), nullable=False, default="Nodal Officer")
    phone = Column(String(20), nullable=True)
    is_available = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="officer_profile")
    assigned_cases = relationship("Case", back_populates="assigned_officer", foreign_keys="Case.assigned_officer_id")


# ==============================================================================
# 2. CASES & COMPLAINTS
# ==============================================================================
class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String(30), unique=True, index=True, nullable=False)  # e.g., NHAA-CASE-2026-XXXX
    anonymous_id = Column(String(30), index=True, nullable=True)  # e.g., CITIZEN-ANON-XXXX
    citizen_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_officer_id = Column(Integer, ForeignKey("officers.id"), nullable=True)

    category = Column(String(50), nullable=False, default="Emergency Assistance")  # Distress, Threat, Harassment, Rescue
    status = Column(String(30), nullable=False, default="OPEN")  # OPEN, TRIAGED, IN_INVESTIGATION, RESOLVED, CLOSED
    priority = Column(String(20), nullable=False, default="MEDIUM")  # LOW, MEDIUM, HIGH, CRITICAL

    title = Column(String(200), nullable=False, default="Citizen Distress / Assistance Request")
    description = Column(Text, nullable=True)
    location = Column(String(150), nullable=True)
    district = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True, default="National")

    # Risk & SVI Summary
    risk_level = Column(String(20), nullable=False, default="LOW")  # LOW, MODERATE, HIGH
    risk_score = Column(Float, nullable=False, default=0.0)  # 0.0 - 1.0 or 0 - 100
    svi_score = Column(Integer, nullable=False, default=0)

    is_anonymous = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    citizen_user = relationship("User", back_populates="cases_filed", foreign_keys=[citizen_user_id])
    assigned_officer = relationship("Officer", back_populates="assigned_cases", foreign_keys=[assigned_officer_id])
    complaints = relationship("Complaint", back_populates="case", cascade="all, delete-orphan")
    transcripts = relationship("Transcript", back_populates="case", cascade="all, delete-orphan")
    audio_assessments = relationship("AudioAssessment", back_populates="case", cascade="all, delete-orphan")
    emotion_results = relationship("EmotionResult", back_populates="case", cascade="all, delete-orphan")
    nlp_results = relationship("NLPResult", back_populates="case", cascade="all, delete-orphan")
    risk_assessments = relationship("RiskAssessment", back_populates="case", cascade="all, delete-orphan")
    similar_cases = relationship("SimilarCase", back_populates="case", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="case", cascade="all, delete-orphan")


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, autoincrement=True)
    complaint_code = Column(String(30), unique=True, index=True, nullable=False)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    channel = Column(String(20), nullable=False, default="voice")  # voice, web, mobile, emergency_call
    narrative = Column(Text, nullable=True)
    requested_help = Column(String(150), nullable=True)
    incident_time = Column(String(100), nullable=True)
    persons_involved = Column(Text, nullable=True)  # JSON or comma-separated
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    case = relationship("Case", back_populates="complaints")


# ==============================================================================
# 3. REAL-TIME TRANSCRIPTS & DIARIZED SEGMENTS
# ==============================================================================
class Transcript(Base):
    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True)
    session_id = Column(String(40), index=True, nullable=False)
    full_text = Column(Text, nullable=False, default="")
    language = Column(String(20), nullable=False, default="hi-IN")
    duration_seconds = Column(Float, nullable=False, default=0.0)
    is_final = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    case = relationship("Case", back_populates="transcripts")
    segments = relationship("TranscriptSegment", back_populates="transcript", cascade="all, delete-orphan")


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    transcript_id = Column(Integer, ForeignKey("transcripts.id"), nullable=True)
    session_id = Column(String(40), index=True, nullable=False)
    speaker = Column(String(30), nullable=False, default="Citizen")  # Operator, Citizen, Speaker 0, Speaker 1
    text = Column(Text, nullable=False)
    is_final = Column(Boolean, nullable=False, default=True)
    confidence = Column(Float, nullable=False, default=0.95)
    start_time = Column(Float, nullable=True)
    end_time = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    transcript = relationship("Transcript", back_populates="segments")


# ==============================================================================
# 4. AUDIO QUALITY & CALIBRATION RESULTS
# ==============================================================================
class AudioAssessment(Base):
    __tablename__ = "audio_assessments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True)
    session_id = Column(String(40), index=True, nullable=False)

    audio_quality = Column(String(20), nullable=False, default="good")  # good, fair, poor
    noise_level = Column(String(20), nullable=False, default="low")     # low, moderate, high
    speech_detected = Column(Boolean, nullable=False, default=True)
    clipping_detected = Column(Boolean, nullable=False, default=False)
    speech_ratio = Column(Float, nullable=False, default=0.75)
    snr_db = Column(Float, nullable=True)
    sampling_rate = Column(Integer, nullable=False, default=16000)
    duration_seconds = Column(Float, nullable=False, default=0.0)

    # Acoustic Features (from librosa / numpy)
    rms_energy = Column(Float, nullable=True)
    pause_ratio = Column(Float, nullable=True)
    speech_rate = Column(Float, nullable=True)
    pitch_variation = Column(Float, nullable=True)
    zero_crossing_rate = Column(Float, nullable=True)
    spectral_centroid = Column(Float, nullable=True)

    disclaimer = Column(
        String(255),
        default="Audio/conversational features only. Does not diagnose stress, trauma, anxiety, or medical conditions.",
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    case = relationship("Case", back_populates="audio_assessments")


# ==============================================================================
# 5. EMOTION & SENTIMENT RESULTS
# ==============================================================================
class EmotionResult(Base):
    __tablename__ = "emotion_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True)
    session_id = Column(String(40), index=True, nullable=False)

    dominant_emotion = Column(String(30), nullable=False, default="neutral")
    confidence = Column(Float, nullable=False, default=0.80)

    # Emotion Score Distribution (JSON or explicit columns)
    fear_score = Column(Float, default=0.0)
    sadness_score = Column(Float, default=0.0)
    anger_score = Column(Float, default=0.0)
    neutral_score = Column(Float, default=1.0)
    urgency_score = Column(Float, default=0.0)
    distress_score = Column(Float, default=0.0)
    emotion_scores_json = Column(Text, nullable=True)

    disclaimer = Column(
        String(255),
        default="AI-derived conversational/emotional indicator. Not a medical or psychiatric diagnosis.",
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    case = relationship("Case", back_populates="emotion_results")


# ==============================================================================
# 6. NLP & ENTITY EXTRACTION RESULTS
# ==============================================================================
class NLPResult(Base):
    __tablename__ = "nlp_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True)
    session_id = Column(String(40), index=True, nullable=False)

    persons_json = Column(Text, nullable=True)       # ["Rohit", ...]
    locations_json = Column(Text, nullable=True)     # ["college", "metro station"]
    time_references_json = Column(Text, nullable=True) # ["yesterday", "10 PM"]
    organizations_json = Column(Text, nullable=True) # ["Police", "Hospital"]
    incident_type = Column(String(50), nullable=True) # "threat", "harassment", "medical"

    tokens_count = Column(Integer, default=0)
    sentences_count = Column(Integer, default=0)
    raw_entities_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    case = relationship("Case", back_populates="nlp_results")


# ==============================================================================
# 7. MULTIMODAL RISK ASSESSMENT
# ==============================================================================
class RiskAssessment(Base):
    __tablename__ = "risk_assessments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True)
    session_id = Column(String(40), index=True, nullable=False)

    risk_level = Column(String(20), nullable=False, default="LOW")  # LOW, MODERATE, HIGH
    risk_score = Column(Float, nullable=False, default=0.15)       # 0.0 - 1.0

    threat_detected = Column(Boolean, default=False)
    violence_detected = Column(Boolean, default=False)
    urgency_detected = Column(Boolean, default=False)
    immediate_danger = Column(Boolean, default=False)

    fused_features_json = Column(Text, nullable=True)
    feature_contributions_json = Column(Text, nullable=True)
    explanation = Column(Text, nullable=True)
    recommended_action = Column(Text, nullable=True)

    disclaimer = Column(
        String(255),
        default="AI-assisted risk classification & distress prioritization only. Not a clinical diagnosis.",
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    case = relationship("Case", back_populates="risk_assessments")


# ==============================================================================
# 8. HISTORICAL CASES & SIMILAR CASE MATCHING
# ==============================================================================
class HistoricalCase(Base):
    __tablename__ = "historical_cases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_code = Column(String(40), unique=True, index=True, nullable=False)
    category = Column(String(50), nullable=False)
    district = Column(String(100), nullable=False)
    summary = Column(Text, nullable=False)
    incident_text = Column(Text, nullable=False)
    resolution_path = Column(Text, nullable=True)
    resolved_in_hours = Column(Float, default=24.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    matches = relationship("SimilarCase", back_populates="historical_case")


class SimilarCase(Base):
    __tablename__ = "similar_cases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    historical_case_id = Column(Integer, ForeignKey("historical_cases.id"), nullable=False)
    similarity_score = Column(Float, nullable=False)  # 0.0 - 1.0 (Cosine similarity)
    matching_terms_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    case = relationship("Case", back_populates="similar_cases")
    historical_case = relationship("HistoricalCase", back_populates="matches")


# ==============================================================================
# 9. AUDIT LOGS
# ==============================================================================
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_role = Column(String(30), nullable=False, default="System")
    action = Column(String(100), nullable=False)
    rationale = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    case = relationship("Case", back_populates="audit_logs")
    actor = relationship("User", back_populates="audit_logs")
