import { LanguageProvider } from '../i18n/LanguageContext';
import ArticleContent from './ArticleContent';

export default function Article() {
  return (
    <LanguageProvider language="en">
      <ArticleContent />
    </LanguageProvider>
  );
}
