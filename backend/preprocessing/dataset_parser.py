import os

# ============================================================
# EMOTION MAPS
# ============================================================

RAVDESS_EMOTION_MAP = {
    "01": "neutral", "02": "calm", "03": "happy", "04": "sad",
    "05": "angry",   "06": "fear", "07": "disgust", "08": "surprise"
}

CREMA_EMOTION_MAP = {
    "ANG": "angry", "DIS": "disgust", "FEA": "fear",
    "HAP": "happy", "NEU": "neutral", "SAD": "sad"
}

EMODB_EMOTION_MAP = {
    "W": "angry", "L": "bored", "E": "disgust",
    "A": "fear",  "F": "happy", "T": "sad", "N": "neutral"
}

# ============================================================
# CREMA-D GENDER LOOKUP
# Real gender from official CREMA-D demographics.csv
# M = male, F = female
# ============================================================

CREMA_ACTOR_GENDER = {
    1001:"M",1002:"M",1003:"F",1004:"F",1005:"M",1006:"M",1007:"F",1008:"F",
    1009:"F",1010:"M",1011:"F",1012:"F",1013:"M",1014:"F",1015:"F",1016:"M",
    1017:"F",1018:"M",1019:"M",1020:"M",1021:"F",1022:"F",1023:"M",1024:"F",
    1025:"F",1026:"M",1027:"F",1028:"M",1029:"M",1030:"M",1031:"F",1032:"M",
    1033:"M",1034:"F",1035:"M",1036:"M",1037:"M",1038:"F",1039:"F",1040:"M",
    1041:"F",1042:"M",1043:"F",1044:"M",1045:"F",1046:"M",1047:"M",1048:"F",
    1049:"F",1050:"M",1051:"M",1052:"M",1053:"F",1054:"F",1055:"M",1056:"F",
    1057:"M",1058:"M",1059:"M",1060:"F",1061:"M",1062:"F",1063:"M",1064:"F",
    1065:"M",1066:"M",1067:"F",1068:"F",1069:"F",1070:"M",1071:"M",1072:"F",
    1073:"M",1074:"F",1075:"M",1076:"M",1077:"M",1078:"F",1079:"M",1080:"F",
    1081:"M",1082:"F",1083:"F",1084:"M",1085:"F",1086:"M",1087:"M",1088:"F",
    1089:"M",1090:"F",1091:"M",
}

# CREMA-D age lookup (actual ages from demographics.csv)
CREMA_ACTOR_AGE = {
    1001:26,1002:27,1003:24,1004:27,1005:23,1006:42,1007:25,1008:25,
    1009:27,1010:28,1011:24,1012:29,1013:35,1014:26,1015:24,1016:27,
    1017:29,1018:26,1019:26,1020:31,1021:23,1022:24,1023:27,1024:23,
    1025:23,1026:25,1027:30,1028:25,1029:25,1030:33,1031:26,1032:24,
    1033:27,1034:52,1035:31,1036:37,1037:28,1038:28,1039:26,1040:28,
    1041:23,1042:35,1043:24,1044:30,1045:24,1046:27,1047:26,1048:26,
    1049:27,1050:26,1051:31,1052:59,1053:28,1054:26,1055:26,1056:27,
    1057:27,1058:28,1059:35,1060:26,1061:24,1062:26,1063:37,1064:29,
    1065:30,1066:27,1067:26,1068:26,1069:29,1070:38,1071:27,1072:24,
    1073:29,1074:26,1075:26,1076:32,1077:35,1078:31,1079:32,1080:38,
    1081:27,1082:28,1083:32,1084:27,1085:30,1086:31,1087:32,1088:26,
    1089:25,1090:31,1091:52,
}


def _age_to_group(age: int) -> str:
    if age < 36:   return "young"
    if age < 56:   return "adult"
    return "older"


# ============================================================
# PARSERS
# ============================================================

def parse_ravdess(file_path: str) -> dict:
    """
    RAVDESS filename: 03-01-05-01-01-01-12.wav
    field[2] = emotion, field[-1] = actor_id (odd=male, even=female)
    """
    filename = os.path.basename(file_path)
    parts = filename.replace(".wav","").split("-")
    if len(parts) < 7:
        return None
    emotion_code = parts[2]
    actor_id     = int(parts[6])
    gender       = "male" if actor_id % 2 != 0 else "female"
    emotion      = RAVDESS_EMOTION_MAP.get(emotion_code, "unknown")
    return {"dataset":"ravdess","gender":gender,"emotion":emotion,"age_group":"adult"}


def parse_crema_d(file_path: str) -> dict:
    """
    CREMA-D filename: 1001_DFA_ANG_XX.wav
    field[0] = actor_id, field[2] = emotion_code
    Gender from lookup table (NOT from filename structure).
    """
    filename = os.path.basename(file_path)
    parts = filename.replace(".wav","").split("_")
    if len(parts) < 3:
        return None
    try:
        actor_id     = int(parts[0])
    except ValueError:
        return None
    emotion_code = parts[2]
    gender_code  = CREMA_ACTOR_GENDER.get(actor_id, "M")
    gender       = "male" if gender_code == "M" else "female"
    emotion      = CREMA_EMOTION_MAP.get(emotion_code, "unknown")
    age          = CREMA_ACTOR_AGE.get(actor_id, 28)
    age_group    = _age_to_group(age)
    return {"dataset":"crema_d","gender":gender,"emotion":emotion,"age_group":age_group}


def parse_emo_db(file_path: str) -> dict:
    """
    EmoDB filename: 03a01Fa.wav
    char[0] = speaker id (male: 03,10,11,12,15 / female: 08,09,13,14,16)
    char[5] = emotion code
    """
    filename = os.path.basename(file_path)
    if len(filename) < 6:
        return None
    speaker_id = filename[:2]
    male_speakers = {"03","10","11","12","15"}
    gender = "male" if speaker_id in male_speakers else "female"
    emotion_char = filename[5] if len(filename) > 5 else "N"
    emotion = EMODB_EMOTION_MAP.get(emotion_char.upper(), "unknown")
    return {"dataset":"emo_db","gender":gender,"emotion":emotion,"age_group":"adult"}


def parse_tess(file_path: str) -> dict:
    """
    TESS filename: YAF_back_angry.wav  or  OAF_back_angry.wav
    YAF = Young Adult Female, OAF = Older Adult Female
    emotion is the last part before .wav
    """
    filename = os.path.basename(file_path)
    parts = filename.replace(".wav","").split("_")
    emotion = parts[-1].lower() if parts else "unknown"
    # Normalize TESS emotion names to match other datasets
    tess_map = {
        "angry":"angry","disgust":"disgust","fear":"fear",
        "happy":"happy","neutral":"neutral","sad":"sad",
        "ps":"surprise","surprise":"surprise"
    }
    emotion  = tess_map.get(emotion, emotion)
    prefix   = parts[0].upper() if parts else "YAF"
    age_group = "older" if prefix == "OAF" else "young"
    return {"dataset":"tess","gender":"female","emotion":emotion,"age_group":age_group}


# ============================================================
# MASTER PARSER
# ============================================================

def parse_metadata(file_path: str) -> dict:
    path_lower = file_path.replace("\\", "/").lower()
    if "ravdess" in path_lower:
        return parse_ravdess(file_path)
    if "crema" in path_lower:
        return parse_crema_d(file_path)
    if "emo_db" in path_lower or "emodb" in path_lower:
        return parse_emo_db(file_path)
    if "tess" in path_lower:
        return parse_tess(file_path)
    return None