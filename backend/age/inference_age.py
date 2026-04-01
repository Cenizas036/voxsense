import os
import numpy as np
import librosa
import torch
from backend.models.age_model import AgeModel

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
MODEL_V2      = os.path.join(BASE_DIR, "age_model_v2.pth")
MODEL_DEFAULT = os.path.join(BASE_DIR, "age_model.pth")
MODEL_PATH    = MODEL_V2 if os.path.exists(MODEL_V2) else MODEL_DEFAULT

print("Loading Age Model:", MODEL_PATH)
try:
    _model = AgeModel().to(device)
    _checkpoint = torch.load(MODEL_PATH, map_location=device, weights_only=False)
    _model.load_state_dict(_checkpoint, strict=False)
    _model.eval()
    print("Age model: loaded (acoustic inference).")
except Exception as e:
    _model = None
    print(f"Age model: failed to load ({e}), using acoustic inference.")

AGE_LABELS = ["Child", "Young Adult", "Older Adult"]

CHILD_PITCH_THRESHOLD = 380


# ============================================================
# PITCH STATS
# ============================================================

def get_pitch_stats(audio: np.ndarray, sr: int) -> dict:
    try:
        f0, voiced_flag, _ = librosa.pyin(
            audio, fmin=60.0, fmax=600.0, sr=sr,
            frame_length=2048, hop_length=512,
        )
        voiced_f0 = f0[voiced_flag & ~np.isnan(f0)]

        if len(voiced_f0) < 3:
            return {"median": 0.0, "mean": 0.0, "std": 0.0,
                    "voiced_frac": 0.0, "tremor_ratio": 0.0}

        p15 = float(np.percentile(voiced_f0, 15))
        p85 = float(np.percentile(voiced_f0, 85))
        core = voiced_f0[(voiced_f0 >= p15) & (voiced_f0 <= p85)]
        if len(core) == 0:
            core = voiced_f0

        median_f0    = float(np.median(core))
        mean_f0      = float(np.mean(core))
        std_f0       = float(np.std(core))
        voiced_frac  = float(np.sum(voiced_flag) / max(len(voiced_flag), 1))
        tremor_ratio = std_f0 / max(mean_f0, 1.0)

        return {
            "median": median_f0, "mean": mean_f0, "std": std_f0,
            "voiced_frac": voiced_frac, "tremor_ratio": tremor_ratio,
        }
    except Exception:
        return {"median": 0.0, "mean": 0.0, "std": 0.0,
                "voiced_frac": 0.0, "tremor_ratio": 0.0}


# ============================================================
# PREDICT AGE — pure acoustic, no bias, no overrides
# ============================================================

def predict_age(audio: np.ndarray, sr: int) -> dict:
    """
    Pure acoustic age prediction. No friend model interaction.
    All three categories start at equal footing — features decide.
    """
    pitch        = get_pitch_stats(audio, sr)
    pitch_hz     = pitch["median"] if pitch["median"] > 0 else pitch["mean"]
    voiced_frac  = pitch["voiced_frac"]
    tremor_ratio = pitch["tremor_ratio"]

    centroid = float(np.mean(librosa.feature.spectral_centroid(y=audio, sr=sr)))
    zcr      = float(np.mean(librosa.feature.zero_crossing_rate(audio)))

    # All start equal — let features decide
    scores = {"Child": 1.0, "Young Adult": 1.0, "Older Adult": 1.0}

    # ── Child ────────────────────────────────────────────────
    if pitch_hz >= CHILD_PITCH_THRESHOLD:
        scores["Child"] += 6.0
    elif pitch_hz >= 320:
        scores["Child"] += 1.0

    if centroid > 3800 and pitch_hz > 300:
        scores["Child"] += 1.5

    # ── Older Adult ──────────────────────────────────────────
    # Tremor (pitch instability) — strongest cue for older voice
    if tremor_ratio > 0.22 and voiced_frac > 0.15:
        scores["Older Adult"] += 4.0
    elif tremor_ratio > 0.15 and voiced_frac > 0.15:
        scores["Older Adult"] += 2.0

    # Very low pitch = older male
    if 0 < pitch_hz < 100:
        scores["Older Adult"] += 3.0
    elif 0 < pitch_hz < 120:
        scores["Older Adult"] += 1.5

    # Dark spectrum = older voice
    if centroid < 1300:
        scores["Older Adult"] += 2.0
    elif centroid < 1600:
        scores["Older Adult"] += 1.0

    # Low ZCR = breathier = older
    if zcr < 0.03 and voiced_frac > 0.25:
        scores["Older Adult"] += 1.5

    # ── Young Adult ──────────────────────────────────────────
    # Stable pitch in normal range
    if 130 < pitch_hz < 290 and tremor_ratio < 0.12:
        scores["Young Adult"] += 3.0
    elif 120 < pitch_hz < 300 and tremor_ratio < 0.18:
        scores["Young Adult"] += 1.5

    # Bright, clear spectrum
    if centroid > 1800 and zcr > 0.05:
        scores["Young Adult"] += 1.5

    # Normal energy voice
    if 0.04 < zcr < 0.12:
        scores["Young Adult"] += 1.0

    # ── Normalize ────────────────────────────────────────────
    total = sum(scores.values())
    probs = {k: round(v / total, 4) for k, v in scores.items()}
    label = max(probs, key=probs.get)

    return {
        "age_group":     label,
        "confidence":    round(probs[label], 4),
        "method":        "acoustic",
        "probabilities": probs,
        "pitch_hz":      round(pitch_hz, 1),
    }