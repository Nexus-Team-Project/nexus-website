import { LanguageProvider } from '../i18n/LanguageContext';
import HomeContent from './HomeContent';

// Inject Rubik at module-import time (before first render) so the font has maximum
// time to load before the user can interact. display=block eliminates the FOUT swap
// that caused the navbar to jump sideways in RTL on first hover: with display=block
// the browser holds text invisible until Rubik is ready (imperceptible on Google CDN,
// typically < 200ms), then renders directly in Rubik — no Inter→Rubik layout shift.
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

export default function HomeHe() {
  return (
    <LanguageProvider language="he">
      <HomeContent />
    </LanguageProvider>
  );
}
