"""
SAATHI-AI Assistant Chat Router — Ultra-Fast Groq & Gemini AI Integration
Provides articulate, empathetic, legally sound, and comprehensive guidance for:
1. /api/chat - SAATHI-AI interactive assistant & console companion
2. /api/counsellor/suggestions - Tailored trauma & legal suggestions for assessment answers
3. /api/assessment/converse - Interactive AI conversational trauma assessment
4. /api/analyze - Multimodal semantic distress classification
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

router = APIRouter(tags=["chat"])

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

class CounsellorSuggestionsRequest(BaseModel):
    answers: Optional[Dict[str, Any]] = {}
    language: Optional[str] = "hinglish"
    distress_level: Optional[str] = "MEDIUM"

class AssessmentConverseRequest(BaseModel):
    session_id: Optional[str] = "session-default"
    user_message: str
    turn_count: Optional[int] = 0
    history: Optional[List[Any]] = []
    acoustics: Optional[Dict[str, Any]] = None

class AnalyzeRequest(BaseModel):
    fullTranscript: Optional[str] = ""
    answers: Optional[Dict[str, Any]] = {}
    acoustics: Optional[Dict[str, Any]] = None

SAATHI_SYSTEM_PROMPT = """You are SAATHI-AI, the official intelligent assistant and decision-support companion for the National Helpline Against Atrocities (NHAA - 14566), Ministry of Social Justice and Empowerment, Government of India.

Your core mission is to empower citizens, victims, helpline operators, and nodal officers with compassionate, highly articulate, reassuring, and legally sound guidance.

GUIDELINES FOR PERFECT WORDS & COMMUNICATION:
1. Tone: Deeply respectful, empathetic, validating, articulate, and completely professional. Never sound robotic or dismissive.
2. Completeness: ALWAYS conclude every paragraph and sentence fully. Never leave thoughts truncated or halfway finished.
3. Legal Authority: Expert in the Scheduled Castes and the Scheduled Tribes (Prevention of Atrocities) Act, 1989 (PoA Act), Section 15 relief schemes, Special Courts, FIR procedures, and witness protection.
4. Formatting: Use structured markdown headings, clean bullet points, numbered steps, and tasteful emojis (🌟, 🤝, 🛡️, ✨, 💡, 📋, 🙏, 📞).
5. Multilingual Fluency: Seamlessly respond in the user's preferred language (English, Hindi in Devanagari, or Conversational Hinglish) with impeccable grammar.
6. Emergency Assurance: If imminent danger is mentioned, prominently remind them of the toll-free 24x7 helpline 14566 and national emergency number 112.
"""

def _get_groq_api_key() -> str:
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
    return ""

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


# ==============================================================================
# 1. SAATHI-AI MAIN CHAT ENDPOINT (/api/chat)
# ==============================================================================
@router.post("/api/chat")
async def chat_with_assistant(req: ChatRequest):
    user_msg = (req.message or req.user_text or "").strip()
    if not user_msg:
        user_msg = "Hello"

    groq_key = _get_groq_api_key()
    gemini_key = _get_gemini_api_key()

    # Format real active case context if present
    context_str = ""
    if req.case_context and (req.case_context.case_id or req.case_context.case_number):
        ctx = req.case_context
        context_str = "\n[REAL ACTIVE CASE CONTEXT]\n"
        context_str += f"- Case Number/ID: {ctx.case_number or ctx.case_id}\n"
        if ctx.district: context_str += f"- District: {ctx.district}\n"
        if ctx.svi_score is not None: context_str += f"- Current SVI Score: {ctx.svi_score}/100 ({ctx.svi_label or 'N/A'})\n"
        if ctx.case_brief: context_str += f"- Case Brief: {ctx.case_brief}\n"
        if ctx.detected_keywords: context_str += f"- Detected Keywords: {', '.join(ctx.detected_keywords)}\n"
        if ctx.transcript_summary: context_str += f"- Recent Transcript Snippets: {ctx.transcript_summary}\n"
        if ctx.engine2_precedent: context_str += f"- Engine 2 Precedent: {ctx.engine2_precedent}\n"
    elif req.assessment_answers:
        context_str = "\n[CITIZEN ASSESSMENT ANSWERS]:\n" + json.dumps(req.assessment_answers, ensure_ascii=False)
    else:
        context_str = "\n[CONTEXT]: Citizen/Operator inquiry. Providing supportive, articulate, legally grounded guidance.\n"

    full_system_prompt = SAATHI_SYSTEM_PROMPT + context_str

    # 1. Attempt live Groq API call with high max_tokens for complete, perfect words
    if groq_key:
        try:
            groq_reply = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None, _sync_groq_call, groq_key, full_system_prompt, req.history or [], user_msg
                ),
                timeout=7.0
            )
            if groq_reply and len(groq_reply.strip()) > 0:
                return {
                    "reply": groq_reply,
                    "counsellor_message": {"text": groq_reply},
                    "status": "groq_dynamic_success",
                }
        except Exception as e:
            logger.warning("Groq API call timeout/error: %s", e)

    # 2. Attempt live Google Gemini API call if valid key exists
    if gemini_key and gemini_key.startswith("AIzaSy"):
        try:
            gemini_reply = await asyncio.wait_for(
                _invoke_gemini_sdk(gemini_key, full_system_prompt, req.history or [], user_msg),
                timeout=4.0
            )
            if gemini_reply and len(gemini_reply.strip()) > 0:
                return {
                    "reply": gemini_reply,
                    "counsellor_message": {"text": gemini_reply},
                    "status": "gemini_dynamic_success",
                }
        except Exception as e:
            logger.warning("Gemini API call timeout/error: %s", e)

    # 3. Instant articulate fallback response
    reply = _get_instant_assistant_reply(user_msg, req.case_context)
    return {"reply": reply, "counsellor_message": {"text": reply}, "status": "instant_response"}


# ==============================================================================
# 2. COUNSELLOR PERSONALIZED SUGGESTIONS (/api/counsellor/suggestions)
# ==============================================================================
@router.post("/api/counsellor/suggestions")
async def get_counsellor_suggestions(req: CounsellorSuggestionsRequest):
    """
    Generates personalized trauma-informed suggestion cards, greeting, and identified issues
    strictly tailored to citizen's assessment answers using Groq AI.
    """
    groq_key = _get_groq_api_key()
    lang = req.language or "hinglish"
    distress = req.distress_level or "MEDIUM"
    answers_dict = req.answers or {}

    prompt = f"""You are Counsellor C-104 at India's National Helpline Against Atrocities (NHAA - 14566).
