'use client';

import { useState, useEffect } from 'react';
import { getStoredSession } from '../auth';

export interface AuthUser {
  id: string;
  name: string;
  provider: 'twitch' | 'discord';
}

interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  previewMode: boolean;
}

/**
 * useAuth: Hook to get current user from session
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadAuth = async () => {
      try {
        const session = getStoredSession();
        if (session) {
          if (mounted) {
            setUser({
              id: session.user.id,
              name: session.user.name,
              provider: session.user.provider,
            });
          }
          return;
        }

        const clearStaleAuth = () => {
          if (typeof window === 'undefined') return;
          try {
            window.localStorage.removeItem('streamer_dashboard_logged_in');
            window.localStorage.removeItem('streamer_dashboard_user_login');
            window.localStorage.removeItem('streamer_dashboard_user_avatar');
            document.cookie = 'streamer_dashboard_user_login=; path=/; max-age=0; samesite=Lax';
            document.cookie = 'streamer_dashboard_user_avatar=; path=/; max-age=0; samesite=Lax';
          } catch {
            // ignore
          }
        };

        try {
          const res = await fetch('/api/auth/verify', {
            cache: 'no-store',
            credentials: 'same-origin',
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.authorized && data?.user) {
              if (mounted) {
                setUser({ id: String(data.user), name: String(data.user), provider: 'discord' });
              }
              return;
            }
          }

          if (mounted) setUser(null);
          clearStaleAuth();
        } catch (e) {
          if (mounted) setUser(null);
          clearStaleAuth();
        }
      } catch (error) {
        console.error('Error loading auth:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadAuth();
    return () => { mounted = false; };
  }, []);

  return {
    user,
    loading,
    previewMode: false, // Disable preview mode - allow all users to access tier list
  };
}
