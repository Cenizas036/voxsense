"""
backend/friend_models/inference_friend.py
"""

from __future__ import annotations

import os
import logging
from pathlib import Path
from typing import Optional

import numpy as np
import torch
import torch.nn as nn

try:
    import joblib
    _HAS_JOBLIB = True
except ImportError:
    _HAS_JOBLIB = False
    logging.warning("joblib not installed — sklearn/XGB models will be skipped.")

logger = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────
_HERE       = Path(__file__).resolve().parent   # backend/friend_models/
_BACKEND    = _HERE.parent                      # backend/
_MODELS_DIR = _HERE                             # backend/friend_models/  ← FIXED
_DATA_DIR   = _BACKEND / "data"                # backend/data/

# ── Label schemas ──────────────────────────────────────────────────────
EMOTIONS      = ["neutral", "happy", "sad", "angry", "fear", "disgust"]
GENDER_LABELS = {0: "Female", 1: "Male"}
AGE_BUCKET_LABELS = {
    0: "teens", 1: "20s", 2: "30s", 3: "40s",
    4: "50s",   5: "60s", 6: "70s+",
}
FEATURE_DIM = 105
N_EMOTIONS  = 6
N_AGE       = 7
DROPOUT     = 0.3


# ══════════════════════════════════════════════════════════════════════
# PyTorch model architectures
# ══════════════════════════════════════════════════════════════════════

class CNN1D(nn.Module):
    def __init__(self, input_dim: int = FEATURE_DIM):
        super().__init__()
        self.enc = nn.Sequential(
            nn.Conv1d(1, 64, 5, padding=2),   nn.BatchNorm1d(64),  nn.GELU(),
            nn.Conv1d(64, 128, 5, padding=2), nn.BatchNorm1d(128), nn.GELU(),
            nn.AdaptiveAvgPool1d(16),
            nn.Conv1d(128, 256, 3, padding=1), nn.BatchNorm1d(256), nn.GELU(),
            nn.AdaptiveAvgPool1d(4),
        )
        self.drop   = nn.Dropout(DROPOUT)
        self.fc_emo = nn.Linear(1024, N_EMOTIONS)
        self.fc_sex = nn.Linear(1024, 1)
        self.fc_age = nn.Linear(1024, N_AGE)

    def forward(self, x):
        h = self.enc(x).flatten(1)
        h = self.drop(h)
        return self.fc_emo(h), self.fc_sex(h).squeeze(1), self.fc_age(h)


class BiLSTM(nn.Module):
    def __init__(self, input_dim: int = FEATURE_DIM):
        super().__init__()
        self.lstm = nn.LSTM(input_dim, 128, num_layers=2, batch_first=True,
                            dropout=DROPOUT, bidirectional=True)
        self.drop   = nn.Dropout(DROPOUT)
        self.fc_emo = nn.Linear(256, N_EMOTIONS)
        self.fc_sex = nn.Linear(256, 1)
        self.fc_age = nn.Linear(256, N_AGE)

    def forward(self, x):
        out, _ = self.lstm(x)
        h = self.drop(out[:, -1, :])
        return self.fc_emo(h), self.fc_sex(h).squeeze(1), self.fc_age(h)


class AttentiveBiLSTM(nn.Module):
    def __init__(self, input_dim: int = FEATURE_DIM):
        super().__init__()
        self.lstm = nn.LSTM(input_dim, 128, num_layers=2, batch_first=True,
                            dropout=DROPOUT, bidirectional=True)
        self.attention = nn.MultiheadAttention(
            256, num_heads=8, dropout=DROPOUT, batch_first=True)
        self.drop   = nn.Dropout(DROPOUT)
        self.fc_emo = nn.Linear(256, N_EMOTIONS)
        self.fc_sex = nn.Linear(256, 1)
        self.fc_age = nn.Linear(256, N_AGE)

    def forward(self, x):
        lstm_out, _ = self.lstm(x)
        attn_out, _ = self.attention(lstm_out, lstm_out, lstm_out)
        h = self.drop(attn_out.mean(dim=1))
        return self.fc_emo(h), self.fc_sex(h).squeeze(1), self.fc_age(h)