A citizen has completed a psychological and security assessment.
Their Distress Level: {distress}
Their Assessment Answers:
{json.dumps(answers_dict, indent=2, ensure_ascii=False)}

Target Tone: Warm, validating, articulate, perfectly structured.
Language style: {lang} (if Hinglish, natural conversational Hindi in Latin script; if Hindi, respectful Devanagari; if English, compassionate English).

Generate a strictly valid JSON response with this exact schema:
{{
  "greeting": "Empathetic 2-sentence greeting directly referencing their described issues (such as fear, slurs, boundary dispute, or sleeplessness).",
  "identified_issues": [
    "Specific Issue 1 derived from their answers",
    "Specific Issue 2",
    "Specific Issue 3"
  ],
  "counsellor_id": "C-104",
  "distress_level": "{distress}",
  "suggestions": [
    {{
      "id": "sug-1",
      "category": "legal",
      "title": "Police Protection & Nodal Cell Support",
      "badge": "Legal & Protection",
      "description": "Concrete steps under SC/ST PoA Act to file an FIR and demand witness protection from the District Superintendent of Police.",
      "action_prompt": "How do I request police escort and lodge a formal FIR?"
    }},
    {{
      "id": "sug-2",
      "category": "coping",
      "title": "Trauma De-escalation & Somatic Grounding",
      "badge": "Trauma & Regulation",
      "description": "Actionable somatic exercises (4-7-8 breathing, sensory grounding) to stabilize acute distress and insomnia.",
      "action_prompt": "Guide me through grounding exercises to calm my anxiety."
    }},
    {{
      "id": "sug-3",
      "category": "counselling",
      "title": "Confidential Tele-Counseling & Rehabilitation",
      "badge": "Confidential Counseling",
      "description": "Connecting with specialized counselors for long-term emotional recovery and government victim compensation.",
      "action_prompt": "What compensation and mental health support can I claim?"
    }}
  ],
  "recommended_prompts": [
    "How can the Nodal Officer ensure my family's physical safety?",
    "What compensation is provided under the SC/ST PoA Act?",
    "Can you help me draft a complaint narrative for the police?"
  ]
}}
Respond ONLY with the JSON object.
"""

    if groq_key:
        try:
            groq_model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b").strip()
            models = [groq_model, "openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
            for m in models:
                try:
                    payload = json.dumps({
                        "model": m,
                        "messages": [
                            {"role": "system", "content": "You are Counsellor C-104. Return strictly valid JSON."},
                            {"role": "user", "content": prompt}
                        ],
                        "response_format": {"type": "json_object"},
                        "temperature": 0.3,
                        "max_tokens": 1200,
                    }).encode("utf-8")
                    req_obj = urllib.request.Request(
                        "https://api.groq.com/openai/v1/chat/completions",
                        data=payload,
                        headers={
                            "Content-Type": "application/json",
                            "Authorization": f"Bearer {groq_key}",
                            "User-Agent": "Mozilla/5.0",
                        }
                    )
                    with urllib.request.urlopen(req_obj, timeout=6.0) as resp:
                        res_json = json.loads(resp.read().decode("utf-8"))
                        text_content = res_json.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                        if text_content:
                            parsed = json.loads(text_content)
                            if parsed.get("suggestions"):
                                return parsed
                except Exception as inner_e:
                    logger.warning("Groq suggestion candidate %s failed: %s", m, inner_e)
                    continue
        except Exception as e:
            logger.warning("Groq suggestions endpoint error: %s", e)

    # Heuristic fallback if network or key unavailable
    return {
        "greeting": "Namaste. I have carefully reviewed your assessment responses, and I want you to know that your safety and well-being are our highest priority. 🤝🌟",
        "identified_issues": [
            "Experiences of discrimination or threats mentioned in assessment",
            "Elevated stress and acute emotional burden",
            "Requirement for safety protection and legal guidance"
        ],
        "counsellor_id": "C-104",
        "distress_level": distress,
        "suggestions": [
            {
                "id": "sug-1",
                "category": "legal",
                "title": "Police Protection & Nodal Cell Support",
                "badge": "Legal & Protection",
                "description": "Immediate provisions under the SC/ST PoA Act to register an FIR and obtain police security from the District Nodal Officer.",
                "action_prompt": "How do I request police escort and lodge a formal FIR?"
            },
            {
                "id": "sug-2",
                "category": "coping",
                "title": "Trauma De-escalation & Grounding",
                "badge": "Trauma & Regulation",
                "description": "Effective somatic grounding and relaxation techniques to reduce hyper-vigilance and restore calm sleep.",
                "action_prompt": "Guide me through grounding exercises to calm my anxiety."
            },
            {
                "id": "sug-3",
                "category": "counselling",
                "title": "Confidential Counseling & PoA Relief",
                "badge": "Confidential Counseling",
                "description": "Guidance on statutory financial relief under Section 15 and continuous emotional tele-counseling support.",
                "action_prompt": "What compensation and mental health support can I claim?"
            }
        ],
        "recommended_prompts": [
            "How can the Nodal Officer ensure my family's physical safety?",
            "What compensation is provided under the SC/ST PoA Act?",
            "Can you help me draft a complaint narrative for the police?"
        ]
    }


# ==============================================================================
# 3. CONVERSATIONAL ASSESSMENT INTERACTION (/api/assessment/converse)
# ==============================================================================
@router.post("/api/assessment/converse")
async def assessment_converse(req: AssessmentConverseRequest):
    """
    Powers interactive conversational trauma assessment turns with AI empathy.
    """
    groq_key = _get_groq_api_key()
    turn = req.turn_count or 0
    is_complete = turn >= 4

    prompt = f"""You are a sensitive trauma assessor for the National Helpline (NHAA - 14566).
