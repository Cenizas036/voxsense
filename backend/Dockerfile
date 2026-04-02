FROM python:3.11-slim

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend source code
COPY . .

# Download model weights from HuggingFace model repo at build time
RUN python - <<'EOF'
from huggingface_hub import hf_hub_download
import os

REPO = "Sanket036/voxsense"

files = {
    "gender/gender_model.pth":           "gender_model.pth",
    "gender/gender_model_v1.pth":        "gender_model_v1.pth",
    "gender/gender_model_v2.pth":        "gender_model_v2.pth",
    "age/age_model.pth":                 "age_model.pth",
    "age/age_model_v1.pth":              "age_model_v1.pth",
    "age/age_model_v2.pth":              "age_model_v2.pth",
    "emotion/emotion_model.pth":         "emotion_model.pth",
    "emotion/emotion_model_v2.pth":      "emotion_model_v2.pth",
    "song_speech/cnn_song_speech.pth":   "cnn_song_speech.pth",
    "noise_models/best_model.pt":        "best_model.pt",
    "noise_models/best_noise_model.pt":  "best_noise_model.pt",
    "friend_models/attentive_lstm.pth":  "attentive_lstm.pth",
    "friend_models/cnn.pth":             "cnn.pth",
    "friend_models/lstm.pth":            "lstm.pth",
    "friend_models/transformer_cnn.pth": "transformer_cnn.pth",
    "friend_models/svm_gender.joblib":   "svm_gender.joblib",
    "friend_models/svm_age.joblib":      "svm_age.joblib",
    "friend_models/svm_emotion.joblib":  "svm_emotion.joblib",
    "friend_models/svm_all.joblib":      "svm_all.joblib",
    "friend_models/xgb_gender.joblib":   "xgb_gender.joblib",
    "friend_models/xgb_age.joblib":      "xgb_age.joblib",
    "friend_models/xgb_emotion.joblib":  "xgb_emotion.joblib",
    "friend_models/xgb_all.joblib":      "xgb_all.joblib",
    "friend_models/rf_gender.joblib":    "rf_gender.joblib",
    "friend_models/rf_age.joblib":       "rf_age.joblib",
}

for local_path, hf_filename in files.items():
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    print(f"Downloading {hf_filename} -> {local_path}")
    path = hf_hub_download(repo_id=REPO, filename=hf_filename, local_dir="/tmp/models")
    os.rename(path, local_path)
    print(f"  Done: {local_path}")

print("All models downloaded.")
EOF

# Create required directories
RUN mkdir -p static/plots static/images outputs/temp_audio

# HuggingFace Spaces runs on port 7860
EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
