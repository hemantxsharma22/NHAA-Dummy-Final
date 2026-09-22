"""
SAATHI-AI 21-Category Multilingual Synthetic Dataset Generator (5,000+ Examples)
================================================================================
Generates >= 5,000 high-diversity, high-coverage labeled training examples across:
  - Languages: Hindi (Devanagari), Hinglish (Romanized / Transliterated), English
  - 21 Categories:
      1.  THREAT_INTIMIDATION
      2.  FEAR_DISTRESS_PANIC
      3.  IMMEDIATE_PHYSICAL_DANGER
      4.  SELF_HARM_CONCERN
      5.  PHYSICAL_VIOLENCE_INJURY
      6.  SEXUAL_VIOLENCE_HARASSMENT
      7.  DOMESTIC_FAMILY_VIOLENCE
      8.  STALKING_FOLLOWING
      9.  ISOLATION_NO_SUPPORT
      10. COERCION_BLACKMAIL
      11. SOCIAL_COMMUNITY_PRESSURE
      12. DISCRIMINATION_CASTE_VULNERABILITY
      13. CHILD_ELDERLY_DISABILITY_VULNERABILITY
      14. NO_SAFE_PLACE_HOMELESSNESS
      15. MEDICAL_EMERGENCY
      16. CURRENT_SAFETY_REASSURANCE (Calming signals)
      17. REQUEST_POLICE_EMERGENCY_HELP
      18. REQUEST_COUNSELLING_LEGAL_MEDICAL
      19. UNCERTAINTY_UNCLEAR_INFO
      20. CONTRADICTORY_CHANGING_SITUATION
      21. NEUTRAL_NO_INDICATOR (Operator speech, negation contexts, movie/meta false-positives)

Includes variations:
  - Short phrases & single utterances ("someone threatened me", "dhamki di hai")
  - Conversational & narrative sentences
  - Incomplete / hesitant speech with ellipses ("...")
  - Common phonetics, typos & transliteration variations ("dhar", "darr", "dhamkee")
  - Negation context examples ("he did not threaten me") -> NEUTRAL_NO_INDICATOR
  - Reassurance transitions ("he threatened me but I am safe now") -> CURRENT_SAFETY_REASSURANCE
  - Operator speech & administrative dialogues -> NEUTRAL_NO_INDICATOR
"""

import csv
import json
import random
from pathlib import Path
from typing import Dict, List, Tuple

RANDOM_SEED = 42
random.seed(RANDOM_SEED)

OUTPUT_DIR = Path(__file__).parent
JSON_PATH = OUTPUT_DIR / "multilingual_indicator_dataset.json"
CSV_PATH = OUTPUT_DIR / "multilingual_indicator_dataset.csv"

# Conversational fillers & prefixes
HINDI_PREFIXES = [
    "सुनिए...", "अरे...", "प्लीज...", "सर...", "मैडम...", "मेरी बात सुनिए...",
    "हेल्प कीजिए...", "मैं बहुत परेशान हूं...", "कृपया ध्यान दीजिए...", "नमस्ते...", "", "", "", ""
]
HINGLISH_PREFIXES = [
    "suniye...", "arre...", "please...", "sir...", "madam...", "listen...",
    "help kijiye...", "mai bohot pareshan hu...", "urgent hai...", "hello...", "", "", "", ""
]
ENGLISH_PREFIXES = [
    "Hello...", "Please listen...", "Officer...", "Help me...", "Ma'am...", "Sir...",
    "I need urgent help...", "Please hear me...", "Excuse me...", "", "", "", ""
]

HINDI_SUFFIXES = [
    " तुरंत मदद चाहिए।", " क्या आप सुन रहे हैं?", " प्लीज कुछ कीजिए।", " मैं सच कह रहा हूं।",
    " जल्दी पुलिस भेजिए।", " मुझे समझ नहीं आ रहा क्या करूं।", "", "", ""
]
HINGLISH_SUFFIXES = [
    " please madad karo.", " kya aap sun rahe ho?", " jaldi kuch kijiye.", " mai sach bol raha hu.",
    " send help immediately.", " mujhe samajh nahi aa raha kya karu.", "", "", ""
]
ENGLISH_SUFFIXES = [
    " please help immediately.", " are you listening?", " please do something quickly.",
    " I am telling the truth.", " please send police now.", " I don't know what to do.", "", "", ""
]

