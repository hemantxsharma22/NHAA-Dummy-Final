"""SAATHI-AI Live Case Records (SQLAlchemy model)"""

from sqlalchemy import Column, String, Integer, Float, Text, DateTime
from sqlalchemy.sql import func
from app.database import Base


class LiveCase(Base):
    __tablename__ = "live_cases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(20), unique=True, index=True, nullable=False)
    operator_name = Column(String(100), nullable=False, default="Operator")
    district = Column(String(100), nullable=True)
    final_svi = Column(Integer, nullable=False, default=0)
    svi_label = Column(String(20), nullable=False, default="LOW")
    full_transcript = Column(Text, nullable=True)
    case_brief = Column(Text, nullable=True)
    brief_source = Column(String(20), nullable=True)
    chunk_count = Column(Integer, nullable=False, default=0)
    indicators_json = Column(Text, nullable=True)
    metric_bars_json = Column(Text, nullable=True)
    score_history_json = Column(Text, nullable=True)
    delay_risk_score = Column(Integer, nullable=False, default=15)
    status = Column(String(50), nullable=True, default="Under Review")
    priority = Column(String(50), nullable=True, default="MEDIUM")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
