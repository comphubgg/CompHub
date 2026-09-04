import { STORAGE_KEYS } from '../utils/constants';

export const storageService = {
  getTierLists(): Array<any> {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.TIER_LISTS);
      if (!raw) return [];
      return JSON.parse(raw) as Array<any>;
    } catch {
      return [];
    }
  },

  saveTierLists(lists: Array<any>) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.TIER_LISTS, JSON.stringify(lists));
    } catch {
      // ignore
    }
  },

  getCurrentListId(): string {
    if (typeof window === 'undefined') return 'static-tierlist';
    try {
      return window.localStorage.getItem(STORAGE_KEYS.CURRENT_LIST_ID) || 'static-tierlist';
    } catch {
      return 'static-tierlist';
    }
  },

  setCurrentListId(listId: string) {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.CURRENT_LIST_ID, listId);
    } catch {
      // ignore
    }
  },
};
