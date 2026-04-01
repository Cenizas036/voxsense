import os
import numpy as np
import librosa
import torch
from backend.models.emotion_model import EmotionModel

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "emotion_model.pth")

EMOTION_LABELS = ["neutral", "happy", "sad", "angry", "fear", "disgust", "surprise"]
EMOTION_EMOJI  = {
    "neutral":"😐","happy":"😊","sad":"😢",
    "angry":"😠","fear":"😨","disgust":"🤢","surprise":"😲",
}

# ============================================================
# LOAD MODEL — strict health check
# Model is ONLY used if it shows meaningful probability spread
# across multiple classes on a random input
# ============================================================

_model_ok = False
model     = None

if os.path.exists(MODEL_PATH):
    try:
        model = EmotionModel(num_classes=7).to(device)
        model.load_state_dict(torch.load(MODEL_PATH, map_location=device, weights_only=False), strict=False)
        model.eval()

        # Run 5 different random inputs and check class diversity
        dominant_counts = []
        with torch.no_grad():
            for _ in range(5):
                dummy   = torch.randn(1, 1, 128, 216).to(device)
                probs   = torch.softmax(model(dummy), dim=1).cpu().numpy()[0]
                dominant_counts.append(float(np.max(probs)))

        avg_dominance = float(np.mean(dominant_counts))

        # Healthy model: average max prob < 0.65 (spread across classes)
        # Biased model:  average max prob > 0.65 (always same class)
        if avg_dominance < 0.65:
            _model_ok = True
            print(f"Emotion model: loaded and healthy (avg dominance={avg_dominance:.2f}).")
        else:
            dominant_class = EMOTION_LABELS[int(np.argmax(
                torch.softmax(model(torch.randn(1,1,128,216).to(device)), dim=1).cpu().numpy()[0]
            ))]
            print(f"Emotion model: BIASED (avg dominance={avg_dominance:.2f}, "
                  f"defaults to '{dominant_class}'). Using acoustic fallback.")
            model = None

    except Exception as e:
        print(f"Emotion model load failed: {e}")
        model = None
else:
    print("Emotion model not found, using acoustic fallback.")


# ============================================================
# AUDIO PREPROCESSING
# ============================================================

def preprocess_audio(audio: np.ndarray, sr: int) -> torch.Tensor:
    target_length = 22050 * 5
    if sr != 22050:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=22050)
        sr    = 22050
    if len(audio) < target_length:
        audio = np.pad(audio, (0, target_length - len(audio)))
    else:
        audio = audio[:target_length]
    audio  = librosa.util.normalize(audio)
    mel    = librosa.feature.melspectrogram(y=audio, sr=sr, n_mels=128, hop_length=512)
    mel_db = librosa.power_to_db(mel, ref=np.max)
    if mel_db.shape[1] < 216:
        mel_db = np.pad(mel_db, ((0,0),(0, 216 - mel_db.shape[1])))
    else:
        mel_db = mel_db[:, :216]
    return torch.tensor(
        np.expand_dims(np.expand_dims(mel_db, 0), 0),
        dtype=torch.float32
    ).to(device)


# ============================================================
# ACOUSTIC EMOTION — primary fallback, well-tuned
# ============================================================