Citizen Turn Count: {turn}
Citizen Message: "{req.user_message}"

Provide a warm, reassuring conversational response (2-3 sentences) acknowledging their feelings and asking one gentle follow-up question regarding their current safety or emotional state.
If this is the final turn (turn >= 4), provide an encouraging concluding message assuring them that their responses are being synthesized to provide personalized support.

Return JSON:
{{
  "reply": "Empathetic, reassuring conversational response...",
  "is_complete": {str(is_complete).lower()},
  "detected_language": "hinglish",
  "assessment_result": {{
    "distress_level": "{"HIGH" if any(w in req.user_message.lower() for w in ['dhamki', 'threat', 'marne', 'maar', 'dar']) else "MEDIUM"}",
    "urgency": "{"high" if is_complete else "moderate"}",
    "has_safety_concern": {str(any(w in req.user_message.lower() for w in ['threat', 'dhamki', 'danger', 'attack'])).lower()},
    "support_recommended": true,
    "content_indicators": ["vulnerability_verbalized"],
    "summary": "Conversational assessment conducted by SAATHI-AI with empathy."
  }}
}}
Return ONLY valid JSON.
"""

    if groq_key:
        try:
            payload = json.dumps({
                "model": os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"),
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.4,
                "max_tokens": 600,
            }).encode("utf-8")
            req_obj = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=payload,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {groq_key}"}
            )
            with urllib.request.urlopen(req_obj, timeout=5.0) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
                content = res_json.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if content:
                    return json.loads(content)
        except Exception as e:
            logger.warning("Assessment converse Groq failed: %s", e)

    # Heuristic fallback
    return {
        "reply": "Main aapki baat ko achhe se samajh raha hoon. Aap bilkul akele nahi hain, hum aapki puri madad karenge. Kya aap abhi kisi surakshit sthan par hain? 🌟🤝",
        "is_complete": is_complete,
        "detected_language": "hinglish",
        "assessment_result": {
            "distress_level": "MEDIUM",
            "urgency": "moderate",
            "has_safety_concern": False,
            "support_recommended": True,
            "content_indicators": ["conversational_inquiry"],
            "summary": "Assessment in progress."
        }
    }


# ==============================================================================
# 4. SEMANTIC DISTRESS ANALYSIS (/api/analyze)
# ==============================================================================
@router.post("/api/analyze")
async def analyze_distress(req: AnalyzeRequest):
    """
    Evaluates transcript & answers for hidden distress indicators and vocal signals.
    """
    groq_key = _get_groq_api_key()
    transcript = req.fullTranscript or ""
    answers_str = json.dumps(req.answers or {})

    prompt = f"""Analyze this citizen input for distress, safety risk, and emotional indicators under SC/ST helpline standards.
