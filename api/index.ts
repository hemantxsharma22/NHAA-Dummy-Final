import type { VercelRequest, VercelResponse } from '@vercel/node'
import app from '../server/index'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const actualUrl =
    (req.headers['x-matched-path'] as string) ||
    (req.headers['x-vercel-matched-path'] as string) ||
    (req.headers['x-forwarded-uri'] as string) ||
    req.originalUrl

  if (
    actualUrl &&
    typeof actualUrl === 'string' &&
    (req.url === '/api' ||
      req.url === '/api/' ||
      req.url === '/api/index' ||
      req.url.startsWith('/api/index?') ||
      req.url.startsWith('/api/index/'))
  ) {
    req.url = actualUrl
  }

  return (app as any)(req, res)
}
