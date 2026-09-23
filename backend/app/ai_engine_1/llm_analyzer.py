"""
Engine 1: LLM Contextual Analyzer — 15-Category Context & Safety Layer

Provides structured contextual analysis of recent transcript context using an LLM.
Fuses with fast rule/phrase matching to detect context, distinguish past vs current danger,
filter hyperbole/movie quotes, and evaluate reassurance signals.

Safety: System prompt enforces strict boundaries:
  - No medical/psychiatric diagnosis
  - No guilt/innocence determination
  - No invented information
  - Observable language patterns only
  - Mandatory negative context filtering (e.g. movie quotes, assignment hyperbole)
"""

import os
import json
import logging
import asyncio
from typing import Optional, Dict, Any, List

logger = logging.getLogger("engine1.llm_analyzer")

# LLM Safety System Prompt — MANDATORY SAFETY GUARDRAILS
LLM_SYSTEM_PROMPT = """You are an emergency helpline language pattern analyzer for an AI decision-support platform (SIH26093). You analyze caller transcript text in Hindi, English, and Hinglish.

STRICT MANDATORY SAFETY RULES:
1. Do NOT diagnose any medical or psychiatric condition (e.g., PTSD, depression, psychosis).
2. ONLY identify observable language patterns present in the transcript context.
3. Do NOT determine guilt, innocence, or legal liability of any party.
4. Do NOT invent facts or infer unstated demographic/sensitive attributes.
5. NEGATIVE CONTEXT FILTERING: If alarming words are used figuratively, in hyperbole, or referencing media (e.g. "Ye assignment mujhe maar dalega", "Movie mein villain ne threat diya"), set negative_context = true and do NOT classify as real-world danger/self-harm.
6. PAST VS CURRENT DANGER: Distinguish historical danger ("Kal dhamki mili thi") from current/imminent danger ("Woh abhi ghar ke bahar hai"). Current danger carries much higher urgency.
7. REASSURANCE & DE-ESCALATION: If caller states current safety ("Ab main safe hoon", "Police aa gayi hai"), reflect this in reassurance and direction = "decreasing_risk".
8. Return ONLY valid JSON with specified structure."""

LLM_USER_PROMPT_TEMPLATE = """Analyze the following recent transcript context from an emergency helpline call.

15-CATEGORY TAXONOMY TO EVALUATE:
- threat_intimidation
- fear_distress
- immediate_safety
- self_harm
- physical_violence
- sexual_violence
- domestic_violence
- stalking_following
- isolation_support
- coercion_blackmail
- social_pressure
- vulnerability_indicators
- medical_emergency
- current_safety
- request_for_help

Return JSON structure:
{{
  "indicators": [
    {{
      "type": "<one of 15 taxonomy types>",
      "evidence": "exact quote or snippet from transcript",
      "confidence": 0.0 to 1.0,
      "direction": "increasing_risk | decreasing_risk",
      "negative_context": false
    }}
  ],
  "reassurance": [
    {{
      "type": "current_safety | police_arrived | situation_resolved",
      "evidence": "exact quote or snippet",
      "confidence": 0.0 to 1.0
    }}
  ],
  "assistance_requested": "emergency | police | medical | counselling | legal | shelter | info | none",
  "context_change": "brief note on how caller situation evolved in recent context or null",
  "uncertainty": "note on ambiguous/insufficient evidence or null",
  "reasoning_summary": "1-2 sentence objective observable situation summary based strictly on transcript"
}}

RECENT TRANSCRIPT CONTEXT:
\"\"\"
{transcript_context}
\"\"\"

LATEST SEGMENT:
\"\"\"
{latest_segment}
\"\"\""""


def _get_llm_api_key() -> Optional[str]:
    """Get LLM API key from environment (GROQ_API_KEY, LLM_API_KEY, or OPENAI_API_KEY)."""
    for var in ["GROQ_API_KEY", "LLM_API_KEY", "OPENAI_API_KEY"]:
        k = os.environ.get(var, "").strip()
        if k:
            return k
    return None


def _get_llm_base_url() -> Optional[str]:
    url = os.environ.get("OPENAI_BASE_URL", "").strip()
    if url:
        return url
    groq_k = os.environ.get("GROQ_API_KEY", "").strip()
    if groq_k:
        return "https://api.groq.com/openai/v1"
    return None


def _get_llm_model() -> str:
    key = _get_llm_api_key() or ""
    if key.startswith("gsk_"):
        return os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b").strip()
    return os.environ.get("LLM_MODEL", "gpt-4o-mini").strip()


