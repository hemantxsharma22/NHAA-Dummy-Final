# NHAA AI Case Intelligence Platform & SAATHI-AI — Tech Stack

> **Project Reference**: National Helpline & Assistance Administration (NHAA - 14566) / Smart India Hackathon (SIH26093)  
> **Architecture**: 100% Web-Based Platform (Responsive for Desktop, Tablet & Mobile Browsers)  
> **Scope**: Citizen Grievance Filing, Trauma Self-Assessment, Real-Time Emergency Operator Console, Field Officer Triage, and National Admin Analytics.

---

## 1. Core Tech Stack (High-Level Summary)

* **Frontend**: React 19, Vite, Tailwind CSS, TypeScript
* **Auth**: Firebase Auth (Google OAuth 2.0)
* **Telephony & SMS**: Twilio (Voice Media Streams & Emergency SMS Dispatch)
* **Speech-to-Text**: Deepgram Nova-2 (Real-Time WebSocket Streaming & Diarization)
* **Core Backend**: Python, FastAPI, Uvicorn
* **Database & ORM**: SQLite, SQLAlchemy
* **NLP & Machine Learning**: spaCy (Deterministic NER), Scikit-Learn (Random Forest & TF-IDF)
* **Conversational AI / LLM**: Groq Cloud API (`openai/gpt-oss-120b`)
* **Deployment & Hosting**: Vercel (Frontend & Serverless API), Render (FastAPI ASGI Backend & WebSockets)

---

## 2. Active Technology Stack Matrix

| Domain | Technology | Version / Spec | Purpose in NHAA Platform | Why It Was Chosen |
| :--- | :--- | :--- | :--- | :--- |
| **Web Frontend** | **React** | `19.2.8` | Core UI library for all portals | High-performance concurrent rendering, zero-lag UI updates during high-frequency live audio streaming sessions. |
| **Build & Tooling** | **Vite** | `8.2.2` | Frontend build tool & dev server | Sub-second Hot Module Replacement (HMR), native ES modules, and ultra-fast production bundling. |
| **Language** | **TypeScript** | `6.0.2` | Static type safety | Eliminates runtime type errors across complex schemas (cases, audio metrics, transcripts, assessment trees, indicators). |
| **Styling** | **Tailwind CSS** | `4.3.3` | Utility-first styling engine | High-contrast, accessibility-focused government UI without runtime CSS bloat; fully responsive across desktop & mobile browsers. |
| **Routing** | **React Router DOM** | `7.18.3` | Client-side routing | Declarative navigation for Operator Console, Citizen Portal, Officer Dashboard, Admin Analytics, and SOS screens. |
| **Authentication** | **Firebase Auth** | `12.18.0` | Citizen Google Authentication | Seamless OAuth 2.0 login for citizens, eliminating the need to manage custom credential databases. |
| **Telephony & SMS** | **Twilio** | Voice & SMS API | Inbound helpline telephony & SMS dispatch | Bridges incoming citizen phone calls (PSTN) to real-time WebSockets and automates emergency SOS alerts to field officers. |
| **Speech-to-Text** | **Deepgram Nova-2** | Streaming WebSocket API | Dual-channel live audio transcription | Ultra-low latency (<300ms), native speaker diarization (`Operator` vs `Citizen`), automatic endpointing, and VAD. |
| **Backend Core** | **Python** | `3.11+` | Core backend runtime | Rich ecosystem for asynchronous networking, NLP, and machine learning pipelines. |
| **Backend Framework**| **FastAPI** | `>=0.110.0` | High-throughput async ASGI framework | Native async/await support for long-lived WebSocket streaming connections and REST endpoints. |
| **ASGI Server** | **Uvicorn** | `>=0.28.0` | Production ASGI server | Fast async request execution powered by `uvloop` and `httptools`. |
| **Data Validation** | **Pydantic** | `v2 (2.6.4+)` | Schema validation & settings | Strict schema validation, type enforcement, and environment variable parsing with Rust-backed speed. |
| **ORM** | **SQLAlchemy** | `>=2.0.28` | Object Relational Mapper | Robust database abstraction, declarative models, relationship handling, and auto-schema migrations. |
| **Database** | **SQLite** | Standard | Relational database (`saathi_dev.db`) | Zero-configuration, ACID-compliant transactional file database; perfectly suited for fast local deployments and edge units. |
| **NLP & NER** | **spaCy** | `>=3.8.0` | Deterministic Entity Extraction | Fast, rule-based extraction of PERSON, LOCATION, DATE/TIME, and ORG entities from transcripts without LLM latency or cost. |
| **Machine Learning**| **Scikit-Learn** | `>=1.4.0` | Random Forest Classifier & TF-IDF | Fused multimodal risk classification (`LOW`/`MODERATE`/`HIGH`) and historical case precedent cosine similarity matching. |
| **Conversational LLM**| **Groq Cloud API** | `openai/gpt-oss-120b` | Ultra-fast AI counselor & co-pilot | Delivers sub-second conversational responses (300–500 tokens/sec) for citizen trauma assessment and real-time operator prompts. |
| **Serverless API** | **Node.js / Express**| `5.2.1` | Citizen assessment microservice | Lightweight HTTP handling for psychological first-aid questionnaires and counselor chats. |
| **Hosting (Frontend)**| **Vercel** | Global Edge CDN | Web hosting & serverless functions | Instant global scaling and static asset delivery with zero server maintenance overhead. |
| **Hosting (Backend)**| **Render / VPS** | Linux Container | Persistent Python ASGI service | Essential for hosting persistent WebSockets and in-memory machine learning models. |

