const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const envFile = path.join(process.cwd(), '.vercel-temp.env');
const env = fs.readFileSync(envFile, 'utf-8').split(/\r?\n/).filter(Boolean).reduce((acc, line) => {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (!m) return acc;
  const key = m[1];
  let val = m[2];
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  acc[key] = val;
  return acc;
}, {});
const url = env.SUPABASE_URL || env.STORAGE_SUPABASE_URL || env.STORAGE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.STORAGE_SUPABASE_SERVICE_ROLE_KEY || env.STORAGE_SERVICE_ROLE_KEY;
console.log('url=', url);
console.log('key present=', !!key);
if (!url || !key) process.exit(1);
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
(async () => {
  for (const table of ['players','duos','tierlists']) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    console.log(table + ':', error ? JSON.stringify(error) : 'ok');
  }
})();
