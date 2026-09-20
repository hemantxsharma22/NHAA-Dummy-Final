"""
Structured Case Indicators Extractor.
Extracts operational case flags: threat, violence, urgency, repeated harassment,
immediate danger, requested help, and vulnerability indicators.
"""

import re
from typing import Dict, Any, List

INDICATOR_RULES = {
    "threat": [
        r"\bthreat\b", r"\bthreatened\b", r"\bdhamki\b", r"\bkill\b", r"\bharm\b",
        r"\bmarne\b", r"\bmarne ki\b", r"\bmarne wala\b", r"\bmaar denge\b", r"\bextort\b", r"\bblackmail\b", r"\bdestroy\b",
        r"धमकी", r"मारने", r"मारने वाला", r"मारने वाली", r"मारना", r"मार देंगे", r"मार देगा", r"जान से मार", r"कत्ल", r"हत्या"
    ],
    "violence": [
        r"\bbeat\b", r"\bbeating\b", r"\bhit\b", r"\bpeeta\b", r"\battack\b",
        r"\bhamla\b", r"\bassault\b", r"\bweapon\b", r"\bchaku\b", r"\bgun\b", r"\bkhoon\b",
        r"खून", r"मारा", r"पीटा", r"मारपीट", r"हमला", r"चाकू", r"चोट लगी", r"घायल", r"जख्मी"
    ],
    "urgency": [
        r"\bemergency\b", r"\bnow\b", r"\babhi\b", r"\bjaldi\b", r"\bimmediately\b",
        r"\bturant\b", r"\bhurry\b", r"\bright now\b", r"\bat once\b",
        r"तुरंत", r"अभी", r"जल्दी", r"आपातकालीन"
    ],
    "repeated_harassment": [
        r"\bevery day\b", r"\broz\b", r"\bagain and again\b", r"\bbaar baar\b",
        r"\bcontinously\b", r"\bsince \d+\b", r"\bpast \d+\b", r"\bmultiple times\b", r"\bmonths\b",
        r"रोज", r"बार बार", r"लगातार", r"महीनों से"
    ],
    "immediate_danger": [
        r"\boutside my door\b", r"\bfollowing me now\b", r"\bholding a knife\b",
        r"\blocked in\b", r"\btrapped\b", r"\bcan't breathe\b", r"\bin danger\b", r"\bchup ke betha\b",
        r"\bsuraksha\b", r"\bbachao\b", r"\bkhatre mein\b",
        r"सुरक्षा", r"सुरक्षा दीजिए", r"सुरक्षा चाहिए", r"बचाओ", r"बचा लो", r"खतरे में", r"दरवाजे पर", r"हथियार"
    ],
    "vulnerability": [
        r"\balone\b", r"\bakela\b", r"\bakeli\b", r"\bchild\b", r"\bkid\b", r"\bbacha\b",
        r"\belderly\b", r"\bpregnant\b", r"\bdisabled\b", r"\bno family\b", r"\bnowhere to go\b",
        r"अकेला", r"अकेली", "कोई नहीं है", "कोई सहारा नहीं", "बच्चा", "गर्भवती"
    ]
}

HELP_PATTERNS = [
    r"\bneed (?:police|ambulance|help|protection|shelter|lawyer|rescue)\b",
    r"\bpolice bhejo\b", r"\bmadad chahiye\b", r"\bhelp me please\b", r"\bsend someone\b",
    r"\bsuraksha dijiye\b", r"\bsuraksha chahiye\b", r"\bbachao\b",
    r"सुरक्षा दीजिए", r"सुरक्षा चाहिए", r"सुरक्षा भेजो", r"पुलिस भेजो", r"पुलिस बुलाओ", r"मदद चाहिए", r"बचाओ"
]


def extract_case_indicators(text: str) -> Dict[str, Any]:
    """
    Extracts structured operational case indicators from transcript or narrative.
    """
    if not text:
        return {
            "threat_detected": False,
            "violence_detected": False,
            "urgency_detected": False,
            "repeated_harassment": False,
            "immediate_danger": False,
            "vulnerability_detected": False,
            "requested_help": "Assistance / Information",
            "matched_indicators": [],
        }

    lower = text.lower()
    matched: List[str] = []

    threat = any(re.search(pat, lower) for pat in INDICATOR_RULES["threat"])
    violence = any(re.search(pat, lower) for pat in INDICATOR_RULES["violence"])
    urgency = any(re.search(pat, lower) for pat in INDICATOR_RULES["urgency"])
    harassment = any(re.search(pat, lower) for pat in INDICATOR_RULES["repeated_harassment"])
    danger = any(re.search(pat, lower) for pat in INDICATOR_RULES["immediate_danger"])
    vulnerability = any(re.search(pat, lower) for pat in INDICATOR_RULES["vulnerability"])

    if threat: matched.append("Threat Language")
    if violence: matched.append("Physical Violence / Weapon")
    if urgency: matched.append("High Urgency Cues")
    if harassment: matched.append("Repeated Harassment Pattern")
    if danger: matched.append("Immediate Safety Threat")
    if vulnerability: matched.append("Isolation / Vulnerability Signals")

    # Help requested extraction
    requested_help = "General Helpline Guidance"
    for h_pat in HELP_PATTERNS:
        match = re.search(h_pat, lower)
        if match:
            requested_help = match.group(0).capitalize()
            break
    if danger or violence:
        requested_help = "Immediate Police / Protection Dispatch"

    return {
        "threat_detected": threat,
        "violence_detected": violence,
        "urgency_detected": urgency,
        "repeated_harassment": harassment,
        "immediate_danger": danger,
        "vulnerability_detected": vulnerability,
        "requested_help": requested_help,
        "matched_indicators": matched,
    }
