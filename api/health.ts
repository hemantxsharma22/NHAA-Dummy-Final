import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const hasGroqKey = Boolean(process.env.GROQ_API_KEY)
  const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY)
  return res.json({
    status: 'ok',
    service: 'NHAA Stress & Trauma Assessment Serverless Backend',
    has_groq_key: hasGroqKey,
    groq_model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    has_openrouter_key: hasOpenRouterKey,
    active_provider: hasGroqKey ? 'groq' : (hasOpenRouterKey ? 'openrouter' : 'heuristic'),
    model: hasGroqKey
      ? (process.env.GROQ_MODEL || 'openai/gpt-oss-120b')
      : (process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'),
  })
}
