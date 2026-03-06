// Tracking Plan — Object_Action naming convention
// Every event name here corresponds to an entry in tracking-plan.json

// ─── MARKETING channel ────────────────────────────────────
export const MARKETING = {
  PAGE_VIEWED:            'Page_Viewed',
  HERO_CTA_CLICKED:       'Hero_CTA_Clicked',
  NAVBAR_CTA_CLICKED:     'Navbar_CTA_Clicked',
  PRICING_SECTION_VIEWED: 'Pricing_Section_Viewed',
  LEAD_FORM_SUBMITTED:    'Lead_Form_Submitted',
  CHAT_WIDGET_OPENED:     'Chat_Widget_Opened',
  SIGNUP_PAGE_VIEWED:     'Signup_Page_Viewed',
  DEMO_REQUESTED:         'Demo_Requested',
} as const;

// ─── PRODUCT channel ──────────────────────────────────────
export const PRODUCT = {
  USER_SIGNED_UP:         'User_Signed_Up',
  USER_LOGGED_IN:         'User_Logged_In',
  DASHBOARD_VIEWED:       'Dashboard_Viewed',
  CHAT_SESSION_STARTED:   'Chat_Session_Started',
  CHAT_MESSAGE_SENT:      'Chat_Message_Sent',
  AI_RATING_SUBMITTED:    'AI_Rating_Submitted',
  PAYMENT_INITIATED:      'Payment_Initiated',
  PAYMENT_COMPLETED:      'Payment_Completed',
  PAYMENT_FAILED:         'Payment_Failed',
  PAYMENT_REFUNDED:       'Payment_Refunded',
  FEATURE_USED:           'Feature_Used',
} as const;

// ─── WALLET channel ───────────────────────────────────────
export const WALLET = {
  DASHBOARD_VIEWED:       'Wallet_Dashboard_Viewed',
  TRANSACTION_VIEWED:     'Transaction_Viewed',
  BENEFIT_CLAIMED:        'Wallet_Benefit_Claimed',
  STATEMENT_DOWNLOADED:   'Statement_Downloaded',
  REPORT_EXPORTED:        'Report_Exported',
} as const;

export type EventChannel = 'MARKETING' | 'PRODUCT' | 'WALLET';
