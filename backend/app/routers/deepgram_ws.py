"""
Deepgram Real-Time STT & Multimodal Case Intelligence WebSocket Router.

Architecture:
  Client (Flutter / Web) Microphone Stream → FastAPI WebSocket Proxy → Deepgram WS
  Deepgram Real-time Streaming STT (Nova-2 with Diarization & VAD events)
  ↓
  Audio Calibration & Acoustic Features (NumPy & Librosa)
  ↓
  NLP Entity Extraction (spaCy) + Conversational Emotion Analysis + Case Indicators
  ↓
  Multimodal Feature Fusion → Scikit-learn Risk Classification (LOW / MODERATE / HIGH)
  ↓
  Gemini AI Case Intelligence (Summary & Suggested Questions)
  ↓
  Historical Precedent Matching (TF-IDF & Cosine Similarity)
  ↓
  Real-Time Streaming to Operator Console & SQLite DB Persistence
"""

import asyncio
import json
import logging
import time
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ai_engine_1.deepgram_client import (
    create_deepgram_connection,
    parse_deepgram_response,
    close_deepgram_connection,
    DeepgramStreamError,
)
import app.ai_engine_1 as engine1
from app.ai_engine_1.session_manager import get_session
from app.audio_intelligence.calibration import calibrate_audio_buffer
from app.audio_intelligence.acoustic_features import extract_acoustic_features
from app.nlp_intelligence.spacy_extractor import extract_nlp_entities
from app.nlp_intelligence.emotion_classifier import analyze_emotion
from app.nlp_intelligence.case_indicators import extract_case_indicators
from app.risk_engine.feature_fusion import fuse_multimodal_features
from app.risk_engine.risk_classifier import risk_engine
from app.ai_engine_1.gemini_assistant import generate_case_intelligence
from app.ai_engine_2.engine2_analytics import match_semantic_precedents
from app.database import SessionLocal
from app.models.nhaa_models import (
    Transcript,
    TranscriptSegment,
    AudioAssessment,
    EmotionResult,
    NLPResult,
    RiskAssessment,
)

logger = logging.getLogger("router.deepgram_ws")
router = APIRouter(tags=["Deepgram WebSocket & Voice Pipeline"])


