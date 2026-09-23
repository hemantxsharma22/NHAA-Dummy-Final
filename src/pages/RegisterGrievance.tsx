import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, ArrowLeft, CheckCircle2, Upload, AlertCircle, Shield, RefreshCw } from 'lucide-react'
import { getApiBaseUrl } from '../saathi/config/api'

export const RegisterGrievance: React.FC = () => {
  const [submitted, setSubmitted] = useState(false)
  const [token, setToken] = useState('')
  const [role, setRole] = useState<'victim' | 'informer' | 'ngo'>('victim')
  const [fullName, setFullName] = useState('Rameshwar Kumar')
  const [mobile, setMobile] = useState('9876543210')
  const [community, setCommunity] = useState('Scheduled Caste (SC)')
  const [address, setAddress] = useState('Village Ramgarh, Post Office Kalan')
  const [pinCode, setPinCode] = useState('201001')
  const [stateName, setStateName] = useState('Uttar Pradesh')
  const [district, setDistrict] = useState('Ghaziabad')
  const [policeStation, setPoliceStation] = useState('Kotwali Police Station')
  const [incidentDate, setIncidentDate] = useState('2026-09-01')
  const [offenceCategory, setOffenceCategory] = useState('Social Boycott / Denial of Access to Public Resources')
  const [narrative, setNarrative] = useState(
    'Complainant was prevented from accessing common drinking water borewell and subjected to caste abuses by local perpetrators. Local police have not registered FIR yet.'
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg('')
    try {
      const fullLocation = [address, district, stateName, pinCode].filter(Boolean).join(', ')
      const fullNarrative = `Complainant: ${fullName} (${community}, Mobile: ${mobile}). Police Station: ${policeStation}. Incident Details: ${narrative}`

      const res = await fetch(`${getApiBaseUrl()}/api/complaints/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          narrative: fullNarrative,
          category: offenceCategory,
          channel: 'web',
          location: fullLocation,
          district: `${district}, ${stateName}`,
          is_anonymous: role === 'informer',
          incident_time: incidentDate,
          requested_help: 'Immediate FIR registration under SC/ST PoA Act and police protection.',
        }),
      })

      if (!res.ok) {
        throw new Error(`Server returned error ${res.status}`)
      }

      const data = await res.json()
      const registeredUrn = data.case_id || data.complaint_code || `NHAA-${Date.now()}`
      setToken(registeredUrn)
      setSubmitted(true)
    } catch (err: any) {
      console.error('Error submitting grievance:', err)
      setErrorMsg('Failed to record grievance on the central registry. Please verify backend connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
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

      {/* Page Header */}
      <div className="border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-800">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0c2340] tracking-tight">
              Register Grievance
            </h1>
            <p className="text-slate-600 text-sm mt-0.5">
              Scheduled Castes and Scheduled Tribes (Prevention of Atrocities) Act, 1989
            </p>
          </div>
        </div>
      </div>

      {submitted ? (
        <div className="bg-white border border-slate-300 rounded-md p-6 sm:p-8 shadow-xs text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center border border-emerald-300">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            Grievance Registered Successfully!
          </h2>
          <p className="text-slate-600 max-w-lg mx-auto text-sm">
            Your grievance dossier has been recorded and automatically routed to the District Superintendent of Police and Nodal Officer.
          </p>

          <div className="bg-slate-50 border border-slate-300 rounded p-4 max-w-md mx-auto">
            <span className="text-xs uppercase font-bold text-slate-500 tracking-wider block">
              Grievance Reference Number (URN)
            </span>
            <span className="text-2xl font-mono font-extrabold text-blue-900 block my-1">
              {token}
            </span>
            <span className="text-xs text-slate-500">
              Please save this URN for tracking status and receiving SMS/telephonic updates.
            </span>
          </div>

          <div className="flex justify-center gap-4 pt-4">
            <Link
              to="/track-status"
              className="px-4 py-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold rounded"
            >
              Track Application Status →
            </Link>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-semibold rounded hover:bg-slate-50"
            >
              Register Another Grievance
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Complainant Type Selection */}
          <div className="bg-white border border-slate-300 rounded-md p-5 sm:p-6 shadow-xs">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-800" />
              <span>1. Complainant Classification</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label
                className={`p-3.5 border rounded cursor-pointer transition-colors flex items-start gap-3 ${
                  role === 'victim' ? 'border-blue-700 bg-blue-50/60 ring-1 ring-blue-700' : 'border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="complainantRole"
                  checked={role === 'victim'}
                  onChange={() => setRole('victim')}
                  className="mt-0.5 text-blue-800"
                />
                <div>
                  <span className="block font-bold text-xs sm:text-sm text-slate-900">Victim (पीड़ित)</span>
                  <span className="text-xs text-slate-500">Self-reporting by victim of atrocity</span>
                </div>
              </label>

              <label
                className={`p-3.5 border rounded cursor-pointer transition-colors flex items-start gap-3 ${
                  role === 'informer' ? 'border-blue-700 bg-blue-50/60 ring-1 ring-blue-700' : 'border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="complainantRole"
                  checked={role === 'informer'}
                  onChange={() => setRole('informer')}
                  className="mt-0.5 text-blue-800"
                />
                <div>
                  <span className="block font-bold text-xs sm:text-sm text-slate-900">Informer (मुखबिर / सूचनादाता)</span>
                  <span className="text-xs text-slate-500">Witness or citizen reporting an atrocity</span>
                </div>
              </label>

              <label
                className={`p-3.5 border rounded cursor-pointer transition-colors flex items-start gap-3 ${
                  role === 'ngo' ? 'border-blue-700 bg-blue-50/60 ring-1 ring-blue-700' : 'border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="complainantRole"
                  checked={role === 'ngo'}
                  onChange={() => setRole('ngo')}
                  className="mt-0.5 text-blue-800"
                />
                <div>
                  <span className="block font-bold text-xs sm:text-sm text-slate-900">NGO / Legal Aid Representative</span>
                  <span className="text-xs text-slate-500">Registered organization filing on behalf of victim</span>
                </div>
              </label>
            </div>
          </div>

          {/* Complainant Personal Particulars */}
          <div className="bg-white border border-slate-300 rounded-md p-5 sm:p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2">
              2. Complainant Personal Particulars
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name (पूरा नाम) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-blue-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mobile Number (मोबाइल नंबर) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="10-digit mobile number"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-blue-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Community / Category *
                </label>
                <select
                  value={community}
                  onChange={(e) => setCommunity(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 bg-white focus:ring-1 focus:ring-blue-700 focus:outline-hidden"
                >
                  <option>Scheduled Caste (SC)</option>
                  <option>Scheduled Tribe (ST)</option>
                  <option>Other (Filing on behalf of SC/ST)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Residential Address (स्थाई पता) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="House number, Street, Village/Town"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-blue-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PIN Code
                </label>
                <input
                  type="text"
                  placeholder="6-digit PIN"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-blue-700 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Incident Details & Jurisdiction */}
          <div className="bg-white border border-slate-300 rounded-md p-5 sm:p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2">
              3. Incident Details & Police Jurisdiction
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  State / UT *
                </label>
                <select
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 bg-white focus:ring-1 focus:ring-blue-700 focus:outline-hidden"
                >
                  <option>Uttar Pradesh</option>
                  <option>Bihar</option>
                  <option>Madhya Pradesh</option>
                  <option>Rajasthan</option>
                  <option>Maharashtra</option>
                  <option>Tamil Nadu</option>
                  <option>Karnataka</option>
                  <option>Delhi (NCT)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  District *
                </label>
                <input
                  type="text"
                  required
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-blue-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Concerned Police Station *
                </label>
                <input
                  type="text"
                  required
                  value={policeStation}
                  onChange={(e) => setPoliceStation(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-blue-700 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date of Incident *
                </label>
                <input
                  type="date"
                  required
                  value={incidentDate}
                  onChange={(e) => setIncidentDate(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-blue-700 focus:outline-hidden"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nature of Atrocity / Act Offence
                </label>
                <select
                  value={offenceCategory}
                  onChange={(e) => setOffenceCategory(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 bg-white focus:ring-1 focus:ring-blue-700 focus:outline-hidden"
                >
                  <option>Social Boycott / Denial of Access to Public Resources</option>
                  <option>Physical Assault / Violence</option>
                  <option>Wrongful Dispossession / Encroachment of Land</option>
                  <option>Insult, Intimidation and Humiliation in Public View</option>
                  <option>Sexual Harassment / Violence Against SC/ST Women</option>
                  <option>Denial of Minimum Wages / Forced Bondage</option>
                  <option>Other Offence under PoA Act</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Detailed Description of the Incident (घटना का विवरण) *
                </label>
                <textarea
                  rows={4}
                  required
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 rounded p-3 focus:ring-1 focus:ring-blue-700 focus:outline-hidden"
                  placeholder="Provide precise details including names of accused, witnesses, sequence of events..."
                />
              </div>
            </div>
          </div>

          {/* Evidence Upload & Declaration */}
          <div className="bg-white border border-slate-300 rounded-md p-5 sm:p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2">
              4. Supporting Documents & Declaration
            </h3>

            <div className="border-2 border-dashed border-slate-300 rounded-md p-4 text-center bg-slate-50 hover:bg-slate-100/50 cursor-pointer">
              <Upload className="w-6 h-6 text-slate-500 mx-auto mb-1" />
              <span className="text-xs font-bold text-slate-700 block">
                Attach Supporting Evidence (FIR copy, Complaint letter, Medical report, Audio/Video proof)
              </span>
              <span className="text-[11px] text-slate-500">
                PDF, JPG, PNG, MP3, MP4 up to 25 MB per file
              </span>
            </div>

            <div className="flex items-start gap-2 pt-2">
              <input type="checkbox" required defaultChecked id="declaration" className="mt-1" />
              <label htmlFor="declaration" className="text-xs text-slate-600 leading-snug cursor-pointer">
                I hereby declare that the particulars provided above are true and factual to the best of my knowledge and belief. I understand that submitting malicious or knowingly false reports is punishable under law.
              </label>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded font-medium">
                {errorMsg}
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 px-3 py-1.5 rounded border border-amber-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>An SMS with grievance tracking token will be dispatched to the mobile number.</span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-[#0f3460] hover:bg-[#162447] disabled:opacity-50 text-white font-semibold text-sm rounded shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Transmitting to National Registry...</span>
                  </>
                ) : (
                  <span>Submit Grievance Dossier →</span>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
