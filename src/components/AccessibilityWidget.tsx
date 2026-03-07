import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Type,
  SunMoon,
  Link,
  AlignLeft,
  ZapOff,
  MoveHorizontal,
  MousePointer2,
  Crosshair,
  RotateCcw,
  Mail,
  Palette,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type FontSize = 0 | 1 | 2; // 0=normal, 1=large (+20%), 2=larger (+40%)

interface A11ySettings {
  fontSize: FontSize;
  highContrast: boolean;
  grayscale: boolean;
  highlightLinks: boolean;
  readableFont: boolean;
  noAnimations: boolean;
  textSpacing: boolean;
  bigCursor: boolean;
  focusHighlight: boolean;
}

const DEFAULT_SETTINGS: A11ySettings = {
  fontSize: 0,
  highContrast: false,
  grayscale: false,
  highlightLinks: false,
  readableFont: false,
  noAnimations: false,
  textSpacing: false,
  bigCursor: false,
  focusHighlight: false,
};

const STORAGE_KEY = 'nexus-a11y-settings';

// ─── CSS class application ────────────────────────────────────────────────────

function applySettings(s: A11ySettings) {
  const html = document.documentElement;
  html.classList.remove('a11y-font-md', 'a11y-font-lg');
  if (s.fontSize === 1) html.classList.add('a11y-font-md');
  if (s.fontSize === 2) html.classList.add('a11y-font-lg');
  html.classList.toggle('a11y-high-contrast', s.highContrast);
  html.classList.toggle('a11y-grayscale', s.grayscale);
  html.classList.toggle('a11y-highlight-links', s.highlightLinks);
  html.classList.toggle('a11y-readable-font', s.readableFont);
  html.classList.toggle('a11y-no-animations', s.noAnimations);
  html.classList.toggle('a11y-text-spacing', s.textSpacing);
  html.classList.toggle('a11y-big-cursor', s.bigCursor);
  html.classList.toggle('a11y-focus-highlight', s.focusHighlight);
}

