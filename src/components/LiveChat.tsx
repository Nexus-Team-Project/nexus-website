import { useState, useRef, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { X, Send, Minimize2, Settings, Search } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { api, API_URL } from '../lib/api';
import { getVisitorId } from '../lib/visitorId';
import { useAnalytics } from '../hooks/useAnalytics';
import { MARKETING, PRODUCT } from '../lib/analyticsEvents';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Real backend state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // ── Action menu state ──
  const [actionView, setActionView] = useState<'main' | 'more'>('main');

  // ── First-message re-show logic ──
  const [firstMessageSent, setFirstMessageSent] = useState(false);
  const needsTopicPromptRef = useRef(false);

  // ⚠️ Replace these with real values:
  const WA_SALES_NUMBER = '972501234567';   // WhatsApp sales number
  const WA_TECH_NUMBER  = '972509876543';   // WhatsApp tech number
  const CALENDAR_LINK   = 'https://calendly.com/your-link'; // Calendar booking link

  // WhatsApp SVG logo component
  const WhatsAppIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.553 4.122 1.519 5.862L.057 23.857a.5.5 0 00.611.611l6.034-1.463A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.714 9.714 0 01-5.03-1.397l-.36-.213-3.732.905.922-3.635-.234-.374A9.714 9.714 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
    </svg>
  );

  const primaryActions = [
    {
      id: 'whatsapp-sales',
      label: t.liveChat.whatsappSales,
      icon: <WhatsAppIcon />,
      action: () => {
        sendMessage(t.liveChat.whatsappSalesResponse);
        setTimeout(() => window.open(`https://wa.me/${WA_SALES_NUMBER}`, '_blank'), 800);
      },
    },
    {
      id: 'schedule',
      label: t.liveChat.schedulemeeting,
      icon: '📅',
      action: () => {
        sendMessage(t.liveChat.scheduleMeetingResponse);
        setTimeout(() => window.open(CALENDAR_LINK, '_blank'), 800);
      },
    },
    {
      id: 'more',
      label: t.liveChat.moreOptions,
      icon: '⚙️',
      action: () => setActionView('more'),
    },
  ];

  const secondaryActions = [
    {
      id: 'whatsapp-tech',
      label: t.liveChat.whatsappTech,
      icon: <WhatsAppIcon />,
      action: () => {
        sendMessage(t.liveChat.whatsappTechResponse);
        setTimeout(() => window.open(`https://wa.me/${WA_TECH_NUMBER}`, '_blank'), 800);
      },
    },
    {
      id: 'integration',
      label: t.liveChat.integration,
      icon: '⚙️',
      action: () => { sendMessage(t.liveChat.integrationResponse); setTimeout(() => window.open('https://nexus-api-docs-production.up.railway.app/', '_blank'), 800); },
    },
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Create session + connect socket on mount
  useEffect(() => {
    let mounted = true;
    const visitorId = getVisitorId();

    // Track chat widget opened
    track(MARKETING.CHAT_WIDGET_OPENED, 'MARKETING', {
      source_page: window.location.pathname,
      trigger_type: 'manual',
    });

    // Create chat session
    api
      .post<{ id: string; welcomeMessage?: string }>('/api/chat/sessions', {
        visitorId,
        metadata: {
          url: window.location.href,
          language: navigator.language,
          userAgent: navigator.userAgent,
        },
      })
      .then((data) => {
        if (!mounted) return;
        const sid = data.id;
        setSessionId(sid);
        track(PRODUCT.CHAT_SESSION_STARTED, 'PRODUCT', {
          session_id: sid,
          trigger_type: 'manual',
        });

        // Connect socket and join session room
        const socket = io(API_URL, { withCredentials: true });
        socketRef.current = socket;

        socket.emit('join_session', { sessionId: sid, visitorId });

        // Receive AI / agent replies
        socket.on(
          'new_message',
          (msg: { id: string; text: string; sender: string; timestamp: string }) => {
            if (!mounted) return;
            setIsTyping(false);
            setMessages((prev) => [
              ...prev,
              {
                id: msg.id,
                text: msg.text,
                sender: msg.sender === 'CUSTOMER' ? 'user' : 'agent',
                timestamp: new Date(msg.timestamp),
              },
            ]);
            // Re-show quick actions once after the first AI reply
            if (needsTopicPromptRef.current) {
              needsTopicPromptRef.current = false;
              setShowQuickActions(true);
              setActionView('main');
            }
          },
        );

        socket.on('agent_typing', () => {
          if (mounted) setIsTyping(true);
        });

        // Show welcome message — prefer server-provided, fall back to locale string
        if (data.welcomeMessage) {
          setIsTyping(false);
          setMessages([
            {
              id: 'welcome',
              text: data.welcomeMessage,
              sender: 'agent',
              timestamp: new Date(),
            },
          ]);
        } else {
          setTimeout(() => {
            if (!mounted) return;
            setIsTyping(false);
            setMessages([
              {
                id: 'welcome',
                text: t.liveChat.welcomeMessage,
                sender: 'agent',
                timestamp: new Date(),
              },
            ]);
          }, 900);
        }
      })
      .catch(() => {
        // Session creation failed — show local welcome so UI isn't stuck
        if (!mounted) return;
        setTimeout(() => {
          if (!mounted) return;
          setIsTyping(false);
          setMessages([
            {
              id: 'welcome',
              text: t.liveChat.welcomeMessage,
              sender: 'agent',
              timestamp: new Date(),
            },
          ]);
        }, 900);
      });

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
          // Also clear the topic prompt ref so we don't accidentally re-show
          needsTopicPromptRef.current = false;
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
          needsTopicPromptRef.current = false;
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
    // On first user message: set flag so quick actions re-appear after AI reply
    if (!firstMessageSent) {
      setFirstMessageSent(true);
      needsTopicPromptRef.current = true;
    }
    setShowQuickActions(false);
    sendMessage(inputValue);
    setInputValue('');
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
        className="chat-container fixed bottom-6 right-6 flex flex-col z-50 rounded-[2.5rem] overflow-hidden shadow-2xl"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          maxWidth: 'calc(100vw - 3rem)',
          maxHeight: 'calc(100vh - 3rem)',
          background: 'rgba(255, 255, 255, 0.25)',
          backdropFilter: 'blur(50px) saturate(200%)',
          WebkitBackdropFilter: 'blur(50px) saturate(200%)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          animation: isClosing
            ? 'chatSlideOut 0.3s cubic-bezier(0.4, 0, 1, 1) forwards'
            : 'chatSlideIn 0.4s cubic-bezier(0, 0, 0.2, 1) forwards',
        }}
      >
        {/* Resize handles — desktop only */}
        <div
          onMouseDown={startResize('left')}
          className="hidden sm:block absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-stripe-purple/20 transition-colors z-10"
          style={{ borderRadius: '2.5rem 0 0 2.5rem' }}
        />

        <div
          onMouseDown={startResize('top')}
          className="hidden sm:block absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-stripe-purple/20 transition-colors z-10"
          style={{ borderRadius: '2.5rem 2.5rem 0 0' }}
        />

        <div
          onMouseDown={startResize('top-left')}
          className="hidden sm:block absolute top-0 left-0 w-8 h-8 cursor-nwse-resize hover:bg-stripe-purple/30 transition-colors z-20"
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
              <h1 className="text-slate-900 font-semibold text-base tracking-tight">
                {t.liveChat.salesTeam}
              </h1>
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
        <section
          className="flex-1 overflow-y-auto px-6 space-y-6 pb-4 pt-2"
          style={{ scrollbarWidth: 'thin' }}
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col gap-2 ${
                message.sender === 'user'
                  ? `items-end ${isRtl ? 'mr-auto' : 'ml-auto'} max-w-[85%]`
                  : 'items-start max-w-[85%]'
              }`}
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

          {/* Action Menu */}
          {showQuickActions && messages.length > 0 && !isTyping && (
            <div className="flex flex-col gap-2 px-2">
              <p className="text-[11px] text-slate-500 font-medium px-1">
                {firstMessageSent ? t.liveChat.selectTopicPrompt : t.liveChat.quickActionsLabel}
              </p>

              {/* ── Main view: 3 primary actions ── */}
              {actionView === 'main' && (
                <div className="flex flex-col gap-1.5">
                  {primaryActions.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => {
                        if (action.id !== 'more') setShowQuickActions(false);
                        action.action();
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all hover:-translate-y-0.5 active:scale-95 text-right"
                      style={{
                        background: 'rgba(255, 255, 255, 0.6)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255, 255, 255, 0.7)',
                        color: '#1e293b',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)';
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                      }}
                    >
                      <span className="flex-shrink-0 flex items-center">{action.icon}</span>
                      <span className="flex-1">{action.label}</span>
                      {action.id === 'more' && <span className="text-slate-400 text-xs">›</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* ── More options: 2 secondary actions + back ── */}
              {actionView === 'more' && (
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => setActionView('main')}
                    className="text-xs text-slate-500 font-medium px-1 mb-1 text-right hover:text-slate-700 transition-colors"
                  >
                    {t.liveChat.back}
                  </button>
                  {secondaryActions.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => {
                        setShowQuickActions(false);
                        action.action();
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all hover:-translate-y-0.5 active:scale-95 text-right"
                      style={{
                        background: 'rgba(255, 255, 255, 0.6)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255, 255, 255, 0.7)',
                        color: '#1e293b',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)';
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                      }}
                    >
                      <span className="flex-shrink-0 flex items-center">{action.icon}</span>
                      <span className="flex-1">{action.label}</span>
                    </button>
                  ))}
                </div>
              )}
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
