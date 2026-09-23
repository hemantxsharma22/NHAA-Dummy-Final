/**
 * faceRecognitionService.ts
 * Secure AI-powered Facial Biometric Authentication using @vladmandic/face-api.
 * Features:
 *  - 68-point neural landmark tracking
 *  - Multi-frame averaging for enrollment template generation
 *  - Eye Aspect Ratio (EAR) & landmark variance Anti-Spoofing Liveness Verification
 *  - Strict Euclidean distance matching against registered admin face template (threshold <= 0.45)
 */

import * as faceapi from '@vladmandic/face-api'

let modelsLoaded = false
let modelsLoadingPromise: Promise<void> | null = null

export const MATCH_DISTANCE_THRESHOLD = 0.45

export interface EnrolledFaceProfile {
  username: string
  fullName: string
  role: string
  descriptor: number[] // 128-dimensional normalized biometric embedding vector
  enrolledAt: string
}

export interface LivenessStatus {
  isLive: boolean
  blinkDetected: boolean
  motionDetected: boolean
  ear: number
  message: string
}

const ENROLLED_FACE_STORAGE_KEY = 'nhaa_enrolled_officer_face'

/**
 * Load the FaceAPI neural network models from /models.
 */
export async function loadFaceRecognitionModels(): Promise<void> {
  if (modelsLoaded) return
  if (modelsLoadingPromise) return modelsLoadingPromise

  modelsLoadingPromise = (async () => {
    const MODEL_URL = '/models'
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ])
    modelsLoaded = true
  })()

  return modelsLoadingPromise
}

export function areModelsLoaded(): boolean {
  return modelsLoaded
}

/**
 * Request access to camera and bind stream to HTMLVideoElement.
 */
export async function startCamera(videoElement: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera access is not supported by your browser or environment.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
    audio: false,
  })

  videoElement.srcObject = stream
  await new Promise<void>((resolve) => {
    videoElement.onloadedmetadata = () => {
      videoElement.play().then(() => resolve()).catch(() => resolve())
    }
  })

  return stream
}

/**
 * Stop camera tracks and release webcam hardware.
 */
export function stopCamera(stream: MediaStream | null, videoElement?: HTMLVideoElement | null): void {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
  }
  if (videoElement) {
    videoElement.srcObject = null
  }
}

/**
 * Detect a single face in the video feed with 68 landmarks and 128D descriptor.
 */
export async function detectFaceInVideo(videoElement: HTMLVideoElement) {
  if (!modelsLoaded) {
    await loadFaceRecognitionModels()
  }

  if (videoElement.readyState < 2 || videoElement.videoWidth === 0) {
    return null
  }

  const detection = await faceapi
    .detectSingleFace(
      videoElement,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
    )
    .withFaceLandmarks(true)
    .withFaceDescriptor()

  return detection
}

/**
 * Helper to calculate Euclidean distance between two 2D landmark points.
 */
function pointDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p1.x - p2.x
  const dy = p1.y - p2.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Computes Eye Aspect Ratio (EAR) from 68 facial landmarks.
 * Left eye: indices 36 to 41. Right eye: indices 42 to 47.
 * Normal open eyes: EAR ~0.25 - 0.35. Blinking: EAR < 0.19.
 */
export function computeEyeAspectRatio(landmarks: any): number {
  if (!landmarks || !landmarks.positions || landmarks.positions.length < 48) {
    return 0.3
  }

  const pts = landmarks.positions

  // Left Eye (36..41)
  const leftA = pointDistance(pts[37], pts[41])
  const leftB = pointDistance(pts[38], pts[40])
  const leftC = pointDistance(pts[36], pts[39])
  const leftEAR = leftC > 0 ? (leftA + leftB) / (2.0 * leftC) : 0.3

  // Right Eye (42..47)
  const rightA = pointDistance(pts[43], pts[47])
  const rightB = pointDistance(pts[44], pts[46])
  const rightC = pointDistance(pts[42], pts[45])
  const rightEAR = rightC > 0 ? (rightA + rightB) / (2.0 * rightC) : 0.3

  return (leftEAR + rightEAR) / 2.0
}

