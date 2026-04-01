#!/bin/bash
set -e

echo "==> Installing Python dependencies..."
pip install -r requirements.txt

BASE_URL="https://huggingface.co/Sanket036/voxsense/resolve/main"

echo "==> Downloading model weights from HuggingFace..."

# Gender models
wget -q --show-progress -O gender/gender_model.pth "$BASE_URL/gender_model.pth"
wget -q --show-progress -O gender/gender_model_v1.pth "$BASE_URL/gender_model_v1.pth"
wget -q --show-progress -O gender/gender_model_v2.pth "$BASE_URL/gender_model_v2.pth"

# Age models
wget -q --show-progress -O age/age_model.pth "$BASE_URL/age_model.pth"
wget -q --show-progress -O age/age_model_v1.pth "$BASE_URL/age_model_v1.pth"
wget -q --show-progress -O age/age_model_v2.pth "$BASE_URL/age_model_v2.pth"

# Emotion models
wget -q --show-progress -O emotion/emotion_model.pth "$BASE_URL/emotion_model.pth"
wget -q --show-progress -O emotion/emotion_model_v2.pth "$BASE_URL/emotion_model_v2.pth"

# Song/speech CNN
wget -q --show-progress -O song_speech/cnn_song_speech.pth "$BASE_URL/cnn_song_speech.pth"

# Friend models (.pth)
wget -q --show-progress -O friend_models/attentive_lstm.pth "$BASE_URL/attentive_lstm.pth"
wget -q --show-progress -O friend_models/cnn.pth "$BASE_URL/cnn.pth"
wget -q --show-progress -O friend_models/lstm.pth "$BASE_URL/lstm.pth"
wget -q --show-progress -O friend_models/transformer_cnn.pth "$BASE_URL/transformer_cnn.pth"

# Noise models
wget -q --show-progress -O noise_models/best_model.pt "$BASE_URL/best_model.pt"
wget -q --show-progress -O noise_models/best_noise_model.pt "$BASE_URL/best_noise_model.pt"

# Friend models (.joblib) — skipping rf_all (2.98GB) and rf_emotion (2.57GB) to avoid build timeout
wget -q --show-progress -O friend_models/svm_gender.joblib "$BASE_URL/svm_gender.joblib"
wget -q --show-progress -O friend_models/svm_age.joblib "$BASE_URL/svm_age.joblib"
wget -q --show-progress -O friend_models/svm_emotion.joblib "$BASE_URL/svm_emotion.joblib"
wget -q --show-progress -O friend_models/svm_all.joblib "$BASE_URL/svm_all.joblib"
wget -q --show-progress -O friend_models/xgb_gender.joblib "$BASE_URL/xgb_gender.joblib"
wget -q --show-progress -O friend_models/xgb_age.joblib "$BASE_URL/xgb_age.joblib"
wget -q --show-progress -O friend_models/xgb_emotion.joblib "$BASE_URL/xgb_emotion.joblib"
wget -q --show-progress -O friend_models/xgb_all.joblib "$BASE_URL/xgb_all.joblib"
wget -q --show-progress -O friend_models/rf_gender.joblib "$BASE_URL/rf_gender.joblib"
wget -q --show-progress -O friend_models/rf_age.joblib "$BASE_URL/rf_age.joblib"

echo "==> All models downloaded successfully."