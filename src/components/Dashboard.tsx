import { useState } from 'react';

export default function Dashboard() {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-indigo-900 via-purple-900 to-purple-800 rounded-3xl shadow-2xl overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-40 h-40 bg-purple-400 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-60 h-60 bg-indigo-400 rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative p-8 h-full flex flex-col">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" />
                <path d="M2 17L12 22L22 17" opacity="0.5" />
                <path d="M2 12L12 17L22 12" opacity="0.7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">ROCKET RIDES</h1>
          </div>

          {/* Search Bar */}
          <div className="relative">
            {!imageErrors.has('search') ? (
              <img
                src="/dashboard/Frame-4.svg"
                alt="Search"
                className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-60"
                onError={() => setImageErrors(prev => new Set(prev).add('search'))}
              />
            ) : (
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            <input
              type="text"
              placeholder="Search..."
              className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg pl-12 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 transition-all"
            />
          </div>
        </div>

        {/* Chart Section */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 mb-6 animate-fade-up">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-white">Performance Overview</h2>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-xs rounded-md transition-all">
                Day
              </button>
              <button className="px-3 py-1 bg-purple-500/50 text-white text-xs rounded-md">
                Week
              </button>
              <button className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-xs rounded-md transition-all">
                Month
              </button>
            </div>
          </div>

          {/* Chart Image */}
          <div className="relative h-48 bg-gradient-to-br from-purple-500/20 to-indigo-500/20 rounded-xl overflow-hidden flex items-center justify-center p-6">
            {!imageErrors.has('chart') ? (
              <img
                src="/dashboard/Frame-1.svg"
                alt="Performance Chart"
                className="w-full h-full object-contain"
                onError={() => setImageErrors(prev => new Set(prev).add('chart'))}
              />
            ) : (
              <div className="w-full h-full bg-white/10 rounded-lg flex items-center justify-center">
                <span className="text-white/50 text-sm">Chart Loading...</span>
              </div>
            )}
          </div>
        </div>

        {/* Reports Summary */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 animate-fade-up animation-delay-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-white">Reports Summary</h2>
            <div className="flex gap-2 text-xs text-gray-300">
              <button className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-md transition-all flex items-center gap-1.5">
                {!imageErrors.has('calendar') ? (
                  <img
                    src="/dashboard/Frame-2.svg"
                    alt="Calendar"
                    className="w-3 h-3 invert"
                    onError={() => setImageErrors(prev => new Set(prev).add('calendar'))}
                  />
                ) : (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                )}
                Today
              </button>
              <button className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-md transition-all flex items-center gap-1.5">
                {!imageErrors.has('calendar') ? (
                  <img
                    src="/dashboard/Frame-2.svg"
                    alt="Calendar"
                    className="w-3 h-3 invert"
                    onError={() => setImageErrors(prev => new Set(prev).add('calendar'))}
                  />
                ) : (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                )}
                This Week
              </button>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Gross Volume */}
            <div className="bg-gradient-to-br from-purple-500/30 to-purple-600/30 border border-purple-400/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-purple-400 rounded-lg flex items-center justify-center">
                  {!imageErrors.has('currency') ? (
                    <img
                      src="/dashboard/Frame-6.svg"
                      alt="Currency"
                      className="w-5 h-5"
                      onError={() => setImageErrors(prev => new Set(prev).add('currency'))}
                    />
                  ) : (
                    <svg className="w-5 h-5" fill="white" viewBox="0 0 20 20">
                      <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-300">Gross Volume</span>
              </div>
              <p className="text-2xl font-bold text-white">$124.5K</p>
              <p className="text-xs text-green-400 mt-1">+12.5% from last week</p>
            </div>

            {/* Net Volume */}
            <div className="bg-gradient-to-br from-indigo-500/30 to-indigo-600/30 border border-indigo-400/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-indigo-400 rounded-lg flex items-center justify-center">
                  {!imageErrors.has('currency') ? (
                    <img
                      src="/dashboard/Frame-6.svg"
                      alt="Currency"
                      className="w-5 h-5"
                      onError={() => setImageErrors(prev => new Set(prev).add('currency'))}
                    />
                  ) : (
                    <svg className="w-5 h-5" fill="white" viewBox="0 0 20 20">
                      <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-300">Net Volume</span>
              </div>
              <p className="text-2xl font-bold text-white">$98.2K</p>
              <p className="text-xs text-green-400 mt-1">+8.3% from last week</p>
            </div>

            {/* Transactions */}
            <div className="bg-gradient-to-br from-pink-500/30 to-pink-600/30 border border-pink-400/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-pink-400 rounded-lg flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
                    <path d="M3 8H13M8 3V13" strokeWidth="2" stroke="white" fill="none" />
                  </svg>
                </div>
                <span className="text-sm text-gray-300">Transactions</span>
              </div>
              <p className="text-2xl font-bold text-white">2,847</p>
              <p className="text-xs text-green-400 mt-1">+23.1% from last week</p>
            </div>

            {/* Active Users */}
            <div className="bg-gradient-to-br from-cyan-500/30 to-cyan-600/30 border border-cyan-400/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-cyan-400 rounded-lg flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
                    <circle cx="8" cy="5" r="3" />
                    <path d="M2 14C2 11 4.5 9 8 9C11.5 9 14 11 14 14" />
                  </svg>
                </div>
                <span className="text-sm text-gray-300">Active Users</span>
              </div>
              <p className="text-2xl font-bold text-white">1,264</p>
              <p className="text-xs text-green-400 mt-1">+15.7% from last week</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
