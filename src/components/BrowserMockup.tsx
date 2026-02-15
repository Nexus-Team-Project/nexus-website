interface BrowserMockupProps {
  children: React.ReactNode;
  url?: string;
}

export default function BrowserMockup({ children, url = 'nexus.com/checkout' }: BrowserMockupProps) {
  return (
    <div className="inline-block bg-white rounded-xl overflow-hidden" style={{
      boxShadow: '0 32px 60px -10px rgba(10, 20, 40, 0.12)',
      border: '1px solid rgba(10, 20, 40, 0.08)'
    }}>
      {/* Browser Header */}
      <div className="bg-[#f7f8f9] border-b border-gray-200 px-4 py-2 flex items-center">
        {/* Traffic lights (macOS style) */}
        <div className="flex space-x-2 mr-4">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
          <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
        </div>

        {/* URL Bar */}
        <div className="flex-1 max-w-md bg-white border border-gray-200 rounded-md py-1 px-3 flex items-center justify-center space-x-2">
          <svg
            className="w-3 h-3 text-gray-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <span className="text-xs text-gray-500 font-medium truncate">{url}</span>
        </div>

        <div className="w-16 flex-shrink-0"></div>
      </div>

      {/* Content - No padding or margin, just wraps the content */}
      {children}
    </div>
  );
}
