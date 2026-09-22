// Backend Assessment Service: Trilingual Questions, Mandatory Validation, Dual-Stream AI Engine
// Note: dotenv is loaded by server/index.ts before this module is imported

const DEFAULT_OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

const CANDIDATE_MODELS = [
  process.env.OPENROUTER_MODEL || 'nex-agi/nex-n2.5-mini:free',
  'nex-agi/nex-n2.5-mini:free',
  'nex-agi/nex-n2.5-pro:free',
  'nvidia/nemotron-3.5-lightning:free',
  'openai/gpt-4o-mini',
].filter(Boolean) as string[]

function cleanAIText(text: string): string {
  if (!text) return ''
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  cleaned = cleaned.replace(/^Here's a thinking process:[\s\S]*?(?=\n\n(?:[A-Z0-9#🌟🛡️🌙✨]|\*\*))/i, '').trim()
  if (cleaned.startsWith("Here's a thinking process:")) {
    const doubleNewline = cleaned.indexOf('\n\n')
    if (doubleNewline !== -1) cleaned = cleaned.slice(doubleNewline + 2).trim()
  }
  return cleaned || text
}

export function getGroqApiKey(): string {
  return (process.env.GROQ_API_KEY || '').trim()
}

export function getGroqModel(): string {
  return (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim()
}

export function getOpenRouterApiKey(): string {
  return process.env.OPENROUTER_API_KEY || DEFAULT_OPENROUTER_KEY || ''
}

async function callGroqChat(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  options: {
    temperature?: number
    max_tokens?: number
    json_mode?: boolean
  } = {}
): Promise<string | null> {
  const models = [
    getGroqModel(),
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'groq/compound-mini',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ].filter((v, i, a) => v && a.indexOf(v) === i)

  for (const modelCandidate of models) {
    try {
      const payload: any = {
        model: modelCandidate,
        messages,
        temperature: options.temperature ?? 0.6,
        max_tokens: options.max_tokens ?? 450,
      }
      if (options.json_mode) {
        payload.response_format = { type: 'json_object' }
      }
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        const content = data?.choices?.[0]?.message?.content?.trim()
        if (content) return content
      } else {
        const errText = await res.text().catch(() => '')
        console.warn(`Groq chat HTTP ${res.status} for model ${modelCandidate}:`, errText)
      }
    } catch (err) {
      console.warn(`Groq chat call error for model ${modelCandidate}:`, err)
    }
  }
  return null
}


export interface BackendQuestion {
  question_id: string
  question_order: number
  question_text_en: string
  question_text_hi: string
  question_text_hinglish: string
  required: boolean
  response_type: 'audio_or_text'
  active: boolean
}

export const MANDATORY_QUESTIONS: BackendQuestion[] = [
  {
    question_id: 'Q1',
    question_order: 1,
    question_text_en: 'Can you tell us what has been troubling you recently?',
    question_text_hi: 'क्या आप बता सकते हैं कि हाल ही में आपको किस बात से परेशानी हो रही है?',
    question_text_hinglish: 'Kya aap bata sakte hain ki recently aapko kis baat se problem ho rahi hai?',
    required: true,
    response_type: 'audio_or_text',
    active: true,
  },
  {
    question_id: 'Q2',
    question_order: 2,
    question_text_en: 'How has this situation affected your daily life and activities?',
    question_text_hi: 'इस स्थिति ने आपके दैनिक जीवन, नींद या काम को कैसे प्रभावित किया है?',
    question_text_hinglish: 'Is situation ne aapki daily life, neend ya routine ko kaise affect kiya hai?',
    required: true,
    response_type: 'audio_or_text',
    active: true,
  },
  {
    question_id: 'Q3',
    question_order: 3,
    question_text_en: 'Have you experienced any intimidation, threats, or discrimination from anyone?',
    question_text_hi: 'क्या आपने किसी से कोई धमकी, भेदभाव या दबाव का अनुभव किया है?',
    question_text_hinglish: 'Kya aapne kisi se koi threat, discrimination, caste slur ya pressure experience kiya hai?',
    required: true,
    response_type: 'audio_or_text',
    active: true,
  },
  {
    question_id: 'Q4',
    question_order: 4,
    question_text_en: 'How is your emotional state feeling right now as you reflect on this?',
    question_text_hi: 'इस बारे में सोचते समय आप अभी भावनात्मक रूप से कैसा महसूस कर रहे हैं?',
    question_text_hinglish: 'Is baare mein sochte waqt aap emotionally kaisa feel kar rahe hain?',
    required: true,
    response_type: 'audio_or_text',
    active: true,
  },
  {
    question_id: 'Q5',
    question_order: 5,
    question_text_en: 'Have you felt supported by anyone around you, or do you feel isolated in this situation?',
    question_text_hi: 'क्या आपको अपने आस-पास किसी का सहारा महसूस हो रहा है, या आप अकेलापन महसूस कर रहे हैं?',
    question_text_hinglish: 'Kya aapko kisi ka support mil raha hai, ya aap is situation mein isolated feel kar rahe hain?',
    required: true,
    response_type: 'audio_or_text',
    active: true,
  },
  {
    question_id: 'Q6',
    question_order: 6,
    question_text_en: 'Are you currently worried about immediate physical safety for yourself or your family?',
    question_text_hi: 'क्या आप अभी अपने या अपने परिवार की शारीरिक सुरक्षा को लेकर चिंतित हैं?',
    question_text_hinglish: 'Kya aap abhi apne ya apni family ki physical safety ko lekar worried hain?',
    required: true,
    response_type: 'audio_or_text',
    active: true,
  },
  {
    question_id: 'Q7',
    question_order: 7,
    question_text_en: 'Is there anything else you want to share about what would help you feel secure right now?',
    question_text_hi: 'क्या कुछ और है जो आप साझा करना चाहते हैं जिससे आपको अभी सुरक्षित महसूस हो?',
    question_text_hinglish: 'Kya kuch aur hai jo aap share karna chahte hain jisse aap secure feel karein?',
    required: true,
    response_type: 'audio_or_text',
    active: true,
  },
]

export interface BackendDistressResult {
  distress_level: 'LOW' | 'MEDIUM' | 'HIGH'
  content_indicators: string[]
  vocal_signals: {
    speech_rate_change: boolean
    increased_pauses: boolean
    pitch_variation: boolean
    voice_tremor?: boolean
  }
  detected_language: 'ENGLISH' | 'HINDI' | 'HINGLISH' | 'MIXED'
  language_confidence: number
  urgency: 'low' | 'moderate' | 'high'
  support_recommended: boolean
  has_safety_concern: boolean
  normalized_summary?: string
}

export class AssessmentService {
  // Mandatory questions validation
  validateAllQuestionsAnswered(responses: Record<string, { answer: string }>): { valid: boolean; missingQuestionId?: string } {
    for (const q of MANDATORY_QUESTIONS) {
      if (q.required) {
        const resp = responses[q.question_id]
        if (!resp || !resp.answer || resp.answer.trim().length < 2) {
          return { valid: false, missingQuestionId: q.question_id }
        }
      }
    }
    return { valid: true }
  }

  // Language & Hinglish Detection
  detectLanguage(text: string): { language: 'ENGLISH' | 'HINDI' | 'HINGLISH' | 'MIXED'; confidence: number } {
    if (!text || text.trim().length === 0) return { language: 'ENGLISH', confidence: 0.5 }

    // Devanagari Unicode Range: \u0900-\u097F
    const hasDevanagari = /[\u0900-\u097F]/.test(text)
    const hinglishMarkers = ['hai', 'hain', 'mein', 'mera', 'meri', 'mujhe', 'karna', 'pad', 'raha', 'rahi', 'kuch', 'nahi', 'bahut', 'log', 'karte', 'hona', 'kyun', 'kya']
    const lower = text.toLowerCase()

    let hinglishScore = 0
    const words = new Set(lower.match(/[a-z0-9]+/g) || [])
    for (const marker of hinglishMarkers) {
      if (words.has(marker)) hinglishScore++
    }

    if (hasDevanagari && hinglishScore > 0) return { language: 'MIXED', confidence: 0.9 }
    if (hasDevanagari) return { language: 'HINDI', confidence: 0.95 }
    if (hinglishScore >= 1) return { language: 'HINGLISH', confidence: 0.92 }
    return { language: 'ENGLISH', confidence: 0.88 }
  }

  // Dual-Stream Evaluation using Backend Secret Key or Local Heuristic
  async evaluateResponses(
    responses: Record<string, { answer: string }>,
    acoustics?: { speakingRate?: number; pauseCount?: number; pitchVariation?: boolean; voiceIntensity?: string }
  ): Promise<BackendDistressResult> {
    const groqKey = getGroqApiKey()
    const apiKey = getOpenRouterApiKey()
    const isDemoMode = process.env.DEMO_MODE === 'true'

    const combinedText = Object.values(responses).map(r => r.answer).join(' ')
    const langDetect = this.detectLanguage(combinedText)

    if (!isDemoMode && groqKey) {
      try {
        const groqResult = await this.evaluateWithGroq(combinedText, acoustics, groqKey)
        if (groqResult) {
          groqResult.detected_language = langDetect.language
          groqResult.language_confidence = langDetect.confidence
          return groqResult
        }
      } catch (err) {
        console.warn('Groq evaluation failed, trying fallback:', err)
      }
    }

    if (!isDemoMode && apiKey) {
      try {
        const aiResult = await this.evaluateWithOpenRouter(combinedText, acoustics, apiKey)
        if (aiResult) {
          aiResult.detected_language = langDetect.language
          aiResult.language_confidence = langDetect.confidence
          return aiResult
        }
      } catch (err) {
        console.warn('OpenRouter evaluation failed, using resilient heuristic:', err)
      }
    }

    // Resilient local evaluation adhering to Hinglish and Dual-Stream requirements
    return this.evaluateLocalDualStream(combinedText, acoustics, langDetect.language, langDetect.confidence)
  }


  private evaluateLocalDualStream(
    combinedText: string,
    acoustics: any = {},
    language: 'ENGLISH' | 'HINDI' | 'HINGLISH' | 'MIXED',
    confidence: number
  ): BackendDistressResult {
    const text = combinedText.toLowerCase()

    const highRiskTerms = ['kill', 'suicide', 'die', 'murder', 'blood', 'weapon', 'mob', 'burn', 'lynch', 'marne', 'jaan', 'khatra', 'hathiyar']
    const violenceTerms = ['beat', 'attack', 'hit', 'assault', 'slap', 'injure', 'hospital', 'fracture', 'maara', 'peeta', 'hamla']
    const threatTerms = ['threat', 'threaten', 'scared', 'afraid', 'intimidate', 'harass', 'stalk', 'fear', 'darr', 'dhamki', 'pareshan']
    const discriminationTerms = ['caste', 'untouchable', 'dalit', 'adivasi', 'boycott', 'temple', 'well', 'water', 'abused', 'insult', 'bhedbhav', 'chhuachhut', 'gaali']

    const contentIndicators: string[] = []
    let highRiskCount = 0
    let moderateRiskCount = 0

    highRiskTerms.forEach(t => { if (text.includes(t)) { highRiskCount++; if (!contentIndicators.includes('safety_threat')) contentIndicators.push('safety_threat') } })
    violenceTerms.forEach(t => { if (text.includes(t)) { highRiskCount++; if (!contentIndicators.includes('violence')) contentIndicators.push('violence') } })
    threatTerms.forEach(t => { if (text.includes(t)) { moderateRiskCount++; if (!contentIndicators.includes('harassment')) contentIndicators.push('harassment'); if (!contentIndicators.includes('fear')) contentIndicators.push('fear') } })
    discriminationTerms.forEach(t => { if (text.includes(t)) { moderateRiskCount++; if (!contentIndicators.includes('discrimination')) contentIndicators.push('discrimination') } })

    const pauseCount = acoustics.pauseCount || 0
    const vocalSignals = {
      speech_rate_change: Boolean(acoustics.speakingRate && (acoustics.speakingRate < 90 || acoustics.speakingRate > 150)),
      increased_pauses: pauseCount >= 3,
      pitch_variation: Boolean(acoustics.pitchVariation || pauseCount >= 2),
      voice_tremor: acoustics.voiceIntensity === 'tremor',
    }

    const hasSafetyConcern = highRiskCount >= 1 || text.includes('kill') || text.includes('jaan ka khatra')
    let distressLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW'
    let urgency: 'low' | 'moderate' | 'high' = 'low'

    if (hasSafetyConcern || highRiskCount >= 2 || (moderateRiskCount >= 2 && (vocalSignals.increased_pauses || vocalSignals.voice_tremor))) {
      distressLevel = 'HIGH'
      urgency = 'high'
    } else if (moderateRiskCount >= 1 || vocalSignals.increased_pauses || text.length > 50) {
      distressLevel = 'MEDIUM'
      urgency = 'moderate'
    }

    return {
      distress_level: distressLevel,
      content_indicators: contentIndicators.length > 0 ? contentIndicators : ['mild_worry'],
      vocal_signals: vocalSignals,
      detected_language: language,
      language_confidence: confidence,
      urgency,
      support_recommended: distressLevel !== 'LOW',
      has_safety_concern: hasSafetyConcern,
    }
  }

  private async evaluateWithGroq(text: string, acoustics: any, apiKey: string): Promise<BackendDistressResult | null> {
    const prompt = `
You are a confidential trauma assessment engine for India's National Helpline Against Atrocities (NHAA).
Analyze the citizen's responses (which may be in English, Hindi, or Roman-script Hinglish like "Mujhe college mein discrimination face karna pad raha hai").

Text:
"${text}"

Acoustics:
- Pauses: ${acoustics?.pauseCount || 0}
- Speaking Rate: ${acoustics?.speakingRate || 120} wpm

Determine hidden distress level (LOW, MEDIUM, HIGH). Return valid JSON:
{
  "distress_level": "LOW" | "MEDIUM" | "HIGH",
  "content_indicators": ["harassment", "discrimination", "fear", "threats"],
  "vocal_signals": {
    "speech_rate_change": boolean,
    "increased_pauses": boolean,
    "pitch_variation": boolean
  },
  "urgency": "low" | "moderate" | "high",
  "support_recommended": boolean,
  "has_safety_concern": boolean
}
`
    const content = await callGroqChat(
      apiKey,
      [{ role: 'user', content: prompt }],
      { json_mode: true, temperature: 0.2, max_tokens: 350 }
    )
    if (!content) return null
    try {
      return JSON.parse(content) as BackendDistressResult
    } catch {
      return null
    }
  }

  private async evaluateWithOpenRouter(text: string, acoustics: any, apiKey: string): Promise<BackendDistressResult | null> {
    const prompt = `
You are a confidential trauma assessment engine for India's National Helpline Against Atrocities (NHAA).
Analyze the citizen's responses (which may be in English, Hindi, or Roman-script Hinglish like "Mujhe college mein discrimination face karna pad raha hai").

Text:
"${text}"

Acoustics:
- Pauses: ${acoustics?.pauseCount || 0}
- Speaking Rate: ${acoustics?.speakingRate || 120} wpm

Determine hidden distress level (LOW, MEDIUM, HIGH). Return valid JSON:
{
  "distress_level": "LOW" | "MEDIUM" | "HIGH",
  "content_indicators": ["harassment", "discrimination", "fear", "threats"],
  "vocal_signals": {
    "speech_rate_change": boolean,
    "increased_pauses": boolean,
    "pitch_variation": boolean
  },
  "urgency": "low" | "moderate" | "high",
  "support_recommended": boolean,
  "has_safety_concern": boolean
}
`
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://nhaa.local',
        'X-Title': 'NHAA Assessment',
      },
      body: JSON.stringify({
        model: CANDIDATE_MODELS[0] || 'nex-agi/nex-n2.5-pro:free',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    })

    if (!res.ok) {
      console.warn('OpenRouter analyze HTTP', res.status, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) return null
    return JSON.parse(content) as BackendDistressResult
  }

  // Counsellor Response Generator (Server-Side)
  async generateCounsellorReply(
    history: { role: string; content: string }[],
    userText: string,
    assessmentAnswers?: Record<string, string>
  ): Promise<string> {
    const groqKey = getGroqApiKey()
    const apiKey = getOpenRouterApiKey()
    const isDemoMode = process.env.DEMO_MODE === 'true'

    let assessmentContextStr = ''
    if (assessmentAnswers && Object.keys(assessmentAnswers).length > 0) {
      assessmentContextStr = `\nCitizen's Prior Assessment Answers:\n` +
        Object.entries(assessmentAnswers)
          .map(([q, ans]) => `- ${q}: "${ans}"`)
          .join('\n')
    }

    const counsellorSystemPrompt = `You are Counsellor C-104 & supportive AI companion for India's National Helpline (NHAA / 14566).
Act like ChatGPT: answer ALL user questions with great depth, warmth, accuracy, and clear guidance.
Use friendly expressive emojis (e.g. 🌟, 🤝, 🛡️, ✨, 💡, 🌙, 📋, 🙏, 💬) and conversational gestures throughout your answers.
Speak empathetically in the citizen's language (English, Hindi, or Hinglish matching the user's style).
If the user asks questions about security from a Nodal Officer, legal protection under the PoA Act, overcoming tension/insomnia, or general knowledge, provide rich, helpful, bulleted advice.
${assessmentContextStr}
Always make the citizen feel respected, heard, and supported. If they are in immediate danger, remind them of toll-free 14566 or 112.`

    // 1. Try Groq AI (Ultra-fast response)
    if (!isDemoMode && groqKey) {
      try {
        const groqReply = await callGroqChat(
          groqKey,
          [
            { role: 'system', content: counsellorSystemPrompt },
            ...history,
            { role: 'user', content: userText },
          ],
          { temperature: 0.6, max_tokens: 450 }
        )
        if (groqReply) {
          const cleaned = cleanAIText(groqReply)
          if (cleaned) return cleaned
        }
      } catch (err) {
        console.warn('Groq counsellor reply error, trying OpenRouter fallback:', err)
      }
    }

    if (!isDemoMode && apiKey) {
      for (const modelCandidate of CANDIDATE_MODELS) {
        try {
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'HTTP-Referer': 'https://nhaa.local',
              'X-Title': 'NHAA Counsellor',
            },
            body: JSON.stringify({
              model: modelCandidate,
              messages: [
                {
                  role: 'system',
                  content: counsellorSystemPrompt,
                },
                ...history,
                { role: 'user', content: userText },
              ],
              max_tokens: 400,
              temperature: 0.6,
            }),
          })

          if (res.ok) {
            const data = await res.json()
            const reply = data?.choices?.[0]?.message?.content?.trim()
            if (reply) {
              const cleaned = cleanAIText(reply)
              if (cleaned) return cleaned
            }
          } else {
            console.warn(`OpenRouter chat HTTP ${res.status} for model ${modelCandidate}`)
          }
        } catch (err) {
          console.warn(`OpenRouter chat failed for ${modelCandidate}:`, err)
        }
      }
    }

    // Local Empathetic Response with Rich Emojis & Practical Guidance
    const lower = userText.toLowerCase()
    if (lower.includes('nodal') || lower.includes('security') || lower.includes('suraksha') || lower.includes('police') || lower.includes('fir')) {
      return "🛡️ **Nodal Officer se Security Protection lene ke steps:**\n\n1️⃣ **Toll-Free Helpline:** Turant `14566` ya `112` par call karein aur Nodal Officer coordination request karein.\n2️⃣ **Written Complaint & Threat Assessment:** District Nodal Officer / SP Office me written application submit hoti hai jisme threat ka vivaran hota hai.\n3️⃣ **Witness Protection & Police Escort:** PoA Act Rules ke tahat immediate police security aur zero-FIR darj karwayi ja sakti hai.\n\nAap bilkul surakshit mehsoos karein, hum har kadam par aapke saath hain! 🤝🙏"
    }
    if (lower.includes('neend') || lower.includes('sleep') || lower.includes('tension') || lower.includes('stress')) {
      return "🌙✨ **Raat ko neend aur tension dur karne ke asar-daar upaay:**\n\n- 📱 **Screen Off:** Sone se 30-45 minute pehle mobile/screen dur rakhein taaki dimaag shaant ho.\n- 🫁 **Deep Breathing (4-7-8 Technique):** 4 second saans lein, 7 second rokein, aur 8 second me muh se dheere se chodein.\n- ☕ **No Caffeine:** Shaam ke baad chai/coffee bilkul avoid karein.\n- 💬 **Dil Ki Baat:** Jo bhi baat aapko pareshan kar rahi hai, yahan bejhiijhak likhein—hum aapki baat dhyan se sun rahe hain 🌟."
    }
    if (lower.includes('college') || lower.includes('hostel') || lower.includes('ragging') || lower.includes('ignore')) {
      return "I hear you. Facing discrimination or isolation in college is deeply distressing and unfair. You have the right to study in an environment free of fear and harassment. Would you like to discuss what happened with a student grievance nodal officer, or focus on how you're feeling right now?"
    }
    if (lower.includes('dhamki') || lower.includes('threat') || lower.includes('darr') || lower.includes('scared')) {
      return "It is completely understandable that you feel worried after facing threats. Please remember you are not alone—under the PoA Act, your safety is protected by law. Are you in a physically secure place right now?"
    }
    if (lower.includes('neend') || lower.includes('sleep') || lower.includes('tension') || lower.includes('stress')) {
      return "Sleep disturbances and tension are natural reactions to heavy emotional strain. Take a slow, deep breath. We are here to support you at your own pace. What is on your mind right now?"
    }
    if (lower.includes('police') || lower.includes('fir') || lower.includes('nodal')) {
      return "Under NHAA 14566, we can connect you directly to an SC/ST Nodal Officer who can facilitate a Zero-FIR and protective measures without revealing your identity prematurely."
    }
    return "Thank you for sharing that with me. I am listening attentively. Please take all the time you need—what would you like to bring you the most peace of mind today?"
  }

  // Generate Tailored Counsellor Suggestions based on Citizen's Assessment Answers
  async generateCounsellorSuggestions(
    answers: Record<string, string>,
    language: string = 'en',
    distressLevel: string = 'MEDIUM'
  ): Promise<{
    greeting: string
    identified_issues: string[]
    counsellor_id: string
    distress_level: string
    suggestions: Array<{
      id: string
      category: 'legal' | 'coping' | 'medical' | 'counselling'
      title: string
      badge: string
      description: string
      action_prompt: string
    }>
    recommended_prompts: string[]
  }> {
    const counsellorId = distressLevel === 'HIGH' ? 'C-108 (Priority Specialist)' : 'C-104 (Trauma Counselor)'
    const allAnswersText = Object.values(answers).join(' ')
    const lowerAll = allAnswersText.toLowerCase()
    const isHindi = language.toLowerCase().includes('hi') && !language.toLowerCase().includes('hinglish')
    const isHinglish = language.toLowerCase().includes('hinglish') || this.detectLanguage(allAnswersText).language === 'HINGLISH'

    const groqKey = getGroqApiKey()
    const apiKey = getOpenRouterApiKey()
    const isDemoMode = process.env.DEMO_MODE === 'true'

    const prompt = `
You are Counsellor ${counsellorId} at India's National Helpline Against Atrocities (NHAA - 14566).
A citizen just finished an assessment with distress level "${distressLevel}".
Their assessment answers are:
${JSON.stringify(answers, null, 2)}

Target Language: ${isHindi ? 'Formal Hindi (Devanagari)' : isHinglish ? 'Conversational Roman Hinglish' : 'Empathetic English'}

Generate a JSON response tailored strictly to what the citizen answered:
{
  "greeting": "Empathetic 2-sentence greeting directly acknowledging their specific answers (e.g. mentioning the threats, sleep problems, or fear they described).",
  "identified_issues": ["Specific Issue 1 derived from answers", "Specific Issue 2", "Specific Issue 3"],
  "suggestions": [
    {
      "id": "sug-1",
      "category": "legal",
      "title": "Short title",
      "badge": "Legal & Protection",
      "description": "Specific action they can take under PoA Act / NHAA protection based on the threats/slurs they mentioned.",
      "action_prompt": "Prompt user can click to ask more about this"
    },
    {
      "id": "sug-2",
      "category": "coping",
      "title": "Short title",
      "badge": "Trauma & Sleep Regulation",
      "description": "Specific somatic grounding or psychological coping advice addressing their sleep or anxiety.",
      "action_prompt": "Prompt user can click to ask about coping"
    },
    {
      "id": "sug-3",
      "category": "counselling",
      "title": "Short title",
      "badge": "Confidential Counseling",
      "description": "How 1-on-1 confidential tele-counseling can help them safely recover.",
      "action_prompt": "Prompt user can click to ask about counseling"
    }
  ],
  "recommended_prompts": [
    "Quick question 1 user might want to ask next",
    "Quick question 2",
    "Quick question 3"
  ]
}
Return only valid JSON.
`

    // 1. Try Groq AI (Ultra-fast structured suggestions)
    if (!isDemoMode && groqKey) {
      try {
        const content = await callGroqChat(
          groqKey,
          [{ role: 'user', content: prompt }],
          { json_mode: true, temperature: 0.3, max_tokens: 650 }
        )
        if (content) {
          const parsed = JSON.parse(content)
          if (parsed.greeting && parsed.suggestions && parsed.suggestions.length > 0) {
            return {
              greeting: parsed.greeting,
              identified_issues: parsed.identified_issues || ['Threats & Pressure', 'Sleep Disruption'],
              counsellor_id: counsellorId,
              distress_level: distressLevel,
              suggestions: parsed.suggestions,
              recommended_prompts: parsed.recommended_prompts || [
                'How can NHAA protect my family?',
                'What should I do when panic hits at night?',
                'Can I file a confidential complaint?',
              ],
            }
          }
        }
      } catch (err) {
        console.warn('Groq suggestions failed, trying OpenRouter fallback:', err)
      }
    }

    if (!isDemoMode && apiKey) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://nhaa.local',
            'X-Title': 'NHAA Counsellor Suggestions',
          },
          body: JSON.stringify({
            model: CANDIDATE_MODELS[0] || 'nex-agi/nex-n2.5-pro:free',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.3,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}')
          if (parsed.greeting && parsed.suggestions && parsed.suggestions.length > 0) {
            return {
              greeting: parsed.greeting,
              identified_issues: parsed.identified_issues || ['Threats & Pressure', 'Sleep Disruption'],
              counsellor_id: counsellorId,
              distress_level: distressLevel,
              suggestions: parsed.suggestions,
              recommended_prompts: parsed.recommended_prompts || [
                'How can NHAA protect my family?',
                'What should I do when panic hits at night?',
                'Can I file a confidential complaint?',
              ],
            }
          }
        }
      } catch (err) {
        console.warn('OpenRouter suggestions failed, using local rules:', err)
      }
    }

    // Local Tailored Suggestions Fallback
    const hasThreat = lowerAll.includes('threat') || lowerAll.includes('dhamki') || lowerAll.includes('darr') || lowerAll.includes('attack') || lowerAll.includes('marne')
    const hasSleep = lowerAll.includes('neend') || lowerAll.includes('sleep') || lowerAll.includes('insomnia') || lowerAll.includes('nightmare') || lowerAll.includes('flashback')
    const hasDiscrimination = lowerAll.includes('caste') || lowerAll.includes('slur') || lowerAll.includes('boycott') || lowerAll.includes('jaati') || lowerAll.includes('apmaan')
    const hasIsolation = lowerAll.includes('alone') || lowerAll.includes('akela') || lowerAll.includes('isolated') || lowerAll.includes('helpless')

    const identified_issues: string[] = []
    if (hasThreat) identified_issues.push(isHindi ? 'धमकियां और सुरक्षा की चिंता' : isHinglish ? 'Threats & Safety Concerns' : 'Threats & Safety Concerns')
    if (hasSleep) identified_issues.push(isHindi ? 'नींद की कमी और मानसिक तनाव' : isHinglish ? 'Sleep Deprivation & Night Panics' : 'Sleep Deprivation & Hyperarousal')
    if (hasDiscrimination) identified_issues.push(isHindi ? 'जातिगत भेदभाव व उत्पीड़न' : isHinglish ? 'Caste Discrimination & Pressure' : 'Caste-Based Harassment')
    if (hasIsolation || identified_issues.length === 0) identified_issues.push(isHindi ? 'अकेलापन और सहायता की आवश्यकता' : isHinglish ? 'Social Isolation & Need for Support' : 'Social Isolation')

    let greeting = ''
    if (isHindi) {
      greeting = `नमस्ते। मैं काउंसलर ${counsellorId} हूँ। मैंने आपके मूल्यांकन उत्तरों को ध्यानपूर्वक पढ़ा है। ${hasThreat ? 'आपने जो धमकियों और असुरक्षा के बारे में बताया है, वह अत्यंत गंभीर है।' : 'आप जिस कठिन समय और तनाव से गुजर रहे हैं, हम उसे गहराई से समझते हैं।'} आपके उत्तरों के आधार पर मैंने कुछ विशेष सुझाव तैयार किए हैं:`
    } else if (isHinglish) {
      greeting = `Namaste. Main Counsellor ${counsellorId} hoon. Maine aapke assessment ke answers dhyan se review kiye hain. ${hasThreat ? 'Aapne jo threats aur security ke baare mein share kiya hai, wo bohot sensitive aur serious hai.' : 'Aap jo mental stress aur anxiety face kar rahe hain, we understand how hard it is.'} Aapke answers ke basis par maine specific suggestions prepare kiye hain:`
    } else {
      greeting = `Hello. I am Counsellor ${counsellorId}. I have reviewed your assessment answers in detail. ${hasThreat ? 'The threats and fear you described are very serious, and your safety is our utmost priority.' : 'We recognize the deep distress and burden you are carrying.'} Based specifically on what you shared, here are targeted recommendations for you:`
    }

    const suggestions = [
      {
        id: 'sug-1',
        category: 'legal' as const,
        title: isHindi ? 'एससी/एसटी अत्याचार निवारण अधिनियम के तहत सुरक्षा' : isHinglish ? 'SC/ST PoA Act ke tahat Legal Protection' : 'Protection under SC/ST PoA Act',
        badge: isHindi ? 'कानूनी सुरक्षा' : isHinglish ? 'Legal Safety' : 'Legal Safety',
        description: isHindi
          ? 'आपके द्वारा बताई गई धमकियों के लिए NHAA 14566 के नोडल अधिकारी से संपर्क कर गोपनीय जीरो-एफआईआर और पुलिस सुरक्षा का अनुरोध किया जा सकता है।'
          : isHinglish
          ? 'Aapne jo threats batayi hain, uske liye NHAA 14566 nodal officer ke through confidential Zero-FIR aur security escort arrange ki ja sakti hai.'
          : 'Based on the threats and intimidation reported, you are eligible for immediate Zero-FIR registration and police protection overseen by the District Nodal Officer.',
        action_prompt: isHindi
          ? 'नोडल अधिकारी और कानूनी सुरक्षा की प्रक्रिया क्या है?'
          : isHinglish
          ? 'Nodal officer aur legal protection ka process kya hai?'
          : 'How can NHAA nodal officer protect my family?',
      },
      {
        id: 'sug-2',
        category: 'coping' as const,
        title: isHindi ? 'नींद और पैनिक अटैक के लिए 5-4-3-2-1 ग्राउंडिंग' : isHinglish ? 'Sleep & Panic Attack Grounding Protocol' : 'Somatic Grounding & Sleep Protocol',
        badge: isHindi ? 'मानसिक राहत' : isHinglish ? 'Trauma Coping' : 'Trauma Coping',
        description: isHindi
          ? 'रात में आने वाले डरावने विचारों और नींद की समस्या के लिए 4-7-8 श्वास तकनीक और संवेदी ग्राउंडिंग का अभ्यास करें ताकि शरीर का नर्वस सिस्टम शांत हो सके।'
          : isHinglish
          ? 'Raat ko darr aur neend na aane par 4-7-8 breathing aur grounding practice karein jisse mind and nervous system calm ho sake.'
          : 'To manage hyperarousal, night panic, and flashbacks, practice 5-4-3-2-1 sensory grounding and rhythmic diaphragmatic breathing before sleep.',
        action_prompt: isHindi
          ? 'रात में घबराहट रोकने के लिए तुरंत क्या करें?'
          : isHinglish
          ? 'Raat ko panic rokne ke liye quick exercise batayein'
          : 'Guide me through a grounding exercise for sleep anxiety',
      },
      {
        id: 'sug-3',
        category: 'counselling' as const,
        title: isHindi ? 'गोपनीय 1-ऑन-1 मनोवैज्ञानिक टेली-काउंसलिंग' : isHinglish ? '1-on-1 Confidential Tele-Counseling' : 'Confidential 1-on-1 Counseling',
        badge: isHindi ? 'काउंसलिंग सपोर्ट' : isHinglish ? 'Support Chat' : 'Support Chat',
        description: isHindi
          ? 'NHAA के प्रमाणित मनोवैज्ञानिकों के साथ बिना पहचान उजागर किए लगातार मार्गदर्शन प्राप्त करें ताकि आप इस आघात से उबर सकें।'
          : isHinglish
          ? 'NHAA ke verified psychologists ke sath 100% anonymous private sessions continue karein to process this trauma safely.'
          : 'Continue continuous private sessions with our certified trauma psychologists to work through fear, isolation, and emotional distress.',
        action_prompt: isHindi
          ? 'क्या मेरी पहचान पूरी तरह गोपनीय रहेगी?'
          : isHinglish
          ? 'Kya meri identity completely safe rahegi?'
          : 'How does NHAA ensure my identity stays anonymous?',
      },
    ]

    const recommended_prompts = isHindi
      ? [
          'नोडल अधिकारी से सुरक्षा कैसे मिलेगी?',
          'रात को घबराहट और नींद न आने पर क्या करूँ?',
          'क्या मैं पूरी तरह गोपनीय शिकायत दर्ज करा सकता हूँ?',
        ]
      : isHinglish
      ? [
          'Nodal officer se security kaise milegi?',
          'Raat ko neend aur tension ke liye kya karun?',
          'Kya main anonymous complaint file kar sakta hoon?',
        ]
      : [
          'How can NHAA protect my family without disclosing identity?',
          'What immediate exercises can calm night panics and flashbacks?',
          'Can I file a confidential grievance through NHAA?',
        ]

    return {
      greeting,
      identified_issues,
      counsellor_id: counsellorId,
      distress_level: distressLevel,
      suggestions,
      recommended_prompts,
    }
  }

  // ===== AI-Driven Conversational Assessment =====

  async conversationalReply(
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    userMessage: string,
    acoustics?: { speakingRate?: number; pauseCount?: number; pitchVariation?: boolean; voiceIntensity?: string },
    turnCount: number = 0
  ): Promise<{
    reply: string
    is_complete: boolean
    assessment_result?: BackendDistressResult & { summary?: string; language?: string }
    detected_language: string
  }> {
    const groqKey = getGroqApiKey()
    const apiKey = getOpenRouterApiKey()
    const isDemoMode = process.env.DEMO_MODE === 'true'

    // Detect language from the actual text (skip [SILENCE] tokens)
    const textForLang = userMessage === '[SILENCE]'
      ? history.filter(h => h.role === 'user').map(h => h.content).join(' ')
      : userMessage
    const langDetect = this.detectLanguage(textForLang)

    if (!isDemoMode && groqKey) {
      try {
        const result = await this.callGroqConversational(history, userMessage, acoustics, groqKey, turnCount)
        if (result) {
          result.detected_language = langDetect.language
          return result
        }
      } catch (err) {
        console.warn('Groq conversational failed, trying OpenRouter fallback:', err)
      }
    }

    if (!isDemoMode && apiKey) {
      try {
        const result = await this.callOpenRouterConversational(history, userMessage, acoustics, apiKey, turnCount)
        if (result) {
          result.detected_language = langDetect.language
          return result
        }
      } catch (err) {
        console.warn('OpenRouter conversational failed, falling back to local:', err)
      }
    }

    return this.localConversationalReply(history, userMessage, acoustics, turnCount, langDetect.language)
  }

  private async callGroqConversational(
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    userMessage: string,
    acoustics: any,
    apiKey: string,
    turnCount: number
  ): Promise<{ reply: string; is_complete: boolean; assessment_result?: any; detected_language: string } | null> {
    const canComplete = turnCount >= 5

    const systemPrompt = `You are NHAA-AI, a compassionate trauma-informed AI counselor for India's National Helpline Against Atrocities (NHAA), operating under the SC/ST Prevention of Atrocities Act.

ROLE: Conduct a NATURAL CONVERSATIONAL assessment. Do NOT list numbered questions. Ask ONE follow-up at a time.

APPROACH:
- Acknowledge and validate what the user shares FIRST, then ask ONE focused question
- Explore organically over 6-8 turns: recent troubles → daily life impact → threats/discrimination → emotional state → support system → physical safety → what would help
- Keep responses brief: 2-3 sentences + one question
- LANGUAGE: Detect and respond in the user's EXACT language — English, Hindi (Devanagari), or Hinglish (Roman-script Hindi like "Mujhe bahut mushkil ho rahi hai")
- SAFETY: If user mentions violence, suicide, or immediate danger → immediately mention helpline 14566

SILENCE: If user message is exactly "[SILENCE]", respond with ONE gentle sentence in their language — no question.

COMPLETION: ${canComplete
  ? `You now have sufficient context. When wrapping up, write a warm closing sentence, then append on a NEW LINE:
[ASSESSMENT_COMPLETE]
{"distress_level":"HIGH"|"MEDIUM"|"LOW","urgency":"high"|"moderate"|"low","has_safety_concern":true|false,"support_recommended":true|false,"content_indicators":["harassment","fear","discrimination","violence","isolation","safety_threat"],"summary":"One sentence describing their core situation"}
[/ASSESSMENT_COMPLETE]
Only include this block once, at the end.`
  : 'Do NOT include [ASSESSMENT_COMPLETE] yet — continue the conversation.'}`

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history,
      { role: 'user' as const, content: userMessage },
    ]

    const fullReply = await callGroqChat(apiKey, messages, {
      max_tokens: 350,
      temperature: 0.65,
    })
    if (!fullReply) return null

    const completeMatch =
      fullReply.match(/\[ASSESSMENT_COMPLETE\]([\s\S]*?)\[\/ASSESSMENT_COMPLETE\]/) ||
      fullReply.match(/\[ASSESSMENT_COMPLETE\]([\s\S]*?)(?=\s*$)/)
    let isComplete = false
    let assessmentResult: any = undefined
    const cleanReply = fullReply
      .replace(/\[ASSESSMENT_COMPLETE\][\s\S]*?(\[\/ASSESSMENT_COMPLETE\]|$)/g, '')
      .replace(/\[\/ASSESSMENT_COMPLETE\]/g, '')
      .trim()

    if (completeMatch && completeMatch[1]) {
      try {
        const rawJson = completeMatch[1].trim()
        assessmentResult = JSON.parse(rawJson)
        isComplete = true
      } catch (e) {
        console.warn('Failed to parse [ASSESSMENT_COMPLETE] JSON from Groq:', e)
      }
    }

    return {
      reply: cleanReply || fullReply,
      is_complete: isComplete,
      assessment_result: assessmentResult,
      detected_language: 'UNKNOWN',
    }
  }


  private async callOpenRouterConversational(
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    userMessage: string,
    acoustics: any,
    apiKey: string,
    turnCount: number
  ): Promise<{ reply: string; is_complete: boolean; assessment_result?: any; detected_language: string } | null> {
    const canComplete = turnCount >= 5

    const systemPrompt = `You are NHAA-AI, a compassionate trauma-informed AI counselor for India's National Helpline Against Atrocities (NHAA), operating under the SC/ST Prevention of Atrocities Act.

ROLE: Conduct a NATURAL CONVERSATIONAL assessment. Do NOT list numbered questions. Ask ONE follow-up at a time.

APPROACH:
- Acknowledge and validate what the user shares FIRST, then ask ONE focused question
- Explore organically over 6-8 turns: recent troubles → daily life impact → threats/discrimination → emotional state → support system → physical safety → what would help
- Keep responses brief: 2-3 sentences + one question
- LANGUAGE: Detect and respond in the user's EXACT language — English, Hindi (Devanagari), or Hinglish (Roman-script Hindi like "Mujhe bahut mushkil ho rahi hai")
- SAFETY: If user mentions violence, suicide, or immediate danger → immediately mention helpline 14566

SILENCE: If user message is exactly "[SILENCE]", respond with ONE gentle sentence in their language — no question.

COMPLETION: ${canComplete
  ? `You now have sufficient context. When wrapping up, write a warm closing sentence, then append on a NEW LINE:
[ASSESSMENT_COMPLETE]
{"distress_level":"HIGH"|"MEDIUM"|"LOW","urgency":"high"|"moderate"|"low","has_safety_concern":true|false,"support_recommended":true|false,"content_indicators":["harassment","fear","discrimination","violence","isolation","safety_threat"],"summary":"One sentence describing their core situation"}
[/ASSESSMENT_COMPLETE]
Only include this block once, at the end.`
  : 'Do NOT include [ASSESSMENT_COMPLETE] yet — continue the conversation.'}`

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history,
      { role: 'user' as const, content: userMessage },
    ]

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://nhaa.local',
        'X-Title': 'NHAA Conversational Assessment',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
        messages,
        max_tokens: 300,
        temperature: 0.65,
      }),
    })

    if (!res.ok) {
      console.warn('OpenRouter converse HTTP', res.status, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    const fullReply: string = data?.choices?.[0]?.message?.content?.trim() || ''
    if (!fullReply) return null

    // Parse [ASSESSMENT_COMPLETE]...[/ASSESSMENT_COMPLETE]
    // Also handles cases where the LLM omits the closing tag
    const completeMatch =
      fullReply.match(/\[ASSESSMENT_COMPLETE\]([\s\S]*?)\[\/ASSESSMENT_COMPLETE\]/) ||
      fullReply.match(/\[ASSESSMENT_COMPLETE\]([\s\S]*?)(?=\s*$)/)
    let isComplete = false
    let assessmentResult: any = undefined
    const cleanReply = fullReply
      .replace(/\[ASSESSMENT_COMPLETE\][\s\S]*?(\[\/ASSESSMENT_COMPLETE\]|$)/g, '')
      .replace(/\[\/ASSESSMENT_COMPLETE\]/g, '')
      .trim()

    if (completeMatch) {
      try {
        assessmentResult = JSON.parse(completeMatch[1].trim())
        // Enrich with vocal acoustics from this session
        if (acoustics) {
          assessmentResult.vocal_signals = {
            speech_rate_change: Boolean(acoustics.speakingRate && (acoustics.speakingRate < 90 || acoustics.speakingRate > 150)),
            increased_pauses: (acoustics.pauseCount || 0) >= 3,
            pitch_variation: Boolean(acoustics.pitchVariation),
            voice_tremor: acoustics.voiceIntensity === 'tremor',
          }
        }
        assessmentResult.language_confidence = 0.9
        assessmentResult.detected_language = 'ENGLISH' // overwritten by caller
        isComplete = true
      } catch {
        // Malformed JSON — don't mark as complete, let conversation continue
      }
    }

    return { reply: cleanReply, is_complete: isComplete, assessment_result: assessmentResult, detected_language: 'ENGLISH' }
  }

  private localConversationalReply(
    history: Array<{ role: string; content: string }>,
    userMessage: string,
    acoustics: any,
    turnCount: number,
    language: 'ENGLISH' | 'HINDI' | 'HINGLISH' | 'MIXED'
  ): { reply: string; is_complete: boolean; assessment_result?: any; detected_language: string } {
    const isSilence = userMessage === '[SILENCE]'

    if (isSilence) {
      const prompts: Record<string, string> = {
        HINDI: 'Main yahan hoon aur sun raha hoon — koi jaldi nahi, jab taiyaar ho jayein toh batayein.',
        HINGLISH: 'Main yahan hoon. Jab ready feel karein, aap bol sakte hain ya type kar sakte hain.',
        MIXED: "I'm here / Main yahan hoon. Take your time / Aaram se bolein.",
        ENGLISH: "I'm here and listening. Please take your time — whenever you're ready, feel free to share.",
      }
      return { reply: prompts[language] ?? prompts.ENGLISH, is_complete: false, detected_language: language }
    }

    type L = 'ENGLISH' | 'HINDI' | 'HINGLISH' | 'MIXED'
    const questions: Array<Record<L, string>> = [
      {
        ENGLISH: "Thank you for sharing that. I can hear this has been weighing heavily on you. How has this situation been affecting your daily life — your sleep, your work, or your sense of routine?",
        HINDI: "Aapki baat sunke dil dukha. Main samajh sakta hoon yeh kitna mushkil raha hoga. Kya aap bata sakte hain ki is situation ne aapki daily life — neend, kaam ya routine — ko kaise affect kiya hai?",
        HINGLISH: "Thank you for sharing that. Yeh sab bahut mushkil raha hoga. Is situation ne aapki daily life, neend ya routine ko kaise affect kiya hai?",
        MIXED: "Thank you for sharing / Share karne ke liye shukriya. Yeh situation ne aapki daily life ko kaise affect kiya hai?",
      },
      {
        ENGLISH: "I understand how painful this must be. Have you experienced any threats, discrimination, or intimidation from anyone because of your identity or what happened?",
        HINDI: "Aap bahut mushkil waqt se guzar rahe hain. Kya aapne kisi ke dwara dhamki, bhedbhav ya dabaav ka anubhav kiya hai?",
        HINGLISH: "Yeh sab share karna bahut brave hai. Kya aapne kisi ke dwara threats, discrimination, ya caste-based pressure experience kiya hai?",
        MIXED: "I hear you. Kya aapne kisi se threats ya discrimination experience kiya hai?",
      },
      {
        ENGLISH: "Your courage in sharing this is clear. How are you feeling emotionally right now — scared, angry, exhausted, numb, or perhaps something else?",
        HINDI: "Aap bahut brave hain ki yeh sab share kar rahe hain. Abhi is waqt, is sab ke baare mein sochte hue aap emotionally kaisa feel kar rahe hain?",
        HINGLISH: "Itna share karna himmat ka kaam hai. Is waqt aap emotionally kaisa feel kar rahe hain — gussa, darr, numb, ya kuch aur?",
        MIXED: "Is waqt emotionally kaisa feel ho raha hai — scared, angry, ya numb?",
      },
      {
        ENGLISH: "Your feelings make complete sense given what you've been through. Do you have people around you — family, friends, or community — who are supporting you, or do you feel largely alone in this?",
        HINDI: "Aapki feelings bilkul samajh mein aati hain. Kya aapke paas koi hai — parivaar, dost ya samudaay — jo aapka saath de raha hai, ya aap akela feel kar rahe hain?",
        HINGLISH: "Aapki feelings bilkul valid hain. Kya koi hai jo aapko support kar raha hai — family, friends, community — ya aap isolated feel kar rahe hain?",
        MIXED: "Kya koi support karne wala hai, ya aap akele feel kar rahe hain?",
      },
      {
        ENGLISH: "I want to ask you directly — are you or your family currently worried about immediate physical safety? Is there any active danger right now?",
        HINDI: "Main seedha poochhna chahta hoon — kya aap ya aapka parivaar abhi immediate physical safety ko lekar worried hain?",
        HINGLISH: "Ek important sawaal — kya aap ya aapki family abhi physically safe hain, ya koi immediate threat hai?",
        MIXED: "Are you / kya aap physically safe hain? Koi immediate danger hai?",
      },
    ]

    const userTurns = history.filter(m => m.role === 'user').length

    // Complete after enough turns
    if (userTurns >= 4 || turnCount >= 5) {
      const combinedText = history
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join(' ') + ' ' + userMessage

      const evaluation = this.evaluateLocalDualStream(combinedText, acoustics || {}, language, 0.85)

      const wrapUps: Record<string, string> = {
        HINDI: 'Shukriya itni zaroori baat share karne ke liye. Maine aapki poori baat dhyan se suni hai. Ab main aapko ek dedicated support counsellor se connect kar raha hoon jo sahi guidance de sakta hai.',
        HINGLISH: 'Thank you itna kuch share karne ke liye. Ab main aapko ek counsellor se connect kar raha hoon jo aapki help karega.',
        ENGLISH: "Thank you so much for trusting me with all of this. I have listened carefully to everything you've shared. I'm now connecting you with a dedicated support counsellor who can provide the right guidance for your situation.",
        MIXED: "Thank you / Shukriya for sharing everything. Ab main aapko ek counsellor se connect kar raha hoon.",
      }

      return {
        reply: wrapUps[language] ?? wrapUps.ENGLISH,
        is_complete: true,
        assessment_result: {
          ...evaluation,
          summary: 'Assessment based on your shared experiences during our conversation.',
          language,
        },
        detected_language: language,
      }
    }

    const qi = Math.min(userTurns, questions.length - 1)
    const reply = questions[qi][language] ?? questions[qi].ENGLISH
    return { reply, is_complete: false, detected_language: language }
  }
}

export const assessmentService = new AssessmentService()
