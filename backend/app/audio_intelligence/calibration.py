"""
Audio Quality & Voice Calibration Module for NHAA Voice Pipeline.
Measures microphone levels, noise floor, SNR, clipping, and silence/speech ratio.

DISCLAIMER: These measurements are strictly audio/conversational features.
They do NOT diagnose stress, trauma, anxiety, or any medical condition.
"""

import math
import numpy as np
from typing import Dict, Any, Union


def calibrate_audio_buffer(
    audio_data: Union[np.ndarray, bytes],
    sample_rate: int = 16000,
    clipping_threshold: float = 0.98,
    silence_threshold_ratio: float = 0.08,
) -> Dict[str, Any]:
    """
    Analyzes raw or normalized audio buffer and produces audio quality & calibration metrics.
    
    Returns structured calibration dictionary:
    {
        "audio_quality": "good" | "fair" | "poor",
        "noise_level": "low" | "moderate" | "high",
        "speech_detected": bool,
        "clipping_detected": bool,
        "speech_ratio": float,
        "snr_db": float,
        "input_volume_rms": float,
        "duration_seconds": float,
        "sampling_rate": int,
        "disclaimer": "Audio/conversational features only. Does not diagnose medical or mental-health conditions."
    }
    """
    if isinstance(audio_data, bytes):
        # Interpret 16-bit PCM bytes if raw bytes supplied
        if len(audio_data) % 2 != 0:
            audio_data = audio_data[: len(audio_data) - 1]
        if len(audio_data) == 0:
            return _empty_calibration_result(sample_rate)
        samples = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
    else:
        samples = np.asarray(audio_data, dtype=np.float32)
        if samples.ndim > 1:
            samples = np.mean(samples, axis=1)  # Convert stereo to mono

    if len(samples) == 0:
        return _empty_calibration_result(sample_rate)

    duration_sec = float(len(samples)) / float(sample_rate)

    # 1. Peak & Clipping Detection
    peak_amplitude = float(np.max(np.abs(samples)))
    clipping_detected = peak_amplitude >= clipping_threshold

    # 2. RMS Energy / Input Volume
    rms_energy = float(np.sqrt(np.mean(samples**2)))

    # 3. Frame-level energy for silence / speech ratio (20ms frames)
    frame_size = int(sample_rate * 0.02)
    if frame_size <= 0:
        frame_size = 320
    num_frames = len(samples) // frame_size

    if num_frames > 0:
        frames = samples[: num_frames * frame_size].reshape(num_frames, frame_size)
        frame_rms = np.sqrt(np.mean(frames**2, axis=1))

        # Dynamic noise floor: minimum or lowest percentile capped so high signal doesn't skew noise floor
        noise_floor = min(0.02, float(np.percentile(frame_rms, 5)))
        speech_threshold = max(0.015, noise_floor * 1.5)

        speech_frames = np.sum(frame_rms > speech_threshold)
        speech_ratio = round(float(speech_frames) / float(num_frames), 3)

        # Approximate SNR
        signal_rms = float(np.percentile(frame_rms, 90))
        if noise_floor > 1e-6:
            snr_val = 20 * math.log10(max(signal_rms, 1e-5) / max(noise_floor, 1e-5))
            snr_db = round(float(max(-10.0, min(snr_val, 60.0))), 1)
        else:
            snr_db = 35.0
    else:
        noise_floor = 0.005
        speech_ratio = 1.0 if rms_energy > 0.02 else 0.0
        snr_db = 25.0

    speech_detected = (speech_ratio > 0.10 or rms_energy > 0.02)

    # 4. Noise Level Classification
    if noise_floor < 0.015:
        noise_level = "low"
    elif noise_floor < 0.045:
        noise_level = "moderate"
    else:
        noise_level = "high"

    # 5. Audio Quality Classification
    if clipping_detected or snr_db < 5.0 or rms_energy < 0.002:
        audio_quality = "poor"
    elif noise_level == "high" or snr_db < 15.0:
        audio_quality = "fair"
    else:
        audio_quality = "good"

    return {
        "audio_quality": audio_quality,
        "noise_level": noise_level,
        "speech_detected": bool(speech_detected),
        "clipping_detected": bool(clipping_detected),
        "speech_ratio": speech_ratio,
        "snr_db": snr_db,
        "input_volume_rms": round(rms_energy, 4),
        "duration_seconds": round(duration_sec, 2),
        "sampling_rate": sample_rate,
        "disclaimer": "Audio/conversational features only. Does not diagnose stress, trauma, anxiety, or medical conditions.",
    }


def _empty_calibration_result(sample_rate: int) -> Dict[str, Any]:
    return {
        "audio_quality": "poor",
        "noise_level": "high",
        "speech_detected": False,
        "clipping_detected": False,
        "speech_ratio": 0.0,
        "snr_db": 0.0,
        "input_volume_rms": 0.0,
        "duration_seconds": 0.0,
        "sampling_rate": sample_rate,
        "disclaimer": "Audio/conversational features only. Does not diagnose stress, trauma, anxiety, or medical conditions.",
    }
