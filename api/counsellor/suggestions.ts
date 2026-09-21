import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assessmentService } from '../../server/assessmentService'

process.env.GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim()
process.env.OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })

  const { answers = {}, language = 'en', distress_level = 'MEDIUM' } = req.body || {}
  try {
    const result = await assessmentService.generateCounsellorSuggestions(answers, language, distress_level)
    return res.json(result)
  } catch (err) {
    console.error('Error generating suggestions:', err)
    return res.status(500).json({ error: 'FAILED_TO_GENERATE_SUGGESTIONS' })
  }
}
