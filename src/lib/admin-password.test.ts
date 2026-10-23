import { bundleFunctionSync } from '../../scripts/function-bundle.mjs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

// Exercise the deployed handler's validation with a fake Auth service, without
// creating users or changing any real account's password.
function handler() {
 let serve!: (request: Request) => Promise<Response>;
 const createUser = vi.fn(async () => ({ data: { user: { id: 'new-user' } }, error: null }));
 const updateUserById = vi.fn(async () => ({ error: null }));
 const query: Record<string, unknown> = {};
 query.select = () => query; query.eq = () => query;
 query.single = async () => ({ data: { role: 'admin', active: true } });
 query.maybeSingle = async () => ({ data: { id: 'target' } });
 query.insert = async () => ({ error: null });
 const service = { from: () => query, auth: { getUser: async () => ({ data: { user: { id: 'caller' } } }), admin: { createUser, updateUserById } } };
 const source = bundleFunctionSync('admin-users').replace(/^import .*;\r?\n/, '');
 const code = stripTypeScriptTypes(source);
 vm.runInNewContext(code, { createClient: () => service, Deno: { env: { get: () => 'test-only' }, serve: (fn: typeof serve) => { serve = fn; } }, Response, Request });
 return { request: (action: string, password: string) => serve(new Request('https://local.test', { method: 'POST', headers: { Authorization: 'Bearer test-only', 'Content-Type': 'application/json' }, body: JSON.stringify({ action, password, id: '00000000-0000-0000-0000-000000000001', name: 'Test', email: 'test@example.test', role: 'user' }) })), createUser, updateUserById };
}
describe('Admin password boundary', () => {
 for (const action of ['create', 'reset-password']) {
  it(`${action}: rejects 7 and accepts 8 characters`, async () => {
   const api = handler();
   expect((await api.request(action, 'Abc123!')).status).toBe(400);
   expect(api.createUser).not.toHaveBeenCalled(); expect(api.updateUserById).not.toHaveBeenCalled();
   expect((await api.request(action, 'Abcd123!')).status).toBe(200);
   expect(action === 'create' ? api.createUser : api.updateUserById).toHaveBeenCalledOnce();
  });
 }
});
