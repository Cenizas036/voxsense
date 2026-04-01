"""
audio_cleaning.py — Real noise reduction pipeline.
"""

import numpy as np
import librosa

try:
    import noisereduce as nr
    NOISEREDUCE_AVAILABLE = True
except ImportError:
    NOISEREDUCE_AVAILABLE = False
    print("[audio_cleaning] WARNING: noisereduce not installed. Run: pip install noisereduce")

from scipy.signal import butter, sosfilt


def remove_hum(audio: np.ndarray, sr: int) -> np.ndarray:
    hum_freqs = [50, 60, 100, 120, 150, 180, 200, 240]
    for freq in hum_freqs:
        if freq >= sr // 2:
            continue
        w0    = freq / (sr / 2)
        bw    = w0 / 35.0
        low   = max(w0 - bw / 2, 1e-6)
        high  = min(w0 + bw / 2, 0.9999)
        sos   = butter(2, [low, high], btype="bandstop", output="sos")
        audio = sosfilt(sos, audio).astype(np.float32)
    return audio


def remove_dc_offset(audio: np.ndarray) -> np.ndarray:
    return (audio - np.mean(audio)).astype(np.float32)


def apply_highpass(audio: np.ndarray, sr: int, cutoff: int = 80) -> np.ndarray:
    sos = butter(4, cutoff / (sr / 2), btype="high", output="sos")
    return sosfilt(sos, audio).astype(np.float32)


