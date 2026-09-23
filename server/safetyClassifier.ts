// Saathi AI safety classifier — Node-side wrapper around the Python sidecar.
//
// The trained scikit-learn model lives in backend/saathi_model/safety_model.pkl.
// We boot a tiny Python HTTP sidecar (safety_model_server.py) that loads the
// .pkl once and exposes POST /score. This file:
//   1) (optionally) auto-starts the sidecar at server boot
//   2) exposes a simple async `scoreSafetyText(text)` function
//   3) falls back to a lightweight keyword heuristic if the sidecar is
//      unreachable (e.g. Python not installed, demo mode, cold start)

import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..')
const MODEL_DIR = path.resolve(PROJECT_ROOT, 'backend', 'saathi_model')
const MODEL_PKL = path.join(MODEL_DIR, 'safety_model.pkl')
const META_JSON = path.join(MODEL_DIR, 'safety_model.meta.json')
const SERVER_SCRIPT = path.join(MODEL_DIR, 'safety_model_server.py')

export interface SafetyVerdict {
  score: number
  label: 0 | 1
  label_str: 'safe' | 'safety_threat'
  decision: 'safe' | 'safety_threat'
  threshold: number
  /** 'model' if produced by the trained sklearn pipeline, 'heuristic' otherwise. */
  source: 'model' | 'heuristic'
  /** Set when the model sidecar was unreachable; the fallback was used instead. */
  fallbackReason?: string
}

const DEFAULT_THRESHOLD = Number(process.env.SAATHI_SAFETY_THRESHOLD || '0.5')
const SIDECAR_HOST = process.env.SAATHI_SAFETY_HOST || '127.0.0.1'
const SIDECAR_PORT = Number(process.env.SAATHI_SAFETY_PORT || '8765')
const SIDECAR_URL = `http://${SIDECAR_HOST}:${SIDECAR_PORT}`
const SIDECAR_BOOT_TIMEOUT_MS = 12_000
const SIDECAR_HEALTH_POLL_MS = 250

let cachedMeta: { threshold: number; version: string; labels: Record<string, string> } | null = null
let sidecarProc: ChildProcess | null = null
let sidecarStartedAt = 0

function readMetaSync(): { threshold: number; version: string; labels: Record<string, string> } | null {
  if (cachedMeta) return cachedMeta
  try {
    if (!fs.existsSync(META_JSON)) return null
    const raw = fs.readFileSync(META_JSON, 'utf8')
    const parsed = JSON.parse(raw)
    cachedMeta = {
      threshold: Number(parsed.threshold ?? DEFAULT_THRESHOLD),
      version: String(parsed.version ?? 'unknown'),
      labels: parsed.label_map ?? { '1': 'safety_threat', '0': 'safe' },
    }
    return cachedMeta
  } catch {
    return null
  }
}

function heuristicScore(text: string): number {
  // Lightweight fallback used when the trained model is unavailable.
  // Kept intentionally conservative — we only return high scores for
  // very strong, unambiguous safety signals.
  const lower = (text || '').toLowerCase()
  const hardSignals = [
    'kill', 'suicide', 'murder', 'weapon', 'bomb', 'gunshot', 'firing', 'attack',
    'hathiyar', 'hamla', 'dhamki', 'maar dalega', 'jaan', 'khatam kar', 'latak',
    'rassi', 'jala dena', 'aag laga', 'lynch', 'acid',
    'मार डाल', 'हथियार', 'बम', 'गोली', 'आग', 'फाँसी', 'हमला',
  ]
  let hits = 0
  for (const k of hardSignals) if (lower.includes(k)) hits++
  if (hits === 0) return 0.05
  if (hits === 1) return 0.6
  return 0.9
}

export async function scoreSafetyText(text: string, threshold?: number): Promise<SafetyVerdict> {
  const usedThreshold = typeof threshold === 'number' ? threshold : DEFAULT_THRESHOLD
  const stripped = (text || '').trim()
  if (!stripped) {
    return {
      score: 0,
      label: 0,
      label_str: 'safe',
      decision: 'safe',
      threshold: usedThreshold,
      source: 'heuristic',
    }
  }

  try {
    await ensureSidecar()
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(`${SIDECAR_URL}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: stripped, threshold: usedThreshold }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`sidecar HTTP ${res.status}`)
    const json = (await res.json()) as {
      score: number
      label: 0 | 1
      label_str: 'safe' | 'safety_threat'
      decision: 'safe' | 'safety_threat'
      threshold: number
    }
    return { ...json, source: 'model' }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    const score = heuristicScore(stripped)
    const label: 0 | 1 = score >= usedThreshold ? 1 : 0
    return {
      score,
      label,
      label_str: label === 1 ? 'safety_threat' : 'safe',
      decision: label === 1 ? 'safety_threat' : 'safe',
      threshold: usedThreshold,
      source: 'heuristic',
      fallbackReason: reason,
    }
  }
}

async function isSidecarHealthy(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 1000)
    const res = await fetch(`${SIDECAR_URL}/health`, { signal: ctrl.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

async function waitForHealthy(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isSidecarHealthy()) return true
    await new Promise((r) => setTimeout(r, SIDECAR_HEALTH_POLL_MS))
  }
  return false
}

async function ensureSidecar(): Promise<void> {
  if (await isSidecarHealthy()) return
  // If the .pkl doesn't exist we silently fall back to heuristic for this call.
  // (Training happens at deploy / dev time, not on hot path.)
  if (!fs.existsSync(MODEL_PKL)) throw new Error(`model not found at ${MODEL_PKL}`)
  if (sidecarProc) {
    // Already tried to start it once during this process lifetime; don't keep spawning.
    if (Date.now() - sidecarStartedAt < 60_000) return
  }

  const python = process.env.SAATHI_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
  sidecarStartedAt = Date.now()
  try {
    const proc = spawn(
      python,
      [SERVER_SCRIPT, '--host', SIDECAR_HOST, '--port', String(SIDECAR_PORT), '--model', MODEL_PKL],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    sidecarProc = proc
    proc.stdout?.on('data', (b) => process.stdout.write(`[saathi-safety] ${b}`))
    proc.stderr?.on('data', (b) => process.stderr.write(`[saathi-safety] ${b}`))
    proc.on('exit', (code) => {
      if (code !== 0) console.warn(`[saathi-safety] sidecar exited with code ${code}`)
      sidecarProc = null
    })
  } catch (err) {
    console.warn('[saathi-safety] failed to spawn sidecar:', err)
    sidecarProc = null
    throw err
  }

  const ok = await waitForHealthy(SIDECAR_BOOT_TIMEOUT_MS)
  if (!ok) throw new Error('sidecar did not become healthy in time')
}

export function safetyStatus(): { modelAvailable: boolean; threshold: number; sidecarUrl: string; meta: ReturnType<typeof readMetaSync> } {
  const meta = readMetaSync()
  const modelAvailable = fs.existsSync(MODEL_PKL)
  return {
    modelAvailable,
    threshold: meta?.threshold ?? DEFAULT_THRESHOLD,
    sidecarUrl: SIDECAR_URL,
    meta,
  }
}

export function shutdownSidecar(): void {
  if (sidecarProc && !sidecarProc.killed) {
    try {
      sidecarProc.kill()
    } catch {
      /* ignore */
    }
    sidecarProc = null
  }
}
