import os
import numpy as np
import librosa
import torch
import torch.nn.functional as F
from scipy.signal import butter, lfilter

from models.song_speech_model import SongSpeechModel

# ============================================================
# DEVICE
# ============================================================

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ============================================================
# LOAD MODEL
# ============================================================

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "cnn_song_speech.pth")

model = SongSpeechModel().to(device)

checkpoint = torch.load(MODEL_PATH, map_location=device, weights_only=False)

remapped = {}
for k, v in checkpoint.items():
    if k.startswith("features."):
        remapped["backbone." + k] = v
    elif k.startswith("classifier."):
        remapped[k] = v
    else:
        remapped[k] = v

model.load_state_dict(remapped, strict=False)
model.eval()

# ============================================================
# BANDPASS FILTER
# ============================================================

def bandpass_filter(audio, sr, lowcut=300, highcut=4000, order=5):
    nyquist = 0.5 * sr
    low     = lowcut / nyquist
    high    = highcut / nyquist
    b, a    = butter(order, [low, high], btype="band")
    return lfilter(b, a, audio)

# ============================================================
# PREPROCESS FOR CNN
# ============================================================

def preprocess_audio(audio, sr):
    target_length = 22050 * 5

    if sr != 22050:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=22050)
        sr    = 22050

    audio = bandpass_filter(audio, sr)

    if len(audio) < target_length:
        audio = np.pad(audio, (0, target_length - len(audio)))
    else:
        audio = audio[:target_length]

    audio  = librosa.util.normalize(audio)
    mel    = librosa.feature.melspectrogram(y=audio, sr=sr, n_mels=128, hop_length=512)
    mel_db = librosa.power_to_db(mel, ref=np.max)

    if mel_db.shape[1] < 216:
        mel_db = np.pad(mel_db, ((0, 0), (0, 216 - mel_db.shape[1])))
    else:
        mel_db = mel_db[:, :216]

    mel_db = np.expand_dims(mel_db, axis=0)
    mel_db = np.expand_dims(mel_db, axis=0)

    return torch.tensor(mel_db, dtype=torch.float32).to(device)


# ============================================================
# STAGE 0: STRONG MUSIC DETECTOR
# Runs FIRST — catches songs with vocals before speech veto
# fires on the vocal content.
# Returns (True, score, reason) if audio is almost certainly music.
# ============================================================

