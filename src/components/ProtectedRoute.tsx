import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Roles allowed to access this route. Empty = any authenticated user. */
  roles?: Array<'USER' | 'ADMIN' | 'AGENT'>;
  /** Where to redirect unauthenticated users (default: /login) */
  redirectTo?: string;
}

export default function ProtectedRoute({ children, roles, redirectTo = '/login' }: Props) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null; // AuthProvider is still restoring the session

  if (!user) return <Navigate to={redirectTo} replace />;

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
