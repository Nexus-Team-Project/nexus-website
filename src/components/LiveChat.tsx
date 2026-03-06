import { useState, useRef, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { X, Send, Minimize2 } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { api, API_URL } from '../lib/api';
import { getVisitorId } from '../lib/visitorId';
import { useAnalytics } from '../hooks/useAnalytics';
import { MARKETING, PRODUCT } from '../lib/analyticsEvents';

interface ChatAction {
  type: 'navigate' | 'external_link';
  label_he: string;
  label_en: string;
  url: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
  actions?: ChatAction[];
}

interface LiveChatProps {
  onClose: () => void;
  onMinimize: () => void;
  existingSessionId?: string | null;
  onSessionCreated?: (id: string) => void;
}

export default function LiveChat({ onClose, onMinimize, existingSessionId, onSessionCreated }: LiveChatProps) {
  const { t, direction } = useLanguage();
  const isRtl = direction === 'rtl';
  const { track } = useAnalytics();
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

  // Resize state — initial values clamped to viewport
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' ? Math.min(450, window.innerWidth - 48) : 450,
  );
  const [height, setHeight] = useState(() =>
    typeof window !== 'undefined' ? Math.min(700, window.innerHeight - 48) : 700,
  );
  const [isResizing, setIsResizing] = useState<'left' | 'top' | 'top-left' | null>(null);

  const startResize = (direction: 'left' | 'top' | 'top-left') => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(direction);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const bottomRight = {
        x: window.innerWidth - 24,
        y: window.innerHeight - 24,
      };

      if (isResizing === 'left' || isResizing === 'top-left') {
        const newWidth = bottomRight.x - e.clientX;
        setWidth(Math.max(350, Math.min(800, Math.min(window.innerWidth - 48, newWidth))));
      }

      if (isResizing === 'top' || isResizing === 'top-left') {
        const newHeight = bottomRight.y - e.clientY;
        setHeight(Math.max(500, Math.min(900, Math.min(window.innerHeight - 48, newHeight))));
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

  // Re-clamp on window resize
  useEffect(() => {
    const handleResize = () => {
      setWidth((w) => Math.min(w, window.innerWidth - 48));
      setHeight((h) => Math.min(h, window.innerHeight - 48));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [ratings, setRatings] = useState<Record<string, 'up' | 'down'>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Real backend state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // ── Contact details ──
  const WA_SALES_NUMBER = '972554339345';
  const WA_TECH_NUMBER  = '972554339191';
  const CALENDAR_LINK   = 'https://app.apollo.io/#/meet/inbound-router/mis-xdv-oyk';

  // Flat list of quick actions — Stripe-style compact grid
  const quickActions = [
    {
      id: 'whatsapp-sales',
      label: t.liveChat.whatsappSales,
      action: () => {
        sendMessage(t.liveChat.whatsappSalesResponse);
        setTimeout(() => window.open(`https://wa.me/${WA_SALES_NUMBER}`, '_blank'), 800);
      },
    },
    {
      id: 'schedule',
      label: t.liveChat.schedulemeeting,
      action: () => {
        sendMessage(t.liveChat.scheduleMeetingResponse);
        setTimeout(() => window.open(CALENDAR_LINK, '_blank'), 800);
      },
    },
    {
      id: 'whatsapp-tech',
      label: t.liveChat.whatsappTech,
      action: () => {
        sendMessage(t.liveChat.whatsappTechResponse);
        setTimeout(() => window.open(`https://wa.me/${WA_TECH_NUMBER}`, '_blank'), 800);
      },
    },
    {
      id: 'integration',
      label: t.liveChat.integration,
      action: () => {
        sendMessage(t.liveChat.integrationResponse);
        setTimeout(() => window.open('https://nexus-api-docs-production.up.railway.app/', '_blank'), 800);
      },
    },
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Create or resume session + connect socket on mount
  useEffect(() => {
    let mounted = true;
    const visitorId = getVisitorId();

    // Track chat widget opened
    track(MARKETING.CHAT_WIDGET_OPENED, 'MARKETING', {
      source_page: window.location.pathname,
      trigger_type: 'manual',
    });

    /** Connect socket to a session and wire up message handlers */
    const connectSocket = (sid: string) => {
      const socket = io(API_URL, { withCredentials: true });
      socketRef.current = socket;
      socket.emit('join_session', { sessionId: sid, visitorId });

      socket.on(
        'new_message',
        (msg: { id: string; text: string; sender: string; timestamp: string; actions?: ChatAction[] }) => {
          if (!mounted) return;
          if (msg.sender === 'CUSTOMER') return;
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: msg.id,
              text: msg.text,
              sender: 'agent',
              timestamp: new Date(msg.timestamp),
              actions: msg.actions,
            },
          ]);
        },
      );

      socket.on('agent_typing', () => {
        if (mounted) setIsTyping(true);
      });
    };

    // Resume existing session if provided
    if (existingSessionId) {
      setSessionId(existingSessionId);
      setIsTyping(false);

      // Fetch existing messages
      api
        .get<Array<{ id: string; text: string; sender: string; createdAt: string }>>(
          `/api/chat/sessions/${existingSessionId}/messages`,
        )
        .then((msgs) => {
          if (!mounted) return;
          setMessages(
            msgs.map((m) => ({
              id: m.id,
              text: m.text,
              sender: m.sender === 'CUSTOMER' ? 'user' as const : 'agent' as const,
              timestamp: new Date(m.createdAt),
            })),
          );
          setShowQuickActions(false); // Hide quick actions for resumed sessions
          connectSocket(existingSessionId);
        })
        .catch(() => {
          if (!mounted) return;
          setIsTyping(false);
          setMessages([
            { id: 'welcome', text: t.liveChat.welcomeMessage, sender: 'agent', timestamp: new Date() },
          ]);
          connectSocket(existingSessionId);
        });
    } else {
      // Create new chat session
      api
        .post<{ id: string; welcomeMessage?: string }>('/api/chat/sessions', {
          visitorId,
          page: window.location.pathname,
          language: navigator.language,
        })
        .then((data) => {
          if (!mounted) return;
          const sid = data.id;
          setSessionId(sid);
          onSessionCreated?.(sid);
          track(PRODUCT.CHAT_SESSION_STARTED, 'PRODUCT', {
            session_id: sid,
            trigger_type: 'manual',
          });
          connectSocket(sid);

          // Show welcome message
          if (data.welcomeMessage) {
            setIsTyping(false);
            setMessages([
              { id: 'welcome', text: data.welcomeMessage, sender: 'agent', timestamp: new Date() },
            ]);
          } else {
            setTimeout(() => {
              if (!mounted) return;
              setIsTyping(false);
              setMessages([
                { id: 'welcome', text: t.liveChat.welcomeMessage, sender: 'agent', timestamp: new Date() },
              ]);
            }, 900);
          }
        })
        .catch(() => {
          if (!mounted) return;
          setTimeout(() => {
            if (!mounted) return;
            setIsTyping(false);
            setMessages([
              { id: 'welcome', text: t.liveChat.welcomeMessage, sender: 'agent', timestamp: new Date() },
            ]);
          }, 900);
        });
    }

    return () => {
      mounted = false;
      socketRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        text,
        sender: 'user',
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const next = [...prev, userMsg];
        const messageIndex = next.filter((m) => m.sender === 'user').length;
        track(PRODUCT.CHAT_MESSAGE_SENT, 'PRODUCT', {
          session_id: sessionId ?? undefined,
          message_index: messageIndex,
          channel: 'web',
        });
        return next;
      });
      setIsTyping(true);

      if (sessionId) {
        try {
          await api.post(`/api/chat/sessions/${sessionId}/messages`, {
            text,
            visitorId: getVisitorId(),
          });
          // AI reply arrives via socket 'new_message' — setIsTyping(false) happens there
        } catch {
          // If the request fails, stop the spinner and show a fallback
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              text: t.liveChat.defaultResponse,
              sender: 'agent',
              timestamp: new Date(),
            },
          ]);
        }
      } else {
        // Session not ready yet — graceful fallback
        setTimeout(() => {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              text: t.liveChat.defaultResponse,
              sender: 'agent',
              timestamp: new Date(),
            },
          ]);
        }, 2000);
      }
    },
    [sessionId, t, track],
  );

  const handleSend = () => {
    if (!inputValue.trim()) return;
    setShowQuickActions(false);
    sendMessage(inputValue);
    setInputValue('');
  };

  const handleRate = (messageId: string, rating: 'up' | 'down') => {
    if (ratings[messageId]) return; // already rated
    setRatings((prev) => ({ ...prev, [messageId]: rating }));
    // Persist to AiRating table (👍 = 5, 👎 = 1) — fire and forget
    void api.post(`/api/chat/messages/${messageId}/rate`, { rating: rating === 'up' ? 5 : 1 }).catch(() => {});
    track(PRODUCT.AI_RATING_SUBMITTED, 'PRODUCT', {
      session_id: sessionId ?? undefined,
      message_id: messageId,
      rating,
      has_feedback: false,
    });
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

        @keyframes messageSlideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes typingBounce {
          0%, 60%, 100% {
            transform: translateY(0);
          }
          30% {
            transform: translateY(-4px);
          }
        }

        /* Mobile: full-screen chat */
        @media (max-width: 639px) {
          .chat-container {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            border-radius: 0 !important;
            max-width: 100% !important;
            max-height: 100% !important;
            bottom: 0 !important;
            right: 0 !important;
          }
        }
      `}</style>

      <div
        dir={direction}
        className="chat-container fixed bottom-6 right-6 flex flex-col z-50 rounded-2xl overflow-hidden"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          maxWidth: 'calc(100vw - 3rem)',
          maxHeight: 'calc(100vh - 3rem)',
          background: 'linear-gradient(180deg, rgba(248, 248, 252, 0.95) 0%, rgba(243, 243, 248, 0.92) 100%)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
          animation: isClosing
            ? 'chatSlideOut 0.3s cubic-bezier(0.4, 0, 1, 1) forwards'
            : 'chatSlideIn 0.4s cubic-bezier(0, 0, 0.2, 1) forwards',
        }}
      >
        {/* Resize handles — desktop only */}
        <div
          onMouseDown={startResize('left')}
          className="hidden sm:block absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-stripe-purple/20 transition-colors z-10"
          style={{ borderRadius: '1rem 0 0 1rem' }}
        />

        <div
          onMouseDown={startResize('top')}
          className="hidden sm:block absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-stripe-purple/20 transition-colors z-10"
          style={{ borderRadius: '1rem 1rem 0 0' }}
        />

        <div
          onMouseDown={startResize('top-left')}
          className="hidden sm:block absolute top-0 left-0 w-8 h-8 cursor-nwse-resize hover:bg-stripe-purple/30 transition-colors z-20"
          style={{ borderRadius: '1rem 0 0 0' }}
        />

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}>
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 flex-shrink-0">
              <img
                src="/nexus-favicon.png"
                alt="Nexus"
                className="w-10 h-10 rounded-full object-cover border-2 border-white/60 shadow-sm"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white" />
            </div>
            <div>
              <h1 className="text-slate-900 font-semibold text-sm tracking-tight">
                {t.liveChat.salesTeam}
              </h1>
              <span className="text-slate-500 text-xs font-medium">{t.liveChat.alwaysOnline}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleMinimize}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors text-slate-500"
            >
              <Minimize2 size={16} />
            </button>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors text-slate-500"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <section
          className="flex-1 overflow-y-auto px-6 space-y-6 pb-4 pt-2"
          style={{ scrollbarWidth: 'thin' }}
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${
                message.sender === 'user'
                  ? `flex-row-reverse ${isRtl ? 'mr-auto' : 'ml-auto'} max-w-[85%]`
                  : 'max-w-[85%]'
              }`}
              style={{ animation: 'messageSlideIn 0.3s ease-out' }}
            >
              {/* Agent avatar */}
              {message.sender === 'agent' && (
                <img
                  src="/nexus-favicon.png"
                  alt=""
                  className="w-6 h-6 rounded-full flex-shrink-0 mt-1"
                />
              )}
              <div className="flex flex-col gap-1">
                <div
                  className={`px-4 py-3 text-sm leading-relaxed ${
                    message.sender === 'user'
                      ? `rounded-2xl ${isRtl ? 'rounded-tl-md' : 'rounded-tr-md'} text-white font-medium`
                      : `rounded-2xl ${isRtl ? 'rounded-tr-md' : 'rounded-tl-md'} text-slate-800`
                  }`}
                  style={
                    message.sender === 'user'
                      ? {
                          background: 'linear-gradient(180deg, #635BFF 0%, #5348E6 100%)',
                          boxShadow: '0 2px 8px rgba(99, 91, 255, 0.2)',
                        }
                      : {
                          background: 'rgba(255, 255, 255, 0.85)',
                          border: '1px solid rgba(0, 0, 0, 0.06)',
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                        }
                  }
                >
                  {message.text}
                </div>
                {/* Inline navigation buttons — always open in new tab */}
                {message.actions && message.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-1 mt-1.5">
                    {message.actions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => window.open(action.url, '_blank')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all hover:shadow-sm"
                        style={{
                          background: 'rgba(99, 91, 255, 0.08)',
                          color: '#635BFF',
                          border: '1px solid rgba(99, 91, 255, 0.2)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(99, 91, 255, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(99, 91, 255, 0.08)';
                        }}
                      >
                        {isRtl ? action.label_he : action.label_en}
                        <span className="text-[10px]">↗</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className={`flex items-center gap-2 px-1 ${message.sender === 'user' ? 'justify-end' : ''}`}>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {message.sender === 'agent' && message.id !== 'welcome' && (
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        onClick={() => handleRate(message.id, 'up')}
                        className={`text-[13px] transition-all ${ratings[message.id] === 'up' ? 'opacity-100 scale-110' : ratings[message.id] ? 'opacity-20' : 'opacity-40 hover:opacity-80'}`}
                        title="Helpful"
                      >
                        👍
                      </button>
                      <button
                        onClick={() => handleRate(message.id, 'down')}
                        className={`text-[13px] transition-all ${ratings[message.id] === 'down' ? 'opacity-100 scale-110' : ratings[message.id] ? 'opacity-20' : 'opacity-40 hover:opacity-80'}`}
                        title="Not helpful"
                      >
                        👎
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Quick Actions — Stripe-style compact grid */}
          <div
            className="px-2 transition-all duration-300 ease-in-out"
            style={{
              opacity: showQuickActions && messages.length > 0 && !isTyping ? 1 : 0,
              maxHeight: showQuickActions && messages.length > 0 && !isTyping ? '200px' : '0',
              overflow: 'hidden',
              transform: showQuickActions && messages.length > 0 && !isTyping ? 'translateY(0)' : 'translateY(8px)',
            }}
          >
            <p className="text-[10px] text-slate-400 font-medium px-1 mb-2">
              {t.liveChat.quickActionsLabel}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => {
                    setShowQuickActions(false);
                    action.action();
                  }}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all active:scale-95 hover:border-stripe-purple/40 hover:shadow-sm"
                  style={{
                    background: 'rgba(255, 255, 255, 0.9)',
                    border: '1px solid rgba(0, 0, 0, 0.08)',
                    color: '#334155',
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex items-end gap-2 px-2" style={{ animation: 'messageSlideIn 0.3s ease-out' }}>
              <img src="/nexus-favicon.png" alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
              <div
                className="flex gap-1.5 items-center px-4 py-3 rounded-2xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.85)',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  borderTopLeftRadius: '6px',
                }}
              >
                <span
                  className="w-1.5 h-1.5 bg-slate-400 rounded-full"
                  style={{ animation: 'typingBounce 1.2s ease-in-out infinite', animationDelay: '0s' }}
                />
                <span
                  className="w-1.5 h-1.5 bg-slate-400 rounded-full"
                  style={{ animation: 'typingBounce 1.2s ease-in-out infinite', animationDelay: '0.15s' }}
                />
                <span
                  className="w-1.5 h-1.5 bg-slate-400 rounded-full"
                  style={{ animation: 'typingBounce 1.2s ease-in-out infinite', animationDelay: '0.3s' }}
                />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </section>

        {/* Input */}
        <footer className="px-6 pb-4 pt-3">
          <div
            className="group flex items-center gap-3 px-4 py-3 rounded-2xl transition-all focus-within:ring-2 focus-within:ring-stripe-purple/20"
            style={{
              background: 'rgba(255, 255, 255, 0.7)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            }}
          >
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t.liveChat.inputPlaceholder}
              className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-slate-800 placeholder:text-slate-400 text-sm py-0.5"
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="bg-stripe-purple text-white w-8 h-8 rounded-full flex items-center justify-center shadow-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={14} className={isRtl ? 'rotate-180' : ''} />
            </button>
          </div>
          <p className="text-center text-[10px] text-slate-400/60 mt-2 font-medium">Powered by Nexus AI</p>
        </footer>
      </div>
    </>
  );
}