def is_definitely_music(audio, sr):
    """
    Detects musical properties that exist even in vocal songs:
    - Beat regularity (songs have consistent tempo)
    - Chroma stability (songs stay on musical notes)
    - Strong harmonic content
    - Low spectral flatness sustained over time
    Returns (bool, score 0-1, reason string)
    """
    score = 0.0
    reasons = []

    # --- Feature 1: Beat strength and regularity ---
    # Songs have a strong, regular beat. Speech has almost none.
    try:
        onset_env = librosa.onset.onset_strength(y=audio, sr=sr)
        tempo_arr = librosa.feature.tempo(onset_envelope=onset_env, sr=sr)
        tempo_val = float(tempo_arr[0]) if hasattr(tempo_arr, '__len__') else float(tempo_arr)

        # Measure beat regularity via autocorrelation of onset envelope
        ac = np.correlate(onset_env, onset_env, mode='full')
        ac = ac[len(ac)//2:]
        ac = ac / (ac[0] + 1e-6)

        # Find peak in range corresponding to 60-180 BPM
        fps = sr / 512  # onset frames per second
        lo = int(fps * 60 / 180)
        hi = int(fps * 60 / 60)
        lo = max(1, lo)
        hi = min(hi, len(ac) - 1)

        beat_peak = float(np.max(ac[lo:hi])) if hi > lo else 0.0

        if beat_peak > 0.35:
            score += 0.35
            reasons.append(f"beat_peak={beat_peak:.2f}")
        elif beat_peak > 0.20:
            score += 0.15
            reasons.append(f"weak_beat={beat_peak:.2f}")
    except Exception:
        beat_peak = 0.0

    # --- Feature 2: Chroma stability ---
    # Music stays on musical notes → low chroma variance over time.
    # Speech has no stable pitch class → high chroma variance.
    try:
        chroma = librosa.feature.chroma_cqt(y=audio, sr=sr)
        # Mean std across each chroma bin over time
        chroma_std = float(np.mean(np.std(chroma, axis=1)))

        if chroma_std < 0.10:
            score += 0.30
            reasons.append(f"chroma_stable={chroma_std:.3f}")
        elif chroma_std < 0.15:
            score += 0.15
            reasons.append(f"chroma_moderate={chroma_std:.3f}")
    except Exception:
        chroma_std = 1.0

    # --- Feature 3: Harmonic-to-percussive ratio ---
    try:
        harmonic, percussive = librosa.effects.hpss(audio)
        h_energy = float(np.mean(np.abs(harmonic)))
        p_energy = float(np.mean(np.abs(percussive))) + 1e-6
        ratio = h_energy / p_energy

        if ratio > 4.0:
            score += 0.20
            reasons.append(f"harmonic_ratio={ratio:.2f}")
        elif ratio > 2.5:
            score += 0.10
            reasons.append(f"harmonic_moderate={ratio:.2f}")
    except Exception:
        ratio = 0.0

    # --- Feature 4: Spectral flatness consistency ---
    # Music has sustained tonal sections (very low flatness).
    # Even vocal songs have instrumental sections with very low flatness.
    try:
        flatness_frames = librosa.feature.spectral_flatness(y=audio)[0]
        # Fraction of frames that are tonal (flatness < 0.01)
        tonal_fraction = float(np.mean(flatness_frames < 0.01))

        if tonal_fraction > 0.40:
            score += 0.15
            reasons.append(f"tonal_fraction={tonal_fraction:.2f}")
        elif tonal_fraction > 0.25:
            score += 0.08
    except Exception:
        tonal_fraction = 0.0

    reason_str = ", ".join(reasons) if reasons else "no strong music features"

    # Score >= 0.60 means at least 2-3 strong music indicators agree
    return score >= 0.60, score, reason_str


# ============================================================
# STAGE 1: SPEECH VETO
# Only runs if music detector didn't fire.
# Returns True if audio is almost certainly speech.
# ============================================================

def is_definitely_speech(audio, sr):
    """
    Hard rules that fire immediately if any strong speech indicator
    is found. Only called after music detector passes (returned False).
    """

    # Rule 1: High spectral flatness = noisy/speech, not tonal music
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=audio)))
    if flatness > 0.025:
        return True, f"flatness={flatness:.4f} > 0.025"

    # Rule 2: High zero crossing rate = consonants/fricatives in speech
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(audio)))
    if zcr > 0.10:
        return True, f"zcr={zcr:.4f} > 0.10"

    # Rule 3: Pitch irregularity — speech pitch is erratic, singing stays on notes
    try:
        f0, voiced_flag, _ = librosa.pyin(
            audio, fmin=60, fmax=500, sr=sr,
            frame_length=2048, hop_length=512
        )
        voiced_f0 = f0[voiced_flag == 1] if voiced_flag is not None else np.array([])

        if len(voiced_f0) > 10:
            # Coefficient of variation — speech has high CV, singing is stable
            cv = float(np.std(voiced_f0) / (np.mean(voiced_f0) + 1e-6))
            if cv > 0.35:
                return True, f"pitch_cv={cv:.3f} > 0.35 (erratic pitch = speech)"

            # Voiced ratio — speech has many unvoiced frames (consonants)
            voiced_ratio = np.sum(voiced_flag) / (len(voiced_flag) + 1e-6)
            if voiced_ratio < 0.45:
                return True, f"voiced_ratio={voiced_ratio:.2f} < 0.45 (many unvoiced = speech)"
    except Exception:
        pass

    # Rule 4: Low harmonic dominance
    harmonic, percussive = librosa.effects.hpss(audio)
    h_energy = float(np.mean(np.abs(harmonic)))
    p_energy = float(np.mean(np.abs(percussive))) + 1e-6
    ratio = h_energy / p_energy
    if ratio < 1.8:
        return True, f"harmonic_ratio={ratio:.2f} < 1.8"

    return False, "passed all speech veto checks"


# ============================================================
# STAGE 2: MUSIC CONFIDENCE SCORE
# Only reached if speech veto also didn't fire.
# ============================================================