---

## 3. Architecture & Intelligence Flow

```
[Citizen Phone / Web Audio Stream]
            │
            ▼
[Twilio / Deepgram Nova-2 Streaming STT] ───(WebSocket)───► [FastAPI Dual-Channel Router]
                                                                      │
                    ┌─────────────────────────────────────────────────┴─────────────────────────────────────────────────┐
                    ▼                                                                                                   ▼
       [Audio & Acoustic DSP]                                                                                 [Text NLP Intelligence]
     (SNR, Noise Floor Calibration,                                                                            (spaCy: NER, Entities,
       Speech/Pause Ratio Analysis)                                                                               Distress Indicators)
                    │                                                                                                   │
                    └─────────────────────────────────────────┬─────────────────────────────────────────────────────────┘
                                                              ▼
                                              [Multimodal Feature Fusion]
                                            (18-Dimensional Feature Vector)
                                                              │
                                                              ▼
                                            [Scikit-Learn Random Forest]
                                            (Risk Level: LOW/MED/HIGH)
                                                              │
                                   ┌──────────────────────────┴──────────────────────────┐
                                   ▼                                                     ▼
                     [AI Engine 1: Live SVI & Copilot]                    [AI Engine 2: TF-IDF Precedents]
                   (Survivor Vulnerability Index & Groq                  (Historical Cosine Similarity &
                     Ultra-Fast Real-Time Guidance)                       Delay-Risk Incident Matching)
                                   │                                                     │
                                   └──────────────────────────┬──────────────────────────┘
                                                              ▼
                                                [SQLAlchemy / SQLite Storage]
                                                              │
                                                              ▼
                                            [Responsive React Web Portal]
                                      (Citizen / Operator / Officer / Admin Views)
```

---

## 4. Key Architectural Decisions ("Why They Were Used")

1. **100% Web-Based (No Mobile APK Required)**:
   - Eliminates friction for distressed citizens who cannot wait to download or install an APK.
   - Works natively on any mobile browser (Chrome/Safari) with full responsive layout.
   - All 4 roles (Citizen, Helpline Operator, Field Officer, Admin) use unified web portals with instant updates.
2. **Twilio for Telephony & SMS**:
   - Bridges traditional phone calls (PSTN) directly into audio media streams for real-time analysis.
   - Triggers automated emergency dispatch SMS alerts to field officers and nodal contacts.
3. **Deepgram Nova-2 over Local Models**:
   - Delivers sub-second (<300ms) live streaming STT with automatic speaker diarization (`Operator` vs `Citizen`), avoiding heavy local GPU infrastructure.
4. **Groq Cloud LPUs as Active LLM**:
   - Provides ultra-fast token streaming (300–500 tokens/sec) for trauma assessment chats, ensuring zero disorienting delays for distressed citizens.
5. **Deterministic spaCy & Scikit-Learn Risk Classifier**:
   - Strict architectural rule: **LLMs are never allowed to dictate numerical risk scores.**
   - Multimodal fusion combines acoustics, spaCy entities, distress indicators, and Random Forest classification to ensure explainable, auditable risk tiers.
6. **SQLite with SQLAlchemy ORM**:
   - Zero-configuration, ACID-compliant relational persistence that requires no external database server to run.
