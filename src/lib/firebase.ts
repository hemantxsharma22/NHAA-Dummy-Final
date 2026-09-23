import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth, GoogleAuthProvider } from 'firebase/auth'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'

// Exact Firebase Web App configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
}

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let analyticsInstance: Analytics | null = null

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
}

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = initializeApp(firebaseConfig)
  }
  return app
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp())
  }
  return authInstance
}

export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined') return null
  if (!analyticsInstance && firebaseConfig.measurementId && isFirebaseConfigured()) {
    try {
      const supported = await isSupported()
      if (supported) {
        analyticsInstance = getAnalytics(getFirebaseApp())
      }
    } catch {
      // Analytics unsupported or blocked (e.g. adblocker / private mode)
    }
  }
  return analyticsInstance
}

// Automatically initialize analytics when running in browser
if (typeof window !== 'undefined' && isFirebaseConfigured() && firebaseConfig.measurementId) {
  getFirebaseAnalytics().catch(() => {})
}

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
googleProvider.addScope('email')
googleProvider.addScope('profile')
