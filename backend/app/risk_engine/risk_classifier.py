"""
AI-Assisted Risk Classification Component for NHAA Helpline.
Uses Scikit-learn to classify operational risk levels (LOW, MODERATE, HIGH)
and explains observable contributing features.

IMPORTANT DISCLAIMER:
This model does NOT clinically diagnose trauma, anxiety, depression, PTSD,
or any mental-health or medical condition.
It provides operational AI-assisted risk classification and distress prioritization only.
"""

import os
import joblib
import numpy as np
from typing import Dict, Any, List
from sklearn.ensemble import RandomForestClassifier

MODEL_PATH = os.path.join(os.path.dirname(__file__), "risk_model.joblib")


class RiskClassifier:
    def __init__(self):
        self.model = None
        self._load_or_train()

    def _load_or_train(self):
        """Loads saved Scikit-learn model or trains and persists a calibrated baseline model."""
        if os.path.exists(MODEL_PATH):
            try:
                self.model = joblib.load(MODEL_PATH)
                return
            except Exception:
                pass

        # Train a robust baseline Random Forest Classifier on multimodal vectors
        # 15 features:
        # [0] rms_energy, [1] pause_ratio, [2] speech_rate_norm, [3] pitch_variation
        # [4] fear_score, [5] sadness_score, [6] anger_score, [7] urgency_score, [8] distress_score
        # [9] threat, [10] violence, [11] urgency, [12] harassment, [13] danger, [14] vulnerability
        np.random.seed(42)
        X_train = []
        y_train = []

        # Synthetic calibration points for emergency helpline triage
        # LOW risk (0)
        for _ in range(120):
            vec = [
                np.random.uniform(0.01, 0.08), np.random.uniform(0.1, 0.3), np.random.uniform(0.3, 0.6), np.random.uniform(0.05, 0.2),
                np.random.uniform(0.0, 0.2), np.random.uniform(0.0, 0.2), np.random.uniform(0.0, 0.15), np.random.uniform(0.0, 0.2), np.random.uniform(0.0, 0.2),
                0.0, 0.0, 0.0, 0.0, 0.0, float(np.random.choice([0, 1], p=[0.8, 0.2]))
            ]
            X_train.append(vec)
            y_train.append(0)

        # MODERATE risk (1)
        for _ in range(120):
            vec = [
                np.random.uniform(0.04, 0.12), np.random.uniform(0.2, 0.45), np.random.uniform(0.4, 0.8), np.random.uniform(0.15, 0.35),
                np.random.uniform(0.2, 0.5), np.random.uniform(0.2, 0.55), np.random.uniform(0.1, 0.4), np.random.uniform(0.2, 0.5), np.random.uniform(0.25, 0.6),
                float(np.random.choice([0, 1], p=[0.7, 0.3])),
                0.0,
                float(np.random.choice([0, 1], p=[0.5, 0.5])),
                float(np.random.choice([0, 1], p=[0.6, 0.4])),
                0.0,
                float(np.random.choice([0, 1], p=[0.5, 0.5]))
            ]
            X_train.append(vec)
            y_train.append(1)

        # HIGH risk (2)
        for _ in range(120):
            vec = [
                np.random.uniform(0.08, 0.25), np.random.uniform(0.05, 0.5), np.random.uniform(0.6, 1.0), np.random.uniform(0.25, 0.6),
                np.random.uniform(0.5, 0.95), np.random.uniform(0.3, 0.85), np.random.uniform(0.3, 0.9), np.random.uniform(0.6, 0.98), np.random.uniform(0.6, 0.98),
                float(np.random.choice([0, 1], p=[0.2, 0.8])),
                float(np.random.choice([0, 1], p=[0.3, 0.7])),
                float(np.random.choice([0, 1], p=[0.1, 0.9])),
                float(np.random.choice([0, 1], p=[0.4, 0.6])),
                float(np.random.choice([0, 1], p=[0.3, 0.7])),
                float(np.random.choice([0, 1], p=[0.4, 0.6]))
            ]
            X_train.append(vec)
            y_train.append(2)

        clf = RandomForestClassifier(n_estimators=40, max_depth=6, random_state=42)
        clf.fit(np.array(X_train), np.array(y_train))
        self.model = clf
        try:
            joblib.dump(clf, MODEL_PATH)
        except Exception:
            pass

    def classify_multimodal(self, fused_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Classifies risk level and produces observable feature explanation.
        """
        vec = fused_data.get("feature_vector", [])
        names = fused_data.get("feature_names", [])
        structured = fused_data.get("structured", {})

        if len(vec) < 15 or self.model is None:
            return self._heuristic_fallback(fused_data)

        X = np.array([vec])
        pred_class = int(self.model.predict(X)[0])  # 0=LOW, 1=MODERATE, 2=HIGH
        probs = self.model.predict_proba(X)[0]

        # Rule overrides for critical safety thresholds (Human safety priority)
        incident_flags = structured.get("incident", {})
        if incident_flags.get("immediate_danger") or (incident_flags.get("threat_detected") and incident_flags.get("violence_detected")):
            pred_class = 2  # Promote to HIGH
            probs = np.array([0.05, 0.15, 0.80])

        levels = {0: "LOW", 1: "MODERATE", 2: "HIGH"}
        risk_level = levels.get(pred_class, "MODERATE")

        # Continuous risk score 0.0 - 1.0 (weighted probability)
        risk_score = round(float(probs[1] * 0.5 + probs[2] * 1.0), 3)

        # Compute Observable Feature Contributions
        contributions = self._compute_feature_contributions(vec, names, structured)

        # Generate Explainable Summary
        explanation = self._build_explanation(risk_level, contributions, structured)

        # Operational Action Guidance
        if risk_level == "HIGH":
            recommended_action = "Immediate Operator Priority Escalation; notify Emergency Nodal Officer; verify caller safety coordinates."
        elif risk_level == "MODERATE":
            recommended_action = "Assigned to Senior Helpline Operator; review historical incident pattern; provide guided de-escalation."
        else:
            recommended_action = "Standard case triage; register citizen grievance; provide institutional helpline guidance."

        return {
            "risk_level": risk_level,
            "risk_score": risk_score,
            "probabilities": {
                "low": round(float(probs[0]), 3),
                "moderate": round(float(probs[1]), 3),
                "high": round(float(probs[2]), 3),
            },
            "feature_contributions": contributions,
            "explanation": explanation,
            "recommended_action": recommended_action,
            "disclaimer": "AI-assisted risk classification & case prioritization only. Not a medical or mental-health diagnosis.",
        }

    def _compute_feature_contributions(self, vec: List[float], names: List[str], structured: Dict[str, Any]) -> List[Dict[str, Any]]:
        contributions = []

        incident = structured.get("incident", {})
        emotion = structured.get("emotion", {})
        acoustic = structured.get("acoustic", {})

        if incident.get("immediate_danger"):
            contributions.append({"feature": "Immediate Danger Signals", "impact": "High Positive", "weight": 0.35})
        if incident.get("threat_detected"):
            contributions.append({"feature": "Explicit Threat Language", "impact": "High Positive", "weight": 0.25})
        if incident.get("violence_detected"):
            contributions.append({"feature": "Physical Violence / Weapon Reference", "impact": "High Positive", "weight": 0.20})
        if incident.get("urgency_detected"):
            contributions.append({"feature": "Urgent Time Distress Markers", "impact": "Moderate Positive", "weight": 0.15})
        if emotion.get("fear_score", 0.0) > 0.4:
            contributions.append({"feature": f"Elevated Fear/Panic Cue ({emotion.get('fear_score')})", "impact": "Moderate Positive", "weight": 0.12})
        if acoustic.get("speech_rate", 0.0) > 3.2:
            contributions.append({"feature": f"Rapid Speech Rate ({acoustic.get('speech_rate')} wps)", "impact": "Low Positive", "weight": 0.08})
        if acoustic.get("pause_ratio", 0.0) > 0.35:
            contributions.append({"feature": f"Prolonged Hesitation / Pauses ({round(acoustic.get('pause_ratio')*100)}%)", "impact": "Low Positive", "weight": 0.06})

        if not contributions:
            contributions.append({"feature": "Calm Vocal Baseline & No Active Threat Language", "impact": "Neutral / Stabilizing", "weight": 0.10})

        return contributions

    def _build_explanation(self, level: str, contributions: List[Dict[str, Any]], structured: Dict[str, Any]) -> str:
        features_str = ", ".join([c["feature"] for c in contributions[:3]])
        return (
            f"Case triaged as {level} Risk based on observable features: {features_str}. "
            f"Dominant conversational emotion identified as '{structured.get('emotion', {}).get('dominant_emotion', 'neutral')}'. "
            f"Decision support assistance is actively engaged for human operator review."
        )

    def _heuristic_fallback(self, fused_data: Dict[str, Any]) -> Dict[str, Any]:
        incident = fused_data.get("structured", {}).get("incident", {})
        if incident.get("immediate_danger") or incident.get("threat_detected"):
            level = "HIGH"
            score = 0.85
        elif incident.get("urgency_detected") or incident.get("violence_detected"):
            level = "MODERATE"
            score = 0.55
        else:
            level = "LOW"
            score = 0.15

        return {
            "risk_level": level,
            "risk_score": score,
            "feature_contributions": [{"feature": "Heuristic Rule Evaluation", "impact": "Positive", "weight": 0.5}],
            "explanation": f"Categorized as {level} based on keyword rule baseline.",
            "recommended_action": "Standard operator review.",
            "disclaimer": "AI-assisted risk classification & case prioritization only. Not a medical diagnosis.",
        }


# Singleton instance
risk_engine = RiskClassifier()
