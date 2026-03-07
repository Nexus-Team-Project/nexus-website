import { LanguageProvider } from '../i18n/LanguageContext';
import BlogListContent from './BlogListContent';

export default function BlogList() {
  return (
    <LanguageProvider language="en">
      <BlogListContent />
    </LanguageProvider>
  );
}
