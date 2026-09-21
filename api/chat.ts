import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assessmentService } from '../server/assessmentService'

process.env.GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim()
process.env.OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim()

const SAFETY_KEYWORDS = [
  'kill', 'suicide', 'die', 'murder', 'weapon', 'attack', 'bomb', 'blood',
  'jaan', 'khatra', 'marne', 'hathiyar', 'hamla', 'khoon', 'maut', 'jala',
  'kutte', 'goli', 'chaku', 'kaanp', 'jane', 'dhamki', 'maar', 'peet',
]
const EMERGENCY_REPLY =
  'Your immediate safety is our highest priority. If you or your loved ones are facing imminent physical danger right now, please reach out to local police or our toll-free 24x7 emergency helpline at 14566 immediately. We can connect you to emergency protection and an emergency nodal officer.'

function isEmergencyInput(text: string): boolean {
  const lower = text.toLowerCase()
  return SAFETY_KEYWORDS.some((k) => lower.includes(k))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
  }

  const { user_text, history = [], assessment_answers } = req.body || {}
  if (!user_text || typeof user_text !== 'string') {
    return res.status(400).json({ error: 'USER_TEXT_REQUIRED' })
  }

  if (isEmergencyInput(user_text)) {
    return res.json({ reply: EMERGENCY_REPLY, counsellor_message: { text: EMERGENCY_REPLY } })
  }

  const normalisedHistory = (history as Array<{ role?: string; content?: string }>)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))

  try {
    const reply = await assessmentService.generateCounsellorReply(normalisedHistory, user_text, assessment_answers)
    return res.json({ reply, counsellor_message: { text: reply } })
  } catch (err: any) {
    console.error('Chat error:', err)
    return res.json({
      reply: 'Main aapki baat sun raha hoon. Kripya batayein ki main aapki kis tarah se madad kar sakta hoon?',
      counsellor_message: { text: 'Main aapki baat sun raha hoon. Kripya batayein ki main aapki kis tarah se madad kar sakta hoon?' },
    })
  }
}
