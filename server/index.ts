import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { db } from './db'
import { assessmentService, MANDATORY_QUESTIONS } from './assessmentService'
import { scoreSafetyText, safetyStatus, shutdownSidecar } from './safetyClassifier'

const __filename2 = fileURLToPath(import.meta.url)
const __dirname2 = path.dirname(__filename2)
dotenv.config({ path: path.resolve(__dirname2, '..', '.env') })

// Configure Groq API key and model (preferred provider for ultra-fast chatbot responses)
process.env.GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim()
process.env.GROQ_MODEL = (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim()

process.env.OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim()


const app = express()
const apiRouter = express.Router()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Middleware to normalize req.url for Vercel serverless environment
app.use((req, _res, next) => {
  const actualUrl =
    (req.headers['x-matched-path'] as string) ||
    (req.headers['x-vercel-matched-path'] as string) ||
    (req.headers['x-forwarded-uri'] as string) ||
    req.originalUrl

  if (actualUrl && typeof actualUrl === 'string' && (req.url === '/api' || req.url === '/api/' || req.url === '/api/index')) {
    req.url = actualUrl
  }
  next()
})

// Health Check
apiRouter.get('/health', async (_req, res) => {
  const hasGroqKey = Boolean(process.env.GROQ_API_KEY)
  const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY)
  const hasKey = hasGroqKey || hasOpenRouterKey
  const status = safetyStatus()
  res.json({
    status: 'ok',
    service: 'NHAA Stress & Trauma Assessment Backend',
    has_groq_key: hasGroqKey,
    groq_model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    has_openrouter_key: hasOpenRouterKey,
    active_provider: hasGroqKey ? 'groq' : (hasOpenRouterKey ? 'openrouter' : 'heuristic'),
    model: hasGroqKey
      ? (process.env.GROQ_MODEL || 'openai/gpt-oss-120b')
      : (process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'),
    demo_mode: process.env.DEMO_MODE === 'true' || !hasKey,
    safety_model: {
      available: status.modelAvailable,
      threshold: status.threshold,
      sidecar_url: status.sidecarUrl,
      version: status.meta?.version ?? null,
    },
  })
})

// 1. Get Questions (Trilingual definitions)
apiRouter.get('/assessment/questions', (_req, res) => {
  res.json({
    questions: MANDATORY_QUESTIONS,
    total: MANDATORY_QUESTIONS.length,
  })
})

// 2. Start New Assessment Session (New User)
apiRouter.post('/assessment/new-session', (req, res) => {
  const { language_pref = 'en', mode = 'voice', existing_anonymous_id } = req.body

  let anonymousId = existing_anonymous_id
  if (!anonymousId) {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    anonymousId = 'ST-'
    for (let i = 0; i < 6; i++) {
      anonymousId += chars.charAt(Math.floor(Math.random() * chars.length))
    }
  }

  const assessmentId = `ASM-${Math.floor(10000 + Math.random() * 90000)}`
  const record = db.createAssessment(assessmentId, anonymousId, language_pref, mode)

  res.json({
    anonymous_id: anonymousId,
    assessment_id: assessmentId,
    status: record.status,
    created_at: record.created_at,
  })
})

// 3. Returning User Lookup
const lookupAttempts: Record<string, { count: number; lastTime: number }> = {}

apiRouter.post('/assessment/returning-user', (req, res) => {
  const ip = req.ip || 'local'
  const now = Date.now()
  const record = lookupAttempts[ip] || { count: 0, lastTime: now }

  if (now - record.lastTime < 60000 && record.count > 15) {
    return res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many lookup attempts. Please wait a minute before trying again.',
    })
  }

  record.count++
  record.lastTime = now
  lookupAttempts[ip] = record

  const { anonymous_id } = req.body
  if (!anonymous_id || typeof anonymous_id !== 'string') {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      message: 'Anonymous ID is required.',
    })
  }

  const cleanId = anonymous_id.trim().toUpperCase()
  const user = db.getUser(cleanId)

  if (!user) {
    return res.status(404).json({
      error: 'ANONYMOUS_ID_NOT_FOUND',
      message: 'Anonymous ID not found. Please check the ID and try again.',
    })
  }

  const assessments = db.getUserAssessments(cleanId)
  const chatSession = db.getChatSessionForUser(cleanId)

  res.json({
    anonymous_id: cleanId,
    user_created_at: user.created_at,
    has_previous_chat: Boolean(chatSession && chatSession.messages.length > 1),
    previous_assessment: assessments[0] || null,
    counsellor_id: chatSession?.counsellor_id || 'C-104',
    chat_session: chatSession
      ? {
          session_id: chatSession.session_id,
          counsellor_id: chatSession.counsellor_id,
          messages: chatSession.messages,
        }
      : null,
  })
})

