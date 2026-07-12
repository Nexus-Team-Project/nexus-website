import { LanguageProvider } from '../i18n/LanguageProvider';
import HomeContent from './HomeContent';

export default function Home() {
  return (
    <LanguageProvider language="en">
      <HomeContent />
    </LanguageProvider>
  );
}
