"""
Engine 1: Indicators Module (Unified 21-Category Taxonomy with ML Integration)
=============================================================================
Layered real-time detection pipeline:
  1. Multilingual Text Normalization (Devanagari, Hinglish Transliteration, English)
  2. Negation & Meta-Context False Positive Filter
  3. Hybrid Detection:
     a. Rapid Keyword / Phrase Matching for immediate trigger detection
     b. Calibrated Multiclass ML Classifier (TF-IDF + LogisticRegression)
        trained on 3,000+ multilingual samples across 21 categories
  4. Speaker Role & Immediacy Context Distinction
"""

import json
import logging
import os
import pickle
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger("ai_engine_1.indicators")
CONFIG_PATH = Path(__file__).parent / "config.json"
ML_MODEL_PATH = Path(__file__).resolve().parent.parent.parent / "saathi_model" / "indicator_model.pkl"

_ml_model_cache: Optional[Dict[str, Any]] = None


def _load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def _load_ml_model() -> Optional[Dict[str, Any]]:
    global _ml_model_cache
    if _ml_model_cache is not None:
        return _ml_model_cache

    if ML_MODEL_PATH.exists():
        try:
            with open(ML_MODEL_PATH, "rb") as f:
                _ml_model_cache = pickle.load(f)
            logger.info("Loaded 21-category indicator ML model successfully.")
        except Exception as e:
            logger.warning(f"Could not load ML indicator model: {e}")
            _ml_model_cache = None
    return _ml_model_cache


@dataclass
class IndicatorMatch:
    category: str
    ui_label: str
    matched_phrase: str
    evidence_snippet: str
    weight: float
    confidence: float = 0.85
    is_calming: bool = False
    is_negated: bool = False
    is_historical: bool = False
    assistance_type: Optional[str] = None


# Multilingual transliteration normalization map
TRANSLITERATION_MAP = {
    r"\bdarr?\b": "dar",
    r"\bdarr?\s+lag\s+rah[aa]\b": "dar_lag_raha",
    r"\bghabr[aa]+hat\b": "ghabrahat",
    r"\bdhamk[eei]+\b": "dhamki",
    r"\bmaar(?:ne|na|unga|ungi)?\b": "maar",
    r"\bjaan\s+se\s+maar\b": "jaan_se_maar",
    r"\bakel[aa]|akeli\b": "akela",
    r"\bparesh[aa]+n\b": "pareshan",
    r"\bmadad\b": "help",
    r"\bbach[aa]o\b": "help",
    r"\bchala\s+gaya|chali\s+gayi\b": "he_left",
    r"\bfaer\b": "fear",
    r"\bhelpp?\b": "help",
}

NEGATION_KEYWORDS = {
    "nahi", "nahin", "nhi", "no", "not", "dont", "don't", "doesnt", "doesn't",
    "wont", "won't", "never", "na", "mat", "without", "koi nahi", "bilkul nahi", "kuch nahi",
    "नहीं", "नही", "मत"
}

META_CONTEXT_KEYWORDS = {
    "movie", "film", "serial", "drama", "news", "awareness", "program", "game",
    "playing", "joke", "joking", "hass hass ke", "mar hi gayi", "mar hi gaya", "कहानी", "फिल्म", "नाटक"
}

HISTORICAL_KEYWORDS = {
    "kal", "yesterday", "pichle", "pichli", "purana", "purani", "last week", "last month", "pehle", "पहले", "कल"
}


