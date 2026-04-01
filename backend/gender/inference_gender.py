import os
import numpy as np
import librosa
import torch
from models.gender_model import GenderModel

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
MODEL_V2      = os.path.join(BASE_DIR, "gender_model_v2.pth")
MODEL_DEFAULT = os.path.join(BASE_DIR, "gender_model.pth")
MODEL_PATH    = MODEL_V2 if os.path.exists(MODEL_V2) else MODEL_DEFAULT

print("Loading Gender Model:", MODEL_PATH)
model = GenderModel().to(device)
checkpoint = torch.load(MODEL_PATH, map_location=device, weights_only=False)
try:
    model.load_state_dict(checkpoint, strict=True)
    print("Gender model: full checkpoint loaded (strict).")
except RuntimeError:
    filtered = {}
    for k, v in checkpoint.items():
        if k.startswith("features."):
            filtered["backbone." + k] = v
        else:
            filtered[k] = v
    model.load_state_dict(filtered, strict=False)
    print("Gender model: partial load.")
model.eval()


# ============================================================
# PITCH EXTRACTION
# ============================================================

def extract_pitch(audio: np.ndarray, sr: int) -> dict:
    try:
        f0, voiced_flag, _ = librosa.pyin(
            audio,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C6"),
            sr=sr, frame_length=2048, hop_length=512,
        )
        if voiced_flag is None or not voiced_flag.any():
            return {"mean": 0.0, "median": 0.0, "voiced_frac": 0.0}

        voiced_f0 = f0[voiced_flag]

        if len(voiced_f0) >= 5:
            p20 = float(np.percentile(voiced_f0, 20))
            p80 = float(np.percentile(voiced_f0, 80))
            core_f0 = voiced_f0[(voiced_f0 >= p20) & (voiced_f0 <= p80)]
            median_f0 = float(np.median(core_f0)) if len(core_f0) > 0 else float(np.median(voiced_f0))
        else:
            median_f0 = float(np.median(voiced_f0))

        return {
            "mean":        float(np.mean(voiced_f0)),
            "median":      median_f0,
            "voiced_frac": float(np.sum(voiced_flag) / max(len(voiced_flag), 1)),
        }
    except Exception:
        return {"mean": 0.0, "median": 0.0, "voiced_frac": 0.0}


# ============================================================
# SPECTRAL GENDER SCORE
# positive = Male evidence, negative = Female evidence
# ============================================================

def spectral_gender_score(audio: np.ndarray, sr: int) -> float:
    stft    = np.abs(librosa.stft(audio, n_fft=2048, hop_length=512))
    freqs   = librosa.fft_frequencies(sr=sr, n_fft=2048)

    low_mask  = freqs < 1000
    high_mask = freqs > 1000

    low_energy  = float(np.mean(stft[low_mask, :]))
    high_energy = float(np.mean(stft[high_mask, :]))
    total       = low_energy + high_energy + 1e-8
    low_ratio   = low_energy / total

    centroid = float(np.mean(librosa.feature.spectral_centroid(y=audio, sr=sr)))

    score = 0.0

    if low_ratio > 0.58:
        score += 1.0
    elif low_ratio > 0.52:
        score += 0.4
    elif low_ratio < 0.45:
        score -= 1.0
    elif low_ratio < 0.50:
        score -= 0.4

    if centroid < 1600:
        score += 1.0
    elif centroid < 2000:
        score += 0.3
    elif centroid > 2400:
        score -= 1.0
    elif centroid > 2000:
        score -= 0.3

    return score


# ============================================================
# AUDIO PREPROCESSING FOR CNN
# ============================================================

def preprocess_audio(audio: np.ndarray, sr: int) -> torch.Tensor:
    target_length = 22050 * 5
    if sr != 22050:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=22050)
        sr = 22050
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
    mel_db = np.expand_dims(mel_db, 0)
    mel_db = np.expand_dims(mel_db, 0)
    return torch.tensor(mel_db, dtype=torch.float32).to(device)


# ============================================================
# PREDICT GENDER — CNN + pitch + spectral, balanced for female
#
# Pitch reference ranges (conversational speech):
#   Male typical:    85–180 Hz  (mean ~120 Hz)
#   Female typical: 165–255 Hz  (mean ~210 Hz)
#   Overlap zone:   165–180 Hz  ← spectral score breaks the tie
#
# BUG FIXED: The old code forced Male for pitch < 175 Hz whenever
# spec_score >= -0.3 (which is nearly always true). This caused
# low-pitched women (165-175 Hz, very common) to be misclassified.
# The fix:
#   1. Lowered the hard Male cutoff from 145 → 130 Hz
#   2. In the 130–165 Hz zone, require STRONG male spectral evidence
#      (spec_score > 0.5) before overriding a female CNN prediction
#   3. Added a genuine overlap zone (165–185 Hz) that uses CNN +
#      spectral blending instead of defaulting to Male
#   4. Hard Female cutoff raised from 225 → 210 Hz
# ============================================================

