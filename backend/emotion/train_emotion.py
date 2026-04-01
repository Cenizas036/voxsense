import os
import numpy as np
import librosa
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from sklearn.model_selection import train_test_split

from models.emotion_model import EmotionModel
from preprocessing.dataset_parser import parse_metadata


# ======================
# DEVICE
# ======================

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("Using device:", device)


# ======================
# PATHS
# ======================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(BASE_DIR, "..", "datasets")
MODEL_PATH = os.path.join(BASE_DIR, "emotion_model.pth")
PRETRAINED_PATH = os.path.join(BASE_DIR, "..", "song_speech", "cnn_song_speech.pth")


# ======================
# EMOTION LABEL MAP
# ======================

EMOTION_LABELS = {
    "neutral": 0,
    "happy": 1,
    "sad": 2,
    "angry": 3,
    "fear": 4,
    "disgust": 5,
    "surprise": 6
}


# ======================
# COLLECT FILES
# ======================

def collect_files(root_dir):
    files = []
    labels = []

    for root, _, filenames in os.walk(root_dir):
        for f in filenames:
            if f.lower().endswith((".wav", ".flac", ".mp3")):
                full_path = os.path.join(root, f)

                metadata = parse_metadata(full_path)
                if metadata:
                    emotion = metadata["emotion"]

                    if emotion in EMOTION_LABELS:
                        files.append(full_path)
                        labels.append(EMOTION_LABELS[emotion])

    return files, labels


# ======================
# DATASET
# ======================

class EmotionDataset(Dataset):
    def __init__(self, file_list, labels):
        self.file_list = file_list
        self.labels = labels
        self.target_length = 22050 * 5

    def __len__(self):
        return len(self.file_list)

    def __getitem__(self, idx):
        file = self.file_list[idx]
        label = self.labels[idx]

        y, sr = librosa.load(file, sr=22050)

        if len(y) < self.target_length:
            y = np.pad(y, (0, self.target_length - len(y)))
        else:
            y = y[:self.target_length]

        y = librosa.util.normalize(y)

        mel = librosa.feature.melspectrogram(
            y=y,
            sr=sr,
            n_mels=128,
            hop_length=512
        )

        mel_db = librosa.power_to_db(mel, ref=np.max)

        if mel_db.shape[1] < 216:
            pad_width = 216 - mel_db.shape[1]
            mel_db = np.pad(mel_db, ((0, 0), (0, pad_width)))
        else:
            mel_db = mel_db[:, :216]

        mel_db = np.expand_dims(mel_db, axis=0)

        return torch.tensor(mel_db, dtype=torch.float32), torch.tensor(label, dtype=torch.long)


# ======================
# MAIN TRAINING
# ======================

def main():

    print("Collecting emotion samples...")
    files, labels = collect_files(DATASET_DIR)

    print("Total emotion samples:", len(files))

    X_train, X_val, y_train, y_val = train_test_split(
        files,
        labels,
        test_size=0.2,
        stratify=labels,
        random_state=42
    )

    train_dataset = EmotionDataset(X_train, y_train)
    val_dataset = EmotionDataset(X_val, y_val)

    train_loader = DataLoader(train_dataset, batch_size=16, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=16, shuffle=False, num_workers=0)

    model = EmotionModel().to(device)

    # Load pretrained backbone
    pretrained_weights = torch.load(PRETRAINED_PATH, map_location=device)
    model.backbone.load_state_dict(
        {k.replace("backbone.", ""): v for k, v in pretrained_weights.items() if "backbone" in k},
        strict=False
    )

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=0.0003)

    epochs = 12

    for epoch in range(epochs):

        model.train()
        running_loss = 0

        for inputs, targets in train_loader:
            inputs = inputs.to(device)
            targets = targets.to(device)

            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

            running_loss += loss.item()

        print(f"Epoch {epoch+1}/{epochs} - Loss: {running_loss/len(train_loader):.4f}")

        model.eval()
        correct = 0
        total = 0

        with torch.no_grad():
            for inputs, targets in val_loader:
                inputs = inputs.to(device)
                targets = targets.to(device)

                outputs = model(inputs)
                _, predicted = torch.max(outputs, 1)

                total += targets.size(0)
                correct += (predicted == targets).sum().item()

        print(f"Validation Accuracy: {100 * correct / total:.2f}%\n")

    torch.save(model.state_dict(), MODEL_PATH)
    print("Emotion model saved:", MODEL_PATH)


if __name__ == "__main__":
    main()
