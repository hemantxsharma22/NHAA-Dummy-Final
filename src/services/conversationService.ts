// Conversational Assessment & Counsellor Chat Service
// Handles the AI-driven assessment conversation + counsellor mode chat.
// Falls back to local heuristics when the backend server is unavailable.

import { isEmergencyInput } from './llmService'
import { assessmentEngine } from './assessmentEngine'
import type { AcousticFeatures } from './audioEngine'

export interface ConversationTurn {
  role: 'user' | 'ai'
  content: string
}

export interface AssessmentResult {
  distress_level: 'LOW' | 'MEDIUM' | 'HIGH'
  urgency: 'low' | 'moderate' | 'high'
  has_safety_concern: boolean
  support_recommended: boolean
  content_indicators: string[]
  summary?: string
}

export interface ConversationResponse {
  reply: string
  is_complete: boolean
  assessment_result?: AssessmentResult
  detected_language?: string
}

const EMERGENCY_REPLY =
  'Your immediate safety is our highest priority. If you or your loved ones are facing imminent physical danger right now, please reach out to local police or our toll-free 24x7 emergency helpline at 14566 immediately.'

// ── Assessment conversation ────────────────────────────────────────────────

export async function sendConversationMessage(
  userMessage: string,
  history: ConversationTurn[],
  sessionId: string,
  turnCount: number = 0,
  acoustics?: Partial<AcousticFeatures>
): Promise<ConversationResponse> {
  // Emergency safety override — never forward to LLM
  if (userMessage !== '[SILENCE]' && isEmergencyInput(userMessage)) {
    return { reply: EMERGENCY_REPLY, is_complete: false }
  }

  try {
    const res = await fetch('/api/assessment/converse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        user_message: userMessage,
        turn_count: turnCount,
        history: history.map((t) => ({
          role: t.role === 'ai' ? 'assistant' : 'user',
          content: t.content,
        })),
        acoustics,
      }),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as ConversationResponse
  } catch {
    return localConversationFallback(userMessage, history, turnCount)
  }
}

// ── Counsellor chat ────────────────────────────────────────────────────────

const DIRECT_GROQ_KEY =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GROQ_API_KEY) || ''

const CONV_GROQ_MODELS = [
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GROQ_MODEL) || '',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'groq/compound-mini',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
].filter(Boolean) as string[]

const DIRECT_OPENROUTER_KEY =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_OPENROUTER_API_KEY) || ''

const CONV_CANDIDATE_MODELS = [
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_OPENROUTER_MODEL) || '',
  'nex-agi/nex-n2.5-pro:free',
  'nex-agi/nex-n2.5-mini:free',
  'nvidia/nemotron-3.5-lightning:free',
  'openai/gpt-4o-mini',
].filter(Boolean) as string[]

export async function sendCounsellorMessage(
  userMessage: string,
  history: ConversationTurn[]
): Promise<string> {
  if (isEmergencyInput(userMessage)) return EMERGENCY_REPLY

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_text: userMessage,
        history: history.map((t) => ({
          role: t.role === 'ai' ? 'assistant' : 'user',
          content: t.content,
        })),
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const reply = data?.reply ?? data?.counsellor_message?.text
      if (reply) return reply
    }
  } catch (err) {
    console.warn('Backend /api/chat error in conversationService, trying direct OpenRouter:', err)
  }

  const counsellorPrompt = `You are Counsellor C-104 & AI Companion at India's National Helpline (NHAA - 14566).
Like ChatGPT, answer all user questions engagingly, empathetically, and comprehensively with practical guidance.
Use friendly expressive emojis (🌟, 🤝, 🛡️, ✨, 💡, 🌙, 📋, 🙏) and natural gestures throughout your response.
Speak warmly and accurately in the user's language (English, Hindi, or Hinglish).
Provide clear bullet points and actionable advice for questions on security, rights, stress relief, or general inquiries.
Keep tone encouraging, non-judgmental, and validating.`

  // 1. Direct Groq AI fallback
  if (DIRECT_GROQ_KEY) {
    for (const modelCandidate of CONV_GROQ_MODELS) {
      try {
        const directRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DIRECT_GROQ_KEY}`,
          },
          body: JSON.stringify({
            model: modelCandidate,
            messages: [
              { role: 'system', content: counsellorPrompt },
              ...history.map(t => ({ role: (t.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant', content: t.content })),
              { role: 'user', content: userMessage }
            ],
            max_tokens: 450,
            temperature: 0.6,
          }),
        })
        if (directRes.ok) {
          const d = await directRes.json()
          const text = d?.choices?.[0]?.message?.content?.trim()
          if (text) return text
        }
      } catch (directErr) {
        console.warn(`Direct Groq fallback failed for ${modelCandidate}:`, directErr)
      }
    }
  }

  // 2. Direct OpenRouter AI fallback with candidate models
  for (const modelCandidate of CONV_CANDIDATE_MODELS) {
    try {
      const directRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DIRECT_OPENROUTER_KEY}`,
        },
        body: JSON.stringify({
          model: modelCandidate,
          messages: [
            {
              role: 'system',
              content: counsellorPrompt,
            },
            ...history.map(t => ({ role: (t.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant', content: t.content })),
            { role: 'user', content: userMessage }
          ],
          max_tokens: 400,
          temperature: 0.6,
        }),
      })
      if (directRes.ok) {
        const d = await directRes.json()
        const text = d?.choices?.[0]?.message?.content?.trim()
        if (text) return text
      }
    } catch (directErr) {
      console.warn(`Direct OpenRouter fallback failed for ${modelCandidate}:`, directErr)
    }
  }

  return localCounsellorFallback(userMessage)
}

