"""
backend/app.py
──────────────
FastAPI entry point for the Voice Intelligence System.

Pipeline order (critical):
  1. Load raw audio (resample, duration limits — NO cleaning)
  2. Enhance audio (DC offset, hum removal, highpass, normalize — preserves noise character)
  3. Extract noise from enhanced audio (enhanced - voice = noise residual)
  4. Detect noise type on the extracted noise residual
  5. Check for speech content (transcript flag or HPR/CV_RMS heuristics)
  6. If speech: extract clean voice from enhanced audio → run age/gender/emotion
  7. If no speech: return noise-only result
"""

import os
import uuid
import logging
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from audio_utils               import load_raw_audio
from audio_cleaning            import enhance_audio, extract_noise, extract_voice
from visualization             import save_plots
from gender.inference_gender   import predict_gender
from age.inference_age         import predict_age
from emotion.inference_emotion import predict_emotion
from song_speech.inference_cnn import predict_song_or_speech

# ── Noise models — always imported; function handles its own fallback ─────────
from noise_models.inference_noise import predict_noise_environment

# ── Friend comparison models ──────────────────────────────────────────────────
try:
    from friend_models.inference_friend import run_all_models as _run_friend_models
    _FRIEND_MODELS_AVAILABLE = True
except Exception as _e:
    logging.warning("Friend comparison models not available: %s", _e)
    _FRIEND_MODELS_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Voice Intelligence System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(_STATIC)), name="static")

_TEMP_DIR = Path(__file__).parent / "outputs" / "temp_audio"
_TEMP_DIR.mkdir(parents=True, exist_ok=True)


# ══════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════

def _pct(c):
    if c is None:
        return 0.0
    return round(c * 100, 1) if c <= 1.0 else round(c, 1)


def _majority_vote(comparison: dict) -> dict:
    genders  = []
    ages     = []
    emotions = []

    for model_result in comparison.values():
        if isinstance(model_result, dict) and "error" not in model_result:
            if "gender"    in model_result: genders.append(model_result["gender"])
            if "age_label" in model_result: ages.append(model_result["age_label"])
            if "emotion"   in model_result: emotions.append(model_result["emotion"])

    def _vote(lst):
        if not lst:
            return None
        from collections import Counter
        return Counter(lst).most_common(1)[0][0]

    return {
        "gender":  _vote(genders),
        "age":     _vote(ages),
        "emotion": _vote(emotions),
    }


# ══════════════════════════════════════════════════════════════════════
# Main endpoint
# ══════════════════════════════════════════════════════════════════════

