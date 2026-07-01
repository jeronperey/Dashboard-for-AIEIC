import { useEffect, useState } from 'react';
import {
  captureCallbackToken,
  clearToken,
  fetchMe,
  type MeResponse,
} from './auth';

export function useSession() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    const result = captureCallbackToken();
    if (result.error) setSignInError(result.error);
    fetchMe().then(me => {
      setUser(me);
      setAuthChecked(true);
    });
  }, []);

  return {
    user,
    authChecked,
    signInError,
    dismissError: () => setSignInError(null),
    refresh: () => fetchMe().then(setUser),
    signOut: () => {
      clearToken();
      setUser(null);
    },
  };
}
