export const dataProvider = {
  async fetchPlayers() {
    const response = await fetch('/api/players', { cache: 'no-store' });
    if (!response.ok) return null;
    return response.json();
  },

  async fetchDuos() {
    const response = await fetch('/api/duos', { cache: 'no-store' });
    if (!response.ok) return null;
    return response.json();
  },
};