Transcript: "{transcript}"
Assessment Answers: {answers_str}

Return strictly valid JSON:
{{
  "distress_level": "LOW | MEDIUM | HIGH",
  "content_indicators": ["threat_language", "fear_distress", "sleep_disturbance"],
  "vocal_signals": {{
    "speech_rate_change": false,
    "increased_pauses": false,
    "pitch_variation": false,
    "voice_tremor": false
  }},
  "urgency": "low | moderate | high",
  "support_recommended": true,
  "has_safety_concern": false
}}
"""

    if groq_key:
        try:
            payload = json.dumps({
                "model": os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"),
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
                "max_tokens": 500,
            }).encode("utf-8")
            req_obj = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=payload,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {groq_key}"}
            )
            with urllib.request.urlopen(req_obj, timeout=5.0) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
                content = res_json.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if content:
                    return json.loads(content)
        except Exception as e:
            logger.warning("Analyze distress Groq failed: %s", e)

    # Fast rule fallback
    lower = (transcript + " " + answers_str).lower()
    is_high = any(w in lower for w in ["dhamki", "threat", "kill", "marne", "attack", "maar", "suicide"])
    return {
        "distress_level": "HIGH" if is_high else "MEDIUM",
        "content_indicators": ["threat_language" if is_high else "emotional_vulnerability"],
        "vocal_signals": {
            "speech_rate_change": False,
            "increased_pauses": False,
            "pitch_variation": False,
            "voice_tremor": False
        },
        "urgency": "high" if is_high else "moderate",
        "support_recommended": True,
        "has_safety_concern": is_high
    }


# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================
def _sync_groq_call(api_key: str, system_prompt: str, history: List[Any], message: str) -> Optional[str]:
    groq_model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b").strip()
    models = [
        groq_model,
        "openai/gpt-oss-120b",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "gemma2-9b-it",
    ]
    seen = set()
    models = [m for m in models if m and not (m in seen or seen.add(m))]

    msgs = [
        {
            "role": "system",
            "content": system_prompt + "\nAlways conclude with complete thoughts and perfect words. Use expressive formatting, helpful bullet points, and friendly emojis.",
        }
    ]
    for h in (history or [])[-5:]:
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
                "max_tokens": 1500,
                "temperature": 0.5,
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
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                reply = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if reply:
                    return reply
        except Exception as e:
            logger.warning("Groq candidate %s failed: %s", model_candidate, e)
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
        "Main aapki sahayata ke liye poori tarah taiyar hoon! 💡\n\n"
        "- 🛡️ **Suraksha & Legal Protection:** SC/ST PoA Act ke tahat FIR, Nodal Officer security aur free legal aid.\n"
        "- 📞 **Emergency:** Kisi bhi aapat-kaal me turant `14566` ya `112` par call karein.\n"
        "- 🌟 Kripya batayein, is vishay me aapko aur kya jankari chahiye? Hum poori imaandari se aapka margdarshan karenge! 🙏"
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
                        max_output_tokens=1200,
                    )
                )
                if response and response.text:
                    return response.text.strip()
            except Exception:
                continue
    except Exception as e:
        logger.warning("Gemini SDK call exception: %s", e)
    return None