@app.post("/analyze-audio")
async def analyze_audio(
    file: UploadFile = File(...),
    has_transcript: str = Form("false"),
    source: str = Form("upload")
):
    temp_path = _TEMP_DIR / f"{uuid.uuid4()}.audio"
    try:
        # Save upload to disk
        contents = await file.read()
        with open(temp_path, "wb") as f:
            f.write(contents)

        import numpy as np
        import librosa
        import soundfile as sf

        # ── STEP 1: LOAD RAW AUDIO ──────────────────────────────────────
        raw_audio, sr = load_raw_audio(str(temp_path))
        logger.info("[pipeline] Loaded raw audio: %.2fs @ %dHz", len(raw_audio)/sr, sr)

        # ── STEP 2: ENHANCE (preserves noise character) ─────────────────
        enhanced = enhance_audio(raw_audio, sr)
        logger.info("[pipeline] Enhanced audio (noise character preserved)")

        # ── STEP 3: EXTRACT NOISE from enhanced audio ───────────────────
        noise_residual = extract_noise(enhanced, sr)
        noise_rms = float(np.sqrt(np.mean(noise_residual ** 2)))
        logger.info("[pipeline] Extracted noise residual (RMS=%.4f)", noise_rms)

        # ── STEP 4: DETECT NOISE TYPE on extracted noise residual ────────
        # User requested to detect noise directly from the separated noise component
        noise_path = _TEMP_DIR / f"{uuid.uuid4()}_noise_residual.wav"
        sf.write(str(noise_path), noise_residual, sr)

        noise_result = predict_noise_environment(str(noise_path))
        noise_env    = noise_result["audio_environment"]
        noise_detail = {
            "scene":            noise_result["scene"],
            "scene_confidence": noise_result["scene_confidence"],
            "noise_type":       noise_result["noise_type"],
            "noise_confidence": noise_result["noise_confidence"],
            "is_clean":         noise_result.get("is_clean", False),
            "noise_breakdown":  {
                n["label"]: n["confidence"]
                for n in noise_result.get("top_noises", [])
            },
        }
        logger.info(
            "[pipeline] Noise detection: env=%s  scene=%s (%.1f%%)  noise=%s (%.1f%%)",
            noise_env,
            noise_result["scene"],      noise_result["scene_confidence"],
            noise_result["noise_type"], noise_result["noise_confidence"],
        )

        try:
            noise_path.unlink()
        except Exception:
            pass

        # ── STEP 5: CHECK FOR SPEECH CONTENT ────────────────────────────
        y_harmonic, y_percussive = librosa.effects.hpss(enhanced)
        hpr = float(np.mean(y_harmonic**2) / (np.mean(y_percussive**2) + 1e-8))

        frame_rms = librosa.feature.rms(y=enhanced, frame_length=1024, hop_length=512)[0]
        cv_rms = float(np.std(frame_rms) / (np.mean(frame_rms) + 1e-8))

        logger.info(f"[pipeline] Content check: Source={source}, HasTranscript={has_transcript}, HPR={hpr:.3f}, CV_RMS={cv_rms:.3f}")

        # ── OVERRIDE: User requested to ALWAYS extract voice and run inference
        # even if it's pure noise. Skipping the early exit.
        has_content = True
        logger.info(f"[pipeline] Content check overridden: ALWAYS inferring voice/emotion/age/gender.")

        # ── STEP 6: EXTRACT CLEAN VOICE from enhanced audio ─────────────
        voice_audio = extract_voice(enhanced, sr)
        logger.info("[pipeline] Extracted clean voice for inference")

        # ── STEP 7: SONG vs SPEECH ──────────────────────────────────────
        song_result = predict_song_or_speech(voice_audio, sr)
        is_song     = song_result.get("label") == "song"

        # ── SONG branch ─────────────────────────────────────────────────
        if is_song:
            raw_conf       = song_result.get("confidence", 0)
            emotion_result = predict_emotion(voice_audio, sr)
            gender_result  = predict_gender(voice_audio, sr)
            age_result     = predict_age(voice_audio, sr)

            raw_probs      = emotion_result.get("probabilities", {})
            breakdown      = {
                k: round(v * 100, 1) if v <= 1.0 else round(v, 1)
                for k, v in raw_probs.items()
            } if raw_probs else {}

            plot_filename = save_plots(voice_audio, sr)
            plot_url      = f"/static/plots/{plot_filename}" if plot_filename else None

            return JSONResponse({
                "type":              "song",
                "label":             song_result.get("label"),
                "confidence":        round(raw_conf * 100, 1) if raw_conf <= 1 else round(raw_conf, 1),
                "audio_environment": noise_env,
                "noise_detail":      noise_detail,
                "plot_url":          plot_url,
                "gender": {
                    "label":      gender_result.get("gender"),
                    "confidence": _pct(gender_result.get("confidence")),
                },
                "age": {
                    "label":      age_result.get("age_group"),
                    "confidence": _pct(age_result.get("confidence")),
                },
                "emotion": {
                    "label":      emotion_result.get("emotion"),
                    "confidence": _pct(emotion_result.get("confidence")),
                    "breakdown":  breakdown,
                },
            })

        # ── SPEECH branch ───────────────────────────────────────────────
        age_result     = predict_age(voice_audio, sr)
        gender_result  = predict_gender(voice_audio, sr)
        emotion_result = predict_emotion(voice_audio, sr)

        model_comparison: dict = {}
        majority_vote:    dict = {}

        if _FRIEND_MODELS_AVAILABLE:
            try:
                model_comparison = _run_friend_models(voice_audio, sr)
                majority_vote    = _majority_vote(model_comparison)
            except Exception as exc:
                logger.error("Friend comparison models failed: %s", exc)
                model_comparison = {"error": str(exc)}

        plot_filename = save_plots(voice_audio, sr)
        plot_url      = f"/static/plots/{plot_filename}" if plot_filename else None

        # Avatar selection
        gender_label = gender_result.get("gender", "").lower()
        age_label    = age_result.get("age_group", "").lower()
        is_male      = gender_label.startswith("m")

        if "child" in age_label:
            avatar = f"child{'m' if is_male else 'f'}.png"
        elif "old" in age_label or "senior" in age_label:
            avatar = f"old{'m' if is_male else 'w'}.png"
        else:
            avatar = f"young{'m' if is_male else 'w'}.png"
        avatar_url = f"/static/images/{avatar}"

        # Emotion breakdown
        raw_probs = emotion_result.get("probabilities", {})
        breakdown = {
            k: round(v * 100, 1) if v <= 1.0 else round(v, 1)
            for k, v in raw_probs.items()
        } if raw_probs else {}

        return JSONResponse({
            "type":              "speech",
            "audio_environment": noise_env,
            "noise_detail":      noise_detail,
            "avatar_url":        avatar_url,

            "gender": {
                "label":      gender_result.get("gender"),
                "confidence": _pct(gender_result.get("confidence")),
            },
            "age": {
                "label":      age_result.get("age_group"),
                "confidence": _pct(age_result.get("confidence")),
            },
            "emotion": {
                "label":      emotion_result.get("emotion"),
                "confidence": _pct(emotion_result.get("confidence")),
                "breakdown":  breakdown,
            },
            "song_speech": {
                "label":      song_result.get("label"),
                "confidence": _pct(song_result.get("confidence")),
            },
            "plot_url": plot_url,

            "model_comparison": model_comparison,
            "majority_vote":    majority_vote,
        })

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unhandled error in /analyze-audio")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if temp_path.exists():
            try:
                os.remove(temp_path)
            except OSError:
                pass


