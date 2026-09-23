import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  const hasGroqKey = Boolean(process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY)
  const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY)
  const payload = {
    status: 'ok',
    service: 'NHAA Stress & Trauma Assessment Serverless Backend',
    has_groq_key: hasGroqKey,
    groq_model: process.env.GROQ_MODEL || process.env.VITE_GROQ_MODEL || 'openai/gpt-oss-120b',
    has_openrouter_key: hasOpenRouterKey,
    active_provider: hasGroqKey ? 'groq' : (hasOpenRouterKey ? 'openrouter' : 'heuristic'),
    model: hasGroqKey
      ? (process.env.GROQ_MODEL || 'openai/gpt-oss-120b')
      : (process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'),
  }

  if (typeof (res as any).status === 'function' && typeof (res as any).json === 'function') {
    return (res as any).status(200).json(payload)
  }
  res.statusCode = 200
  return res.end(JSON.stringify(payload))
}
