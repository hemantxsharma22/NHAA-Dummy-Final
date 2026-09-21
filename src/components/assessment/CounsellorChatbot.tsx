// CounsellorChatbot.tsx
// Dedicated Counsellor Chatbot that provides personalized suggestions tailored to the citizen's assessment answers
// Features:
// - Fetches tailored suggestions based on citizen's specific answers from /api/counsellor/suggestions
// - Summarizes citizen's assessed issues (threats, sleep loss, discrimination, etc.)
// - Displays actionable suggestion cards (Legal Protection, Sleep/Trauma Grounding, Confidential Support)
// - Interactive chat where counsellor answers follow-up questions with full awareness of assessment answers
// - Supports English, Hindi, and Hinglish with voice and text input

import React, { useState, useEffect, useRef } from 'react'
import {
  Shield,
  PhoneCall,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { audioEngine } from '../../services/audioEngine'

interface SuggestionItem {
  id: string
  category: 'legal' | 'coping' | 'medical' | 'counselling'
  title: string
  badge: string
  description: string
  action_prompt: string
}

interface CounsellorChatbotProps {
  anonymousId: string
  counsellorId: string
  distressLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  language: 'en' | 'hi' | 'hinglish'
  assessmentAnswers: Record<string, string>
  onBackToAssessment?: () => void
  onExit?: () => void
}

interface ChatMessage {
  id: string
  sender: 'counsellor' | 'user'
  text: string
  timestamp: string
  suggestions?: SuggestionItem[]
}

export const CounsellorChatbot: React.FC<CounsellorChatbotProps> = ({
  anonymousId,
  counsellorId,
  distressLevel,
  language = 'hinglish',
  assessmentAnswers,
  onBackToAssessment,
  onExit: _onExit,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isVoiceMuted, setIsVoiceMuted] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [showAnswerSummary, setShowAnswerSummary] = useState(false)
  const [identifiedIssues, setIdentifiedIssues] = useState<string[]>([])
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([])

  const chatBottomRef = useRef<HTMLDivElement>(null)

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

// ── Direct Groq & OpenRouter Fallbacks ──────────────────────────────────
const DIRECT_GROQ_KEY =
  (typeof import.meta !== 'undefined' &&
    ((import.meta as any).env?.VITE_GROQ_API_KEY || (import.meta as any).env?.GROQ_API_KEY)) ||
  ''

const CLIENT_GROQ_MODELS = [
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GROQ_MODEL) || '',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'groq/compound-mini',
  'groq/compound',
  'qwen/qwen3.8-27b',
].filter(Boolean) as string[]

async function callDirectOpenRouterSuggestions(
  answers: Record<string, string>,
  language: string,
  distressLevel: string,
  counsellorId: string
) {
  try {
    const isHindi = language.toLowerCase().includes('hi') && !language.toLowerCase().includes('hinglish')
    const isHinglish = language.toLowerCase().includes('hinglish')

    const prompt = `You are Counsellor ${counsellorId} at India's National Helpline Against Atrocities (NHAA - 14566).
A citizen just finished an assessment with distress level "${distressLevel}".
Their assessment answers are:
${JSON.stringify(answers, null, 2)}

Target Language: ${isHindi ? 'Formal Hindi (Devanagari)' : isHinglish ? 'Conversational Roman Hinglish' : 'Empathetic English'}

Generate a JSON response tailored strictly to what the citizen answered:
{
  "greeting": "Empathetic 2-sentence greeting directly acknowledging their specific answers (e.g. mentioning the threats, sleep problems, or fear they described).",
  "identified_issues": ["Specific Issue 1 derived from answers", "Specific Issue 2", "Specific Issue 3"],
  "suggestions": [
    {
      "id": "sug-1",
      "category": "legal",
      "title": "Short title",
      "badge": "Legal & Protection",
      "description": "Specific action they can take under PoA Act / NHAA protection based on the threats/slurs they mentioned.",
      "action_prompt": "Prompt user can click to ask more about this"
    },
    {
      "id": "sug-2",
      "category": "coping",
      "title": "Short title",
      "badge": "Trauma & Sleep Regulation",
      "description": "Specific somatic grounding or psychological coping advice addressing their sleep or anxiety.",
      "action_prompt": "Prompt user can click to ask about coping"
    },
    {
      "id": "sug-3",
      "category": "counselling",
      "title": "Short title",
      "badge": "Confidential Counseling",
      "description": "How 1-on-1 confidential tele-counseling can help them safely recover.",
      "action_prompt": "Prompt user can click to ask about counseling"
    }
  ],
  "recommended_prompts": [
    "Quick question 1 user might want to ask next",
    "Quick question 2",
    "Quick question 3"
  ]
}
Return only valid JSON.`

    // 1. Direct Groq suggestions if key configured
    if (DIRECT_GROQ_KEY) {
      for (const modelCandidate of CLIENT_GROQ_MODELS) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${DIRECT_GROQ_KEY}`,
            },
            body: JSON.stringify({
              model: modelCandidate,
              messages: [{ role: 'user', content: prompt }],
              response_format: { type: 'json_object' },
              temperature: 0.3,
            }),
          })
          if (res.ok) {
            const data = await res.json()
            const content = data?.choices?.[0]?.message?.content
            if (content) {
              const parsed = JSON.parse(content)
              if (parsed.greeting && parsed.suggestions && parsed.suggestions.length > 0) {
                return {
                  greeting: parsed.greeting,
                  identified_issues: parsed.identified_issues || [],
                  counsellor_id: counsellorId,
                  distress_level: distressLevel,
                  suggestions: parsed.suggestions,
                  recommended_prompts: parsed.recommended_prompts || [],
                }
              }
            }
          }
        } catch (groqErr) {
          console.warn(`Direct Groq suggestions failed for ${modelCandidate}:`, groqErr)
        }
      }
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DIRECT_OPENROUTER_KEY}`,
      },
      body: JSON.stringify({
        model: CLIENT_CANDIDATE_MODELS[0] || 'nex-agi/nex-n2.5-pro:free',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    })

    if (res.ok) {
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (content) {
        const parsed = JSON.parse(content)
        if (parsed.greeting && parsed.suggestions && parsed.suggestions.length > 0) {
          return {
            greeting: parsed.greeting,
            identified_issues: parsed.identified_issues || [],
            counsellor_id: counsellorId,
            distress_level: distressLevel,
            suggestions: parsed.suggestions,
            recommended_prompts: parsed.recommended_prompts || [],
          }
        }
      }
    }
  } catch (e) {
    console.warn('Direct OpenRouter suggestions failed:', e)
  }
  return null
}

  // ── Load Tailored Suggestions from Backend or Direct OpenRouter AI ────────
  useEffect(() => {
    let isMounted = true

    const fetchSuggestions = async () => {
      setIsLoading(true)
      let data: any = null

      try {
        const res = await fetch('/api/counsellor/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answers: assessmentAnswers,
            language,
            distress_level: distressLevel,
          }),
        })

        if (res.ok) {
          data = await res.json()
        }
      } catch (err) {
        console.warn('Backend suggestions fetch error, attempting direct AI generation:', err)
      }

      // If backend failed or was unreachable, generate live tailored suggestions with direct OpenRouter AI
      if (!data || !data.suggestions || data.suggestions.length === 0) {
        data = await callDirectOpenRouterSuggestions(assessmentAnswers, language, distressLevel, counsellorId)
      }

      if (isMounted && data && data.suggestions && data.suggestions.length > 0) {
        setIdentifiedIssues(data.identified_issues || [])
        setSuggestedPrompts(data.recommended_prompts || [])

        const welcomeMsg: ChatMessage = {
          id: 'counsellor-welcome',
          sender: 'counsellor',
          text: data.greeting,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestions: data.suggestions || [],
        }
        setMessages([welcomeMsg])

        if (!isVoiceMuted && data.greeting) {
          try {
            audioEngine.speakText(data.greeting, language)
          } catch (e) {
            console.warn('Speech error on welcome:', e)
          }
        }
      } else if (isMounted) {
        // Fallback if no AI connection
        const fallbackGreeting =
          language === 'hi'
            ? `नमस्ते। मैं काउंसलर ${counsellorId} हूँ। मैंने आपके उत्तरों की समीक्षा की है और आपकी सुरक्षा व राहत के लिए निम्नलिखित सुझाव तैयार किए हैं:`
            : language === 'hinglish'
            ? `Namaste. Main Counsellor ${counsellorId} hoon. Maine aapke assessment ke answers review kiye hain aur aapke liye targeted suggestions prepare kiye hain:`
            : `Hello. I am Counsellor ${counsellorId}. I have reviewed your assessment answers and prepared personalized suggestions for your protection and emotional coping:`

        const fallbackMsg: ChatMessage = {
          id: 'counsellor-welcome',
          sender: 'counsellor',
          text: fallbackGreeting,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestions: [
            {
              id: 'sug-1',
              category: 'legal',
              title: 'Immediate Legal Protection & SC/ST PoA Act',
              badge: 'Legal Recourse',
              description:
                'Based on the threats you noted, NHAA can assign a District Nodal Officer to coordinate Zero-FIR and police escort.',
              action_prompt: 'How can NHAA protect my family right now?',
            },
            {
              id: 'sug-2',
              category: 'coping',
              title: 'Trauma & Sleep Stabilization Protocol',
              badge: 'Psychological Relief',
              description:
                'Techniques including 5-4-3-2-1 sensory grounding and diaphragmatic breathing to stop night panics and intrusive thoughts.',
              action_prompt: 'Guide me through sleep calming exercises.',
            },
          ],
        }
        setMessages([fallbackMsg])
      }

      if (isMounted) setIsLoading(false)
    }

    fetchSuggestions()

    return () => {
      isMounted = false
      audioEngine.stopSpeaking()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

const DIRECT_OPENROUTER_KEY =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_OPENROUTER_API_KEY) || ''