def spectral_noise_reduction(audio: np.ndarray, sr: int,
                              prop_decrease: float = 0.85) -> np.ndarray:
    if not NOISEREDUCE_AVAILABLE:
        return audio
    noise_sample_len = min(int(0.5 * sr), len(audio) // 4)
    noise_clip       = audio[:noise_sample_len]
    try:
        cleaned = nr.reduce_noise(
            y             = audio,
            sr            = sr,
            y_noise       = noise_clip,
            prop_decrease = prop_decrease,
            stationary    = False,
            n_fft         = 1024,
            hop_length    = 256,
        )
        return cleaned.astype(np.float32)
    except Exception as e:
        print(f"[audio_cleaning] noisereduce failed: {e} — returning original")
        return audio


def normalize_loudness(audio: np.ndarray, target_rms: float = 0.08) -> np.ndarray:
    rms = np.sqrt(np.mean(audio ** 2))
    if rms < 1e-8:
        return audio
    return (audio * (target_rms / rms)).astype(np.float32)


def clip_guard(audio: np.ndarray) -> np.ndarray:
    return np.clip(audio, -1.0, 1.0).astype(np.float32)


def enhance_audio(audio: np.ndarray, sr: int) -> np.ndarray:
    """
    Light enhancement: DC offset removal, hum removal, highpass filter,
    and gentle normalization. PRESERVES the noise character of the audio
    so that noise detection can work on it.
    Does NOT apply spectral noise reduction.
    """
    audio = audio.astype(np.float32)
    audio = remove_dc_offset(audio)
    audio = remove_hum(audio, sr)
    audio = apply_highpass(audio, sr, cutoff=80)
    audio = normalize_loudness(audio, target_rms=0.08)
    audio = clip_guard(audio)
    return audio


def extract_noise(enhanced: np.ndarray, sr: int) -> np.ndarray:
    """
    Extract the noise component from enhanced audio.
    Strategy: aggressively remove voice → subtract from enhanced → residual = noise.
    The residual contains the background noise that was present in the audio.
    """
    # Get voice-only via aggressive spectral subtraction
    voice_only = spectral_noise_reduction(enhanced, sr, prop_decrease=0.95)
    # Residual = enhanced - voice = noise component
    noise_residual = (enhanced - voice_only).astype(np.float32)
    # Normalize the noise so detection models can analyze it properly
    noise_rms = np.sqrt(np.mean(noise_residual ** 2))
    if noise_rms > 1e-8:
        noise_residual = normalize_loudness(noise_residual, target_rms=0.08)
    noise_residual = clip_guard(noise_residual)
    return noise_residual


def extract_voice(enhanced: np.ndarray, sr: int) -> np.ndarray:
    """
    Extract clean voice from enhanced audio by aggressive noise removal.
    This is what gets fed to age/gender/emotion inference models.
    """
    voice = spectral_noise_reduction(enhanced, sr, prop_decrease=0.92)
    voice = normalize_loudness(voice, target_rms=0.08)
    voice = clip_guard(voice)
    return voice


def detect_noise_environment(audio: np.ndarray, sr: int) -> str:
    """
    Rule-based noise environment classifier.
    Returns one of:
        clean | hum | wind | reverb | crowd | telephone |
        fan_ac | traffic | noisy
    
    Works on both raw and normalized audio by focusing on spectral
    SHAPE and temporal PATTERNS rather than absolute energy levels.
    """
    import logging
    _log = logging.getLogger("noise_detect")

    try:
        stft      = np.abs(librosa.stft(audio, n_fft=1024))
        freq_bins = librosa.fft_frequencies(sr=sr, n_fft=1024)

        low_energy  = float(np.mean(stft[freq_bins < 200]))
        mid_energy  = float(np.mean(stft[(freq_bins >= 200) & (freq_bins < 3000)]))
        high_energy = float(np.mean(stft[freq_bins >= 3000]))
        total_energy = low_energy + mid_energy + high_energy + 1e-10

        zcr      = float(np.mean(librosa.feature.zero_crossing_rate(audio)))
        rms      = float(np.sqrt(np.mean(audio ** 2)))
        flatness = float(np.mean(librosa.feature.spectral_flatness(y=audio)))

        centroid  = float(np.mean(librosa.feature.spectral_centroid(y=audio, sr=sr)))
        rolloff   = float(np.mean(librosa.feature.spectral_rolloff(y=audio, sr=sr)))

        # Frame-level RMS coefficient of variation — KEY feature
        # Steady noise: rms_cv < 0.3  |  Speech/music: rms_cv > 0.5
        frame_rms = librosa.feature.rms(y=audio, frame_length=1024, hop_length=512)[0]
        rms_cv = float(np.std(frame_rms) / (np.mean(frame_rms) + 1e-8))

        # Harmonic-to-noise ratio — speech/music has high HNR, noise has low
        y_harmonic, y_percussive = librosa.effects.hpss(audio)
        harmonic_energy = float(np.mean(y_harmonic ** 2))
        percussive_energy = float(np.mean(y_percussive ** 2))
        hnr = harmonic_energy / (percussive_energy + 1e-10)

        # Energy ratios (shape-based, works regardless of normalization)
        low_ratio  = low_energy / total_energy
        mid_ratio  = mid_energy / total_energy
        high_ratio = high_energy / total_energy

        _log.info(
            "[noise_detect] rms=%.4f rms_cv=%.3f zcr=%.4f flatness=%.4f "
            "centroid=%.0f rolloff=%.0f hnr=%.3f "
            "low=%.3f mid=%.3f high=%.3f",
            rms, rms_cv, zcr, flatness, centroid, rolloff, hnr,
            low_ratio, mid_ratio, high_ratio
        )

        # ── True silence ──
        if rms < 0.005:
            _log.info("[noise_detect] → clean (silence)")
            return "clean"

        # ── Electrical hum ──
        # Hum is very steady (low rms_cv) and has exact peaks at line frequencies
        if low_ratio > 0.5 and rms_cv < 0.4:
            hum_freqs = [50, 60, 100, 120]
            hum_peak_count = 0
            for hf in hum_freqs:
                if hf < sr // 2:
                    idx = np.argmin(np.abs(freq_bins - hf))
                    local_peak = float(np.max(stft[max(0, idx-1):idx+2]))
                    # Exclude the peak itself from the surrounding baseline average
                    left_avg = float(np.mean(stft[max(0, idx-8):max(0, idx-2)])) if idx > 2 else 0.0
                    right_avg = float(np.mean(stft[idx+3:idx+9]))
                    surrounding = (left_avg + right_avg) / 2.0
                    if surrounding > 1e-8 and (local_peak / surrounding) > 2.0:
                        hum_peak_count += 1
            if hum_peak_count >= 2:
                _log.info("[noise_detect] → hum (%d peaks)", hum_peak_count)
                return "hum"

        # ── Telephone / Compressed ──
        if high_ratio < 0.02 and rolloff < 4000:
            _log.info("[noise_detect] → telephone")
            return "telephone"

        # ── Wind (High ZCR + Low freq dominance) ──
        if zcr > 0.05 and low_ratio > 0.4:
            _log.info("[noise_detect] → wind")
            return "wind"

        # ── Fan / AC vs Traffic ──
        # Both are low-frequency dominant. Traffic is slightly wider/mid-heavy,
        # Fan/AC is very strictly heavy on the low end.
        if low_ratio > 0.45:
            _log.info("[noise_detect] → fan_ac (low_ratio > 0.45)")
            return "fan_ac"

        if low_ratio > 0.35 and centroid < 2500:
            _log.info("[noise_detect] → traffic (low_ratio > 0.35, low centroid)")
            return "traffic"

        # ── Crowd / Babble ──
        # Mid-frequency dominant (where human voices live) with variation
        if mid_ratio > 0.4:
            _log.info("[noise_detect] → crowd (mid_ratio > 0.4)")
            return "crowd"

        # ── Reverb ──
        if flatness > 0.25:
            _log.info("[noise_detect] → reverb (flatness > 0.25)")
            return "reverb"

        # ── Clean (Voice/Music Harmonic Tone) ──
        if hnr > 4.0:
            _log.info("[noise_detect] → clean (harmonic content)")
            return "clean"

        # ── Default: Noisy ──
        _log.info("[noise_detect] → noisy (default)")
        return "noisy"

    except Exception as e:
        _log.error("[noise_detect] Exception: %s", e)
        return "noisy"


def clean_audio(audio: np.ndarray, sr: int,
                aggressive: bool = False) -> np.ndarray:
    audio = audio.astype(np.float32)
    audio = remove_dc_offset(audio)
    audio = remove_hum(audio, sr)
    audio = apply_highpass(audio, sr, cutoff=80)
    prop  = 0.92 if aggressive else 0.80
    audio = spectral_noise_reduction(audio, sr, prop_decrease=prop)
    audio = normalize_loudness(audio, target_rms=0.08)
    audio = clip_guard(audio)
    return audio