// 4. Submit Single Answer
apiRouter.post('/assessment/submit-response', (req, res) => {
  const { assessment_id, question_id, answer } = req.body
  const asm = db.getAssessment(assessment_id)
  if (!asm) {
    return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND' })
  }

  asm.responses[question_id] = {
    answer: answer || '',
    timestamp: new Date().toISOString(),
  }
  db.updateAssessment(assessment_id, { responses: asm.responses })

  res.json({ success: true, recorded_question: question_id })
})

// 5. Complete Assessment (Validates ALL mandatory questions)
apiRouter.post('/assessment/complete', async (req, res) => {
  const { assessment_id, responses, acoustics } = req.body
  const asm = db.getAssessment(assessment_id)
  if (!asm) {
    return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND' })
  }

  const validation = assessmentService.validateAllQuestionsAnswered(responses || asm.responses)
  if (!validation.valid) {
    return res.status(400).json({
      error: 'REQUIRED_QUESTION_UNANSWERED',
      question_id: validation.missingQuestionId,
      message: `Question ${validation.missingQuestionId} is required. Please provide a response before completing.`,
    })
  }

  // Run the trained Saathi safety model over the full set of answers before
  // calling the dual-stream evaluator. The model's verdict is authoritative
  // for has_safety_concern and distress_level promotion to HIGH.
  const answerTexts = Object.values(responses || asm.responses)
    .map((r) => (r && typeof r.answer === 'string' ? r.answer : ''))
    .join(' ')
  const safetyVerdict = await scoreSafetyText(answerTexts)

  const evaluation = await assessmentService.evaluateResponses(responses || asm.responses, acoustics)

  // Promote to HIGH if the safety model flagged the input, even when the
  // dual-stream evaluator didn't (e.g. very short or code-mixed answers).
  if (safetyVerdict.label === 1) {
    evaluation.has_safety_concern = true
    evaluation.distress_level = 'HIGH'
    evaluation.urgency = 'high'
    if (!evaluation.content_indicators.includes('safety_threat')) {
      evaluation.content_indicators = [...evaluation.content_indicators, 'safety_threat']
    }
  }

  const counsellorId = evaluation.distress_level === 'HIGH' ? 'C-108 (Priority)' : 'C-104'
  db.updateAssessment(assessment_id, {
    status: 'completed',
    distress_level: evaluation.distress_level,
    counsellor_assigned: counsellorId,
    completed_at: new Date().toISOString(),
  })

  const chatSession = db.getOrCreateChatSession(assessment_id, asm.anonymous_id, counsellorId)

  res.json({
    assessment_id,
    anonymous_id: asm.anonymous_id,
    distress_level: evaluation.distress_level,
    urgency: evaluation.urgency,
    support_recommended: evaluation.support_recommended,
    has_safety_concern: evaluation.has_safety_concern,
    detected_language: evaluation.detected_language,
    counsellor_id: counsellorId,
    session_id: chatSession.session_id,
    safety_verdict: {
      score: safetyVerdict.score,
      label: safetyVerdict.label_str,
      threshold: safetyVerdict.threshold,
      source: safetyVerdict.source,
    },
  })
})

