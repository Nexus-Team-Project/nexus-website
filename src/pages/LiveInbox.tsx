import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, API_URL, getAccessToken } from '../lib/api';
import { io, Socket } from 'socket.io-client';

// ─── Types ───────────────────────────────────────────────────

interface ChatSession {
  id: string;
  visitorId: string;
  status: 'OPEN' | 'PENDING_HUMAN' | 'RESOLVED' | 'CLOSED';
  mode: 'AI' | 'HUMAN';
  assignedAgentName?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

interface ChatMessage {
  id: string;
  sessionId: string;
  sender: 'CUSTOMER' | 'AI' | 'AGENT' | 'SYSTEM';
  channel: 'WEB' | 'WHATSAPP' | 'EMAIL';
  text: string;
  createdAt: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
}

// ─── Icons ──────────────────────────────────────────────────

const WhatsAppIcon = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

// ─── Access Control ──────────────────────────────────────────

const ALLOWED_EMAILS = ['sales@nexus-payment.com', 'benefitree1@gmail.com'];

// ─── Component ───────────────────────────────────────────────

const LiveInbox = () => {
  const { user } = useAuth();

  // Access control
  if (!user || !ALLOWED_EMAILS.includes(user.email)) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-950" dir="rtl">
        <div className="text-center p-8">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">אין גישה</h1>
          <p className="text-slate-500">אין לך הרשאה לצפות בעמוד זה.</p>
        </div>
      </div>
    );
  }

  return <InboxContent />;
};

