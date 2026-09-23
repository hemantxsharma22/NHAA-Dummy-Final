import React from 'react'

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#002040] text-white py-4 px-4 sm:px-6 lg:px-8 text-xs border-t border-[#001730] mt-auto">
      <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Left: Copyright & UX4G / NeGD / MeitY notice */}
        <div className="text-slate-300 text-center md:text-left text-[11px] sm:text-xs">
          <span>© 2026 - Copyright UX4G. All rights reserved. Powered by NeGD | MeitY Government of India® 2026 UX4G</span>
        </div>

        {/* Right: Policy Links */}
        <div className="flex items-center gap-4 sm:gap-6 text-xs text-slate-200">
          <span className="hover:underline cursor-pointer">Terms & Conditions</span>
          <span className="text-slate-500">|</span>
          <span className="hover:underline cursor-pointer">Privacy Policy</span>
          <span className="text-slate-500">|</span>
          <span className="hover:underline cursor-pointer">Feedback</span>
        </div>

      </div>
    </footer>
  )
}
