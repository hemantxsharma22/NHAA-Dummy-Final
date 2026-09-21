# NHAA AI Case Intelligence Platform & SAATHI-AI — Comprehensive Technology Stack

> **Project Reference**: National Helpline & Assistance Administration (NHAA - 14566) / Smart India Hackathon (SIH26093)  
> **Platform Architecture**: 100% Web-Based Platform (Responsive for Desktop, Tablet & Mobile Browsers)  
> **System Scope**: Citizen Grievance Filing, Trauma Self-Assessment, Real-time Emergency Operator Console, Field Officer Triage, and National Admin Analytics.

---

## 1. Executive Summary & Architectural Overview

The **NHAA AI Case Intelligence Platform (incorporating SAATHI-AI)** is an enterprise-grade, multimodal decision-support system designed for high-stress emergency response environments. The platform is **fully web-based**, accessible across desktop, tablet, and mobile browsers without requiring any native mobile APK installation.

The platform addresses critical challenges faced by national emergency helplines: **operator cognitive overload, hidden escalation risks, fragmented historical context, and the imperative for explainable, auditable AI under strict human supervision.**

The system operates across a **hybrid multi-tier web architecture**:

```
                                  ┌────────────────────────────────────────────────────────┐
                                  │                 RESPONSIVE WEB CLIENT                  │
                                  │               (React 19 / Vite 8 Web Portal)           │
                                  │  • Desktop / Tablet / Mobile Browser Responsive        │
                                  │  • Citizen Portal & Trauma Assessment UI               │
                                  │  • High-Density Operator Console                       │
                                  │  • Field Officer Triage Dashboard                      │
                                  │  • National Admin Analytics Panel                      │
                                  └─────────────┬────────────────────────────┬─────────────┘
                                                │                            │
                                                ▼                            ▼
                      ┌─────────────────────────────────┐   ┌─────────────────────────────────┐
                      │    ASSESSMENT SERVERLESS API    │   │     FASTAPI AI & AUDIO CORE     │
                      │       (Node.js / Express)       │   │        (Python 3.11 ASGI)       │
                      ├─────────────────────────────────┤   ├─────────────────────────────────┤
                      │ • Citizen Trauma Assessment     │   │ • Deepgram Nova-2 Live Stream   │
                      │ • Groq LPU Counselor Chat       │   │ • Librosa / SciPy Acoustic DSP  │
                      │ • Crisis Keyword Safety Gate    │   │ • spaCy Deterministic NER       │
                      │ • Lightweight JSON Storage      │   │ • Multimodal Fusion & RF ML     │
                      │   (Deployed on Vercel)          │   │ • TF-IDF Cosine Precedent Match │
                      │                                 │   │ • Gemini AI Case Briefing       │
                      │                                 │   │ • SQLite + SQLAlchemy ORM       │
                      │                                 │   │   (Deployed on Render/VPS)      │
                      └─────────────────────────────────┘   └─────────────────────────────────┘
```

---

## 2. Active Technology Stack Matrix

