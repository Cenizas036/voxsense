import os
import uuid
import numpy as np
import librosa
import librosa.display
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path

# Save to backend/static/plots/ — this is where app.py serves them from /static/plots/
_PLOT_DIR = Path(__file__).parent / "static" / "plots"


def save_plots(audio, sr, features=None, base_name=None):
    """
    Generate and save MFCC spectrogram plot.

    Parameters
    ----------
    audio     : np.ndarray  — audio samples
    sr        : int         — sample rate
    features  : dict | None — optional, used for mfcc/log_mel if provided
    base_name : str  | None — optional filename prefix; auto-generated if omitted

    Returns
    -------
    str — filename (not full path) of the saved MFCC PNG, e.g. "abc123_mfcc.png"
          Returns None on failure.
    """
    try:
        _PLOT_DIR.mkdir(parents=True, exist_ok=True)

        if base_name is None:
            base_name = uuid.uuid4().hex

        # ── MFCC ──────────────────────────────────────────────────────
        if features is not None and "mfcc" in features:
            mfcc_data = np.array(features["mfcc"])
        else:
            mfcc_data = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)

        mfcc_filename = f"{base_name}_mfcc.png"
        mfcc_path     = _PLOT_DIR / mfcc_filename

        fig, ax = plt.subplots(figsize=(10, 4))
        img = librosa.display.specshow(
            mfcc_data, x_axis="time", sr=sr, ax=ax
        )
        fig.colorbar(img, ax=ax)
        ax.set_title("MFCC")
        plt.tight_layout()
        plt.savefig(str(mfcc_path), dpi=100, bbox_inches="tight")
        plt.close(fig)

        # ── Log-Mel (optional — only saved if features provided) ──────
        if features is not None and "log_mel" in features:
            logmel_filename = f"{base_name}_logmel.png"
            logmel_path     = _PLOT_DIR / logmel_filename

            fig, ax = plt.subplots(figsize=(10, 4))
            img = librosa.display.specshow(
                features["log_mel"], x_axis="time", y_axis="mel", sr=sr, ax=ax
            )
            fig.colorbar(img, ax=ax)
            ax.set_title("Log-Mel Spectrogram")
            plt.tight_layout()
            plt.savefig(str(logmel_path), dpi=100, bbox_inches="tight")
            plt.close(fig)

        return mfcc_filename

    except Exception as e:
        import logging
        logging.getLogger(__name__).error("save_plots failed: %s", e)
        return None
