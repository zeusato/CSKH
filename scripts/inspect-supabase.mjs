const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase server configuration');
try {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const schema = await fetch(`${url}/rest/v1/`, { headers });
  const data = await schema.json();
  console.log(JSON.stringify({ resource: 'database', status: schema.status, tables: Object.keys(data.definitions ?? {}) }));
  const users = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, { headers });
  const result = await users.json();
  console.log(JSON.stringify({ resource: 'auth', status: users.status, userCount: result.total ?? result.users?.length ?? null }));
  console.log(JSON.stringify({ sqlConnectionConfigured: Boolean(process.env.DATABASE_URL), managementTokenConfigured: Boolean(process.env.SUPABASE_ACCESS_TOKEN) }));
} catch (error) {
  console.error('Connection check failed:', error.cause?.code ?? error.name);
  process.exitCode = 1;
}
