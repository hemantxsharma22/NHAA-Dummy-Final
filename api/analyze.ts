import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assessmentService } from '../server/assessmentService'

process.env.GROQ_API_KEY = (process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '').trim()
process.env.OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.statusCode = 200
    return res.end()
  }
  if (req.method !== 'POST') {
    res.statusCode = 405
    return res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }))
  }

  try {
    const { fullTranscript = '', answers = {}, acoustics = {} } = (req.body || {}) as any
    const normalisedAnswers: Record<string, { answer: string }> = {}
    if (answers && typeof answers === 'object') {
      Object.entries(answers as Record<string, string>).forEach(([k, v]) => {
        normalisedAnswers[k] = { answer: typeof v === 'string' ? v : '' }
      })
    }
    const combinedText =
      (fullTranscript || '') + ' ' + Object.values(normalisedAnswers).map((r) => r.answer).join(' ')

    let result = {
      distress_level: 'LOW',
      content_indicators: [] as string[],
      vocal_signals: { elevated_pitch: false, speech_rate_anomalous: false, tremor_detected: false },
      urgency: 'low',
      support_recommended: false,
      has_safety_concern: false,
    }

    try {
      result = await assessmentService.evaluateResponses(
        { __combined: { answer: combinedText } },
        acoustics,
      )
    } catch (e) {
      console.warn('evaluateResponses error:', e)
    }

    const payload = {
      distress_level: result.distress_level,
      content_indicators: result.content_indicators,
      vocal_signals: result.vocal_signals,
      urgency: result.urgency,
      support_recommended: result.support_recommended,
      has_safety_concern: result.has_safety_concern,
    }

    res.statusCode = 200
    return res.end(JSON.stringify(payload))
  } catch (err: any) {
    res.statusCode = 500
    return res.end(JSON.stringify({ error: 'ANALYZE_FAILED', message: err?.message }))
  }
}
