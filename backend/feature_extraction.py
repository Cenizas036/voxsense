import librosa
import numpy as np


def extract_features(audio, sr):
    features = {}

    # Duration
    features["duration_sec"] = len(audio) / sr

    # RMS Energy
    rms = librosa.feature.rms(y=audio)[0]
    features["rms_mean"] = float(np.mean(rms))
    features["rms_std"] = float(np.std(rms))

    # Pitch (F0)
    pitches, magnitudes = librosa.piptrack(y=audio, sr=sr)
    pitch_values = pitches[pitches > 0]
    features["pitch_mean"] = float(np.mean(pitch_values)) if len(pitch_values) else 0.0
    features["pitch_std"] = float(np.std(pitch_values)) if len(pitch_values) else 0.0

    # Spectral features
    centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
    bandwidth = librosa.feature.spectral_bandwidth(y=audio, sr=sr)[0]
    rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr)[0]

    features["spectral_centroid_mean"] = float(np.mean(centroid))
    features["spectral_bandwidth_mean"] = float(np.mean(bandwidth))
    features["spectral_rolloff_mean"] = float(np.mean(rolloff))

    # MFCC (FULL, NOT AGGREGATED)
    mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    features["mfcc"] = mfcc.tolist()

    # Log-Mel Spectrogram
    mel = librosa.feature.melspectrogram(y=audio, sr=sr, n_mels=64)
    log_mel = librosa.power_to_db(mel)
    features["log_mel"] = log_mel.tolist()

    return features