def _normalize(text: str) -> str:
    """Lowercase, strip excessive punctuation, and normalize transliteration variations."""
    text_lower = (text or "").lower()
    cleaned = re.sub(r"[^\w\s\u0900-\u097F]", " ", text_lower)
    for pattern, repl in TRANSLITERATION_MAP.items():
        cleaned = re.sub(pattern, repl, cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def classify_assistance_request(text: str) -> Optional[str]:
    """Classify the requested assistance type from caller text."""
    lower = text.lower()
    if any(k in lower for k in ["police", "thana", "cop", "pcr", "पुलिस"]):
        return "police"
    if any(k in lower for k in ["medical", "doctor", "ambulance", "hospital", "khoon", "bleeding", "डॉक्टर"]):
        return "medical"
    if any(k in lower for k in ["shelter", "protection", "safe house", "rehney"]):
        return "shelter/protection"
    if any(k in lower for k in ["legal", "vakeel", "lawyer", "court", "वकील"]):
        return "legal"
    if any(k in lower for k in ["counsel", "counselling", "baat karna"]):
        return "counselling"
    if any(k in lower for k in ["info", "jaankari", "information"]):
        return "information"
    return "emergency"


def is_phrase_negated(text: str, match_phrase: str) -> bool:
    """
    Check if a matched phrase is preceded or followed by negation words.
    Example: 'mujhe darr nahi lag raha' -> True for fear
    """
    text_lower = text.lower()
    phrase_lower = match_phrase.lower()

    if phrase_lower not in text_lower:
        return False

    idx = text_lower.find(phrase_lower)
    pre_window = text_lower[max(0, idx - 35):idx]
    post_window = text_lower[idx + len(phrase_lower):min(len(text_lower), idx + len(phrase_lower) + 35)]

    words_near = pre_window.split()[-4:] + post_window.split()[:4]
    return any(neg in words_near for neg in NEGATION_KEYWORDS)


def is_meta_context_false_positive(text: str) -> bool:
    """
    Check if sentence refers to movies, news, awareness programs, or jokes.
    """
    lower = text.lower()
    return any(kw in lower for kw in META_CONTEXT_KEYWORDS)


def is_historical_event(text: str) -> bool:
    """
    Check if caller is discussing a past incident rather than active danger.
    """
    lower = text.lower()
    return any(kw in lower for kw in HISTORICAL_KEYWORDS)


def detect_indicators(
    text: str,
    config: Optional[dict] = None,
    chunk_duration_seconds: float = 3.5,
) -> Tuple[List[IndicatorMatch], float, float]:
    """
    Analyze transcript segment for distress indicators and calming signals across all 21 categories.
    Combines rule-based phrase triggers with calibrated ML classification.

    Returns:
      - indicators: List of IndicatorMatch
      - raw_distress_score: 0-100 sum of distress weights
      - calming_factor: 0.0-1.0 de-escalation strength
    """
    config = config or _load_config()
    normalized = _normalize(text)
    meta_false_positive = is_meta_context_false_positive(text)
    historical = is_historical_event(text)

    categories_cfg = config.get("indicator_categories", {})

    indicators: List[IndicatorMatch] = []
    matched_cats = set()
    total_distress_weight = 0.0
    total_calming_weight = 0.0

    # ── Layer 1: Rule & Keyword Matching across 21 Categories ───────────────────
    for cat_key, cat_cfg in categories_cfg.items():
        cat_weight = float(cat_cfg.get("weight", 20.0))
        ui_label = cat_cfg.get("ui_label", cat_key)
        is_calming_cat = cat_weight < 0 or "CURRENT_SAFETY" in cat_key.upper() or "current_safety" in cat_key.lower()

        # Sort phrases by descending length so most specific phrases match first
        phrases = sorted(cat_cfg.get("phrases", []), key=len, reverse=True)

        for phrase in phrases:
            norm_phrase = _normalize(phrase)
            if norm_phrase and norm_phrase in normalized:
                negated = is_phrase_negated(text, phrase)

                idx = normalized.find(norm_phrase)
                start_char = max(0, idx - 25)
                end_char = min(len(text), idx + len(phrase) + 25)
                snippet = text[start_char:end_char].strip()

                calc_confidence = min(0.98, max(0.80, 0.85 + (len(norm_phrase.split()) * 0.03)))

                if negated:
                    if not is_calming_cat:
                        total_calming_weight += 25.0
                    continue

                if meta_false_positive and not is_calming_cat:
                    continue

                # Severe multiplier for death/life-threatening phrase matches
                effective_weight = abs(cat_weight)
                if any(kw in norm_phrase or kw.replace(" ", "_") in norm_phrase or kw in phrase.lower() for kw in ["jaan se maar", "kill me", "murder", "hatya", "qatl", "katl", "mar dalega", "mar dalenge"]):
                    effective_weight = max(effective_weight, 58.0)
                    calc_confidence = max(calc_confidence, 0.96)

                assistance_type = classify_assistance_request(text) if "REQUEST" in cat_key.upper() else None

                match_obj = IndicatorMatch(
                    category=cat_key,
                    ui_label=ui_label,
                    matched_phrase=phrase,
                    evidence_snippet=f"...{snippet}..." if snippet else text,
                    weight=effective_weight,
                    confidence=round(calc_confidence, 2),
                    is_calming=is_calming_cat,
                    is_negated=negated,
                    is_historical=historical,
                    assistance_type=assistance_type,
                )
                indicators.append(match_obj)
                matched_cats.add(cat_key.upper())

                if is_calming_cat:
                    total_calming_weight += effective_weight
                else:
                    weight_mult = 0.6 if historical else 1.0
                    total_distress_weight += effective_weight * weight_mult

                break  # One match per category per chunk

    # ── Layer 2: Machine Learning Classification Inference across Clauses ─────────
    ml_model = _load_ml_model()
    if ml_model and text.strip() and not meta_false_positive:
        try:
            pipeline = ml_model["pipeline"]
            classes = ml_model["classes"]

            # Evaluate both full text and sub-clauses (split by conjunctions/punctuation)
            clauses = re.split(r"[,;.\n]|(?:\b(?:because|lekin|par|aur|and|but|kyunki|or)\b)", text, flags=re.IGNORECASE)
            eval_texts = [normalized] + [_normalize(c) for c in clauses if len(c.strip()) > 3]

            for ev_text in eval_texts:
                if not ev_text.strip():
                    continue
                probs = pipeline.predict_proba([ev_text])[0]
                top_indices = np.argsort(probs)[::-1]

                for idx in top_indices[:3]:
                    prob = float(probs[idx])
                    cat = classes[idx]

                    if cat == "NEUTRAL_NO_INDICATOR" or prob < 0.28:
                        continue

                    cat_upper = cat.upper()
                    cat_lower = cat.lower()

                    if cat_upper not in matched_cats and cat_lower not in matched_cats:
                        cat_cfg = (
                            categories_cfg.get(cat_upper)
                            or categories_cfg.get(cat_lower)
                            or {"weight": 28.0, "ui_label": cat.replace("_", " ").title()}
                        )
                        c_weight = float(cat_cfg.get("weight", 28.0))
                        u_label = cat_cfg.get("ui_label", cat.replace("_", " ").title())
                        is_calm = c_weight < 0 or "CURRENT_SAFETY" in cat_upper

                        # Check if this clause was negated
                        if is_phrase_negated(ev_text, ev_text):
                            continue

                        ml_match = IndicatorMatch(
                            category=cat,
                            ui_label=u_label,
                            matched_phrase=ev_text[:40],
                            evidence_snippet=text.strip(),
                            weight=abs(c_weight),
                            confidence=round(prob, 2),
                            is_calming=is_calm,
                            is_negated=False,
                            is_historical=historical,
                            assistance_type=classify_assistance_request(text) if "REQUEST" in cat_upper else None,
                        )
                        indicators.append(ml_match)
                        matched_cats.add(cat_upper)

                        if is_calm:
                            total_calming_weight += abs(c_weight)
                        else:
                            w_mult = 0.6 if historical else 1.0
                            total_distress_weight += abs(c_weight) * w_mult
                    else:
                        # Update confidence if ML confidence is higher
                        for ind in indicators:
                            if ind.category.upper() == cat_upper:
                                ind.confidence = max(ind.confidence, round(prob, 2))
        except Exception as e:
            logger.debug(f"ML indicator prediction exception: {e}")


    # Cap single chunk raw distress contribution
    max_contrib = config.get("svi_config", {}).get("max_single_chunk_contribution", 65)
    raw_distress_score = min(total_distress_weight, max_contrib)

    # Calming factor scale
    calming_factor = min(total_calming_weight / 45.0, 1.0)

    return indicators, raw_distress_score, calming_factor


def compute_speech_pace_score(
    word_count: int,
    chunk_duration_seconds: float,
    pace_config: dict,
) -> Tuple[float, str]:
    """Estimate speech urgency from WPM proxy."""
    if chunk_duration_seconds <= 0:
        return 0.0, "normal"

    wpm = (word_count / chunk_duration_seconds) * 60.0
    slow_thresh = pace_config.get("slow_wpm_threshold", 60)
    fast_thresh = pace_config.get("fast_wpm_threshold", 220)

    if wpm < slow_thresh:
        return float(pace_config.get("slow_distress_weight", 15)), "slow"
    elif wpm > fast_thresh:
        return float(pace_config.get("fast_panic_weight", 22)), "rapid"
    return float(pace_config.get("normal_contribution", 0)), "normal"