| Layer / Domain | Technology | Version | Purpose in NHAA Platform | Why It Was Chosen |
| :--- | :--- | :--- | :--- | :--- |
| **Web Frontend** | **React** | `19.2.8` | Core UI library for all portals | High-performance concurrent rendering, zero-lag UI updates during high-frequency live audio streaming sessions. |
| **Build & Tooling** | **Vite** | `8.2.2` | Frontend build tool and dev server | Sub-second Hot Module Replacement (HMR), native ES modules, and ultra-fast production bundling compared to Webpack. |
| **Language (Web)** | **TypeScript** | `6.0.2` | Static typing across web & serverless | Eliminates runtime type errors across complex schemas (cases, audio metrics, transcripts, assessment trees, indicators). |
| **Web Styling** | **Tailwind CSS** | `4.3.3` | Utility-first styling engine | High-contrast, mobile-responsive, accessibility-focused government UI without bloated runtime CSS. Fully responsive on mobile browsers. |
| **Web Icons** | **Lucide React** | `1.40.0` | Vector icon system | Ultra-lightweight, customizable SVGs for status indicators, microphones, emergency flags, and triage badges. |
| **Web Routing** | **React Router DOM** | `7.18.3` | Client-side routing | Declarative navigation for Operator Console, Citizen Portal, Officer Dashboard, Admin Analytics, and SOS screens. |
| **Web Auth** | **Firebase Auth** | `12.18.0` | Citizen Google Authentication | Hassle-free OAuth 2.0 login for citizens, offloading credential storage while securing user identities. |
| **Serverless API** | **Node.js / Express**| `5.2.1` | Citizen assessment microservice | Lightweight, fast HTTP handling for psychological first-aid questionnaires and counselor chats. |
| **Serverless Host** | **Vercel Functions**| `@vercel/node 12`| Serverless function execution | Instant global auto-scaling for citizen-facing endpoints with zero server maintenance overhead. |
| **Backend Core** | **Python** | `3.11+` | Core AI and ML engine runtime | Rich ecosystem for scientific computing, audio digital signal processing (DSP), NLP, and ML models. |
| **Backend Framework**| **FastAPI** | `>=0.110.0` | High-throughput async web framework | Built on Starlette and Pydantic; native async/await for holding long-lived WebSocket connections. |
| **ASGI Server** | **Uvicorn** | `>=0.28.0` | High-performance ASGI server | Lightning-fast async request execution powered by `uvloop` and `httptools`. |
| **Data Validation** | **Pydantic & Settings**| `v2 (2.6.4+)` | Strict data parsing and validation | Fast schema validation, type enforcement, and environment variable parsing with Rust-backed speed. |
| **ORM / Database** | **SQLAlchemy** | `>=2.0.28` | Object Relational Mapper | Robust database abstraction, declarative models, connection pooling, and seamless migrations. |
| **Database Engine** | **SQLite** | Standard | Relational database (`saathi_dev.db`) | Zero-configuration, serverless, atomic file database; ideal for rapid testing, edge units, or portable deployments. |
| **Speech-to-Text** | **Deepgram Nova-2** | WebSocket API | Dual-channel live audio transcription | Ultra-low sub-second latency, built-in speaker diarization (`Operator` vs `Citizen`), VAD, and endpointing. |
| **Audio Processing**| **Librosa & Soundfile**| `0.10.0+` / `0.12.0+`| Digital signal processing & calibration | Extracts acoustic distress cues: SNR, dynamic noise floor, clipping, MFCCs, spectral centroid, pause ratio. |
| **Scientific Math** | **NumPy & SciPy** | `1.26.0+` / `1.12.0+`| Numerical calculations and feature arrays| High-speed vector manipulation for acoustic features, normalizations, and matrix operations. |
| **NLP & NER** | **spaCy** | `>=3.8.0` | Deterministic Named Entity Recognition | Fast, rule-based extraction of PERSON, LOCATION, DATE/TIME, and ORG entities from transcripts without LLM cost. |
| **Machine Learning**| **Scikit-Learn** | `>=1.4.0` | Random Forest Classifier & TF-IDF | Fused multimodal risk scoring (Low/Med/High) and historical case cosine similarity matching. |
| **Model Storage** | **Joblib** | `>=1.3.0` | Model serialization and persistence | Fast saving and loading of pre-trained scikit-learn models and vectorizer pipelines. |
| **LLM Inference** | **Groq Cloud API** | LPUs | Ultra-fast conversational AI | Sub-second token generation for the trauma counselor chatbot and real-time operator co-pilot suggestions. |
| **Generative AI SDK**| **google-genai** | `>=0.1.0` | Official Google Gemini SDK | Case brief generation, structured dossier summaries, and contextual incident synthesis. |
| **Auth & Security** | **PyJWT & Bcrypt** | `2.8.0` / `4.0.0` | Cryptographic auth & hashing | Industry-standard password hashing and stateless JSON Web Tokens for role-based access control. |
| **Linter** | **Oxlint** | `1.79.0` | High-speed JavaScript/TypeScript linter| 50x-100x faster than ESLint; ensures code health and consistent standards. |
| **Hosting (Backend)**| **Render / Railway** | Cloud / Docker | Persistent container hosting | Essential for maintaining persistent WebSockets and heavy Python ML memory structures. |

---

## 3. Deep-Dive: Strategic "Why They Used" Overviews

### A. Web Frontend (100% Web-Based & Mobile-Responsive)
#### 1. Why a Responsive Web Portal instead of a Mobile APK?
- **Zero Friction for Citizens in Distress**: Distressed citizens calling a helpline or reporting an atrocity cannot be expected to download, install, and grant permissions to an APK file. A web URL opens instantly on any phone (Android or iPhone) via Chrome, Safari, or Firefox.
- **Universal Cross-Device Accessibility**: All four user roles (**Citizen, Operator, Field Officer, Admin**) can log in from any browser on desktops, laptops, tablets, or smartphones without separate app store submissions or platform fragmentation.
- **Instant Deployment & Continuous Updates**: Bug fixes, security patches, and AI model enhancements go live immediately across all devices upon deploying to Vercel, without waiting for users to update mobile apps.
- **React 19 + Tailwind CSS v4 Responsive Design**: Built with responsive layouts (flexbox, CSS grid, touch-friendly navigation) ensuring that field officers can review case triage cards on their mobile browsers just as effectively as control room operators do on desktop monitors.