// ── Local fallbacks ────────────────────────────────────────────────────────

function localConversationFallback(
  userMessage: string,
  history: ConversationTurn[],
  turnCount: number
): ConversationResponse {
  const isSilence = userMessage === '[SILENCE]'

  if (isSilence) {
    return {
      reply:
        "I'm here and listening. Please take your time — whenever you're ready, feel free to share.",
      is_complete: false,
    }
  }

  const userTurns = history.filter((t) => t.role === 'user').length

  const followUps = [
    "Thank you for sharing that with me. How has this situation been affecting your daily life — your sleep, work, or daily routine?",
    "I hear you. Have you experienced any threats, discrimination, or intimidation because of this situation or your identity?",
    "Your feelings make complete sense. How are you feeling emotionally right now — scared, angry, exhausted, or something else?",
    "Do you have people around you — family, friends, or community — who are supporting you, or do you feel largely alone in facing this?",
    "I want to ask directly — are you or your family worried about immediate physical safety right now?",
  ]

  // Enough turns — complete assessment with local evaluation
  if (userTurns >= 4 || turnCount >= 5) {
    const allText = [
      ...history.filter((t) => t.role === 'user').map((t) => t.content),
      userMessage,
    ].join(' ')

    const fullAcoustics: AcousticFeatures = {
      rmsLevel: 0.4,
      pitchVariation: false,
      speakingRate: 120,
      pauseCount: 1,
      totalSilenceSeconds: 0,
      hesitationScore: 0,
      voiceIntensity: 'normal',
    }

    const localResult = assessmentEngine.evaluateLocal(allText, {}, fullAcoustics)

    return {
      reply:
        "Thank you so much for trusting me with this. I've listened carefully to everything you've shared. I'm now going to connect you with a dedicated support counsellor who can provide the right guidance for your situation.",
      is_complete: true,
      assessment_result: {
        distress_level: localResult.distress_level,
        urgency: localResult.urgency,
        has_safety_concern: localResult.has_safety_concern,
        support_recommended: localResult.support_recommended,
        content_indicators: localResult.content_indicators,
        summary: 'Assessment based on what you shared during our conversation.',
      },
    }
  }

  const reply = followUps[Math.min(userTurns, followUps.length - 1)]
  return { reply, is_complete: false }
}

function localCounsellorFallback(userText: string): string {
  const text = userText.toLowerCase()

  if (text.includes('kill') || text.includes('suicide') || text.includes('jaan') || text.includes('marne'))
    return EMERGENCY_REPLY

  if (text.includes('police') || text.includes('fir') || text.includes('complaint') || text.includes('thana'))
    return "I hear you. Under the PoA Act, you are entitled to free legal aid, a Zero-FIR, and a dedicated Nodal Officer to oversee your grievance. Would you like guidance on the next step?"

  if (text.includes('caste') || text.includes('dalit') || text.includes('boycott') || text.includes('gaali'))
    return "No one deserves to be subjected to discrimination or verbal abuse. Such actions are serious violations under the law. We are here to ensure your dignity and safety are protected."

  if (
    text.includes('afraid') ||
    text.includes('scared') ||
    text.includes('threat') ||
    text.includes('darr') ||
    text.includes('dhamki')
  )
    return "It's completely understandable to feel scared after what you've experienced. You don't have to carry this alone — our team and the law are on your side. Are you currently in a safe location?"

  if (text.includes('sleep') || text.includes('neend') || text.includes('stress') || text.includes('tired'))
    return "Trauma and ongoing stress can deeply affect sleep and daily energy. Please give yourself permission to rest. Would you like to try a brief grounding exercise, or would you prefer to talk more?"

  return "Thank you for sharing that with me. I'm listening attentively and without judgment. What kind of support would feel most helpful for you right now?"
}
