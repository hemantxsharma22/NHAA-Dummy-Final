import React, { useState, useRef, useEffect } from "react";
import { getApiBaseUrl } from "../config/api";
import {
  X,
  Send,
  Sparkles,
  Bot,
  User,
  Loader2,
  Info,
} from "lucide-react";
import { FormattedMessage } from "../../components/common/FormattedMessage";
import type { CaseRecord } from "../data/caseData";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  isError?: boolean;
}

interface ChatbotPanelProps {
  currentCase?: CaseRecord | null;
}

export function ChatbotPanel({ currentCase }: ChatbotPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-1",
      sender: "assistant",
      text: "Namaste! I am your SAATHI-AI Assistant. How can I help you today? Ask me any question about helpline support, safety guidance, or platform features.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  // In-place container auto-scroll (avoids full page scroll jumping)
  useEffect(() => {
    if (isOpen && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const caseContext = currentCase
      ? {
          case_id: currentCase.id,
          case_number: currentCase.caseNumber,
          district: currentCase.district,
          svi_score: currentCase.sviScore,
          svi_label: currentCase.statusLabel,
          case_brief: currentCase.caseBrief,
          detected_keywords: currentCase.detectedKeywords,
          transcript_summary: currentCase.transcript
            ?.slice(-3)
            .map((t) => `${t.speaker}: ${t.text}`)
            .join("\n"),
          engine2_precedent: currentCase.historicalMatch
            ? `${currentCase.historicalMatch.caseId} (${currentCase.historicalMatch.similarityScore}% match)`
            : undefined,
        }
      : null;

    try {
      const historyPayload = messages
        .filter((m) => !m.isError)
        .map((m) => ({ sender: m.sender, text: m.text }));

      const res = await fetch(`${getApiBaseUrl()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_text: userText,
          message: userText,
          history: historyPayload,
          case_context: caseContext,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data = await res.json();
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: data.reply || (data.counsellor_message && data.counsellor_message.text) || "No response received.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error("Chat error:", err);
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        sender: "assistant",
        text: "Could not reach assistant backend. Please ensure the server is active.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-full bg-[#1F2430] text-white shadow-lg hover:bg-[#2B3242] transition-all duration-200 border border-[#3A4254] cursor-pointer"
        title="Toggle Assistant"
      >
        <div className="relative">
          <Bot className="w-5 h-5 text-[#0E7C7B]" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#0E7C7B] animate-pulse" />
        </div>
        <span className="text-xs font-semibold tracking-wide">Assistant</span>
      </button>

      {/* Collapsible Chat Window */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-[340px] sm:w-[380px] h-[480px] rounded-2xl bg-[#FFFFFF] border border-[#E8EAEE] shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="p-4 bg-[#1F2430] text-white flex items-center justify-between border-b border-[#2D3546]">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-[#2D3546] text-[#0E7C7B]">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold tracking-wide">SAATHI-AI Assistant</h3>
                <p className="text-[10px] text-[#A0AEC0]">Helpline & Decision Support Assistant</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-[#A0AEC0] hover:text-white hover:bg-[#2D3546] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Context Ribbon */}
          <div className="px-4 py-2 bg-[#F8F9FA] border-b border-[#E8EAEE] flex items-center justify-between text-[11px] text-[#66707A]">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#0E7C7B]" />
              Mode:
            </span>
            <span className="text-[#0E7C7B] bg-[#F1FBFA] font-medium px-2 py-0.5 rounded border border-[#D0F2EE]">
              General Assistant Active
            </span>
          </div>

          {/* Messages Scroll Area */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FFFFFF]"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.sender === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-[#F1FBFA] border border-[#D0F2EE] flex items-center justify-center shrink-0 mt-0.5 text-[#0E7C7B]">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl p-3 text-xs leading-relaxed ${
                    m.sender === "user"
                      ? "bg-[#1F2430] text-white rounded-br-none"
                      : m.isError
                      ? "bg-[#FCEEEE] text-[#B23A3A] border border-[#F8D7D7] rounded-bl-none"
                      : "bg-[#F8F9FA] text-[#1F2430] border border-[#E8EAEE] rounded-bl-none"
                  }`}
                >
                  <FormattedMessage text={m.text} isUser={m.sender === "user"} />
                  <span
                    className={`block text-[9px] mt-1 text-right ${
                      m.sender === "user" ? "text-[#A0AEC0]" : "text-[#8A8F98]"
                    }`}
                  >
                    {m.timestamp}
                  </span>
                </div>
                {m.sender === "user" && (
                  <div className="w-6 h-6 rounded-full bg-[#E8EAEE] flex items-center justify-center shrink-0 mt-0.5 text-[#66707A]">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2.5 justify-start items-center">
                <div className="w-6 h-6 rounded-full bg-[#F1FBFA] border border-[#D0F2EE] flex items-center justify-center shrink-0 text-[#0E7C7B]">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-[#F8F9FA] border border-[#E8EAEE] rounded-xl p-2.5 flex items-center gap-2 text-xs text-[#66707A]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0E7C7B]" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input Footer */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-[#FFFFFF] border-t border-[#E8EAEE] flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message or question..."
              className="flex-1 px-3 py-2 text-xs bg-[#F8F9FA] border border-[#E8EAEE] rounded-xl text-[#1F2430] focus:outline-none focus:border-[#0E7C7B]"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2 rounded-xl bg-[#1F2430] text-white hover:bg-[#2B3242] disabled:opacity-40 transition-colors shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4 text-[#0E7C7B]" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