async def analyze_transcript_context(
    transcript_context: str,
    latest_segment: str,
    timeout_seconds: float = 8.0,
) -> Dict[str, Any]:
    """
    Analyze transcript context using LLM for 15-category contextual indicator detection.
    """
    api_key = _get_llm_api_key()
    if not api_key:
        return _unavailable_result("LLM API key not configured (LLM_API_KEY or OPENAI_API_KEY)")

    if not latest_segment.strip():
        return _unavailable_result(None, available=True)

    try:
        result = await asyncio.wait_for(
            _call_llm(api_key, transcript_context, latest_segment),
            timeout=timeout_seconds,
        )
        return result
    except asyncio.TimeoutError:
        logger.warning("LLM analysis timed out after %.1fs", timeout_seconds)
        return _unavailable_result("LLM analysis timed out. Using rule engine fallback.")
    except Exception as e:
        logger.warning("LLM analysis error: %s", e)
        return _unavailable_result(f"LLM analysis error: {type(e).__name__}")


async def _call_llm(api_key: str, transcript_context: str, latest_segment: str) -> Dict[str, Any]:
    """Execute LLM API request."""
    try:
        from openai import AsyncOpenAI
    except ImportError:
        from openai import OpenAI
        return await asyncio.get_event_loop().run_in_executor(
            None, _call_llm_sync, api_key, transcript_context, latest_segment
        )

    base_url = _get_llm_base_url()
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    user_prompt = LLM_USER_PROMPT_TEMPLATE.format(
        transcript_context=transcript_context[-1000:],
        latest_segment=latest_segment[:500],
    )

    try:
        response = await client.chat.completions.create(
            model=_get_llm_model(),
            messages=[
                {"role": "system", "content": LLM_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=600,
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content.strip()
        parsed = json.loads(content)
        return _validate_llm_response(parsed)

    except json.JSONDecodeError as e:
        logger.warning("LLM returned invalid JSON: %s", e)
        return _unavailable_result("LLM returned invalid response format")
    except Exception as e:
        error_str = str(e)
        if "401" in error_str or "authentication" in error_str.lower():
            return _unavailable_result("Invalid LLM API key")
        elif "429" in error_str:
            return _unavailable_result("LLM rate limit exceeded")
        return _unavailable_result(f"LLM error: {type(e).__name__}")


def _call_llm_sync(api_key: str, transcript_context: str, latest_segment: str) -> Dict[str, Any]:
    """Synchronous LLM call fallback."""
    from openai import OpenAI
    base_url = _get_llm_base_url()
    client = OpenAI(api_key=api_key, base_url=base_url)

    user_prompt = LLM_USER_PROMPT_TEMPLATE.format(
        transcript_context=transcript_context[-1000:],
        latest_segment=latest_segment[:500],
    )

    try:
        response = client.chat.completions.create(
            model=_get_llm_model(),
            messages=[
                {"role": "system", "content": LLM_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=600,
            temperature=0.1,
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        parsed = json.loads(content)
        return _validate_llm_response(parsed)
    except Exception as e:
        logger.warning("Sync LLM call failed: %s", e)
        return _unavailable_result(f"LLM error: {type(e).__name__}")


def _validate_llm_response(parsed: dict) -> Dict[str, Any]:
    """Validate and clean LLM JSON response structure."""
    indicators = parsed.get("indicators", [])
    reassurance = parsed.get("reassurance", [])

    valid_indicators = []
    for ind in indicators:
        if isinstance(ind, dict) and "type" in ind:
            valid_indicators.append({
                "type": ind.get("type", "unknown"),
                "evidence": str(ind.get("evidence", ""))[:250],
                "confidence": min(1.0, max(0.0, float(ind.get("confidence", 0.85)))),
                "direction": ind.get("direction", "increasing_risk"),
                "negative_context": bool(ind.get("negative_context", False)),
            })

    valid_reassurance = []
    for reas in reassurance:
        if isinstance(reas, dict) and "type" in reas:
            valid_reassurance.append({
                "type": reas.get("type", "current_safety"),
                "evidence": str(reas.get("evidence", ""))[:250],
                "confidence": min(1.0, max(0.0, float(reas.get("confidence", 0.85)))),
            })

    return {
        "llm_available": True,
        "indicators": valid_indicators,
        "reassurance": valid_reassurance,
        "assistance_requested": parsed.get("assistance_requested", "none"),
        "context_change": parsed.get("context_change"),
        "uncertainty": parsed.get("uncertainty"),
        "reasoning_summary": parsed.get("reasoning_summary"),
        "error": None,
    }


def _unavailable_result(error: Optional[str], available: bool = False) -> Dict[str, Any]:
    return {
        "llm_available": available,
        "indicators": [],
        "reassurance": [],
        "assistance_requested": "none",
        "context_change": None,
        "uncertainty": None,
        "reasoning_summary": None,
        "error": error,
    }