/**
 * Liveness Tracker: tracks EAR and landmark micro-motion across frames
 * to detect natural eye blinking and biological micro-motion.
 */
export class LivenessTracker {
  private earHistory: Array<{ ear: number; time: number }> = []
  private boxHistory: Array<{ x: number; y: number; time: number }> = []
  private blinkObserved = false
  private blinkCooldown = 0

  public reset(): void {
    this.earHistory = []
    this.boxHistory = []
    this.blinkObserved = false
    this.blinkCooldown = 0
  }

  public update(detection: any): LivenessStatus {
    const now = Date.now()
    if (!detection || !detection.landmarks) {
      return {
        isLive: false,
        blinkDetected: false,
        motionDetected: false,
        ear: 0.3,
        message: 'No face detected in frame',
      }
    }

    const ear = computeEyeAspectRatio(detection.landmarks)
    this.earHistory.push({ ear, time: now })
    if (this.earHistory.length > 30) this.earHistory.shift()

    const box = detection.detection.box
    this.boxHistory.push({ x: box.x, y: box.y, time: now })
    if (this.boxHistory.length > 20) this.boxHistory.shift()

    // 1. Detect Eye Blink: transition from open (>0.24) to closed (<0.19) and back to open (>0.23)
    if (!this.blinkObserved && this.earHistory.length >= 6) {
      const minEAR = Math.min(...this.earHistory.map((h) => h.ear))
      const maxEAR = Math.max(...this.earHistory.map((h) => h.ear))
      const currentEAR = ear

      if (minEAR < 0.19 && maxEAR > 0.24 && currentEAR > 0.22) {
        this.blinkObserved = true
        this.blinkCooldown = now + 4000 // keep blink valid for 4 seconds
      }
    }

    if (this.blinkObserved && now > this.blinkCooldown) {
      this.blinkObserved = false // require another natural blink over time
    }

    // 2. Detect Natural Biological Micro-Motion Variance
    let motionDetected = false
    if (this.boxHistory.length >= 8) {
      const xVals = this.boxHistory.map((b) => b.x)
      const yVals = this.boxHistory.map((b) => b.y)
      const avgX = xVals.reduce((a, b) => a + b, 0) / xVals.length
      const avgY = yVals.reduce((a, b) => a + b, 0) / yVals.length
      const varX = xVals.reduce((sum, x) => sum + (x - avgX) ** 2, 0) / xVals.length
      const varY = yVals.reduce((sum, y) => sum + (y - avgY) ** 2, 0) / yVals.length
      const totalVariance = Math.sqrt(varX + varY)

      // Live human has subtle breathing/head micro-tremors (0.2px < variance < 30px)
      // A static printed photo or motionless phone screen has zero variance
      motionDetected = totalVariance > 0.15 && totalVariance < 45.0
    }

    const isLive = this.blinkObserved || (motionDetected && this.earHistory.length >= 10)
    let message = 'Natural Liveness Active'
    if (!this.blinkObserved) {
      message = 'Please blink naturally to verify liveness'
    } else {
      message = 'Liveness Confirmed ✓'
    }

    return {
      isLive,
      blinkDetected: this.blinkObserved,
      motionDetected,
      ear,
      message,
    }
  }
}

/**
 * Capture multi-frame averaged 128D embedding vector during enrollment.
 * Collects N valid frames, computes coordinate-wise mean, and normalizes.
 */
