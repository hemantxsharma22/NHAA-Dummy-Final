"""
Engine 1: Dynamic Location Extractor for Caller Speech

Extracts Area/Street, City, District, and State from caller transcripts in:
- Hindi (e.g. "Main Lucknow se hoon", "Mera ghar Gomti Nagar mein hai")
- English (e.g. "I am from Gomti Nagar, Lucknow", "I live in Hazratganj")
- Hinglish (e.g. "Calling from Sector 62, Noida", "Main Gomti Nagar, Lucknow, UP se bol rahi hoon")

Adheres strictly to rules:
1. No guessing. If only city is mentioned, leave street and district empty.
2. Only caller speech is parsed (not operator).
3. Preserves previously confirmed location fields if subsequent speech lacks new location info.
"""

import re
from typing import Optional, Dict

# Common Indian States and their aliases (English + Devanagari)
INDIAN_STATES = {
    "uttar pradesh": "Uttar Pradesh",
    "उत्तर प्रदेश": "Uttar Pradesh",
    "u.p.": "Uttar Pradesh",
    "up": "Uttar Pradesh",
    "up state": "Uttar Pradesh",
    "bihar": "Bihar",
    "बिहार": "Bihar",
    "madhya pradesh": "Madhya Pradesh",
    "मध्य प्रदेश": "Madhya Pradesh",
    "m.p.": "Madhya Pradesh",
    "mp": "Madhya Pradesh",
    "delhi": "Delhi",
    "दिल्ली": "Delhi",
    "new delhi": "Delhi",
    "नई दिल्ली": "Delhi",
    "ncr": "Delhi-NCR",
    "delhi ncr": "Delhi-NCR",
    "rajasthan": "Rajasthan",
    "राजस्थान": "Rajasthan",
    "maharashtra": "Maharashtra",
    "महाराष्ट्र": "Maharashtra",
    "haryana": "Haryana",
    "हरियाणा": "Haryana",
    "punjab": "Punjab",
    "पंजाब": "Punjab",
    "uttarakhand": "Uttarakhand",
    "उत्तराखंड": "Uttarakhand",
    "jharkhand": "Jharkhand",
    "झारखंड": "Jharkhand",
    "chhattisgarh": "Chhattisgarh",
    "छत्तीसगढ़": "Chhattisgarh",
    "gujarat": "Gujarat",
    "गुजरात": "Gujarat",
    "west bengal": "West Bengal",
    "पश्चिम बंगाल": "West Bengal",
    "karnataka": "Karnataka",
    "कर्नाटक": "Karnataka",
    "tamil nadu": "Tamil Nadu",
    "तमिलनाडु": "Tamil Nadu",
}

