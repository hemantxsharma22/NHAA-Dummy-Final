"""
Engine 1: SVI (Stress Vulnerability Index) Computation

Context-aware scoring using exponential smoothing + active calming reduction.
The key design: score is NOT a simple keyword counter. It decays over time
and actively decreases when calming signals are detected.

SVI Scale: 0-100
Labels: LOW (0-25) | MODERATE (26-50) | HIGH (51-75) | CRITICAL (76-100)
"""

from dataclasses import dataclass, field
from typing import List, Optional
from .indicators import IndicatorMatch


import time

SVI_LABELS = [
    (0, 29, "LOW"),
    (30, 59, "MODERATE"),
    (60, 79, "HIGH"),
    (80, 100, "CRITICAL"),
]


def get_label(score: float) -> str:
    for lo, hi, label in SVI_LABELS:
        if lo <= int(score) <= hi:
            return label
    return "CRITICAL" if score >= 80 else "LOW"


@dataclass
class SVIState:
    """Persistent state carried across all chunks in a session."""
    session_id: str
    running_svi: float = 0.0
    chunk_count: int = 0
    full_transcript: str = ""
    all_indicators: List[IndicatorMatch] = field(default_factory=list)
    # Per-category running scores for UI metric bars (0-100)
    category_scores: dict = field(default_factory=dict)
    category_evidence: dict = field(default_factory=dict)
    score_history: List[dict] = field(default_factory=list)
    calming_count: int = 0
    last_svi_label: str = "LOW"
    detected_location: dict = field(default_factory=dict)


def update_svi(
    state: SVIState,
    new_chunk_text: str,
    raw_distress_score: float,
    calming_factor: float,
    pace_score: float,
    pace_label: str,
    new_indicators: List[IndicatorMatch],
    config: dict,
) -> SVIState:
    """
    Update the running SVI with exponential smoothing and calming reduction.
    """
    svi_cfg = config.get("svi_config", {})
    alpha = svi_cfg.get("smoothing_alpha", 0.45)
    decay_rate = svi_cfg.get("decay_rate", 0.72)
    calming_reduction = svi_cfg.get("calming_reduction_factor", 0.38)
    baseline_decay = svi_cfg.get("baseline_decay_per_chunk", 2.5)

    current = state.running_svi

    if calming_factor > 0.15:
        # Active calming detected — reduce score proportionally
        reduction = max(18.0, current * 0.45 * (1.0 + calming_factor))
        new_svi = max(0.0, current - reduction)
        state.calming_count += 1
    else:
        # Distress or neutral chunk
        chunk_total = raw_distress_score + pace_score
        if chunk_total > 0:
            scale_headroom = (100.0 - current) / 100.0
            added_distress = chunk_total * scale_headroom * alpha
            new_svi = current + added_distress
        else:
            # Neutral chunk: gentle decay
            new_svi = max(0.0, current * decay_rate - baseline_decay)

    # Cap at 100
    state.running_svi = min(100.0, max(0.0, new_svi))
    state.chunk_count += 1
    state.full_transcript += (" " + new_chunk_text) if state.full_transcript else new_chunk_text
    state.all_indicators.extend(new_indicators)
    state.last_svi_label = get_label(state.running_svi)

    # Record score trend data point
    timestamp_str = time.strftime("%H:%M:%S")
    state.score_history.append({
        "timestamp": timestamp_str,
        "score": round(state.running_svi),
        "label": state.last_svi_label,
        "trigger_text": new_chunk_text[:60] if new_chunk_text else "",
    })

    # Update per-category scores and evidence snippets for UI metric bars
    _update_category_scores(state, new_indicators, calming_factor, pace_score, pace_label, config)

    return state


def _update_category_scores(
    state: SVIState,
    new_indicators: List[IndicatorMatch],
    calming_factor: float,
    pace_score: float,
    pace_label: str,
    config: dict,
) -> None:
    """
    Keep per-category running scores (0-100) for the UI breakdown bars.
    Each category score independently decays and updates similarly to SVI.
    """
    alpha = 0.5
    decay = 0.80

    # Ensure all categories exist
    for cat_key, cat_cfg in config.get("indicator_categories", {}).items():
        if cat_cfg["ui_label"] not in state.category_scores:
            state.category_scores[cat_cfg["ui_label"]] = 0.0

    if "Speech pace" not in state.category_scores:
        state.category_scores["Speech pace"] = 0.0

    # Update from new indicators
    for ind in new_indicators:
        label = ind.ui_label
        if label not in state.category_scores:
            state.category_scores[label] = 0.0
        if label not in state.category_evidence:
            state.category_evidence[label] = []

        # Record evidence snippet
        if ind.matched_phrase and ind.matched_phrase not in state.category_evidence[label]:
            state.category_evidence[label].append(ind.matched_phrase)

        if ind.is_calming:
            # Calming → reduce category score
            state.category_scores[label] = max(
                0.0, state.category_scores[label] * 0.6
            )
        else:
            # Distress → blend up, ensuring initial trigger reflects full indicator weight
            blended = state.category_scores[label] * decay + ind.weight * alpha
            state.category_scores[label] = min(100.0, max(float(ind.weight), blended))

    # Update speech pace separately
    sp_current = state.category_scores.get("Speech pace", 0.0)
    state.category_scores["Speech pace"] = min(
        100.0, sp_current * decay + pace_score * alpha
    )

    # Apply global calming to all categories if strong calming detected
    if calming_factor > 0.15:
        for key in state.category_scores:
            state.category_scores[key] = max(
                0.0, state.category_scores[key] * (1 - calming_factor * 0.35)
            )