---

### B. Speech & Audio Intelligence
#### 1. Why Deepgram Nova-2 Streaming STT instead of Local Whisper?
- **Sub-Second Streaming Latency**: In emergency calls, operators cannot wait 5–15 seconds for audio chunks to finish before receiving a transcript. Deepgram Nova-2 operates via a real-time WebSocket connection, streaming words within 300ms of being spoken.
- **Built-in Speaker Diarization**: Deepgram natively separates channels and speakers (`Operator` vs `Citizen`), preventing the model from confusing the call-taker's questions with the caller's distress statements.
- **VAD & Utterance Endpointing**: Deepgram's Voice Activity Detection automatically demarcates conversational turns (`utterance_end_ms=1000`), enabling event-driven NLP processing without manual silence cutting.
- **Elimination of Heavy GPU Infrastructure**: Running local Whisper models on servers requires expensive GPU instances and consumes gigabytes of VRAM. Deepgram offloads transcription, allowing the Python backend to run comfortably on modest, cost-effective instances.

#### 2. Why Librosa, Soundfile, and SciPy for Acoustic Calibration?
- Speech text alone does not capture an emergency: a calm voice saying "I am okay" vs. a trembling, breathless voice whispering the same words represents vastly different danger levels.
- **Audio Quality Calibration**: `calibration.py` calculates dynamic noise floor, Signal-to-Noise Ratio (SNR), and clipping ratio to determine if audio quality is `good`, `fair`, or `poor`.
- **Acoustic Distress Signatures**: `acoustic_features.py` extracts MFCCs, Zero-Crossing Rate (ZCR), RMS energy, spectral centroid, and speech/pause ratio. High pause ratios and fluctuating pitch correlate strongly with acute distress and trauma.

---

### C. Natural Language Processing & Emotion Intelligence
#### 1. Why spaCy for Deterministic Entity Extraction?
- Emergency dispatch requires rock-solid extraction of incident details: **Who** (PERSON), **Where** (LOCATION / GPE), **When** (DATE / TIME), and **What** (incident category).
- While LLMs can extract entities, they can hallucinate, are non-deterministic, have variable latency, and add significant API cost. spaCy operates deterministically in sub-millisecond time, outputting standardized entity structures for immediate dispatch forms.

#### 2. Why a Calibrated Emotion & Distress Classifier?
- Uses bilingual linguistic rule sets and emotion distribution metrics (fear, sadness, anger, urgency, distress) tailored to Indian emergency contexts (including Hindi, Hinglish, and English vernacular such as *khatra*, *bachao*, *hathiyar*, *marne*).
- Prevents Western-trained sentiment models from misinterpreting loud or high-pitch Indian dialectical nuances as aggression.

---

### D. Risk Engine & Historical Case Intelligence
#### 1. Why Multimodal Feature Fusion (`feature_fusion.py`)?
- A critical architectural mandate of the NHAA platform is: **Do not allow an LLM alone to hallucinate or dictate a numerical risk score.**
- The platform fuses four independent vectors:
  1. **Acoustic Features** (RMS energy, pause ratio, speech rate, pitch variation).
  2. **NLP Features** (entity counts, token length, incident category).
  3. **Emotion Features** (fear score, sadness score, anger score, distress level).
  4. **Incident Indicators** (threat detected, violence detected, weapons, repeated harassment, immediate danger).
- This produces a unified, normalized 18-dimensional feature vector.

#### 2. Why Scikit-Learn Random Forest Classifier?
- **Explainability**: In judicial and administrative reviews (under the PoA Act), every triage decision must be accountable. Random Forest provides observable feature importances (e.g., "Risk scored HIGH primarily due to immediate danger indicator (+0.42) and high vocal distress (+0.28)").
- **Ultra-Fast & Lightweight**: Predicts in <2ms with a RAM footprint under 20MB, completely avoiding heavy PyTorch/TensorFlow dependencies.

#### 3. Why Scikit-Learn TF-IDF & Cosine Similarity instead of Vector DBs (Pinecone/Milvus/pgvector)?
- Helplines need to search historical archives to identify precedents, recurring regional patterns, and delay-prone bottlenecks.
- External vector databases (Pinecone, Weaviate) or heavy embedding models introduce recurring monthly SaaS costs, network latency, and complex credential management.
- Scikit-Learn's `TfidfVectorizer` paired with cosine similarity executes entirely in-memory against SQLite historical records in <10ms, returning top matching precedent cases, resolution paths, and matched vocabulary terms with zero external dependencies.