# Major cities (English + Devanagari)
KNOWN_CITIES = {
    "lucknow": "Lucknow",
    "लखनऊ": "Lucknow",
    "kanpur": "Kanpur",
    "कानपुर": "Kanpur",
    "varanasi": "Varanasi",
    "वाराणसी": "Varanasi",
    "banaras": "Varanasi",
    "बनारस": "Varanasi",
    "kashi": "Varanasi",
    "काशी": "Varanasi",
    "prayagraj": "Prayagraj",
    "प्रयागराज": "Prayagraj",
    "allahabad": "Prayagraj",
    "इलाहाबाद": "Prayagraj",
    "noida": "Noida",
    "नोएडा": "Noida",
    "greater noida": "Greater Noida",
    "ग्रेटर नोएडा": "Greater Noida",
    "ghaziabad": "Ghaziabad",
    "गाजियाबाद": "Ghaziabad",
    "gorakhpur": "Gorakhpur",
    "गोरखपुर": "Gorakhpur",
    "agra": "Agra",
    "आगरा": "Agra",
    "meerut": "Meerut",
    "मेरठ": "Meerut",
    "bareilly": "Bareilly",
    "बरेली": "Bareilly",
    "aligarh": "Aligarh",
    "अलीगढ़": "Aligarh",
    "moradabad": "Moradabad",
    "मुरादाबाद": "Moradabad",
    "saharanpur": "Saharanpur",
    "सहारनपुर": "Saharanpur",
    "ayodhya": "Ayodhya",
    "अयोध्या": "Ayodhya",
    "faizabad": "Ayodhya",
    "फैजाबाद": "Ayodhya",
    "jhansi": "Jhansi",
    "झांसी": "Jhansi",
    "muzaffarnagar": "Muzaffarnagar",
    "मुजफ्फरनगर": "Muzaffarnagar",
    "mathura": "Mathura",
    "मथुरा": "Mathura",
    "firozabad": "Firozabad",
    "फिरोजाबाद": "Firozabad",
    "budaun": "Budaun",
    "बदायूं": "Budaun",
    "rampur": "Rampur",
    "रामपुर": "Rampur",
    "shahjahanpur": "Shahjahanpur",
    "शाहजहांपुर": "Shahjahanpur",
    "hapur": "Hapur",
    "हापुड़": "Hapur",
    "mirzapur": "Mirzapur",
    "मिर्जापुर": "Mirzapur",
    "sambhal": "Sambhal",
    "संभल": "Sambhal",
    "hardoi": "Hardoi",
    "हरदोई": "Hardoi",
    "fatehpur": "Fatehpur",
    "फतेहपुर": "Fatehpur",
    "raebareli": "Raebareli",
    "रायबरेली": "Raebareli",
    "sitapur": "Sitapur",
    "सीतापुर": "Sitapur",
    "bahraich": "Bahraich",
    "बहराइच": "Bahraich",
    "unnao": "Unnao",
    "उन्नाव": "Unnao",
    "jaunpur": "Jaunpur",
    "जौनपुर": "Jaunpur",
    "lakhimpur": "Lakhimpur",
    "लखीमपुर": "Lakhimpur",
    "banda": "Banda",
    "बांदा": "Banda",
    "pilibhit": "Pilibhit",
    "पीलीभीत": "Pilibhit",
    "barabanki": "Barabanki",
    "बाराबंकी": "Barabanki",
    "gonda": "Gonda",
    "गोंडा": "Gonda",
    "mainpuri": "Mainpuri",
    "मैनपुरी": "Mainpuri",
    "lalitpur": "Lalitpur",
    "ललितपुर": "Lalitpur",
    "etah": "Etah",
    "एटा": "Etah",
    "deoria": "Deoria",
    "देवरिया": "Deoria",
    "ghazipur": "Ghazipur",
    "गाजीपुर": "Ghazipur",
    "sultanpur": "Sultanpur",
    "सुल्तानपुर": "Sultanpur",
    "azamgarh": "Azamgarh",
    "आजमगढ़": "Azamgarh",
    "bijnor": "Bijnor",
    "बिजनौर": "Bijnor",
    "basti": "Basti",
    "बस्ती": "Basti",
    "ballia": "Ballia",
    "बलिया": "Ballia",
    "shamli": "Shamli",
    "शामली": "Shamli",
    "kasganj": "Kasganj",
    "कासगंज": "Kasganj",
    "amethi": "Amethi",
    "अमेठी": "Amethi",
    "delhi": "Delhi",
    "दिल्ली": "Delhi",
    "patna": "Patna",
    "पटना": "Patna",
    "jaipur": "Jaipur",
    "जयपुर": "Jaipur",
    "bhopal": "Bhopal",
    "भोपाल": "Bhopal",
    "indore": "Indore",
    "इंदौर": "Indore",
    "gurugram": "Gurugram",
    "गुरुग्राम": "Gurugram",
    "gurgaon": "Gurugram",
    "गुड़गांव": "Gurugram",
    "faridabad": "Faridabad",
    "फरीदाबाद": "Faridabad",
    "mumbai": "Mumbai",
    "मुंबई": "Mumbai",
    "kolkata": "Kolkata",
    "कोलकाता": "Kolkata",
    "pune": "Pune",
    "पुणे": "Pune",
    "chandigarh": "Chandigarh",
    "चंडीगढ़": "Chandigarh",
}

