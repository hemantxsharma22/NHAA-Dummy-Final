"""
Comprehensive Test Suite for NHAA AI Case Intelligence Platform Modules.
Validates Audio Calibration, Acoustic Extraction, spaCy NLP, Emotion Analysis,
Multimodal Fusion, Scikit-Learn Risk Classification, TF-IDF Precedent Matching,
and JWT Authentication.
"""

import os
import sys
import numpy as np

# Ensure backend root is in path
sys.path.insert(0, os.path.dirname(__file__))

from app.audio_intelligence.calibration import calibrate_audio_buffer
from app.audio_intelligence.acoustic_features import extract_acoustic_features
from app.nlp_intelligence.spacy_extractor import extract_nlp_entities
from app.nlp_intelligence.emotion_classifier import analyze_emotion
from app.nlp_intelligence.case_indicators import extract_case_indicators
from app.risk_engine.feature_fusion import fuse_multimodal_features
from app.risk_engine.risk_classifier import risk_engine
from app.ai_engine_1.gemini_assistant import generate_case_intelligence
from app.ai_engine_2.engine2_analytics import match_semantic_precedents
from app.auth.security import hash_password, verify_password, create_access_token, decode_access_token
from app.database import Base, engine, SessionLocal
from app.models.nhaa_models import User, Case, Complaint


def test_audio_calibration():
    print("\n[TEST 1] Testing Audio Quality & Calibration...")
    # Generate synthetic 16kHz sine wave audio
    sr = 16000
    t = np.linspace(0, 1.5, int(sr * 1.5))
    tone = 0.3 * np.sin(2 * np.pi * 440 * t)
    noise = 0.01 * np.random.normal(0, 1, len(t))
    signal = tone + noise

    res = calibrate_audio_buffer(signal, sr)
    assert res["audio_quality"] in ("good", "fair", "poor"), f"Unexpected quality: {res['audio_quality']}"
    assert "noise_level" in res
    assert "speech_detected" in res
    assert "clipping_detected" in res
    assert "speech_ratio" in res
    assert "disclaimer" in res
    print(f"  -> Audio Quality: {res['audio_quality']}, Noise: {res['noise_level']}, Speech Ratio: {res['speech_ratio']}")
    print("  [OK] Audio calibration passed.")


def test_acoustic_features():
    print("\n[TEST 2] Testing Acoustic Speech Features...")
    sr = 16000
    t = np.linspace(0, 2.0, int(sr * 2.0))
    signal = 0.2 * np.sin(2 * np.pi * 300 * t)

    features = extract_acoustic_features(signal, sr, transcript_word_count=5)
    assert "speech_duration" in features
    assert "pause_ratio" in features
    assert "rms_energy" in features
    assert "speech_rate" in features
    assert "pitch_variation" in features
    assert "disclaimer" in features
    print(f"  -> Duration: {features['speech_duration']}s, RMS: {features['rms_energy']}, Speech Rate: {features['speech_rate']}")
    print("  [OK] Acoustic features extraction passed.")


def test_spacy_nlp_extraction():
    print("\n[TEST 3] Testing spaCy NLP & Entity Extraction...")
    sample_text = "Rohit threatened me near my college yesterday."
    res = extract_nlp_entities(sample_text)

    print(f"  -> Extracted: {res}")
    assert "persons" in res
    assert "locations" in res
    assert "time_references" in res
    assert "incident_type" in res
    assert res["incident_type"] == "threat", f"Expected 'threat', got {res['incident_type']}"
    assert "yesterday" in [t.lower() for t in res["time_references"]]
    assert any("college" in l.lower() for l in res["locations"])
    print("  [OK] spaCy NLP extraction passed.")


def test_emotion_analysis():
    print("\n[TEST 4] Testing Sentiment / Emotion Analysis...")
    sample_text = "I am terrified, please help me immediately! Someone is trying to break in."
    res = analyze_emotion(sample_text)

    print(f"  -> Dominant: {res['dominant_emotion']}, Scores: {res['emotion_scores']}")
    assert res["dominant_emotion"] in ("fear", "distress", "urgency", "sadness", "anger", "neutral")
    assert "emotion_scores" in res
    assert "disclaimer" in res
    print("  [OK] Emotion analysis passed.")


