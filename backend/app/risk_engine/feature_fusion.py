"""
Multimodal Feature Fusion Engine for NHAA Platform.
Combines Acoustic, NLP, Emotion, and Incident Indicators into a unified feature vector.

Do not allow the LLM alone to produce the final numerical risk score.
"""

from typing import Dict, Any, List
import numpy as np


def fuse_multimodal_features(
    acoustic: Dict[str, Any],
    nlp: Dict[str, Any],
    emotion: Dict[str, Any],
    incident: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Combines:
      A. Acoustic features (RMS, pause ratio, speech rate, pitch variation, ZCR)
      B. NLP features (entity counts, tokens, incident type)
      C. Emotion features (fear, sadness, anger, urgency, distress)
      D. Incident indicators (threat, violence, urgency, danger, harassment, vulnerability)
    into a structured dictionary and flattened numerical vector.
    """
    # 1. Structured Output
    structured = {
        "acoustic": {
            "rms_energy": float(acoustic.get("rms_energy", 0.0) or 0.0),
            "pause_ratio": float(acoustic.get("pause_ratio", 0.0) or 0.0),
            "speech_rate": float(acoustic.get("speech_rate", 0.0) or 0.0),
            "pitch_variation": float(acoustic.get("pitch_variation", 0.0) or 0.0),
            "zero_crossing_rate": float(acoustic.get("zero_crossing_rate", 0.0) or 0.0),
            "speech_duration": float(acoustic.get("speech_duration", 0.0) or 0.0),
        },
        "nlp": {
            "persons_count": len(nlp.get("persons", []) or []),
            "locations_count": len(nlp.get("locations", []) or []),
            "time_references_count": len(nlp.get("time_references", []) or []),
            "tokens_count": int(nlp.get("tokens_count", 0) or 0),
            "incident_type": str(nlp.get("incident_type", "general_assistance")),
        },
        "emotion": {
            "dominant_emotion": str(emotion.get("dominant_emotion", "neutral")),
            "fear_score": float(emotion.get("emotion_scores", {}).get("fear", 0.0) or 0.0),
            "sadness_score": float(emotion.get("emotion_scores", {}).get("sadness", 0.0) or 0.0),
            "anger_score": float(emotion.get("emotion_scores", {}).get("anger", 0.0) or 0.0),
            "urgency_score": float(emotion.get("urgency_score", 0.0) or 0.0),
            "distress_score": float(emotion.get("distress_score", 0.0) or 0.0),
        },
        "incident": {
            "threat_detected": bool(incident.get("threat_detected", False)),
            "violence_detected": bool(incident.get("violence_detected", False)),
            "urgency_detected": bool(incident.get("urgency_detected", False)),
            "repeated_harassment": bool(incident.get("repeated_harassment", False)),
            "immediate_danger": bool(incident.get("immediate_danger", False)),
            "vulnerability_detected": bool(incident.get("vulnerability_detected", False)),
        },
    }

    # 2. Numerical Feature Vector for Scikit-Learn Model
    # Order:
    # [0] rms_energy, [1] pause_ratio, [2] speech_rate, [3] pitch_variation
    # [4] fear_score, [5] sadness_score, [6] anger_score, [7] urgency_score, [8] distress_score
    # [9] threat, [10] violence, [11] urgency, [12] harassment, [13] danger, [14] vulnerability
    vector = [
        structured["acoustic"]["rms_energy"],
        structured["acoustic"]["pause_ratio"],
        min(structured["acoustic"]["speech_rate"] / 5.0, 1.0),
        structured["acoustic"]["pitch_variation"],
        structured["emotion"]["fear_score"],
        structured["emotion"]["sadness_score"],
        structured["emotion"]["anger_score"],
        structured["emotion"]["urgency_score"],
        structured["emotion"]["distress_score"],
        1.0 if structured["incident"]["threat_detected"] else 0.0,
        1.0 if structured["incident"]["violence_detected"] else 0.0,
        1.0 if structured["incident"]["urgency_detected"] else 0.0,
        1.0 if structured["incident"]["repeated_harassment"] else 0.0,
        1.0 if structured["incident"]["immediate_danger"] else 0.0,
        1.0 if structured["incident"]["vulnerability_detected"] else 0.0,
    ]

    return {
        "structured": structured,
        "feature_vector": vector,
        "feature_names": [
            "rms_energy", "pause_ratio", "speech_rate_norm", "pitch_variation",
            "fear_score", "sadness_score", "anger_score", "urgency_score", "distress_score",
            "threat_detected", "violence_detected", "urgency_detected", "repeated_harassment",
            "immediate_danger", "vulnerability_detected"
        ]
    }