# ══════════════════════════════════════════════════════════════════════
# Per-segment emotion endpoint (for transcript annotations)
# ══════════════════════════════════════════════════════════════════════

@app.post("/analyze-segments")
async def analyze_segments(file: UploadFile = File(...), segments: str = ""):
    """
    Accepts audio file + JSON-encoded segment timestamps.
    Returns per-segment emotion for transcript annotation.

    segments format: JSON array of {"start": float, "end": float, "text": string}
    """
    import json
    import numpy as np

    temp_path = _TEMP_DIR / f"{uuid.uuid4()}.audio"
    try:
        contents = await file.read()
        with open(temp_path, "wb") as f:
            f.write(contents)

        # Parse segments
        try:
            seg_list = json.loads(segments) if segments else []
        except json.JSONDecodeError:
            seg_list = []

        if not seg_list:
            raise HTTPException(status_code=400, detail="No segments provided")

        # Load raw, enhance, extract voice for emotion analysis
        raw_audio, sr = load_raw_audio(str(temp_path))
        enhanced = enhance_audio(raw_audio, sr)
        audio = extract_voice(enhanced, sr)
        total_duration = len(audio) / sr

        results = []
        for seg in seg_list:
            start_sec = float(seg.get("start", 0))
            end_sec   = float(seg.get("end", total_duration))
            text      = seg.get("text", "")

            # Clamp to audio boundaries
            start_sample = max(0, int(start_sec * sr))
            end_sample   = min(len(audio), int(end_sec * sr))

            if end_sample - start_sample < sr * 0.3:  # less than 300ms — too short
                results.append({
                    "text":       text,
                    "start":      start_sec,
                    "end":        end_sec,
                    "emotion":    "neutral",
                    "confidence": 0.0,
                })
                continue

            segment_audio = audio[start_sample:end_sample]
            try:
                emo_result = predict_emotion(segment_audio, sr)
                results.append({
                    "text":       text,
                    "start":      start_sec,
                    "end":        end_sec,
                    "emotion":    emo_result.get("emotion", "neutral"),
                    "confidence": _pct(emo_result.get("confidence")),
                })
            except Exception as e:
                logger.warning("Segment emotion failed for [%.1f-%.1f]: %s", start_sec, end_sec, e)
                results.append({
                    "text":       text,
                    "start":      start_sec,
                    "end":        end_sec,
                    "emotion":    "neutral",
                    "confidence": 0.0,
                })

        return JSONResponse({"segments": results})

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unhandled error in /analyze-segments")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if temp_path.exists():
            try:
                os.remove(temp_path)
            except OSError:
                pass
