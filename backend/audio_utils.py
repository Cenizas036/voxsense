import librosa
import numpy as np
import soundfile as sf
import tempfile
import os
from audio_cleaning import clean_audio, enhance_audio, extract_voice

TARGET_SR = 22050
MIN_DURATION = 1.0
MAX_DURATION = 6.0


def load_raw_audio(file_path: str):
    """
    Load audio from any format, resample to TARGET_SR, enforce duration limits.
    Returns raw audio (NO cleaning/enhancement) + sample rate.
    This is the entry point for the new pipeline in app.py.
    """
    temp_wav_path = None
    try:
        if not file_path.lower().endswith(".wav"):
            audio, sr = librosa.load(file_path, sr=None, mono=True)
            temp_wav = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
            temp_wav_path = temp_wav.name
            sf.write(temp_wav_path, audio, sr)
            temp_wav.close()
        else:
            audio, sr = librosa.load(file_path, sr=None, mono=True)

        if sr != TARGET_SR:
            audio = librosa.resample(audio, orig_sr=sr, target_sr=TARGET_SR)
            sr = TARGET_SR

        duration = len(audio) / sr
        if duration < MIN_DURATION:
            raise ValueError("Audio too short")
        if duration > MAX_DURATION:
            audio = audio[: int(MAX_DURATION * sr)]

        return audio, sr

    finally:
        if temp_wav_path and os.path.exists(temp_wav_path):
            try:
                os.remove(temp_wav_path)
            except OSError:
                pass


def load_and_validate_audio(file_path):
    """
    Legacy function: loads + enhances + extracts voice.
    Kept for backward compatibility with other modules.
    """
    audio, sr = load_raw_audio(file_path)
    enhanced = enhance_audio(audio, sr)
    voice = extract_voice(enhanced, sr)
    return voice, sr
