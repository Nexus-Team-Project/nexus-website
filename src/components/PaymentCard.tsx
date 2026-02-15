import { CreditCard, Mail } from 'lucide-react';
import { useState } from 'react';

export default function PaymentCard() {
  const [iconErrors, setIconErrors] = useState<Set<string>>(new Set());

  return (
    <div className="bg-white rounded-3xl p-8 shadow-2xl border border-gray-100 max-w-md">
      {/* Product Icon */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          {/* Stacked cards illustration */}
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-cyan-500 rounded-2xl transform -rotate-6" />
            <div className="absolute inset-0 bg-gradient-to-br from-purple-400 to-purple-500 rounded-2xl transform rotate-3" />
            <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-pink-400 rounded-2xl flex items-center justify-center">
              <span className="text-white font-bold text-xs">Cloud</span>
            </div>
          </div>
        </div>
      </div>

      {/* Product Info */}
      <div className="text-center mb-6">
        <h3 className="text-slate-900 font-semibold text-lg mb-1">Increment Magazine</h3>
        <p className="text-slate-500 text-sm">$14 per quarter</p>
      </div>

      {/* Apple Pay Button */}
      <button className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-lg mb-4 transition-colors flex items-center justify-center gap-2">
        <svg width="40" height="16" viewBox="0 0 40 16" fill="currentColor">
          <path d="M6.4 2.5c-.4.5-.9.8-1.4.8-.1 0-.1 0-.2-.1 0-.5.2-1 .5-1.4.4-.5.9-.8 1.5-.9 0 .1 0 .1 0 .2 0 .4-.1.9-.4 1.4zm.4 1.3c-.8 0-1.4.4-1.8.4-.4 0-1-.4-1.7-.4C2.1 3.8 1 4.6.6 5.8c-.8 2.1-.2 5.2 1.4 6.9.4.4.9.9 1.6.9.6 0 .9-.4 1.6-.4.7 0 1 .4 1.7.4.7 0 1.1-.5 1.6-.9.5-.5.8-1.1 1-1.8-1.3-.5-2.1-1.8-2.1-3.1 0-1.1.7-2.1 1.8-2.6-.7-1-1.8-1.6-3-1.6z"/>
          <path d="M14.5 1.8c1.5 0 2.5 1 2.5 2.5 0 1.5-1.1 2.5-2.6 2.5h-1.7v2.6h-1.3V1.8h3.1zm-1.8 3.9h1.4c1 0 1.6-.5 1.6-1.4 0-.9-.6-1.4-1.6-1.4h-1.4v2.8zm7 4.8c-1.3 0-2.1-.6-2.1-1.5 0-.9.7-1.4 2-1.5l1.5-.1v-.4c0-.6-.4-.9-1.1-.9-.6 0-1 .3-1.1.7h-1.1c.1-1 1-1.6 2.2-1.6 1.4 0 2.3.7 2.3 1.8v3.8h-1.2v-.9h-.1c-.3.6-.9.9-1.7.9zm.3-1c.7 0 1.2-.4 1.2-1v-.4l-1.3.1c-.7 0-1.1.3-1.1.8 0 .5.4.8 1.2.8zm3.1 4.2v-1c.1 0 .3 0 .4 0 .6 0 .9-.2 1.1-.9 0-.1.1-.3.1-.3l-2.2-5.9h1.3l1.5 4.9h.1l1.5-4.9h1.3l-2.3 6.3c-.5 1.3-1 1.8-2.2 1.8-.1 0-.4 0-.6 0z"/>
        </svg>
      </button>

      <div className="text-center text-sm text-slate-500 mb-6">Or pay with card</div>

      {/* Email Input */}
      <div className="mb-4">
        <label className="block text-slate-700 text-sm font-medium mb-2">Email</label>
        <input
          type="email"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple transition-colors"
          placeholder=""
        />
      </div>

      {/* Card Information */}
      <div className="mb-4">
        <label className="block text-slate-700 text-sm font-medium mb-2">Card Information</label>
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          {/* Card Number */}
          <div className="flex items-center px-4 py-3 border-b border-gray-300">
            <input
              type="text"
              placeholder="1234 1234 1234 1234"
              className="flex-1 text-sm focus:outline-none"
            />
            <div className="flex gap-2 ml-2 items-center">
              {!iconErrors.has('Frame-1') && (
                <img
                  src="/icons/Frame-1.svg"
                  alt="Card with badge"
                  className="h-4"
                  onError={() => setIconErrors(prev => new Set(prev).add('Frame-1'))}
                />
              )}
              {!iconErrors.has('Frame-5') && (
                <img
                  src="/icons/Frame-5.svg"
                  alt="Visa"
                  className="h-3"
                  onError={() => setIconErrors(prev => new Set(prev).add('Frame-5'))}
                />
              )}
              {!iconErrors.has('Frame-4') && (
                <img
                  src="/icons/Frame-4.svg"
                  alt="Mastercard"
                  className="h-3"
                  onError={() => setIconErrors(prev => new Set(prev).add('Frame-4'))}
                />
              )}
              {!iconErrors.has('Frame-3') && (
                <img
                  src="/icons/Frame-3.svg"
                  alt="Amex"
                  className="h-3"
                  onError={() => setIconErrors(prev => new Set(prev).add('Frame-3'))}
                />
              )}
              {!iconErrors.has('Frame-2') && (
                <img
                  src="/icons/Frame-2.svg"
                  alt="Discover"
                  className="h-3"
                  onError={() => setIconErrors(prev => new Set(prev).add('Frame-2'))}
                />
              )}
            </div>
          </div>

          {/* MM/YY and CVC */}
          <div className="flex">
            <input
              type="text"
              placeholder="MM / YY"
              className="flex-1 px-4 py-3 text-sm focus:outline-none border-r border-gray-300"
            />
            <input
              type="text"
              placeholder="CVC"
              className="w-24 px-4 py-3 text-sm focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Country */}
      <div className="mb-4">
        <label className="block text-slate-700 text-sm font-medium mb-2">Country or region</label>
        <div className="relative">
          <select className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple transition-colors appearance-none bg-white pr-10">
            <option>United States</option>
            <option>Canada</option>
            <option>United Kingdom</option>
            <option>Israel</option>
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            {!iconErrors.has('Frame') ? (
              <img
                src="/icons/Frame.svg"
                alt="Dropdown"
                className="w-2.5"
                onError={() => setIconErrors(prev => new Set(prev).add('Frame'))}
              />
            ) : (
              <svg className="w-2.5 h-2.5 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* ZIP */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="ZIP"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stripe-purple/30 focus:border-stripe-purple transition-colors"
        />
      </div>

      {/* Pay Button */}
      <button className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3.5 rounded-lg transition-colors">
        Pay
      </button>
    </div>
  );
}
