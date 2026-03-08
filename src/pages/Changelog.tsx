import { LanguageProvider } from '../i18n/LanguageContext';
import ChangelogContent from './ChangelogContent';

export default function Changelog() {
  return (
    <LanguageProvider language="en">
      <ChangelogContent />
    </LanguageProvider>
  );
}