def test_multimodal_fusion_and_risk_classification():
    print("\n[TEST 5] Testing Multimodal Feature Fusion & Scikit-learn Risk Classifier...")
    sample_text = "He has a knife outside my door right now, I am terrified and locked inside!"

    acoustics = {"rms_energy": 0.18, "pause_ratio": 0.22, "speech_rate": 3.8, "pitch_variation": 0.35}
    nlp_res = extract_nlp_entities(sample_text)
    emotion_res = analyze_emotion(sample_text)
    indicators = extract_case_indicators(sample_text)

    fused = fuse_multimodal_features(acoustics, nlp_res, emotion_res, indicators)
    assert len(fused["feature_vector"]) == 15, f"Expected 15 features, got {len(fused['feature_vector'])}"

    risk_output = risk_engine.classify_multimodal(fused)
    print(f"  -> Risk Level: {risk_output['risk_level']}, Score: {risk_output['risk_score']}")
    print(f"  -> Explanation: {risk_output['explanation']}")
    print(f"  -> Contributions: {risk_output['feature_contributions']}")

    assert risk_output["risk_level"] in ("LOW", "MODERATE", "HIGH")
    assert "disclaimer" in risk_output
    assert len(risk_output["feature_contributions"]) > 0
    print("  [OK] Multimodal feature fusion & Scikit-learn risk classification passed.")


def test_historical_case_matching():
    print("\n[TEST 6] Testing TF-IDF Historical Case Matching...")
    query_text = "Armed trespasser outside home threatening violence with a knife over property dispute"
    matches = match_semantic_precedents(query_text, "Sant Kabir Nagar", top_k=3)

    assert len(matches) > 0, "No historical matches found"
    best = matches[0]
    print(f"  -> Top Match: {best['caseId']} ({best['similarityScore']}%) - {best['title']}")
    print(f"  -> Matching Terms: {best['matchingTerms']}")
    print(f"  -> Short Summary: {best['shortSummary'][:80]}...")
    assert "caseId" in best
    assert "similarityScore" in best
    assert "category" in best
    assert "shortSummary" in best
    assert "matchingTerms" in best
    print("  [OK] TF-IDF historical case matching passed.")


def test_gemini_intelligence():
    print("\n[TEST 7] Testing Gemini AI Assistant Integration / Fallback...")
    narrative = "Someone has been following me from the metro station to my house every evening."
    intel = generate_case_intelligence(narrative, indicators=["Repeated Harassment"], emotion="fear", risk_level="MODERATE")

    print(f"  -> Summary: {intel['case_summary']}")
    print(f"  -> Suggested Questions: {intel['recommended_questions']}")
    assert "case_summary" in intel
    assert "recommended_questions" in intel
    assert len(intel["recommended_questions"]) >= 2
    assert "disclaimer" in intel
    print("  [OK] Gemini AI assistance passed.")


def test_jwt_auth_and_rbac():
    print("\n[TEST 8] Testing JWT Authentication & RBAC...")
    raw_pw = "SafeSecretPassword123"
    hashed = hash_password(raw_pw)
    assert verify_password(raw_pw, hashed)
    assert not verify_password("WrongPassword", hashed)

    token = create_access_token({"sub": "test_officer", "role": "Officer", "id": 42})
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "test_officer"
    assert payload["role"] == "Officer"
    print("  [OK] Password hashing and JWT generation passed.")


def test_database_persistence():
    print("\n[TEST 9] Testing Database Schema & ORM Relationships...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        test_case_id = "TEST-CASE-9999"
        existing = db.query(Case).filter(Case.case_id == test_case_id).first()
        if existing:
            db.delete(existing)
            db.commit()

        c = Case(
            case_id=test_case_id,
            category="Test Emergency",
            status="OPEN",
            priority="HIGH",
            risk_level="HIGH",
            risk_score=0.88,
            title="Test Emergency Case",
            description="Test description",
            district="Central",
        )
        db.add(c)
        db.commit()
        db.refresh(c)

        comp = Complaint(
            complaint_code="TEST-CMP-9999",
            case_id=c.id,
            channel="voice",
            narrative="Test narrative",
        )
        db.add(comp)
        db.commit()

        fetched = db.query(Case).filter(Case.case_id == test_case_id).first()
        assert fetched is not None
        assert len(fetched.complaints) == 1
        assert fetched.complaints[0].complaint_code == "TEST-CMP-9999"
        print(f"  -> Case {fetched.case_id} persisted with {len(fetched.complaints)} complaint.")

        # Cleanup test record
        db.delete(fetched)
        db.commit()
        print("  [OK] Database schema and relationships verified.")
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 60)
    print("NHAA PLATFORM AUTOMATED TEST SUITE")
    print("=" * 60)

    test_audio_calibration()
    test_acoustic_features()
    test_spacy_nlp_extraction()
    test_emotion_analysis()
    test_multimodal_fusion_and_risk_classification()
    test_historical_case_matching()
    test_gemini_intelligence()
    test_jwt_auth_and_rbac()
    test_database_persistence()

    print("\n" + "=" * 60)
    print("ALL 9 TEST SUITES PASSED SUCCESSFULLY (100% PASS RATE)")
    print("=" * 60)