async def handle_deepgram_session(websocket: WebSocket, session_id: str, language: str = "hi-IN"):
    await websocket.accept()

    state = get_session(session_id)
    # If session state doesn't exist yet, auto-initialize so client can connect directly
    if state is None:
        try:
            engine1.start_session(session_id, operator_name="Helpline Operator", district="Central Control")
            state = get_session(session_id)
        except Exception:
            pass

    deepgram_ws = None
    try:
        deepgram_ws = await create_deepgram_connection(language=language)
    except DeepgramStreamError as e:
        error_msg = str(e)
        logger.error("Deepgram connection error for session %s: %s", session_id, error_msg)
        await websocket.send_json({"type": "error", "message": error_msg})
        await websocket.close(code=4001, reason="Deepgram connection failed")
        return
    except Exception as e:
        logger.error("Unexpected error connecting to Deepgram: %s", e)
        await websocket.send_json({"type": "error", "message": f"Failed to connect to Deepgram: {e}"})
        await websocket.close(code=4001, reason="Deepgram connection failed")
        return

    # Broadcast initial connection and initial audio calibration status
    initial_calib = calibrate_audio_buffer(b"", 16000)
    await websocket.send_json({
        "type": "connected",
        "message": "Deepgram streaming STT & Multimodal Pipeline active",
        "vad_state": "LISTENING",
        "audio_calibration": initial_calib,
    })

    # In-memory buffer for audio calibration and running transcript
    audio_buffer_bytes = bytearray()
    full_transcript_list = []
    last_calibration_time = time.time()
    last_vad_state = "LISTENING"

    async def relay_deepgram_to_client():
        nonlocal last_vad_state
        db_session = SessionLocal()
        try:
            async for message in deepgram_ws:
                parsed = parse_deepgram_response(message)

                if parsed["type"] == "transcript":
                    transcript_text = parsed.get("transcript", "")
                    is_final = parsed.get("is_final", False)
                    speaker_label = parsed.get("speaker", "Citizen")

                    if not is_final:
                        # Interim live caption
                        if transcript_text:
                            last_vad_state = "SPEAKING"
                            await websocket.send_json({
                                "type": "interim",
                                "text": transcript_text,
                                "speaker": speaker_label,
                                "vad_state": "SPEAKING",
                                "is_final": False,
                                "timestamp": round(time.time(), 2),
                            })
                    else:
                        # Final transcript segment
                        if transcript_text.strip():
                            last_vad_state = "PROCESSING"
                            full_transcript_list.append(f"{speaker_label}: {transcript_text.strip()}")
                            accumulated_transcript = " ".join(full_transcript_list)

                            # 1. Audio Quality Calibration & Acoustic Features from recent buffer
                            calib = calibrate_audio_buffer(bytes(audio_buffer_bytes[-64000:]), 16000)
                            acoustics = extract_acoustic_features(
                                bytes(audio_buffer_bytes[-64000:]),
                                16000,
                                transcript_word_count=len(transcript_text.split()),
                            )

                            # 2. NLP Pipeline (spaCy NER & Linguistic Features)
                            nlp_res = extract_nlp_entities(accumulated_transcript)

                            # 3. Emotion / Sentiment Analysis
                            emotion_res = analyze_emotion(accumulated_transcript)

                            # 4. Text-Based Case Indicators
                            indicators_res = extract_case_indicators(accumulated_transcript)

                            # 5. Multimodal Feature Fusion
                            fused = fuse_multimodal_features(acoustics, nlp_res, emotion_res, indicators_res)

                            # 6. Scikit-learn Risk Classification
                            risk_res = risk_engine.classify_multimodal(fused)

                            # 7. Historical Case Intelligence (TF-IDF + Cosine Similarity)
                            district_name = "Central District"
                            hist_matches = match_semantic_precedents(accumulated_transcript, district_name, top_k=3)

                            # 8. Gemini AI Assistant (Summary & Recommended Questions)
                            gemini_intel = generate_case_intelligence(
                                accumulated_transcript,
                                indicators=indicators_res["matched_indicators"],
                                emotion=emotion_res["dominant_emotion"],
                                risk_level=risk_res["risk_level"],
                            )

                            # 9. Legacy SVI state update for backward compatibility
                            try:
                                legacy_result = engine1.process_text_segment(
                                    session_id=session_id,
                                    text=transcript_text.strip(),
                                    chunk_duration_seconds=parsed.get("duration", 3.5) or 3.5,
                                    stt_source="deepgram_realtime",
                                )
                            except Exception:
                                legacy_result = {}

                            # 10. Persist to Database asynchronously
                            try:
                                seg = TranscriptSegment(
                                    session_id=session_id,
                                    speaker=speaker_label,
                                    text=transcript_text.strip(),
                                    is_final=True,
                                    confidence=float(parsed.get("confidence", 0.95)),
                                    start_time=float(parsed.get("start", 0.0)),
                                    end_time=float(parsed.get("start", 0.0) + parsed.get("duration", 0.0)),
                                )
                                db_session.add(seg)

                                a_assess = AudioAssessment(
                                    session_id=session_id,
                                    audio_quality=calib["audio_quality"],
                                    noise_level=calib["noise_level"],
                                    speech_detected=calib["speech_detected"],
                                    clipping_detected=calib["clipping_detected"],
                                    speech_ratio=calib["speech_ratio"],
                                    snr_db=calib["snr_db"],
                                    duration_seconds=calib["duration_seconds"],
                                    rms_energy=acoustics["rms_energy"],
                                    pause_ratio=acoustics["pause_ratio"],
                                    speech_rate=acoustics["speech_rate"],
                                    pitch_variation=acoustics["pitch_variation"],
                                )
                                db_session.add(a_assess)

                                e_assess = EmotionResult(
                                    session_id=session_id,
                                    dominant_emotion=emotion_res["dominant_emotion"],
                                    confidence=emotion_res["confidence"],
                                    fear_score=emotion_res["emotion_scores"].get("fear", 0.0),
                                    sadness_score=emotion_res["emotion_scores"].get("sadness", 0.0),
                                    anger_score=emotion_res["emotion_scores"].get("anger", 0.0),
                                    neutral_score=emotion_res["emotion_scores"].get("neutral", 0.0),
                                    urgency_score=emotion_res["urgency_score"],
                                    distress_score=emotion_res["distress_score"],
                                    emotion_scores_json=json.dumps(emotion_res["emotion_scores"]),
                                )
                                db_session.add(e_assess)

                                nlp_record = NLPResult(
                                    session_id=session_id,
                                    persons_json=json.dumps(nlp_res["persons"]),
                                    locations_json=json.dumps(nlp_res["locations"]),
                                    time_references_json=json.dumps(nlp_res["time_references"]),
                                    organizations_json=json.dumps(nlp_res["organizations"]),
                                    incident_type=nlp_res["incident_type"],
                                    tokens_count=nlp_res["tokens_count"],
                                )
                                db_session.add(nlp_record)

                                risk_record = RiskAssessment(
                                    session_id=session_id,
                                    risk_level=risk_res["risk_level"],
                                    risk_score=risk_res["risk_score"],
                                    threat_detected=indicators_res["threat_detected"],
                                    violence_detected=indicators_res["violence_detected"],
                                    urgency_detected=indicators_res["urgency_detected"],
                                    immediate_danger=indicators_res["immediate_danger"],
                                    fused_features_json=json.dumps(fused["structured"]),
                                    feature_contributions_json=json.dumps(risk_res["feature_contributions"]),
                                    explanation=risk_res["explanation"],
                                    recommended_action=risk_res["recommended_action"],
                                )
                                db_session.add(risk_record)
                                db_session.commit()
                            except Exception as db_err:
                                db_session.rollback()
                                logger.debug("DB segment save: %s", db_err)

                            # 11. Send comprehensive payload to Operator Console
                            await websocket.send_json({
                                "type": "final",
                                "text": transcript_text.strip(),
                                "speaker": speaker_label,
                                "is_final": True,
                                "vad_state": "LISTENING",
                                "timestamp": round(time.time(), 2),
                                "full_transcript": accumulated_transcript,
                                # Audio Calibration & Voice Features
                                "audio_quality": {
                                    "quality": calib["audio_quality"].upper(),
                                    "noise_level": calib["noise_level"].upper(),
                                    "speech_detected": "YES" if calib["speech_detected"] else "NO",
                                    "clipping_detected": calib["clipping_detected"],
                                    "speech_ratio": calib["speech_ratio"],
                                    "snr_db": calib["snr_db"],
                                },
                                "voice_features": {
                                    "speech_rate": acoustics["speech_rate"],
                                    "pause_ratio": acoustics["pause_ratio"],
                                    "rms_energy": acoustics["rms_energy"],
                                    "pitch_variation": acoustics["pitch_variation"],
                                },
                                # NLP & Emotion Indicators
                                "nlp_entities": nlp_res,
                                "emotion_indicators": {
                                    "dominant": emotion_res["dominant_emotion"].upper(),
                                    "confidence": emotion_res["confidence"],
                                    "scores": emotion_res["emotion_scores"],
                                },
                                # Case Indicators
                                "case_indicators": {
                                    "threat": "Detected" if indicators_res["threat_detected"] else "Not Detected",
                                    "violence": "Detected" if indicators_res["violence_detected"] else "Not Detected",
                                    "urgency": "Detected" if indicators_res["urgency_detected"] else "Not Detected",
                                    "immediate_danger": "Detected" if indicators_res["immediate_danger"] else "Not Detected",
                                    "matched_indicators": indicators_res["matched_indicators"],
                                    "requested_help": indicators_res["requested_help"],
                                },
                                # AI-Assisted Risk
                                "ai_assisted_risk": {
                                    "level": risk_res["risk_level"],
                                    "score": risk_res["risk_score"],
                                    "feature_contributions": risk_res["feature_contributions"],
                                    "explanation": risk_res["explanation"],
                                    "recommended_action": risk_res["recommended_action"],
                                    "disclaimer": risk_res["disclaimer"],
                                },
                                # Historical Precedents
                                "similar_historical_cases": hist_matches,
                                # Gemini AI Assistance
                                "ai_assistance": {
                                    "summary": gemini_intel["case_summary"],
                                    "suggested_questions": gemini_intel["recommended_questions"],
                                    "key_facts": gemini_intel.get("key_facts", []),
                                    "incident_type": gemini_intel.get("incident_type", "general"),
                                },
                                **legacy_result,
                            })

                elif parsed["type"] == "error":
                    await websocket.send_json({
                        "type": "error",
                        "message": parsed.get("error", "Deepgram streaming error"),
                    })

        except Exception as e:
            if "close" not in str(e).lower() and "1000" not in str(e):
                logger.error("Deepgram relay loop exception: %s", e)
        finally:
            db_session.close()

    relay_task = asyncio.create_task(relay_deepgram_to_client())

    try:
        while True:
            data = await websocket.receive()

            if data.get("type") == "websocket.disconnect":
                break

            # Binary audio bytes from client MediaRecorder / mic stream
            if "bytes" in data and data["bytes"]:
                chunk_bytes = data["bytes"]
                audio_buffer_bytes.extend(chunk_bytes)
                if len(audio_buffer_bytes) > 256000:
                    audio_buffer_bytes = audio_buffer_bytes[-256000:]

                # Periodic calibration update every 3.5 seconds during live streaming
                now = time.time()
                if now - last_calibration_time > 3.5:
                    last_calibration_time = now
                    calib = calibrate_audio_buffer(bytes(audio_buffer_bytes[-48000:]), 16000)
                    await websocket.send_json({
                        "type": "audio_calibration_update",
                        "audio_quality": {
                            "quality": calib["audio_quality"].upper(),
                            "noise_level": calib["noise_level"].upper(),
                            "speech_detected": "YES" if calib["speech_detected"] else "NO",
                            "speech_ratio": calib["speech_ratio"],
                            "snr_db": calib["snr_db"],
                        },
                        "vad_state": "SPEAKING" if calib["speech_detected"] else "SILENCE",
                    })

                try:
                    await deepgram_ws.send(chunk_bytes)
                except Exception as e:
                    logger.error("Error forwarding audio to Deepgram: %s", e)
                    await websocket.send_json({
                        "type": "error",
                        "message": "Deepgram streaming connection interrupted.",
                    })
                    break

            elif "text" in data and data["text"]:
                try:
                    msg = json.loads(data["text"])
                    if msg.get("type") == "stop":
                        break
                    elif msg.get("type") == "calibrate":
                        calib = calibrate_audio_buffer(bytes(audio_buffer_bytes[-48000:]), 16000)
                        await websocket.send_json({"type": "calibration_result", "data": calib})
                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        logger.info("Client WebSocket disconnected for session %s", session_id)
    except Exception as e:
        logger.error("WebSocket error for session %s: %s", session_id, e)
    finally:
        relay_task.cancel()
        try:
            await relay_task
        except (asyncio.CancelledError, Exception):
            pass

        if deepgram_ws:
            await close_deepgram_connection(deepgram_ws)
        logger.info("Voice pipeline session finished for session %s", session_id)


@router.websocket("/api/deepgram/ws/{session_id}")
async def deepgram_ws_route1(websocket: WebSocket, session_id: str, language: str = "hi-IN"):
    await handle_deepgram_session(websocket, session_id, language)


@router.websocket("/api/sessions/{session_id}/ws")
async def deepgram_ws_route2(websocket: WebSocket, session_id: str, language: str = "hi-IN"):
    await handle_deepgram_session(websocket, session_id, language)
