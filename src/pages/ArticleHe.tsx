import { LanguageProvider } from '../i18n/LanguageContext';
import ArticleContent from './ArticleContent';

// Inject Rubik at module-import time (before first render) so the font has maximum
// time to load before the user can interact. display=block eliminates the FOUT swap.
if (typeof document !== 'undefined') {
  const linkId = 'rubik-font';
  if (!document.getElementById(linkId)) {
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=block';
    document.head.appendChild(link);
  }
}

export default function ArticleHe() {
  return (
    <LanguageProvider language="he">
      <ArticleContent />
    </LanguageProvider>
  );
}