class DSOM(nn.Module):
    def __init__(self, map_h=8, map_w=8, input_dim=FEATURE_DIM):
        super().__init__()
        self.map_h    = map_h
        self.map_w    = map_w
        self.n_nodes  = map_h * map_w
        self.input_dim = input_dim
        self.weights  = nn.Parameter(torch.randn(map_h, map_w, input_dim) * 0.01)
        rows = torch.arange(map_h, dtype=torch.float32)
        cols = torch.arange(map_w, dtype=torch.float32)
        grid_r, grid_c = torch.meshgrid(rows, cols, indexing="ij")
        self.register_buffer(
            "grid_pos",
            torch.stack([grid_r.flatten(), grid_c.flatten()], dim=1))
        self.register_buffer("_step", torch.zeros(1, dtype=torch.long))
        self._sigma_0     = float(max(map_h, map_w)) / 2.0
        self._sigma_end   = 0.5
        self._decay_steps = 10_000

    @property
    def _sigma(self):
        t = min(self._step.item(), self._decay_steps)
        return self._sigma_0 * (self._sigma_end / self._sigma_0) ** (
            t / self._decay_steps)

    def find_bmu(self, x):
        w_flat = self.weights.view(-1, self.input_dim)
        dists  = torch.cdist(x, w_flat)
        return dists.argmin(dim=1), dists.min(dim=1).values

    def update(self, x, lr=0.05):
        with torch.no_grad():
            bmu_idx, bmu_dist = self.find_bmu(x)
            w_flat = self.weights.view(-1, self.input_dim)
            sigma  = self._sigma
            adaptive_lr = lr * (bmu_dist / (bmu_dist + 1.0))
            bmu_pos    = self.grid_pos[bmu_idx]
            node_dists = torch.cdist(bmu_pos.float(), self.grid_pos.float())
            neighbors  = torch.exp(-(node_dists ** 2) / (2 * sigma ** 2))
            neighbors  = neighbors * (neighbors > 0.01).float()
            h     = adaptive_lr.unsqueeze(1) * neighbors
            delta = (h.unsqueeze(2) *
                     (x.unsqueeze(1) - w_flat.unsqueeze(0))).mean(dim=0)
            w_flat.add_(delta)
            self._step += 1

    def forward(self, x):
        bmu_idx, bmu_dist = self.find_bmu(x)
        bmu_norm = bmu_idx.float() / self.n_nodes
        bmu_row  = (bmu_idx // self.map_w).float() / (self.map_h - 1 + 1e-8)
        bmu_col  = (bmu_idx %  self.map_w).float() / (self.map_w - 1 + 1e-8)
        return bmu_norm, bmu_dist, bmu_row, bmu_col


class VoiceAnalyzer(nn.Module):
    def __init__(self, feature_dim: int = FEATURE_DIM):
        super().__init__()
        self.dsom     = DSOM(input_dim=feature_dim)
        combined      = feature_dim + 4
        embed_dim     = 256

        self.encoder = nn.Sequential(
            nn.Linear(combined, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.GELU(),
            nn.Dropout(DROPOUT),
            nn.Linear(embed_dim, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.GELU(),
        )
        self.ffn_norm = nn.LayerNorm(embed_dim)
        self.ffn = nn.Sequential(
            nn.Linear(embed_dim, embed_dim * 4),
            nn.GELU(),
            nn.Dropout(DROPOUT),
            nn.Linear(embed_dim * 4, embed_dim),
        )
        self.sex_head = nn.Sequential(
            nn.Linear(embed_dim, 64), nn.ReLU(), nn.Linear(64, 1))
        self.age_trunk = nn.Sequential(
            nn.Linear(embed_dim, 128), nn.ReLU(), nn.Dropout(DROPOUT))
        self.age_norm         = nn.LayerNorm(128)
        self.age_head         = nn.Linear(128, N_AGE)
        self.age_ordinal_head = nn.Linear(128, N_AGE - 1)
        self.emotion_head = nn.Sequential(
            nn.Linear(embed_dim, embed_dim),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
            nn.LayerNorm(embed_dim),
            nn.Linear(embed_dim, N_EMOTIONS),
        )
        self.song_head = nn.Sequential(
            nn.Linear(embed_dim, 64), nn.ReLU(), nn.Linear(64, 1))

    def forward(self, x, update_som=False):
        if update_som:
            self.dsom.update(x)
        bmu_norm, bmu_dist, bmu_row, bmu_col = self.dsom(x)
        bmu_dist_norm = bmu_dist / (bmu_dist.detach().mean() + 1e-8)
        z = torch.cat([
            x,
            bmu_norm.unsqueeze(1),
            bmu_dist_norm.unsqueeze(1),
            bmu_row.unsqueeze(1),
            bmu_col.unsqueeze(1),
        ], dim=1)
        h = self.encoder(z)
        h = h + self.ffn(self.ffn_norm(h))
        age_hidden = self.age_trunk(h)
        age_normed = self.age_norm(age_hidden)
        return {
            "sex":         self.sex_head(h),
            "age":         self.age_head(age_normed),
            "age_ordinal": self.age_ordinal_head(age_normed),
            "emotion":     self.emotion_head(h),
            "is_song":     self.song_head(h),
        }


# ══════════════════════════════════════════════════════════════════════
# Feature extraction  (mirrors stage1_features.py exactly)
# ══════════════════════════════════════════════════════════════════════

def _extract_features(audio: np.ndarray, sr: int = 16000) -> np.ndarray:
    import librosa

    mfcc      = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=40,
                                     n_fft=2048, hop_length=512)
    mfcc_mean = mfcc.mean(axis=1)
    mfcc_std  = mfcc.std(axis=1)

    delta_mfcc      = librosa.feature.delta(mfcc)
    delta_mfcc_mean = delta_mfcc[:3].mean(axis=1)
    delta_mfcc_std  = delta_mfcc[:3].std(axis=1)

    try:
        tempo, _ = librosa.beat.beat_track(y=audio, sr=sr, hop_length=512)
        # librosa >= 0.10 may return an array; extract scalar
        if hasattr(tempo, '__len__'):
            tempo = float(tempo[0]) if len(tempo) > 0 else 0.0
        else:
            tempo = float(tempo)
        tempo_norm = np.array([tempo / 300.0], dtype=np.float32)
    except Exception:
        tempo_norm = np.array([0.0], dtype=np.float32)

    f0          = librosa.yin(audio, fmin=50, fmax=500, sr=sr, hop_length=512)
    f0          = np.nan_to_num(f0)
    voiced_flag = (f0 > 0).astype(float)
    voiced_f0   = f0[voiced_flag > 0]
    pitch_mean  = np.array([voiced_f0.mean() if len(voiced_f0) > 0 else 0.0])
    pitch_std   = np.array([voiced_f0.std()  if len(voiced_f0) > 0 else 0.0])
    voiced_ratio = np.array([voiced_flag.mean()])

    zcr       = librosa.feature.zero_crossing_rate(audio).mean(axis=1)
    energy    = librosa.feature.rms(y=audio).mean(axis=1)
    rolloff   = librosa.feature.spectral_rolloff(y=audio, sr=sr).mean(axis=1)
    centroid  = librosa.feature.spectral_centroid(y=audio, sr=sr).mean(axis=1)
    bandwidth = librosa.feature.spectral_bandwidth(y=audio, sr=sr).mean(axis=1)
    contrast  = librosa.feature.spectral_contrast(y=audio, sr=sr).mean(axis=1)

    autocorr = librosa.autocorrelate(audio, max_size=sr // 50)
    hnr      = np.array([autocorr[1:].max() / (autocorr[0] + 1e-8)])

    periods        = np.where(f0 > 0, 1.0 / (f0 + 1e-10), 0.0)
    voiced_periods = periods[periods > 0]
    if len(voiced_periods) > 1:
        jitter = np.array([np.abs(np.diff(voiced_periods)).mean()])
    else:
        jitter = np.array([0.0])

    amp        = np.abs(audio)
    amp_frames = librosa.util.frame(amp, frame_length=2048, hop_length=512)
    amp_means  = amp_frames.mean(axis=0)
    shimmer    = np.array([np.abs(np.diff(amp_means)).mean()
                           if len(amp_means) > 1 else 0.0])

    vec = np.concatenate([
        mfcc_mean, mfcc_std,
        pitch_mean, pitch_std, voiced_ratio,
        zcr, energy, rolloff, centroid, bandwidth, contrast,
        hnr, jitter, shimmer,
        delta_mfcc_mean, delta_mfcc_std,
        tempo_norm,
    ])

    if len(vec) >= FEATURE_DIM:
        vec = vec[:FEATURE_DIM]
    else:
        vec = np.pad(vec, (0, FEATURE_DIM - len(vec)))

    return vec.astype(np.float32)


# ══════════════════════════════════════════════════════════════════════
# Model loader
# ══════════════════════════════════════════════════════════════════════

_loaded: dict = {}


def _get_norm() -> tuple[np.ndarray, np.ndarray]:
    if "norm" not in _loaded:
        mean_path = _DATA_DIR / "norm_mean.npy"
        std_path  = _DATA_DIR / "norm_std.npy"
        if mean_path.exists() and std_path.exists():
            _loaded["norm"] = (
                np.load(mean_path).astype(np.float32),
                np.load(std_path).astype(np.float32),
            )
        else:
            logger.warning(
                "norm_mean.npy / norm_std.npy not found — features will NOT be normalised.")
            _loaded["norm"] = (
                np.zeros(FEATURE_DIM, dtype=np.float32),
                np.ones(FEATURE_DIM,  dtype=np.float32),
            )
    return _loaded["norm"]


def _load_pth(key: str, model_class, path: Path) -> Optional[nn.Module]:
    if key in _loaded:
        return _loaded[key]
    if not path.exists():
        logger.warning("Model file not found: %s", path)
        _loaded[key] = None
        return None
    try:
        ckpt  = torch.load(path, map_location="cpu", weights_only=False)
        state = ckpt.get("model_state", ckpt)
        m     = model_class(FEATURE_DIM)
        m.load_state_dict(state)
        m.eval()
        _loaded[key] = m
        logger.info("Loaded %s", key)
    except Exception as exc:
        logger.error("Failed to load %s: %s", key, exc)
        _loaded[key] = None
    return _loaded[key]


def _load_joblib(key: str, path: Path):
    if key in _loaded:
        return _loaded[key]
    if not _HAS_JOBLIB:
        _loaded[key] = None
        return None
    if not path.exists():
        logger.warning("Joblib model not found: %s", path)
        _loaded[key] = None
        return None
    try:
        _loaded[key] = joblib.load(path)
        logger.info("Loaded %s", key)
    except Exception as exc:
        logger.error("Failed to load %s: %s", key, exc)
        _loaded[key] = None
    return _loaded[key]


def _ensure_all_loaded():
    _load_pth("cnn",             CNN1D,           _MODELS_DIR / "cnn.pth")
    _load_pth("lstm",            BiLSTM,          _MODELS_DIR / "lstm.pth")
    _load_pth("attentive_lstm",  AttentiveBiLSTM, _MODELS_DIR / "attentive_lstm.pth")
    _load_pth("transformer_cnn", VoiceAnalyzer,   _MODELS_DIR / "transformer_cnn.pth")

    for name in ("rf", "svm", "xgb"):
        for task in ("gender", "age", "emotion"):
            _load_joblib(f"{name}_{task}", _MODELS_DIR / f"{name}_{task}.joblib")


# ══════════════════════════════════════════════════════════════════════
# Inference helpers
# ══════════════════════════════════════════════════════════════════════

def _pth_predict(model: nn.Module, feat_norm: np.ndarray) -> dict:
    x = torch.tensor(feat_norm, dtype=torch.float32).unsqueeze(0).unsqueeze(0)
    with torch.no_grad():
        emo_logits, sex_logit, age_logits = model(x)

    emo_probs  = torch.softmax(emo_logits[0], dim=0).numpy()
    sex_prob   = torch.sigmoid(sex_logit[0]).item()
    age_probs  = torch.softmax(age_logits[0], dim=0).numpy()

    emo_idx    = int(emo_probs.argmax())
    age_idx    = int(age_probs.argmax())
    gender_idx = 1 if sex_prob >= 0.5 else 0

    return {
        "gender":        GENDER_LABELS[gender_idx],
        "gender_conf":   round(max(sex_prob, 1 - sex_prob) * 100, 1),
        "age_bucket":    age_idx,
        "age_label":     AGE_BUCKET_LABELS[age_idx],
        "age_conf":      round(float(age_probs.max()) * 100, 1),
        "emotion":       EMOTIONS[emo_idx],
        "emotion_conf":  round(float(emo_probs.max()) * 100, 1),
        "emotion_probs": {EMOTIONS[i]: round(float(p) * 100, 1)
                          for i, p in enumerate(emo_probs)},
    }


def _voice_analyzer_predict(model: VoiceAnalyzer, feat_norm: np.ndarray) -> dict:
    x = torch.tensor(feat_norm, dtype=torch.float32).unsqueeze(0)
    with torch.no_grad():
        out = model(x, update_som=False)

    emo_probs  = torch.softmax(out["emotion"][0], dim=0).numpy()
    sex_prob   = torch.sigmoid(out["sex"][0]).item()
    age_probs  = torch.softmax(out["age"][0], dim=0).numpy()

    emo_idx    = int(emo_probs.argmax())
    age_idx    = int(age_probs.argmax())
    gender_idx = 1 if sex_prob >= 0.5 else 0

    return {
        "gender":        GENDER_LABELS[gender_idx],
        "gender_conf":   round(max(sex_prob, 1 - sex_prob) * 100, 1),
        "age_bucket":    age_idx,
        "age_label":     AGE_BUCKET_LABELS[age_idx],
        "age_conf":      round(float(age_probs.max()) * 100, 1),
        "emotion":       EMOTIONS[emo_idx],
        "emotion_conf":  round(float(emo_probs.max()) * 100, 1),
        "emotion_probs": {EMOTIONS[i]: round(float(p) * 100, 1)
                          for i, p in enumerate(emo_probs)},
    }


def _joblib_predict(gender_clf, age_clf, emotion_clf, feat_norm: np.ndarray) -> dict:
    x = feat_norm.reshape(1, -1)

    gender_pred = int(gender_clf.predict(x)[0])
    gender_conf = None
    if hasattr(gender_clf, "predict_proba"):
        gp = gender_clf.predict_proba(x)[0]
        gender_conf = round(float(gp.max()) * 100, 1)

    age_pred = int(age_clf.predict(x)[0])
    age_conf = None
    if hasattr(age_clf, "predict_proba"):
        ap = age_clf.predict_proba(x)[0]
        age_conf = round(float(ap.max()) * 100, 1)

    emo_pred  = int(emotion_clf.predict(x)[0])
    emo_conf  = None
    emo_probs = {}
    if hasattr(emotion_clf, "predict_proba"):
        ep      = emotion_clf.predict_proba(x)[0]
        emo_conf = round(float(ep.max()) * 100, 1)
        classes  = list(emotion_clf.classes_)
        emo_probs = {EMOTIONS[c]: round(float(ep[i]) * 100, 1)
                     for i, c in enumerate(classes) if c < len(EMOTIONS)}

    return {
        "gender":        GENDER_LABELS.get(gender_pred, str(gender_pred)),
        "gender_conf":   gender_conf,
        "age_bucket":    age_pred,
        "age_label":     AGE_BUCKET_LABELS.get(age_pred, str(age_pred)),
        "age_conf":      age_conf,
        "emotion":       EMOTIONS[emo_pred] if emo_pred < len(EMOTIONS) else str(emo_pred),
        "emotion_conf":  emo_conf,
        "emotion_probs": emo_probs,
    }


def _safe_run(name: str, fn) -> dict:
    try:
        return fn()
    except Exception as exc:
        logger.error("Model %s failed: %s", name, exc)
        return {"error": str(exc)}


# ══════════════════════════════════════════════════════════════════════
# Public API
# ══════════════════════════════════════════════════════════════════════

def run_all_models(audio: np.ndarray, sr: int) -> dict:
    _ensure_all_loaded()

    import librosa
    if sr != 16000:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
        sr    = 16000

    feat_raw  = _extract_features(audio, sr)
    mean, std = _get_norm()
    feat_norm = (feat_raw - mean) / (std + 1e-8)

    results: dict = {}

    for prefix in ("rf", "svm", "xgb"):
        g = _loaded.get(f"{prefix}_gender")
        a = _loaded.get(f"{prefix}_age")
        e = _loaded.get(f"{prefix}_emotion")
        if g is None or a is None or e is None:
            results[prefix] = {"error": f"{prefix} models not loaded"}
        else:
            results[prefix] = _safe_run(
                prefix,
                lambda g=g, a=a, e=e: _joblib_predict(g, a, e, feat_norm))

    cnn_model = _loaded.get("cnn")
    results["cnn"] = (_safe_run("cnn", lambda: _pth_predict(cnn_model, feat_norm))
                      if cnn_model else {"error": "cnn.pth not loaded"})

    lstm_model = _loaded.get("lstm")
    results["lstm"] = (_safe_run("lstm", lambda: _pth_predict(lstm_model, feat_norm))
                       if lstm_model else {"error": "lstm.pth not loaded"})

    al_model = _loaded.get("attentive_lstm")
    results["attentive_lstm"] = (_safe_run("attentive_lstm",
                                           lambda: _pth_predict(al_model, feat_norm))
                                 if al_model else {"error": "attentive_lstm.pth not loaded"})

    va_model = _loaded.get("transformer_cnn")
    results["transformer_cnn"] = (_safe_run("transformer_cnn",
                                            lambda: _voice_analyzer_predict(va_model, feat_norm))
                                  if va_model else {"error": "transformer_cnn.pth not loaded"})

    return results
