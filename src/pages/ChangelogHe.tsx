// Inject Rubik font early (same pattern as BlogListHe)
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'https://fonts.googleapis.com/css2?family=Rubik:wght@300..900&display=block';
document.head.appendChild(link);

import { LanguageProvider } from '../i18n/LanguageContext';
import ChangelogContent from './ChangelogContent';

export default function ChangelogHe() {
  return (
    <LanguageProvider language="he">
      <ChangelogContent />
    </LanguageProvider>
  );
}