# Known Districts (English + Devanagari)
KNOWN_DISTRICTS = {
    "sant kabir nagar": "Sant Kabir Nagar",
    "संत कबीर नगर": "Sant Kabir Nagar",
    "khalilabad": "Sant Kabir Nagar",
    "खलीलाबाद": "Sant Kabir Nagar",
    "gautam buddha nagar": "Gautam Buddha Nagar",
    "गौतम बुद्ध नगर": "Gautam Buddha Nagar",
    "kanpur nagar": "Kanpur Nagar",
    "कानपुर नगर": "Kanpur Nagar",
    "kanpur dehat": "Kanpur Dehat",
    "कानपुर देहात": "Kanpur Dehat",
    "lakhimpur kheri": "Lakhimpur Kheri",
    "लखीमपुर खीरी": "Lakhimpur Kheri",
    "basti": "Basti",
    "बस्ती": "Basti",
    "deoria": "Deoria",
    "देवरिया": "Deoria",
    "gorakhpur": "Gorakhpur",
    "गोरखपुर": "Gorakhpur",
    "varanasi": "Varanasi",
    "वाराणसी": "Varanasi",
    "lucknow": "Lucknow",
    "लखनऊ": "Lucknow",
    "prayagraj": "Prayagraj",
    "प्रयागराज": "Prayagraj",
    "agra": "Agra",
    "आगरा": "Agra",
    "meerut": "Meerut",
    "मेरठ": "Meerut",
    "aligarh": "Aligarh",
    "अलीगढ़": "Aligarh",
    "bareilly": "Bareilly",
    "बरेली": "Bareilly",
    "moradabad": "Moradabad",
    "मुरादाबाद": "Moradabad",
    "saharanpur": "Saharanpur",
    "सहारनपुर": "Saharanpur",
    "ghaziabad": "Ghaziabad",
    "गाजियाबाद": "Ghaziabad",
    "ayodhya": "Ayodhya",
    "अयोध्या": "Ayodhya",
    "faizabad": "Ayodhya",
    "फैजाबाद": "Ayodhya",
    "jhansi": "Jhansi",
    "झांसी": "Jhansi",
    "muzaffarnagar": "Muzaffarnagar",
    "मुजफ्फरनगर": "Muzaffarnagar",
    "azamgarh": "Azamgarh",
    "आजमगढ़": "Azamgarh",
    "ballia": "Ballia",
    "बलिया": "Ballia",
    "jaunpur": "Jaunpur",
    "जौनपुर": "Jaunpur",
    "mirzapur": "Mirzapur",
    "मिर्जापुर": "Mirzapur",
    "sitapur": "Sitapur",
    "सीतापुर": "Sitapur",
    "hardoi": "Hardoi",
    "हरदोई": "Hardoi",
    "unnao": "Unnao",
    "उन्नाव": "Unnao",
    "raebareli": "Raebareli",
    "रायबरेली": "Raebareli",
    "amethi": "Amethi",
    "अमेठी": "Amethi",
    "sultanpur": "Sultanpur",
    "सुल्तानपुर": "Sultanpur",
    "bahraich": "Bahraich",
    "बहराइच": "Bahraich",
}