def acoustic_emotion(audio: np.ndarray, sr: int) -> dict:
    """
    Rule-based emotion detection using real acoustic correlates.

    Key insight — human emotion acoustics:
      Happy    : mid-high energy, HIGH pitch variation, fast speech, bright
      Angry    : HIGH energy, HIGH ZCR, harsh spectral content
      Sad      : LOW energy, LOW pitch, very low variation, slow
      Neutral  : moderate everything, low variation
      Fear     : HIGH pitch, breathy, erratic rhythm
      Surprise : sudden energy burst, very high pitch jump
      Disgust  : low energy, monotone, low pitch
    """

    # ── Core features ─────────────────────────────────────────
    rms        = float(np.sqrt(np.mean(audio**2)))
    rms_frames = librosa.feature.rms(y=audio)[0]
    energy_var = float(np.std(rms_frames))
    energy_max = float(np.max(rms_frames))

    try:
        f0, vf, _ = librosa.pyin(
            audio, fmin=65, fmax=1047, sr=sr,
            frame_length=2048, hop_length=512
        )
        vf0         = f0[vf] if (vf is not None and vf.any()) else np.array([130.0])
        mean_f0     = float(np.mean(vf0))
        f0_var      = float(np.std(vf0))
        voiced_frac = float(np.sum(vf) / max(len(vf), 1)) if vf is not None else 0.5
    except Exception:
        mean_f0 = 130.0
        f0_var  = 20.0
        voiced_frac = 0.5

    centroid = float(np.mean(librosa.feature.spectral_centroid(y=audio, sr=sr)))
    zcr      = float(np.mean(librosa.feature.zero_crossing_rate(audio)))

    # ── Score initialisation ──────────────────────────────────
    s = {
        "neutral":  1.0,
        "happy":    0.8,   # slightly favour positive — real speech leans positive
        "sad":      0.4,
        "angry":    0.4,
        "fear":     0.2,
        "disgust":  0.2,   # disgust is rare in real conversation — low prior
        "surprise": 0.3,
    }

    # ── Energy (most reliable single cue) ─────────────────────
    # High energy = active emotion (happy/angry/surprise)
    # Low energy  = passive emotion (sad/neutral/disgust)
    if rms > 0.22:
        # Very high energy — angry or very excited
        s["angry"]    += 3.5
        s["happy"]    += 2.0
        s["surprise"] += 1.5
    elif rms > 0.14:
        # High energy — happy, engaged, slightly angry
        s["happy"]    += 3.0
        s["angry"]    += 1.5
        s["surprise"] += 1.0
        s["neutral"]  += 0.5
    elif rms > 0.07:
        # Moderate energy — neutral or mildly happy
        s["neutral"]  += 2.5
        s["happy"]    += 1.5
        s["sad"]      += 0.5
    else:
        # Low energy — sad, neutral, disgust
        s["sad"]      += 3.0
        s["neutral"]  += 1.5
        s["disgust"]  += 1.0

    # ── Energy dynamics (variation matters a lot) ─────────────
    # Emotional speech has big energy swings; monotone doesn't
    if energy_var > 0.10:
        s["happy"]    += 2.0
        s["angry"]    += 1.5
        s["surprise"] += 1.0
    elif energy_var > 0.05:
        s["happy"]    += 1.0
        s["neutral"]  += 0.5
    else:
        # Very flat energy = monotone = sad/neutral/disgust
        s["neutral"]  += 1.5
        s["sad"]      += 1.0
        s["disgust"]  += 0.5

    # ── Pitch height ──────────────────────────────────────────
    # High pitch = excited/scared; low pitch = sad/calm
    if mean_f0 > 260:
        s["happy"]    += 2.5
        s["surprise"] += 2.5
        s["fear"]     += 1.5
    elif mean_f0 > 200:
        s["happy"]    += 2.0
        s["surprise"] += 1.0
        s["fear"]     += 0.5
    elif mean_f0 > 150:
        s["neutral"]  += 1.0
        s["happy"]    += 0.5
    elif mean_f0 < 110 and mean_f0 > 0:
        s["sad"]      += 2.5
        s["neutral"]  += 1.0
        s["disgust"]  += 0.5

    # ── Pitch variation (expressiveness) ──────────────────────
    # Happy/surprised speech has wide pitch swings
    # Sad/disgust is monotone
    if f0_var > 60:
        s["happy"]    += 3.0   # ← KEY: jolly/animated speech has high pitch var
        s["surprise"] += 2.5
        s["fear"]     += 1.0
        s["angry"]    += 0.5
    elif f0_var > 35:
        s["happy"]    += 2.0
        s["surprise"] += 1.0
        s["angry"]    += 0.5
    elif f0_var > 18:
        s["neutral"]  += 1.5
        s["happy"]    += 0.5
    else:
        # Very monotone pitch
        s["neutral"]  += 2.0
        s["sad"]      += 1.5
        s["disgust"]  += 0.8

    # ── Voiced fraction ───────────────────────────────────────
    # Continuous voicing = singing/smooth speech; choppy = normal speech
    if voiced_frac > 0.75:
        s["happy"]    += 1.0
        s["sad"]      += 0.5
    elif voiced_frac < 0.35:
        s["angry"]    += 0.5
        s["fear"]     += 0.5

    # ── Spectral brightness (ZCR + centroid) ──────────────────
    # Angry/fear speech is spectrally harsh (high ZCR, high centroid)
    # Sad/disgust is dull (low ZCR, low centroid)
    if zcr > 0.13:
        s["angry"]    += 2.5
        s["fear"]     += 1.5
        s["surprise"] += 0.5
    elif zcr > 0.09:
        s["angry"]    += 1.0
        s["happy"]    += 0.5
    elif zcr < 0.04:
        s["sad"]      += 1.0
        s["neutral"]  += 0.5
        s["disgust"]  += 0.3

    if centroid > 4000:
        s["angry"]    += 1.5
        s["happy"]    += 1.0
        s["surprise"] += 0.5
    elif centroid > 3000:
        s["happy"]    += 0.5
        s["neutral"]  += 0.5
    elif centroid < 1800:
        s["sad"]      += 1.0
        s["disgust"]  += 0.3

    # ── Disgust suppression ───────────────────────────────────
    # Disgust in real speech is very rare and acoustically similar to
    # bored/neutral. Only allow it to win if other features clearly support it.
    # Requirement: must have low energy + low pitch + monotone + low ZCR
    disgust_support = (
        rms < 0.06 and
        mean_f0 < 130 and
        f0_var < 15 and
        zcr < 0.05
    )
    if not disgust_support:
        s["disgust"] = min(s["disgust"], 0.3)   # cap disgust if not acoustically supported

    # ── Normalize to probabilities ────────────────────────────
    total = sum(s.values())
    probs = {k: v / total for k, v in s.items()}
    label = max(probs, key=probs.get)

    return {
        "emotion":       label,
        "emoji":         EMOTION_EMOJI.get(label, ""),
        "confidence":    round(probs[label], 4),
        "probabilities": {k: round(v, 4) for k, v in probs.items()},
    }


