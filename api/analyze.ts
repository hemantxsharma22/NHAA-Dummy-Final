import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assessmentService } from '../server/assessmentService'

process.env.OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })

  const { fullTranscript = '', answers = {}, acoustics = {} } = req.body || {}

  const normalisedAnswers: Record<string, { answer: string }> = {}
  if (answers && typeof answers === 'object') {
    Object.entries(answers as Record<string, string>).forEach(([k, v]) => {
      normalisedAnswers[k] = { answer: typeof v === 'string' ? v : '' }
    })
  }

  const combinedText = (fullTranscript || '') + ' ' + Object.values(normalisedAnswers).map((r) => r.answer).join(' ')

  const result = await assessmentService.evaluateResponses(
    { __combined: { answer: combinedText } },
    acoustics,
  )

  return res.json({
    distress_level: result.distress_level,
    content_indicators: result.content_indicators,
    vocal_signals: result.vocal_signals,
    urgency: result.urgency,
    support_recommended: result.support_recommended,
    has_safety_concern: result.has_safety_concern,
  })
}
