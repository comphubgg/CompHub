export function getDashboardAccountName(): string {
  if (typeof window === 'undefined') return 'guest';

  const fromStorage = window.localStorage.getItem('streamer_dashboard_user_login')?.trim();
  if (fromStorage) return fromStorage.toLowerCase();

  const cookieValue = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('streamer_dashboard_user_login='));

  if (cookieValue) {
    const decoded = decodeURIComponent(cookieValue.split('=').slice(1).join('='));
    if (decoded.trim()) return decoded.trim().toLowerCase();
  }

  return 'guest';
}

export function getUserStorageKey(prefix: string): string {
  return `multihub:${getDashboardAccountName()}:${prefix}`;
}

export function loadUserStorageValue<T>(prefix: string): T | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(getUserStorageKey(prefix));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveUserStorageValue(prefix: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getUserStorageKey(prefix), JSON.stringify(value));
  } catch {
    // ignore write errors
  }
}

export async function loadUserStorageCloud<T>(prefix: string): Promise<T | null> {
  try {
    const response = await fetch(`/api/user-storage?key=${encodeURIComponent(prefix)}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.value ?? null;
  } catch {
    return null;
  }
}

export async function loadAllUserStorageCloud(): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch('/api/user-storage');
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data ?? null;
  } catch {
    return null;
  }
}

export async function saveUserStorageCloud(prefix: string, value: unknown): Promise<void> {
  try {
    await fetch('/api/user-storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: prefix, value }),
    });
  } catch {
    // ignore sync failures; local state is still persisted
  }
}