def predict_gender(audio: np.ndarray, sr: int) -> dict:
    """
    CNN + pitch + spectral gender prediction.
    Balanced to not over-classify females as male.
    """
    # ── CNN prediction ────────────────────────────────────────
    with torch.no_grad():
        tensor = preprocess_audio(audio, sr)
        output = model(tensor)
        probs  = torch.softmax(output, dim=1).cpu().numpy()[0]

    male_prob   = float(probs[0])
    female_prob = float(probs[1])
    cnn_label   = "Female" if female_prob > male_prob else "Male"
    cnn_conf    = max(male_prob, female_prob)

    # ── Pitch ─────────────────────────────────────────────────
    pitch       = extract_pitch(audio, sr)
    mean_f0     = pitch["mean"]
    median_f0   = pitch["median"]
    voiced_frac = pitch["voiced_frac"]
    reliable_f0 = median_f0 if median_f0 > 0 else mean_f0

    # ── Spectral score (+ = male evidence, - = female evidence) ─
    spec_score = spectral_gender_score(audio, sr)

    # ── Defaults: trust CNN if pitch is unreliable ────────────
    final_label = cnn_label
    final_conf  = cnn_conf
    method      = "cnn"

    if voiced_frac > 0.15 and reliable_f0 > 0:

        # ── Zone 1: Definitely Male (< 130 Hz) ───────────────
        # No biological female speaks this low in normal speech
        if reliable_f0 < 130.0:
            final_label = "Male"
            final_conf  = min(0.97, 0.85 + (130.0 - reliable_f0) / 150.0)
            method      = "pitch"

        # ── Zone 2: Very likely Male (130–165 Hz) ─────────────
        # Mostly male range, but a small number of very low-pitched
        # women land here. Only override CNN→Female if spectral
        # evidence is also clearly male (spec_score > 0.5).
        elif reliable_f0 < 165.0:
            if cnn_label == "Male" or spec_score > 0.5:
                final_label = "Male"
                final_conf  = min(0.92, 0.72 + (165.0 - reliable_f0) / 200.0)
                method      = "pitch+spectral"
            else:
                # CNN says Female AND spectral is ambiguous/female → trust CNN
                final_label = "Female"
                final_conf  = max(0.60, cnn_conf)
                method      = "cnn_over_pitch"

        # ── Zone 3: Overlap / ambiguous (165–185 Hz) ──────────
        # True overlap zone. Use spectral score to break the tie,
        # but respect CNN when spectral is ambiguous.
        elif reliable_f0 < 185.0:
            if spec_score > 0.6:
                final_label = "Male"
                final_conf  = 0.68
                method      = "spectral"
            elif spec_score < -0.4:
                final_label = "Female"
                final_conf  = 0.68
                method      = "spectral"
            else:
                # Blend: slight female lean since pitch is already above male mean
                blend_female = female_prob + 0.08
                blend_male   = male_prob - 0.08
                if blend_female > blend_male:
                    final_label = "Female"
                    final_conf  = min(0.80, blend_female)
                else:
                    final_label = "Male"
                    final_conf  = min(0.80, blend_male)
                method = "cnn+pitch_blend"

        # ── Zone 4: Very likely Female (185–215 Hz) ───────────
        # Mostly female range, but some male tenors/countertenors exist.
        # Only override CNN→Male if spectral evidence is also female.
        elif reliable_f0 < 215.0:
            if cnn_label == "Female" or spec_score < -0.5:
                final_label = "Female"
                final_conf  = min(0.92, 0.72 + (reliable_f0 - 185.0) / 200.0)
                method      = "pitch+spectral"
            else:
                # CNN says Male AND spectral is ambiguous/male → trust CNN
                final_label = "Male"
                final_conf  = max(0.60, cnn_conf)
                method      = "cnn_over_pitch"

        # ── Zone 5: Definitely Female (>= 215 Hz) ─────────────
        # No biological male speaks this high in normal speech
        else:
            final_label = "Female"
            final_conf  = min(0.97, 0.85 + (reliable_f0 - 215.0) / 200.0)
            method      = "pitch"

    return {
        "gender":        final_label,
        "confidence":    round(final_conf, 4),
        "method":        method,
        "probabilities": {"male": round(male_prob, 4), "female": round(female_prob, 4)},
        "pitch_hz":      round(reliable_f0, 1),
    }
