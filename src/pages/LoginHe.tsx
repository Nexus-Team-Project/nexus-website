import { LanguageProvider } from '../i18n/LanguageContext';
import Login from './Login';

export default function LoginHe() {
  return (
    <LanguageProvider language="he">
      <Login />
    </LanguageProvider>
  );
}