function isModified(s: A11ySettings) {
  return (
    s.fontSize !== 0 ||
    s.highContrast ||
    s.grayscale ||
    s.highlightLinks ||
    s.readableFont ||
    s.noAnimations ||
    s.textSpacing ||
    s.bigCursor ||
    s.focusHighlight
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ToggleRowProps {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}

function ToggleRow({ icon, label, checked, onChange, id }: ToggleRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        gap: 12,
      }}
    >
      <label
        htmlFor={id}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          flex: 1,
          color: checked ? '#a78bfa' : 'rgba(255,255,255,0.85)',
          fontSize: 14,
          fontWeight: checked ? 500 : 400,
          userSelect: 'none',
          transition: 'color 0.2s',
        }}
      >
        <span
          style={{
            color: checked ? '#a78bfa' : 'rgba(255,255,255,0.5)',
            flexShrink: 0,
            transition: 'color 0.2s',
          }}
        >
          {icon}
        </span>
        {label}
      </label>

      {/* Toggle switch */}
      <button
        role="switch"
        aria-checked={checked}
        id={id}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: 44,
          height: 24,
          borderRadius: 12,
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          background: checked
            ? 'linear-gradient(135deg, #635bff, #00d4ff)'
            : 'rgba(255,255,255,0.15)',
          transition: 'background 0.25s',
          outline: 'none',
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onChange(!checked);
          }
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 23 : 3,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.25s',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }}
        />
      </button>
    </div>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<A11ySettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Apply settings on mount + on change
  useEffect(() => {
    applySettings(settings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage errors
    }
  }, [settings]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const update = useCallback(<K extends keyof A11ySettings>(key: K, value: A11ySettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const modified = isModified(settings);

  return (
    <div
      data-a11y-widget="true"
      style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column-reverse',
        alignItems: 'flex-start',
        gap: 12,
        fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
        direction: 'rtl',
      }}
    >
      {/* ── Panel ────────────────────────────────────────────────────────── */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="הגדרות נגישות"
          aria-modal="true"
          style={{
            width: 310,
            background: 'linear-gradient(160deg, #0e1f3a 0%, #0a2540 60%, #111827 100%)',
            border: '1px solid rgba(99,91,255,0.3)',
            borderRadius: 16,
            boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,91,255,0.15)',
            overflow: 'hidden',
            animation: 'a11y-slide-up 0.22s ease-out',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              background: 'linear-gradient(90deg, rgba(99,91,255,0.18) 0%, rgba(0,212,255,0.08) 100%)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Universal Accessibility Icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="4" r="2" fill="#a78bfa" />
                <path
                  d="M12 7c-1.1 0-2 .9-2 2v4l-2 5h2l1.5-3.5h1L14 18h2l-2-5V9c0-1.1-.9-2-2-2z"
                  fill="#a78bfa"
                />
                <path d="M9 9H6M15 9h3" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>הגדרות נגישות</span>
            </div>
            <button
              aria-label="סגור הגדרות נגישות"
              onClick={() => { setOpen(false); triggerRef.current?.focus(); }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 4,
                borderRadius: 6,
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)';
                (e.currentTarget as HTMLButtonElement).style.background = 'none';
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '4px 16px 8px' }}>

            {/* Font size */}
            <div
              style={{
                padding: '10px 0',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    color: settings.fontSize > 0 ? '#a78bfa' : 'rgba(255,255,255,0.85)',
                    fontSize: 14,
                    fontWeight: settings.fontSize > 0 ? 500 : 400,
                  }}
                >
                  <Type
                    size={16}
                    color={settings.fontSize > 0 ? '#a78bfa' : 'rgba(255,255,255,0.5)'}
                  />
                  גודל טקסט
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {([0, 1, 2] as FontSize[]).map((level) => {
                    const labels = ['A', 'A+', 'A++'];
                    const sizes = [12, 14, 16];
                    const active = settings.fontSize === level;
                    return (
                      <button
                        key={level}
                        aria-pressed={active}
                        aria-label={`גודל טקסט ${labels[level]}`}
                        onClick={() => update('fontSize', level)}
                        style={{
                          width: 36,
                          height: 28,
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: sizes[level],
                          fontWeight: 700,
                          fontFamily: 'inherit',
                          background: active
                            ? 'linear-gradient(135deg, #635bff, #00d4ff)'
                            : 'rgba(255,255,255,0.08)',
                          color: active ? '#fff' : 'rgba(255,255,255,0.6)',
                          transition: 'all 0.2s',
                        }}
                      >
                        {labels[level]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Toggle rows */}
            <ToggleRow
              id="a11y-contrast"
              icon={<SunMoon size={16} />}
              label="ניגודיות גבוהה"
              checked={settings.highContrast}
              onChange={(v) => update('highContrast', v)}
            />
            <ToggleRow
              id="a11y-grayscale"
              icon={<Palette size={16} />}
              label="גווני אפור"
              checked={settings.grayscale}
              onChange={(v) => update('grayscale', v)}
            />
            <ToggleRow
              id="a11y-links"
              icon={<Link size={16} />}
              label="הדגשת קישורים"
              checked={settings.highlightLinks}
              onChange={(v) => update('highlightLinks', v)}
            />
            <ToggleRow
              id="a11y-font"
              icon={<AlignLeft size={16} />}
              label="פונט קריא (דיסלקציה)"
              checked={settings.readableFont}
              onChange={(v) => update('readableFont', v)}
            />
            <ToggleRow
              id="a11y-anim"
              icon={<ZapOff size={16} />}
              label="עצירת אנימציות"
              checked={settings.noAnimations}
              onChange={(v) => update('noAnimations', v)}
            />
            <ToggleRow
              id="a11y-spacing"
              icon={<MoveHorizontal size={16} />}
              label="ריווח טקסט מוגבר"
              checked={settings.textSpacing}
              onChange={(v) => update('textSpacing', v)}
            />
            <ToggleRow
              id="a11y-cursor"
              icon={<MousePointer2 size={16} />}
              label="סמן מוגדל"
              checked={settings.bigCursor}
              onChange={(v) => update('bigCursor', v)}
            />
            <ToggleRow
              id="a11y-focus"
              icon={<Crosshair size={16} />}
              label="הדגשת פוקוס מקלדת"
              checked={settings.focusHighlight}
              onChange={(v) => update('focusHighlight', v)}
            />
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '10px 16px 14px',
              borderTop: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {/* Reset */}
            <button
              onClick={reset}
              disabled={!modified}
              style={{
                width: '100%',
                padding: '9px 0',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
                background: modified ? 'rgba(99,91,255,0.15)' : 'rgba(255,255,255,0.04)',
                color: modified ? '#a78bfa' : 'rgba(255,255,255,0.25)',
                cursor: modified ? 'pointer' : 'default',
                fontSize: 13,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.2s',
                fontFamily: 'inherit',
              }}
            >
              <RotateCcw size={13} />
              איפוס כל ההגדרות
            </button>

            {/* Accessibility contact */}
            <a
              href="mailto:hello@nexus-pay.com?subject=פנייה בנושא נגישות"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginTop: 10,
                color: 'rgba(255,255,255,0.35)',
                fontSize: 11.5,
                textDecoration: 'none',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.7)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.35)')}
            >
              <Mail size={11} />
              לפנייה בנושא נגישות: hello@nexus-pay.com
            </a>
          </div>
        </div>
      )}

      {/* ── Trigger button ────────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        aria-label={open ? 'סגור הגדרות נגישות' : 'פתח הגדרות נגישות'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        title="הגדרות נגישות"
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: open
            ? 'linear-gradient(135deg, #4f46e5, #0ea5e9)'
            : 'linear-gradient(135deg, #635bff, #00d4ff)',
          boxShadow: open
            ? '0 4px 20px rgba(99,91,255,0.6)'
            : '0 4px 16px rgba(99,91,255,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 24px rgba(99,91,255,0.65)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = open
            ? '0 4px 20px rgba(99,91,255,0.6)'
            : '0 4px 16px rgba(99,91,255,0.45)';
        }}
      >
        {/* Universal Accessibility Icon */}
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="4.5" r="2" fill="white" />
          <path
            d="M6.5 8.5h11M12 8.5V14m0 0l-2.5 5.5M12 14l2.5 5.5"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Active indicator dot */}
        {modified && !open && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#f97316',
              border: '2px solid white',
            }}
          />
        )}
      </button>

      {/* Keyframe animation */}
      <style>{`
        @keyframes a11y-slide-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        [data-a11y-widget="true"] button:focus-visible {
          outline: 2px solid #00d4ff !important;
          outline-offset: 2px !important;
        }
      `}</style>
    </div>
  );
}
