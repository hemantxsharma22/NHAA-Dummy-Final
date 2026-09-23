/**
 * authService.ts
 * Pure Firebase Authentication operations for NHAA Citizen Portal.
 * Uses real Firebase Auth SDK without any demo/mock accounts.
 */
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { getFirebaseAuth, googleProvider, isFirebaseConfigured } from '../lib/firebase'

export class AuthError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

// Map Firebase error codes → user-friendly, actionable messages
function mapFirebaseError(err: unknown): AuthError {
  const code = (err as { code?: string })?.code || ''
  const rawMsg = (err as { message?: string })?.message || ''

  const map: Record<string, string> = {
    'auth/popup-closed-by-user': 'Google sign-in popup was closed before completion. Please try again.',
    'auth/cancelled-popup-request': 'Sign-in request was cancelled. Please try again.',
    'auth/popup-blocked': 'Google sign-in popup was blocked by your browser. Please allow popups for this site and try again.',
    'auth/operation-not-allowed': 'Google Sign-In is not enabled for this project. Please enable Google provider in Firebase Console → Authentication → Sign-in method.',
    'auth/unauthorized-domain': `This domain (${typeof window !== 'undefined' ? window.location.hostname : 'current domain'}) is not authorized in Firebase Console. Please add "${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}" to Firebase Console → Authentication → Settings → Authorized Domains.`,
    'auth/network-request-failed': 'Network error. Please check your internet connection.',
    'auth/user-not-found': 'No account found with this email. Please check your email or click "New Registration".',
    'auth/wrong-password': 'Incorrect password. Please try again or use "Forgot password?".',
    'auth/invalid-credential': 'Invalid credentials. Please check your email and password.',
    'auth/email-already-in-use': 'An account with this email already exists. Please sign in instead.',
    'auth/weak-password': 'Password is too weak. Please use at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many unsuccessful attempts. Access has been temporarily restricted. Please try again later.',
    'auth/internal-error': 'An internal Firebase authentication error occurred. Please try again.',
  }

  return new AuthError(code, map[code] || rawMsg || `Authentication failed (${code || 'unknown'})`)
}

/**
 * Sign in with Google using Firebase Authentication popup
 */
export async function signInWithGoogle(): Promise<User> {
  if (!isFirebaseConfigured()) {
    throw new AuthError('NOT_CONFIGURED', 'Firebase configuration is missing or incomplete.')
  }

  // If running on 127.0.0.1, auto-redirect to localhost to match Firebase default authorized domains
  if (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1') {
    const localhostUrl = `http://localhost:${window.location.port || '5173'}${window.location.pathname}${window.location.search}`
    window.location.href = localhostUrl
    return new Promise(() => {}) // never resolves as page is redirecting
  }

  try {
    const auth = getFirebaseAuth()
    const result = await signInWithPopup(auth, googleProvider)
    return result.user
  } catch (err: unknown) {
    throw mapFirebaseError(err)
  }
}

/**
 * Sign in with Email and Password using Firebase Authentication
 */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  if (!isFirebaseConfigured()) {
    throw new AuthError('NOT_CONFIGURED', 'Firebase configuration is missing or incomplete.')
  }

  try {
    const auth = getFirebaseAuth()
    const result = await signInWithEmailAndPassword(auth, email, password)
    return result.user
  } catch (err: unknown) {
    throw mapFirebaseError(err)
  }
}

/**
 * Register a new user with Email, Password, and Full Name using Firebase Authentication
 */
export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  if (!isFirebaseConfigured()) {
    throw new AuthError('NOT_CONFIGURED', 'Firebase configuration is missing or incomplete.')
  }

  try {
    const auth = getFirebaseAuth()
    const result = await createUserWithEmailAndPassword(auth, email, password)
    if (displayName) {
      await updateProfile(result.user, { displayName })
    }
    return result.user
  } catch (err: unknown) {
    throw mapFirebaseError(err)
  }
}

/**
 * Send password reset email via Firebase Authentication
 */
export async function resetPassword(email: string): Promise<void> {
  if (!isFirebaseConfigured()) {
    throw new AuthError('NOT_CONFIGURED', 'Firebase configuration is missing or incomplete.')
  }

  try {
    const auth = getFirebaseAuth()
    await sendPasswordResetEmail(auth, email)
  } catch (err: unknown) {
    throw mapFirebaseError(err)
  }
}

/**
 * Sign out the currently logged-in Firebase user
 */
export async function signOutUser(): Promise<void> {
  try {
    const auth = getFirebaseAuth()
    await fbSignOut(auth)
  } catch (err) {
    console.error('Error during Firebase sign out:', err)
  }
}

/**
 * Subscribe to real Firebase authentication state changes
 */
export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  if (!isFirebaseConfigured()) return () => {}

  try {
    const auth = getFirebaseAuth()
    return onAuthStateChanged(auth, callback)
  } catch (err) {
    console.error('Error attaching Firebase auth state listener:', err)
    return () => {}
  }
}