function InboxContent() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'open' | 'human' | 'closed'>('open');
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(300);
  const [resizing, setResizing] = useState<'left' | 'right' | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  // ─── Mobile detection ─────────────────────────────────────

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ─── Load sessions ──────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    try {
      const statusFilter = sidebarTab === 'closed' ? 'CLOSED' : undefined;
      const modeFilter = sidebarTab === 'human' ? 'HUMAN' : undefined;
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (modeFilter) params.set('mode', modeFilter);
      if (sidebarTab === 'open') params.set('status', 'OPEN');
      params.set('limit', '50');

      const data = await api.get<ChatSession[]>(`/api/chat/sessions?${params}`);
      setSessions(data);
      if (!activeSessionId && data.length > 0 && !isMobile) {
        setActiveSessionId(data[0].id);
      }
    } catch (err) {
      console.error('[LiveInbox] Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [sidebarTab, activeSessionId, isMobile]);

  useEffect(() => {
    setLoading(true);
    loadSessions();
  }, [loadSessions]);

  // Poll for new sessions every 10s
  useEffect(() => {
    pollRef.current = setInterval(loadSessions, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadSessions]);

  // ─── Load messages for active session ───────────────────────

  useEffect(() => {
    if (!activeSessionId) return;
    (async () => {
      try {
        const data = await api.get<ChatMessage[]>(`/api/chat/sessions/${activeSessionId}/messages`);
        setMessages(data);
      } catch (err) {
        console.error('[LiveInbox] Failed to load messages:', err);
      }
    })();
  }, [activeSessionId]);

  // ─── Socket.io for real-time messages ───────────────────────

  useEffect(() => {
    const url = API_URL || window.location.origin;
    const socket = io(url, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[LiveInbox] Socket connected');
      // Join admin room for notifications
      socket.emit('join_admin', { agentId: 'inbox' });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Join active session room for real-time messages
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeSessionId) return;

    socket.emit('join_session', { sessionId: activeSessionId, visitorId: 'agent' });

    const handleNewMessage = (msg: {
      id: string; text: string; sender: string; channel: string; timestamp: string;
      mediaUrl?: string; mediaType?: string; fileName?: string;
    }) => {
      const newMsg: ChatMessage = {
        id: msg.id,
        sessionId: activeSessionId,
        sender: msg.sender as ChatMessage['sender'],
        channel: (msg.channel || 'WEB') as ChatMessage['channel'],
        text: msg.text,
        createdAt: msg.timestamp,
        mediaUrl: msg.mediaUrl,
        mediaType: msg.mediaType,
        fileName: msg.fileName,
      };
      setMessages(prev => {
        // Avoid duplicates
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    };

    const handleModeChanged = (data: { mode: string }) => {
      setSessions(prev => prev.map(s =>
        s.id === activeSessionId ? { ...s, mode: data.mode as 'AI' | 'HUMAN' } : s
      ));
    };

    socket.on('new_message', handleNewMessage);
    socket.on('mode_changed', handleModeChanged);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('mode_changed', handleModeChanged);
    };
  }, [activeSessionId]);

  // ─── Auto-scroll ────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Textarea auto-height ───────────────────────────────────

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + 'px';
    }
  }, [messageText]);

  // ─── Resize drag handler ───────────────────────────────────

  useEffect(() => {
    if (!resizing) return;
    let rafId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        if (!containerRef.current) { rafId = null; return; }
        const rect = containerRef.current.getBoundingClientRect();
        if (resizing === 'left') {
          const newW = rect.right - e.clientX;
          if (newW >= 220 && newW <= 420) setLeftWidth(newW);
        } else {
          const newW = e.clientX - rect.left;
          if (newW >= 220 && newW <= 420) setRightWidth(newW);
        }
        rafId = null;
      });
    };

    const handleMouseUp = () => {
      setResizing(null);
      if (rafId) cancelAnimationFrame(rafId);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [resizing]);

  // ─── Actions ────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!messageText.trim() || !activeSessionId || sending) return;
    const text = messageText.trim();
    setMessageText('');
    setSending(true);

    try {
      await api.post(`/api/chat/sessions/${activeSessionId}/agent-reply`, { text });
    } catch (err) {
      console.error('[LiveInbox] Failed to send message:', err);
      setMessageText(text); // Restore text on error
    } finally {
      setSending(false);
    }
  };

  const draftWithAi = async () => {
    if (!activeSessionId || drafting) return;
    setDrafting(true);
    try {
      const data = await api.post<{ text: string }>(
        `/api/chat/sessions/${activeSessionId}/ai-draft`,
      );
      if (data.text) {
        setMessageText(data.text);
        textareaRef.current?.focus();
      }
    } catch (err) {
      console.error('[LiveInbox] AI draft failed:', err);
    } finally {
      setDrafting(false);
    }
  };

  const sendMedia = async (file: File) => {
    if (!activeSessionId || sending) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('caption', '');

      const token = getAccessToken();
      const response = await fetch(
        `${API_URL}/api/chat/sessions/${activeSessionId}/agent-reply-media`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
          body: formData,
        },
      );
      if (!response.ok) throw new Error('Upload failed');
    } catch (err) {
      console.error('[LiveInbox] Media upload failed:', err);
    } finally {
      setSending(false);
    }
  };

  const takeSession = async (sessionId: string) => {
    try {
      await api.post(`/api/chat/sessions/${sessionId}/take`);
      loadSessions();
    } catch (err) {
      console.error('[LiveInbox] Failed to take session:', err);
    }
  };

  const releaseSession = async (sessionId: string) => {
    try {
      await api.post(`/api/chat/sessions/${sessionId}/release`);
      loadSessions();
    } catch (err) {
      console.error('[LiveInbox] Failed to release session:', err);
    }
  };

  const closeSession = async (sessionId: string) => {
    try {
      await api.patch(`/api/chat/sessions/${sessionId}/close`);
      loadSessions();
    } catch (err) {
      console.error('[LiveInbox] Failed to close session:', err);
    }
  };

  const selectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    if (isMobile) setMobileView('chat');
  };

  const goBackToList = () => {
    setMobileView('list');
  };

  // ─── Helpers ────────────────────────────────────────────────

  const shortId = (id: string) => id.slice(-8);
  const timeAgo = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000);
    if (diffMin < 1) return 'עכשיו';
    if (diffMin < 60) return `${diffMin} דק'`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} שע'`;
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  };

  const lastMsgText = (session: ChatSession) => {
    if (session.messages?.length > 0) {
      return session.messages[session.messages.length - 1].text.slice(0, 60);
    }
    return 'שיחה חדשה';
  };

  const senderConfig: Record<string, { label: string; color: string; bg: string }> = {
    CUSTOMER: { label: 'לקוח', color: 'text-indigo-600', bg: 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700' },
    AI:       { label: 'AI', color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800' },
    AGENT:    { label: 'נציג', color: 'text-white', bg: 'bg-indigo-600' },
    SYSTEM:   { label: 'מערכת', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  };

  const filteredSessions = sessions;

  const visitorPage = (session: ChatSession | undefined) => {
    if (!session?.metadata) return null;
    return (session.metadata as Record<string, unknown>).page as string | undefined;
  };

  // Should we show the session list?
  const showSessionList = !isMobile || mobileView === 'list';
  // Should we show the chat area?
  const showChatArea = !isMobile || mobileView === 'chat';

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950" dir="rtl">
      {/* ── Right Sidebar: Session List ── */}
      {showSessionList && (
        <aside
          className={`flex flex-col border-e border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shrink-0 relative ${
            isMobile ? 'w-full' : resizing === 'left' ? '' : 'transition-[width] duration-200'
          }`}
          style={isMobile ? undefined : { width: `${leftWidth}px` }}
        >
          {/* Resize Handle (desktop only) */}
          {!isMobile && (
            <div
              onMouseDown={(e) => { e.preventDefault(); setResizing('left'); }}
              className="absolute top-0 end-0 w-3 h-full cursor-ew-resize z-20 group/handle translate-x-1"
            >
              <div className={`absolute end-0 top-0 h-full transition-all duration-150 ${
                resizing === 'left' ? 'bg-indigo-500 w-0.5' : 'bg-transparent w-0 group-hover/handle:bg-indigo-500 group-hover/handle:w-0.5'
              }`} />
            </div>
          )}

          {/* Header */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">צ'אטים</h3>
              <span className="text-xs font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                {sessions.length}
              </span>
            </div>
            <div className="flex gap-1.5">
              {(['open', 'human', 'closed'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setSidebarTab(tab); setActiveSessionId(null); }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    sidebarTab === tab
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {{ open: 'פתוחים', human: 'נציג', closed: 'סגורים' }[tab]}
                </button>
              ))}
            </div>
          </div>

          {/* Session List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                אין שיחות
              </div>
            ) : filteredSessions.map(session => (
              <div
                key={session.id}
                onClick={() => selectSession(session.id)}
                className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors border-b border-slate-50 dark:border-slate-800/50 ${
                  activeSessionId === session.id
                    ? 'border-s-4 border-s-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10'
                    : 'border-s-4 border-s-transparent hover:bg-slate-50 dark:hover:bg-slate-800/30'
                }`}
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                    <span className="text-slate-400 font-bold text-xs">{shortId(session.id).slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className={`absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                    session.status === 'OPEN' ? 'bg-green-500' : session.status === 'PENDING_HUMAN' ? 'bg-amber-500' : 'bg-slate-300'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                      {shortId(session.id)}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0 ms-2">
                      {timeAgo(session.updatedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      session.mode === 'HUMAN'
                        ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                    }`}>
                      {session.mode === 'HUMAN' ? 'נציג' : 'AI'}
                    </span>
                    <span className="text-xs text-slate-400 truncate">{lastMsgText(session)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* ── Main Chat Area ── */}
      {showChatArea && (activeSession ? (
        <section className="flex flex-1 flex-col overflow-hidden min-w-0">
          {/* Chat Header */}
          <header className="flex h-14 items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 md:px-5 shrink-0">
            <div className="flex items-center gap-2 md:gap-3">
              {/* Back button (mobile only) */}
              {isMobile && (
                <button
                  onClick={goBackToList}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
              <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <span className="text-slate-400 font-bold text-xs">{shortId(activeSession.id).slice(0, 2).toUpperCase()}</span>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{shortId(activeSession.id)}</h4>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeSession.mode === 'HUMAN'
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    {activeSession.mode === 'HUMAN' ? 'נציג' : 'AI'}
                  </span>
                  {activeSession.mode === 'HUMAN' && messages.some(m => m.channel === 'WHATSAPP') && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-600">
                      <WhatsAppIcon className="w-3 h-3" />
                      WhatsApp
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-500 hidden md:inline">
                  {activeSession.visitorId.slice(0, 12)}... {visitorPage(activeSession) ? `| ${visitorPage(activeSession)}` : ''}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 md:gap-2">
              {activeSession.mode === 'AI' ? (
                <button
                  onClick={() => takeSession(activeSession.id)}
                  className="rounded-lg bg-indigo-600 px-3 md:px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                >
                  קח שליטה
                </button>
              ) : (
                <button
                  onClick={() => releaseSession(activeSession.id)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 md:px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  שחרר ל-AI
                </button>
              )}
              {activeSession.status !== 'CLOSED' && (
                <button
                  onClick={() => closeSession(activeSession.id)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 md:px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors hidden md:flex"
                >
                  סגור
                </button>
              )}
              {!isMobile && (
                <>
                  <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
                  <button
                    onClick={() => setShowInfoPanel(!showInfoPanel)}
                    className={`rounded-lg p-1.5 transition-colors ${
                      showInfoPanel ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </header>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-slate-50 dark:bg-slate-900/40">
            {messages.map(msg => {
              const cfg = senderConfig[msg.sender] ?? senderConfig.CUSTOMER;

              if (msg.sender === 'SYSTEM') {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="text-[11px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                      {msg.text}
                    </span>
                  </div>
                );
              }

              const isAgent = msg.sender === 'AGENT';
              const isAi = msg.sender === 'AI';

              return (
                <div key={msg.id} className={`flex ${isAgent ? 'flex-row-reverse' : ''} items-start gap-2 md:gap-3 max-w-[min(48rem,85%)] ${isAgent ? 'mr-0 ml-auto' : ''}`}>
                  {!isAgent && (
                    <div className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                      isAi ? 'bg-slate-200 dark:bg-slate-700' : 'bg-indigo-100 dark:bg-indigo-900/30'
                    }`}>
                      <span className="text-[10px] font-bold text-slate-500">
                        {isAi ? 'AI' : 'C'}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
                      {msg.channel === 'WHATSAPP' && (
                        <span className="inline-flex items-center text-green-600">
                          <WhatsAppIcon className="w-3 h-3" />
                        </span>
                      )}
                      {msg.channel === 'EMAIL' && (
                        <span className="text-[9px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                          EMAIL
                        </span>
                      )}
                    </div>
                    <div className={`rounded-2xl ${isAgent ? 'rounded-tl-none' : 'rounded-tr-none'} p-3 md:p-3.5 shadow-sm ${cfg.bg}`}>
                      {/* Media rendering */}
                      {msg.mediaUrl && msg.mediaType === 'image' && (
                        <img
                          src={msg.mediaUrl.startsWith('data:') ? msg.mediaUrl : `${API_URL}/api/chat/media/${msg.id}`}
                          alt={msg.fileName || 'Image'}
                          className="rounded-lg max-w-[240px] md:max-w-xs mb-2 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(msg.mediaUrl!.startsWith('data:') ? msg.mediaUrl! : `${API_URL}/api/chat/media/${msg.id}`, '_blank')}
                        />
                      )}
                      {msg.mediaUrl && msg.mediaType === 'audio' && (
                        <audio controls className="mb-2 max-w-[220px] md:max-w-[250px]">
                          <source src={msg.mediaUrl.startsWith('data:') ? msg.mediaUrl : `${API_URL}/api/chat/media/${msg.id}`} />
                        </audio>
                      )}
                      {msg.mediaUrl && msg.mediaType === 'video' && (
                        <video controls className="rounded-lg max-w-[240px] md:max-w-xs mb-2">
                          <source src={msg.mediaUrl.startsWith('data:') ? msg.mediaUrl : `${API_URL}/api/chat/media/${msg.id}`} />
                        </video>
                      )}
                      {msg.mediaUrl && msg.mediaType === 'document' && (
                        <a
                          href={msg.mediaUrl.startsWith('data:') ? msg.mediaUrl : `${API_URL}/api/chat/media/${msg.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-2 mb-2 px-3 py-2 rounded-lg border ${
                            isAgent ? 'border-indigo-400/30 hover:bg-indigo-500/20' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                          } transition-colors`}
                        >
                          <svg className="w-5 h-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className={`text-xs truncate ${isAgent ? 'text-white/80' : 'text-slate-600 dark:text-slate-300'}`}>
                            {msg.fileName || 'הורד קובץ'}
                          </span>
                        </a>
                      )}
                      {/* Text content */}
                      {msg.text && !(msg.mediaUrl && msg.text.startsWith('[')) && (
                        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isAgent ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`}>
                          {msg.text}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(msg.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 md:px-4 py-2 shrink-0">
            <div className="flex flex-col rounded-lg border border-slate-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
              <textarea
                ref={textareaRef}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                className="w-full border-none bg-transparent px-3 py-2.5 text-sm focus:ring-0 min-h-[36px] max-h-[80px] resize-none dark:text-white placeholder:text-slate-400 outline-none"
                placeholder={activeSession.mode === 'HUMAN' ? 'כתוב תשובה ללקוח...' : 'קח שליטה כדי לענות...'}
                rows={1}
                disabled={activeSession.status === 'CLOSED'}
              />
              <div className="flex items-center justify-between px-2 py-1.5">
                <div className="flex items-center gap-1">
                  {/* File attachment */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) sendMedia(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || activeSession.status === 'CLOSED'}
                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                    title="צרף קובץ"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
                  <span className="text-[11px] text-slate-400 hidden md:inline">
                    {activeSession.mode === 'AI' && 'AI עונה אוטומטית. קח שליטה כדי לענות ידנית.'}
                    {activeSession.mode === 'HUMAN' && activeSession.status !== 'CLOSED' && 'Enter לשליחה, Shift+Enter לשורה חדשה'}
                    {activeSession.status === 'CLOSED' && 'השיחה סגורה'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* AI Draft button */}
                  <button
                    onClick={draftWithAi}
                    disabled={drafting || activeSession.status === 'CLOSED'}
                    className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 md:px-3 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {drafting ? (
                      <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    )}
                    <span className="hidden md:inline">נסח עם AI</span>
                    <span className="md:hidden">AI</span>
                  </button>
                  {/* Send button */}
                  <button
                    onClick={sendMessage}
                    disabled={!messageText.trim() || sending || activeSession.status === 'CLOSED'}
                    className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 md:px-4 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {sending ? (
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        שלח
                        <svg className="w-3.5 h-3.5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : showChatArea && (
        <section className="flex flex-1 items-center justify-center bg-slate-50 dark:bg-slate-900/40">
          <div className="text-center text-slate-400">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-lg font-medium">בחר שיחה מהרשימה</p>
          </div>
        </section>
      ))}

      {/* ── Left Sidebar: Session Info (desktop only) ── */}
      {!isMobile && showInfoPanel && activeSession && (
        <aside
          className={`flex flex-col border-s border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-y-auto shrink-0 relative ${
            resizing === 'right' ? '' : 'transition-all duration-300'
          }`}
          style={{ width: `${rightWidth}px` }}
        >
          {/* Resize Handle */}
          <div
            onMouseDown={(e) => { e.preventDefault(); setResizing('right'); }}
            className="absolute top-0 start-0 w-3 h-full cursor-ew-resize z-20 group/handle -translate-x-1"
          >
            <div className={`absolute start-0 top-0 h-full transition-all duration-150 ${
              resizing === 'right' ? 'bg-indigo-500 w-0.5' : 'bg-transparent w-0 group-hover/handle:bg-indigo-500 group-hover/handle:w-0.5'
            }`} />
          </div>

          <div className="p-5 space-y-5">
            {/* Session Info */}
            <div className="text-center pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                <span className="text-slate-400 font-bold text-lg">{shortId(activeSession.id).slice(0, 2).toUpperCase()}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{shortId(activeSession.id)}</h3>
              <p className="text-sm text-slate-500 font-mono mt-1">{activeSession.visitorId.slice(0, 16)}...</p>
              <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                  activeSession.mode === 'HUMAN' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
                }`}>
                  {activeSession.mode}
                </span>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                  activeSession.status === 'OPEN' ? 'bg-green-100 text-green-600'
                    : activeSession.status === 'PENDING_HUMAN' ? 'bg-amber-100 text-amber-600'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {activeSession.status}
                </span>
              </div>
            </div>

            {/* Details */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">פרטי סשן</h4>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">מזהה מלא</span>
                  <span className="text-[10px] text-slate-800 dark:text-slate-200 font-mono">{activeSession.id.slice(0, 16)}...</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">נוצר</span>
                  <span className="text-xs text-slate-800 dark:text-slate-200">
                    {new Date(activeSession.createdAt).toLocaleString('he-IL')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">עודכן</span>
                  <span className="text-xs text-slate-800 dark:text-slate-200">
                    {timeAgo(activeSession.updatedAt)}
                  </span>
                </div>
                {visitorPage(activeSession) && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">עמוד</span>
                    <span className="text-xs text-slate-800 dark:text-slate-200">{visitorPage(activeSession)}</span>
                  </div>
                )}
                {activeSession.assignedAgentName && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">נציג</span>
                    <span className="text-xs text-slate-800 dark:text-slate-200">{activeSession.assignedAgentName}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">הודעות</span>
                  <span className="text-xs text-slate-800 dark:text-slate-200 font-bold">{messages.length}</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="pt-3 space-y-2">
              {activeSession.mode === 'AI' ? (
                <button
                  onClick={() => takeSession(activeSession.id)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition-colors"
                >
                  קח שליטה
                </button>
              ) : (
                <button
                  onClick={() => releaseSession(activeSession.id)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  שחרר ל-AI
                </button>
              )}
              {activeSession.status !== 'CLOSED' && (
                <button
                  onClick={() => closeSession(activeSession.id)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-200 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                >
                  סגור שיחה
                </button>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

export default LiveInbox;
