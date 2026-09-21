# NHAA & SAATHI-AI — Production Deployment Guide

This guide explains how to deploy the **NHAA AI Case Intelligence Platform & Citizen Portal** so that all APIs, AI services, and real-time WebSockets operate seamlessly in production.

---

## 1. Why APIs / Backend Failed Previously

1. **Invalid `vercel.json` Routing**:
   The previous `vercel.json` contained an invalid `"services"` block and a catch-all rewrite (`"source": "/(.*)"`) pointing all requests to the frontend. This hijacked every API call (`/api/chat`, `/api/analyze`, `/api/health`, etc.) and returned `index.html` (text/html) instead of running the serverless function. This caused the browser error:
   `SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON`.
2. **Vercel Serverless Function Limits (500MB)**:
   The Python backend includes heavy machine learning libraries (`scikit-learn`, `librosa`, `spacy`, `scipy`, `numpy`) and persistent WebSockets for live voice streaming (`/api/deepgram/ws/...`). Vercel serverless functions have a 250MB/500MB size ceiling and **do not support persistent WebSockets**.
3. **Missing `VITE_SAATHI_API_URL`**:
   Because the Python backend must run on a persistent container service (such as Render or Railway), the Vercel frontend must be given `VITE_SAATHI_API_URL` at build time so it knows where to direct session REST calls and live audio streaming WebSockets (`wss://`).

---

## 2. Architecture & Hosting Strategy

| Component | Technology | Recommended Host | Key Responsibilities |
| :--- | :--- | :--- | :--- |
| **Frontend Web App** | React 19, Vite 8, Tailwind v4 | **Vercel** | Citizen Portal, Admin Dashboard, Operator Console UI |
| **Assessment Serverless API** | Node.js / TypeScript (`api/*.ts`) | **Vercel Functions** | Stress assessment, counsellor chat (`/api/chat`, `/api/analyze`, etc.) |
| **SAATHI-AI Voice & ML Engine** | Python 3.11, FastAPI, Uvicorn | **Render** (or Railway / VPS) | Deepgram dual-channel WebSockets, ML risk scoring, spaCy NER, SQLite DB |

---

## 3. Step 1: Deploy Python Backend to Render

1. Log into your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Web Service** (or **Blueprint** using the repository's `render.yaml`).
3. Connect your GitHub repository (`nhaa-final-main`).
4. Configure the service settings:
   - **Name**: `saathi-ai-backend`
   - **Environment**: `Python 3`
   - **Build Command**:
     ```bash
     pip install --upgrade pip && pip install -r backend/requirements.txt
     ```
   - **Start Command**:
     ```bash
     uvicorn app.main:app --host 0.0.0.0 --port $PORT --app-dir backend
     ```
5. In **Environment Variables**, add:
   | Key | Value | Notes |
   | :--- | :--- | :--- |
   | `PYTHON_VERSION` | `3.11.9` | Ensures compatible runtime |
   | `DEEPGRAM_API_KEY` | `your_deepgram_api_key` | For real-time STT streaming |
   | `GROQ_API_KEY` | `your_groq_api_key` | For ultra-fast LLM responses |
   | `GROQ_MODEL` | `openai/gpt-oss-120b` | Default high-throughput model |
   | `ALLOWED_ORIGINS` | `*` (or `https://your-app.vercel.app`) | Allows CORS from Vercel |
   | `DATABASE_URL` | `sqlite:///./saathi_dev.db` | Local SQLite database |
6. Click **Deploy Web Service**. Once deployed, copy your service URL (e.g., `https://saathi-ai-backend.onrender.com`).
7. Test backend health: Open `https://saathi-ai-backend.onrender.com/health` in your browser. It should return `{"status": "healthy", ...}`.

---

## 4. Step 2: Deploy Frontend to Vercel

1. Log into your [Vercel Dashboard](https://vercel.com).
2. Import the same repository (`nhaa-final-main`).
3. Vercel will auto-detect Vite. The updated `vercel.json` already handles:
   - Routing `/api/chat`, `/api/analyze`, `/api/health`, `/api/assessment/converse`, `/api/counsellor/suggestions` to Vercel serverless functions.
   - Routing all remaining `/api/*` endpoints to `api/index.ts` (Express server).
   - Routing all other routes `/((?!api/).*)` to `/index.html` for client-side navigation.
4. In **Project Settings -> Environment Variables**, add:
   | Key | Value | Required For |
   | :--- | :--- | :--- |
   | `VITE_SAATHI_API_URL` | `https://saathi-ai-backend.onrender.com` | Links frontend to Render Python backend |
   | `GROQ_API_KEY` | `your_groq_api_key` | Serverless Counsellor & Chatbot |
   | `GROQ_MODEL` | `openai/gpt-oss-120b` | Chat model |
   | `VITE_FIREBASE_API_KEY` | `your_firebase_api_key` | Citizen Google Auth |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `your_project.firebaseapp.com` | Citizen Google Auth |
   | `VITE_FIREBASE_PROJECT_ID` | `your_project_id` | Citizen Google Auth |
   | `VITE_FIREBASE_STORAGE_BUCKET` | `your_project.firebasestorage.app` | Citizen Google Auth |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | `your_sender_id` | Citizen Google Auth |
   | `VITE_FIREBASE_APP_ID` | `your_app_id` | Citizen Google Auth |
   | `VITE_FIREBASE_MEASUREMENT_ID` | `your_measurement_id` | Citizen Google Auth |
5. Click **Deploy**.
6. Trigger a redeploy if `VITE_SAATHI_API_URL` was added after the initial build (Vite bakes `VITE_` variables into static assets at build time).

---

## 5. Verification Checklist

- [ ] **Vercel API Health**: Visit `https://<your-vercel-domain>/api/health`. Should return JSON confirming the serverless assessment backend is live.
- [ ] **Render Backend Health**: Visit `https://<your-render-domain>/health` or `https://<your-render-domain>/api/health`. Should return `{"status": "healthy"}`.
- [ ] **Citizen Assessment Chat**: On the Citizen portal, start an assessment and verify replies stream from `/api/chat`.
- [ ] **Operator Console & Live Session**: Navigate to Admin -> Operator Console -> Start Live Audio Session. Verify WebSocket connection `wss://<render-domain>/api/deepgram/ws/...` connects without errors.
