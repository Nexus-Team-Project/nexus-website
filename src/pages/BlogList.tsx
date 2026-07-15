import { LanguageProvider } from '../i18n/LanguageProvider';
import BlogListContent from './BlogListContent';

export default function BlogList() {
  return (
    <LanguageProvider language="en">
      <BlogListContent />
    </LanguageProvider>
  );
}
