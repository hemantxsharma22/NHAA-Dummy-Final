import type { VercelRequest, VercelResponse } from '@vercel/node'

const GROQ_API_KEY = (process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '').trim()
const GROQ_MODEL = (process.env.GROQ_MODEL || process.env.VITE_GROQ_MODEL || 'openai/gpt-oss-120b').trim()

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
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.statusCode = 200
    return res.end()
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    return res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }))
  }

  const { user_text, history = [], assessment_answers } = (req.body || {}) as {
    user_text?: string
    history?: Array<{ role?: string; content?: string }>
    assessment_answers?: Record<string, string>
  }

  if (!user_text || typeof user_text !== 'string') {
    res.statusCode = 400
    return res.end(JSON.stringify({ error: 'USER_TEXT_REQUIRED' }))
  }

  if (isEmergencyInput(user_text)) {
    const data = { reply: EMERGENCY_REPLY, counsellor_message: { text: EMERGENCY_REPLY } }
    res.statusCode = 200
    return res.end(JSON.stringify(data))
  }

  let assessmentContextStr = ''
  if (assessment_answers && Object.keys(assessment_answers).length > 0) {
    assessmentContextStr =
      `\nCitizen Prior Assessment Answers:\n` +
      Object.entries(assessment_answers)
        .map(([k, v]) => `- ${k}: "${v}"`)
        .join('\n')
  }

  const counsellorPrompt = `You are Counsellor C-104, an empathetic certified counselor & supportive AI companion at India's National Helpline Against Atrocities (NHAA - 14566).
Act like a warm, supportive counselor: answer all user questions accurately, engagingly, and empathetically with helpful practical guidance.
Use friendly expressive emojis (🌟, 🤝, 🛡️, ✨, 💡, 🌙, 📋, 🙏, 💬) and natural gestures throughout your response.
Speak in the exact language/mix the citizen used (English, Hindi, or Hinglish).
If they ask a question (such as how to get security from a Nodal Officer, sleep/stress relief tips, general knowledge, or PoA Act rights), answer thoroughly with clear bullet points.
FORMATTING RULE: Do NOT use raw markdown formatting like double asterisks (**) or markdown headers (###). Write in clean, naturally formatted text with clean bullet points and numbered steps.
${assessmentContextStr}
Keep your tone warm, encouraging, non-judgmental, and validating. If they are in immediate danger, remind them of toll-free 14566 or 112.`

  const normalisedHistory = (history as Array<{ role?: string; content?: string }>)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))

  const modelsToTry = [
    GROQ_MODEL,
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'groq/compound-mini',
    'groq/compound',
    'qwen/qwen3.8-27b',
  ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i)

  let aiReply: string | null = null

  if (GROQ_API_KEY) {
    for (const modelCandidate of modelsToTry) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: modelCandidate,
            messages: [
              { role: 'system', content: counsellorPrompt },
              ...normalisedHistory,
              { role: 'user', content: user_text },
            ],
            temperature: 0.6,
            max_tokens: 500,
          }),
        })

        if (groqRes.ok) {
          const groqData = await groqRes.json()
          const content = groqData?.choices?.[0]?.message?.content?.trim()
          if (content) {
            aiReply = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
            break
          }
        }
      } catch (e) {
        console.warn(`Groq chat failed for ${modelCandidate}:`, e)
      }
    }
  }

  // Fallback if AI provider is unreachable
  if (!aiReply) {
    const lower = user_text.toLowerCase().trim()
    if (
      lower.includes('who are you') ||
      lower.includes('kaun ho') ||
      lower.includes('kya ho') ||
      lower.includes('introduce')
    ) {
      aiReply =
        'Namaste! 🙏 Main Counsellor C-104 hoon. Main National Helpline Against Atrocities (NHAA - 14566) ka certified psychological support counselor hoon. Main yahan aapko legal safety under SC/ST PoA Act, emergency protection, aur stress/trauma se ubharne me madad karne ke liye hoon. Aap mujhse koi bhi sawaal bejhiijhak poochh sakte hain.'
    } else if (
      lower === 'hi' ||
      lower === 'hello' ||
      lower === 'hey' ||
      lower === 'namaste' ||
      lower === 'pranam'
    ) {
      aiReply =
        'Namaste! 🙏 Main Counsellor C-104 hoon, NHAA Helpline (14566) se. Aap bilkul surakshit jagah par hain. Kripya batayein, aaj main aapki kis tarah se madad kar sakta hoon?'
    } else if (
      lower.includes('nodal') ||
      lower.includes('security') ||
      lower.includes('suraksha') ||
      lower.includes('police')
    ) {
      aiReply =
        '🛡️ **Nodal Officer se Security:** Aap 14566 ya 112 par call karke turant Nodal Officer protection request kar sakte hain. District SP Office me written application dekar Zero-FIR aur police escort grant hoti hai. Hum aapke saath hain! 🤝🙏'
    } else if (
      lower.includes('neend') ||
      lower.includes('sleep') ||
      lower.includes('tension') ||
      lower.includes('stress')
    ) {
      aiReply =
        '🌙✨ **Neend aur Tension ke liye:** Sone se 30-45 min pehle phone dur rakhein, 4-7-8 deep breathing karein, aur shaam ke baad chai/coffee na lein. Jo bhi baat dil me hai, yahan zaroor share karein 🌟.'
    } else {
      aiReply =
        'Main aapki baat dhyan se sun raha hoon aur samajh sakta hoon ki aap kitne kathin samay se guzar rahe hain. Kripya thoda aur vistar se batayein taaki main sahi salah de sakoon.'
    }
  }

  const resPayload = { reply: aiReply, counsellor_message: { text: aiReply } }
  res.statusCode = 200
  return res.end(JSON.stringify(resPayload))
}
