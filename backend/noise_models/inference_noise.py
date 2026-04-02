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
import torch

logger = logging.getLogger(__name__)

# ── Configure this path ───────────────────────────────────────────────────────
# Resolves automatically relative to this file's location first,
# then falls back to environment variable, then hardcoded path.
_THIS_DIR  = Path(__file__).resolve().parent          # backend/noise_models/
_REPO_ROOT = _THIS_DIR.parent.parent                  # project root

NOISE_PROJECT_ROOT = Path(
    os.environ.get(
        "NOISE_PROJECT_ROOT",
        str(_REPO_ROOT / "background_noise_classifier"),  # try sibling folder first
    )
)

# If sibling folder doesn't exist, fall back to the known local path
if not NOISE_PROJECT_ROOT.exists():
    NOISE_PROJECT_ROOT = Path(
        r"C:\Users\KIIT0001\Mini Project\background_noise_classifier"
    )

SCENE_DISPLAY = {
    "street_traffic": "Street / Traffic",
    "indoor":         "Indoor",
    "nature":         "Nature / Outdoors",
    "market_crowd":   "Market / Crowd",
    "construction":   "Construction Site",
}

# ── Preprocessing — mirrors predict_combined.py exactly ──────────────────────

def _preprocess(audio_path: str) -> torch.Tensor:
    """
    Identical preprocessing to src/predict_combined.py::preprocess()
    so we get the same mel-spectrogram the models were trained on.
    """
    # Import config from friend's project
    root_str = str(NOISE_PROJECT_ROOT)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)

    from src.config import SAMPLE_RATE, CLIP_DURATION, N_MELS, N_FFT, HOP_LENGTH, F_MIN, F_MAX

    y, _ = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)
    n    = int(SAMPLE_RATE * CLIP_DURATION)
    y    = np.pad(y, (0, max(0, n - len(y))))[:n]
    S    = librosa.feature.melspectrogram(
        y=y, sr=SAMPLE_RATE, n_mels=N_MELS,
        n_fft=N_FFT, hop_length=HOP_LENGTH, fmin=F_MIN, fmax=F_MAX,
    )
    log_S = librosa.power_to_db(S, ref=np.max)
    lo, hi = log_S.min(), log_S.max()
    spec  = (log_S - lo) / (hi - lo + 1e-8)
    return torch.from_numpy(spec).float().unsqueeze(0).unsqueeze(0)  # (1,1,M,T)


# ── Try to load friend's models once at import time ──────────────────────────
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
        from src.config       import SCENE_CLASSES, CHECKPOINT_DIR  # noqa
        from src.noise_config import NOISE_CLASSES, NOISE_CHECKPOINT, NUM_NOISE_CLASSES  # noqa
        from src.model        import EnvCNN  # noqa

        # Verify checkpoint files actually exist
        scene_ckpt_path = CHECKPOINT_DIR / "best_model.pt"
        noise_ckpt_path = Path(str(NOISE_CHECKPOINT))

        if not scene_ckpt_path.exists():
            raise FileNotFoundError(f"Scene checkpoint not found: {scene_ckpt_path}")
        if not noise_ckpt_path.exists():
            raise FileNotFoundError(f"Noise checkpoint not found: {noise_ckpt_path}")

        _friend_models_ok = True
        logger.info("[inference_noise] Friend noise models imported OK from %s", root_str)

    except Exception as e:
        _import_error_msg = traceback.format_exc()
        logger.error(
            "[inference_noise] Could not import friend noise models from %s\n%s",
            root_str, _import_error_msg,
        )

_try_import_friend_models()


# ── Rule-based fallback ───────────────────────────────────────────────────────
def _fallback_environment(audio_path: str) -> str:
    try:
        from audio_cleaning import detect_noise_environment
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
    Mirrors predict_combined.py exactly — same preprocessing, same models,
    same inference logic. Does not interfere with any other part of the project.

    Always returns a complete dict — never raises.
    Falls back to rule-based detection if ML models are unavailable.

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

    # ── Try ML models (mirrors predict_combined.py exactly) ──────────────────
    if _friend_models_ok:
        root_str = str(NOISE_PROJECT_ROOT)
        injected = root_str not in sys.path
        if injected:
            sys.path.insert(0, root_str)
        try:
            from src.config       import SCENE_CLASSES, CHECKPOINT_DIR
            from src.noise_config import NOISE_CLASSES, NOISE_CHECKPOINT, NUM_NOISE_CLASSES
            from src.model        import EnvCNN

            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

            # Preprocess — identical to predict_combined.py
            spec = _preprocess(audio_path).to(device)

            # ── Scene model ───────────────────────────────────────────────────
            scene_model = EnvCNN(num_classes=len(SCENE_CLASSES)).to(device)
            scene_ckpt  = torch.load(
                CHECKPOINT_DIR / "best_model.pt",
                map_location=device,
                weights_only=False,
            )
            scene_model.load_state_dict(scene_ckpt["model_state"])
            scene_model.eval()

            with torch.no_grad():
                scene_probs = torch.softmax(
                    scene_model(spec), dim=-1
                )[0].cpu().numpy()

            # ── Noise model ───────────────────────────────────────────────────
            noise_model = EnvCNN(num_classes=NUM_NOISE_CLASSES).to(device)
            noise_ckpt  = torch.load(
                NOISE_CHECKPOINT,
                map_location=device,
                weights_only=False,
            )
            noise_model.load_state_dict(noise_ckpt["model_state"])
            noise_model.eval()

            with torch.no_grad():
                noise_probs = torch.softmax(
                    noise_model(spec), dim=-1
                )[0].cpu().numpy()

            # ── Build results ─────────────────────────────────────────────────
            top_scene = SCENE_CLASSES[scene_probs.argmax()]
            top_noise = NOISE_CLASSES[noise_probs.argmax()]

            top_scenes = [
                {
                    "label":      SCENE_CLASSES[i],
                    "confidence": round(float(scene_probs[i]) * 100, 2),
                }
                for i in scene_probs.argsort()[::-1][:3]
            ]
            top_noises = [
                {
                    "label":      NOISE_CLASSES[i],
                    "confidence": round(float(noise_probs[i]) * 100, 2),
                }
                for i in noise_probs.argsort()[::-1][:5]
            ]

            scene_conf = round(float(scene_probs.max()) * 100, 2)
            noise_conf = round(float(noise_probs.max()) * 100, 2)
            audio_env  = SCENE_DISPLAY.get(
                top_scene, top_scene.replace("_", " ").title()
            )

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
