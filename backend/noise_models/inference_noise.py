"""
backend/noise_models/inference_noise.py
────────────────────────────────────────
Wraps the friend's src.predict_combined by injecting their project root
into sys.path. If that fails for any reason, falls back to the rule-based
detect_noise_environment from audio_cleaning.py so the UI never shows "unknown".

IMPORTANT: Set NOISE_PROJECT_ROOT to the folder that CONTAINS the src/ directory.
Example: if predict_combined.py lives at:
  C:/Users/KIIT0001/Mini Project/background_noise_classifier/src/predict_combined.py
Then NOISE_PROJECT_ROOT = C:/Users/KIIT0001/Mini Project/background_noise_classifier
"""

import sys
import os
import logging
import traceback
from pathlib import Path

import librosa
import numpy as np

logger = logging.getLogger(__name__)

# ── Configure this path ───────────────────────────────────────────────────────
# Can also be overridden via environment variable NOISE_PROJECT_ROOT
NOISE_PROJECT_ROOT = Path(
    os.environ.get(
        "NOISE_PROJECT_ROOT",
        r"C:\Users\KIIT0001\Mini Project\background_noise_classifier",
    )
)

SCENE_DISPLAY = {
    "street_traffic": "Street / Traffic",
    "indoor":         "Indoor",
    "nature":         "Nature / Outdoors",
    "market_crowd":   "Market / Crowd",
    "construction":   "Construction Site",
}

# ── Try to load friend's models once at import time ──────────────────────────
# This makes startup errors visible immediately instead of hiding on first call.
_friend_models_ok = False
_import_error_msg = ""

def _try_import_friend_models():
    global _friend_models_ok, _import_error_msg

    root_str = str(NOISE_PROJECT_ROOT)

    if not NOISE_PROJECT_ROOT.exists():
        _import_error_msg = (
            f"NOISE_PROJECT_ROOT does not exist: {root_str}\n"
            f"Update the path in backend/noise_models/inference_noise.py"
        )
        logger.error("[inference_noise] %s", _import_error_msg)
        return

    if root_str not in sys.path:
        sys.path.insert(0, root_str)

    try:
        import src.predict_combined  # noqa: F401  — just check it's importable
        _friend_models_ok = True
        logger.info("[inference_noise] Friend noise models imported OK from %s", root_str)
    except Exception as e:
        _import_error_msg = traceback.format_exc()
        logger.error(
            "[inference_noise] Could not import friend noise models from %s\n%s",
            root_str, _import_error_msg,
        )

_try_import_friend_models()


# ── Rule-based fallback (uses audio_cleaning.detect_noise_environment) ────────
def _fallback_environment(audio_path: str) -> str:
    """Load raw audio and run the rule-based detector from audio_cleaning.py."""
    try:
        from backend.audio_cleaning import detect_noise_environment
        audio, sr = librosa.load(audio_path, sr=None, mono=True)
        env = detect_noise_environment(audio, sr)
        logger.info("[inference_noise] Fallback rule-based result: %s", env)
        return env
    except Exception as e:
        logger.error("[inference_noise] Fallback also failed: %s", e)
        return "unknown"


# ── Main function ─────────────────────────────────────────────────────────────
def predict_noise_environment(audio_path: str) -> dict:
    """
    Run scene + noise classification on a raw (uncleaned) audio file.

    Always returns a complete dict — never raises. Falls back to rule-based
    detection if the friend's ML models are unavailable.

    Returns
    -------
    dict with keys:
        audio_environment  : str    e.g. "Indoor"
        scene              : str    e.g. "indoor"
        scene_confidence   : float  0-100
        noise_type         : str    e.g. "fan_ac"
        noise_confidence   : float  0-100
        is_clean           : bool
        top_scenes         : list[dict]
        top_noises         : list[dict]
    """
    # ── Try ML models first ───────────────────────────────────────────────────
    if _friend_models_ok:
        root_str = str(NOISE_PROJECT_ROOT)
        injected = root_str not in sys.path
        if injected:
            sys.path.insert(0, root_str)
        try:
            from src.predict_combined import predict_combined
            from src.config           import SCENE_CLASSES
            from src.noise_config     import NOISE_CLASSES

            top_scene, top_noise, scene_probs, noise_probs = predict_combined(
                audio_path, top_k_scene=3, top_k_noise=5
            )

            top_scenes = [
                {"label": SCENE_CLASSES[i], "confidence": round(float(scene_probs[i]) * 100, 2)}
                for i in scene_probs.argsort()[::-1][:3]
            ]
            top_noises = [
                {"label": NOISE_CLASSES[i], "confidence": round(float(noise_probs[i]) * 100, 2)}
                for i in noise_probs.argsort()[::-1][:5]
            ]

            scene_conf = round(float(scene_probs.max()) * 100, 2)
            noise_conf = round(float(noise_probs.max()) * 100, 2)
            audio_env  = SCENE_DISPLAY.get(top_scene, top_scene.replace("_", " ").title())

            logger.info(
                "[inference_noise] ML result: scene=%s (%.1f%%) noise=%s (%.1f%%)",
                top_scene, scene_conf, top_noise, noise_conf,
            )

            return {
                "audio_environment": audio_env,
                "scene":             top_scene,
                "scene_confidence":  scene_conf,
                "noise_type":        top_noise,
                "noise_confidence":  noise_conf,
                "is_clean":          False,
                "top_scenes":        top_scenes,
                "top_noises":        top_noises,
            }

        except Exception:
            logger.error(
                "[inference_noise] ML inference failed, falling back:\n%s",
                traceback.format_exc(),
            )
        finally:
            if injected and root_str in sys.path:
                sys.path.remove(root_str)

    # ── Fallback: rule-based ──────────────────────────────────────────────────
    logger.warning(
        "[inference_noise] Using rule-based fallback. Reason: %s",
        _import_error_msg or "ML models unavailable",
    )
    env = _fallback_environment(audio_path)

    # Map rule-based labels to a consistent shape
    env_display_map = {
        "hum":       "Indoor (Electrical Hum)",
        "wind":      "Outdoor (Wind)",
        "telephone": "Telephone / Compressed",
        "crowd":     "Crowd / Babble",
        "reverb":    "Reverberant Space",
        "noisy":     "Noisy Environment",
        "fan_ac":    "Indoor (Fan / AC)",
        "traffic":   "Street / Traffic",
        "clean":     "Clean / Quiet",
        "unknown":   "Unknown",
    }

    return {
        "audio_environment": env_display_map.get(env, env.replace("_", " ").title()),
        "scene":             env,
        "scene_confidence":  0.0,
        "noise_type":        env,
        "noise_confidence":  0.0,
        "is_clean":          env == "clean",
        "top_scenes":        [{"label": env, "confidence": 0.0}],
        "top_noises":        [{"label": env, "confidence": 0.0}],
    }