# Core Seed Banks per Category
SEEDS: Dict[str, Dict[str, List[str]]] = {
    "THREAT_INTIMIDATION": {
        "hi": [
            "उसने मुझे धमकी दी है",
            "उसने कहा कि जान से मार देगा",
            "धमकी दे रहा है कि पूरे परिवार को खत्म कर देगा",
            "उसने फोन करके बोला कि तुझे देख लूंगा",
            "धमकी भरे मैसेज भेज रहा है",
            "कहता है अगर शिकायत की तो ज़िंदा नहीं छोड़ेगा",
            "उसने मुझे हथियार दिखाकर धमकाया",
            "वो कह रहा है कि तुझे बर्बाद कर दूंगा",
            "मुझे जान से मारने की धमकियां मिल रही हैं",
            "धमकी दी है कि घर में आग लगा देगा",
            "सबक सिखाने की धमकी दे रहा है",
            "वार्निंग दी है कि बहुत पछताओगे",
            "उसने कत्ल करने की धमकी दी है",
            "वो कह रहा है कि बाहर निकलते ही हमला करेगा",
            "धमका कर पैसे मांग रहा है",
            "उसने कहा कि तुझे रास्ते से हटा दूंगा",
            "धमकी मिली है कि चुप रहो वरना अंजाम बुरा होगा",
            "उसने बंदूक तान कर जान से मारने की बात कही",
            "खून करने की खुली धमकी दे रहा है",
            "धमकी दे रहा है कि तेरी जिंदगी नरक बना दूंगा",
        ],
        "hinglish": [
            "someone threatened me",
            "mujhe dhamki di hai",
            "usne mujhe jaan se maarne ki dhamki di",
            "dhamki mil rahi hai ki maar dalega",
            "phone pe continuously threatening calls aa rahe hain",
            "bol raha hai ki dekh lunga bahar nikal",
            "he threatened to kill me and my family",
            "usne bola agar police bulayi toh zinda nahi chodega",
            "warning de raha hai ki sabak sikhayega",
            "dhamki de raha hai ghar jala dunga",
            "he threatened me with a sharp weapon",
            "khatam kar dene ki dhamki di usne",
            "usne bola ki court gaya toh jaan se haath dho baithega",
            "roz threatening messages bhej raha hai",
            "dhamka raha hai ki chup baitho",
            "usne dhamki di ki kidnap kar lega",
            "kehta hai tera murder kar dunga",
            "dhamki deke gaya hai abhi thodi der pehle",
            "bola ki consequences bahut bure honge",
            "openly dhamki de raha hai maar peet karne ki",
        ],
        "en": [
            "someone threatened me",
            "he threatened to kill me",
            "I am receiving direct death threats",
            "he threatened my family with violence",
            "he said he will shoot me if I go out",
            "he explicitly threatened to harm my children",
            "I received threatening calls all night",
            "he threatened to destroy my home and life",
            "he warned that no one can save me from him",
            "he sent threatening text messages demanding money",
            "he threatened retaliation if I report to police",
            "he threatened to murder me in broad daylight",
            "they are intimidating and threatening my household",
            "he said he will finish me off",
            "a man threatened me with a knife",
            "he made severe verbal threats against my safety",
            "he threatened to burn everything down",
            "I was threatened by an armed individual",
            "he threatened severe physical consequences",
            "she threatened that she will ruin my life",
        ],
    },
    "FEAR_DISTRESS_PANIC": {
        "hi": [
            "मुझे बहुत डर लग रहा है",
            "मैं बहुत डरी हुई हूं",
            "मैं बहुत डरा हुआ हूं",
            "हाथ पैर कांप रहे हैं घबराहट से",
            "बहुत घबराहट हो रही है सांस नहीं ली जा रही",
            "दहशत का माहौल है यहां",
            "खौफ में जी रहे हैं हम",
            "मुझे बहुत पैनिक अटैक आ रहा है",
            "डर के मारे चीख निकल रही है",
            "बच्चे बहुत सहमे हुए हैं डर से",
            "रो-रो कर बुरा हाल है बहुत डर है",
            "डर लग रहा है कोई मुझे बचाओ",
            "घबराहट के कारण कुछ समझ नहीं आ रहा",
            "बहुत भयभीत हूं अपने घर में",
            "डर के मारे कमरे में छिपी हूं",
            "अत्यधिक बेचैनी और दहशत महसूस हो रही है",
        ],
        "hinglish": [
            "mujhe bahut darr lag raha hai",
            "bohot dar lag raha hai please help",
            "mai bohot zyada scared hu",
            "darr ke maare haath kaanp rahe hain",
            "bahut ghabrahat ho rahi hai panic ho raha hai",
            "i am feeling extreme anxiety and fear",
            "dahshat ho rahi hai yahan par",
            "khauf lag raha hai akele rehne me",
            "bachhe dar ke maare ro rahe hain",
            "bohot pareshan hu dar lag raha hai",
            "shaking with fear right now",
            "ghabrahat se saans phool rahi hai",
            "darr lag raha hai ki kuch galat na ho jaye",
            "feeling terrified and helpless",
            "bohot zyada panic situation hai",
        ],
        "en": [
            "I am so scared right now",
            "I am terrified and panicking",
            "my hands are trembling with fear",
            "I am extremely frightened for my life",
            "I feel so overwhelmed and anxious",
            "I cannot calm down because of fear",
            "I am crying and shaking in terror",
            "the situation is terrifying and we are in panic",
            "I am living in constant fear",
            "I feel completely helpless and scared",
            "my heart is pounding with extreme anxiety",
            "I am dreading what might happen next",
            "I feel unsafe and petrified in my room",
            "the kids are terrified and screaming",
            "I am in a state of severe panic",
        ],
    },
    "IMMEDIATE_PHYSICAL_DANGER": {
        "hi": [
            "कोई मेरे घर के बाहर खड़ा है",
            "दरवाजा तोड़ने की कोशिश कर रहा है कोई",
            "वो हथियार लेकर बाहर खड़ा है",
            "खतरे में हूं तुरंत पुलिस भेजिए",
            "वो जबरदस्ती अंदर घुसने की कोशिश कर रहा है",
            "मेरी जान खतरे में है अभी",
            "उसके हाथ में चाकू है बाहर",
            "घर के दरवाजे पर लातें मार रहा है",
            "हमला करने आ रहा है अभी",
            "बचाओ वो अंदर आ गया है",
            "खिड़की से घुसने की कोशिश कर रहा है",
            "जान बचाने के लिए कमरे में बंद हूं",
            "बाहर लोग हथियारों के साथ खड़े हैं",
            "तुरंत सुरक्षा भेजो वो हमला कर देगा",
            "दरवाजे के ठीक बाहर खड़ा है वो",
        ],
        "hinglish": [
            "I am scared because he is outside my house",
            "woh ghar ke bahar khada hai weapon leke",
            "darwaza todne ki koshish kar raha hai",
            "khatre me hu please send police right now",
            "he is standing right outside my door with a knife",
            "andar aane ki koshish kar raha hai jaldi aao",
            "meri jaan khatre mein hai abhi ke abhi",
            "he is banging on my window violently",
            "bahar khada hai gaaliyan de raha hai",
            "situation bahut dangerous hai bachao",
            "immediate danger me hu police dispatch karo",
            "he has broken the latch of the gate",
            "mob bahar khadi hai attack karne ke liye",
            "locked in the room he is breaking the door",
            "bandook leke ghoom raha hai compound mein",
        ],
        "en": [
            "I am scared because he is outside my house",
            "someone is trying to break into my house right now",
            "he is standing outside my door holding a weapon",
            "I am in immediate physical danger please help",
            "he is violently kicking my front door",
            "he is trying to climb through the window",
            "there is an armed man outside my apartment",
            "send police immediately my life is at risk",
            "he is attempting to force his way inside",
            "I am trapped in the bathroom and he is inside",
            "he is attacking the security gate right now",
            "danger is imminent please dispatch emergency unit",
            "someone is banging on my door threatening to break in",
            "an aggressive person is standing at my doorstep",
            "I am hiding under the bed he is inside the house",
        ],
    },
    "SELF_HARM_CONCERN": {
        "hi": [
            "मैं अब और जीना नहीं चाहती",
            "मैं अपने आप को नुकसान पहुंचा लूंगी",
            "जीने की कोई वजह नहीं बची है",
            "सब कुछ खत्म कर लेना चाहता हूं",
            "आत्महत्या करने का ख्याल आ रहा है",
            "मैं बहुत टूट चुकी हूं मर जाना चाहती हूं",
            "फांसी लगाने की सोच रही हूं",
            "अब इस दर्द को और नहीं सह सकती",
            "अपनी जान दे दूंगी मैं",
            "मुझे जीने की कोई उम्मीद नहीं दिख रही",
        ],
        "hinglish": [
            "mai ab jeena nahi chahta",
            "want to end my life bohot pareshan hu",
            "apne aap ko hurt karne ka man kar raha hai",
            "koi reason nahi bacha live karne ka",
            "feeling like committing suicide please help",
            "marr jana chahti hu sabse tang aake",
            "thinking of harming myself severely",
            "cannot bear this emotional pain anymore want to die",
            "apni jaan le lungi agar aisa hi chalta raha",
            "feeling completely hopeless wanting to quit life",
        ],
        "en": [
            "I don't want to live anymore",
            "I feel like ending my life right now",
            "I am having thoughts of self harm",
            "I have no reason to stay alive",
            "I feel like committing suicide",
            "I want to hurt myself to stop this pain",
            "there is no hope left for me I want to die",
            "I am on the verge of killing myself",
            "I cannot continue living like this",
            "I feel completely broken and suicidal",
        ],
    },
    "PHYSICAL_VIOLENCE_INJURY": {
        "hi": [
            "उसने मुझे बुरी तरह पीटा है",
            "मेरे सिर से खून निकल रहा है",
            "उसने मुझे डंडे से मारा और घायल कर दिया",
            "शरीर पर बहुत चोटें आई हैं",
            "उसने मेरा गला दबाने की कोशिश की",
            "मुक्के और लातों से मारपीट की गई",
            "चाकू से वार करके घायल कर दिया",
            "खून बह रहा है हाथ से बहुत तेज",
            "हमला करके मुझे नीचे गिरा दिया",
            "शारीरिक रूप से प्रताड़ित किया गया है",
        ],
        "hinglish": [
            "usne mujhe bohot mara hai bleeding ho rahi hai",
            "sir pe chot lagi hai khoon nikal raha hai",
            "physically attacked me and beat me with stick",
            "gala dabane ki koshish ki usne",
            "body pe bohot injuries hain marpeet hui hai",
            "punched and kicked me repeatedly",
            "chaku se hamla kiya haath cut gaya",
            "he hit me violently on my face",
            "marpeet karke fractured my arm",
            "khoon beh raha hai ambulance chahiye",
        ],
        "en": [
            "he physically assaulted me and I am injured",
            "I am bleeding heavily from my head",
            "he beat me up with a metal rod",
            "I was punched and kicked repeatedly",
            "he tried to strangle my neck",
            "I have multiple bruises and cuts on my body",
            "he attacked me with a blade and cut my arm",
            "he shoved me down the stairs violently",
            "I am seriously injured and bleeding",
            "he slapped and physically battered me",
        ],
    },
    "SEXUAL_VIOLENCE_HARASSMENT": {
        "hi": [
            "मेरे साथ छेड़छाड़ की गई है",
            "उसने मुझे गलत तरीके से छुआ",
            "यौन उत्पीड़न की शिकायत दर्ज करानी है",
            "जबरदस्ती करने की कोशिश की उसने",
            "गंदी हरकतें और अश्लील इशारे कर रहा है",
            "रास्ते में रोक कर गलत तरीके से हाथ पकड़ा",
            "अश्लील बातें और फोटो भेज रहा है",
            "मेरे साथ शारीरिक जबरदस्ती की गई",
        ],
        "hinglish": [
            "usne galat tarike se touch kiya chedchad ki",
            "sexual harassment ho raha hai office mein",
            "jabarjasti karne ki koshish ki usne",
            "obscene photos and messages bhej raha hai",
            "inappropriate physical contact kiya forcefully",
            "molestation attempt hua hai raste mein",
            "gandi batein karke harass kar raha hai",
            "forced himself on me without consent",
        ],
        "en": [
            "I was sexually harassed on my way home",
            "he touched me inappropriately against my will",
            "he attempted to sexually assault me",
            "I am facing continuous sexual harassment at workplace",
            "he grabbed me forcefully and made sexual remarks",
            "he sent non-consensual explicit photos",
            "he tried to force himself onto me",
            "he made vulgar sexual gestures and touched me",
        ],
    },
    "DOMESTIC_FAMILY_VIOLENCE": {
        "hi": [
            "पति रोज शराब पीकर मारपीट करता है",
            "ससुराल वाले दहेज के लिए प्रताड़ित कर रहे हैं",
            "सास और ससुर घर में बंद करके मारते हैं",
            "घरेलू हिंसा का शिकार हो रही हूं रोज",
            "पति ने कमरे में बंद करके पीटा",
            "दहेज न लाने पर घर से निकालने की धमकी दी",
            "पारिवारिक प्रताड़ना असहनीय हो गई है",
        ],
        "hinglish": [
            "husband roz daaru peeke marpeet karta hai",
            "in-laws dowry ke liye mentally aur physically abuse kar rahe hain",
            "sasural me roz torture kiya ja raha hai",
            "domestic violence ho rahi hai mere sath ghar par",
            "husband locked me in the room without food",
            "sasural wale roz taane dete hain aur maarte hain",
            "facing continuous spousal abuse and physical cruelty",
        ],
        "en": [
            "my husband beats me violently every day",
            "my in-laws are torturing me over dowry demands",
            "I am a victim of severe domestic violence at home",
            "my spouse locked me inside without water and hit me",
            "my family members are physically abusing me",
            "my in-laws threatened to burn me alive for dowry",
            "I am trapped in an abusive marriage with constant violence",
        ],
    },
    "STALKING_FOLLOWING": {
        "hi": [
            "कोई कई दिनों से मेरा पीछा कर रहा है",
            "रोज मेरे कॉलेज के बाहर खड़ा रहता है",
            "अज्ञात व्यक्ति मेरा पीछा करता है घर तक",
            "स्टॉकिंग कर रहा है लगातार नजर रख रहा है",
            "हर जगह मेरा पीछा करके वीडियो बनाता है",
            "मेट्रो स्टेशन से घर तक फॉलो कर रहा है",
        ],
        "hinglish": [
            "ek ladka roz mera peecha karta hai office se ghar",
            "stalking me continuously for past two weeks",
            "roz ghar ke bahar khada rehta hai bike leke",
            "he follows me everywhere I go",
            "tracking my daily movements and clicking photos",
            "peecha karke darwaaze tak aa gaya",
        ],
        "en": [
            "someone is stalking and following me every day",
            "a strange man follows me from the bus stop to my house",
            "he keeps watching my house and tracking my schedule",
            "I am being stalked by an unknown person continuously",
            "he followed my vehicle for over five kilometers",
            "he waits outside my workplace every evening watching me",
        ],
    },
    "ISOLATION_NO_SUPPORT": {
        "hi": [
            "मैं यहां बिल्कुल अकेली हूं कोई मदद करने वाला नहीं",
            "मेरा इस शहर में कोई नहीं है सबने छोड़ दिया",
            "कोई सहारा नहीं है बिल्कुल बेसहारा हूं",
            "अकेले कमरे में बंद हूं कोई रिश्तेदार नहीं है",
            "कोई साथ देने वाला नहीं है चारों तरफ से अकेली हूं",
        ],
        "hinglish": [
            "mai yahan bilkul akela hu koi relative nahi hai",
            "have no family or friends to support me here",
            "koi madad karne wala nahi hai bilkul akeli hu",
            "completely isolated and stranded without contacts",
            "koi sath nahi de raha sabne contact tod diya",
        ],
        "en": [
            "I am completely alone and have nobody to help me",
            "I have no family or friends in this city to turn to",
            "I am isolated in this house with zero support",
            "I have nowhere to go and nobody to call for assistance",
            "I am stranded and all alone in this situation",
        ],
    },
    "COERCION_BLACKMAIL": {
        "hi": [
            "वो मुझे ब्लैकमेल कर रहा है पैसों के लिए",
            "मेरी निजी तस्वीरें वायरल करने की धमकी दे रहा है",
            "मजबूर कर रहा है गैरकानूनी काम करने के लिए",
            "ब्लैकमेल करके लगातार दबाव बना रहा है",
            "कहा अगर पैसे नहीं दिए तो बदनाम कर दूंगा",
        ],
        "hinglish": [
            "usne private photos leak karne ki blackmailing shuru kar di",
            "forcing me to give money through blackmail",
            "blackmail kar raha hai ki social media par daal dega",
            "coercing me into doing things against my consent",
            "blakmail karke mental torture de raha hai",
        ],
        "en": [
            "he is blackmailing me with private photographs",
            "I am being extorted and coerced under threat of defamation",
            "he is forcing me to pay large sums of money",
            "he threatened to leak sensitive personal videos online",
            "I am being blackmailed and pressurized constantly",
        ],
    },
    "SOCIAL_COMMUNITY_PRESSURE": {
        "hi": [
            "पूरे गांव और पंचायत ने हमारा बहिष्कार कर दिया है",
            "मोहल्ले के लोग मिलकर धमकी दे रहे हैं",
            "समाज में बदनाम करने की साजिश हो रही है",
            "सामूहिक रूप से हम पर दबाव बनाया जा रहा है",
        ],
        "hinglish": [
            "panchayat ne social boycott announce kar diya hamara",
            "mohalla wale milkar harrass kar rahe hain",
            "community pressure banaya ja raha hai case wapas lene",
            "entire village mob is pressurizing our family",
        ],
        "en": [
            "the local panchayat has ordered a complete social boycott",
            "community elders are pressurizing us to withdraw the complaint",
            "a group of village leaders is threatening our household",
            "we are facing intense community ostracization and pressure",
        ],
    },
    "DISCRIMINATION_CASTE_VULNERABILITY": {
        "hi": [
            "जातिसूचक गालियां देकर अपमानित किया गया",
            "दलित होने के कारण कुएं से पानी नहीं भरने दिया",
            "निचली जाति का बोलकर मंदिर में जाने से रोका",
            "जातिगत भेदभाव और छुआछूत का शिकार बनाया गया",
            "मेरे साथ भेदभाव कर रहे हैं और नीची जाति बोल रहे हैं",
            "जाति के नाम पर मुझे प्रताड़ित किया जा रहा है",
            "छुआछूत का व्यवहार कर रहे हैं हमारे साथ",
            "भेदभाव कर रहे हैं और अपमानजनक शब्द बोल रहे हैं",
        ],
        "hinglish": [
            "and describe kar rahe the mere saath discriminate kar rahe the",
            "mere saath discriminate kiya ja raha hai",
            "mere sath discrimination ho raha hai office me",
            "unhone mere saath bhedbhav kiya jaati ke aadhar par",
            "casteist slurs use karke publically insult kiya",
            "SC/ST community se hone ke karan dukan se bhaga diya",
            "jaati soochak shabdon se gali di aur bhedbhav kiya",
            "caste discrimination facing in village school and temple",
            "wo log mere sath bhed bhav aur chhuachhoot kar rahe hain",
            "neech jaati bolkar insult aur discriminate kar rahe",
            "describe kar rahe the mere saath discrimi",
            "humare sath bhedbhav ho raha hai",
        ],
        "en": [
            "they are describing and discriminating against me unfairly",
            "facing continuous discrimination and harassment based on my caste",
            "they used derogatory casteist slurs against me publicly",
            "we were denied access to the public well due to our caste",
            "he assaulted me while abusing my marginalized identity",
            "facing severe caste-based discrimination and untouchability",
            "I am being discriminated against at work and in public",
            "they subject us to discrimination and untouchability practices",
        ],
    },
    "CHILD_ELDERLY_DISABILITY_VULNERABILITY": {
        "hi": [
            "घर में छोटा बच्चा और गर्भवती महिला है",
            "बुजुर्ग माता-पिता हैं जो चलने में असमर्थ हैं",
            "दिव्यांग व्यक्ति पर हमला किया गया है",
            "नाबालिग बच्ची की सुरक्षा को लेकर बहुत चिंता है",
        ],
        "hinglish": [
            "ghar me elderly parents hain jo bedridden hain",
            "pregnant lady hai ghar pe aur small kids hain",
            "disabled person par assault attempt hua hai",
            "minor child ki safety at high risk right now",
        ],
        "en": [
            "there is an infant and a pregnant woman in the house",
            "my elderly parents are bedridden and cannot escape",
            "the victim is a differently-abled person unable to run",
            "a minor child is trapped inside facing grave risk",
        ],
    },
    "NO_SAFE_PLACE_HOMELESSNESS": {
        "hi": [
            "घर से निकाल दिया गया है सड़क पर बैठी हूं",
            "रहने का कोई ठिकाना नहीं है बेघर हो गई हूं",
            "रात में सड़क पर खड़ी हूं कोई सुरक्षित जगह नहीं है",
            "किराए के कमरे से जबरन सामान फेंक कर निकाल दिया",
        ],
        "hinglish": [
            "ghar se nikal diya hai road par khadi hu",
            "no safe place to sleep tonight stranded on footpath",
            "homeless ho gaye hain koi shelter nahi hai",
            "landlord threw all luggage out on the street",
        ],
        "en": [
            "I have been thrown out of my house onto the street",
            "I have no safe shelter or roof over my head tonight",
            "I am stranded on the roadside with nowhere to sleep",
            "we were forcibly evicted and have no place to go",
        ],
    },
    "MEDICAL_EMERGENCY": {
        "hi": [
            "सांस लेने में बहुत तकलीफ हो रही है बेहोश हो रहे हैं",
            "छाती में तेज दर्द है और बहुत ज्यादा खून बह रहा है",
            "तुरंत एम्बुलेंस भेजिए मरीज की हालत गंभीर है",
            "सिर पर गहरी चोट है और उल्टियां हो रही हैं",
        ],
        "hinglish": [
            "heavy bleeding ho rahi hai ambulance chahiye turant",
            "chest pain aur breathing difficulty ho rahi hai",
            "patient is unconscious please dispatch medical team",
            "severe blood loss and head injury need emergency care",
        ],
        "en": [
            "I need an ambulance immediately, severe bleeding",
            "the patient is unconscious and unable to breathe",
            "experiencing severe chest pain and medical collapse",
            "deep head laceration with heavy blood loss",
        ],
    },
    "CURRENT_SAFETY_REASSURANCE": {
        "hi": [
            "he threatened me but I am safe now",
            "अब मैं पूरी तरह सुरक्षित हूं कोई खतरा नहीं है",
            "पुलिस आ गई है अब स्थिति नियंत्रण में है",
            "वो चला गया है अब सब ठीक है",
            "अभी मैं सेफ जगह पर पहुंच गई हूं",
            "पड़ोसियों ने आकर मुझे बचा लिया अब सुरक्षित हूं",
            "खतरा टल चुका है अब कोई डर नहीं है",
            "मैं पुलिस स्टेशन पहुंच चुका हूं और सेफ हूं",
        ],
        "hinglish": [
            "he threatened me but I am safe now",
            "ab mai safe hu police aa gayi hai",
            "woh chala gaya hai ab koi danger nahi hai",
            "abhi safe location par pahuch gaya hu",
            "situation control me hai tension ki baat nahi hai",
            "police PCR van reach ho gayi hai we are safe",
            "ab sab normal hai danger pass ho gaya hai",
            "reached inside police thana now totally safe",
        ],
        "en": [
            "he threatened me but I am safe now",
            "I am completely safe now, police have arrived",
            "the attacker has left and there is no danger now",
            "I have reached a safe and secure location",
            "everything is under control now, I am safe",
            "the PCR unit is here with me, I am protected",
            "danger has passed and I am in a secure shelter",
            "I am at the police station right now, completely safe",
        ],
    },
    "REQUEST_POLICE_EMERGENCY_HELP": {
        "hi": [
            "तुरंत पुलिस भेजिए यहां बहुत जरूरी है",
            "मुझे पुलिस सुरक्षा की तुरंत आवश्यकता है",
            "पीसीआर वैन को अलर्ट करके भेजो जल्दी",
            "112 की टीम को तुरंत मेरे पते पर भेजिए",
            "सुरक्षा दीजिए हमें पुलिस की सख्त जरूरत है",
        ],
        "hinglish": [
            "please send police immediately to my location",
            "police protection chahiye urgent basis pe",
            "pcr van bhejo jaldi address par",
            "dispatch 112 emergency police unit right now",
            "need immediate police intervention and escort",
        ],
        "en": [
            "please dispatch police to my location immediately",
            "I need urgent police security and protection right now",
            "please send a PCR emergency van right away",
            "alert the local police station for immediate response",
            "requesting immediate emergency police dispatch",
        ],
    },
    "REQUEST_COUNSELLING_LEGAL_MEDICAL": {
        "hi": [
            "मुझे कानूनी सलाह और वकील की मदद चाहिए",
            "काउंसलर से बात करा दीजिए मानसिक तनाव के लिए",
            "लीगल एड और कोर्ट प्रक्रिया की जानकारी चाहिए",
            "मुझे थेरेपिस्ट से काउंसलिंग की जरूरत है",
        ],
        "hinglish": [
            "legal advice and free legal aid lawyer chahiye",
            "counsellor se baat karni hai stress relief ke liye",
            "need mental health counselling and legal guidance",
            "advocate ki sahayata chahiye grievance file karne me",
        ],
        "en": [
            "I need legal guidance and lawyer consultation",
            "I would like to speak to a psychological counselor",
            "requesting legal aid assistance for filing case",
            "need therapy and mental health support session",
        ],
    },
    "UNCERTAINTY_UNCLEAR_INFO": {
        "hi": [
            "मुझे ठीक से याद नहीं आ रहा क्या हुआ था",
            "पता नहीं कौन था और क्या जगह थी",
            "बहुत उलझन में हूं सही जानकारी नहीं दे पा रही",
            "कन्फ्यूज हूं शायद कल या परसों की बात है",
        ],
        "hinglish": [
            "mujhe exact location yaad nahi aa rahi confuse hu",
            "not sure what happened exactly unclear memory",
            "pata nahi kahan hu landmark nahi dikh raha",
            "confused state me hu exact time nahi pata",
        ],
        "en": [
            "I cannot clearly recall the exact details or location",
            "I am uncertain and confused about what transpired",
            "I don't know the exact landmark around me",
            "the information is hazy and I cannot be sure",
        ],
    },
    "CONTRADICTORY_CHANGING_SITUATION": {
        "hi": [
            "पहले लगा कि सब ठीक है लेकिन अचानक फिर झगड़ा शुरू हो गया",
            "स्थिति हर पल बदल रही है कुछ समझ नहीं आ रहा",
            "कभी वो शांत हो जाता है कभी अचानक हमला कर देता है",
            "विरोधाभासी बातें हो रही हैं यहां माहौल अस्थिर है",
        ],
        "hinglish": [
            "pehle laga situation normal ho gayi par fir se violent ho gaya",
            "unpredictable behaviour hai situation continuously changing",
            "sometimes calm sometimes suddenly attacks again",
            "contradictory situation hai outcome uncertain hai",
        ],
        "en": [
            "initially it seemed resolved but suddenly violence flared up again",
            "the situation is volatile and constantly shifting",
            "the person fluctuates unpredictably between calm and rage",
            "unstable and fluctuating circumstances right now",
        ],
    },
    "NEUTRAL_NO_INDICATOR": {
        "hi": [
            "उसने मुझे कोई धमकी नहीं दी",
            "उसने मुझे नहीं धमकाया",
            "कोई डरने की बात नहीं है",
            "हम सिर्फ फिल्म की कहानी पर चर्चा कर रहे थे",
            "नमस्ते, राष्ट्रीय हेल्पलाइन 14566 में आपका स्वागत है",
            "कृपया अपनी शिकायत की श्रेणी और जिला बताइए",
            "हम केवल समय और तारीख की जानकारी के लिए कॉल किए हैं",
            "यह एक जागरूकता कार्यक्रम का नाटक था",
            "उसने मुझे कोई नुकसान नहीं पहुंचाया सब सामान्य है",
            "मुझे कोई खतरा नहीं है मैं सिर्फ सामान्य पूछताछ कर रहा हूं",
            "मैं सिर्फ योजना के बारे में जानकारी लेना चाहता हूं",
            "ऑपरेटर: कृपया अपना नाम और फोन नंबर दर्ज कराएं",
        ],
        "hinglish": [
            "he did not threaten me",
            "usne mujhe koi dhamki nahi di hai",
            "usne dhamki nahi di sab theek hai",
            "darr ki koi baat nahi hai normal hu",
            "movie ka scene discuss kar rahe the dost ke sath",
            "we were just joking around no real threat",
            "namaste, NHAA helpline me aapka swagat hai",
            "kripya apna address aur grievance details share karein",
            "just calling to inquire about the government scheme timings",
            "koi danger nahi hai general inquiry kar raha hu",
            "he was not threatening anyone it was a misunderstanding",
            "operator: how may I assist your query today sir?",
        ],
        "en": [
            "he did not threaten me",
            "she did not threaten anyone",
            "there was no threat made whatsoever",
            "he did not try to harm or intimidate me",
            "we were discussing a scene from a thriller movie",
            "this was just a classroom awareness demonstration",
            "Hello, welcome to the National Helpline 14566",
            "Operator: Please state your district and contact details",
            "I am calling purely for information regarding office hours",
            "there is no threat or danger here, everything is peaceful",
            "I am not in danger, just asking about the registration process",
            "it was a harmless conversation with no threatening language",
            "he never threatened me or my family at any point",
            "no physical violence or threats occurred",
            "Operator: Your grievance number has been logged successfully",
        ],
    },
}


