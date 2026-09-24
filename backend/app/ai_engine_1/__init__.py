"""
Engine 1: Live Interaction & Real-Time Triage Engine
Package initialization and main pipeline entry point.
"""

import json
import time
import logging
from pathlib import Path
from typing import Optional, List

from .indicators import detect_indicators, compute_speech_pace_score
from .svi_engine import SVIState, update_svi, get_label
from .copilot import get_copilot_suggestion
from .transcriber import transcribe_chunk
from .session_manager import (
    create_session, get_session, update_session,
    get_session_meta, close_session
)

logger = logging.getLogger("ai_engine_1")
CONFIG_PATH = Path(__file__).parent / "config.json"
_config_cache: Optional[dict] = None


def _get_config() -> dict:
    global _config_cache
    if _config_cache is None:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            _config_cache = json.load(f)
    return _config_cache


def process_audio_chunk(
    session_id: str,
    audio_bytes: bytes,
    audio_format: str = "webm",
    chunk_duration_seconds: float = 3.5,
) -> dict:
    """
    Full Engine 1 pipeline for one audio chunk.

    Pipeline:
      audio_bytes → transcribe (OpenAI Whisper) → detect indicators → update SVI → co-pilot
    """
    config = _get_config()
    state = get_session(session_id)
    if state is None:
        return {"error": f"Session {session_id} not found"}

    # ── Step 1: Transcription ────────────────────────────────────────────────
    t_result = transcribe_chunk(
        audio_bytes=audio_bytes,
        audio_format=audio_format,
        language=None,
        previous_text=state.full_transcript[-400:] if state.full_transcript else None,
    )

    new_text = t_result["text"]
    stt_source = t_result["source"]
    stt_error = t_result.get("error")

    # If text is present, process it through the triage engine
    return _process_segment_internal(
        state=state,
        text=new_text,
        config=config,
        chunk_duration_seconds=chunk_duration_seconds,
        stt_source=stt_source,
        stt_error=stt_error,
    )


def process_text_segment(
    session_id: str,
    text: str,
    chunk_duration_seconds: float = 3.5,
    stt_source: str = "live_speech",
    role: str = "user",
) -> dict:
    """
    Process an incremental finalized speech segment directly through Engine 1.
    Used for real-time speech capture streams.
    """
    config = _get_config()
    state = get_session(session_id)
    if state is None:
        return {"error": f"Session {session_id} not found"}

    return _process_segment_internal(
        state=state,
        text=text.strip(),
        config=config,
        chunk_duration_seconds=chunk_duration_seconds,
        stt_source=stt_source,
        stt_error=None,
        role=role,
    )


def _process_segment_internal(
    state: SVIState,
    text: str,
    config: dict,
    chunk_duration_seconds: float,
    stt_source: str,
    stt_error: Optional[str],
    role: str = "user",
) -> dict:
    """Core logic to analyze text, update SVI, and fetch co-pilot guidance."""
    is_assistant = (role or "").lower() in ["assistant", "ai", "bot", "operator", "agent", "model"] or stt_source == "operator"

    if is_assistant:
        logger.info(f'[SVI] AI message → ignored: "{text[:50]}"')
        indicators = []
        calming_factor = 0.0
        pace_label = "NORMAL"
    else:
        logger.info(f'[SVI] Caller message → scoring: "{text[:50]}"')
        word_count = len(text.split()) if text else 0

        indicators, raw_distress, calming_factor = detect_indicators(
            text=text,
            config=config,
            chunk_duration_seconds=chunk_duration_seconds,
        )

        pace_score, pace_label = compute_speech_pace_score(
            word_count=word_count,
            chunk_duration_seconds=chunk_duration_seconds,
            pace_config=config.get("speech_pace_config", {}),
        )

        state = update_svi(
            state=state,
            new_chunk_text=text,
            raw_distress_score=raw_distress,
            calming_factor=calming_factor,
            pace_score=pace_score,
            pace_label=pace_label,
            new_indicators=indicators,
            config=config,
        )

        # Dynamic location extraction (caller speech only, ignore operator)
        from .location_extractor import extract_location
        curr_loc = getattr(state, "detected_location", {}) or {}
        new_loc = extract_location(text, curr_loc)
        if new_loc:
            state.detected_location = new_loc

        update_session(state.session_id, state)

    copilot = get_copilot_suggestion(
        svi_label=state.last_svi_label,
        config=config,
        full_transcript=state.full_transcript,
    )

    indicator_list = [
        {
            "category": ind.category,
            "ui_label": ind.ui_label,
            "matched_phrase": ind.matched_phrase,
            "evidence_snippet": ind.evidence_snippet,
            "weight": ind.weight,
            "confidence": int(ind.confidence * 100) if hasattr(ind, "confidence") else 85,
            "is_calming": ind.is_calming,
            "assistance_type": getattr(ind, "assistance_type", None),
        }
        for ind in indicators
    ]

    metric_bars = [
        {
            "name": label,
            "score": round(score),
            "score_float": score,
            "evidence": getattr(state, "category_evidence", {}).get(label, []),
        }
        for label, score in sorted(state.category_scores.items())
    ]

    return {
        "session_id": state.session_id,
        "chunk_index": state.chunk_count,
        "new_text": text,
        "full_transcript": state.full_transcript,
        "svi": round(state.running_svi),
        "svi_label": state.last_svi_label,
        "calming_detected": calming_factor > 0.15,
        "indicators": indicator_list,
        "metric_bars": metric_bars,
        "score_history": getattr(state, "score_history", []),
        "copilot": copilot,
        "pace_label": pace_label,
        "detected_location": getattr(state, "detected_location", {}),
        "stt_source": stt_source,
        "stt_error": stt_error,
    }


def end_session(session_id: str, operator_name: str = "Operator") -> dict:
    """
    End a live session: generate case brief and return final state.
    """
    from .case_brief import generate_case_brief

    config = _get_config()
    state = close_session(session_id)
    if state is None:
        return {"error": "Session not found"}

    indicator_dicts = [
        {
            "category": ind.category,
            "ui_label": ind.ui_label,
            "matched_phrase": ind.matched_phrase,
            "evidence_snippet": ind.evidence_snippet,
            "confidence": int(getattr(ind, "confidence", 0.85) * 100),
            "is_calming": ind.is_calming,
            "assistance_type": getattr(ind, "assistance_type", None),
        }
        for ind in state.all_indicators
    ]

    brief = generate_case_brief(
        full_transcript=state.full_transcript,
        svi_score=state.running_svi,
        svi_label=state.last_svi_label,
        indicators=indicator_dicts,
        operator_name=operator_name,
        session_duration_seconds=max(10, state.chunk_count * 3.5),
    )

    metric_bars = [
        {
            "name": label,
            "score": round(score),
            "evidence": getattr(state, "category_evidence", {}).get(label, []),
        }
        for label, score in sorted(state.category_scores.items())
    ]

    return {
        "session_id": session_id,
        "final_svi": round(state.running_svi),
        "final_svi_label": state.last_svi_label,
        "full_transcript": state.full_transcript,
        "chunk_count": state.chunk_count,
        "metric_bars": metric_bars,
        "score_history": getattr(state, "score_history", []),
        "case_brief": brief["brief_text"],
        "brief_source": brief["source"],
        "indicators_summary": indicator_dicts,
        "detected_location": getattr(state, "detected_location", {}),
    }
