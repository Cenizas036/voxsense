import os
import random
import numpy as np
import librosa
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from sklearn.model_selection import train_test_split

from backend.models.song_speech_model import SongSpeechModel


# ======================
# DEVICE SETUP
# ======================

print("Torch version:", torch.__version__)
print("CUDA available:", torch.cuda.is_available())
print("CUDA device count:", torch.cuda.device_count())

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("Using device:", device)

if torch.cuda.is_available():
    print("GPU Name:", torch.cuda.get_device_name(0))


# ======================
# PATHS
# ======================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))

SPEECH_DIR = os.path.join(BACKEND_DIR, "song_speech_data", "speech")
SONG_DIR = os.path.join(BACKEND_DIR, "song_speech_data", "song")

MODEL_PATH = os.path.join(BASE_DIR, "cnn_song_speech.pth")


# ======================
# RECURSIVE FILE LOADER
# ======================

def load_files_recursive(directory):
    files = []
    for root, dirs, filenames in os.walk(directory):
        for f in filenames:
            if f.lower().endswith((".wav", ".flac", ".mp3")):
                files.append(os.path.join(root, f))
    return files


# ======================
# DATASET (FIXED SIZE)
# ======================
class AudioDataset(Dataset):
    def __init__(self, file_list, labels):
        self.file_list = file_list
        self.labels = labels
        self.target_length = 22050 * 5

    def __len__(self):
        return len(self.file_list)

    def add_noise(self, audio):
        noise = np.random.randn(len(audio))
        return audio + 0.005 * noise

    def random_bandpass(self, audio, sr):
        from scipy.signal import butter, lfilter
        lowcut = np.random.uniform(250, 400)
        highcut = np.random.uniform(3000, 4500)

        nyq = 0.5 * sr
        low = lowcut / nyq
        high = highcut / nyq

        b, a = butter(4, [low, high], btype='band')
        return lfilter(b, a, audio)

    def __getitem__(self, idx):
        file = self.file_list[idx]
        label = self.labels[idx]

        y, sr = librosa.load(file, sr=22050)

        if len(y) < self.target_length:
            y = np.pad(y, (0, self.target_length - len(y)))
        else:
            y = y[:self.target_length]

        # 🎯 AUGMENTATIONS
        if np.random.rand() > 0.5:
            y = self.random_bandpass(y, sr)

        if np.random.rand() > 0.5:
            y = self.add_noise(y)

        if np.random.rand() > 0.5:
            y = y * np.random.uniform(0.6, 1.4)

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
    print("\nLoading dataset...")

    speech_files = load_files_recursive(SPEECH_DIR)
    song_files = load_files_recursive(SONG_DIR)

    min_count = min(len(speech_files), len(song_files))

    speech_files = random.sample(speech_files, min_count)
    song_files = random.sample(song_files, min_count)

    files = speech_files + song_files
    labels = [0] * min_count + [1] * min_count

    X_train, X_val, y_train, y_val = train_test_split(
        files,
        labels,
        test_size=0.2,
        stratify=labels,
        random_state=42
    )

    train_dataset = AudioDataset(X_train, y_train)
    val_dataset = AudioDataset(X_val, y_val)

    train_loader = DataLoader(train_dataset, batch_size=16, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=16, shuffle=False, num_workers=0)

    model = SongSpeechModel().to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=0.0003)

    epochs = 10

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
    print("Model saved to:", MODEL_PATH)


if __name__ == "__main__":
    main()