def create_augmented_variations(
    text: str,
    category: str,
    lang: str,
    target_count: int,
) -> List[dict]:
    """
    Augments base seed sentences with conversational prefixes, suffixes,
    minor phonetic variations, and realistic speech markers to generate diverse samples.
    """
    results = []
    prefixes = (
        HINDI_PREFIXES if lang == "hi" else (HINGLISH_PREFIXES if lang == "hinglish" else ENGLISH_PREFIXES)
    )
    suffixes = (
        HINDI_SUFFIXES if lang == "hi" else (HINGLISH_SUFFIXES if lang == "hinglish" else ENGLISH_SUFFIXES)
    )

    typo_map = {
        "dhamki": ["dhamki", "dhamkee", "dhmki", "damki"],
        "darr": ["darr", "dar", "dhar"],
        "ghabrahat": ["ghabrahat", "gabrahat", "ghbrahat"],
        "scared": ["scared", "scard", "skared"],
        "threatened": ["threatened", "thretened", "threatnd"],
        "police": ["police", "pulis", "polce"],
        "khatra": ["khatra", "khatara", "katra"],
        "jaan": ["jaan", "jan", "jann"],
    }

    # 1. Add raw seed text
    results.append({
        "text": text,
        "label": category,
        "language": lang,
        "style": "direct_seed",
    })

    # 2. Generate prefix/suffix compositions
    for _ in range(target_count - 1):
        p = random.choice(prefixes)
        s = random.choice(suffixes)

        mod_text = text
        # Occasionally apply typo or phonetic transliteration
        if lang == "hinglish" and random.random() < 0.35:
            for word, repls in typo_map.items():
                if word in mod_text and random.random() < 0.5:
                    mod_text = mod_text.replace(word, random.choice(repls), 1)

        composed = f"{p} {mod_text} {s}".strip()
        # Clean double spaces
        composed = " ".join(composed.split())

        results.append({
            "text": composed,
            "label": category,
            "language": lang,
            "style": "conversational_augmented",
        })

    return results


