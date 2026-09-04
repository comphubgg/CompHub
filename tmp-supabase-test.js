const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/).reduce((acc, line) => {
  if (!line || line.startsWith('#')) return acc;
  const idx = line.indexOf('=');
  if (idx === -1) return acc;
  const key = line.slice(0, idx);
  const val = line.slice(idx+1);
  acc[key] = val;
  return acc;
}, {});
const url = env.STORAGE_URL || env.SUPABASE_URL;
const key = env.STORAGE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
console.log('url=', url);
console.log('key=', key ? key.slice(0, 10) + '...' : 'MISSING');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
(async () => {
  try {
    const { data, error } = await client.from('tierlists').select('*').eq('key', 'shared').single();
    console.log('error=', error);
    console.log('data=', data);
  } catch (e) {
    console.error('throw=', e);
  }
})();
