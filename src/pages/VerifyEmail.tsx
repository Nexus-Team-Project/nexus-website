import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { CheckCircle, XCircle, Loader } from 'lucide-react';

type State = 'loading' | 'success' | 'already' | 'error';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      setMessage('Verification link is missing a token.');
      return;
    }

    api.get<{ message: string }>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(({ message: msg }) => {
        if (msg === 'Email already verified') {
          setState('already');
        } else {
          setState('success');
        }
        setMessage(msg);
      })
      .catch((err: any) => {
        setState('error');
        setMessage(err?.error ?? 'Verification failed. The link may have expired.');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const config = {
    loading: {
      icon: <Loader size={48} className="text-purple-400 animate-spin" />,
      title: 'Verifying your email…',
      body: 'Please wait a moment.',
      color: 'text-white/60',
    },
    success: {
      icon: <CheckCircle size={48} className="text-green-400" />,
      title: 'Email verified!',
      body: 'Your email address has been confirmed. You can now use all features.',
      color: 'text-green-400',
    },
    already: {
      icon: <CheckCircle size={48} className="text-blue-400" />,
      title: 'Already verified',
      body: 'This email address is already confirmed.',
      color: 'text-blue-400',
    },
    error: {
      icon: <XCircle size={48} className="text-red-400" />,
      title: 'Verification failed',
      body: message,
      color: 'text-red-400',
    },
  }[state];

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-10 max-w-md w-full text-center space-y-4">
        {config.icon}
        <h1 className={`text-2xl font-bold text-white`}>{config.title}</h1>
        <p className="text-white/50 text-sm">{config.body}</p>
        {state !== 'loading' && (
          <Link
            to="/dashboard"
            className="inline-block mt-4 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
          >
            Go to dashboard
          </Link>
        )}
      </div>
    </div>
  );
}