// Safety detection is driven by the trained Saathi model (sklearn TF-IDF + LR
// pipeline loaded by safetyClassifier). We keep EMERGENCY_REPLY as the single
// canned response that is dispatched whenever the model labels input as
// `safety_threat`. The hardcoded English/Hinglish keyword lists from the old
// version have been removed in favour of the model; the wrapper gracefully
// falls back to a lightweight heuristic if the Python sidecar is unreachable.
const EMERGENCY_REPLY =
  'Your immediate safety is our highest priority. If you or your loved ones are facing imminent physical danger right now, please reach out to local police or our toll-free 24x7 emergency helpline at 14566 immediately. We can connect you to emergency protection and an emergency nodal officer.'

// 6. Anonymous Chat Messaging
apiRouter.post('/chat/message', async (req, res) => {
  const { session_id, user_text, history = [] } = req.body

  if (!session_id || !user_text) {
    return res.status(400).json({ error: 'SESSION_ID_AND_TEXT_REQUIRED' })
  }

  const userMsg = db.addChatMessage(session_id, 'user', user_text)
  if (!userMsg) {
    return res.status(404).json({ error: 'CHAT_SESSION_NOT_FOUND' })
  }

  let replyText: string
  let safetyVerdict: Awaited<ReturnType<typeof scoreSafetyText>> | null = null
  if (user_text === '[SILENCE]') {
    safetyVerdict = await scoreSafetyText('')
  } else {
    safetyVerdict = await scoreSafetyText(user_text)
  }
  if (safetyVerdict.label === 1) {
    replyText = EMERGENCY_REPLY
  } else {
    replyText = await assessmentService.generateCounsellorReply(history, user_text)
  }
  const counsellorMsg = db.addChatMessage(session_id, 'counsellor', replyText)

  res.json({
    user_message: userMsg,
    counsellor_message: counsellorMsg,
    safety_verdict: {
      score: safetyVerdict.score,
      label: safetyVerdict.label_str,
      threshold: safetyVerdict.threshold,
      source: safetyVerdict.source,
    },
  })
})

// 6b. Stateless LLM chat endpoint
apiRouter.post('/chat', async (req, res) => {
  const { user_text, history = [], assessment_answers } = req.body
  if (!user_text || typeof user_text !== 'string') {
    return res.status(400).json({ error: 'USER_TEXT_REQUIRED' })
  }

  const safetyVerdict = await scoreSafetyText(user_text)

  const normalisedHistory = (history as Array<{ role?: string; content?: string }>)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))

  const reply = await assessmentService.generateCounsellorReply(normalisedHistory, user_text, assessment_answers)
  res.json({
    reply,
    counsellor_message: { text: reply },
    safety_verdict: {
      score: safetyVerdict.score,
      label: safetyVerdict.label_str,
      threshold: safetyVerdict.threshold,
      source: safetyVerdict.source,
    },
  })
})

// 6c. Tailored Counsellor Suggestions from Assessment Answers
apiRouter.post('/counsellor/suggestions', async (req, res) => {
  const { answers = {}, language = 'en', distress_level = 'MEDIUM' } = req.body
  try {
    const result = await assessmentService.generateCounsellorSuggestions(answers, language, distress_level)
    res.json(result)
  } catch (err) {
    console.error('Error generating counsellor suggestions:', err)
    res.status(500).json({ error: 'FAILED_TO_GENERATE_SUGGESTIONS' })
  }
})

