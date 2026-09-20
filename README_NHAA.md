# NHAA AI Case Intelligence Platform (SIH26093)

An AI-assisted case intelligence and emergency decision-support platform engineered for the **National Helpline & Assistance Administration (NHAA)** supporting **Citizen, Operator, Officer, and Admin** workflows.

---

## A. Files Created

### 1. Database Architecture & Models
- [`backend/app/models/nhaa_models.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/models/nhaa_models.py): Complete SQLAlchemy models for `users`, `officers`, `cases`, `complaints`, `transcripts`, `transcript_segments`, `audio_assessments`, `emotion_results`, `nlp_results`, `risk_assessments`, `historical_cases`, `similar_cases`, and `audit_logs`.

### 2. Audio Quality & Acoustic Analysis
- [`backend/app/audio_intelligence/__init__.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/audio_intelligence/__init__.py): Module exports.
- [`backend/app/audio_intelligence/calibration.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/audio_intelligence/calibration.py): Audio quality, dynamic noise floor, SNR, clipping detection, and silence ratio analysis.
- [`backend/app/audio_intelligence/acoustic_features.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/audio_intelligence/acoustic_features.py): Feature extraction (MFCCs, zero crossing rate, RMS energy, spectral centroid, spectral bandwidth, pause ratio, speech rate).

### 3. NLP & Emotion Intelligence
- [`backend/app/nlp_intelligence/__init__.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/nlp_intelligence/__init__.py): Module exports.
- [`backend/app/nlp_intelligence/spacy_extractor.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/nlp_intelligence/spacy_extractor.py): Deterministic entity extraction (PERSON, LOCATION, DATE/TIME, ORG, incident_type) using spaCy.
- [`backend/app/nlp_intelligence/emotion_classifier.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/nlp_intelligence/emotion_classifier.py): Conversational emotion and sentiment distribution (fear, sadness, anger, neutral, urgency, distress).
- [`backend/app/nlp_intelligence/case_indicators.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/nlp_intelligence/case_indicators.py): Operational indicator flags (threat, violence, urgency, repeated harassment, immediate danger).

### 4. Multimodal Fusion & Risk Classification
- [`backend/app/risk_engine/__init__.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/risk_engine/__init__.py): Module exports.
- [`backend/app/risk_engine/feature_fusion.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/risk_engine/feature_fusion.py): Multimodal feature vector fusion combining acoustic, NLP, emotion, and incident indicators.
- [`backend/app/risk_engine/risk_classifier.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/risk_engine/risk_classifier.py): Scikit-learn Random Forest model predicting LOW, MODERATE, or HIGH risk with observable feature explanation.

### 5. Gemini AI Assistance
- [`backend/app/ai_engine_1/gemini_assistant.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/ai_engine_1/gemini_assistant.py): Direct Google GenAI SDK (`google-genai`) assistant for case summaries and follow-up questions.

### 6. Authentication & RBAC
- [`backend/app/auth/__init__.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/auth/__init__.py): Module exports.
- [`backend/app/auth/security.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/auth/security.py): Password hashing via bcrypt, JWT token creation/decoding, and role protection.
- [`backend/app/routers/auth.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/routers/auth.py): Endpoints for login, registration, profile, and demo user seeding.

### 7. Cases, Complaints & Analytics Router
- [`backend/app/routers/cases.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/routers/cases.py): Citizen complaint filing, anonymous case tracking, officer triage, admin analytics, and audit logs.

### 8. Dedicated Flutter Client Application
- [`flutter_app/pubspec.yaml`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/flutter_app/pubspec.yaml): Flutter project configuration.
- [`flutter_app/lib/main.dart`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/flutter_app/lib/main.dart): Main app entrypoint with role switching.
- [`flutter_app/lib/config/api_config.dart`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/flutter_app/lib/config/api_config.dart): REST and WebSocket URLs.
- [`flutter_app/lib/services/api_service.dart`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/flutter_app/lib/services/api_service.dart): Dio HTTP client.
- [`flutter_app/lib/services/voice_stream_service.dart`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/flutter_app/lib/services/voice_stream_service.dart): Microphone capture & WebSocket streaming.
- [`flutter_app/lib/screens/operator_console_screen.dart`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/flutter_app/lib/screens/operator_console_screen.dart): Operator Console matching Requirement 13.
- [`flutter_app/lib/screens/citizen_complaint_screen.dart`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/flutter_app/lib/screens/citizen_complaint_screen.dart): Grievance filing & anonymous tracking.
- [`flutter_app/lib/screens/officer_dashboard_screen.dart`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/flutter_app/lib/screens/officer_dashboard_screen.dart): Officer triage & alerts.
- [`flutter_app/lib/screens/admin_analytics_screen.dart`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/flutter_app/lib/screens/admin_analytics_screen.dart): Charts using `fl_chart`.

