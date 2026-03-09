import './PaymentAnimation.css';
import BrowserMockup from './BrowserMockup';
import CheckoutPanel from './CheckoutPanel';
import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

// ─── Named export: standalone pricing panel (no browser frame) ───────────────
export function PaymentPricingPanel() {
  const { t, language } = useLanguage();
  const he = language === 'he';
  return (
    <div className="pricing-card pricing-dynamic">
      <div className="pricing-bg-blob pricing-bg-blob-1"></div>
      <div className="pricing-bg-blob pricing-bg-blob-2"></div>
      <div className="pricing-plans">
        <div className="pricing-plan plan-1">
          <div className="plan-content">
            <div className="plan-header">
              <h4>{he ? 'בסיסי' : 'Starter'}</h4>
              <p className="plan-subtitle">{he ? 'לפרויקטים קטנים' : 'For side projects'}</p>
            </div>
            <div className="plan-price-section">
              <div className="plan-price">{he ? '₪0' : '$0'}</div>
              <span className="plan-period">{he ? '/ חודש' : '/ month'}</span>
            </div>
            <button className="plan-button plan-button-outline">{he ? 'התחילו' : 'Get started'}</button>
            <ul className="plan-features">
              <li><span className="feature-check">✓</span>{he ? 'עד 3 פרויקטים' : 'Up to 3 projects'}</li>
              <li><span className="feature-check">✓</span>{he ? 'אנליטיקה בסיסית' : 'Basic analytics'}</li>
              <li><span className="feature-check">✓</span>{he ? 'תמיכה קהילתית' : 'Community support'}</li>
            </ul>
          </div>
        </div>
        <div className="pricing-plan plan-2 plan-featured">
          <div className="popular-badge">{he ? 'הכי פופולרי' : 'Most Popular'}</div>
          <div className="plan-content">
            <div className="plan-header">
              <h4>{he ? 'מקצועי' : 'Professional'}</h4>
              <p className="plan-subtitle">{he ? 'לצוותים צומחים' : 'For growing teams'}</p>
            </div>
            <div className="plan-price-section">
              <div className="plan-price">{he ? '₪99' : '$29'}</div>
              <span className="plan-period">{he ? '/ חודש' : '/ month'}</span>
            </div>
            <button className="plan-button plan-button-primary">{he ? 'נסו בחינם' : 'Try for free'}</button>
            <ul className="plan-features">
              <li><span className="feature-check">✓</span>{he ? 'פרויקטים ללא הגבלה' : 'Unlimited projects'}</li>
              <li><span className="feature-check">✓</span>{he ? 'אנליטיקה מתקדמת' : 'Advanced analytics'}</li>
              <li><span className="feature-check">✓</span>{he ? 'תמיכה עדיפה' : 'Priority support'}</li>
              <li><span className="feature-check">✓</span>{he ? 'עבודת צוות' : 'Team collaboration'}</li>
            </ul>
          </div>
        </div>
        <div className="pricing-plan plan-3">
          <div className="plan-content">
            <div className="plan-header">
              <h4>{he ? 'ארגוני' : 'Enterprise'}</h4>
              <p className="plan-subtitle">{he ? 'לארגונים גדולים' : 'For large organizations'}</p>
            </div>
            <div className="plan-price-section">
              <div className="plan-price-custom">{he ? 'מותאם אישית' : 'Custom'}</div>
            </div>
            <button className="plan-button plan-button-outline">{t.buttons.contactSales}</button>
            <ul className="plan-features">
              <li><span className="feature-check">✓</span>{he ? 'מנהל חשבון ייעודי' : 'Dedicated manager'}</li>
              <li><span className="feature-check">✓</span>SSO &amp; SAML</li>
              <li><span className="feature-check">✓</span>99.99% SLA</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Named export: standalone checkout panel (no browser frame) ──────────────
export function PaymentCheckoutPanel() {
  return (
    <div className="checkout-dynamic">
      <CheckoutPanel />
    </div>
  );
}

export default function PaymentAnimation({ show = 'all' }: { show?: 'all' | 'phone' | 'panel' }) {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const { t, language } = useLanguage();
  const he = language === 'he';

  return (
    <div className="payment-stage">
      {/* Phone Device */}
      {(show === 'all' || show === 'phone') && <div className="payment-phone">
        <div className="phone-side l1"></div>
        <div className="phone-side l2"></div>
        <div className="phone-side r1"></div>
        <div className="phone-bezel">
          <div className="phone-notch"></div>
          <div className="phone-screen">
            <div className="phone-appbar">
              <div className="phone-brand">
                <span className="brand-dot"></span>
                {he ? 'חנות' : 'Store'}
              </div>
              <div>{he ? 'עגלה' : 'Cart'}</div>
            </div>
            <div className="phone-list">
              <div className="phone-row">
                <div className="phone-item">
                  <div className="phone-thumb"></div>
                  <div className="phone-meta">
                    <div className="item-name">{he ? 'חולצה כחולה' : 'Blue Shirt'}</div>
                    <div className="item-desc">{he ? 'מידה M • פריט 1' : 'Size M • 1 item'}</div>
                  </div>
                </div>
                <div className="item-amt">{he ? '₪420' : '$120'}</div>
              </div>
              <div className="phone-row">
                <div className="phone-item">
                  <div className="phone-thumb"></div>
                  <div className="phone-meta">
                    <div className="item-name">{he ? 'נעלי ספורט' : 'Sports Shoes'}</div>
                    <div className="item-desc">{he ? 'מידה 42 • פריט 1' : 'Size 42 • 1 item'}</div>
                  </div>
                </div>
                <div className="item-amt">{he ? '₪299' : '$85'}</div>
              </div>
              <div className="phone-row highlight-row">
                <div className="phone-item">
                  <div className="phone-thumb highlight-thumb"></div>
                  <div className="phone-meta">
                    <div className="item-name">{he ? 'תשלום מהיר' : 'Quick Payment'}</div>
                    <div className="item-desc">{he ? 'בחרו אמצעי תשלום' : 'Choose payment method'}</div>
                  </div>
                </div>
                <div className="item-amt">{he ? '₪719' : '$205'}</div>
              </div>
            </div>
            <div className="phone-cta">{he ? 'לתשלום' : 'Checkout'}</div>
          </div>

          {/* Payment Sheet */}
          <div className="payment-sheet">
            <div className="sheet-grab"></div>
            <div className="sheet-title">{he ? 'בחרו אמצעי תשלום' : 'Choose Payment Method'}</div>
            <div className="sheet-grid">
              <button className="pay-btn paybox-pay">
                {!imageErrors.has('paybox') ? (
                  <img
                    src="/paybox-transparent.webp"
                    alt="PayBox"
                    className="pay-logo pay-logo-paybox"
                    onError={() => setImageErrors(prev => new Set(prev).add('paybox'))}
                  />
                ) : (
                  <span className="text-white font-medium">PayBox</span>
                )}
              </button>
              <button className="pay-btn visa-pay">Visa</button>
              <button className="pay-btn bit-pay">
                {!imageErrors.has('bit') ? (
                  <img
                    src="/bit-logo.png"
                    alt="Bit"
                    className="pay-logo"
                    onError={() => setImageErrors(prev => new Set(prev).add('bit'))}
                  />
                ) : (
                  <span className="text-white font-medium">Bit</span>
                )}
              </button>
              <button className="pay-btn apple-pay">
                {!imageErrors.has('apple-pay') ? (
                  <img
                    src="/apple-pay.png"
                    alt="Apple Pay"
                    className="pay-logo"
                    onError={() => setImageErrors(prev => new Set(prev).add('apple-pay'))}
                  />
                ) : (
                  <span className="text-white font-medium">Apple Pay</span>
                )}
              </button>
            </div>
          </div>

          {/* Success Overlay */}
          <div className="payment-overlay">
            <div className="success-modal">
              <div className="ok-badge">✓</div>
              <div className="modal-title">{he ? 'התשלום הצליח' : 'Payment Successful'}</div>
              <div className="modal-amount">{he ? '₪719.00' : '$205.00'}</div>
              <div className="modal-lines">
                <div>{he ? 'התשלום התקבל ואושר.' : 'Payment received and confirmed.'}</div>
                <div>{he ? 'ניתן להמשיך לגלוש.' : 'You can continue browsing.'}</div>
              </div>
              <div className="modal-btn">{he ? 'סיום' : 'Done'}</div>
            </div>
          </div>
        </div>
      </div>}

      {/* Web Panel with Flip Animation */}
      {(show === 'all' || show === 'panel') && <div className="checkout-panel">
        <div className="panel-flip-container">
          <div className="panel-flip-inner">
            {/* Front - Pricing Panel */}
            <div className="panel-flip-front">
              <BrowserMockup url="nexus.com/pricing">
                <div className="pricing-card">
                  {/* Background Accent Blobs */}
                  <div className="pricing-bg-blob pricing-bg-blob-1"></div>
                  <div className="pricing-bg-blob pricing-bg-blob-2"></div>

                  <div className="pricing-plans">
                    {/* Starter Plan */}
                    <div className="pricing-plan plan-1">
                      <div className="plan-content">
                        <div className="plan-header">
                          <h4>{he ? 'בסיסי' : 'Starter'}</h4>
                          <p className="plan-subtitle">{he ? 'לפרויקטים קטנים' : 'For side projects'}</p>
                        </div>
                        <div className="plan-price-section">
                          <div className="plan-price">{he ? '₪0' : '$0'}</div>
                          <span className="plan-period">{he ? '/ חודש' : '/ month'}</span>
                        </div>
                        <button className="plan-button plan-button-outline">{he ? 'התחילו' : 'Get started'}</button>
                        <ul className="plan-features">
                          <li><span className="feature-check">✓</span>{he ? 'עד 3 פרויקטים' : 'Up to 3 projects'}</li>
                          <li><span className="feature-check">✓</span>{he ? 'אנליטיקה בסיסית' : 'Basic analytics'}</li>
                          <li><span className="feature-check">✓</span>{he ? 'תמיכה קהילתית' : 'Community support'}</li>
                        </ul>
                      </div>
                    </div>

                    {/* Professional Plan - Featured */}
                    <div className="pricing-plan plan-2 plan-featured">
                      <div className="popular-badge">{he ? 'הכי פופולרי' : 'Most Popular'}</div>
                      <div className="plan-content">
                        <div className="plan-header">
                          <h4>{he ? 'מקצועי' : 'Professional'}</h4>
                          <p className="plan-subtitle">{he ? 'לצוותים צומחים' : 'For growing teams'}</p>
                        </div>
                        <div className="plan-price-section">
                          <div className="plan-price">{he ? '₪99' : '$29'}</div>
                          <span className="plan-period">{he ? '/ חודש' : '/ month'}</span>
                        </div>
                        <button className="plan-button plan-button-primary">{he ? 'נסו בחינם' : 'Try for free'}</button>
                        <ul className="plan-features">
                          <li><span className="feature-check">✓</span>{he ? 'פרויקטים ללא הגבלה' : 'Unlimited projects'}</li>
                          <li><span className="feature-check">✓</span>{he ? 'אנליטיקה מתקדמת' : 'Advanced analytics'}</li>
                          <li><span className="feature-check">✓</span>{he ? 'תמיכה עדיפה' : 'Priority support'}</li>
                          <li><span className="feature-check">✓</span>{he ? 'עבודת צוות' : 'Team collaboration'}</li>
                        </ul>
                      </div>
                    </div>

                    {/* Enterprise Plan */}
                    <div className="pricing-plan plan-3">
                      <div className="plan-content">
                        <div className="plan-header">
                          <h4>{he ? 'ארגוני' : 'Enterprise'}</h4>
                          <p className="plan-subtitle">{he ? 'לארגונים גדולים' : 'For large organizations'}</p>
                        </div>
                        <div className="plan-price-section">
                          <div className="plan-price-custom">{he ? 'מותאם אישית' : 'Custom'}</div>
                        </div>
                        <button className="plan-button plan-button-outline">{t.buttons.contactSales}</button>
                        <ul className="plan-features">
                          <li><span className="feature-check">✓</span>{he ? 'מנהל חשבון ייעודי' : 'Dedicated manager'}</li>
                          <li><span className="feature-check">✓</span>SSO &amp; SAML</li>
                          <li><span className="feature-check">✓</span>99.99% SLA</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </BrowserMockup>
            </div>

            {/* Back - Checkout Panel */}
            <div className="panel-flip-back">
              <BrowserMockup url="nexus.com/checkout">
                <CheckoutPanel />
              </BrowserMockup>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}
