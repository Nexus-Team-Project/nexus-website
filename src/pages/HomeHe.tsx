import { LanguageProvider } from '../i18n/LanguageContext';
import HomeContent from './HomeContent';

export default function HomeHe() {
  return (
    <LanguageProvider language="he">
      <HomeContent />
    </LanguageProvider>
  );
}
