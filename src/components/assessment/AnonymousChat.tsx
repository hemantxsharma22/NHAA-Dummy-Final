import React, { useState, useEffect, useRef } from 'react'
import { Send, Shield, Lock, ArrowLeft, PhoneCall, Loader2 } from 'lucide-react'
import { chatService, type ChatMessage } from '../../services/chatService'
import { FormattedMessage } from '../common/FormattedMessage'

interface AnonymousChatProps {
  anonymousId: string
  counsellorId?: string
  distressLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
  sessionId?: string
  initialMessages?: ChatMessage[]
  onBackToAssessment: () => void
}

export const AnonymousChat: React.FC<AnonymousChatProps> = ({
  anonymousId,
  counsellorId = 'C-104',
  distressLevel = 'MEDIUM',
  sessionId: _sessionId = 'CHAT-DEFAULT',
  initialMessages = [],
  onBackToAssessment,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (initialMessages && initialMessages.length > 0) {
      chatService.setMessages(initialMessages)
      return initialMessages
    }
    return chatService.initConversation(anonymousId, counsellorId, distressLevel)
  })

  const [inputText, setInputText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || isTyping) return

    const userText = inputText.trim()
    setInputText('')

    setIsTyping(true)

    try {
      // Local rule-based counsellor response
      await chatService.sendMessage(userText)
      setMessages([...chatService.getMessages()])
    } catch (err) {
      console.warn('Chat error:', err)
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 py-2">
      
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToAssessment}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>← Back to Menu</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
          <Lock className="w-3.5 h-3.5 text-emerald-600" />
          <span>Anonymous ID: {anonymousId}</span>
        </div>
      </div>

      {/* Main Chat Container matching Section 11 */}
      <div className="bg-white border border-slate-300 rounded-3xl shadow-lg overflow-hidden flex flex-col h-[560px]">
        
        {/* Header */}
        <div className="bg-[#00274d] text-white p-4 sm:px-6 flex items-center justify-between border-b border-slate-700">
          <div>
            <h2 className="text-sm sm:text-base font-bold tracking-wide">
              Anonymous Support Chat
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs text-blue-200 font-mono font-bold">
                Support ID: {counsellorId}
              </span>
              <span className="text-[10px] bg-blue-900 px-2 py-0.2 rounded-full text-slate-300">
                Encrypted • {distressLevel} Support
              </span>
            </div>
          </div>

          <a
            href="tel:14566"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs"
            title="Helpline Emergency Dial"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Emergency: 14566</span>
          </a>
        </div>

        {/* Message Thread */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 bg-slate-50/60 text-xs sm:text-sm">
          
          <div className="text-center my-2">
            <span className="text-[11px] bg-slate-200/80 text-slate-600 px-3 py-1 rounded-full font-medium inline-flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-blue-700" />
              Your identity is protected. You may disclose details only if you wish.
            </span>
          </div>

          {messages.map((msg) => {
            const isMe = msg.sender === 'user'
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 px-1">
                  {isMe ? 'You' : counsellorId}
                </span>
                <div
                  className={`max-w-[85%] sm:max-w-[75%] p-3.5 rounded-2xl leading-relaxed shadow-2xs ${
                    isMe
                      ? 'bg-[#003366] text-white rounded-tr-xs'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                  }`}
                >
                  <FormattedMessage text={msg.text} isUser={isMe} />
                  <span
                    className={`block text-[9px] mt-1 text-right ${
                      isMe ? 'text-blue-200' : 'text-slate-400'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            )
          })}

          {isTyping && (
            <div className="flex flex-col items-start">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 px-1">
                {counsellorId}
              </span>
              <div className="bg-white border border-slate-200 text-slate-500 px-3.5 py-2 rounded-2xl rounded-tl-xs flex items-center gap-1.5 text-xs shadow-2xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                <span className="text-[11px] text-slate-400 ml-1">Counsellor is typing...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleSend}
          className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 text-xs sm:text-sm border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-[#003366] bg-slate-50 focus:bg-white"
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-[#003366] hover:bg-[#002244] text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <span>Send</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>

      </div>

    </div>
  )
}
