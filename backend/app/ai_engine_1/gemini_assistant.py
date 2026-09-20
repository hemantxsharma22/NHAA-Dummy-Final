"""
Gemini AI Layer for NHAA Platform.
Direct integration with the official Google GenAI SDK (`google-genai`).
Handles complaint summarization, key facts extraction, recommended follow-up questions,
and officer decision-support assistance with structured JSON schemas.

CRITICAL POLICY:
The LLM does NOT independently determine a person's mental-health or medical diagnosis.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger("ai_engine_1.gemini_assistant")

GEMINI_PROMPT_TEMPLATE = """
You are the NHAA Case Intelligence Assistant supporting helpline operators and nodal officers.
Analyze the following citizen transcript / complaint narrative and produce a structured JSON response.

Transcript/Narrative:
\"\"\"{text}\"\"\"

Operator Live Assessment Context:
- Observable Indicators: {indicators}
- Dominant Conversational Emotion: {emotion}
- AI-Assisted Risk Level: {risk_level}

IMPORTANT GUIDELINES:
1. Do NOT make medical or psychiatric diagnoses (no claiming PTSD, depression, trauma).
2. Extract objective, factual information.
3. Recommend 3 clarifying, de-escalating follow-up questions for the operator.
4. Highlight urgency indicators and requested help.

Respond ONLY with valid JSON matching this exact structure:
{{
  "case_summary": "Factual 2-3 sentence summary of the incident",
  "incident_type": "threat | harassment | domestic_abuse | rescue | medical | general",
  "key_facts": ["fact 1", "fact 2", "fact 3"],
  "recommended_questions": [
    "Question 1 to ask caller",
    "Question 2 to ask caller",
    "Question 3 to ask caller"
  ],
  "urgency_indicators": ["indicator 1", "indicator 2"],
  "suggested_actions": ["immediate action 1", "action 2"],
  "disclaimer": "AI-assisted decision-support only. Not a medical or clinical diagnosis."
}}
"""


def generate_case_intelligence(
    text: str,
    indicators: Optional[List[str]] = None,
    emotion: str = "neutral",
    risk_level: str = "LOW",
) -> Dict[str, Any]:
    """
    Invokes Google Gemini API directly or falls back to structured rule synthesis.
    """
    if not text or not text.strip():
        return _fallback_case_intelligence("No transcript provided yet.")

    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    indicators_str = ", ".join(indicators) if indicators else "None specified"

    if gemini_key:
        try:
            from google import genai
            client = genai.Client(api_key=gemini_key)
            prompt = GEMINI_PROMPT_TEMPLATE.format(
                text=text.strip()[:3000],
                indicators=indicators_str,
                emotion=emotion,
                risk_level=risk_level,
            )

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config={"response_mime_type": "application/json"},
            )

            if response and response.text:
                parsed = json.loads(response.text)
                parsed["disclaimer"] = "AI-assisted decision-support only. Not a medical or clinical diagnosis."
                return parsed

        except Exception as e:
            logger.warning("Gemini API call failed (%s); trying Groq fallback", e)

    # Groq high-speed LLM Case Intelligence
    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    if groq_key:
        try:
            import requests
            groq_model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b").strip()
            prompt = GEMINI_PROMPT_TEMPLATE.format(
                text=text.strip()[:3000],
                indicators=indicators_str,
                emotion=emotion,
                risk_level=risk_level,
            )
            headers = {
                "Authorization": f"Bearer {groq_key}",
                "User-Agent": "Mozilla/5.0",
                "Content-Type": "application/json",
            }
            for model_cand in [groq_model, "openai/gpt-oss-120b", "openai/gpt-oss-20b", "groq/compound-mini"]:
                payload = {
                    "model": model_cand,
                    "messages": [
                        {"role": "system", "content": "You are the NHAA Case Intelligence Assistant. Return strictly valid JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2,
                }
                resp = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload, timeout=8)
                if resp.status_code == 200:
                    data = resp.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    if content:
                        parsed = json.loads(content)
                        parsed["disclaimer"] = "AI-assisted decision-support only. Not a medical or clinical diagnosis."
                        return parsed
        except Exception as e:
            logger.warning("Groq Case Intelligence call failed (%s); using heuristic fallback", e)

    # Fallback heuristic generator
    return _fallback_case_intelligence(text, indicators, emotion, risk_level)


def _fallback_case_intelligence(
    text: str,
    indicators: Optional[List[str]] = None,
    emotion: str = "neutral",
    risk_level: str = "LOW",
) -> Dict[str, Any]:
    lower = text.lower() if text else ""

    # Determine incident type
    incident_type = "general"
    if "threat" in lower or "dhamki" in lower or "kill" in lower:
        incident_type = "threat"
    elif "hit" in lower or "beat" in lower or "attack" in lower or "peeta" in lower:
        incident_type = "violence"
    elif "stalk" in lower or "harass" in lower or "follow" in lower:
        incident_type = "harassment"
    elif "trapped" in lower or "rescue" in lower or "flood" in lower or "fire" in lower:
        incident_type = "rescue"

    key_facts = []
    if "yesterday" in lower or "today" in lower or "kal" in lower:
        key_facts.append("Incident occurred recently (yesterday/today).")
    if "college" in lower or "metro" in lower or "home" in lower:
        key_facts.append("Specific location coordinates mentioned in conversation.")
    if indicators:
        key_facts.append(f"Observable flags: {', '.join(indicators[:2])}")
    if not key_facts:
        key_facts.append("Caller contacting helpline for administrative grievance redressal.")

    # Tailored questions based on risk level
    if risk_level == "HIGH":
        recommended_questions = [
            "Are you currently in a physically safe and secure place right now?",
            "Do you need our emergency nodal team or local police dispatched to your location immediately?",
            "Can you confirm your exact current location or nearest landmark?"
        ]
        urgency_indicators = ["High urgency cues detected", "Immediate safety verification required"]
        suggested_actions = [
            "Keep caller on the line while initiating Emergency Protection protocol",
            "Notify assigned Nodal Officer immediately"
        ]
    elif risk_level == "MODERATE":
        recommended_questions = [
            "Can you tell me more about what happened and who was involved?",
            "Has this person contacted or threatened you previously?",
            "Would you like us to register an official expedited complaint with a tracking ID?"
        ]
        urgency_indicators = ["Distress markers present", "Follow-up monitoring advised"]
        suggested_actions = [
            "Document incident details and timeline",
            "Generate NHAA grievance ticket number for caller"
        ]
    else:
        recommended_questions = [
            "Can you please state your primary concern and the assistance you are seeking?",
            "Would you like this request registered anonymously or linked to your account?",
            "Is there any specific documentation or evidence you wish to attach?"
        ]
        urgency_indicators = ["Standard priority"]
        suggested_actions = [
            "Provide helpline guidance and record citizen request"
        ]

    summary = (
        f"Citizen reported an incident categorized as '{incident_type}'. "
        f"Conversational indicators reflect '{emotion}' tone triaged at {risk_level} operational priority. "
        f"Key facts extracted for operator assistance."
    )

    return {
        "case_summary": summary,
        "incident_type": incident_type,
        "key_facts": key_facts,
        "recommended_questions": recommended_questions,
        "urgency_indicators": urgency_indicators,
        "suggested_actions": suggested_actions,
        "disclaimer": "AI-assisted decision-support only. Not a medical or clinical diagnosis.",
    }
