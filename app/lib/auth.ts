export type AuthProvider = "twitch" | "discord";

export interface AuthorizedUser {
  id: string;
  name: string;
  provider: AuthProvider;
  identifier: string;
}

export interface SessionData {
  user: AuthorizedUser;
  provider: AuthProvider;
  identifier: string;
  createdAt: number;
}

const APPROVED_USERS_KEY = "streamer-dashboard-approved-users";
const SESSION_KEY = "streamer-dashboard-session";

export function getApprovedUsers(): AuthorizedUser[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(APPROVED_USERS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveApprovedUsers(users: AuthorizedUser[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APPROVED_USERS_KEY, JSON.stringify(users));
}

export function getStoredSession(): SessionData | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as SessionData;
  } catch {
    return null;
  }
}

export function saveSession(user: AuthorizedUser) {
  if (typeof window === "undefined") return;

  const session: SessionData = {
    user,
    provider: user.provider,
    identifier: user.identifier,
    createdAt: Date.now(),
  };

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

export function isApprovedUser(users: AuthorizedUser[], provider: AuthProvider, identifier: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  return users.some(
    (user) =>
      user.provider === provider &&
      user.identifier.trim().toLowerCase() === normalizedIdentifier
  );
}
