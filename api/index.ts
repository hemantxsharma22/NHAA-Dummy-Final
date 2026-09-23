import type { VercelRequest, VercelResponse } from '@vercel/node'
import app from '../server/index.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const actualUrl =
    (req.headers['x-matched-path'] as string) ||
    (req.headers['x-vercel-matched-path'] as string) ||
    (req.headers['x-forwarded-uri'] as string) ||
    (req as any).originalUrl

  const currentUrl = req.url || ''
  if (
    actualUrl &&
    typeof actualUrl === 'string' &&
    (currentUrl === '/api' ||
      currentUrl === '/api/' ||
      currentUrl === '/api/index' ||
      currentUrl.startsWith('/api/index?') ||
      currentUrl.startsWith('/api/index/'))
  ) {
    req.url = actualUrl
  }

  return (app as any)(req, res)
}
