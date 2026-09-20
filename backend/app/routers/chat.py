"""
SAATHI-AI Assistant Chat Router — Instant Gemini AI Integration
Guarantees ultra-fast responses without hanging or infinite loading.
"""

import os
import json
import logging
import asyncio
import urllib.request
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter
from pydantic import BaseModel
from dotenv import load_dotenv

logger = logging.getLogger("routers.chat")

router = APIRouter(prefix="/api/chat", tags=["chat"])

class ChatMessage(BaseModel):
    sender: str  # "user" | "assistant"
    text: str

class CaseContext(BaseModel):
    case_id: Optional[str] = None
    case_number: Optional[str] = None
    district: Optional[str] = None
    svi_score: Optional[int] = None
    svi_label: Optional[str] = None
    case_brief: Optional[str] = None
    detected_keywords: Optional[List[str]] = None
    indicators: Optional[List[Dict[str, Any]]] = None
    transcript_summary: Optional[str] = None
    engine2_precedent: Optional[str] = None

class ChatRequest(BaseModel):
    message: Optional[str] = None
    user_text: Optional[str] = None
    history: Optional[List[Any]] = []
    case_context: Optional[CaseContext] = None
    assessment_answers: Optional[Dict[str, Any]] = None

SAATHI_SYSTEM_PROMPT = """You are SAATHI-AI Assistant, a smart, helpful, ChatGPT-style AI companion and decision-support counselor for the National Helpline & Assistance Administration (NHAA / 14566 & 112).
Act like ChatGPT: answer ALL user questions with great depth, warmth, accuracy, and clear guidance.
Use friendly expressive emojis (🌟, 🤝, 🛡️, ✨, 💡, 🌙, 📋, 🙏, 💬) and conversational gestures throughout your answers.
Speak empathetically in the citizen's language (English, Hindi, or Hinglish).
"""

def _get_groq_api_key() -> Optional[str]:
    """Retrieve server-side GROQ_API_KEY from environment."""
    key = os.environ.get("GROQ_API_KEY", "").strip()
    if key:
        return key
    try:
        root_env = Path(__file__).resolve().parents[3] / ".env"
        if root_env.exists():
            load_dotenv(dotenv_path=root_env)
            key = os.environ.get("GROQ_API_KEY", "").strip()
            if key:
                return key
    except Exception:
        pass
    return None

