"""
Dedicated Sentiment & Emotion Analysis Component for NHAA Voice/Text Pipeline.
Classifies conversational emotion indicators (fear, sadness, anger, neutral, urgency, distress).

DISCLAIMER: AI-derived conversational/emotional indicator.
This does NOT constitute a clinical, psychiatric, or medical diagnosis.
"""

import os
import re
from typing import Dict, Any

# Pluggable HuggingFace Transformer Model Loader
_hf_emotion_pipeline = None
_hf_attempted = False


def _get_hf_pipeline():
    global _hf_emotion_pipeline, _hf_attempted
    if _hf_attempted:
        return _hf_emotion_pipeline
    _hf_attempted = True

    model_name = os.environ.get("EMOTION_TRANSFORMER_MODEL", "").strip()
    if model_name:
        try:
            from transformers import pipeline
            _hf_emotion_pipeline = pipeline("text-classification", model=model_name, top_k=None)
        except Exception:
            _hf_emotion_pipeline = None
    return _hf_emotion_pipeline


# Calibrated Lexical Emotion Weights for Distress & Emergency Helplines (English / Hindi / Hinglish)
EMOTION_LEXICON = {
    "fear": [
        r"\bfear\b", r"\bafraid\b", r"\bscared\b", r"\bterrified\b", r"\bdarr\b", r"\bdar lag raha\b",
        r"\bthreatened\b", r"\bdhamki\b", r"\bkill\b", r"\bharm\b", r"\bpanic\b", r"\bkaamp\b",
        r"\bhiding\b", r"\bchup gaya\b", r"\bdar gaya\b", r"\bkhauf\b", r"\bhorror\b"
    ],
    "sadness": [
        r"\bsad\b", r"\bcrying\b", r"\bro raha\b", r"\bro rahi\b", r"\bdepressed\b", r"\bhopeless\b",
        r"\blost\b", r"\bhelpless\b", r"\basahay\b", r"\bbroken\b", r"\btut gaya\b", r"\bgrief\b",
        r"\bdukhi\b", r"\balone\b", r"\bakela\b", r"\bakeli\b"
    ],
    "anger": [
        r"\bangry\b", r"\bfurious\b", r"\bgussa\b", r"\boutrage\b", r"\bhate\b", r"\bnafrat\b",
        r"\babuse\b", r"\bgali\b", r"\bshout\b", r"\bcheated\b", r"\bdhoka\b", r"\battack\b"
    ],
    "urgency": [
        r"\bemergency\b", r"\bhurry\b", r"\bjaldi\b", r"\bimmediately\b", r"\bturant\b", r"\bnow\b",
        r"\babhi\b", r"\bdying\b", r"\bbleeding\b", r"\bkhoon\b", r"\bsuffocating\b", r"\bfire\b",
        r"\btrapped\b", r"\bfas gaya\b", r"\bcall police\b", r"\bambulance\b"
    ],
    "distress": [
        r"\bhelp\b", r"\bhelp me\b", r"\bbachao\b", r"\bmadad\b", r"\bsave me\b", r"\bplease\b",
        r"\bcan't take it\b", r"\bsahan nahi hota\b", r"\bpain\b", r"\bdard\b", r"\btorture\b"
    ]
}


def analyze_emotion(text: str) -> Dict[str, Any]:
    """
    Analyzes emotional and sentiment indicators in conversational transcript.
    
    Returns:
    {
        "dominant_emotion": "fear",
        "emotion_scores": {
            "fear": 0.74,
            "sadness": 0.16,
            "anger": 0.07,
            "neutral": 0.03
        },
        "urgency_score": 0.65,
        "distress_score": 0.70,
        "confidence": 0.85,
        "disclaimer": "AI-derived conversational/emotional indicator. Not a medical or psychiatric diagnosis."
    }
    """
    if not text or not text.strip():
        return {
            "dominant_emotion": "neutral",
            "emotion_scores": {"neutral": 0.95, "fear": 0.01, "sadness": 0.02, "anger": 0.02},
            "urgency_score": 0.0,
            "distress_score": 0.0,
            "confidence": 0.95,
            "disclaimer": "AI-derived conversational/emotional indicator. Not a medical or psychiatric diagnosis.",
        }

    # 1. Try Hugging Face Transformer if model configured
    hf_pipe = _get_hf_pipeline()
    if hf_pipe:
        try:
            results = hf_pipe(text[:512])
            # Parse top scores
            if results and isinstance(results[0], list):
                raw_dict = {item["label"].lower(): float(item["score"]) for item in results[0]}
                dominant = max(raw_dict.items(), key=lambda x: x[1])[0]
                return {
                    "dominant_emotion": dominant,
                    "emotion_scores": {k: round(v, 3) for k, v in raw_dict.items()},
                    "confidence": round(float(raw_dict.get(dominant, 0.8)), 3),
                    "disclaimer": "AI-derived conversational/emotional indicator. Not a medical or psychiatric diagnosis.",
                }
        except Exception:
            pass

    # 2. Calibrated Multilingual Distress Classifier
    lower_text = text.lower()
    raw_scores = {"fear": 0.05, "sadness": 0.05, "anger": 0.05, "neutral": 0.20}
    urgency_raw = 0.05
    distress_raw = 0.05

    for category, patterns in EMOTION_LEXICON.items():
        count = 0
        for pat in patterns:
            matches = len(re.findall(pat, lower_text))
            count += matches

        if category == "urgency":
            urgency_raw += count * 0.35
        elif category == "distress":
            distress_raw += count * 0.35
            raw_scores["fear"] += count * 0.25
            raw_scores["sadness"] += count * 0.20
        elif category in raw_scores:
            raw_scores[category] += count * 0.40

    # If any non-neutral distress detected, reduce neutral baseline
    total_distress = (raw_scores["fear"] + raw_scores["sadness"] + raw_scores["anger"] + urgency_raw + distress_raw) - 0.25
    if total_distress > 0.1:
        raw_scores["neutral"] = max(0.02, raw_scores["neutral"] - total_distress * 0.3)

    # Normalize emotion_scores
    score_sum = sum(raw_scores.values())
    norm_scores = {k: round(v / score_sum, 3) for k, v in raw_scores.items()}

    dominant_emotion = max(norm_scores.items(), key=lambda x: x[1])[0]
    confidence = norm_scores[dominant_emotion]

    urgency_score = round(min(1.0, urgency_raw), 3)
    distress_score = round(min(1.0, distress_raw), 3)

    return {
        "dominant_emotion": dominant_emotion,
        "emotion_scores": norm_scores,
        "urgency_score": urgency_score,
        "distress_score": distress_score,
        "confidence": confidence,
        "disclaimer": "AI-derived conversational/emotional indicator. Not a medical or psychiatric diagnosis.",
    }
