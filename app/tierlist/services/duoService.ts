export const duoService = {
  async createDuo(player1: string, player2: string, countryCode1: string, countryCode2: string) {
    try {
      const response = await fetch('/api/duos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duos: [[player1, player2]] }),
      });
      const result = await response.json();
      return result?.success ? { player1: { name: player1, countryCode: countryCode1 }, player2: { name: player2, countryCode: countryCode2 }, region: '', id: `${player1}:${player2}` } : null;
    } catch {
      return null;
    }
  },

  async deleteDuo(player1: string, player2: string, region: string) {
    try {
      const response = await fetch('/api/duos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: [player1, player2], type: 'duo' }),
      });
      const result = await response.json();
      return result?.success === true;
    } catch {
      return false;
    }
  },
};
