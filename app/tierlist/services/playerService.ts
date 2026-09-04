export const playerService = {
  async addPlayer(name: string, region: string, countryCode: string) {
    try {
      const response = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          region,
          countryCode,
          type: 'solo',
        }),
      });
      const result = await response.json();
      return result?.success ? { name, region, countryCode, twitterHandle: '', isGlobal: false } : null;
    } catch {
      return null;
    }
  },

  async deletePlayer(name: string, region: string) {
    try {
      const response = await fetch('/api/players', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, region, type: 'solo' }),
      });
      const result = await response.json();
      return result?.success === true;
    } catch {
      return false;
    }
  },
};
