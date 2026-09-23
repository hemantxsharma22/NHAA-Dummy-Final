import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Mail, Lock, Eye, EyeOff, ArrowLeft, User,
  Shield, ChevronRight, AlertCircle, CheckCircle2, Phone,
} from 'lucide-react'
import {
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
  resetPassword,
  subscribeToAuthState,
  AuthError,
} from '../services/authService'
import { EmblemOfIndia } from '../components/Emblems'

type AuthMode = 'login' | 'register' | 'forgot'

// Official Google "G" colour icon
const GoogleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

export const CitizenLogin: React.FC = () => {
  const navigate = useNavigate()
  const [mode, setMode] = useState<AuthMode>('login')
  const [showPass, setShowPass] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [aadhaarLast4, setAadhaarLast4] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Real-time auth state listener — if logged in, redirect straight to home page (/)
  useEffect(() => {
    const unsub = subscribeToAuthState((user) => {
      if (user) {
        navigate('/', { replace: true })
      }
    })
    return () => unsub()
  }, [navigate])

  const reset = () => { setSuccessMsg(''); setErrorMsg('') }

  const handleAuthError = (err: unknown) => {
    if (err instanceof AuthError) {
      setErrorMsg(err.message)
    } else {
      setErrorMsg('An unexpected error occurred. Please try again.')
    }
  }

  // ── Google Sign-In ──────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    reset()
    try {
      await signInWithGoogle()
      navigate('/', { replace: true })
    } catch (err) {
      handleAuthError(err)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Email / Password Sign-In ────────────────────────────────────────────────
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    reset()
    try {
      await signInWithEmail(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      handleAuthError(err)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Register ────────────────────────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email || !password || !mobile) {
      setErrorMsg('Please fill all required fields.')
      return
    }
    setIsLoading(true)
    reset()
    try {
      await registerWithEmail(email, password, name)
      navigate('/', { replace: true })
    } catch (err) {
      handleAuthError(err)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Forgot Password ─────────────────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!forgotEmail) { setErrorMsg('Please enter your registered email.'); return }
    setIsLoading(true)
    reset()
    try {
      await resetPassword(forgotEmail)
      setSuccessMsg(`Password reset email sent to ${forgotEmail}. Please check your inbox.`)
    } catch (err) {
      handleAuthError(err)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Login / Register / Forgot UI ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 flex flex-col">

      {/* Government top bar */}
      <div className="bg-[#0c2340] text-white py-2 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-wide">GOVERNMENT OF INDIA</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300">Ministry of Social Justice &amp; Empowerment</span>
          </div>
          <Link to="/" className="text-blue-200 hover:text-white flex items-center gap-1 font-semibold transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Public Portal
          </Link>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 py-10">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">

            {/* Banner */}
            <div className="bg-gradient-to-br from-[#003366] to-[#0f3460] px-6 py-7 text-white text-center relative overflow-hidden">
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white/5 pointer-events-none" />
              <div className="w-16 h-16 mx-auto mb-3 bg-white/10 rounded-full flex items-center justify-center ring-2 ring-white/20 backdrop-blur-sm">
                <EmblemOfIndia className="h-11 w-auto text-amber-200" />
              </div>
              <h1 className="text-lg font-extrabold tracking-wide">Citizen Login Portal</h1>
              <p className="text-blue-200 text-xs mt-1">National Helpline Against Atrocities — NHAA 14566</p>
              <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[11px] font-semibold text-emerald-200">
                <Shield className="w-3 h-3" /> Secured by Google Firebase
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              {(['login', 'register'] as const).map((tab) => (
                <button key={tab} type="button" onClick={() => { setMode(tab); reset() }}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors capitalize ${mode === tab ? 'text-[#003366] border-b-2 border-[#003366] bg-blue-50/50' : 'text-slate-500 hover:text-slate-700'}`}>
                  {tab === 'login' ? 'Sign In' : 'New Registration'}
                </button>
              ))}
            </div>

            <div className="px-6 py-6 space-y-4">

              {/* Feedback banners */}
              {successMsg && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <span>{successMsg}</span>
                </div>
              )}
              {errorMsg && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* ──── SIGN IN ──── */}
              {mode === 'login' && (
                <>
                  {/* Google One-Click Sign-In */}
                  <button
                    type="button"
                    id="citizen-google-signin"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-2 border-slate-200 bg-white hover:bg-slate-50 hover:border-blue-300 hover:shadow-md text-slate-700 font-semibold text-sm shadow-xs transition-all disabled:opacity-60 group cursor-pointer"
                  >
                    {isLoading
                      ? <span className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                      : <GoogleIcon className="w-5 h-5" />
                    }
                    <span className="group-hover:text-[#003366] transition-colors">Continue with Google</span>
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-[11px] text-slate-400 font-medium">OR SIGN IN WITH EMAIL</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>

                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address *</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input id="citizen-email" type="email" required value={email}
                          onChange={e => setEmail(e.target.value)} placeholder="yourname@email.com"
                          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366] transition-all" />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-slate-700">Password *</label>
                        <button type="button" onClick={() => { setMode('forgot'); reset() }}
                          className="text-[11px] text-blue-700 hover:underline font-medium">
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input id="citizen-password" type={showPass ? 'text' : 'password'} required value={password}
                          onChange={e => setPassword(e.target.value)} placeholder="Enter your password"
                          className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366] transition-all" />
                        <button type="button" onClick={() => setShowPass(!showPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button type="submit" id="citizen-email-signin" disabled={isLoading}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#003366] hover:bg-[#002244] active:scale-[0.98] text-white font-bold text-sm shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer">
                      {isLoading
                        ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <><span>Sign In to Portal</span><ChevronRight className="w-4 h-4" /></>
                      }
                    </button>
                  </form>
                </>
              )}

              {/* ──── REGISTER ──── */}
              {mode === 'register' && (
                <>
                  <button type="button" onClick={handleGoogleSignIn} disabled={isLoading}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-2 border-slate-200 bg-white hover:bg-slate-50 hover:border-blue-300 hover:shadow-md text-slate-700 font-semibold text-sm shadow-xs transition-all disabled:opacity-60 group">
                    {isLoading
                      ? <span className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                      : <GoogleIcon className="w-5 h-5" />
                    }
                    <span className="group-hover:text-[#003366] transition-colors">Register with Google</span>
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-[11px] text-slate-400 font-medium">OR CREATE ACCOUNT</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>

                  <form onSubmit={handleRegister} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full Name *</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input id="reg-name" type="text" required value={name} onChange={e => setName(e.target.value)}
                          placeholder="As per Aadhaar / ID proof"
                          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366] transition-all" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address *</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input id="reg-email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                          placeholder="yourname@email.com"
                          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366] transition-all" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Mobile Number *</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input id="reg-mobile" type="tel" required maxLength={10} value={mobile}
                          onChange={e => setMobile(e.target.value.replace(/\D/g, ''))}
                          placeholder="10-digit mobile number"
                          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366] transition-all" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Aadhaar Last 4 Digits{' '}
                        <span className="font-normal text-slate-400">(optional)</span>
                      </label>
                      <input id="reg-aadhaar" type="text" maxLength={4} value={aadhaarLast4}
                        onChange={e => setAadhaarLast4(e.target.value.replace(/\D/g, ''))}
                        placeholder="XXXX"
                        className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366] transition-all tracking-widest font-mono" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Create Password *</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input id="reg-password" type={showPass ? 'text' : 'password'} required value={password}
                          onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters"
                          className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366] transition-all" />
                        <button type="button" onClick={() => setShowPass(!showPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      By registering you agree to the NHAA Portal{' '}
                      <span className="text-[#003366] font-semibold hover:underline cursor-pointer">Terms of Use</span>
                      {' '}and{' '}
                      <span className="text-[#003366] font-semibold hover:underline cursor-pointer">Privacy Policy</span>.
                    </p>

                    <button type="submit" id="citizen-register-btn" disabled={isLoading}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#003366] hover:bg-[#002244] active:scale-[0.98] text-white font-bold text-sm shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                      {isLoading
                        ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <><span>Create My Account</span><ChevronRight className="w-4 h-4" /></>
                      }
                    </button>
                  </form>
                </>
              )}

              {/* ──── FORGOT PASSWORD ──── */}
              {mode === 'forgot' && (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="text-center pb-1">
                    <h2 className="text-sm font-bold text-slate-800">Reset your password</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Enter your registered email — we'll send a reset link instantly.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Registered Email *</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input id="forgot-email" type="email" required value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)} placeholder="yourname@email.com"
                        className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366] transition-all" />
                    </div>
                  </div>

                  <button type="submit" disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#003366] hover:bg-[#002244] text-white font-bold text-sm shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                    {isLoading
                      ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <span>Send Reset Link</span>
                    }
                  </button>

                  <button type="button" onClick={() => { setMode('login'); reset() }}
                    className="w-full text-xs text-blue-700 hover:underline font-semibold py-1">
                    ← Back to Sign In
                  </button>
                </form>
              )}

              {/* Security note */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900 flex items-start gap-2">
                <Shield className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  Protected under the IT Act, 2000 &amp; NHAA privacy guidelines.
                  Powered by Google Firebase — NHAA does not store passwords.
                </span>
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-4">
            Having trouble?{' '}
            <Link to="/help-faqs" className="text-blue-700 hover:underline font-semibold">View FAQs</Link>
            {' '}or call{' '}
            <span className="font-bold text-slate-600">14566</span>
          </p>
        </div>
      </div>

      <div className="bg-[#0c2340] text-slate-400 py-3 text-center text-xs border-t border-slate-700">
        <p>National Informatics Centre (NIC) • Dept. of Social Justice &amp; Empowerment, GoI</p>
      </div>
    </div>
  )
}