# Location patterns in caller speech (Hindi Devanagari, English, and Hinglish)
LOCATION_PATTERNS = [
    # Devanagari: "मैं गोमती नगर, लखनऊ से बोल रही हूँ / बोल रहा हूँ / हूँ"
    re.compile(
        r"(?:मैं|मै|हम|हमलोग)\s+(?:अभी\s+)?(.+?)\s+से\s+(?:बोल\s+रहा\s+हूँ|बोल\s+रही\s+हूँ|बोल\s+रहे\s+हैं|कॉल\s+कर\s+रही\s+हूँ|हूँ|हूं|हैं)",
        re.IGNORECASE,
    ),
    # Devanagari: "मेरा घर / स्थान / पता गोमती नगर, लखनऊ में है"
    re.compile(
        r"(?:मेरा|हमारा)\s+(?:घर|स्थान|पता|लोकेशन|शहर)\s+(?:अभी\s+)?(.+?)\s+(?:में|पर|पे)\s+है",
        re.IGNORECASE,
    ),
    # Devanagari: "मैं गोमती नगर, लखनऊ में रहती हूँ / रहता हूँ / हूँ"
    re.compile(
        r"(?:मैं|मै|हम)\s+(?:अभी\s+)?(.+?)\s+(?:में|पर|पे)\s+(?:रहती\s+हूँ|रहता\s+हूँ|रहते\s+हैं|हूँ|हूं|हैं)",
        re.IGNORECASE,
    ),
    # "Main Gomti Nagar, Lucknow, Uttar Pradesh se hoon / se bol rahi hoon / se bol raha hoon"
    re.compile(
        r"(?:main|mai|hum|humlog|me)\s+(?:abhi\s+)?(.+?)\s+se\s+(?:hoon|hu|hun|hain|hai|bol\s+rahi?\s+hoon|bol\s+rahe?\s+hain|call\s+kar\s+rahi?\s+hoon|aayi?\s+hoon)",
        re.IGNORECASE,
    ),
    # "I am / I'm calling from Gomti Nagar, Lucknow"
    re.compile(
        r"(?:i\s*am|i'?m|we\s*are|we'?re)\s+(?:calling\s+)?from\s+(.+?)(?:\.|\band\b|\bplease\b|\bhelp\b|\bthere\b|$)",
        re.IGNORECASE,
    ),
    # "I live in Gomti Nagar, Lucknow" / "I stay in ..."
    re.compile(
        r"(?:i|we)\s+(?:live|stay|am\s+located)\s+in\s+(.+?)(?:\.|\band\b|\bplease\b|\bhelp\b|\bthere\b|$)",
        re.IGNORECASE,
    ),
    # "Mera ghar Gomti Nagar, Lucknow mein hai"
    re.compile(
        r"(?:mera|hamara)\s+ghar\s+(?:abhi\s+)?(.+?)\s+me(?:in)?\s+hai",
        re.IGNORECASE,
    ),
    # "Main Gomti Nagar mein rehti hoon / rehta hoon"
    re.compile(
        r"(?:main|mai|hum)\s+(.+?)\s+me(?:in)?\s+(?:rehti|rehta|rehte)\s+(?:hoon|hu|hain)",
        re.IGNORECASE,
    ),
    # "Abhi main Gomti Nagar, Lucknow mein hoon"
    re.compile(
        r"(?:abhi\s+)?(?:main|mai|hum)\s+(?:abhi\s+)?(.+?)\s+(?:me(?:in)?|par|pe)\s+hoon",
        re.IGNORECASE,
    ),
    # "Calling from ..."
    re.compile(
        r"\bcalling\s+from\s+(.+?)(?:\.|\band\b|\bplease\b|\bhelp\b|\bthere\b|$)",
        re.IGNORECASE,
    ),
    # "Gomti Nagar, Lucknow se call kar rahi hoon"
    re.compile(
        r"^(.+?)\s+se\s+(?:call\s+kar\s+rahi?\s+hoon|bol\s+rahi?\s+hoon|bol\s+rahe?\s+hain)",
        re.IGNORECASE,
    ),
    # "My address is ... / Location is ... / Mera pata ..."
    re.compile(
        r"(?:my\s+(?:address|location|area)\s+is|address\s+hai|location\s+hai|(?:mera|hamara)\s+pata(?:\s+hai)?|(?:mera|hamara)\s+shehar(?:\s+hai)?)\s+(.+?)(?:\.|\band\b|\bplease\b|\bhelp\b|\bhai\b|$)",
        re.IGNORECASE,
    ),
    # "Yahan ... se bol raha hoon"
    re.compile(
        r"(?:yahan|idhar|यहाँ|इधर)\s+(.+?)\s+से\s+बोल|(?:yahan|idhar)\s+(.+?)\s+se\s+bol",
        re.IGNORECASE,
    ),
]


def clean_chunk(text: str) -> str:
    """Clean punctuation and extraneous conversational filler words."""
    t = re.sub(r"[,\.!\?]+$", "", text.strip())
    # Remove leading conversational fillers
    t = re.sub(
        r"^(?:namaste|namaskar|hello|hi|sir|madam|madamji|sirji|dekhiye|bhaiya|actually|listen|please|aur|ki)\s+",
        "",
        t,
        flags=re.IGNORECASE,
    )
    return t.strip()