def _get_gemini_api_key() -> Optional[str]:
    """Retrieve server-side GEMINI_API_KEY from environment."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    try:
        root_env = Path(__file__).resolve().parents[3] / ".env"
        if root_env.exists():
            load_dotenv(dotenv_path=root_env)
            key = os.environ.get("GEMINI_API_KEY", "").strip()
            if key:
                return key
    except Exception:
        pass
    return None

def _get_openrouter_api_key() -> Optional[str]:
    """Retrieve server-side OPENROUTER_API_KEY from environment."""
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if key:
        return key
    try:
        root_env = Path(__file__).resolve().parents[3] / ".env"
        if root_env.exists():
            load_dotenv(dotenv_path=root_env)
            key = os.environ.get("OPENROUTER_API_KEY", "").strip()
            if key:
                return key
    except Exception:
        pass
    return None


@router.post("")
async def chat_with_assistant(req: ChatRequest):
    user_msg = (req.message or req.user_text or "").strip()
    if not user_msg:
        user_msg = "Hello"

    groq_key = _get_groq_api_key()
    gemini_key = _get_gemini_api_key()
    openrouter_key = _get_openrouter_api_key()

    # Format real active case context if present
    context_str = ""
    if req.case_context and (req.case_context.case_id or req.case_context.case_number):
        ctx = req.case_context
        context_str = f"\n[REAL ACTIVE CASE CONTEXT]\n"
        context_str += f"- Case Number/ID: {ctx.case_number or ctx.case_id}\n"
        if ctx.district: context_str += f"- District: {ctx.district}\n"
        if ctx.svi_score is not None: context_str += f"- Current SVI Score: {ctx.svi_score}/100 ({ctx.svi_label or 'N/A'})\n"
        if ctx.case_brief: context_str += f"- Case Brief: {ctx.case_brief}\n"
        if ctx.detected_keywords: context_str += f"- Detected Keywords: {', '.join(ctx.detected_keywords)}\n"
        if ctx.transcript_summary: context_str += f"- Recent Transcript Snippets: {ctx.transcript_summary}\n"
        if ctx.engine2_precedent: context_str += f"- Engine 2 Precedent: {ctx.engine2_precedent}\n"
    elif req.assessment_answers:
        context_str = f"\n[CITIZEN ASSESSMENT ANSWERS]:\n" + json.dumps(req.assessment_answers, ensure_ascii=False)
    else:
        context_str = "\n[CONTEXT]: Citizen/Operator chat session. Answering as a helpful AI companion & helpline guide.\n"

    full_system_prompt = SAATHI_SYSTEM_PROMPT + context_str

    # 1. Attempt live Groq API call if key configured (Preferred ultra-fast LLM)
    if groq_key:
        try:
            groq_reply = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None, _sync_groq_call, groq_key, full_system_prompt, req.history or [], user_msg
                ),
                timeout=4.0
            )
            if groq_reply and len(groq_reply.strip()) > 0:
                return {"reply": groq_reply, "counsellor_message": {"text": groq_reply}, "status": "groq_dynamic_success"}
        except Exception as e:
            logger.warning("Groq API call timeout/error: %s", e)

    # 2. Attempt live Google Gemini API call if valid key exists
    if gemini_key and gemini_key.startswith("AIzaSy"):
        try:
            gemini_reply = await asyncio.wait_for(
                _invoke_gemini_sdk(gemini_key, full_system_prompt, req.history or [], user_msg),
                timeout=3.0
            )
            if gemini_reply and len(gemini_reply.strip()) > 0:
                return {"reply": gemini_reply, "counsellor_message": {"text": gemini_reply}, "status": "gemini_dynamic_success"}
        except Exception as e:
            logger.warning("Gemini API call timeout/error: %s", e)

    # 3. Attempt OpenRouter call with candidate models
    if openrouter_key:
        try:
            or_reply = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None, _sync_openrouter_call, openrouter_key, full_system_prompt, req.history or [], user_msg
                ),
                timeout=6.0
            )
            if or_reply and len(or_reply.strip()) > 0:
                return {"reply": or_reply, "counsellor_message": {"text": or_reply}, "status": "openrouter_dynamic_success"}
        except Exception as e:
            logger.warning("OpenRouter call timeout/error: %s", e)

    # 4. Instant fallback response
    reply = _get_instant_assistant_reply(user_msg, req.case_context)
    return {"reply": reply, "counsellor_message": {"text": reply}, "status": "instant_response"}



def _sync_groq_call(api_key: str, system_prompt: str, history: List[Any], message: str) -> Optional[str]:
    groq_model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b").strip()
    models = [
        groq_model,
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "groq/compound-mini",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
    ]
    seen = set()
    models = [m for m in models if m and not (m in seen or seen.add(m))]

    msgs = [
        {
            "role": "system",
            "content": system_prompt + "\nUse expressive emojis (🌟, 🤝, 🛡️, ✨, 💡, 🌙) and bullet points. Answer in the user's language (Hindi, English, Hinglish).",
        }
    ]
    for h in (history or [])[-4:]:
        if isinstance(h, dict):
            role = "assistant" if h.get("sender") == "assistant" or h.get("role") == "assistant" else "user"
            content = h.get("text") or h.get("content") or ""
            if content:
                msgs.append({"role": role, "content": content})
        elif hasattr(h, "sender") and hasattr(h, "text"):
            msgs.append({"role": "assistant" if h.sender == "assistant" else "user", "content": h.text})
    msgs.append({"role": "user", "content": message})

    for model_candidate in models:
        try:
            req_data = json.dumps({
                "model": model_candidate,
                "messages": msgs,
                "max_tokens": 450,
                "temperature": 0.6,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0",
                    "Authorization": f"Bearer {api_key}",
                }
            )
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                reply = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if reply:
                    return reply
        except Exception as e:
            logger.warning("Groq candidate %s failed: %s", model_candidate, e)
            continue
    return None


def _sync_openrouter_call(api_key: str, system_prompt: str, history: List[Any], message: str) -> Optional[str]:
    models = [
        os.environ.get("OPENROUTER_MODEL", "nex-agi/nex-n2.5-pro:free"),
        "nex-agi/nex-n2.5-mini:free",
        "nvidia/nemotron-3.5-lightning:free",
        "openai/gpt-4o-mini",
    ]
    msgs = [
        {
            "role": "system",
            "content": system_prompt + "\nUse expressive emojis (🌟, 🤝, 🛡️, ✨, 💡, 🌙) and bullet points. Answer in the user's language (Hindi, English, Hinglish).",
        }
    ]
    for h in (history or [])[-4:]:
        if isinstance(h, dict):
            role = "assistant" if h.get("sender") == "assistant" or h.get("role") == "assistant" else "user"
            content = h.get("text") or h.get("content") or ""
            if content:
                msgs.append({"role": role, "content": content})
        elif hasattr(h, "sender") and hasattr(h, "text"):
            msgs.append({"role": "assistant" if h.sender == "assistant" else "user", "content": h.text})
    msgs.append({"role": "user", "content": message})

    for model_candidate in models:
        try:
            req_data = json.dumps({
                "model": model_candidate,
                "messages": msgs,
                "max_tokens": 400,
                "temperature": 0.6,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://openrouter.ai/api/v1/chat/completions",
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                }
            )
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                reply = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if reply:
                    return reply
        except Exception as e:
            logger.warning("OpenRouter candidate %s failed: %s", model_candidate, e)
            continue
    return None


def _get_instant_assistant_reply(user_msg: str, ctx: Optional[CaseContext]) -> str:
    """Instant fallback assistant response for any query with emojis and practical advice."""
    msg = user_msg.strip().lower()

    if any(w in msg for w in ["nodal", "security", "suraksha", "police", "fir"]):
        return (
            "🛡️ **Nodal Officer se Security Protection lene ke steps:**\n\n"
            "1️⃣ **Toll-Free Helpline:** Turant `14566` ya `112` par call karein aur Nodal Officer coordination request karein.\n"
            "2️⃣ **Written Complaint & Threat Assessment:** District Nodal Officer / SP Office me written application submit hoti hai jisme threat ka vivaran hota hai.\n"
            "3️⃣ **Witness Protection & Police Escort:** PoA Act Rules ke tahat immediate police security aur zero-FIR darj karwayi ja sakti hai.\n\n"
            "Aap bilkul surakshit mehsoos karein, hum har kadam par aapke saath hain! 🤝🙏"
        )

    if any(w in msg for w in ["neend", "sleep", "tension", "stress"]):
        return (
            "🌙✨ **Raat ko neend aur tension dur karne ke asar-daar upaay:**\n\n"
            "- 📱 **Screen Off:** Sone se 30-45 minute pehle mobile dur rakhein taaki dimaag shaant ho sake.\n"
            "- 🫁 **Deep Breathing (4-7-8 Technique):** 4 second saans lein, 7 second rokein, aur 8 second me muh se dheere se chodein.\n"
            "- ☕ **No Caffeine:** Shaam ke baad chai/coffee bilkul avoid karein.\n"
            "- 💬 **Dil Ki Baat:** Jo bhi baat aapko pareshan kar rahi hai, yahan bejhiijhak likhein—hum aapki baat dhyan se sun rahe hain 🌟."
        )

    if any(w in msg for w in ["hi", "hello", "namaste", "hey", "hlo", "hii", "helo"]) and len(msg.split()) <= 3:
        return "Namaste! 🙏✨ Main aapka AI Counselor aur SAATHI Companion hoon. Aap mujhse koi bhi sawal pooch sakte hain—suraksha, helpline numbers (112 / 14566), ya tension dur karne ke upaay! 🌟"

    if any(w in msg for w in ["toll", "number", "helpline", "phone", "contact", "call police", "emergency number", "dial"]):
        return (
            "📞 **Emergency Toll-Free Helpline Numbers in India:**\n\n"
            "- 🚨 **National Emergency Number:** `112` (Police, Fire, Medical)\n"
            "- 🛡️ **National Helpline Against Atrocities (NHAA):** `14566`\n"
            "- 🚔 **Police Helpline:** `100` / `112` \n"
            "- 👩 **Women Helpline:** `1091` / `181`\n"
            "- 👶 **Childline Helpline:** `1098`\n"
            "- 🚑 **Ambulance / Medical:** `108` / `102`\n"
            "- 💻 **National Cyber Crime:** `1930`"
        )

    return (
        f"🤝 **Aapne poochha:** '{user_msg}'\n\n"
        "Main aapki sahayata ke liye taiyar hoon! 💡\n"
        "- 🛡️ **Suraksha & Nodal Officer:** PoA Act ke antargat legal protection aur counseling.\n"
        "- 📞 **Emergency:** Kisi bhi aapat-kaal me `112` ya `14566` par sampark karein.\n"
        "- 🌟 Kripya batayein, is vishay me aapko aur kya jankari chahiye? 🙏"
    )


async def _invoke_gemini_sdk(
    api_key: str,
    system_prompt: str,
    history: List[ChatMessage],
    message: str
) -> Optional[str]:
    """Execute Gemini API call in background thread."""
    return await asyncio.get_event_loop().run_in_executor(
        None, _sync_gemini_sdk_call, api_key, system_prompt, history, message
    )


def _sync_gemini_sdk_call(
    api_key: str,
    system_prompt: str,
    history: List[ChatMessage],
    message: str
) -> Optional[str]:
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        prompt = message
        if history:
            recent_hist = "\n".join(f"{h.sender.capitalize()}: {h.text}" for h in history[-3:])
            prompt = f"Chat History:\n{recent_hist}\n\nUser Question: {message}"

        for model_name in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-flash-latest"]:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        temperature=0.4,
                        max_output_tokens=400,
                    )
                )
                if response and response.text:
                    return response.text.strip()
            except Exception:
                continue
    except Exception as e:
        logger.warning("SDK call exception: %s", e)
    return None
