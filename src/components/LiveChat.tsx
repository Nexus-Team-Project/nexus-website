import { useState, useRef, useEffect } from 'react';
import { X, Send, Minimize2, Settings, Search } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

interface LiveChatProps {
  onClose: () => void;
  onMinimize: () => void;
}

export default function LiveChat({ onClose, onMinimize }: LiveChatProps) {
  const { t, direction } = useLanguage();
  const isRtl = direction === 'rtl';
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleMinimize = () => {
    setIsClosing(true);
    setTimeout(() => {
      onMinimize();
    }, 300);
  };

  // Resize state
  const [width, setWidth] = useState(450);
  const [height, setHeight] = useState(700);
  const [isResizing, setIsResizing] = useState<'left' | 'top' | 'top-left' | null>(null);

  // Resize handlers
  const startResize = (direction: 'left' | 'top' | 'top-left') => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(direction);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const bottomRight = {
        x: window.innerWidth - 24, // 24px from right (6 * 4)
        y: window.innerHeight - 24, // 24px from bottom
      };

      if (isResizing === 'left' || isResizing === 'top-left') {
        const newWidth = bottomRight.x - e.clientX;
        setWidth(Math.max(350, Math.min(800, newWidth)));
      }

      if (isResizing === 'top' || isResizing === 'top-left') {
        const newHeight = bottomRight.y - e.clientY;
        setHeight(Math.max(500, Math.min(900, newHeight)));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickActions = [
    { id: 'pricing', label: t.liveChat.pricing, icon: '💰' },
    { id: 'demo', label: t.liveChat.requestDemo, icon: '🎯' },
    { id: 'integration', label: t.liveChat.technicalIntegration, icon: '⚙️' },
    { id: 'support', label: t.liveChat.generalSupport, icon: '💬' },
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Show initial welcome message after typing indicator
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsTyping(false);
      const welcomeMessage: Message = {
        id: '1',
        text: t.liveChat.welcomeMessage,
        sender: 'agent',
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const handleQuickAction = (actionLabel: string) => {
    setShowQuickActions(false);

    const newMessage: Message = {
      id: Date.now().toString(),
      text: actionLabel,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setIsTyping(true);

    // Simulate agent response
    setTimeout(() => {
      setIsTyping(false);
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: t.liveChat.quickActionResponse,
        sender: 'agent',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, agentMessage]);
    }, 1500);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;

    setShowQuickActions(false);

    const newMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages([...messages, newMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate agent response
    setTimeout(() => {
      setIsTyping(false);
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: t.liveChat.defaultResponse,
        sender: 'agent',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, agentMessage]);
    }, 2000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <style>{`
        @keyframes chatSlideIn {
          from {
            opacity: 0;
            transform: translateY(100px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes chatSlideOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(100px) scale(0.9);
          }
        }
      `}</style>

      <div
        dir={direction}
        className="fixed bottom-6 right-6 flex flex-col z-50 rounded-[2.5rem] overflow-hidden shadow-2xl"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          background: 'rgba(255, 255, 255, 0.25)',
          backdropFilter: 'blur(50px) saturate(200%)',
          WebkitBackdropFilter: 'blur(50px) saturate(200%)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          animation: isClosing
            ? 'chatSlideOut 0.3s cubic-bezier(0.4, 0, 1, 1) forwards'
            : 'chatSlideIn 0.4s cubic-bezier(0, 0, 0.2, 1) forwards',
        }}
      >
        {/* Resize handles */}
        {/* Left edge resize handle */}
        <div
          onMouseDown={startResize('left')}
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-stripe-purple/20 transition-colors z-10"
          style={{ borderRadius: '2.5rem 0 0 2.5rem' }}
        />

        {/* Top edge resize handle */}
        <div
          onMouseDown={startResize('top')}
          className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-stripe-purple/20 transition-colors z-10"
          style={{ borderRadius: '2.5rem 2.5rem 0 0' }}
        />

        {/* Top-left corner resize handle */}
        <div
          onMouseDown={startResize('top-left')}
          className="absolute top-0 left-0 w-8 h-8 cursor-nwse-resize hover:bg-stripe-purple/30 transition-colors z-20"
          style={{ borderRadius: '2.5rem 0 0 0' }}
        />
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="relative w-12 h-12 rounded-full border-2 border-white shadow-inner bg-white/20 p-0.5">
            <div className="w-full h-full rounded-full bg-gradient-to-br from-stripe-purple to-stripe-blue flex items-center justify-center text-white font-bold text-sm">
              ST
            </div>
            <div
              className="absolute inset-[-2px] rounded-full -z-10 opacity-60"
              style={{
                background: 'linear-gradient(45deg, #635BFF, #0074D9)',
                filter: 'blur(8px)',
              }}
            />
          </div>
          <div>
            <h1 className="text-slate-900 font-semibold text-base tracking-tight">{t.liveChat.salesTeam}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-slate-500 text-xs font-medium">{t.liveChat.alwaysOnline}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/40 transition-colors text-slate-600">
            <Search size={18} />
          </button>
          <button className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/40 transition-colors text-slate-600">
            <Settings size={18} />
          </button>
          <button
            onClick={handleClose}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/40 transition-colors text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Messages */}
      <section className="flex-1 overflow-y-auto px-6 space-y-6 pb-4 pt-2" style={{ scrollbarWidth: 'thin' }}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex flex-col gap-2 ${message.sender === 'user' ? `items-end ${isRtl ? 'mr-auto' : 'ml-auto'} max-w-[85%]` : 'items-start max-w-[85%]'}`}
          >
            <div
              className={`px-5 py-4 text-sm leading-relaxed ${
                message.sender === 'user'
                  ? `rounded-[1.75rem] ${isRtl ? 'rounded-tl-lg' : 'rounded-tr-lg'} text-white font-medium`
                  : `rounded-[1.75rem] ${isRtl ? 'rounded-tr-lg' : 'rounded-tl-lg'} text-slate-800`
              }`}
              style={
                message.sender === 'user'
                  ? {
                      background: 'linear-gradient(180deg, #635BFF 0%, #5348E6 100%)',
                      boxShadow: '0 4px 15px rgba(99, 91, 255, 0.25)',
                    }
                  : {
                      background: 'rgba(255, 255, 255, 0.75)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255, 255, 255, 0.8)',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                    }
              }
            >
              {message.text}
            </div>
            <span className="text-[11px] text-slate-400 font-medium px-2">
              {message.timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        ))}

        {/* Quick Actions */}
        {showQuickActions && messages.length > 0 && !isTyping && (
          <div className="flex flex-col gap-2 px-2">
            <p className="text-xs text-slate-500 font-medium px-2">{t.liveChat.quickActionsLabel}</p>
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action.label)}
                  className="px-4 py-2.5 rounded-full text-xs font-semibold flex items-center gap-2 transition-all hover:-translate-y-0.5"
                  style={{
                    background: 'rgba(255, 255, 255, 0.5)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(6, 182, 212, 0.4)',
                    color: '#0891b2',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
                    e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.6)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.5)';
                    e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.4)';
                  }}
                >
                  <span>{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex items-center gap-3 px-2">
            <div className="flex gap-1.5 items-center bg-white/30 px-3 py-2 rounded-full">
              <span
                className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                style={{ animationDelay: '-0.3s' }}
              />
              <span
                className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                style={{ animationDelay: '-0.15s' }}
              />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </section>

      {/* Input */}
      <footer className="px-6 pb-6 pt-4">
        <div
          className="group flex items-center gap-3 px-5 py-3.5 rounded-3xl transition-all focus-within:ring-2 focus-within:ring-stripe-purple/20"
          style={{
            background: 'rgba(255, 255, 255, 0.4)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.1)',
          }}
        >
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={t.liveChat.inputPlaceholder}
            className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-slate-800 placeholder:text-slate-400 text-sm py-1"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className="bg-stripe-purple text-white w-9 h-9 rounded-full flex items-center justify-center shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={16} className={isRtl ? 'rotate-180' : ''} />
          </button>
        </div>
      </footer>
    </div>
    </>
  );
}
