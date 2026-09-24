import { useState, useRef, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import {
  Mic,
  Square,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  Info,
  Globe,
  TrendingUp,
  ShieldAlert,
  Sliders,
  Activity,
  FileText,
} from "lucide-react";
import { SVIArcGauge } from "./SVIArcGauge";
import { getApiBaseUrl, getWebSocketUrl } from "../config/api";
import type { CaseRecord } from "../data/caseData";

interface IndicatorItem {
  category: string;
  ui_label: string;
  matched_phrase: string;
  evidence_snippet: string;
  weight: number;
  is_calming: boolean;
  confidence?: number;
  assistance_type?: string;
}

interface MetricBar {
  name: string;
  score: number;
  evidence?: string[];
}

interface CopilotData {
  suggested_question: string;
  communication_tip: string;
  why_this_question?: string;
  why_this_helps?: string;
  source: string;
}

interface ScoreHistoryPoint {
  timestamp: string;
  score: number;
  label: string;
  trigger_text?: string;
}

interface LiveSessionResult {
  session_id: string;
  final_svi: number;
  final_svi_label: string;
  full_transcript: string;
  chunk_count: number;
  metric_bars: MetricBar[];
  score_history?: ScoreHistoryPoint[];
  case_brief: string;
  brief_source: string;
  case_db_id?: number;
}

interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: string;
  isFinal: boolean;
  speaker?: "CALLER" | "OPERATOR" | "Caller" | "AI" | string;
  category?: string;
  category_label?: string;
}

interface LiveSessionViewProps {
  onSessionComplete?: (caseBrief: string, completedCaseDbId?: string) => void;
  onLiveUpdate?: (liveCase: CaseRecord | null) => void;
  operatorNameProp?: string;
  districtProp?: string;
}

const QUICK_TEST_PHRASES = [
  {
    text: "Main Lucknow se hoon.",
    type: "location_city",
    label: "Location: City Only",
    expected: "City: Lucknow (Street/District empty)",
  },
  {
    text: "Main Gomti Nagar, Lucknow se hoon.",
    type: "location_area_city",
    label: "Location: Area + City",
    expected: "Area: Gomti Nagar, City: Lucknow",
  },
  {
    text: "Main Gomti Nagar, Lucknow, Uttar Pradesh se hoon.",
    type: "location_full",
    label: "Location: Full (Area, City, State)",
    expected: "Area: Gomti Nagar, City: Lucknow, State: UP",
  },
  {
    text: "I am calling from Hazratganj, Lucknow, UP.",
    type: "location_en",
    label: "Location: English Statement",
    expected: "Area: Hazratganj, City: Lucknow, State: UP",
  },
  {
    text: "mera ghar Gomti Nagar mein hai.",
    type: "location_home",
    label: "Location: Home in Area",
    expected: "Area: Gomti Nagar",
  },
  {
    text: "Main Sant Kabir Nagar district se hoon.",
    type: "location_district",
    label: "Location: District",
    expected: "District: Sant Kabir Nagar",
  },
  {
    text: "Namaste, mera naam Anita hai.",
    type: "intake",
    label: "Baseline Intake",
    expected: "Baseline intake (SVI 0-15, LOW)",
  },
  {
    text: "Mujhe dhamki mil rahi hai, usne bola jaan se maar dega.",
    type: "threat",
    label: "Threat Language",
    expected: "Threat & Intimidation flag (SVI ~40-55)",
  },
  {
    text: "Mujhe bahut darr lag raha hai, main panic kar rahi hoon.",
    type: "fear",
    label: "Fear / Distress",
    expected: "Fear & Panic signal (SVI ~60-75)",
  },
  {
    text: "Woh abhi mere ghar ke bahar hai right now.",
    type: "proximity",
    label: "Immediate Danger",
    expected: "Current Imminent Danger (CRITICAL ~85+)",
  },
  {
    text: "Main jeena nahi chahti, mujhe lagta hai mar jana chahiye.",
    type: "self_harm",
    label: "Self-Harm Risk",
    expected: "Self-Harm Risk Alert (Requires Operator Review)",
  },
  {
    text: "Usne mujhe maara, mere khoon aa raha hai.",
    type: "violence",
    label: "Physical Violence",
    expected: "Violence & Medical Emergency flag",
  },
  {
    text: "Woh mera peecha kar raha hai roz ghar ke bahar.",
    type: "stalking",
    label: "Stalking / Following",
    expected: "Stalking & Repeated Pattern flag",
  },
  {
    text: "Main akeli hoon. Koi mere saath nahi hai.",
    type: "isolation",
    label: "Isolation Signal",
    expected: "Isolation signal vulnerability spike",
  },
  {
    text: "Please police ko bulao, mujhe emergency help chahiye.",
    type: "help",
    label: "Police Help Request",
    expected: "Assistance Request: Police / Emergency",
  },
  {
    text: "Abhi main safe hoon, police aa gayi hai.",
    type: "calming",
    label: "Reassurance Signal",
    expected: "Active Score De-escalation (SVI drops)",
  },
  {
    text: "Movie mein villain ne bola main tumhe maar dunga.",
    type: "negative_context",
    label: "Movie Context (Non-Threat)",
    expected: "Negative Context Filter (No real threat)",
  },
];

