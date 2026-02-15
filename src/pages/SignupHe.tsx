import { LanguageProvider } from '../i18n/LanguageContext';
import Signup from './Signup';

export default function SignupHe() {
  return (
    <LanguageProvider language="he">
      <Signup />
    </LanguageProvider>
  );
}
