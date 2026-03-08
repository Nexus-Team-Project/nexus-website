import { CreditCard, Wallet, Package, ArrowRight } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export default function CheckoutPanel() {
  const { language } = useLanguage();
  const he = language === 'he';
  return (
    <div className="checkout-card relative overflow-hidden">
      {/* Content Container */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
        {/* Left Column - Shipping & Payment */}
        <div className="space-y-4">
          {/* Shipping Information Glass Card */}
          <div className="glass-card p-4 rounded-xl checkout-section-1">
            <h3 className="text-sm font-bold text-slate-800 mb-3">{he ? 'פרטי משלוח' : 'Shipping Information'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-slate-600 font-medium">{he ? 'שם פרטי' : 'First Name'}</label>
                  <input
                    type="text"
                    placeholder={he ? 'ישראל' : 'John'}
                    className="w-full bg-transparent border-b border-slate-300 py-1 text-[10px] focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-slate-600 font-medium">{he ? 'שם משפחה' : 'Last Name'}</label>
                  <input
                    type="text"
                    placeholder={he ? 'ישראלי' : 'Doe'}
                    className="w-full bg-transparent border-b border-slate-300 py-1 text-[10px] focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-[9px] text-slate-600 font-medium">{he ? 'כתובת' : 'Address'}</label>
                <input
                  type="text"
                  placeholder={he ? 'רחוב הרצל 1' : '123 Main St'}
                  className="w-full bg-transparent border-b border-slate-300 py-1 text-[10px] focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-slate-600 font-medium">{he ? 'עיר' : 'City'}</label>
                  <input
                    type="text"
                    placeholder={he ? 'תל אביב' : 'New York'}
                    className="w-full bg-transparent border-b border-slate-300 py-1 text-[10px] focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-slate-600 font-medium">{he ? 'מיקוד' : 'ZIP Code'}</label>
                  <input
                    type="text"
                    placeholder={he ? '6100000' : '10001'}
                    className="w-full bg-transparent border-b border-slate-300 py-1 text-[10px] focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Payment Method Glass Card */}
          <div className="glass-card p-4 rounded-xl checkout-section-2">
            <h3 className="text-sm font-bold text-slate-800 mb-3">{he ? 'אמצעי תשלום' : 'Payment Method'}</h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <button className="payment-method-btn active">
                <CreditCard className="w-4 h-4" />
                <span className="text-[9px] font-semibold">{he ? 'כרטיס' : 'Card'}</span>
              </button>
              <button className="payment-method-btn">
                <Wallet className="w-4 h-4" />
                <span className="text-[9px] font-semibold">{he ? 'ארנק' : 'Wallet'}</span>
              </button>
              <button className="payment-method-btn">
                <Package className="w-4 h-4" />
                <span className="text-[9px] font-semibold">{he ? 'מזומן' : 'COD'}</span>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[9px] text-slate-600 font-medium">{he ? 'מספר כרטיס' : 'Card Number'}</label>
                <input
                  type="text"
                  placeholder="1234 5678 9012 3456"
                  className="w-full bg-transparent border-b border-slate-300 py-1 text-[10px] focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-slate-600 font-medium">{he ? 'תוקף' : 'Expiry Date'}</label>
                  <input
                    type="text"
                    placeholder="MM/YY"
                    className="w-full bg-transparent border-b border-slate-300 py-1 text-[10px] focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-slate-600 font-medium">CVV</label>
                  <input
                    type="text"
                    placeholder="123"
                    className="w-full bg-transparent border-b border-slate-300 py-1 text-[10px] focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Order Summary */}
        <div className="glass-card p-4 rounded-xl checkout-section-3">
          <h3 className="text-sm font-bold text-slate-800 mb-3">{he ? 'סיכום הזמנה' : 'Order Summary'}</h3>
          <div className="space-y-3 mb-4">
            {/* Product Items */}
            <div className="flex items-center gap-3 pb-2 border-b border-slate-200/50">
              <img
                src="https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=100&h=100&fit=crop"
                alt={he ? 'חולצה כחולה' : 'Blue Shirt'}
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-slate-200"
              />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-slate-800">{he ? 'חולצה כחולה' : 'Blue Shirt'}</div>
                <div className="text-[9px] text-slate-500">{he ? 'מידה M × 1' : 'Size M × 1'}</div>
              </div>
              <div className="text-[10px] font-bold text-slate-800">{he ? '₪420' : '$120'}</div>
            </div>
            <div className="flex items-center gap-3 pb-2 border-b border-slate-200/50">
              <img
                src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100&h=100&fit=crop"
                alt={he ? 'נעלי ספורט' : 'Sports Shoes'}
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-slate-200"
              />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-slate-800">{he ? 'נעלי ספורט' : 'Sports Shoes'}</div>
                <div className="text-[9px] text-slate-500">{he ? 'מידה 42 × 1' : 'Size 42 × 1'}</div>
              </div>
              <div className="text-[10px] font-bold text-slate-800">{he ? '₪299' : '$85'}</div>
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="space-y-2 py-3 border-t border-slate-200/50">
            <div className="flex justify-between text-[9px] text-slate-600">
              <span>{he ? 'סכום ביניים' : 'Subtotal'}</span>
              <span>{he ? '₪719.00' : '$205.00'}</span>
            </div>
            <div className="flex justify-between text-[9px] text-slate-600">
              <span>{he ? 'משלוח' : 'Shipping'}</span>
              <span>{he ? '₪35.00' : '$10.00'}</span>
            </div>
            <div className="flex justify-between text-[9px] text-slate-600">
              <span>{he ? 'מע״מ' : 'Tax'}</span>
              <span>{he ? '₪52.00' : '$15.00'}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-slate-800 pt-2 border-t border-slate-200/50">
              <span>{he ? 'סה״כ' : 'Total'}</span>
              <span>{he ? '₪806.00' : '$230.00'}</span>
            </div>
          </div>

          {/* Checkout Button */}
          <button className="group w-full mt-4 inline-flex items-center justify-center gap-2 bg-stripe-purple hover:bg-stripe-purple/85 text-white font-semibold py-2.5 rounded-lg text-[11px] transition-all duration-300 hover:shadow-xl hover:shadow-stripe-purple/30">
            {he ? 'השלמת רכישה' : 'Complete Purchase'}
            <span className="inline-block w-0 overflow-hidden group-hover:w-4 transition-all duration-300 ease-out">
              <ArrowRight size={14} className={`inline ${he ? 'scale-x-[-1]' : ''}`} />
            </span>
          </button>

          {/* Security Badge */}
          <div className="mt-3 flex items-center justify-center gap-2 text-[8px] text-slate-500">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span>{he ? 'תשלום מאובטח באמצעות Nexus' : 'Secure checkout powered by Nexus'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