def compute_music_confidence(audio, sr):
    votes = []

    flatness = float(np.mean(librosa.feature.spectral_flatness(y=audio)))
    votes.append(1.0 if flatness < 0.008 else
                 0.7 if flatness < 0.015 else
                 0.3)

    harmonic, percussive = librosa.effects.hpss(audio)
    ratio = float(np.mean(np.abs(harmonic))) / (float(np.mean(np.abs(percussive))) + 1e-6)
    votes.append(1.0 if ratio > 5.0 else
                 0.7 if ratio > 3.0 else
                 0.4)

    chroma = librosa.feature.chroma_stft(y=audio, sr=sr)
    chroma_var = float(np.mean(np.std(chroma, axis=1)))
    votes.append(1.0 if chroma_var < 0.12 else
                 0.6 if chroma_var < 0.18 else
                 0.2)

    zcr = float(np.mean(librosa.feature.zero_crossing_rate(audio)))
    votes.append(1.0 if zcr < 0.04 else
                 0.6 if zcr < 0.07 else
                 0.2)

    from functools import reduce
    import operator
    product = reduce(operator.mul, votes, 1.0)
    confidence = product ** (1.0 / len(votes))

    return confidence, votes


# ============================================================
# MAIN PREDICTION
# ============================================================

def predict_song_or_speech(audio, sr):

    duration = len(audio) / sr

    # Under 2 seconds — not enough signal, always speech
    if duration < 2.0:
        return {
            "label":         "speech",
            "confidence":    0.93,
            "probabilities": [[0.93, 0.07]]
        }

    # ── STAGE 0: Strong music detector (runs FIRST) ──────────
    # This catches songs with vocals before the speech veto
    # incorrectly fires on the vocal content.
    is_music, music_score, music_reason = is_definitely_music(audio, sr)

    if is_music:
        final_conf = round(min(0.95, 0.75 + music_score * 0.20), 2)
        return {
            "label":         "song",
            "confidence":    final_conf,
            "probabilities": [[round(1 - final_conf, 2), final_conf]]
        }

    # ── STAGE 1: Speech veto (only if music detector didn't fire) ──
    speech_veto, veto_reason = is_definitely_speech(audio, sr)

    if speech_veto:
        return {
            "label":         "speech",
            "confidence":    0.88,
            "probabilities": [[0.88, 0.12]]
        }

    # ── STAGE 2: Music confirmation score ────────────────────
    music_conf, votes = compute_music_confidence(audio, sr)

    if music_conf < 0.55:
        return {
            "label":         "speech",
            "confidence":    round(0.65 + (0.55 - music_conf) * 0.5, 2),
            "probabilities": [[round(0.65 + (0.55 - music_conf) * 0.5, 2),
                               round(0.35 - (0.55 - music_conf) * 0.5, 2)]]
        }

    # ── STAGE 3: CNN confirms music (ambiguous zone 0.55-0.75) ──
    if music_conf < 0.75:
        with torch.no_grad():
            input_tensor  = preprocess_audio(audio, sr)
            output        = model(input_tensor)
            probabilities = F.softmax(output, dim=1)
            cnn_conf, predicted = torch.max(probabilities, 1)

        cnn_label = "speech" if predicted.item() == 0 else "song"
        cnn_conf  = float(cnn_conf.item())

        if cnn_label == "song" and cnn_conf < 0.80:
            return {
                "label":         "speech",
                "confidence":    0.70,
                "probabilities": [[0.70, 0.30]]
            }

        if cnn_label == "speech":
            return {
                "label":         "speech",
                "confidence":    cnn_conf,
                "probabilities": probabilities.cpu().numpy().tolist()
            }

        final_conf = round((music_conf + cnn_conf) / 2.0, 2)
        return {
            "label":         "song",
            "confidence":    final_conf,
            "probabilities": [[round(1 - final_conf, 2), final_conf]]
        }

    # ── STAGE 4: Strong music signal — acoustics alone sufficient ──
    final_conf = round(min(0.95, 0.75 + (music_conf - 0.75) * 0.8), 2)
    return {
        "label":         "song",
        "confidence":    final_conf,
        "probabilities": [[round(1 - final_conf, 2), final_conf]]
    }
