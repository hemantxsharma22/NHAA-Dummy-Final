"""
Engine 1: Deepgram Real-Time STT Client — Server-Side WebSocket Proxy
Optimized for Hindi, English, and Hinglish streaming transcription.

Connects to Deepgram's real-time streaming API via WebSocket.
The DEEPGRAM_API_KEY is read exclusively from environment variables
and NEVER exposed to the browser/client.

Architecture:
  Browser Microphone (WebM Opus) → Backend WebSocket → Deepgram WebSocket
  Deepgram transcripts → Backend Engine 1 → Browser WebSocket
"""

import os
import json
import asyncio
import logging
from typing import Optional

logger = logging.getLogger("engine1.deepgram_client")

# Deepgram streaming endpoint
DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"


def get_deepgram_api_key() -> Optional[str]:
    """Read DEEPGRAM_API_KEY from environment. Never hardcoded."""
    key = os.environ.get("DEEPGRAM_API_KEY", "").strip()
    if key and key != "your_deepgram_api_key_here":
        return key
    # Fallback: reload from root or backend .env
    try:
        from pathlib import Path
        from dotenv import load_dotenv
        root_env = Path(__file__).resolve().parents[3] / ".env"
        if root_env.exists():
            load_dotenv(dotenv_path=root_env)
        backend_env = Path(__file__).resolve().parents[2] / ".env"
        if backend_env.exists():
            load_dotenv(dotenv_path=backend_env)
    except Exception:
        pass
    key = os.environ.get("DEEPGRAM_API_KEY", "").strip()
    return key if (key and key != "your_deepgram_api_key_here") else None


def build_deepgram_ws_url(language: str = "hi-IN") -> str:
    """
    Build the Deepgram WebSocket URL with streaming parameters.
    Optimized for Hindi, Indian English, and Hinglish code-mixed streams.
    """
    lang_clean = (language or "hi-IN").lower().strip()

    # Determine optimal language code for Deepgram Nova-2
    if any(k in lang_clean for k in ("en-in", "indian english", "english (in)", "en")):
        target_lang = "en-IN" if "in" in lang_clean else "en"
    else:
        # Default to Hindi (handles Devanagari Hindi and conversational Hinglish)
        target_lang = "hi"

    params = {
        "model": "nova-2",
        "language": target_lang,
        "smart_format": "true",
        "punctuate": "true",
        "interim_results": "true",
        "endpointing": "300",
        "diarize": "true",
        "utterance_end_ms": "1000",
        "vad_events": "true",
    }

    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{DEEPGRAM_WS_URL}?{query}"


class DeepgramStreamError(Exception):
    """Raised when Deepgram connection fails."""
    pass


async def create_deepgram_connection(language: str = "hi-IN"):
    """
    Create and return an active WebSocket connection to Deepgram's real-time API.
    """
    import websockets

    api_key = get_deepgram_api_key()
    if not api_key:
        raise DeepgramStreamError(
            "DEEPGRAM_API_KEY not configured in server environment."
        )

    url = build_deepgram_ws_url(language)
    headers = {"Authorization": f"Token {api_key}"}

    try:
        ws = await websockets.connect(
            url,
            additional_headers=headers,
            ping_interval=20,
            ping_timeout=10,
            close_timeout=5,
        )
        logger.info("Connected to Deepgram WebSocket API (%s)", url)
        return ws
    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg or "403" in error_msg:
            raise DeepgramStreamError("Invalid or unauthorized DEEPGRAM_API_KEY.")
        elif "429" in error_msg:
            raise DeepgramStreamError("Deepgram API quota or rate limit exceeded.")
        else:
            raise DeepgramStreamError(f"Failed to connect to Deepgram: {error_msg}")


def parse_deepgram_response(raw_message: str) -> dict:
    """
    Parse a Deepgram WebSocket response message.
    """
    try:
        data = json.loads(raw_message)
    except json.JSONDecodeError:
        return {"type": "unknown", "raw": raw_message}

    msg_type = data.get("type", "")

    if msg_type == "Results":
        channel = data.get("channel", {})
        alternatives = channel.get("alternatives", [])
        if alternatives:
            alt = alternatives[0]
            transcript = alt.get("transcript", "").strip()
            confidence = alt.get("confidence", 0.0)
            words = alt.get("words", [])
        else:
            transcript = ""
            confidence = 0.0
            words = []

        is_final = data.get("is_final", False)
        speech_final = data.get("speech_final", False)

        # Detect primary speaker ID from words diarization
        speaker_id = 0
        if words:
            speaker_counts = {}
            for w in words:
                spk = w.get("speaker", 0)
                speaker_counts[spk] = speaker_counts.get(spk, 0) + 1
            if speaker_counts:
                speaker_id = max(speaker_counts.items(), key=lambda x: x[1])[0]

        speaker_label = "Operator" if speaker_id == 1 else "Citizen"

        return {
            "type": "transcript",
            "is_final": is_final,
            "speech_final": speech_final,
            "transcript": transcript,
            "confidence": confidence,
            "speaker": speaker_label,
            "speaker_id": speaker_id,
            "words": words,
            "start": data.get("start", 0),
            "duration": data.get("duration", 0),
        }

    elif msg_type == "Metadata":
        return {
            "type": "metadata",
            "request_id": data.get("request_id", ""),
        }

    elif msg_type == "Error" or "error" in data or "err_code" in data:
        return {
            "type": "error",
            "error": data.get("message", data.get("error", str(data))),
        }

    else:
        return {"type": "unknown", "data": data}


async def close_deepgram_connection(ws):
    """Gracefully close the Deepgram WebSocket connection."""
    try:
        await ws.send(json.dumps({"type": "CloseStream"}))
        await asyncio.sleep(0.3)
        await ws.close()
        logger.info("Deepgram connection closed gracefully.")
    except Exception as e:
        logger.debug("Error during Deepgram close: %s", e)
        try:
            await ws.close()
        except Exception:
            pass
