import { LanguageProvider } from '../i18n/LanguageProvider';
import Login from './Login';

export default function LoginHe() {
  return (
    <LanguageProvider language="he">
      <Login />
    </LanguageProvider>
  );
}