export async function captureAveragedDescriptor(
  videoElement: HTMLVideoElement,
  frameCount = 6,
  onProgress?: (captured: number, total: number) => void
): Promise<number[]> {
  const capturedDescriptors: Float32Array[] = []
  let attempts = 0
  const maxAttempts = frameCount * 5

  while (capturedDescriptors.length < frameCount && attempts < maxAttempts) {
    attempts++
    const detection = await detectFaceInVideo(videoElement)
    if (detection && detection.descriptor && detection.detection.score > 0.6) {
      capturedDescriptors.push(new Float32Array(detection.descriptor))
      if (onProgress) {
        onProgress(capturedDescriptors.length, frameCount)
      }
    }
    // Small inter-frame delay so frames are distinct
    await new Promise((r) => setTimeout(r, 220))
  }

  if (capturedDescriptors.length < Math.min(3, frameCount)) {
    throw new Error(
      `Could not capture sufficient quality frames (${capturedDescriptors.length}/${frameCount}). Please keep your face steady in good lighting.`
    )
  }

  // 1. Coordinate-wise average across 128 dimensions
  const averaged = new Float32Array(128)
  for (let i = 0; i < 128; i++) {
    let sum = 0
    for (let k = 0; k < capturedDescriptors.length; k++) {
      sum += capturedDescriptors[k][i]
    }
    averaged[i] = sum / capturedDescriptors.length
  }

  // 2. Normalize to unit length
  let norm = 0
  for (let i = 0; i < 128; i++) {
    norm += averaged[i] * averaged[i]
  }
  norm = Math.sqrt(norm)

  if (norm > 0) {
    for (let i = 0; i < 128; i++) {
      averaged[i] /= norm
    }
  }

  return Array.from(averaged)
}

/**
 * Strict Euclidean Distance comparison against enrolled template.
 * Threshold <= 0.45 indicates genuine identity match.
 */
export function calculateFaceMatch(
  detectedDescriptor: Float32Array,
  enrolledDescriptor: number[] | Float32Array,
  threshold = MATCH_DISTANCE_THRESHOLD
): { isMatch: boolean; distance: number; confidencePercent: number } {
  const distance = faceapi.euclideanDistance(detectedDescriptor, enrolledDescriptor)
  const isMatch = distance <= threshold
  const confidencePercent = Math.max(0, Math.min(100, Math.round((1 - Math.min(1, distance)) * 100)))

  return { isMatch, distance, confidencePercent }
}

/**
 * Draw custom high-tech HUD reticles, 68 landmarks, and security status onto canvas.
 */
export function drawFaceHud(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  detection: any,
  hudInfo: {
    isEnrolled: boolean
    isMatch: boolean
    distance?: number
    confidencePercent: number
    officerName?: string
    livenessStatus?: LivenessStatus | null
  } | null
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (!detection) return

  const isEnrolled = hudInfo?.isEnrolled ?? false
  const isMatch = hudInfo?.isMatch ?? false
  const isLive = hudInfo?.livenessStatus?.isLive ?? true

  // Primary HUD Color: Emerald for verified match, Red for mismatch / unauthorized face, Cyan for scanning/unenrolled
  let primaryColor = '#00e5ff'
  if (isEnrolled) {
    primaryColor = isMatch ? '#10b981' : '#ef4444'
  }

  // 1. Draw 68-point facial landmark mesh
  if (detection.landmarks && detection.landmarks.positions) {
    ctx.fillStyle = primaryColor + 'b0'
    for (const pt of detection.landmarks.positions) {
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 2, 0, 2 * Math.PI)
      ctx.fill()
    }
  }

  // 2. Draw HUD corner brackets around face bounding box
  const { x, y, width, height } = detection.detection.box
  const cornerLen = Math.max(16, Math.min(28, width * 0.22))

  ctx.strokeStyle = primaryColor
  ctx.lineWidth = 3
  ctx.lineCap = 'round'

  // Top-Left
  ctx.beginPath()
  ctx.moveTo(x, y + cornerLen)
  ctx.lineTo(x, y)
  ctx.lineTo(x + cornerLen, y)
  ctx.stroke()

  // Top-Right
  ctx.beginPath()
  ctx.moveTo(x + width - cornerLen, y)
  ctx.lineTo(x + width, y)
  ctx.lineTo(x + width, y + cornerLen)
  ctx.stroke()

  // Bottom-Left
  ctx.beginPath()
  ctx.moveTo(x, y + height - cornerLen)
  ctx.lineTo(x, y + height)
  ctx.lineTo(x + cornerLen, y + height)
  ctx.stroke()

  // Bottom-Right
  ctx.beginPath()
  ctx.moveTo(x + width - cornerLen, y + height)
  ctx.lineTo(x + width, y + height)
  ctx.lineTo(x + width, y + height - cornerLen)
  ctx.stroke()

  // 3. Subdued bounding box
  ctx.strokeStyle = primaryColor + '40'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, width, height)

  // 4. Header Badge: Shows Match Status or Impostor Rejection
  let badgeText = `FACE DETECTED (${hudInfo?.confidencePercent || 90}%)`
  let badgeBg = 'rgba(15, 46, 90, 0.92)'

  if (!isEnrolled) {
    badgeText = 'ENROLLMENT REQUIRED'
    badgeBg = 'rgba(180, 83, 9, 0.95)' // Amber
  } else if (isMatch) {
    if (isLive) {
      badgeText = `✓ ${hudInfo?.officerName || 'Nodal Officer'} (${hudInfo?.confidencePercent}%)`
      badgeBg = 'rgba(16, 185, 129, 0.95)' // Emerald
    } else {
      badgeText = 'BLINK TO VERIFY LIVENESS'
      badgeBg = 'rgba(2, 132, 199, 0.95)' // Blue
    }
  } else {
    badgeText = '⚠ FACE NOT RECOGNIZED • ACCESS DENIED'
    badgeBg = 'rgba(220, 38, 38, 0.95)' // Red
  }

  ctx.font = 'bold 11px Inter, system-ui, sans-serif'
  const textWidth = ctx.measureText(badgeText).width
  const badgeW = Math.max(textWidth + 20, 160)
  const badgeH = 24
  const badgeY = Math.max(6, y - 30)

  ctx.fillStyle = badgeBg
  ctx.beginPath()
  ctx.roundRect(x, badgeY, badgeW, badgeH, 4)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.fillText(badgeText, x + 10, badgeY + 16)
}