// 7. Standalone distress analysis
apiRouter.post('/analyze', async (req, res) => {
  const { fullTranscript = '', answers = {}, acoustics = {} } = req.body || {}

  const normalisedAnswers: Record<string, { answer: string }> = {}
  if (answers && typeof answers === 'object') {
    Object.entries(answers as Record<string, string>).forEach(([k, v]) => {
      normalisedAnswers[k] = { answer: typeof v === 'string' ? v : '' }
    })
  }

  const combinedText = (fullTranscript || '') + ' ' + Object.values(normalisedAnswers).map((r) => r.answer).join(' ')

  // Score the combined text with the trained Saathi safety model first —
  // if it crosses the threshold we mark the case as a safety threat regardless
  // of any downstream classifier output.
  const safetyVerdict = await scoreSafetyText(combinedText)

  const result = await assessmentService.evaluateResponses(
    { __combined: { answer: combinedText } },
    acoustics,
  )

  // Promote has_safety_concern if the safety model flagged the input, even if
  // the dual-stream evaluator didn't pick it up (e.g. short utterance).
  const hasSafetyConcern = result.has_safety_concern || safetyVerdict.label === 1
  const distressLevel =
    hasSafetyConcern
      ? 'HIGH'
      : result.distress_level

  res.json({
    distress_level: distressLevel,
    content_indicators: result.content_indicators,
    vocal_signals: result.vocal_signals,
    urgency: hasSafetyConcern ? 'high' : result.urgency,
    support_recommended: result.support_recommended || hasSafetyConcern,
    has_safety_concern: hasSafetyConcern,
    safety_verdict: {
      score: safetyVerdict.score,
      label: safetyVerdict.label_str,
      threshold: safetyVerdict.threshold,
      source: safetyVerdict.source,
    },
  })
})

// 8. AI-Driven Conversational Assessment
apiRouter.post('/assessment/converse', async (req, res) => {
  const { user_message, history = [], turn_count = 0, acoustics } = req.body

  if (!user_message || typeof user_message !== 'string') {
    return res.status(400).json({ error: 'USER_MESSAGE_REQUIRED' })
  }

  // Score the live user message through the trained Saathi safety model.
  // [SILENCE] tokens never trigger the emergency path.
  let safetyVerdict: Awaited<ReturnType<typeof scoreSafetyText>> | null = null
  if (user_message !== '[SILENCE]') {
    safetyVerdict = await scoreSafetyText(user_message)
    if (safetyVerdict.label === 1) {
      return res.json({
        reply: EMERGENCY_REPLY,
        is_complete: false,
        detected_language: 'ENGLISH',
        safety_verdict: {
          score: safetyVerdict.score,
          label: safetyVerdict.label_str,
          threshold: safetyVerdict.threshold,
          source: safetyVerdict.source,
        },
      })
    }
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

  res.json({
    ...result,
    safety_verdict: safetyVerdict
      ? {
          score: safetyVerdict.score,
          label: safetyVerdict.label_str,
          threshold: safetyVerdict.threshold,
          source: safetyVerdict.source,
        }
      : null,
  })
})

// Mount apiRouter on both '/api' and '/' and '/api/index' for universal routing
app.use('/api', apiRouter)
app.use('/', apiRouter)
app.use('/api/index', apiRouter)

// In standalone/Render production, serve compiled frontend
if (!process.env.VERCEL) {
  const distPath = path.resolve(__dirname2, '..', 'dist')
  app.use(express.static(distPath))
  app.use((_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })

  const HOST = process.env.HOST || '0.0.0.0'
  const server = app.listen(Number(PORT), HOST, () => {
    console.log(`NHAA Secure Backend API running on http://${HOST}:${PORT}`)
    console.log(`Groq Key: ${process.env.GROQ_API_KEY ? 'Configured (' + (process.env.GROQ_MODEL || 'openai/gpt-oss-120b') + ')' : 'Not configured'}`)
    if (process.env.OPENROUTER_API_KEY) {
      console.log(`OpenRouter Key: Configured (${process.env.OPENROUTER_MODEL || 'nex-agi/nex-n2.5-pro:free'})`)
    }

    const safetyStatusReport = safetyStatus()
    console.log(
      `Saathi Safety Model: ${safetyStatusReport.modelAvailable ? 'loaded' : 'NOT FOUND (heuristic fallback)'} ` +
        `(threshold=${safetyStatusReport.threshold}, sidecar=${safetyStatusReport.sidecarUrl})`,
    )
  })

  const shutdown = () => {
    shutdownSidecar()
    server.close(() => process.exit(0))
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

export default app
