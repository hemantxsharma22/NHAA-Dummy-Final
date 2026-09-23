// ConversationalAssessment.tsx
// Unified AI-driven assessment + counsellor chat in one seamless interface.
// Phase 1 (assessment): AI asks adaptive questions, evaluates responses.
// Phase 2 (counsellor): Same UI, AI acts as empathetic trauma counsellor.

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Mic,
  MicOff,
  Send,
  PhoneCall,
  Shield,
  CheckCircle2,
  Brain,
  AlertTriangle,
  Loader2,
  Globe,
  ArrowLeft,
} from 'lucide-react'
import { audioEngine, type SpeechStatus } from '../../services/audioEngine'
import { FormattedMessage } from '../common/FormattedMessage'
import {
  sendConversationMessage,
  sendCounsellorMessage,
  type ConversationTurn,
  type AssessmentResult,
} from '../../services/conversationService'

// ── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'ai' | 'user' | 'system'
  content: string
  timestamp: number
  assessmentData?: AssessmentResult & { counsellorId: string }
}

interface ConversationalAssessmentProps {
  anonymousId: string
  sessionId: string
  mode: 'voice' | 'text'
  onBack: () => void
}

// ── Constants ──────────────────────────────────────────────────────────────

const OPENING_MESSAGE = (_id?: string): ChatMessage => ({
  id: 'opening',
  role: 'ai',
  content:
    'Namaste! I am NHAA AI Support. This conversation is completely confidential and anonymous — nothing you share here can be traced back to you.\n\nPlease tell me — what has been troubling you recently? You can speak or type freely in English, Hindi, or Hinglish.',
  timestamp: Date.now(),
})

const SILENCE_PROMPTS: Record<string, string> = {
  ENGLISH: "I'm here and listening. Please take your time — whenever you're ready, feel free to share.",
  HINDI: 'Kuch bolein — main yahan hoon aur sun raha hoon. Koi jaldi nahi.',
  HINGLISH: 'Main yahan hoon. Jab ready feel karein, aap bol sakte hain ya type kar sakte hain.',
  MIXED: "I'm here / Main yahan hoon. Aaram se bolein.",
}

const DISTRESS_STYLE: Record<string, { badge: string; text: string; label: string }> = {
  LOW: {
    badge: 'bg-emerald-100 border-emerald-300 text-emerald-800',
    text: 'text-emerald-700',
    label: '● LOW — Mild concern',
  },
  MEDIUM: {
    badge: 'bg-amber-100 border-amber-300 text-amber-800',
    text: 'text-amber-700',
    label: '● MEDIUM — Moderate distress',
  },
  HIGH: {
    badge: 'bg-red-100 border-red-300 text-red-800',
    text: 'text-red-700',
    label: '⚠ HIGH — Urgent support needed',
  },
}

// ── Component ──────────────────────────────────────────────────────────────

