import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.ai_engine_1.indicators import detect_indicators, _load_config
from app.ai_engine_1.svi_engine import SVIState, update_svi

test_cases = [
    "someone threatened me",
    "mujhe dhamki di hai",
    "mujhe usne jaan se maarne ki dhamki di",
    "he threatened me but I am safe now",
    "he did not threaten me",
    "I am scared because he is outside my house",
]

config = _load_config()

print("=" * 80)
print("TESTING 6 BENCHMARK SCENARIOS")
print("=" * 80)

for text in test_cases:
    state = SVIState(session_id="test_sess")
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
    
    print(f"\nINPUT: \"{text}\"")
    print(f"  Detected Indicators: {[f'{ind.category} (conf={ind.confidence:.2f}, match={ind.matched_phrase})' for ind in indicators]}")
    print(f"  Raw Distress Score:  {raw_distress}")
    print(f"  Calming Factor:      {calming_factor}")
    print(f"  Resulting SVI:       {state.running_svi:.1f} ({state.last_svi_label})")
    print(f"  Evidence Snippets:   {state.category_evidence}")
print("=" * 80)
