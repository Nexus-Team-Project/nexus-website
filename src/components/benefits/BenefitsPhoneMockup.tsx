import './BenefitsPhoneMockup.css';
import { useLanguage } from '../../i18n/LanguageContext';

const BENEFIT_CARDS = [
  { name: 'Golf & Co',      logo: '/brands/golf.png',           bg: '#FFF59D', discount: '25%' },
  { name: 'American Eagle',  logo: '/brands/american-eagle.png', bg: '#1a3a7a', discount: '30%' },
  { name: 'Rami Levy',       logo: '/brands/rami-levy.png',      bg: '#B3171D', discount: '15%' },
  { name: 'Mango',           logo: '/brands/mango.png',          bg: '#FFFFFF', discount: '20%' },
  { name: 'Castro',          logo: '/brands/castro-home.png',     bg: '#f8f4f0', discount: '35%' },
  { name: 'Samsung',         logo: '/brands/samsung.png',         bg: '#1428a0', discount: '10%' },
];

interface Props {
  orgName?: string;
  orgColor?: string;
  variant?: 'default' | 'branded';
}

export default function BenefitsPhoneMockup({ orgName, orgColor = '#635bff', variant = 'default' }: Props) {
  const { language } = useLanguage();
  const he = language === 'he';

  return (
    <div className="relative flex items-center justify-center">
      {/* Background blobs */}
      <div
        className="benefits-blob-1 absolute rounded-full pointer-events-none"
        style={{ width: 180, height: 180, background: orgColor, filter: 'blur(50px)', top: -30, right: -40, zIndex: 0 }}
      />
      <div
        className="benefits-blob-2 absolute rounded-full pointer-events-none"
        style={{ width: 140, height: 140, background: '#00D4FF', filter: 'blur(45px)', bottom: -20, left: -30, zIndex: 0 }}
      />

      {/* Phone device */}
      <div className="benefits-phone relative" style={{ zIndex: 1 }}>
        <div
          style={{
            width: 240,
            height: 480,
            borderRadius: 32,
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.28)',
            boxShadow: '0 30px 70px rgba(10,20,40,0.35), inset 0 0 0 1px rgba(255,255,255,0.7)',
            padding: 10,
            position: 'relative',
          }}
        >
          {/* Side buttons */}
          <div className="phone-side l1" style={{ position: 'absolute', width: 3, background: '#e5e7eb', borderRadius: 6, left: -3, top: 94, height: 28 }} />
          <div className="phone-side l2" style={{ position: 'absolute', width: 3, background: '#e5e7eb', borderRadius: 6, left: -3, top: 134, height: 46 }} />
          <div className="phone-side r1" style={{ position: 'absolute', width: 3, background: '#e5e7eb', borderRadius: 6, right: -3, top: 118, height: 36 }} />

          {/* Bezel */}
          <div
            style={{
              height: '100%',
              borderRadius: 32,
              background: '#ffffff',
              border: '1px solid rgba(0,0,0,0.10)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Notch */}
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 114,
                height: 22,
                background: 'linear-gradient(180deg, rgba(10,20,40,0.18), rgba(10,20,40,0.10))',
                borderRadius: 999,
                zIndex: 50,
              }}
            />

            {/* Screen */}
            <div
              className="benefits-phone-screen"
              style={{
                position: 'absolute',
                inset: 0,
                padding: '42px 13px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                zIndex: 1,
                background: '#ffffff',
              }}
            >
              {/* App bar */}
              <div className="org-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, color: '#6b7280' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 900, color: '#111827' }}>
                  {variant === 'branded' ? (
                    <div style={{ width: 8, height: 8, borderRadius: 3, background: orgColor }} />
                  ) : (
                    <div style={{ width: 8, height: 8, borderRadius: 3, background: 'linear-gradient(135deg, #635bff, #7c3aed)' }} />
                  )}
                  <span>{variant === 'branded' && orgName ? orgName : (he ? 'מועדון הטבות' : 'Benefits Club')}</span>
                </div>
                <span>{he ? 'הטבות' : 'Benefits'}</span>
              </div>

              {/* Category label */}
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <span style={{
                  fontSize: 7,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: `${orgColor}15`,
                  color: orgColor,
                }}>
                  {he ? 'הטבות פופולריות' : 'Popular'}
                </span>
                <span style={{
                  fontSize: 7,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: '#f1f5f9',
                  color: '#94a3b8',
                }}>
                  {he ? 'חדש' : 'New'}
                </span>
              </div>

              {/* Benefits cards grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                {BENEFIT_CARDS.map((card) => (
                  <div
                    key={card.name}
                    className="benefit-card"
                    style={{
                      borderRadius: 10,
                      border: '1px solid rgba(10,20,40,0.10)',
                      background: '#fff',
                      boxShadow: '0 4px 12px rgba(10,20,40,0.06)',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    {/* Brand logo area */}
                    <div
                      style={{
                        height: 50,
                        background: card.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 6,
                      }}
                    >
                      <img
                        src={card.logo}
                        alt={card.name}
                        style={{ maxWidth: '80%', maxHeight: 32, objectFit: 'contain' }}
                      />
                    </div>
                    {/* Info */}
                    <div style={{ padding: '5px 6px' }}>
                      <div style={{ fontSize: 8, fontWeight: 800, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {card.name}
                      </div>
                      <div style={{ fontSize: 7, color: '#6b7280', marginTop: 1 }}>
                        {he ? `עד ${card.discount} הנחה` : `Up to ${card.discount} off`}
                      </div>
                    </div>
                    {/* Discount badge */}
                    <div
                      className="discount-badge"
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        background: '#22c55e',
                        color: '#fff',
                        fontSize: 6,
                        fontWeight: 900,
                        padding: '1.5px 5px',
                        borderRadius: 999,
                      }}
                    >
                      {card.discount}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom CTA */}
              <div
                className="phone-cta-benefits"
                style={{
                  marginTop: 'auto',
                  padding: 9,
                  borderRadius: 11,
                  background: variant === 'branded' ? orgColor : '#0b1220',
                  color: '#fff',
                  fontWeight: 900,
                  textAlign: 'center',
                  fontSize: 10,
                  boxShadow: '0 10px 24px rgba(10,20,40,0.22)',
                }}
              >
                {he ? 'לכל ההטבות' : 'View All Benefits'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
