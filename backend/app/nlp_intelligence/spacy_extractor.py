"""
NLP Pipeline Module using spaCy for Tokenization, Sentence Segmentation,
and Named Entity Recognition (PERSON, LOCATION, DATE/TIME, ORGANIZATION, INCIDENT-RELATED).

Operates deterministically without relying exclusively on LLMs.
"""

import re
from typing import Dict, Any, List

# Attempt to import spacy, with graceful fallback to blank model or regex
try:
    import spacy
    try:
        nlp = spacy.load("en_core_web_sm")
    except Exception:
        try:
            nlp = spacy.blank("en")
            if "sentencizer" not in nlp.pipe_names:
                nlp.add_pipe("sentencizer")
        except Exception:
            nlp = None
except Exception:
    nlp = None

# Known incident keyword taxonomies (Hindi / Hinglish / English)
INCIDENT_PATTERNS = {
    "threat": [
        r"\bthreat\b", r"\bthreatened\b", r"\bdhamki\b", r"\bkill\b", r"\bharm\b",
        r"\bmaar dalunga\b", r"\bjaan se maar\b", r"\bextort\b", r"\bblackmail\b",
    ],
    "violence": [
        r"\bbeat\b", r"\bbeating\b", r"\bhit\b", r"\bpeeta\b", r"\battack\b",
        r"\bhamla\b", r"\bassault\b", r"\bfight\b", r"\bchaku\b", r"\bweapon\b",
    ],
    "harassment": [
        r"\bharass\b", r"\bstalk\b", r"\bpeecha kar raha\b", r"\btease\b",
        r"\bpareshan\b", r"\btorment\b", r"\babuse\b", r"\bgali\b",
    ],
    "domestic_abuse": [
        r"\bdomestic\b", r"\bhusband\b", r"\bin-laws\b", r"\bsasural\b",
        r"\bpati ne\b", r"\bmarpeet\b", r"\bdowry\b",
    ],
    "rescue": [
        r"\btrapped\b", r"\bfas gaya\b", r"\brescue\b", r"\bbachao\b",
        r"\bflood\b", r"\bfire\b", r"\baccident\b", r"\bhelp me\b",
    ],
    "stalking": [
        r"\bfollowing me\b", r"\bpeeche pada\b", r"\boutside my house\b",
        r"\bcollege gate\b", r"\bmetro\b",
    ],
}

TIME_PATTERNS = [
    r"\byesterday\b", r"\btoday\b", r"\bkal\b", r"\baaj\b", r"\blast night\b",
    r"\bthis morning\b", r"\bat \d{1,2}(?::\d{2})?\s*(?:am|pm)?\b",
    r"\b\d{1,2}\s*(?:hours|days|weeks|months)\s*ago\b",
    r"\bsunday|monday|tuesday|wednesday|thursday|friday|saturday\b",
]

LOCATION_KEYWORDS = [
    "college", "school", "university", "hostel", "metro station", "bus stand",
    "market", "home", "house", "street", "road", "gali", "chowk", "police station",
    "hospital", "park", "office", "delhi", "mumbai", "noida", "gurgaon", "bangalore",
    "lucknow", "patna", "jaipur", "bhopal", "kolkata", "hyderabad", "chennai"
]


def extract_nlp_entities(text: str) -> Dict[str, Any]:
    """
    Extracts structured entities, sentences, and incident types using spaCy.
    
    Example Input:
      "Rohit threatened me near my college yesterday."
    Expected Output:
      {
        "persons": ["Rohit"],
        "locations": ["college"],
        "time_references": ["yesterday"],
        "organizations": [],
        "incident_type": "threat",
        "sentences": ["Rohit threatened me near my college yesterday."],
        "tokens_count": 7
      }
    """
    if not text or not text.strip():
        return {
            "persons": [],
            "locations": [],
            "time_references": [],
            "organizations": [],
            "incident_type": "general_assistance",
            "sentences": [],
            "tokens_count": 0,
        }

    clean_text = text.strip()
    persons: List[str] = []
    locations: List[str] = []
    time_refs: List[str] = []
    orgs: List[str] = []
    sentences: List[str] = []
    tokens_count = 0

    # 1. spaCy Pipeline execution if available
    if nlp is not None:
        try:
            doc = nlp(clean_text)
            tokens_count = len(doc)
            sentences = [sent.text.strip() for sent in doc.sents if sent.text.strip()]

            for ent in doc.ents:
                ent_text = ent.text.strip()
                if ent.label_ in ("PERSON", "PER") and ent_text not in persons:
                    persons.append(ent_text)
                elif ent.label_ in ("GPE", "LOC", "FAC") and ent_text not in locations:
                    locations.append(ent_text)
                elif ent.label_ in ("DATE", "TIME") and ent_text not in time_refs:
                    time_refs.append(ent_text)
                elif ent.label_ in ("ORG",) and ent_text not in orgs:
                    orgs.append(ent_text)
        except Exception:
            pass

    if not sentences:
        sentences = [s.strip() for s in re.split(r"[.!?\n]+", clean_text) if s.strip()]
    if tokens_count == 0:
        tokens_count = len(clean_text.split())

    # 2. Heuristic regex enrichment for Indian / conversational contexts
    lower_text = clean_text.lower()

    # Time references
    for t_pat in TIME_PATTERNS:
        for match in re.finditer(t_pat, lower_text, re.IGNORECASE):
            val = match.group(0).strip()
            if val and val not in [t.lower() for t in time_refs]:
                time_refs.append(val)

    # Location references (e.g. "college", "metro station", etc.)
    for loc_kw in LOCATION_KEYWORDS:
        if re.search(r"\b" + re.escape(loc_kw) + r"\b", lower_text):
            # Check if not already covered
            if not any(loc_kw in l.lower() for l in locations):
                locations.append(loc_kw)

    # Person references heuristic (e.g. "Rohit", capitalized names at start/middle)
    if not persons:
        # Match capitalized word followed by verb/action or preposition
        cap_matches = re.findall(r"\b([A-Z][a-z]{2,15})\s+(?:threatened|hit|called|followed|told|said|ne)\b", clean_text)
        for m in cap_matches:
            if m.lower() not in ("the", "yesterday", "today", "someone", "they", "he", "she"):
                if m not in persons:
                    persons.append(m)

    # 3. Incident Type Classification
    detected_incident_type = "general_assistance"
    for inc_type, patterns in INCIDENT_PATTERNS.items():
        if any(re.search(pat, lower_text) for pat in patterns):
            detected_incident_type = inc_type
            break

    return {
        "persons": persons,
        "locations": locations,
        "time_references": time_refs,
        "organizations": orgs,
        "incident_type": detected_incident_type,
        "sentences": sentences,
        "tokens_count": tokens_count,
    }
