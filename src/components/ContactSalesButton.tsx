import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface ContactSalesButtonProps {
  onClick: () => void;
}

export default function ContactSalesButton({ onClick }: ContactSalesButtonProps) {
  const [hovered, setHovered] = useState(false);
  const { t } = useLanguage();

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-white rounded-xl px-5 py-3.5 shadow-lg hover:shadow-2xl transition-all duration-300 group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        transform: hovered ? 'translate3d(0, -2px, 0)' : 'translate3d(0, 0, 0)',
        willChange: 'transform',
        backfaceVisibility: 'hidden' as const,
      }}
    >
      <div className="relative">
        <MessageCircle
          size={22}
          className="text-stripe-purple transition-transform duration-300"
          style={{
            transform: hovered ? 'scale(1.15) rotate(-8deg)' : 'scale(1) rotate(0)',
          }}
        />
        {/* Animated ping dot */}
        <span
          className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-stripe-purple transition-opacity duration-300"
          style={{ opacity: hovered ? 1 : 0 }}
        >
          <span className="absolute inset-0 rounded-full bg-stripe-purple animate-ping" />
        </span>
      </div>
      <span className="text-sm font-semibold text-stripe-dark">{t.buttons.contactSales}</span>
    </button>
  );
}
