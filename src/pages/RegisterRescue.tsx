import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, ArrowLeft, Phone, MapPin, Siren, ShieldAlert, RefreshCw } from 'lucide-react'
import { getApiBaseUrl } from '../saathi/config/api'

export const RegisterRescue: React.FC = () => {
  const [submitted, setSubmitted] = useState(false)
  const [rescueId, setRescueId] = useState('')
  const [citizenName, setCitizenName] = useState('Suresh Kumar')
  const [mobile, setMobile] = useState('9812345678')
  const [stateName, setStateName] = useState('Uttar Pradesh')
  const [district, setDistrict] = useState('Aligarh')
  const [exactLocation, setExactLocation] = useState('Near Primary School, Village Kishanpur, Tehsil Atrauli')
  const [dangerType, setDangerType] = useState('Active physical attack or mob encirclement')
  const [summary, setSummary] = useState(
    "A mob has surrounded the victim's house following a dispute over community land. Immediate police force presence required to prevent violence."
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleRescueSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg('')
    try {
      const fullNarrative = `EMERGENCY SOS: ${dangerType}. Informer: ${citizenName} (${mobile}). Exact Location: ${exactLocation}, ${district}, ${stateName}. Summary: ${summary}`
      const res = await fetch(`${getApiBaseUrl()}/api/complaints/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          narrative: fullNarrative,
          category: 'SOS Emergency Rescue',
          channel: 'emergency_sos',
          location: exactLocation,
          district: `${district}, ${stateName}`,
          is_anonymous: false,
          incident_time: 'Immediate / Ongoing',
          requested_help: 'IMMEDIATE PCR POLICE FORCE DEPLOYMENT & RESCUE',
        }),
      })

      if (!res.ok) {
        throw new Error(`Server returned error ${res.status}`)
      }

      const data = await res.json()
      const registeredUrn = data.case_id || data.complaint_code || `RESCUE-${Date.now()}`
      setRescueId(registeredUrn)
      setSubmitted(true)
    } catch (err: any) {
      console.error('Error submitting rescue SOS:', err)
      setErrorMsg('Failed to transmit emergency rescue to police control room. Please call 14566 or 112 immediately!')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back button */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
          <span>← Back to Dashboard</span>
        </Link>
      </div>

      {/* Emergency Header */}
      <div className="border-b border-red-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-red-100 border border-red-300 flex items-center justify-center text-red-700">
            <AlertOctagon className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-red-950 tracking-tight">
                Register Rescue (आपातकालीन बचाव)
              </h1>
              <span className="px-2 py-0.5 rounded bg-red-600 text-white font-bold text-[10px] uppercase tracking-wider">
                Priority 1 - Distress
              </span>
            </div>
            <p className="text-slate-600 text-sm mt-0.5">
              Quick distress report with essential information. Routed immediately to the District Police Control Room & responding magistrate.
            </p>
          </div>
        </div>
      </div>

      {/* Instant Dial Box */}
      <div className="bg-red-50 border-2 border-red-300 rounded-md p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <Phone className="w-6 h-6 animate-bounce" />
          </div>
          <div>
            <h3 className="font-bold text-red-900 text-sm sm:text-base">
              If you or someone is in imminent bodily harm:
            </h3>
            <p className="text-xs text-red-700">
              Immediately dial our 24x7 Toll-Free National Helpline: <strong className="font-mono text-sm">14566</strong> or Police Emergency <strong className="font-mono text-sm">112</strong>.
            </p>
          </div>
        </div>

        <a
          href="tel:14566"
          className="w-full sm:w-auto px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded shadow-sm flex items-center justify-center gap-2 flex-shrink-0"
        >
          <Phone className="w-4 h-4" />
          <span>Call 14566 Now</span>
        </a>
      </div>

      {submitted ? (
        <div className="bg-white border-2 border-red-400 rounded-md p-6 sm:p-8 shadow-md text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-700 mx-auto flex items-center justify-center border-2 border-red-300">
            <Siren className="w-8 h-8 text-red-700 animate-spin" />
          </div>
          <h2 className="text-2xl font-black text-red-950">
            EMERGENCY RESCUE TICKET DISPATCHED!
          </h2>
          <p className="text-slate-700 max-w-lg mx-auto text-sm">
            The distress alert has been transmitted with highest priority to the District Police Control Room, Superintendent of Police, and the NHAA Rapid Response Cell.
          </p>

          <div className="bg-red-50 border border-red-300 rounded p-4 max-w-md mx-auto">
            <span className="text-xs uppercase font-bold text-red-800 tracking-wider block">
              Rescue Reference ID
            </span>
            <span className="text-3xl font-mono font-extrabold text-red-700 block my-1">
              {rescueId}
            </span>
            <span className="text-xs text-red-800 font-medium">
              Keep your phone accessible. Local police dispatch officers may call this number immediately.
            </span>
          </div>

          <div className="flex justify-center gap-4 pt-4">
            <Link
              to="/track-status"
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded"
            >
              Monitor Dispatch Status →
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleRescueSubmit} className="bg-white border border-slate-300 rounded-md p-5 sm:p-6 shadow-xs space-y-5">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-600" />
              <span>Distress Particulars Form</span>
            </h2>
            <p className="text-xs text-slate-500">
              Only minimum mandatory inputs needed for rapid dispatch.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Citizen Name / Informer *
              </label>
              <input
                type="text"
                required
                value={citizenName}
                onChange={(e) => setCitizenName(e.target.value)}
                placeholder="Name of contact"
                className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-red-600 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Emergency Mobile Number *
              </label>
              <input
                type="tel"
                required
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="10-digit mobile number"
                className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-red-600 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                State / UT *
              </label>
              <select
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 bg-white focus:ring-1 focus:ring-red-600 focus:outline-hidden"
              >
                <option>Uttar Pradesh</option>
                <option>Madhya Pradesh</option>
                <option>Bihar</option>
                <option>Rajasthan</option>
                <option>Maharashtra</option>
                <option>Delhi (NCT)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                District / Location *
              </label>
              <input
                type="text"
                required
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="District name"
                className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-red-600 focus:outline-hidden"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-red-600" />
                <span>Exact Current Location / Landmark (सटीक स्थान) *</span>
              </label>
              <input
                type="text"
                required
                value={exactLocation}
                onChange={(e) => setExactLocation(e.target.value)}
                placeholder="House, road, landmark or GPS coordinates"
                className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-red-600 focus:outline-hidden"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nature of Immediate Danger / Threat (खतरे की प्रकृति) *
              </label>
              <select
                value={dangerType}
                onChange={(e) => setDangerType(e.target.value)}
                className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 bg-white focus:ring-1 focus:ring-red-600 focus:outline-hidden"
              >
                <option>Active physical attack or mob encirclement</option>
                <option>Threat to life / arson / destruction of property</option>
                <option>Illegal confinement / hostage situation</option>
                <option>Denial of hospital entry / medical aid during injury</option>
                <option>Forcible eviction / social boycott enforcement</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Brief Situation Summary *
              </label>
              <textarea
                rows={3}
                required
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full text-xs sm:text-sm border border-slate-300 rounded p-3 focus:ring-1 focus:ring-red-600 focus:outline-hidden"
                placeholder="Mention number of victims in danger, whether weapons are present..."
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-900 text-xs rounded font-bold">
              {errorMsg}
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between flex-wrap gap-4">
            <span className="text-xs text-red-800 font-semibold flex items-center gap-1.5">
              <AlertOctagon className="w-4 h-4" />
              <span>False emergency calls are subject to legal prosecution under Indian Penal Code.</span>
            </span>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold text-sm rounded shadow-sm flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Transmitting SOS to Police PCR...</span>
                </>
              ) : (
                <>
                  <Siren className="w-4 h-4" />
                  <span>Transmit Rescue SOS Now →</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
