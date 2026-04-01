import os
import librosa
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "song_speech_data")

SR = 16000


def extract_features(file_path):
    y, sr = librosa.load(file_path, sr=SR, mono=True)
    y = librosa.util.normalize(y)


    features = []

    zcr = librosa.feature.zero_crossing_rate(y)[0]
    features.extend([np.mean(zcr), np.std(zcr)])

    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]

    features.extend([
        np.mean(centroid), np.std(centroid),
        np.mean(rolloff), np.std(rolloff)
    ])

    rms = librosa.feature.rms(y=y)[0]
    features.extend([np.mean(rms), np.std(rms)])

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    features.extend(np.std(mfcc, axis=1))

    return np.array(features)


def collect_audio_files(root_dir):
    audio_files = []
    for root, _, files in os.walk(root_dir):
        for f in files:
            if f.lower().endswith((".wav", ".flac")):
                audio_files.append(os.path.join(root, f))
    return audio_files

def main():
    X, y = [], []

    classes = {
        "speech": 0,
        "song": 1
    }

    for cls, label in classes.items():
        cls_dir = os.path.join(DATA_DIR, cls)

        if not os.path.exists(cls_dir):
            print(f"❌ Folder not found: {cls_dir}")
            continue

        audio_files = collect_audio_files(cls_dir)
        print(f"Found {len(audio_files)} audio files for class '{cls}'")

        for file_path in audio_files:
            try:
                feats = extract_features(file_path)
                X.append(feats)
                y.append(label)
            except Exception as e:
                print(f"Skipping {file_path}: {e}")

    X = np.array(X)
    y = np.array(y)

    if len(X) == 0:
        raise ValueError("No audio files were loaded. Check dataset structure.")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=200,
        class_weight="balanced",
        random_state=42
    )

    model.fit(X_train, y_train)

    print("\n📊 Classification Report:")
    print(classification_report(y_test, model.predict(X_test)))

    MODEL_PATH = os.path.join(BASE_DIR, "song_speech", "model.joblib")
    joblib.dump(model, MODEL_PATH)

    print("\n✅ Song/Speech model trained & saved successfully")


if __name__ == "__main__":
    main()
