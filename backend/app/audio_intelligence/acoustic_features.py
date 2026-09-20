"""
Acoustic Speech Feature Extraction Module for NHAA Voice Pipeline.
Extracts measurable audio properties (MFCCs, spectral energy, pause ratios, pitch variation).

DISCLAIMER: These are merely measurable audio features.
Do not make simplistic claims such as "high pitch means trauma" or "long pauses mean fear."
They are objective conversational features for feature fusion and prioritization.
"""

import math
import numpy as np
from typing import Dict, Any, Union, Optional

try:
    import librosa
    HAS_LIBROSA = True
except Exception:
    HAS_LIBROSA = False


def extract_acoustic_features(
    audio_data: Union[np.ndarray, bytes],
    sample_rate: int = 16000,
    transcript_word_count: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Extracts acoustic speech features from raw PCM bytes or float numpy array.
    
    Returns:
    {
        "speech_duration": float,
        "pause_ratio": float,
        "rms_energy": float,
        "speech_rate": float,
        "pitch_variation": float,
        "zero_crossing_rate": float,
        "spectral_centroid": float,
        "spectral_bandwidth": float,
        "mfcc_means": list[float],
        "speech_to_silence_ratio": float,
        "disclaimer": "Objective audio features only. Does not diagnose trauma, distress, or medical conditions."
    }
    """
    if isinstance(audio_data, bytes):
        if len(audio_data) % 2 != 0:
            audio_data = audio_data[: len(audio_data) - 1]
        if len(audio_data) == 0:
            return _default_features()
        y = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
    else:
        y = np.asarray(audio_data, dtype=np.float32)
        if y.ndim > 1:
            y = np.mean(y, axis=1)

    total_len = len(y)
    if total_len == 0:
        return _default_features()

    duration_sec = round(float(total_len) / float(sample_rate), 2)

    # 1. RMS Energy
    rms_val = float(np.sqrt(np.mean(y**2)))

    # 2. Zero Crossing Rate
    signs = np.sign(y)
    zero_crossings = np.sum(np.abs(signs[1:] - signs[:-1]) > 0)
    zcr = float(zero_crossings) / float(total_len) if total_len > 1 else 0.0

    # 3. Framing & Pause Analysis (30ms frames with 15ms hop)
    frame_len = int(sample_rate * 0.03)
    hop_len = int(sample_rate * 0.015)

    num_hops = max(1, (total_len - frame_len) // hop_len)
    frame_energies = []
    for i in range(num_hops):
        start = i * hop_len
        end = start + frame_len
        if end <= total_len:
            frame = y[start:end]
            frame_energies.append(np.sqrt(np.mean(frame**2)))

    frame_energies = np.array(frame_energies) if frame_energies else np.array([rms_val])
    silence_threshold = max(0.012, float(np.percentile(frame_energies, 15)) * 1.8)

    silent_frames = np.sum(frame_energies < silence_threshold)
    active_frames = len(frame_energies) - silent_frames

    pause_ratio = round(float(silent_frames) / float(len(frame_energies)), 3)
    speech_duration = round(float(active_frames * hop_len) / float(sample_rate), 2)

    speech_to_silence = (
        round(float(active_frames) / float(max(1, silent_frames)), 2)
        if silent_frames > 0
        else 10.0
    )

    # 4. Approximate Speech Rate (words/sec or syllables/sec)
    if transcript_word_count and transcript_word_count > 0 and speech_duration > 0.5:
        speech_rate = round(float(transcript_word_count) / speech_duration, 2)
    else:
        # Acoustic energy peak estimation as proxy for syllabic rate
        peaks = 0
        for k in range(1, len(frame_energies) - 1):
            if (
                frame_energies[k] > frame_energies[k - 1]
                and frame_energies[k] > frame_energies[k + 1]
                and frame_energies[k] > silence_threshold
            ):
                peaks += 1
        speech_rate = (
            round(float(peaks) / max(1.0, speech_duration), 2)
            if speech_duration > 0
            else 0.0
        )

    # 5. Spectral Features & MFCC via librosa if available, else numpy FFT
    spectral_centroid = 1250.0
    spectral_bandwidth = 1400.0
    mfcc_means = [0.0] * 13
    pitch_variation = 0.20

    if HAS_LIBROSA and total_len >= sample_rate * 0.2:
        try:
            # MFCCs
            mfccs = librosa.feature.mfcc(y=y, sr=sample_rate, n_mfcc=13)
            mfcc_means = [round(float(v), 2) for v in np.mean(mfccs, axis=1)]

            # Spectral Centroid & Bandwidth
            sc = librosa.feature.spectral_centroid(y=y, sr=sample_rate)
            spectral_centroid = round(float(np.mean(sc)), 1)

            sb = librosa.feature.spectral_bandwidth(y=y, sr=sample_rate)
            spectral_bandwidth = round(float(np.mean(sb)), 1)

            # Pitch via pyin or yin
            f0 = librosa.yin(y=y, fmin=50, fmax=400, sr=sample_rate)
            f0_valid = f0[f0 > 60]
            if len(f0_valid) > 5:
                pitch_variation = round(float(np.std(f0_valid) / max(1.0, np.mean(f0_valid))), 3)
        except Exception:
            pass
    else:
        # Fast FFT-based spectral approximation
        fft_vals = np.abs(np.fft.rfft(y[: min(total_len, 4096)]))
        freqs = np.fft.rfftfreq(min(total_len, 4096), 1.0 / sample_rate)
        sum_fft = np.sum(fft_vals)
        if sum_fft > 1e-6:
            spectral_centroid = round(float(np.sum(freqs * fft_vals) / sum_fft), 1)
            spectral_bandwidth = round(
                float(np.sqrt(np.sum(((freqs - spectral_centroid) ** 2) * fft_vals) / sum_fft)),
                1,
            )

    return {
        "speech_duration": speech_duration,
        "pause_ratio": pause_ratio,
        "rms_energy": round(rms_val, 4),
        "speech_rate": speech_rate,
        "pitch_variation": pitch_variation,
        "zero_crossing_rate": round(zcr, 4),
        "spectral_centroid": spectral_centroid,
        "spectral_bandwidth": spectral_bandwidth,
        "mfcc_means": mfcc_means,
        "speech_to_silence_ratio": speech_to_silence,
        "disclaimer": "Objective audio features only. Does not diagnose trauma, distress, or medical conditions.",
    }


def _default_features() -> Dict[str, Any]:
    return {
        "speech_duration": 0.0,
        "pause_ratio": 0.0,
        "rms_energy": 0.0,
        "speech_rate": 0.0,
        "pitch_variation": 0.0,
        "zero_crossing_rate": 0.0,
        "spectral_centroid": 0.0,
        "spectral_bandwidth": 0.0,
        "mfcc_means": [0.0] * 13,
        "speech_to_silence_ratio": 0.0,
        "disclaimer": "Objective audio features only. Does not diagnose trauma, distress, or medical conditions.",
    }
