import { LanguageProvider } from '../i18n/LanguageProvider';
import ArticleContent from './ArticleContent';

export default function Article() {
  return (
    <LanguageProvider language="en">
      <ArticleContent />
    </LanguageProvider>
  );
}