def generate_full_dataset(target_total: int = 5500) -> List[dict]:
    """
    Generates >= target_total synthetic examples evenly distributed across 21 categories.
    """
    all_samples = []
    num_cats = len(SEEDS)
    samples_per_cat = max(260, target_total // num_cats + 15)

    print(f"Generating >= {target_total} synthetic dataset samples across {num_cats} categories...")

    for cat_name, lang_dict in SEEDS.items():
        cat_samples = []
        samples_per_lang = samples_per_cat // 3 + 5

        for lang, seeds in lang_dict.items():
            per_seed_count = max(4, samples_per_lang // len(seeds) + 1)
            for seed in seeds:
                variations = create_augmented_variations(
                    text=seed,
                    category=cat_name,
                    lang=lang,
                    target_count=per_seed_count,
                )
                cat_samples.extend(variations)

        # Shuffle category samples and trim to balanced proportion
        random.shuffle(cat_samples)
        all_samples.extend(cat_samples[:samples_per_cat])

    # Global shuffle
    random.shuffle(all_samples)
    print(f"Generated {len(all_samples)} total high-quality samples.")
    return all_samples


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    dataset = generate_full_dataset(target_total=5500)

    # Save JSON
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)
    print(f"Saved dataset JSON: {JSON_PATH} ({len(dataset)} items)")

    # Save CSV
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["text", "label", "language", "style"])
        writer.writeheader()
        writer.writerows(dataset)
    print(f"Saved dataset CSV:  {CSV_PATH}")


if __name__ == "__main__":
    main()