### 9. Test Suites
- [`backend/test_nhaa_platform.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/test_nhaa_platform.py): Automated test suite for all 9 modules.
- [`backend/test_api_endpoints.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/test_api_endpoints.py): Automated test suite for REST endpoints and RBAC.

---

## B. Files Modified

1. [`backend/app/main.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/main.py): Mounted `auth_router` and `cases_router`, enabled initial data seeding, and added complete `/health` telemetry.
2. [`backend/app/models/__init__.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/models/__init__.py): Exported all new database models alongside existing `LiveCase`.
3. [`backend/app/ai_engine_1/deepgram_client.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/ai_engine_1/deepgram_client.py): Added `diarize=true`, `utterance_end_ms=1000`, `vad_events=true`, and speaker diarization parsing.
4. [`backend/app/routers/deepgram_ws.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/routers/deepgram_ws.py): Integrated real-time audio calibration, VAD states, spaCy NLP, emotion detection, risk classification, and DB persistence.
5. [`backend/app/ai_engine_2/engine2_analytics.py`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/app/ai_engine_2/engine2_analytics.py): Added matching vocabulary terms and short summaries to TF-IDF cosine similarity results.
6. [`backend/requirements.txt`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/backend/requirements.txt): Updated with `librosa`, `spacy`, `google-genai`, `pyjwt`, `bcrypt`, `soundfile`.
7. [`src/saathi/components/LiveSessionView.tsx`](file:///c:/Users/yoges/Downloads/nhaa-final-main/nhaa-final-main/src/saathi/components/LiveSessionView.tsx): Upgraded web Operator Console with the complete Requirement 13 dashboard panel.

---

## C. Technologies Actually Used

- **Backend**: Python 3.11+, FastAPI, Uvicorn, SQLAlchemy, SQLite, Pydantic v2
- **Real-Time Speech**: Deepgram Nova-2 Streaming STT over WebSockets (diarization & endpointing)
- **Audio Processing**: NumPy, Librosa, Soundfile
- **NLP**: spaCy, Regex Linguistic Patterns
- **Emotion & Sentiment**: Multilingual Calibrated Distress Classifier with pluggable HuggingFace pipeline support
- **Machine Learning**: Scikit-learn (RandomForestClassifier, TfidfVectorizer, Cosine Similarity), Joblib
- **Generative AI**: Official Google GenAI SDK (`google-genai` directly)
- **Authentication**: JWT (`pyjwt`), password hashing (`bcrypt`)
- **Web Frontend**: React 19, Vite 8, TypeScript, Tailwind CSS v4, Lucide Icons
- **Mobile Frontend**: Flutter 3.24+, Dart, Dio, Record, WebSocketChannel, fl_chart

---

## D. Technologies Intentionally Removed / Not Added

As explicitly instructed, the following were **omitted/avoided**:
- **Whisper**: Replaced by Deepgram Nova-2 streaming WebSocket to achieve sub-second live streaming latency.
- **PyTorch**: Omitted in favor of Scikit-learn pipelines to maintain a lightweight RAM footprint (<20MB).
- **LangChain**: Omitted in favor of the official Google GenAI SDK (`google-genai`) directly.
- **pgvector, Pinecone, FAISS, Elasticsearch**: Omitted in favor of Scikit-learn TF-IDF + Cosine Similarity.
- **OpenCV & Tesseract**: Omitted as the emergency voice workflow does not involve computer vision or scanned documents.
- **Redis**: Omitted in favor of in-memory session managers and SQLite persistence.

---

## E. New API Endpoints

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Complete platform health and engine status | Public |
| `POST` | `/api/auth/register` | User registration | Public |
| `POST` | `/api/auth/login` | JWT login returning access token & role | Public |
| `GET` | `/api/auth/me` | Authenticated user profile | Authenticated |
| `POST` | `/api/auth/seed-users` | Seeds default test accounts | Public / Admin |
| `POST` | `/api/complaints/submit` | Anonymous or authenticated grievance filing | Public / Citizen |
| `GET` | `/api/cases/track/{id}` | Anonymous case resolution lookup | Public / Citizen |
| `GET` | `/api/cases` | List cases with status/risk filtering | Operator / Officer / Admin |
| `GET` | `/api/cases/{case_id}` | Detailed case dossier & intelligence | Operator / Officer / Admin |
| `POST` | `/api/cases/{case_id}/triage` | Triage case, update status & priority | Operator / Officer / Admin |
| `GET` | `/api/officer/dashboard` | Officer statistics & urgent alerts | Officer / Admin |
| `GET` | `/api/admin/analytics` | National analytics, SLA metrics, clusters | Admin |
| `GET` | `/api/audit-logs` | Case audit trail | Officer / Admin |
| `WS` | `/api/deepgram/ws/{session_id}` | Real-time audio streaming & intelligence | Operator / Client |

---

## F. Database Changes (SQLite Schema)

All tables auto-create on backend startup (`Base.metadata.create_all(bind=engine)`):
- `users`: User identity, password hash, role (`Citizen`, `Operator`, `Officer`, `Admin`).
- `officers`: Badge number, department, assignment.
- `cases`: Tracking codes (`NHAA-CASE-2026-XXXXX`), anonymous codes (`CITIZEN-ANON-XXXX`), priority, risk.
- `complaints`: Narratives, channel, requested help.
- `transcripts` & `transcript_segments`: Diarized speaker (`Operator` vs `Citizen`), interim vs final flags, confidence, timestamps.
- `audio_assessments`: Audio quality (`good`/`fair`/`poor`), noise level (`low`/`moderate`/`high`), SNR, clipping, speech ratio.
- `emotion_results`: Dominant emotion, confidence, distribution scores.
- `nlp_results`: Extracted entities (PERSON, LOCATION, TIME, ORG), incident type, token counts.
- `risk_assessments`: Fused features, continuous score, risk level (`LOW`/`MODERATE`/`HIGH`), explanation.
- `historical_cases` & `similar_cases`: Precedent records, TF-IDF cosine similarity, matching terms.
- `audit_logs`: Timestamped audit trail of all officer/operator decisions.

---

## G. How to Run the Complete System

### 1. Python AI Backend
```bash
# In project root
python -m pip install -r backend/requirements.txt

# Start backend (Port 8000)
python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

### 2. React Web Portal (Operator Console & Citizen Web)
```bash
# In project root
npm install
npm run dev
# Access portal at http://localhost:5173
```

### 3. Flutter Client App (Mobile / Desktop)
```bash
cd flutter_app
flutter pub get
flutter run
```

---

## H. How to Test the Real-Time Voice Pipeline

### Automated Test Suites:
```bash
# Run all 9 module tests (Audio, NLP, Emotion, Risk, Precedents, Auth, DB)
python backend/test_nhaa_platform.py

# Run REST API and RBAC verification
python backend/test_api_endpoints.py
```

### Live Manual Test:
1. Open the React portal at `http://localhost:5173/admin/dashboard?tab=saathi`.
2. Click **START LIVE SESSION**.
3. Speak into your microphone (or select one of the Quick Intake Test Phrases on the left).
4. Observe the live updates in the **LIVE CASE ASSESSMENT** dashboard:
   - Audio Quality: `GOOD`, Noise Level: `LOW`, Speech Detected: `YES`
   - VAD State transitioning between `LISTENING`, `SPEAKING`, and `PROCESSING`
   - Live Transcript showing interim captions in real-time, then finalizing with Speaker tags (`Citizen` / `Operator`)
   - Emotion Indicators updating with dominant emotion (e.g. `FEAR`) and confidence %
   - Voice Features showing speech rate and pause ratios
   - Case Indicators showing Threat / Urgency / Violence flags
   - AI-Assisted Risk showing `LOW`, `MODERATE`, or `HIGH` with observable feature contributions
   - Similar Historical Cases showing top 3 precedents with TF-IDF similarity % and matching terms
   - AI Assistance showing Gemini executive summary and suggested de-escalation questions.

---

## I. Known Limitations

1. **Free-tier API Quotas**: If `DEEPGRAM_API_KEY` or `GEMINI_API_KEY` are not set in `.env`, the system automatically activates heuristic intelligence fallbacks so it never crashes during demos.
2. **Audio Codec Compatibility**: Browser streaming uses WebM Opus; native mobile uses PCM 16-bit 16kHz. Deepgram handles both seamlessly.
3. **Microphone Permissions**: Web browsers require HTTPS or `localhost` to access the microphone.

---

## J. Future Upgrades

1. **Bhashini Integration**: Direct integration with the Government of India's Bhashini API for 22 scheduled Indian languages.
2. **Offline Local Model Sidecar**: Bundling an offline quantized Whisper model for locations without reliable internet connectivity.
3. **Automated CAD (Computer-Aided Dispatch)**: Direct webhook forwarding to state ERSS 112 emergency response systems.
