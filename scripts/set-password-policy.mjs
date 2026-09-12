// Only the minimum length is changed; preserve all other Auth settings.
// API: https://supabase.com/docs/reference/api/v1-update-auth-service-config
const ref = new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0];
const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
const update = await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify({ password_min_length: 8 }), signal: AbortSignal.timeout(30000) });
if (!update.ok) throw new Error(`Auth config update failed (${update.status})`);
const verify = await fetch(endpoint, { headers, signal: AbortSignal.timeout(30000) });
if (!verify.ok) throw new Error(`Auth config verification failed (${verify.status})`);
const config = await verify.json();
if (config.password_min_length !== 8) throw new Error('Auth minimum password length does not match 8');
console.log('Verified Supabase Auth password_min_length = 8. Other settings were not patched.');