def parse_location_components(raw_loc: str) -> Dict[str, str]:
    """
    Parse a candidate location string into street, city, district, state.
    e.g. "Gomti Nagar, Lucknow, Uttar Pradesh"
    """
    street = ""
    city = ""
    district = ""
    state = ""

    cleaned = clean_chunk(raw_loc)
    if not cleaned:
        return {}

    # Split by comma or " near " or " in "
    parts = [p.strip() for p in re.split(r"[,/]+|\s+near\s+|\s+in\s+", cleaned) if p.strip()]

    # 1. Look for explicit "district" / "jila" / "zila"
    remaining_parts = []
    for part in parts:
        dist_match = re.search(r"(?:district|zila|jila)\s+([A-Za-z\s]+)", part, re.IGNORECASE)
        if dist_match:
            cand = dist_match.group(1).strip()
            district = KNOWN_DISTRICTS.get(cand.lower(), cand.title())
            continue
        dist_match2 = re.search(r"([A-Za-z\s]+)\s+(?:district|zila|jila)", part, re.IGNORECASE)
        if dist_match2:
            cand = dist_match2.group(1).strip()
            district = KNOWN_DISTRICTS.get(cand.lower(), cand.title())
            continue
        remaining_parts.append(part)

    # 2. Check for State in remaining parts
    non_state_parts = []
    for part in remaining_parts:
        part_clean = part.lower().strip()
        if part_clean in INDIAN_STATES:
            state = INDIAN_STATES[part_clean]
        else:
            # Check if part ends with state e.g. "Lucknow UP"
            found_sub = False
            for s_key, s_val in INDIAN_STATES.items():
                if part_clean.endswith(" " + s_key):
                    state = s_val
                    trimmed = part[: -(len(s_key) + 1)].strip()
                    if trimmed:
                        non_state_parts.append(trimmed)
                    found_sub = True
                    break
            if not found_sub:
                non_state_parts.append(part)

    # 3. Check for City and Area/Street among remaining parts
    for part in non_state_parts:
        p_clean = part.lower().strip()
        # Direct city match
        if p_clean in KNOWN_CITIES:
            city = KNOWN_CITIES[p_clean]
        # Check if it's Sant Kabir Nagar or known district mentioned alone
        elif p_clean in KNOWN_DISTRICTS and not district:
            district = KNOWN_DISTRICTS[p_clean]
        else:
            # Check if part contains city at the end e.g. "Gomti Nagar Lucknow"
            found_city_sub = False
            for c_key, c_val in KNOWN_CITIES.items():
                # Word boundary check
                pattern = rf"\b{re.escape(c_key)}\b"
                if re.search(pattern, p_clean):
                    city = c_val
                    # The prefix is the street/area
                    prefix = re.sub(pattern, "", part, flags=re.IGNORECASE).strip()
                    prefix = re.sub(r"^[,/]+|[,/]+$", "", prefix).strip()
                    if prefix and not street:
                        street = prefix.title()
                    found_city_sub = True
                    break

            if not found_city_sub:
                # If city is already identified, or this is an area descriptor
                if not street:
                    street = part.strip().title()

    # If only 1 part was given, and it didn't match known cities, check if it's a known city
    if len(parts) == 1 and not city and not street and not district:
        p_clean = parts[0].lower().strip()
        if p_clean in KNOWN_CITIES:
            city = KNOWN_CITIES[p_clean]
        elif p_clean in KNOWN_DISTRICTS:
            district = KNOWN_DISTRICTS[p_clean]
        else:
            city = parts[0].strip().title()

    # Rule: "Do not guess a location. If only city is mentioned, leave street/district empty until actually known."
    # If street was accidentally set to the city itself, clear it
    if street and city and street.lower() == city.lower():
        street = ""

    result = {}
    if street:
        result["street"] = street
    if city:
        result["city"] = city
    if district:
        result["district"] = district
    if state:
        result["state"] = state

    return result


def extract_location(text: str, existing_location: Optional[Dict[str, str]] = None) -> Optional[Dict[str, str]]:
    """
    Extract location from a caller utterance and merge with existing location.
    Preserves last confirmed location if no new reliable location is found.
    Only self-identification location phrases from caller are parsed.
    """
    if not text or not text.strip():
        return existing_location

    text_clean = text.strip()

    # Test against defined caller conversational location patterns
    for pat in LOCATION_PATTERNS:
        match = pat.search(text_clean)
        if match:
            raw_loc = match.group(1).strip()
            parsed = parse_location_components(raw_loc)
            if parsed:
                base = dict(existing_location or {})
                # If a new city is explicitly given and differs from existing city, reset street unless newly provided
                new_city = parsed.get("city")
                old_city = base.get("city")
                if new_city and old_city and new_city.lower() != old_city.lower():
                    if "street" not in parsed:
                        base.pop("street", None)
                    if "district" not in parsed:
                        base.pop("district", None)

                for k, v in parsed.items():
                    if v:
                        base[k] = v
                base["raw_text"] = raw_loc
                return base

    # Direct contextual entity scan fallback
    # e.g. "Gomti Nagar Lucknow", "Noida Sector 62", "main Kanpur mein hoon", "लखनऊ में मेरे साथ"
    text_lower = text_clean.lower()
    for c_key, c_val in KNOWN_CITIES.items():
        if re.search(rf"\b{re.escape(c_key)}\b", text_lower, flags=re.IGNORECASE) or (len(c_key) > 2 and c_key in text_clean):
            # Verify it's accompanied by conversational or location context
            if any(marker in text_lower or marker in text_clean for marker in [
                "mein", "me", "se", "pe", "near", "in", "at", "from", "rehti", "rehta", "rehte",
                "में", "से", "पर", "रहती", "रहता", "शहर", "स्थान", "location", "address", "call", "hoon", "हूँ"
            ]):
                base = dict(existing_location or {})
                base["city"] = c_val
                if "raw_text" not in base:
                    base["raw_text"] = c_val
                return base

    # Preserve last confirmed location if no new reliable location in this chunk
    return existing_location
