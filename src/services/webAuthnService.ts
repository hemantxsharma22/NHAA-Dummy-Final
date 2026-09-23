/**
 * webAuthnService.ts
 * Real W3C WebAuthn & FIDO2 Passkey Biometric Authentication Service.
 * Interfaces with device hardware biometrics (Windows Hello Face, Apple Face ID / Touch ID)
 * without capturing, transmitting, or storing any raw facial bitmaps or biometric vectors.
 */

export interface EnrolledPasskeyData {
  username: string
  credentialId: string
  deviceName: string
  enrolledAt: string
}

export interface WebAuthnUserSession {
  access_token: string
  token_type: string
  role: string
  username: string
  user_id: number
  full_name?: string
}

// ── Binary & Base64URL Conversion Helpers ─────────────────────────────────────
export function bufferToBase64URL(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function base64URLToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// ── Hardware & Browser Capability Checks ──────────────────────────────────────
export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.PublicKeyCredential)
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false
  if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    try {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    } catch {
      return false
    }
  }
  return true
}

// ── Local Device Passkey Registry ─────────────────────────────────────────────
const STORAGE_KEY = 'nhaa_passkey_enrolled_admin'

export function getLocalEnrolledPasskey(): EnrolledPasskeyData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as EnrolledPasskeyData
  } catch {
    return null
  }
}

export function saveLocalEnrolledPasskey(data: EnrolledPasskeyData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

export function clearLocalEnrolledPasskey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

// ── First-Time Admin Biometric Enrollment ─────────────────────────────────────
export async function enrollAdminBiometricPasskey(params: {
  username: string
  password?: string
  displayName?: string
}): Promise<WebAuthnUserSession> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn biometric authentication is not supported on this browser.')
  }

  // 1. Fetch challenge from backend
  const challengeRes = await fetch('/api/auth/webauthn/register-challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!challengeRes.ok) {
    throw new Error('Failed to obtain enrollment challenge from authentication server.')
  }

  const { challenge, rp_id, rp_name } = await challengeRes.json()

  // 2. Prepare user id buffer
  const encoder = new TextEncoder()
  const userIdBuffer = encoder.encode(params.username)

  // 3. Trigger OS native biometric registration (Windows Hello Face / Passkey)
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: base64URLToBuffer(challenge),
      rp: {
        name: rp_name || 'NHAA 14566 National Portal',
        id: rp_id || window.location.hostname || 'localhost',
      },
      user: {
        id: userIdBuffer,
        name: params.username,
        displayName: params.displayName || 'Authorized Nodal Officer',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256 (Primary)
        { alg: -257, type: 'public-key' }, // RS256 (Windows Hello fallback)
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Enforce native device hardware (Windows Hello Face / Touch ID)
        userVerification: 'required',        // Strictly require biometric check or device security
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('Device biometric registration returned an empty credential.')
  }

  const credentialId = bufferToBase64URL(credential.rawId)
  const response = credential.response as AuthenticatorAttestationResponse
  const publicKeyStr = response.getPublicKey
    ? bufferToBase64URL(response.getPublicKey() || new ArrayBuffer(0))
    : credentialId

  // 4. Register credential with backend
  const registerRes = await fetch('/api/auth/webauthn/register-credential', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: params.username,
      password: params.password,
      credential_id: credentialId,
      public_key: publicKeyStr,
      device_name: 'Windows Hello / Platform Biometric',
      transports: ['internal'],
    }),
  })

  if (!registerRes.ok) {
    const errData = await registerRes.json().catch(() => ({}))
    throw new Error(errData.detail || 'Failed to complete biometric credential enrollment.')
  }

  const sessionData: WebAuthnUserSession = await registerRes.json()

  // 5. Save enrolled state locally
  saveLocalEnrolledPasskey({
    username: params.username,
    credentialId,
    deviceName: 'Windows Hello / Platform Biometric',
    enrolledAt: new Date().toISOString(),
  })

  // Store session in localStorage
  localStorage.setItem('nhaa_token', sessionData.access_token)
  localStorage.setItem('nhaa_user', JSON.stringify(sessionData))

  return sessionData
}

// ── Authenticate Existing Enrolled Face / Passkey ─────────────────────────────
export async function authenticateWithBiometricPasskey(
  username: string = 'nodal.officer@dosje.gov.in'
): Promise<WebAuthnUserSession> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn biometric authentication is not supported on this browser.')
  }

  // 1. Fetch challenge from backend
  const challengeRes = await fetch('/api/auth/webauthn/auth-challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!challengeRes.ok) {
    throw new Error('Failed to obtain authentication challenge from server.')
  }

  const { challenge, rp_id } = await challengeRes.json()
  const enrolled = getLocalEnrolledPasskey()

  // 2. Build allowCredentials if enrolled credential ID exists
  const allowCredentials: PublicKeyCredentialDescriptor[] = []
  if (enrolled?.credentialId) {
    try {
      allowCredentials.push({
        id: base64URLToBuffer(enrolled.credentialId),
        type: 'public-key',
        transports: ['internal'],
      })
    } catch {}
  }

  // 3. Trigger native Windows Hello / Face prompt
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: base64URLToBuffer(challenge),
      rpId: rp_id || window.location.hostname || 'localhost',
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
      userVerification: 'required', // Enforces Windows Hello Face or biometric check
      timeout: 60000,
    },
  })) as PublicKeyCredential | null

  if (!assertion) {
    throw new Error('Biometric assertion was not returned by the device.')
  }

  const credentialId = bufferToBase64URL(assertion.rawId)
  const response = assertion.response as AuthenticatorAssertionResponse

  const clientDataJSON = response.clientDataJSON
    ? bufferToBase64URL(response.clientDataJSON)
    : undefined
  const authenticatorData = response.authenticatorData
    ? bufferToBase64URL(response.authenticatorData)
    : undefined
  const signature = response.signature
    ? bufferToBase64URL(response.signature)
    : undefined

  // 4. Verify assertion on backend
  const verifyRes = await fetch('/api/auth/webauthn/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: enrolled?.username || username,
      credential_id: credentialId,
      client_data_json: clientDataJSON,
      authenticator_data: authenticatorData,
      signature: signature,
    }),
  })

  if (!verifyRes.ok) {
    const errData = await verifyRes.json().catch(() => ({}))
    throw new Error(errData.detail || 'Biometric verification was rejected by the server.')
  }

  const sessionData: WebAuthnUserSession = await verifyRes.json()

  // Store session in localStorage
  localStorage.setItem('nhaa_token', sessionData.access_token)
  localStorage.setItem('nhaa_user', JSON.stringify(sessionData))

  return sessionData
}