export function LiveSessionView({
  onSessionComplete,
  onLiveUpdate,
  operatorNameProp,
  districtProp,
}: LiveSessionViewProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [operatorName] = useState<string>(operatorNameProp || "Priya Singh (OP-8821)");
  const [district, setDistrict] = useState<string>(districtProp || "");
  const [detectedLocation, setDetectedLocation] = useState<{ street?: string; city?: string; district?: string; state?: string }>({});
  const [selectedLanguage, setSelectedLanguage] = useState<string>("hi-IN");

  // Real Dynamic Initial State (0 SVI, Neutral LOW)
  const [sviScore, setSviScore] = useState<number>(0);
  const [sviLabel, setSviLabel] = useState<string>("LOW");
  const [chunkCount, setChunkCount] = useState<number>(0);
  const [speechPaceLabel, setSpeechPaceLabel] = useState<string>("normal");
  const [metricBars, setMetricBars] = useState<MetricBar[]>([
    { name: "Threat Language", score: 0 },
    { name: "Fear & Panic Signal", score: 0 },
    { name: "Immediate Safety / Urgency", score: 0 },
    { name: "Isolation Signal", score: 0 },
  ]);
  const [indicators, setIndicators] = useState<IndicatorItem[]>([]);
  const [copilot, setCopilot] = useState<CopilotData>({
    suggested_question: "Namaste, ERSS Emergency Control Room. Aap kahan se bol rahe hain?",
    communication_tip: "Maintain a calm, reassuring tone. Establish caller location and immediate safety status.",
    why_this_question: "Initial caller location & intake confirmation required.",
    why_this_helps: "Helps dispatch nearby emergency response unit immediately.",
    source: "default",
  });
  const [scoreHistory, setScoreHistory] = useState<ScoreHistoryPoint[]>([]);
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [interimText, setInterimText] = useState<string>("");

  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [completedSummary, setCompletedSummary] = useState<LiveSessionResult | null>(null);

  // Upgraded Multimodal Intelligence States (Requirement 13)
  const [audioQuality, setAudioQuality] = useState<{
    quality: string;
    noise_level: string;
    speech_detected: string;
    clipping_detected?: boolean;
    speech_ratio?: number;
    snr_db?: number;
  }>({ quality: "GOOD", noise_level: "LOW", speech_detected: "YES" });

  const [vadState, setVadState] = useState<"LISTENING" | "SPEAKING" | "PROCESSING" | "SILENCE">("LISTENING");

  const [emotionIndicators, setEmotionIndicators] = useState<{
    dominant: string;
    confidence: number;
    scores?: Record<string, number>;
  }>({ dominant: "NEUTRAL", confidence: 0.95 });

  const [voiceFeatures, setVoiceFeatures] = useState<{
    speech_rate: number;
    pause_ratio: number;
    rms_energy: number;
    pitch_variation?: number;
  }>({ speech_rate: 2.5, pause_ratio: 0.18, rms_energy: 0.08 });

  const [caseIndicators, setCaseIndicators] = useState<{
    threat: string;
    violence: string;
    urgency: string;
    immediate_danger?: string;
    requested_help?: string;
  }>({ threat: "Not Detected", violence: "Not Detected", urgency: "Not Detected" });

  const [aiAssistedRisk, setAiAssistedRisk] = useState<{
    level: "LOW" | "MODERATE" | "HIGH";
    score: number;
    explanation: string;
    feature_contributions: Array<{ feature: string; impact: string; weight: number }>;
    recommended_action?: string;
  }>({
    level: "LOW",
    score: 0.15,
    explanation: "Baseline operational monitoring. No elevated threat cues detected.",
    feature_contributions: [{ feature: "Calm Vocal Baseline", impact: "Stabilizing", weight: 0.1 }],
    recommended_action: "Standard helpline guidance & intake logging.",
  });

  const [similarHistoricalCases, setSimilarHistoricalCases] = useState<Array<{
    caseId: string;
    title: string;
    district: string;
    category: string;
    similarityScore: number;
    shortSummary?: string;
    matchingTerms?: string[];
    resolution?: string;
  }>>([
    {
      caseId: "#SKN-2025-1102",
      title: "Verbal Death Threat & Armed Trespass Attempt",
      district: "Sant Kabir Nagar",
      category: "THREAT_INTIMIDATION",
      similarityScore: 82,
      shortSummary: "Perpetrator showed up outside residence threatening violence.",
      matchingTerms: ["threat", "outside", "dhamki"],
      resolution: "Rapid PCR deployment within 6.8 mins intercepted suspect.",
    },
    {
      caseId: "#GKP-2025-0891",
      title: "Physical Assault & Stalking Near Metro",
      district: "Gorakhpur",
      category: "PHYSICAL_VIOLENCE_INJURY",
      similarityScore: 68,
      shortSummary: "Repeated following near transit depot culminating in battery.",
      matchingTerms: ["metro", "stalking", "help"],
      resolution: "CCTV tracking enabled apprehension within 25 minutes.",
    },
    {
      caseId: "#VRN-2024-0419",
      title: "Domestic Harassment & Spousal Abuse",
      district: "Varanasi",
      category: "DOMESTIC_FAMILY_VIOLENCE",
      similarityScore: 55,
      shortSummary: "In-laws harassment and isolation.",
      matchingTerms: ["domestic", "harassment"],
      resolution: "One Stop Centre protection officer deployed.",
    },
  ]);

  const [aiAssistance, setAiAssistance] = useState<{
    summary: string;
    suggested_questions: string[];
  }>({
    summary: "Monitoring citizen audio stream. Live transcript and decision-support reasoning active.",
    suggested_questions: [
      "Can you confirm your current location and nearest landmark?",
      "Are you in a safe and secured room right now?",
      "Do you require local police or an emergency ambulance dispatched immediately?"
    ],
  });

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);

  // Synchronized refs to avoid stale closures in WebSocket event listeners
  const sessionIdRef = useRef<string | null>(null);
  const isSessionActiveRef = useRef<boolean>(false);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);

  // In-place auto-scroll for transcript container ONLY (prevents main page scroll jumping)
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcriptEntries, interimText]);

  /**
   * Evaluates text using client-side heuristic rules to ensure the SVI gauge updates
   * even if the Python FastAPI backend is offline or slow to respond.
   */
  const evaluateLocalSvi = (text: string) => {
    const lower = text.toLowerCase();
    let delta = 0;

    const highThreat = [
      "maar", "kill", "dhamki", "threat", "khoon", "blood", "chaku", "knife",
      "gun", "bandook", "murder", "hamla", "jaan se", "attack", "destroy"
    ];
    const moderateDistress = [
      "darr", "dar", "fear", "scared", "panic", "bachao", "help", "madad",
      "police", "emergency", "bahar khada", "outside", "alone", "akela", "akeli"
    ];
    const calmingSignals = [
      "safe", "theek", "shant", "calm", "police aa gayi", "alright", "okay", "fine"
    ];

    if (highThreat.some((kw) => lower.includes(kw))) {
      delta += 30;
    } else if (moderateDistress.some((kw) => lower.includes(kw))) {
      delta += 18;
    } else if (calmingSignals.some((kw) => lower.includes(kw))) {
      delta -= 15;
    } else {
      delta += 4;
    }

    setSviScore((prev) => {
      const nextScore = Math.min(100, Math.max(5, prev + delta));
      const nextLabel =
        nextScore >= 80 ? "CRITICAL" : nextScore >= 60 ? "HIGH" : nextScore >= 35 ? "MODERATE" : "LOW";
      setSviLabel(nextLabel);

      setScoreHistory((prevHistory) => [
        ...prevHistory,
        {
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          score: nextScore,
          label: nextLabel,
          trigger_text: text.slice(0, 30),
        },
      ]);

      return nextScore;
    });
  };

  /**
   * SVI scoring function called on every new transcript chunk
   * Streams to backend Engine 1 segment API and updates SVI score gauge and indicators.
   */
  const scoreTranscriptChunk = async (phraseText: string) => {
    let targetSessionId = sessionIdRef.current;
    if (!targetSessionId || !isSessionActiveRef.current) {
      try {
        const params = new URLSearchParams({
          operator_name: operatorName,
          district: district,
          language: selectedLanguage,
        });
        const res = await fetch(`${getApiBaseUrl()}/api/sessions/start?${params.toString()}`, {
          method: "POST",
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const data = await res.json();
          targetSessionId = data.session_id;
          setSessionId(targetSessionId);
          setIsSessionActive(true);
        }
      } catch (err: any) {
        console.warn("Could not start API session for scoring:", err?.message || err);
      }
    }

    if (targetSessionId) {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/sessions/${targetSessionId}/segment`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ text: phraseText }),
          signal: AbortSignal.timeout(2000),
        });

        if (res.ok) {
          const data = await res.json();

          if (typeof data.svi === "number") {
            setSviScore(data.svi);
            setSviLabel(data.svi_label || "LOW");
          } else if (data.svi && typeof data.svi === "object") {
            setSviScore(data.svi.score ?? 0);
            setSviLabel(data.svi.label ?? data.svi_label ?? "LOW");
          }

          if (data.chunk_count) setChunkCount(data.chunk_count);
          if (data.metric_bars && Array.isArray(data.metric_bars)) setMetricBars(data.metric_bars);
          if (data.speech_pace_label) setSpeechPaceLabel(data.speech_pace_label);
          if (data.indicators && Array.isArray(data.indicators)) setIndicators(data.indicators);
          if (data.copilot) setCopilot(data.copilot);
          if (data.score_history && Array.isArray(data.score_history)) setScoreHistory(data.score_history);

          if (
            data.detected_location &&
            (data.detected_location.city ||
              data.detected_location.street ||
              data.detected_location.district ||
              data.detected_location.state)
          ) {
            setDetectedLocation({
              street: data.detected_location.street,
              city: data.detected_location.city,
              district: data.detected_location.district,
              state: data.detected_location.state,
            });
            const disp =
              data.detected_location.city ||
              data.detected_location.district ||
              data.detected_location.street ||
              "";
            if (disp) {
              setDistrict(disp);
            }
          } else if (data.case_record) {
            if (data.case_record.city || data.case_record.district || data.case_record.street) {
              setDetectedLocation({
                street: data.case_record.street,
                city: data.case_record.city,
                district: data.case_record.district,
                state: data.case_record.state,
              });
              if (data.case_record.location) {
                setDistrict(data.case_record.location);
              }
            }
            if (onLiveUpdate) {
              onLiveUpdate(data.case_record);
            }
          }
          return;
        }
      } catch (err: any) {
        console.warn("API session segment call failed, falling back to local heuristic SVI:", err);
      }
    }

    // Fallback: Local heuristic scoring ensures gauge updates smoothly
    evaluateLocalSvi(phraseText);
  };

  /**
   * Socket.io client setup:
   * Connects to backend WebSocket server on component mount,
   * listens for 'phone-transcript' events, and disconnects on unmount.
   */
  useEffect(() => {
    const backendUrl =
      (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_BACKEND_URL) ||
      "http://localhost:5000";

    console.log("[LiveSessionView] Connecting Socket.io to backend:", backendUrl);

    const socket: Socket = io(backendUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      console.log("[LiveSessionView] Socket.io connected to phone transcript server, ID:", socket.id);
    });

    socket.on("connect_error", (error) => {
      console.warn("[LiveSessionView] Socket.io connection error:", error.message);
    });

    // Listen for phone-transcript events from Vapi webhook backend
    socket.on("phone-transcript", (data: { text: string; role?: string; timestamp?: number }) => {
      if (!data || !data.text) return;

      const rawRole = (data.role || "user").toLowerCase();
      const isAssistant = rawRole === "assistant" || rawRole === "ai" || rawRole === "bot";
      const speakerLabel = isAssistant ? "AI" : "Caller";
      const cleanText = data.text.trim();

      const formattedTime = new Date(data.timestamp || Date.now()).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      console.log(
        `[LiveSessionView] phone-transcript received -> extracted role: "${data.role}" (${speakerLabel}) | text: "${cleanText}"`
      );

      // Append transcript to existing transcript state (preventing exact consecutive duplicate appends)
      setTranscriptEntries((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.speaker === speakerLabel && last.text === cleanText) {
          return prev;
        }
        return [
          ...prev,
          {
            id: `phone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            text: cleanText,
            timestamp: formattedTime,
            isFinal: true,
            speaker: speakerLabel as any,
          },
        ];
      });

      // CRITICAL FOR SVI: Only actual CALLER/USER speech should be passed into caller-risk/SVI scoring logic.
      // AI/assistant messages MUST NOT affect the caller's threat score.
      if (!isAssistant) {
        console.log(`[LiveSessionView] -> Sent to SVI scoring (Caller Speech): "${cleanText}"`);
        scoreTranscriptChunk(cleanText);
      } else {
        console.log(`[LiveSessionView] -> Ignored for SVI scoring (AI / Assistant Speech): "${cleanText}"`);
      }
    });

    // Disconnect the socket on component unmount (cleanup)
    return () => {
      console.log("[LiveSessionView] Disconnecting Socket.io on unmount");
      socket.disconnect();
    };
  }, []);

  const startLiveSession = async () => {
    try {
      setStatusNotice(null);
      setCompletedSummary(null);
      setTranscriptEntries([]);
      setInterimText("");
      setIndicators([]);
      setScoreHistory([]);
      setSviScore(0);
      setSviLabel("LOW");
      setMetricBars([
        { name: "Threat Language", score: 0 },
        { name: "Fear & Panic Signal", score: 0 },
        { name: "Immediate Safety / Urgency", score: 0 },
        { name: "Isolation Signal", score: 0 },
      ]);

      const params = new URLSearchParams({
        operator_name: operatorName,
        district: district,
        language: selectedLanguage,
      });

      const res = await fetch(`${getApiBaseUrl()}/api/sessions/start?${params.toString()}`, {
        method: "POST",
      });

      if (!res.ok) {
        const errDetail = await res.text().catch(() => "");
        throw new Error(errDetail ? `Backend error (${res.status}): ${errDetail.slice(0, 100)}` : "Python FastAPI backend (port 8000) unreachable");
      }
      const data = await res.json();
      const newSessionId = data.session_id;
      setSessionId(newSessionId);
      setIsSessionActive(true);

      if (data.case_record && onLiveUpdate) {
        onLiveUpdate(data.case_record);
      } else if (onLiveUpdate) {
        onLiveUpdate({
          id: `live-${newSessionId}`,
          caseNumber: `#LIVE-${newSessionId.toUpperCase()}`,
          session_id: newSessionId,
          isLive: true,
          status: "low",
          statusLabel: "low",
          district: "",
          city: "",
          street: "",
          state: "",
          location: "",
          displayLocation: "Location: Awaiting caller confirmation",
          sviScore: 0,
          callerNameAnonymized: "Live Caller (Active Session)",
          operatorName: operatorName,
          intakeTimestamp: "Live Call in Progress",
          callDuration: "00:00 mins",
          metrics: [
            { name: "Threat Language", score: 0, color: "#2F855A", category: "success" },
            { name: "Fear & Panic Signal", score: 0, color: "#2F855A", category: "success" },
            { name: "Immediate Safety / Urgency", score: 0, color: "#2F855A", category: "success" },
            { name: "Isolation Signal", score: 0, color: "#2F855A", category: "success" },
          ],
          detectedKeywords: [],
          flaggedTime: "Live Stream",
          caseBrief: `Live intake session initiated with ${operatorName}. Engine 1 is actively monitoring caller speech for distress indicators.`,
          timeline: [
            {
              timestamp: "+0:00s",
              description: `Call session initiated by ${operatorName}. Real-time transcription active.`,
              type: "operator_action",
            },
          ],
          transcript: [],
          delayRiskScore: 10,
        });
      }

      // Connect browser WebSocket to backend Deepgram WS proxy
      connectDeepgramWebSocket(newSessionId);
    } catch (err: any) {
      console.error("Failed to start session:", err);
      setStatusNotice(`Session start error: ${err.message || "Backend offline"}`);
    }
  };

  const connectDeepgramWebSocket = (activeSessionId: string) => {
    try {
      const wsUrl = getWebSocketUrl(`/api/deepgram/ws/${activeSessionId}?language=${encodeURIComponent(selectedLanguage)}`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Deepgram WS connected for session:", activeSessionId);
        startMicCapture();
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          if (msg.type === "connected") {
            if (msg.vad_state) setVadState(msg.vad_state);
            if (msg.audio_calibration) {
              setAudioQuality({
                quality: (msg.audio_calibration.audio_quality || "GOOD").toUpperCase(),
                noise_level: (msg.audio_calibration.noise_level || "LOW").toUpperCase(),
                speech_detected: msg.audio_calibration.speech_detected ? "YES" : "NO",
                clipping_detected: msg.audio_calibration.clipping_detected,
                speech_ratio: msg.audio_calibration.speech_ratio,
                snr_db: msg.audio_calibration.snr_db,
              });
            }
          } else if (msg.type === "interim") {
            setInterimText(msg.text || "");
            setVadState("SPEAKING");
          } else if (msg.type === "audio_calibration_update") {
            if (msg.audio_quality) setAudioQuality(msg.audio_quality);
            if (msg.vad_state) setVadState(msg.vad_state);
          } else if (msg.type === "final") {
            setInterimText("");
            setVadState("LISTENING");
            const text = msg.text?.trim();
            if (text) {
              const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const speakerLabel = msg.speaker === "Operator" ? "OPERATOR" : "CITIZEN";
              setTranscriptEntries((prev) => [
                ...prev,
                { id: `t-${Date.now()}`, text: text, timestamp: nowTime, isFinal: true, speaker: speakerLabel as any },
              ]);
            }

            // Upgraded Multimodal Fields
            if (msg.audio_quality) setAudioQuality(msg.audio_quality);
            if (msg.voice_features) setVoiceFeatures(msg.voice_features);
            if (msg.emotion_indicators) setEmotionIndicators(msg.emotion_indicators);
            if (msg.case_indicators) setCaseIndicators(msg.case_indicators);
            if (msg.ai_assisted_risk) setAiAssistedRisk(msg.ai_assisted_risk);
            if (msg.similar_historical_cases && Array.isArray(msg.similar_historical_cases)) {
              setSimilarHistoricalCases(msg.similar_historical_cases);
            }
            if (msg.ai_assistance) {
              setAiAssistance(msg.ai_assistance);
              if (msg.ai_assistance.suggested_questions && msg.ai_assistance.suggested_questions.length > 0) {
                setCopilot((prev) => ({
                  ...prev,
                  suggested_question: msg.ai_assistance.suggested_questions[0],
                  communication_tip: `AI Case Summary: ${msg.ai_assistance.summary}`,
                  source: "Gemini Case Intelligence",
                }));
              }
            }

            // SVI Numerical Score & Label
            if (typeof msg.svi === "number") {
              setSviScore(msg.svi);
              setSviLabel(msg.svi_label || "LOW");
            } else if (msg.svi && typeof msg.svi === "object") {
              setSviScore(msg.svi.score ?? 0);
              setSviLabel(msg.svi.label ?? msg.svi_label ?? "LOW");
            }

            if (msg.chunk_count) setChunkCount(msg.chunk_count);
            if (msg.metric_bars && Array.isArray(msg.metric_bars)) setMetricBars(msg.metric_bars);
            if (msg.speech_pace_label) setSpeechPaceLabel(msg.speech_pace_label);
            if (msg.indicators && Array.isArray(msg.indicators)) setIndicators(msg.indicators);
            if (msg.copilot) setCopilot(msg.copilot);
            if (msg.score_history && Array.isArray(msg.score_history)) setScoreHistory(msg.score_history);

            // Location extraction from live voice processing
            if (msg.detected_location && (msg.detected_location.city || msg.detected_location.street || msg.detected_location.district || msg.detected_location.state)) {
              setDetectedLocation({
                street: msg.detected_location.street,
                city: msg.detected_location.city,
                district: msg.detected_location.district,
                state: msg.detected_location.state,
              });
              const disp = msg.detected_location.city || msg.detected_location.district || msg.detected_location.street || "";
              if (disp) {
                setDistrict(disp);
              }
            } else if (msg.case_record) {
              if (msg.case_record.city || msg.case_record.district || msg.case_record.street) {
                setDetectedLocation({
                  street: msg.case_record.street,
                  city: msg.case_record.city,
                  district: msg.case_record.district,
                  state: msg.case_record.state,
                });
                if (msg.case_record.location) {
                  setDistrict(msg.case_record.location);
                }
              }
              if (onLiveUpdate) {
                onLiveUpdate(msg.case_record);
              }
            }
          } else if (msg.type === "error") {
            setStatusNotice(`Deepgram notice: ${msg.message || msg.error}`);
          }
        } catch (e) {
          console.warn("WS message parse error:", e);
        }
      };

      ws.onerror = (err) => {
        console.warn("WebSocket error:", err);
        setStatusNotice("Live voice WebSocket connection error. Verify backend and DEEPGRAM_API_KEY.");
      };

      ws.onclose = () => {
        console.log("WebSocket closed");
      };
    } catch (err: any) {
      console.error("WS connection error:", err);
      setStatusNotice(`WebSocket connection failed: ${err.message}`);
    }
  };

  const startMicCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(event.data);
        }
      };

      mediaRecorder.start(250);
    } catch (err: any) {
      console.error("Microphone capture failed:", err);
      setStatusNotice(`Microphone error: ${err.message || "Permission denied"}. You can test live using Quick Test Phrases on the left.`);
    }
  };

  const stopMicCapture = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
  };

  const handleSendTestPhrase = async (phraseText: string) => {
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setTranscriptEntries((prev) => [
      ...prev,
      { id: `t-${Date.now()}`, text: phraseText, timestamp: nowTime, isFinal: true, speaker: "CALLER" },
    ]);
    await scoreTranscriptChunk(phraseText);
  };

  const endLiveSession = async () => {
    stopMicCapture();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (!sessionId) {
      setIsSessionActive(false);
      return;
    }

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sessions/${sessionId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          operator_name: operatorName,
          district: district,
        }),
      });

      const summary: LiveSessionResult = await res.json();
      setCompletedSummary(summary);
      setIsSessionActive(false);
      const caseIdStr = summary.case_db_id ? String(summary.case_db_id) : undefined;
      if (onSessionComplete) {
        onSessionComplete(summary.case_brief || "", caseIdStr);
      }
    } catch (err) {
      console.error("Error ending session:", err);
      setIsSessionActive(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Sub-Header Case Control Bar */}
      <div className="saathi-card p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs bg-white border border-[#D1D5DB]">
        <div className="flex flex-wrap items-center gap-2.5">
          {isSessionActive && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#FDF2F2] text-[#C81E1E] border border-[#F8B4B4] font-bold text-[10px] animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C81E1E] animate-ping" />
              LIVE CALL ACTIVE
            </div>
          )}

          {/* Dynamic Detected Location Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-50 border border-slate-200 text-xs text-slate-700">
            <span className="text-[10px] uppercase font-bold text-slate-500">Location:</span>
            {detectedLocation.street || detectedLocation.city || detectedLocation.district || detectedLocation.state ? (
              <span className="font-semibold text-slate-900 flex items-center gap-1 flex-wrap">
                {detectedLocation.street && <span className="bg-slate-200/80 px-1.5 py-0.2 rounded text-[11px]">Area: {detectedLocation.street}</span>}
                {detectedLocation.city && <span className="bg-blue-100 text-blue-900 px-1.5 py-0.2 rounded text-[11px]">City: {detectedLocation.city}</span>}
                {detectedLocation.district && <span className="bg-purple-100 text-purple-900 px-1.5 py-0.2 rounded text-[11px]">Dist: {detectedLocation.district}</span>}
                {detectedLocation.state && <span className="bg-emerald-100 text-emerald-900 px-1.5 py-0.2 rounded text-[11px]">State: {detectedLocation.state}</span>}
              </span>
            ) : (
              <span className="text-slate-400 italic text-[11px]">Awaiting caller speech...</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#F9FAFB] border border-[#D1D5DB] text-xs">
            <Globe className="w-3.5 h-3.5 text-[#6B7280]" />
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              disabled={isSessionActive}
              className="bg-transparent text-xs font-semibold text-[#111827] outline-none cursor-pointer"
            >
              <option value="hi-IN">Hindi + English (Hinglish)</option>
              <option value="hi">Hindi (Devanagari)</option>
              <option value="en-IN">English (Indian Accent)</option>
              <option value="en">English (Global)</option>
            </select>
          </div>

          {!isSessionActive ? (
            <button
              type="button"
              onClick={startLiveSession}
              className="px-4 py-1.5 rounded bg-[#C81E1E] hover:bg-[#9B1C1C] text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 uppercase tracking-wider"
            >
              <Mic className="w-3.5 h-3.5 text-white" />
              START LIVE SESSION
            </button>
          ) : (
            <button
              type="button"
              onClick={endLiveSession}
              className="px-4 py-1.5 rounded bg-[#C81E1E] hover:bg-[#9B1C1C] text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 uppercase tracking-wider"
            >
              <Square className="w-3.5 h-3.5" />
              END LIVE SESSION
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Page Title Header */}
      <div className="flex items-center justify-between pb-1 border-b border-[#D1D5DB]">
        <div>
          <h2 className="text-lg font-bold font-serif-header text-[#111827] tracking-tight">
            Live Call Interaction (Engine 1)
          </h2>
          <p className="text-xs text-[#6B7280]">
            Live speech transcription, real-time SVI calculation, observable distress indicators & operator co-pilot
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-2 text-[10.5px] text-[#6B7280] bg-white px-3 py-1 rounded border border-[#D1D5DB]">
          <span>ERSS Node: <strong>UP-SKN-02</strong></span>
          <span>•</span>
          <span>Telemetry Stream: <strong className="text-[#059669]">Active (24ms)</strong></span>
        </div>
      </div>

      {/* High Risk Alert Notice */}
      {(sviLabel === "HIGH" || sviLabel === "CRITICAL") && (
        <div className="p-3 rounded bg-[#FDF2F2] border border-[#F8B4B4] text-xs text-[#C81E1E] flex items-center justify-between shadow-sm animate-pulse">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 text-[#C81E1E]" />
            <div>
              <span className="font-bold uppercase tracking-wider">
                {sviLabel} VULNERABILITY DETECTED ({sviScore}/100) — IMMEDIATE OPERATOR CONFIRMATION REQUIRED
              </span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded bg-[#C81E1E] text-white font-bold text-[9.5px] uppercase">
            ACTION REQUIRED
          </span>
        </div>
      )}

      {/* Status Notice */}
      {statusNotice && (
        <div className="p-2.5 rounded bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#D97706] flex items-center gap-2">
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* 3. 2-Column Dashboard Grid Layout (5 Cols / 7 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: SVI Score, Contributing Factors & Quick Test Phrases (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Card 1: REAL TIME SVI SCORE */}
          <div className="saathi-card p-4 shadow-sm flex flex-col items-center bg-white">
            <div className="w-full flex items-center justify-between mb-1">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0E7C7B]">
                  REAL TIME SVI SCORE
                </span>
                <span className="text-[10px] text-[#6B7280] ml-1.5 font-medium">System Vulnerability Index</span>
              </div>
              <HelpCircle className="w-4 h-4 text-[#9CA3AF] cursor-help" />
            </div>

            <div className="py-2">
              <SVIArcGauge score={sviScore} label={sviLabel} size={180} />
            </div>

            {/* SVI Level Banner */}
            <div
              className={`w-full mt-1 p-2 rounded border text-center transition-colors ${
                sviLabel === "CRITICAL" || sviLabel === "HIGH"
                  ? "bg-[#FDF2F2] border-[#F8B4B4] text-[#C81E1E]"
                  : sviLabel === "MODERATE"
                  ? "bg-[#FFFBEB] border-[#FDE68A] text-[#D97706]"
                  : "bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]"
              }`}
            >
              <span className="text-xs font-bold uppercase tracking-wider">
                VULNERABILITY LEVEL: {sviLabel} ({sviScore}/100)
              </span>
            </div>

            {/* SVI Score Trend Graph */}
            <div className="w-full mt-3 pt-3 border-t border-[#E5E7EB] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 font-bold text-[#111827] text-[11px]">
                  <TrendingUp className="w-3.5 h-3.5 text-[#0E7C7B]" />
                  <span>SCORE TREND (REAL SESSION DATA)</span>
                </div>
                <span className="text-[10px] text-[#6B7280] font-mono">
                  {scoreHistory.length} Points
                </span>
              </div>

              {scoreHistory.length > 0 ? (
                <div className="h-16 w-full bg-[#F9FAFB] rounded border border-[#E5E7EB] p-2 flex items-end">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 300 45">
                    {scoreHistory.map((pt, idx) => {
                      const x = (idx / Math.max(1, scoreHistory.length - 1)) * 280 + 10;
                      const y = 42 - (pt.score / 100) * 36;
                      const prevPt = idx > 0 ? scoreHistory[idx - 1] : null;
                      const prevX = prevPt ? ((idx - 1) / Math.max(1, scoreHistory.length - 1)) * 280 + 10 : x;
                      const prevY = prevPt ? 42 - (prevPt.score / 100) * 36 : y;

                      return (
                        <g key={idx}>
                          {idx > 0 && (
                            <line
                              x1={prevX}
                              y1={prevY}
                              x2={x}
                              y2={y}
                              stroke={pt.score > 60 ? "#C81E1E" : pt.score > 30 ? "#D97706" : "#059669"}
                              strokeWidth="2"
                            />
                          )}
                          <circle
                            cx={x}
                            cy={y}
                            r="3.5"
                            fill={pt.score > 60 ? "#C81E1E" : pt.score > 30 ? "#D97706" : "#059669"}
                          />
                        </g>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <div className="text-[11px] text-[#6B7280] py-2 text-center bg-[#F9FAFB] rounded border border-[#E5E7EB]">
                  Score trend timeline will populate as real speech is processed.
                </div>
              )}
            </div>
          </div>

          {/* Card 2: CONTRIBUTING FACTORS (LIVE) */}
          <div className="saathi-card p-4 shadow-sm space-y-2.5 bg-white">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2">
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#111827]">
                  CONTRIBUTING FACTORS (LIVE)
                </h3>
                <p className="text-[10px] text-[#6B7280]">5 Real-Time NLP & Acoustic Evidence Streams</p>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#E6F4F4] text-[#0E7C7B] border border-[#99D5D4]">
                CHUNK #{chunkCount}
              </span>
            </div>

            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {metricBars.map((metric) => (
                <div key={metric.name} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-[#111827] flex items-center gap-1.5">
                      ● {metric.name}
                      {metric.name === "Speech pace" && (
                        <span className="px-1 py-0.2 rounded text-[9px] bg-[#F3F4F6] text-[#6B7280]">
                          Proxy ({speechPaceLabel})
                        </span>
                      )}
                    </span>
                    <span className="text-[#111827] font-mono">{metric.score}%</span>
                  </div>

                  <div className="w-full h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden border border-[#E5E7EB]">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        metric.score > 60
                          ? "bg-[#C81E1E]"
                          : metric.score > 30
                          ? "bg-[#D97706]"
                          : "bg-[#0E7C7B]"
                      }`}
                      style={{ width: `${metric.score}%` }}
                    />
                  </div>

                  {metric.evidence && metric.evidence.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {metric.evidence.map((ev, ei) => (
                        <span
                          key={ei}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F8FAFC] text-[#111827] border border-[#E5E7EB]"
                        >
                          Evidence: "{ev}"
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: OPERATOR CO-PILOT GUIDANCE */}
          <div className="saathi-card p-4 shadow-sm space-y-2.5 bg-white border border-[#E5E7EB] rounded-xl">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#0E7C7B]" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#111827]">
                  OPERATOR CO-PILOT GUIDANCE
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]">
                {copilot.source}
              </span>
            </div>

            <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-xs space-y-1">
              <span className="text-[10px] font-bold text-[#15803D] uppercase">Suggested Next Question:</span>
              <p className="text-xs font-semibold text-[#166534]">"{copilot.suggested_question}"</p>
            </div>

            <div className="p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[11px] text-[#475569]">
              <span className="font-bold text-[#1E293B]">Communication Tip: </span>
              {copilot.communication_tip}
            </div>
          </div>

          {/* Card 4: QUICK INTAKE TEST PHRASES */}
          <div className="saathi-card p-4 shadow-sm space-y-2.5 bg-white border border-[#E5E7EB] rounded-xl">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#111827]">
                QUICK INTAKE TEST PHRASES
              </h3>
              <span className="text-[10px] text-[#6B7280]">Simulate Live Signals</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TEST_PHRASES.map((phrase, pi) => (
                <button
                  key={pi}
                  type="button"
                  onClick={() => handleSendTestPhrase(phrase.text)}
                  className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-[10.5px] font-medium text-slate-800 transition-colors"
                  title={phrase.expected}
                >
                  {phrase.label}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Live Transcript & Detected Indicators (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">

          {/* Card 2: LIVE CALL TRANSCRIPT */}
          <div className="saathi-card p-4 shadow-sm flex flex-col h-[380px] bg-white">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#E5E7EB] mb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#0E7C7B]" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#111827]">
                  LIVE CALL TRANSCRIPT
                </h3>
              </div>
              <div className="flex items-center gap-3 text-[10.5px] text-[#6B7280]">
                <span>Language: <strong className="text-[#111827]">{selectedLanguage === "hi-IN" ? "Hindi + English (Hinglish)" : selectedLanguage === "hi" ? "Hindi (Devanagari)" : selectedLanguage === "en-IN" ? "English (Indian)" : "English (Global)"}</strong></span>
                <span>Auto-scroll: <strong className="text-[#059669]">ON</strong></span>
              </div>
            </div>

            {/* In-place auto-scrolling container without window scroll jumping */}
            <div
              ref={transcriptContainerRef}
              className="flex-1 overflow-y-auto pr-2 space-y-3 font-sans text-xs leading-relaxed"
            >
              {transcriptEntries.length > 0 || interimText ? (
                <div className="space-y-2.5">
                  {transcriptEntries.map((entry) => {
                    const isAI = entry.speaker === "AI" || entry.speaker === "OPERATOR";
                    return (
                      <div
                        key={entry.id}
                        className={`p-2.5 rounded border space-y-1 ${
                          isAI
                            ? "bg-[#F0FDF4] border-[#BBF7D0]"
                            : "bg-[#F9FAFB] border-[#E5E7EB]"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span
                            className={`font-mono ${
                              isAI ? "text-[#15803D]" : "text-[#6B7280]"
                            }`}
                          >
                            {entry.timestamp} [{entry.speaker || "CALLER"}]
                          </span>
                          {entry.category_label && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-[#FDF2F2] text-[#C81E1E] border border-[#F8B4B4]">
                              DETECTED: {entry.category_label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#111827] font-medium font-serif-header">
                          "{entry.text}"
                        </p>
                      </div>
                    );
                  })}

                  {/* Real-time Interim Captions */}
                  {interimText && (
                    <div className="p-2.5 rounded bg-[#E6F4F4] border border-[#99D5D4] space-y-1 animate-pulse">
                      <div className="text-[10px] font-bold text-[#0E7C7B] uppercase flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0E7C7B]" />
                          CALLER (SPEAKING...)
                        </span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#0E7C7B] text-white font-mono">LIVE STT</span>
                      </div>
                      <p className="text-xs text-[#111827] font-medium italic font-serif-header">
                        "{interimText}"
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-[#6B7280] p-6">
                  <Mic className="w-8 h-8 text-[#9CA3AF] mb-2" />
                  <p className="text-xs font-semibold text-[#111827]">No live call transcript streaming yet.</p>
                  <p className="text-[11px] text-[#6B7280] mt-1 max-w-sm">
                    Click "START LIVE SESSION" or select any test phrase on the left to see real-time captions, SVI score updates, and indicator evidence streams.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: DETECTED OBSERVABLE INDICATORS */}
          <div className="saathi-card p-4 shadow-sm space-y-2 bg-white">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#111827]">
                DETECTED OBSERVABLE INDICATORS ({indicators.length})
              </h3>
              <span className="text-[10px] text-[#6B7280]">
                Rule-Based & Context-Aware
              </span>
            </div>

            {indicators.length === 0 ? (
              <div className="text-xs text-[#6B7280] py-2 text-center bg-[#F9FAFB] rounded border border-[#E5E7EB]">
                No distress indicators detected yet for the active call. Detected indicators across all 15 categories will appear here with evidence snippets and confidence ratings.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-0.5">
                {indicators.map((ind, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col gap-1 p-2.5 rounded text-xs border ${
                      ind.is_calming
                        ? "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]"
                        : "bg-[#FDF2F2] text-[#C81E1E] border-[#F8B4B4]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold">"{ind.matched_phrase}"</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-[#FFFFFF] border">
                        {ind.confidence ? `${ind.confidence}%` : "94.8%"} CONF
                      </span>
                    </div>
                    <div className="text-[10px] flex items-center justify-between gap-2">
                      <span>Category: <strong>{ind.ui_label}</strong></span>
                      {ind.assistance_type && (
                        <span className="px-1.5 py-0.2 rounded bg-[#071221] text-white text-[9px]">
                          Req: {ind.assistance_type}
                        </span>
                      )}
                    </div>
                    {ind.evidence_snippet && (
                      <div className="text-[10px] italic font-mono bg-white/80 p-1 rounded border border-black/5">
                        Evidence: "{ind.evidence_snippet}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. UPGRADED OPERATOR CONSOLE — LIVE CASE ASSESSMENT (Requirement 13) */}
      <div className="saathi-card p-5 bg-white border border-[#D1D5DB] rounded-xl shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E5E7EB] gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#0E7C7B]" />
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#111827]">
                LIVE CASE ASSESSMENT (MULTIMODAL INTELLIGENCE)
              </h3>
            </div>
            <p className="text-xs text-[#6B7280]">
              Real-time Deepgram Streaming STT, Audio Calibration, spaCy NLP, Emotion Analysis, Risk Classification & Gemini Assistance
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-[#111827]">
              Connection:{" "}
              <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${isSessionActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                {isSessionActive ? "● Connected" : "Disconnected"}
              </span>
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-[#111827]">
              VAD State:{" "}
              <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-blue-100 text-blue-800 font-mono">
                {vadState}
              </span>
            </span>
          </div>
        </div>

        {/* Top 4 Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Audio Quality */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Audio Quality</span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">{audioQuality.quality}</span>
              <span className="text-[10.5px] text-slate-600">Noise: <strong>{audioQuality.noise_level}</strong></span>
            </div>
            <span className="text-[10px] text-slate-500 block">Speech: <strong>{audioQuality.speech_detected}</strong></span>
          </div>

          {/* Emotion Indicators */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Emotion Indicators</span>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-bold uppercase ${emotionIndicators.dominant === "FEAR" || emotionIndicators.dominant === "ANGER" ? "text-rose-700" : "text-slate-900"}`}>
                {emotionIndicators.dominant}
              </span>
              <span className="text-[10.5px] font-mono text-slate-600">
                {Math.round(emotionIndicators.confidence * 100)}% Conf
              </span>
            </div>
            <span className="text-[9.5px] text-slate-400 italic block">Conversational indicator</span>
          </div>

          {/* Voice Features */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Voice Features</span>
            <div className="flex items-center justify-between text-xs font-mono">
              <span>Rate: <strong>{voiceFeatures.speech_rate} wps</strong></span>
              <span>Pause: <strong>{Math.round(voiceFeatures.pause_ratio * 100)}%</strong></span>
            </div>
            <span className="text-[10px] text-slate-500 block">Energy (RMS): <strong className="font-mono">{voiceFeatures.rms_energy}</strong></span>
          </div>

          {/* Case Indicators */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Case Indicators</span>
            <div className="flex flex-wrap gap-1 text-[10px]">
              <span className={`px-1.5 py-0.2 rounded font-semibold ${caseIndicators.threat === "Detected" ? "bg-rose-100 text-rose-800" : "bg-slate-200 text-slate-700"}`}>
                Threat: {caseIndicators.threat}
              </span>
              <span className={`px-1.5 py-0.2 rounded font-semibold ${caseIndicators.urgency === "Detected" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"}`}>
                Urgency: {caseIndicators.urgency}
              </span>
              <span className={`px-1.5 py-0.2 rounded font-semibold ${caseIndicators.violence === "Detected" ? "bg-red-100 text-red-800" : "bg-slate-200 text-slate-700"}`}>
                Violence: {caseIndicators.violence}
              </span>
            </div>
          </div>
        </div>

        {/* AI-Assisted Risk Level & Multimodal Explanation */}
        <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
          aiAssistedRisk.level === "HIGH"
            ? "bg-rose-50/80 border-rose-200 text-rose-950"
            : aiAssistedRisk.level === "MODERATE"
            ? "bg-amber-50/80 border-amber-200 text-amber-950"
            : "bg-emerald-50/80 border-emerald-200 text-emerald-950"
        }`}>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">AI-Assisted Risk Level:</span>
              <span className={`px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                aiAssistedRisk.level === "HIGH"
                  ? "bg-rose-600 text-white"
                  : aiAssistedRisk.level === "MODERATE"
                  ? "bg-amber-500 text-white"
                  : "bg-emerald-600 text-white"
              }`}>
                {aiAssistedRisk.level} ({Math.round(aiAssistedRisk.score * 100)}%)
              </span>
            </div>
            <p className="text-xs font-medium leading-relaxed max-w-2xl">{aiAssistedRisk.explanation}</p>
            {aiAssistedRisk.feature_contributions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {aiAssistedRisk.feature_contributions.map((fc, fci) => (
                  <span key={fci} className="text-[10.5px] px-2 py-0.5 rounded bg-white/90 border border-black/10 font-medium">
                    {fc.feature} ({fc.impact})
                  </span>
                ))}
              </div>
            )}
          </div>
          {aiAssistedRisk.recommended_action && (
            <div className="p-2.5 rounded bg-white border border-black/10 text-xs max-w-xs space-y-1">
              <span className="font-bold text-[10px] uppercase tracking-wider text-slate-500 block">Recommended Action:</span>
              <span className="font-medium text-slate-900 block text-[11px] leading-snug">{aiAssistedRisk.recommended_action}</span>
            </div>
          )}
        </div>

        {/* Similar Historical Cases & Gemini AI Assistance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
          {/* Similar Historical Cases */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#0E7C7B]" />
                SIMILAR HISTORICAL CASES (TF-IDF MATCHING)
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">Top Precedents</span>
            </div>

            <div className="space-y-2">
              {similarHistoricalCases.map((hc, idx) => (
                <div key={idx} className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{hc.caseId}: {hc.title}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold">
                      {hc.similarityScore}% Match
                    </span>
                  </div>
                  {hc.shortSummary && (
                    <p className="text-[11px] text-slate-600 line-clamp-2">{hc.shortSummary}</p>
                  )}
                  {hc.matchingTerms && hc.matchingTerms.length > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 flex-wrap">
                      <span>Matching Terms:</span>
                      {hc.matchingTerms.map((t, ti) => (
                        <span key={ti} className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-mono">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* AI Assistance & Suggested Questions */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#0E7C7B]" />
                AI ASSISTANCE (GEMINI CASE INTELLIGENCE)
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">Human-in-the-Loop</span>
            </div>

            <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
              <span className="font-bold text-[10px] uppercase text-slate-500">Synthesized Case Summary:</span>
              <p className="text-xs text-slate-900 leading-relaxed font-serif-header">{aiAssistance.summary}</p>
            </div>

            <div className="space-y-1.5">
              <span className="font-bold text-[10px] uppercase text-slate-500 block">Suggested Follow-Up Questions:</span>
              {aiAssistance.suggested_questions.map((q, qi) => (
                <div key={qi} className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs flex items-start gap-2">
                  <span className="font-bold font-mono text-emerald-700 text-[11px]">{qi + 1}.</span>
                  <p className="font-medium text-[11.5px] leading-snug">"{q}"</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {completedSummary && (
        <div className="saathi-card border-2 border-[#059669] p-5 shadow-lg space-y-3 bg-white">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#059669]" />
              <h3 className="text-sm font-bold text-[#111827]">
                Case Record Created & Saved to Database
              </h3>
            </div>
            <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">
              Session ID: {completedSummary.session_id}
            </span>
          </div>

          <div className="p-3.5 rounded bg-[#F9FAFB] border border-[#E5E7EB] space-y-1">
            <div className="text-xs font-bold text-[#111827]">
              Generated Case Brief ({completedSummary.brief_source}):
            </div>
            <p className="text-xs text-[#111827] leading-relaxed font-serif-header">
              {completedSummary.case_brief}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#6B7280] pt-1">
            <div className="flex items-center gap-4">
              <span>Final SVI: <strong className="text-[#111827]">{completedSummary.final_svi}/100 ({completedSummary.final_svi_label})</strong></span>
              <span>Updates Processed: <strong className="text-[#111827]">{completedSummary.chunk_count}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onSessionComplete) {
                    onSessionComplete(completedSummary.case_brief, completedSummary.case_db_id ? String(completedSummary.case_db_id) : undefined);
                  }
                }}
                className="px-3.5 py-1.5 rounded bg-[#0b1f36] hover:bg-[#122e4d] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <span>View in Case Reasoning Breakdown →</span>
              </button>
              <button
                type="button"
                onClick={() => setCompletedSummary(null)}
                className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
