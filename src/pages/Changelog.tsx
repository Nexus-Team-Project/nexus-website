import { LanguageProvider } from '../i18n/LanguageProvider';
import ChangelogContent from './ChangelogContent';

export default function Changelog() {
  return (
    <LanguageProvider language="en">
      <ChangelogContent />
    </LanguageProvider>
  );
}
