import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assessmentService } from '../../server/assessmentService'

process.env.GROQ_API_KEY = (process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '').trim()
process.env.OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim()

const EMERGENCY_REPLY =
  'Your immediate safety is our highest priority. If you or your loved ones are facing imminent physical danger right now, please reach out to local police or our toll-free 24x7 emergency helpline at 14566 immediately. We can connect you to emergency protection and an emergency nodal officer.'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })

  const { user_message, history = [], turn_count = 0, acoustics } = req.body || {}
  if (!user_message || typeof user_message !== 'string') {
    return res.status(400).json({ error: 'USER_MESSAGE_REQUIRED' })
  }

  const lower = user_message.toLowerCase()
  const SAFETY_KEYWORDS_LOCAL = [
    'kill', 'suicide', 'die', 'murder', 'weapon', 'attack', 'bomb',
    'jaan', 'khatra', 'marne', 'hathiyar', 'hamla', 'khoon',
  ]
  if (user_message !== '[SILENCE]' && SAFETY_KEYWORDS_LOCAL.some(k => lower.includes(k))) {
    return res.json({
      reply: EMERGENCY_REPLY,
      is_complete: false,
      detected_language: 'ENGLISH',
    })
  }

  const normalisedHistory = (history as Array<{ role?: string; content?: string }>)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))

  const result = await assessmentService.conversationalReply(
    normalisedHistory,
    user_message,
    acoustics,
    Number(turn_count) || 0
  )

  return res.json(result)
}
