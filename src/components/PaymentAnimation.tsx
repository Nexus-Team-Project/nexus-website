import './PaymentAnimation.css';
import BrowserMockup from './BrowserMockup';
import CheckoutPanel from './CheckoutPanel';
import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function PaymentAnimation() {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const { t } = useLanguage();

  return (
    <div className="payment-stage">
      {/* Phone Device */}
      <div className="payment-phone">
        <div className="phone-side l1"></div>
        <div className="phone-side l2"></div>
        <div className="phone-side r1"></div>
        <div className="phone-bezel">
          <div className="phone-notch"></div>
          <div className="phone-screen">
            <div className="phone-appbar">
              <div className="phone-brand">
                <span className="brand-dot"></span>
                Store
              </div>
              <div>Cart</div>
            </div>
            <div className="phone-list">
              <div className="phone-row">
                <div className="phone-item">
                  <div className="phone-thumb"></div>
                  <div className="phone-meta">
                    <div className="item-name">Blue Shirt</div>
                    <div className="item-desc">Size M • 1 item</div>
                  </div>
                </div>
                <div className="item-amt">$120</div>
              </div>
              <div className="phone-row">
                <div className="phone-item">
                  <div className="phone-thumb"></div>
                  <div className="phone-meta">
                    <div className="item-name">Sports Shoes</div>
                    <div className="item-desc">Size 42 • 1 item</div>
                  </div>
                </div>
                <div className="item-amt">$85</div>
              </div>
              <div className="phone-row highlight-row">
                <div className="phone-item">
                  <div className="phone-thumb highlight-thumb"></div>
                  <div className="phone-meta">
                    <div className="item-name">Quick Payment</div>
                    <div className="item-desc">Choose payment method</div>
                  </div>
                </div>
                <div className="item-amt">$205</div>
              </div>
            </div>
            <div className="phone-cta">Checkout</div>
          </div>

          {/* Payment Sheet */}
          <div className="payment-sheet">
            <div className="sheet-grab"></div>
            <div className="sheet-title">Choose Payment Method</div>
            <div className="sheet-grid">
              <button className="pay-btn paybox-pay">
                {!imageErrors.has('paybox') ? (
                  <img
                    src="/paybox-transparent.png"
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
              <div className="modal-title">Payment Successful</div>
              <div className="modal-amount">$205.00</div>
              <div className="modal-lines">
                <div>Payment received and confirmed.</div>
                <div>You can continue browsing.</div>
              </div>
              <div className="modal-btn">Done</div>
            </div>
          </div>
        </div>
      </div>

      {/* Web Panel with Flip Animation */}
      <div className="checkout-panel">
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
                          <h4>Starter</h4>
                          <p className="plan-subtitle">For side projects</p>
                        </div>
                        <div className="plan-price-section">
                          <div className="plan-price">$0</div>
                          <span className="plan-period">/ month</span>
                        </div>
                        <button className="plan-button plan-button-outline">Get started</button>
                        <ul className="plan-features">
                          <li><span className="feature-check">✓</span>Up to 3 projects</li>
                          <li><span className="feature-check">✓</span>Basic analytics</li>
                          <li><span className="feature-check">✓</span>Community support</li>
                        </ul>
                      </div>
                    </div>

                    {/* Professional Plan - Featured */}
                    <div className="pricing-plan plan-2 plan-featured">
                      <div className="popular-badge">Most Popular</div>
                      <div className="plan-content">
                        <div className="plan-header">
                          <h4>Professional</h4>
                          <p className="plan-subtitle">For growing teams</p>
                        </div>
                        <div className="plan-price-section">
                          <div className="plan-price">$29</div>
                          <span className="plan-period">/ month</span>
                        </div>
                        <button className="plan-button plan-button-primary">Try for free</button>
                        <ul className="plan-features">
                          <li><span className="feature-check">✓</span>Unlimited projects</li>
                          <li><span className="feature-check">✓</span>Advanced analytics</li>
                          <li><span className="feature-check">✓</span>Priority support</li>
                          <li><span className="feature-check">✓</span>Team collaboration</li>
                        </ul>
                      </div>
                    </div>

                    {/* Enterprise Plan */}
                    <div className="pricing-plan plan-3">
                      <div className="plan-content">
                        <div className="plan-header">
                          <h4>Enterprise</h4>
                          <p className="plan-subtitle">For large organizations</p>
                        </div>
                        <div className="plan-price-section">
                          <div className="plan-price-custom">Custom</div>
                        </div>
                        <button className="plan-button plan-button-outline">{t.buttons.contactSales}</button>
                        <ul className="plan-features">
                          <li><span className="feature-check">✓</span>Dedicated manager</li>
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
      </div>
    </div>
  );
}
