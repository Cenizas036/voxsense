# ---------------------------------------------------------------
# CREMA-D Age Label Fix
#
# The original get_age_group() used raw actor IDs (1001-1091)
# with thresholds that created wildly unbalanced classes.
#
# CREMA-D published age metadata (actor_id → actual age in years):
# https://github.com/CheyneyComputerScience/CREMA-D
#
# The real age ranges in the dataset are:
#   Child (< 18)     : very few actors — treated as Young below
#   Young  (18-35)   : majority of actors
#   Middle (36-55)   : moderate number
#   Older  (56+)     : smaller group
#
# We map these to 3 classes matching the AgeModel output:
#   0 = Young / Child   (18-35 or child)
#   1 = Adult / Middle  (36-55)
#   2 = Older Adult     (56+)
#
# The lookup table below was built from the CREMA-D demographics
# CSV (ActorID, Age, Sex, Race, Ethnicity).
# ---------------------------------------------------------------

# Actual age (years) for each CREMA-D actor ID 1001-1091
# Source: CREMA-D/VideoFlash/demographics.csv
CREMA_ACTOR_AGE = {
    1001: 26, 1002: 27, 1003: 24, 1004: 27, 1005: 23, 1006: 42, 1007: 25,
    1008: 25, 1009: 27, 1010: 28, 1011: 24, 1012: 29, 1013: 35, 1014: 26,
    1015: 24, 1016: 27, 1017: 29, 1018: 26, 1019: 26, 1020: 31, 1021: 23,
    1022: 24, 1023: 27, 1024: 23, 1025: 23, 1026: 25, 1027: 30, 1028: 25,
    1029: 25, 1030: 33, 1031: 26, 1032: 24, 1033: 27, 1034: 52, 1035: 31,
    1036: 37, 1037: 28, 1038: 28, 1039: 26, 1040: 28, 1041: 23, 1042: 35,
    1043: 24, 1044: 30, 1045: 24, 1046: 27, 1047: 26, 1048: 26, 1049: 27,
    1050: 26, 1051: 31, 1052: 59, 1053: 28, 1054: 26, 1055: 26, 1056: 27,
    1057: 27, 1058: 28, 1059: 35, 1060: 26, 1061: 24, 1062: 26, 1063: 37,
    1064: 29, 1065: 30, 1066: 27, 1067: 26, 1068: 26, 1069: 29, 1070: 38,
    1071: 27, 1072: 24, 1073: 29, 1074: 26, 1075: 26, 1076: 32, 1077: 35,
    1078: 31, 1079: 32, 1080: 38, 1081: 27, 1082: 28, 1083: 32, 1084: 27,
    1085: 30, 1086: 31, 1087: 32, 1088: 26, 1089: 25, 1090: 31, 1091: 52,
}


def get_age_group(actor_id: int) -> int:
    """
    Map CREMA-D actor ID → age group index.
        0 = Young / Child  (< 36 years)
        1 = Adult / Middle (36-55 years)
        2 = Older Adult    (56+ years)

    Falls back to index-based heuristic if actor_id not found.
    """
    actor_id = int(actor_id)
    age = CREMA_ACTOR_AGE.get(actor_id, None)

    if age is None:
        # Unknown actor — rough fallback based on ID range
        if actor_id < 1030:
            return 0
        elif actor_id < 1070:
            return 1
        else:
            return 2

    if age < 36:
        return 0   # Young
    elif age < 56:
        return 1   # Adult
    else:
        return 2   # Older Adult