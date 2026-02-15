import { LanguageProvider } from '../i18n/LanguageContext';
import HomeContent from './HomeContent';

export default function Home() {
  return (
    <LanguageProvider language="en">
      <HomeContent />
    </LanguageProvider>
  );
}
