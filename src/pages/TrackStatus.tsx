import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  SearchCheck,
  ArrowLeft,
  Search,
  CheckCircle2,
  Printer,
  AlertOctagon,
  RefreshCw,
} from 'lucide-react'
import { getApiBaseUrl } from '../saathi/config/api'

export const TrackStatus: React.FC = () => {
  const [tokenInput, setTokenInput] = useState('NHAA-CASE-2026-29447')
  const [hasSearched, setHasSearched] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [caseData, setCaseData] = useState<any>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const fetchCaseStatus = async (idToSearch: string) => {
    if (!idToSearch.trim()) return
    setIsLoading(true)
    setErrorMsg('')
    try {
      const cleanId = idToSearch.trim().replace(/^#/, '')
      const res = await fetch(`${getApiBaseUrl()}/api/sessions/cases/${encodeURIComponent(cleanId)}`)
      if (!res.ok) {
        throw new Error(`No record found matching '${cleanId}'`)
      }
      const data = await res.json()
      setCaseData(data)
      setHasSearched(true)
    } catch (err: any) {
      console.warn('Track status lookup failed:', err)
      setCaseData(null)
      setErrorMsg(`No record found matching "${idToSearch.trim()}". Please verify the reference URN.`)
      setHasSearched(true)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchCaseStatus(tokenInput)
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchCaseStatus(tokenInput)
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
          <div className="w-10 h-10 rounded-md bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-800">
            <SearchCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0c2340] tracking-tight">
              Track Grievance / Rescue Status
            </h1>
            <p className="text-slate-600 text-sm mt-0.5">
              Check current progress, officer remarks, and closure status of an already registered grievance.
            </p>
          </div>
        </div>
      </div>

      {/* Search Input Box */}
      <div className="bg-white border border-slate-300 rounded-md p-5 sm:p-6 shadow-xs">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Grievance Reference Number (URN) or Rescue ID *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="e.g. NHAA-2026-GRV-49210 or RESCUE-8921"
                  className="w-full text-xs sm:text-sm font-mono border border-slate-300 rounded px-3 py-2 pl-9 focus:ring-1 focus:ring-blue-800 focus:outline-hidden"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Registered Mobile (Optional for OTP verification)
              </label>
              <input
                type="tel"
                placeholder="Enter 10-digit mobile"
                defaultValue="9876543210"
                className="w-full text-xs sm:text-sm border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-blue-800 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Quick Try Samples:</span>
              <button
                type="button"
                onClick={() => { setTokenInput('NHAA-2026-GRV-49210'); setHasSearched(true); }}
                className="text-xs text-blue-700 hover:underline font-mono bg-blue-50 px-2 py-0.5 rounded border border-blue-200"
              >
                NHAA-2026-GRV-49210
              </button>
              <button
                type="button"
                onClick={() => { setTokenInput('RESCUE-77291'); setHasSearched(true); }}
                className="text-xs text-red-700 hover:underline font-mono bg-red-50 px-2 py-0.5 rounded border border-red-200"
              >
                RESCUE-77291
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-[#0f3460] hover:bg-[#162447] disabled:opacity-50 text-white font-semibold text-sm rounded shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Searching Registry...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Track Status Now</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Error state */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-300 rounded-md p-5 text-red-900 flex items-start gap-3">
          <AlertOctagon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold">Record Not Found</h3>
            <p className="text-xs text-red-700 mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Grievance Progress Card */}
      {hasSearched && caseData && (
        <div className="bg-white border border-slate-300 rounded-md p-6 sm:p-8 shadow-xs space-y-6">
          
          {/* Header Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Dossier Ref:
                </span>
                <span className="text-lg font-mono font-extrabold text-blue-900">
                  {caseData.caseNumber || caseData.id}
                </span>
                <span className="px-2.5 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold border border-blue-300">
                  Status: {caseData.status || 'Under Review'}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  caseData.priority === 'CRITICAL' ? 'bg-red-600 text-white animate-pulse' :
                  caseData.priority === 'HIGH' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-800'
                }`}>
                  Priority: {caseData.priority || 'MEDIUM'}
                </span>
              </div>
              <span className="text-xs text-slate-500 mt-1 block">
                Lodged on: {caseData.intakeTimestamp || 'Recently'} | Complainant: {caseData.callerNameAnonymized || 'Citizen'} | Jurisdiction: {caseData.displayLocation || caseData.district || 'India'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 self-start sm:self-auto cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Dossier</span>
            </button>
          </div>

          {/* Workflow Stepper */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
              Government Milestone Tracking Progress
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {caseData.timeline && caseData.timeline.length > 0 ? (
                caseData.timeline.slice(0, 3).map((item: any, idx: number) => (
                  <div key={idx} className="p-3.5 rounded bg-blue-50/60 border border-blue-200 text-xs relative">
                    <div className="flex items-center gap-1.5 text-blue-900 font-bold mb-1">
                      <CheckCircle2 className="w-4 h-4 text-blue-700 flex-shrink-0" />
                      <span>Milestone {idx + 1}: {item.timestamp || 'Recorded'}</span>
                    </div>
                    <p className="text-slate-700 text-[11px] leading-snug">
                      {item.description}
                    </p>
                  </div>
                ))
              ) : (
                <div className="p-3 rounded bg-emerald-50 border border-emerald-300 text-xs col-span-3">
                  <div className="flex items-center gap-1.5 text-emerald-800 font-bold mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Case Registered in National Database</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Case is actively tracked and assigned for nodal investigation.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Officer Remarks & Details Table */}
          <div className="border border-slate-200 rounded overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Designated Investigating Authority & Case Brief
              </span>
            </div>
            <table className="w-full text-xs text-left border-collapse">
              <tbody className="divide-y divide-slate-200">
                <tr className="hover:bg-slate-50">
                  <td className="p-3 font-semibold text-slate-700 bg-slate-50/70 w-1/3">Jurisdiction District</td>
                  <td className="p-3 text-slate-900 font-medium">{caseData.displayLocation || caseData.district || 'Jurisdiction Cell'}</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="p-3 font-semibold text-slate-700 bg-slate-50/70">Severity & SVI Index</td>
                  <td className="p-3 text-slate-900 font-bold">
                    SVI {caseData.sviScore || 0}/100 ({caseData.svi_label || caseData.priority || 'MEDIUM'})
                  </td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="p-3 font-semibold text-slate-700 bg-slate-50/70">Official Incident Summary / Narrative</td>
                  <td className="p-3 text-slate-900 leading-relaxed">
                    {caseData.caseBrief || caseData.full_transcript || 'Recorded under SC/ST (PoA) Act provisions.'}
                  </td>
                </tr>
                {caseData.historicalMatch && (
                  <tr className="hover:bg-slate-50">
                    <td className="p-3 font-semibold text-slate-700 bg-slate-50/70">Statutory Precedent & Legal Aid</td>
                    <td className="p-3 text-indigo-900 font-medium">
                      {caseData.historicalMatch.resolution}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}
    </div>
  )
}
