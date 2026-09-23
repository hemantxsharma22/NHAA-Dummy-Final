import React, { useState, useEffect, useCallback } from "react";
import {
  Mic,
  History,
  Layers,
  Sparkles,
} from "lucide-react";
import { SYNTHETIC_CASES, type CaseRecord } from "./data/caseData";
import { LiveSessionView } from "./components/LiveSessionView";
import { Engine2HistoricalView } from "./components/Engine2HistoricalView";
import { CaseReasoningView } from "./components/CaseReasoningView";
import { NHAAProtocolsView } from "./components/NHAAProtocolsView";
import { getApiBaseUrl } from "./config/api";

type ActiveTab = "live_session" | "engine2" | "reasoning" | "protocols";

interface SaathiConsoleProps {
  initialCaseUrn?: string;
  initialVictimName?: string;
  onBackToQueue?: () => void;
}

export const SaathiConsole: React.FC<SaathiConsoleProps> = ({
  initialCaseUrn,
  initialVictimName,
  onBackToQueue,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>("live_session");
  const [realCases, setRealCases] = useState<CaseRecord[]>([]);
  const [liveCase, setLiveCase] = useState<CaseRecord | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const isDemoMode = false;
  const [backendStatus, setBackendStatus] = useState<string>("Checking...");

  // Active cases: in demo mode show synthetic cases; in live mode show live active case and real database records.
  // Never fallback to dummy synthetic cases when in live mode.
  const activeCases: CaseRecord[] = isDemoMode
    ? SYNTHETIC_CASES
    : [...(liveCase ? [liveCase] : []), ...realCases];

  // Selected case derived from live active session, user selection, or latest authentic case
  const currentCase: CaseRecord | null = selectedCaseId
    ? activeCases.find(
        (c) =>
          c.id === selectedCaseId ||
          c.caseNumber === selectedCaseId ||
          c.caseNumber === `#${selectedCaseId}` ||
          `#${c.caseNumber}` === selectedCaseId ||
          c.session_id === selectedCaseId
      ) ||
      (liveCase?.id === selectedCaseId ? liveCase : null) ||
      (activeCases.length > 0 ? activeCases[0] : null)
    : (liveCase || (activeCases.length > 0 ? activeCases[0] : null));

  // Fetch real saved cases from backend API
  const fetchRealCases = useCallback((targetCaseId?: string) => {
    fetch(`${getApiBaseUrl()}/api/sessions/cases`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not fetch cases");
        return res.json();
      })
      .then((data) => {
        if (data && data.cases) {
          setRealCases(data.cases);
          if (targetCaseId) {
            const matched = data.cases.find(
              (c: any) =>
                c.id === targetCaseId ||
                c.caseNumber === targetCaseId ||
                c.caseNumber === `#${targetCaseId}` ||
                `#${c.caseNumber}` === targetCaseId ||
                c.session_id === targetCaseId
            );
            if (matched) {
              setSelectedCaseId(matched.id);
            } else {
              setSelectedCaseId(targetCaseId);
            }
          } else if (data.cases.length > 0 && !selectedCaseId && !isDemoMode && !liveCase) {
            setSelectedCaseId(data.cases[0].id);
          }
        }
      })
      .catch((err) => {
        console.warn("Backend cases fetch failed:", err);
      });
  }, [selectedCaseId, isDemoMode, liveCase]);

  // Check backend health and active running session
  useEffect(() => {
    fetch(`${getApiBaseUrl()}/health`)
      .then((res) => {
        if (!res.ok) throw new Error("Backend offline");
        return res.json();
      })
      .then((data) => {
        setBackendStatus(
          data.status === "healthy" ? "Online (Engine 1 Live)" : "Degraded"
        );
      })
      .catch(() => {
        setBackendStatus("Standby (Ready to connect)");
      });

    fetchRealCases();
  }, [fetchRealCases]);

  // Continuously sync active Engine 1 session if running on backend
  useEffect(() => {
    const syncActiveSession = () => {
      fetch(`${getApiBaseUrl()}/api/sessions/active`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.active && data.case) {
            setLiveCase(data.case);
          } else if (!data?.active && liveCase?.isLive) {
            setLiveCase(null);
          }
        })
        .catch(() => {});
    };

    syncActiveSession();
    const interval = setInterval(syncActiveSession, 2000);
    return () => clearInterval(interval);
  }, [liveCase?.isLive]);

  const handleSessionComplete = (_caseBrief: string, completedCaseDbId?: string) => {
    setLiveCase(null);
    fetchRealCases(completedCaseDbId);
    if (completedCaseDbId) {
      setSelectedCaseId(completedCaseDbId);
    }
    // Auto-switch to Case Reasoning Breakdown so the operator immediately reviews authentic live data
    setActiveTab("reasoning");
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Strip */}
      <div className="bg-[#0b1f36] text-white rounded-xl p-4 sm:p-5 border border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-purple-600/30 border border-purple-400/30 text-purple-300">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-bold text-white tracking-tight">
                SAATHI-AI Real-Time Helpline Decision-Support System
              </h2>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold uppercase">
                {backendStatus}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Live Human-in-the-Loop Triage, SVI 0-100 Scoring, Observable Indicator Stream &amp; Historical Precedents
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2.5 flex-wrap self-start md:self-auto">
          {initialCaseUrn && (
            <div className="bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-lg text-xs">
              <span className="text-slate-400 block text-[9px] uppercase font-semibold">Triage Reference</span>
              <span className="font-mono font-bold text-amber-300">{initialCaseUrn}</span>
            </div>
          )}

          {initialVictimName && (
            <div className="bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-lg text-xs">
              <span className="text-slate-400 block text-[9px] uppercase font-semibold">Caller</span>
              <span className="font-bold text-slate-200">{initialVictimName}</span>
            </div>
          )}

          {onBackToQueue && (
            <button
              type="button"
              onClick={onBackToQueue}
              className="px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors"
            >
              ← Triage Queue
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs matching SAATHI-AI System */}
      <div className="bg-white border border-slate-300 rounded-xl p-2 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("live_session")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "live_session"
                ? "bg-[#0b1f36] text-white shadow-xs"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Mic className="w-4 h-4 text-red-500 animate-pulse" />
            <span>1. Live Intake Console</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("reasoning")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "reasoning"
                ? "bg-[#0b1f36] text-white shadow-xs"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span>2. Case Reasoning Breakdown</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("engine2")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "engine2"
                ? "bg-[#0b1f36] text-white shadow-xs"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <History className="w-4 h-4 text-indigo-600" />
            <span>3. Engine 2: Historical Cases</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("protocols")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "protocols"
                ? "bg-[#0b1f36] text-white shadow-xs"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Layers className="w-4 h-4 text-teal-600" />
            <span>4. NHAA / PoA Protocols</span>
          </button>
        </div>

        {/* Selected Case Indicator */}
        {currentCase && (
          <div className="flex items-center gap-2 text-xs text-slate-500 pr-2">
            <span>Viewing:</span>
            <span className="font-bold text-slate-900 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {currentCase.caseNumber} {currentCase.city ? `(${currentCase.city})` : currentCase.district ? `(${currentCase.district})` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Main Tab Render */}
      <div className="min-h-[500px]">
        <div className={activeTab === "live_session" ? "block" : "hidden"}>
          <LiveSessionView
            onSessionComplete={handleSessionComplete}
            onLiveUpdate={setLiveCase}
          />
        </div>

        {activeTab === "reasoning" && (
          <CaseReasoningView
            currentCase={currentCase}
            allCases={activeCases}
            onSelectCase={(id) => setSelectedCaseId(id)}
          />
        )}

        {activeTab === "engine2" && (
          <Engine2HistoricalView
            currentCase={currentCase}
            allCases={activeCases}
            onSelectCase={(id) => setSelectedCaseId(id)}
          />
        )}

        {activeTab === "protocols" && <NHAAProtocolsView />}
      </div>
    </div>
  );
};
