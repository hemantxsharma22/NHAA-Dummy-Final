import { X, FileText, AlertTriangle, ShieldCheck, User } from "lucide-react";
import type { TranscriptUtterance } from "../data/caseData";

interface TranscriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseNumber: string;
  district: string;
  transcript: TranscriptUtterance[];
}

const CLIENT_FALLBACK_TERMS = [
  "मारने वाला", "मारने वाली", "मारने", "मारना", "मार देंगे", "मार देगा", "मार दूंगा", "जान से मार",
  "कत्ल", "हत्या", "खून", "धमकी", "धमका", "हमला", "डर", "घबराहट", "दहशत", "खौफ", "कांप",
  "सुरक्षा", "सुरक्षा दीजिए", "सुरक्षा चाहिए", "बचाओ", "बचा लो", "मदद", "मदद करो", "खतरा",
  "चाकू", "पिस्तौल", "बंदूक", "हथियार", "अकेला", "अकेली",
  "marne wala", "marne", "marna", "maar denge", "dhamki", "darr", "dar", "ghabrahat", "katl", "khoon",
  "suraksha", "suraksha dijiye", "suraksha chahiye", "bachao", "madad", "khatra", "akela", "akeli",
  "kill", "killing", "going to kill", "threat", "threatened", "scared", "afraid", "panic", "bleeding",
  "help", "protect", "protection", "knife", "gun", "alone", "police"
];

function getUtteranceKeywords(item: TranscriptUtterance): string[] {
  if (item.flaggedKeywords && item.flaggedKeywords.length > 0) {
    return item.flaggedKeywords;
  }
  if (!item.text) return [];
  const lower = item.text.toLowerCase();
  const matched: string[] = [];
  for (const term of CLIENT_FALLBACK_TERMS) {
    if (lower.includes(term.toLowerCase())) {
      const isSub = matched.some(m => m.toLowerCase().includes(term.toLowerCase()) && m.toLowerCase() !== term.toLowerCase());
      if (!isSub) {
        for (let i = matched.length - 1; i >= 0; i--) {
          if (term.toLowerCase().includes(matched[i].toLowerCase()) && term.toLowerCase() !== matched[i].toLowerCase()) {
            matched.splice(i, 1);
          }
        }
        matched.push(term);
      }
    }
  }
  return matched;
}

export function TranscriptModal({
  isOpen,
  onClose,
  caseNumber,
  district,
  transcript,
}: TranscriptModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="saathi-card w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#FFFFFF] rounded-xl shadow-xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#E8EAEE]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#F1FBFA] border border-[#D0F2EE]">
              <FileText className="w-4 h-4 text-[#0E7C7B]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-[#1F2430]">
                  Call Transcript • Case {caseNumber}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F1FBFA] text-[#0E7C7B] border border-[#D0F2EE]">
                  Synchronized
                </span>
              </div>
              <p className="text-xs text-[#66707A]">
                District: {district} • Dual-channel audio stream analysis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#66707A] hover:text-[#1F2430] hover:bg-[#F8F9FA] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Transcript Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {(transcript || []).map((item, idx) => {
            if (item.isAlert) {
              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-[#FCEEEE] border border-[#F8D7D7] flex items-start gap-3 text-xs"
                >
                  <AlertTriangle className="w-4 h-4 text-[#B23A3A] shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between font-semibold text-[#B23A3A] mb-1">
                      <span>{item.speaker}</span>
                      <span className="font-mono text-[11px]">{item.time}</span>
                    </div>
                    <p className="text-[#1F2430] leading-relaxed">{item.text}</p>
                  </div>
                </div>
              );
            }

            const isCaller = item.speaker === "Caller";
            const kws = getUtteranceKeywords(item);
            const hasKeywords = kws.length > 0;
            const hasBadges = hasKeywords || Boolean(item.toneMarker);

            return (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border ${
                  item.isFlagged || hasKeywords
                    ? "bg-[#FBF1E1]/40 border-[#F5E2C4]"
                    : "bg-[#FFFFFF] border-[#E8EAEE]"
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-1.5 font-medium text-[#1F2430]">
                    {isCaller ? (
                      <User className="w-3.5 h-3.5 text-[#66707A]" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5 text-[#0E7C7B]" />
                    )}
                    <span>{item.speaker}</span>
                  </div>
                  <span className="font-mono text-[11px] text-[#8A8F98]">
                    {item.time}
                  </span>
                </div>

                <p className="text-[13.5px] text-[#1F2430] leading-relaxed">
                  {item.text}
                </p>

                {/* Keyphrase / Tone badges */}
                {hasBadges && (
                  <div className="mt-2.5 pt-2 border-t border-[#E8EAEE] flex flex-wrap items-center gap-2 text-[11px]">
                    {hasKeywords && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#8A8F98]">Keywords:</span>
                        {kws.map((kw, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded bg-[#FCEEEE] text-[#B23A3A] border border-[#F8D7D7] font-medium"
                          >
                            &quot;{kw}&quot;
                          </span>
                        ))}
                      </div>
                    )}
                    {item.toneMarker && (
                      <span className="px-2 py-0.5 rounded bg-[#F1FBFA] text-[#0E7C7B] border border-[#D0F2EE]">
                        {item.toneMarker}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E8EAEE] flex items-center justify-between text-xs text-[#8A8F98] bg-[#FFFFFF]">
          <span>Integrated SAATHI-AI Engine • PII automatically redacted</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-semibold transition-colors"
          >
            Close Transcript
          </button>
        </div>
      </div>
    </div>
  );
}