export const ConversationalAssessment: React.FC<ConversationalAssessmentProps> = ({
  anonymousId,
  sessionId,
  mode: initialInputMode,
  onBack,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([OPENING_MESSAGE(anonymousId)])
  const [chatMode, setChatMode] = useState<'assessment' | 'counsellor'>('assessment')
  const [inputText, setInputText] = useState('')
  const [isAIThinking, setIsAIThinking] = useState(false)

  // Voice state
  const [voiceEnabled, setVoiceEnabled] = useState(initialInputMode === 'voice')
  const [isRecording, setIsRecording] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>('idle')
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [speechLang, setSpeechLang] = useState<'en-IN' | 'hi-IN'>('en-IN')

  // Assessment state
  const [turnCount, setTurnCount] = useState(0)
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null)
  const [detectedLanguage, setDetectedLanguage] = useState('ENGLISH')
  const [showSilenceHint, setShowSilenceHint] = useState(false)

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null)
  const autoSendTimer = useRef<number | null>(null)
  const prevTranscript = useRef('')
  const conversationHistory = useRef<ConversationTurn[]>([
    { role: 'ai', content: OPENING_MESSAGE(anonymousId).content },
  ])
  const acousticsRef = useRef({
    speakingRate: 120,
    pauseCount: 0,
    pitchVariation: false,
    voiceIntensity: 'normal' as 'normal' | 'low' | 'elevated' | 'tremor',
  })
  const isThinkingRef = useRef(false)

  // ── Scroll to bottom ──────────────────────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isAIThinking, showSilenceHint])

  // ── Voice init ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (initialInputMode === 'voice') {
      startVoiceRecording()
    }
    return () => {
      if (autoSendTimer.current) clearTimeout(autoSendTimer.current)
      audioEngine.cleanup()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-send on transcript stability (2.5 s of no new speech) ──────────

  useEffect(() => {
    if (!voiceEnabled || !currentTranscript || currentTranscript === prevTranscript.current) return
    prevTranscript.current = currentTranscript

    if (autoSendTimer.current) clearTimeout(autoSendTimer.current)
    autoSendTimer.current = window.setTimeout(() => {
      if (currentTranscript.trim().length > 2 && !isThinkingRef.current) {
        const text = currentTranscript.trim()
        setCurrentTranscript('')
        prevTranscript.current = ''
        handleSendMessage(text)
      }
    }, 2500)
  }, [currentTranscript]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voice helpers ──────────────────────────────────────────────────────

  const startVoiceRecording = async () => {
    try {
      const granted = await audioEngine.requestMicrophone()
      if (!granted) {
        setSpeechStatus('error')
        setVoiceEnabled(false)
        return
      }
      audioEngine.setRecognitionLanguage(speechLang)
      audioEngine.startRecording(
        (text) => setCurrentTranscript(text),
        (level) => setAudioLevel(level),
        (status) => setSpeechStatus(status),
        handleExtendedSilence
      )
      setIsRecording(true)
      setSpeechStatus('listening')
    } catch {
      setSpeechStatus('error')
      setVoiceEnabled(false)
    }
  }

  const stopVoiceRecording = () => {
    const { acousticFeatures } = audioEngine.stopRecording()
    acousticsRef.current = {
      speakingRate: acousticFeatures.speakingRate,
      pauseCount: acousticFeatures.pauseCount,
      pitchVariation: acousticFeatures.pitchVariation,
      voiceIntensity: acousticFeatures.voiceIntensity,
    }
    setIsRecording(false)
    setSpeechStatus('idle')
    setAudioLevel(0)
  }

  const handleExtendedSilence = useCallback(() => {
    if (isThinkingRef.current) return
    setShowSilenceHint(true)
    setTimeout(() => setShowSilenceHint(false), 6000)

    // Only fire silence message during assessment (not counsellor chat)
    if (chatMode === 'assessment') {
      sendConversationMessage('[SILENCE]', conversationHistory.current, sessionId, turnCount)
        .then((response) => {
          if (response.reply) {
            appendAIMessage(response.reply, response.detected_language)
          }
        })
        .catch(() => {})
    }
  }, [chatMode, sessionId, turnCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Message helpers ────────────────────────────────────────────────────

  const stripAssessmentBlock = (text: string) =>
    text
      .replace(/\[ASSESSMENT_COMPLETE\][\s\S]*?(\[\/ASSESSMENT_COMPLETE\]|$)/g, '')
      .replace(/\[\/ASSESSMENT_COMPLETE\]/g, '')
      .trim()

  const appendAIMessage = (content: string, lang?: string) => {
    if (lang) setDetectedLanguage(lang)
    const cleaned = stripAssessmentBlock(content)
    if (!cleaned) return
    const msg: ChatMessage = { id: `ai-${Date.now()}`, role: 'ai', content: cleaned, timestamp: Date.now() }
    setMessages((prev) => [...prev, msg])
    conversationHistory.current.push({ role: 'ai', content: cleaned })
  }

  const appendUserMessage = (content: string) => {
    const msg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content, timestamp: Date.now() }
    setMessages((prev) => [...prev, msg])
    conversationHistory.current.push({ role: 'user', content })
  }

  // ── Core send ─────────────────────────────────────────────────────────

  const handleSendMessage = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isThinkingRef.current) return

    isThinkingRef.current = true
    setIsAIThinking(true)

    appendUserMessage(trimmed)
    setInputText('')

    if (autoSendTimer.current) {
      clearTimeout(autoSendTimer.current)
      autoSendTimer.current = null
    }
    if (voiceEnabled && isRecording) {
      audioEngine.resetQuestionTranscript()
    }

    try {
      if (chatMode === 'assessment') {
        const newTurnCount = turnCount + 1
        setTurnCount(newTurnCount)

        // Pass history excluding the message we just appended
        const historyForSend = conversationHistory.current.slice(0, -1)

        const response = await sendConversationMessage(
          trimmed,
          historyForSend,
          sessionId,
          newTurnCount,
          acousticsRef.current
        )

        if (response.detected_language) setDetectedLanguage(response.detected_language)

        appendAIMessage(response.reply, response.detected_language)

        if (response.is_complete && response.assessment_result) {
          setAssessmentResult(response.assessment_result)
          const counsellorId =
            response.assessment_result.distress_level === 'HIGH' ? 'C-108 (Priority)' : 'C-104'

          // Insert result card after a brief delay
          setTimeout(() => {
            const card: ChatMessage = {
              id: `system-${Date.now()}`,
              role: 'system',
              content: '',
              timestamp: Date.now(),
              assessmentData: { ...response.assessment_result!, counsellorId },
            }
            setMessages((prev) => [...prev, card])
          }, 600)
        }
      } else {
        // Counsellor chat mode — use separate endpoint
        const historyForSend = conversationHistory.current.slice(0, -1)
        const reply = await sendCounsellorMessage(trimmed, historyForSend)
        appendAIMessage(reply)
      }
    } catch {
      appendAIMessage(
        "I'm sorry, I encountered a connection issue. Please try again in a moment."
      )
    } finally {
      isThinkingRef.current = false
      setIsAIThinking(false)
    }
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (voiceEnabled && currentTranscript.trim()) {
      if (autoSendTimer.current) clearTimeout(autoSendTimer.current)
      const text = currentTranscript.trim()
      setCurrentTranscript('')
      prevTranscript.current = ''
      handleSendMessage(text)
    } else if (!voiceEnabled && inputText.trim()) {
      handleSendMessage(inputText)
    }
  }

  // ── Counsellor mode transition ─────────────────────────────────────────

  const handleStartCounsellorMode = () => {
    const result = assessmentResult
    const counsellorId = result?.distress_level === 'HIGH' ? 'C-108 (Priority)' : 'C-104'
    const greeting =
      result?.distress_level === 'HIGH'
        ? `Hello. I am Counsellor ${counsellorId}. I have reviewed your assessment and I understand you are going through a very difficult time. I am here for you — please share whatever is on your mind.`
        : `Hello. I am Counsellor ${counsellorId}. I have read what you shared and I am here to support you without any judgment. How are you feeling right now?`

    conversationHistory.current = []
    setChatMode('counsellor')
    appendAIMessage(greeting)
  }

  // ── Voice toggle ──────────────────────────────────────────────────────

  const toggleVoice = async () => {
    if (voiceEnabled) {
      stopVoiceRecording()
      setVoiceEnabled(false)
      setCurrentTranscript('')
    } else {
      setVoiceEnabled(true)
      await startVoiceRecording()
    }
  }

  const toggleSpeechLang = () => {
    const next = speechLang === 'en-IN' ? 'hi-IN' : 'en-IN'
    setSpeechLang(next)
    audioEngine.setRecognitionLanguage(next)
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const counsellorLabel =
    assessmentResult?.distress_level === 'HIGH' ? 'C-108 (Priority)' : 'C-104'

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden border border-slate-200 shadow-lg bg-white"
      style={{ height: 'calc(100vh - 240px)', minHeight: '520px' }}
    >
      {/* ── Header ── */}
      <div
        className={`px-4 py-3 flex items-center justify-between flex-shrink-0 ${
          chatMode === 'assessment' ? 'bg-[#00274d]' : 'bg-[#0a3320]'
        } text-white`}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            title="Back to start"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-white" />
          </button>

          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            chatMode === 'assessment' ? 'bg-blue-400/20' : 'bg-emerald-400/20'
          }`}>
            {chatMode === 'assessment' ? (
              <Brain className="w-4 h-4 text-blue-200" />
            ) : (
              <Shield className="w-4 h-4 text-emerald-200" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold truncate">
                {chatMode === 'assessment' ? 'NHAA AI Assessment' : `Counsellor ${counsellorLabel}`}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                chatMode === 'assessment'
                  ? 'bg-blue-400/20 text-blue-200'
                  : 'bg-emerald-400/20 text-emerald-200'
              }`}>
                {chatMode === 'assessment' ? 'Assessment' : 'Support Chat'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping flex-shrink-0" />
              <span className="text-[10px] text-slate-400 font-mono truncate">
                ID: {anonymousId} · Encrypted
              </span>
            </div>
          </div>
        </div>

        <a
          href="tel:14566"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold transition-colors flex-shrink-0"
          title="Emergency helpline"
        >
          <PhoneCall className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">14566</span>
        </a>
      </div>

      {/* ── Chat Area ── */}
      <div className="flex-1 overflow-y-auto bg-slate-50/70 px-4 py-4 space-y-4">
        {/* Privacy notice */}
        <div className="text-center">
          <span className="text-[11px] bg-white border border-slate-200 text-slate-500 px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 shadow-sm">
            <Shield className="w-3 h-3 text-blue-600 flex-shrink-0" />
            Your identity is fully protected. Share only what you feel comfortable with.
          </span>
        </div>

        {messages.map((msg) => {
          /* ── Assessment result card ── */
          if (msg.role === 'system' && msg.assessmentData) {
            const ad = msg.assessmentData
            const style = DISTRESS_STYLE[ad.distress_level] ?? DISTRESS_STYLE.MEDIUM
            return (
              <div key={msg.id} className="flex justify-center py-2">
                <div className="bg-white border-2 border-slate-200 rounded-2xl p-5 shadow-md max-w-sm w-full space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <span className="font-bold text-slate-800 text-sm">Assessment Completed</span>
                  </div>

                  <div className={`text-xs font-bold px-3 py-1.5 rounded-full border inline-block ${style.badge}`}>
                    {style.label}
                  </div>

                  {ad.has_safety_concern && (
                    <div className="flex items-center gap-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      Safety concern detected. Emergency line: <strong>14566</strong>
                    </div>
                  )}

                  {ad.summary && (
                    <p className="text-xs text-slate-600 leading-relaxed italic">"{ad.summary}"</p>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>Counsellor assigned</span>
                    <strong className="font-mono">{ad.counsellorId}</strong>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartCounsellorMode}
                    className="w-full py-2.5 bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Continue with Counsellor →
                  </button>
                </div>
              </div>
            )
          }

          /* ── Regular AI / User messages ── */
          const isUser = msg.role === 'user'
          return (
            <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 px-1">
                {isUser
                  ? 'You'
                  : chatMode === 'assessment'
                  ? 'NHAA AI'
                  : `Counsellor ${counsellorLabel}`}
              </span>
              <div
                className={`max-w-[88%] sm:max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-[#003366] text-white rounded-tr-sm'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                }`}
              >
                <FormattedMessage text={msg.content} isUser={isUser} />
                <span
                  className={`block text-[10px] mt-1.5 text-right ${
                    isUser ? 'text-blue-200' : 'text-slate-400'
                  }`}
                >
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            </div>
          )
        })}

        {/* AI Typing Indicator */}
        {isAIThinking && (
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 px-1">
              {chatMode === 'assessment' ? 'NHAA AI' : `Counsellor ${counsellorLabel}`}
            </span>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 shadow-sm">
              <span className="flex gap-1 items-center">
                <span
                  className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: '160ms' }}
                />
                <span
                  className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: '320ms' }}
                />
              </span>
              <span className="text-[11px] text-slate-400 ml-1">
                {chatMode === 'assessment' ? 'Thinking...' : 'Counsellor is typing...'}
              </span>
            </div>
          </div>
        )}

        {/* Silence Hint Banner */}
        {showSilenceHint && voiceEnabled && (
          <div className="flex justify-center">
            <span className="text-[11px] bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded-full animate-pulse inline-flex items-center gap-2">
              🔇 {SILENCE_PROMPTS[detectedLanguage] ?? SILENCE_PROMPTS.ENGLISH}
            </span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ── Voice Level Bar ── */}
      {voiceEnabled && isRecording && (
        <div className="bg-white border-t border-slate-100 px-4 py-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider flex items-center gap-1.5 flex-shrink-0">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
              Live
            </span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-75"
                style={{ width: `${Math.round(audioLevel * 100)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={toggleSpeechLang}
              className="text-[10px] text-slate-500 hover:text-slate-700 flex items-center gap-1 flex-shrink-0 transition-colors"
              title="Toggle recognition language"
            >
              <Globe className="w-3 h-3" />
              {speechLang === 'en-IN' ? 'EN' : 'HI'}
            </button>
          </div>
          {currentTranscript && (
            <p className="text-[11px] text-slate-500 italic mt-1 truncate">
              &ldquo;{currentTranscript}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* ── Input Bar ── */}
      <form
        onSubmit={handleFormSubmit}
        className="bg-white border-t border-slate-200 p-3 flex items-center gap-2 flex-shrink-0"
      >
        {/* Mic Toggle */}
        <button
          type="button"
          onClick={toggleVoice}
          title={voiceEnabled ? 'Switch to text input' : 'Switch to voice input'}
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
            voiceEnabled && isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg ring-4 ring-red-200'
              : voiceEnabled
              ? 'bg-blue-100 hover:bg-blue-200 text-blue-700'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
          }`}
        >
          {voiceEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>

        {/* Text / Transcript Input */}
        <input
          type="text"
          value={voiceEnabled ? currentTranscript : inputText}
          onChange={(e) => !voiceEnabled && setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleFormSubmit(e as any)
            }
          }}
          readOnly={voiceEnabled}
          placeholder={
            voiceEnabled
              ? speechStatus === 'capturing'
                ? '🎤 Capturing your voice...'
                : speechStatus === 'listening'
                ? '🎤 Listening — speak now...'
                : '🎙 Speak or tap mic again to toggle'
              : chatMode === 'assessment'
              ? 'Type your response...'
              : 'Type a message...'
          }
          className={`flex-1 text-sm rounded-xl px-4 py-2.5 border focus:outline-none focus:ring-2 focus:ring-[#003366] transition-colors ${
            voiceEnabled
              ? 'bg-slate-50 border-slate-200 text-slate-500 italic cursor-default'
              : 'bg-white border-slate-300 text-slate-800'
          }`}
        />

        {/* Send Button */}
        <button
          type="submit"
          disabled={
            isAIThinking ||
            (voiceEnabled && !currentTranscript.trim()) ||
            (!voiceEnabled && !inputText.trim())
          }
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#003366] hover:bg-[#002244] disabled:bg-slate-200 disabled:cursor-not-allowed text-white transition-colors flex-shrink-0"
          title="Send message"
        >
          {isAIThinking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>
    </div>
  )
}