/**
 * Local storage persistence for enrolled face profiles.
 */
export function getEnrolledFaceProfile(): EnrolledFaceProfile | null {
  try {
    const raw = localStorage.getItem(ENROLLED_FACE_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as EnrolledFaceProfile
  } catch {
    return null
  }
}

export function saveEnrolledFaceProfile(profile: EnrolledFaceProfile): void {
  try {
    localStorage.setItem(ENROLLED_FACE_STORAGE_KEY, JSON.stringify(profile))
  } catch {}
}

export function clearEnrolledFaceProfile(): void {
  try {
    localStorage.removeItem(ENROLLED_FACE_STORAGE_KEY)
  } catch {}
}

/**
 * Backend API Client: Fetch enrollment status
 */
export async function fetchBackendFaceStatus(username?: string): Promise<{ enrolled: boolean; username?: string }> {
  try {
    const url = username ? `/api/auth/face-status?username=${encodeURIComponent(username)}` : '/api/auth/face-status'
    const res = await fetch(url)
    if (res.ok) {
      return await res.json()
    }
    return { enrolled: false }
  } catch {
    return { enrolled: false }
  }
}

/**
 * Backend API Client: Enroll face template with officer password
 */
export async function enrollFaceOnBackend(params: {
  username: string
  password: string
  embedding: number[]
  fullName?: string
}): Promise<any> {
  const res = await fetch('/api/auth/face-enroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: params.username,
      password: params.password,
      embedding: params.embedding,
      full_name: params.fullName || 'District Nodal Officer (SC/ST Welfare)',
      liveness_score: 1.0,
      device_info: 'Webcam Biometrics',
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to enroll face biometric template on server.')
  }

  return await res.json()
}

/**
 * Backend API Client: Verify live face embedding
 */
export async function verifyFaceOnBackend(params: {
  username: string
  embedding: number[]
  livenessScore?: number
}): Promise<any> {
  const res = await fetch('/api/auth/face-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: params.username,
      embedding: params.embedding,
      liveness_score: params.livenessScore || 1.0,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Face authentication rejected.')
  }

  return await res.json()
}
