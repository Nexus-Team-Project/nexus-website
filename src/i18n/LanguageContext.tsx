import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { translations } from './translations';
import type { Language, TranslationKeys } from './translations';

interface LanguageContextType {
  language: Language;
  t: TranslationKeys;
  direction: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({
  children,
  language
}: {
  children: ReactNode;
  language: Language;
}) {
  const t = translations[language] as TranslationKeys;
  const direction = t.direction as 'ltr' | 'rtl';

  return (
    <LanguageContext.Provider value={{ language, t, direction }}>
      <div dir={direction} className={direction === 'rtl' ? 'rtl' : 'ltr'}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