const CLIENT_CANDIDATE_MODELS = [
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_OPENROUTER_MODEL) || '',
  'nex-agi/nex-n2.5-pro:free',
  'nex-agi/nex-n2.5-mini:free',
  'nvidia/nemotron-3.5-lightning:free',
  'openai/gpt-4o-mini',
].filter(Boolean) as string[]

async function callDirectOpenRouter(
  history: { role: 'user' | 'assistant'; content: string }[],
  userText: string,
  assessmentAnswers?: Record<string, string>,
  language: string = 'en'
): Promise<string | null> {
  try {
    let contextStr = ''
    if (assessmentAnswers && Object.keys(assessmentAnswers).length > 0) {
      contextStr = `\nCitizen Prior Assessment Answers:\n` +
        Object.entries(assessmentAnswers).map(([k, v]) => `- ${k}: "${v}"`).join('\n')
    }

    const counsellorPrompt = `You are Counsellor C-104, an empathetic certified counselor & supportive AI companion at India's National Helpline Against Atrocities (NHAA - 14566).
Like ChatGPT, answer all user questions accurately, engagingly, and empathetically with helpful practical guidance.
Use friendly expressive emojis (🌟, 🤝, 🛡️, ✨, 💡, 🌙, 📋, 🙏, 💬) and natural gestures throughout your response.
Target Language: ${language === 'hi' ? 'Hindi (Devanagari)' : language === 'hinglish' ? 'Conversational Roman Hinglish' : 'Empathetic English'}. Speak in the exact language/mix the user used (${language}).
If they ask a question (such as how to get security from a Nodal Officer, sleep/stress relief tips, general knowledge, or PoA Act rights), answer thoroughly with clear bullet points.
${contextStr}
Keep your tone warm, encouraging, non-judgmental, and validating. If they are in immediate danger, remind them of toll-free 14566 or 112.`

    // 1. Direct Groq chat completion if configured
    if (DIRECT_GROQ_KEY) {
      for (const modelCandidate of CLIENT_GROQ_MODELS) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${DIRECT_GROQ_KEY}`,
            },
            body: JSON.stringify({
              model: modelCandidate,
              messages: [
                { role: 'system', content: counsellorPrompt },
                ...history,
                { role: 'user', content: userText },
              ],
              max_tokens: 450,
              temperature: 0.6,
            }),
          })
          if (res.ok) {
            const data = await res.json()
            const content = data?.choices?.[0]?.message?.content?.trim()
            if (content) return content
          }
        } catch (groqErr) {
          console.warn(`Direct Groq chat failed for ${modelCandidate}:`, groqErr)
        }
      }
    }

    for (const modelCandidate of CLIENT_CANDIDATE_MODELS) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DIRECT_OPENROUTER_KEY}`,
          },
          body: JSON.stringify({
            model: modelCandidate,
            messages: [
              {
                role: 'system',
                content: counsellorPrompt,
              },
              ...history,
              { role: 'user', content: userText },
            ],
            max_tokens: 400,
            temperature: 0.6,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          const content = data?.choices?.[0]?.message?.content?.trim()
          if (content) return content
        }
      } catch (err) {
        console.warn(`Direct OpenRouter failed for ${modelCandidate}:`, err)
      }
    }
  } catch (e) {
    console.warn('Direct OpenRouter call error:', e)
  }
  return null
}

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim()
    if (!text || isSending) return

    setInputText('')
    setIsSending(true)

    // Append User Message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const history = messages.map((m) => ({
        role: (m.sender === 'counsellor' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.text,
      }))

      let replyText: string | null = null

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_text: text,
            history,
            assessment_answers: assessmentAnswers,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          replyText = data.reply || data.counsellor_message?.text
        }
      } catch (backendErr) {
        console.warn('Backend /api/chat error, using direct AI fallback:', backendErr)
      }

      // If backend was unreachable or failed, call direct OpenRouter fallback
      if (!replyText) {
        replyText = await callDirectOpenRouter(history, text, assessmentAnswers, language)
      }

      if (!replyText) {
        const lower = text.toLowerCase().trim()
        if (lower.includes('who are you') || lower.includes('kaun ho') || lower.includes('kya ho') || lower.includes('introduce')) {
          replyText = 'Namaste! 🙏 Main Counsellor C-104 hoon. Main National Helpline Against Atrocities (NHAA - 14566) ka certified psychological support counselor hoon. Main yahan aapko legal safety under SC/ST PoA Act, emergency protection, aur stress/trauma se ubharne me madad karne ke liye hoon. Aap mujhse koi bhi sawaal bejhiijhak poochh sakte hain.'
        } else if (lower === 'hi' || lower === 'hello' || lower === 'hey' || lower === 'namaste' || lower === 'pranam') {
          replyText = 'Namaste! 🙏 Main Counsellor C-104 hoon, NHAA Helpline (14566) se. Aap bilkul surakshit jagah par hain. Kripya batayein, aaj main aapki kis tarah se madad kar sakta hoon?'
        } else if (lower.includes('nodal') || lower.includes('security') || lower.includes('suraksha') || lower.includes('police')) {
          replyText = '🛡️ **Nodal Officer se Security:** Aap 14566 ya 112 par call karke turant Nodal Officer protection request kar sakte hain. District SP Office me written application dekar Zero-FIR aur police escort grant hoti hai. Hum aapke saath hain! 🤝🙏'
        } else if (lower.includes('neend') || lower.includes('sleep') || lower.includes('tension') || lower.includes('stress')) {
          replyText = '🌙✨ **Neend aur Tension ke liye:** Sone se 30-45 min pehle phone dur rakhein, 4-7-8 deep breathing karein, aur shaam ke baad chai/coffee na lein. Jo bhi baat dil me hai, yahan zaroor share karein 🌟.'
        } else {
          replyText = '🤝 Main aapki baat dhyan se sun raha hoon aur aapki suraksha hamari sarvochha prathmikta hai ✨. Kripya batayein, main is vishay me aapki kaise behtar madad kar sakta hoon? 🙏'
        }
      }

      const counsellorReply: ChatMessage = {
        id: `counsellor-${Date.now()}`,
        sender: 'counsellor',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, counsellorReply])

      if (!isVoiceMuted && replyText) {
        try {
          audioEngine.speakText(replyText, language)
        } catch (audioErr) {
          console.warn('Speech synthesis error:', audioErr)
        }
      }
    } catch (err) {
      console.error('Send message error:', err)
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'counsellor',
        text: 'Main aapki baat dhyan se sun raha hoon. Kripya batayein, main aapki aur kya madad kar sakta hoon?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsSending(false)
    }
  }

  // ── Toggle Voice Mic ─────────────────────────────────────────────────────
  const handleToggleMic = async () => {
    if (isRecording) {
      audioEngine.stopRecording()
      setIsRecording(false)
    } else {
      const granted = await audioEngine.requestMicrophone()
      if (!granted) return

      audioEngine.setRecognitionLanguage(language === 'hi' ? 'hi-IN' : 'en-IN')
      audioEngine.startRecording(
        (transcript) => {
          setInputText(transcript)
        },
        () => {},
        () => {}
      )
      setIsRecording(true)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden max-w-3xl mx-auto flex flex-col h-[750px]">
      {/* Header */}
      <div className="bg-[#0a3320] text-white px-5 py-3.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          {onBackToAssessment && (
            <button
              type="button"
              onClick={onBackToAssessment}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Back to assessment"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black tracking-tight text-white">
                Counsellor {counsellorId}
              </h2>
              <span className="text-[10px] bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-full font-bold">
                Assessment Verified
              </span>
            </div>
            <p className="text-[10px] text-emerald-200/80 font-mono">
              Anonymous ID: {anonymousId} · Confidential Session
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Voice Mute Toggle */}
          <button
            type="button"
            onClick={() => {
              if (!isVoiceMuted) audioEngine.stopSpeaking()
              setIsVoiceMuted(!isVoiceMuted)
            }}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title={isVoiceMuted ? 'Unmute counsellor voice' : 'Mute counsellor voice'}
          >
            {isVoiceMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Emergency 14566 */}
          <a
            href="tel:14566"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-xs"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>14566</span>
          </a>
        </div>
      </div>

      {/* Accordion: Citizen's Assessment Answers Summary */}
      <div className="bg-emerald-50/70 border-b border-emerald-200/80 px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-800" />
            <span className="text-xs font-bold text-emerald-950">
              Suggestions based on your 5 assessment responses
            </span>
            {identifiedIssues.length > 0 && (
              <div className="hidden sm:flex gap-1 ml-1">
                {identifiedIssues.slice(0, 2).map((iss, i) => (
                  <span
                    key={i}
                    className="text-[10px] bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-md font-semibold"
                  >
                    ✓ {iss}
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowAnswerSummary(!showAnswerSummary)}
            className="text-[11px] text-emerald-900 hover:text-emerald-950 font-bold flex items-center gap-1 cursor-pointer"
          >
            <span>{showAnswerSummary ? 'Hide My Answers' : 'View My Answers'}</span>
            {showAnswerSummary ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsible Answer History */}
        {showAnswerSummary && (
          <div className="mt-2.5 pt-2 border-t border-emerald-200/80 space-y-1.5 text-xs animate-fadeIn">
            {Object.entries(assessmentAnswers).map(([qKey, ans]) => (
              <div key={qKey} className="bg-white/80 p-2 rounded-lg border border-emerald-200 text-slate-700">
                <span className="font-bold text-emerald-900">{qKey}:</span> &ldquo;{ans}&rdquo;
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat Messages Log */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/60">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-3">
            <Loader2 className="w-8 h-8 text-emerald-700 animate-spin" />
            <p className="text-xs text-slate-600 font-semibold">
              Counsellor is reviewing your assessment responses...
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isCounsellor = msg.sender === 'counsellor'
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isCounsellor ? 'items-start' : 'items-end'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {isCounsellor ? `Counsellor ${counsellorId}` : 'You'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {msg.timestamp}
                  </span>
                </div>

                <div
                  className={`max-w-[92%] sm:max-w-[85%] rounded-3xl p-4 sm:p-5 shadow-xs leading-relaxed text-sm ${
                    isCounsellor
                      ? 'bg-white border border-slate-200 text-slate-900 rounded-tl-sm'
                      : 'bg-[#003366] text-white rounded-tr-sm'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>

                  {/* Suggestion Cards directly from Assessment */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="mt-4 space-y-3 pt-3 border-t border-slate-100">
                      <div className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Actionable Recommendations for You:</span>
                      </div>

                      <div className="grid grid-cols-1 gap-2.5">
                        {msg.suggestions.map((sug) => (
                          <div
                            key={sug.id}
                            className="bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-2 transition-all"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-xs sm:text-sm font-bold text-emerald-950">
                                {sug.title}
                              </h4>
                              <span className="text-[10px] bg-emerald-200/80 text-emerald-900 font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                                {sug.badge}
                              </span>
                            </div>

                            <p className="text-xs text-slate-700 leading-relaxed">
                              {sug.description}
                            </p>

                            <button
                              type="button"
                              onClick={() => handleSendMessage(sug.action_prompt)}
                              className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 mt-1 cursor-pointer"
                            >
                              <span>👉 {sug.action_prompt}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}

        {/* Typing indicator */}
        {isSending && (
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 px-1">
              Counsellor {counsellorId}
            </span>
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex items-center gap-2 shadow-xs">
              <span className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              <span className="text-xs text-slate-500 font-medium">Counsellor is typing...</span>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Suggested Prompt Chips */}
      {suggestedPrompts.length > 0 && (
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto flex-shrink-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex-shrink-0">
            Suggested:
          </span>
          {suggestedPrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(prompt)}
              className="text-xs whitespace-nowrap bg-white border border-slate-200 hover:border-emerald-600 text-slate-700 hover:text-emerald-900 px-3 py-1 rounded-full shadow-2xs transition-colors cursor-pointer flex-shrink-0"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Message Input Form */}
      <div className="p-3.5 bg-white border-t border-slate-200 flex items-center gap-2 flex-shrink-0">
        {/* Mic Toggle */}
        <button
          type="button"
          onClick={handleToggleMic}
          className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
            isRecording
              ? 'bg-red-500 border-red-600 text-white shadow-sm ring-2 ring-red-200 animate-pulse'
              : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
          }`}
          title={isRecording ? 'Stop recording voice' : 'Speak message'}
        >
          {isRecording ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>

        {/* Text Input */}
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSendMessage()
            }
          }}
          placeholder={
            language === 'hi'
              ? 'काउंसलर से पूछें (उदा. सुरक्षा, कानूनी मदद या मानसिक राहत)...'
              : language === 'hinglish'
              ? 'Counsellor se puchein (e.g. legal protection ya sleep panics ke baare mein)...'
              : 'Type your message or question for the counsellor...'
          }
          className="flex-1 text-sm bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 focus:bg-white focus:outline-none focus:border-[#003366] text-slate-900"
        />

        {/* Send Button */}
        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || isSending}
          className="p-2.5 bg-[#003366] hover:bg-[#002244] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl transition-colors shadow-xs flex-shrink-0 cursor-pointer disabled:cursor-not-allowed"
          title="Send message"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