# ============================================================
# MAIN PREDICT
# ============================================================

def predict_emotion(audio: np.ndarray, sr: int) -> dict:
    """
    Try neural model first. If it outputs disgust > 50% or is biased,
    fall back to acoustics entirely.
    """
    if _model_ok and model is not None:
        try:
            with torch.no_grad():
                probs = torch.softmax(
                    model(preprocess_audio(audio, sr)), dim=1
                ).cpu().numpy()[0]

            idx        = int(np.argmax(probs))
            label      = EMOTION_LABELS[idx]
            confidence = float(probs[idx])

            disgust_prob = float(probs[5])  # disgust is index 5

            # Neural model is outputting disgust heavily — it's biased, use acoustics
            if disgust_prob > 0.50:
                return acoustic_emotion(audio, sr)

            # Neural model is confident about a non-disgust emotion — trust it
            if confidence > 0.55 and label != "disgust":
                return {
                    "emotion":       label,
                    "emoji":         EMOTION_EMOJI.get(label, ""),
                    "confidence":    round(confidence, 4),
                    "probabilities": {
                        EMOTION_LABELS[i]: round(float(probs[i]), 4)
                        for i in range(7)
                    },
                }

            # Low confidence neural — blend with acoustics
            acoustic = acoustic_emotion(audio, sr)
            return acoustic

        except Exception:
            pass

    # No model or model failed — pure acoustics
    return acoustic_emotion(audio, sr)


# ============================================================
# SEGMENT PREDICTION (for longer audio)
# ============================================================

def predict_emotion_segments(audio: np.ndarray, sr: int,
                              segment_sec: float = 2.0) -> list:
    seg_len = int(segment_sec * sr)
    results = []
    start   = 0
    while start < len(audio):
        end     = min(start + seg_len, len(audio))
        segment = audio[start:end]
        if len(segment) < sr * 0.5:
            break
        r = predict_emotion(segment, sr)
        results.append({
            "start_sec":  round(start / sr, 2),
            "end_sec":    round(end / sr, 2),
            "emotion":    r["emotion"],
            "emoji":      r["emoji"],
            "confidence": r["confidence"],
        })
        start += seg_len
    return results