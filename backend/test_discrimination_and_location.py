import sys
from pathlib import Path
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.ai_engine_1.indicators import detect_indicators, _load_config
from app.ai_engine_1.svi_engine import SVIState, update_svi
from app.ai_engine_1.location_extractor import extract_location

config = _load_config()

print("=" * 80)
print("TESTING DISCRIMINATION PHRASES, SVI CALCULATION & LOCATION EXTRACTION")
print("=" * 80)

# Test 1: Discrimination & Partial Word Phrases
discrim_tests = [
    "and describe कर रहे थे मेरे साथ discrimi",
    "describe kar rahe the mere saath discriminate kar rahe the",
    "mere saath bhedbhav kiya ja raha hai",
    "jaati ke aadhar par mujhe dhamkaya aur discriminate kiya",
    "they are describing and discriminating against me unfairly",
]

print("\n--- 1. DISCRIMINATION & SVI SCORING TESTS ---")
for text in discrim_tests:
    state = SVIState(session_id="test_discrim")
    indicators, raw_distress, calming_factor = detect_indicators(text, config=config)
    state = update_svi(
        state=state,
        new_chunk_text=text,
        raw_distress_score=raw_distress,
        calming_factor=calming_factor,
        pace_score=0.0,
        pace_label="normal",
        new_indicators=indicators,
        config=config,
    )
    detected_cats = [f"{ind.category} (conf={ind.confidence:.2f}, match='{ind.matched_phrase}')" for ind in indicators]
    print(f"INPUT: \"{text}\"")
    print(f"  Detected: {detected_cats}")
    print(f"  Raw Distress: {raw_distress} | SVI: {state.running_svi:.1f} ({state.last_svi_label})")
    print(f"  Category Scores: {state.category_scores.get('Caste / Discrimination', 0)}% (Caste / Discrimination)")
    print()

# Test 2: Location Extraction Tests (English, Hindi Devanagari, Hinglish)
loc_tests = [
    "main Lucknow se bol raha hoon",
    "मैं गोमती नगर, लखनऊ से बोल रही हूँ",
    "mera ghar Sector 62 Noida mein hai",
    "I live in Hazratganj, Lucknow, UP",
    "yahan Kanpur mein mere saath ladai ho rahi hai",
    "हम वाराणसी से हैं",
    "स्थान दिल्ली है",
    "calling from Aliganj Bareilly",
    "Main abhi Patna Bihar mein hoon",
]

print("\n--- 2. VOICE LOCATION EXTRACTION TESTS ---")
for loc_phrase in loc_tests:
    parsed = extract_location(loc_phrase, {})
    print(f"INPUT: \"{loc_phrase}\"")
    print(f"  Detected Location: {parsed}\n")

print("=" * 80)
