// LanguageProvider lives in its own file (separate from the useLanguage hook)
// so both files satisfy react-refresh's only-export-components rule.
import type { ReactNode } from 'react';
import { translations } from './translations';
import type { Language, TranslationKeys } from './translations';
import { LanguageContext } from './LanguageContext';

/**
 * Provides the language, translation table and text direction to the subtree,
 * and wraps children in a dir-aware container.
 */
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