---

### E. Large Language Models (LLM) & Generative AI
#### 1. Why Groq Cloud API for Real-Time Chat & Co-Pilot?
- Groq's custom LPU (Language Processing Unit) architecture delivers tokens at 300–500 tokens/second.
- Distressed citizens using the trauma assessment chat cannot endure a 5-second lag while an LLM thinks. Groq delivers conversational replies almost instantaneously.
- The platform configures automated fallbacks (`openai/gpt-oss-120b` -> `openai/gpt-oss-20b` -> `qwen/qwen3.8-27b` -> heuristic rules) to ensure zero downtime.

#### 2. Why Google GenAI SDK (`google-genai`) for Case Briefing?
- For post-call synthesis and structured incident briefing, the platform connects directly to Google Gemini models using the official `google-genai` SDK.
- Gemini excels at summarizing long-context multi-turn conversations into concise, factual case briefs, identifying missing incident information for operator follow-ups.

---

### F. Backend & Infrastructure Strategy
#### 1. Why Hybrid Split: Vercel (Frontend & Serverless) + Render (Python ASGI Backend)?
- **WebSocket Persistence**: Vercel Serverless Functions have execution timeouts (10–60s) and cannot maintain persistent WebSocket connections needed for live call streaming.
- **ML Library Size Ceilings**: Vercel functions have strict 250MB uncompressed size limits; Python ML libraries (`scikit-learn`, `librosa`, `scipy`, `spacy`, `soundfile`) easily exceed this threshold.
- **The Ideal Balance**:
  - **Vercel** hosts the static React web app and lightweight Node.js assessment/counselor endpoints with global edge CDN caching.
  - **Render / Container VPS** hosts the long-running Python FastAPI instance with WebSockets, digital signal processing, and ML models.

#### 2. Why SQLite with SQLAlchemy 2.0 ORM?
- **Zero Configuration**: Eliminates the overhead of provisioning, managing, and networking a standalone database cluster during initial deployment and field demonstrations.
- **Full ACID Compliance**: SQLite is fully transactional, resilient against power loss, and stores the complete state in a portable `.db` file.
- **Clean Upgrade Path**: Because database access is abstracted via SQLAlchemy 2.0 models (`User`, `Officer`, `Case`, `Transcript`, `RiskAssessment`), migrating to PostgreSQL/MySQL in large-scale multi-node deployments requires changing only the `DATABASE_URL` connection string.

---

## 4. Key Architectural Principles & Guardrails

1. **Human-in-the-Loop (HITL) Authority**: The AI systems never execute automated emergency dispatches or final case closures. AI generates recommendations, alerts, and calculated indicators; human operators and officers retain 100% decision authority.
2. **Deterministic Safety Filters**: Immediate threats to life (suicide, weapons, domestic violence) trigger instantaneous hard-coded safety banners and direct helpline connects (`14566`, `112`), bypassing any LLM generation to prevent advice delays or hallucination.
3. **Audit Trail & Explainability**: Every triage action, priority escalation, or status update generates an immutable row in the `audit_logs` table recording the actor, timestamp, previous state, new state, and operational rationale.

---

## 5. Summary Diagram: End-to-End Data & Intelligence Flow

```
[Citizen Voice / Call Stream]
            │
            ▼
[Deepgram Nova-2 Streaming STT] ───(WebSocket)───► [FastAPI Dual-Channel Router]
                                                              │
                    ┌─────────────────────────────────────────┴─────────────────────────────────────────┐
                    ▼                                                                                   ▼
       [Audio Intelligence DSP]                                                               [Text NLP Intelligence]
  (Librosa / SciPy: SNR, RMS,                                                            (spaCy: NER, Entities,
   Noise Floor, Speech/Pause)                                                               Emotion & Indicators)
                    │                                                                                   │
                    └─────────────────────────────────────────┬─────────────────────────────────────────┘
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
                   (Survivor Vulnerability Index, Groq /                 (Historical Cosine Similarity,
                     Gemini Suggestions & Briefing)                       Delay-Risk & Pattern Matching)
                                   │                                                     │
                                   └──────────────────────────┬──────────────────────────┘
                                                              ▼
                                                [SQLAlchemy / SQLite Storage]
                                                              │
                                                              ▼
                                            [Responsive React Web Portal]
                                      (Citizen / Operator / Officer / Admin Views)
```
