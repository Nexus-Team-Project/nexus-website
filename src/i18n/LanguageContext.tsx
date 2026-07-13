// Language context + useLanguage hook. The provider component lives in
// LanguageProvider.tsx so this file only exports non-component values
// (react-refresh only-export-components).
import { createContext, useContext } from 'react';
import type { Language, TranslationKeys } from './translations';

interface LanguageContextType {
  language: Language;
  t: TranslationKeys;
  direction: 'ltr' | 'rtl';
}

/** Shared context consumed by useLanguage and populated by LanguageProvider. */
export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

/** Returns { language, t, direction }; throws outside a LanguageProvider. */
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
