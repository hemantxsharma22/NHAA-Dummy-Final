import os
import io
import wave
import struct
from pathlib import Path
from dotenv import load_dotenv

# Load from canonical project root .env
_root_env = Path(__file__).resolve().parents[1] / ".env"
if _root_env.exists():
    load_dotenv(dotenv_path=_root_env)
else:
    load_dotenv()
from openai import OpenAI

api_key = os.environ.get("OPENAI_API_KEY", "")
print("API key loaded:", bool(api_key))
print("Key length:", len(api_key))

client = OpenAI(api_key=api_key)

# Generate a 1-second silent WAV file
wav_io = io.BytesIO()
with wave.open(wav_io, "wb") as wav_file:
    wav_file.setnchannels(1)
    wav_file.setsampwidth(2)
    wav_file.setframerate(16000)
    for _ in range(16000):
        wav_file.writeframes(struct.pack("<h", 0))

wav_io.seek(0)
wav_io.name = "test.wav"

try:
    res = client.audio.transcriptions.create(
        model="whisper-1",
        file=wav_io
    )
    print("SUCCESS: OpenAI Whisper API is online and responding!")
    print("Response text:", repr(res.text))
except Exception as e:
    print("ERROR from OpenAI Whisper:", e)
