import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import { startChatKeepalive, startBrowserChatKeepalive, wakeUrl } from '../src/lib/chat/keepalive.mjs';

function clock() {
  let time = 0;
  let id = 0;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
  return {
    now: () => time,
    setTimer: (fn: () => void, ms: number) => { const n = ++id; tasks.set(n, { at: time + ms, fn }); return n; },
    clearTimer: (key: unknown) => { tasks.delete(key as number); },
    async advance(ms: number) {
      const end = time + ms;
      await flush();
      while (true) {
        const next = [...tasks].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; tasks.delete(next[0]); next[1].fn(); await flush();
      }
      time = end; await flush();
    },
    get size() { return tasks.size; },
  };
}
const baseUrl = 'https://gateway.example.test/v1/chat';
const healthy = () => Response.json({ ok: true, cached: false });

describe('public client keepalive', () => {
  it('chỉ nhận base an toàn, không nhúng credentials/query hoặc gọi URL tùy ý', () => {
    assert.equal(wakeUrl(baseUrl + '/'), baseUrl + '/wake');
    assert.equal(wakeUrl('https://gateway.example.test'), baseUrl + '/wake');
    assert.equal(wakeUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080/v1/chat/wake');
    for (const value of ['', 'bad', 'http://remote.test', baseUrl + '?token=x', baseUrl + '#x', 'https://user:secret@gateway.test', baseUrl + '/sessions']) assert.equal(wakeUrl(value), null);
  });

  it('khởi động không chặn, ping trước login mỗi20giây và không gửi cookie/token', async () => {
    const t = clock();
    const starts: number[] = [];
    const control = startChatKeepalive({ baseUrl, ...t, fetch: async (url, init) => {
      starts.push(t.now());
      assert.equal(url, baseUrl + '/wake');
      assert.equal(init?.method, 'GET');
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.referrerPolicy, 'no-referrer');
      assert.equal(new Headers(init?.headers).get('authorization'), null);
      assert.equal(init?.body, undefined);
      return healthy();
    } });
    assert.equal(starts.length, 0, 'entry không đợi network');
    await t.advance(60_000);
    assert.deepEqual(starts, [0, 20_000, 40_000, 60_000]);
    control.stop();
    await t.advance(60_000);
    assert.equal(starts.length, 4);
    assert.equal(t.size, 0);
  });

  it('probe chậm không chồng, timeout hủy rồi giãn nhịp', async () => {
    const t = clock();
    let calls = 0;
    let aborted = false;
    const control = startChatKeepalive({ baseUrl, ...t, fetch: async (_url, init) => {
      calls++;
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
      });
    } });
    await t.advance(59_999);
    assert.equal(calls, 1);
    assert.equal(aborted, false);
    await t.advance(1);
    assert.equal(aborted, true);
    await t.advance(39_999);
    assert.equal(calls, 1);
    await t.advance(1);
    assert.equal(calls, 2);
    control.stop(); await t.advance(0);
    assert.equal(t.size, 0);
  });

  it('lỗi giãn40/80giây, 202 trở về20giây; resume không vượt backoff', async () => {
    const t = clock();
    const starts: number[] = [];
    const control = startChatKeepalive({ baseUrl, ...t, fetch: async () => {
      starts.push(t.now());
      if (starts.length <= 2) return Response.json({ ok: false }, { status: 503 });
      return Response.json({ ok: false, warming: true, retryAfterMs: 20_000 }, { status: 202 });
    } });
    await t.advance(1_000); control.resume();
    await t.advance(139_000);
    assert.deepEqual(starts, [0, 40_000, 120_000, 140_000]);
    control.stop();
  });

  it('web offline/pagehide dừng; pageshow/online phục hồi, hidden vẫn đủ điều kiện; cleanup không nhân timer', async () => {
    const t = clock();
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const nav = { onLine: true };
    let calls = 0;
    const stop = startBrowserChatKeepalive({ baseUrl, ...t,
      window: win as unknown as Window, document: doc as unknown as Document, navigator: nav as Navigator,
      fetch: async () => { calls++; return healthy(); },
    });
    await t.advance(0); assert.equal(calls, 1);
    nav.onLine = false; win.dispatchEvent(new Event('offline'));
    await t.advance(25_000); assert.equal(calls, 1);
    nav.onLine = true; win.dispatchEvent(new Event('online'));
    await t.advance(0); assert.equal(calls, 2);
    doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    await t.advance(20_000); assert.equal(calls, 3);
    win.dispatchEvent(new Event('pagehide'));
    await t.advance(25_000); assert.equal(calls, 3);
    win.dispatchEvent(new Event('pageshow')); await t.advance(0); assert.equal(calls, 4);
    stop(); win.dispatchEvent(new Event('online')); win.dispatchEvent(new Event('pageshow'));
    await t.advance(60_000); assert.equal(calls, 4); assert.equal(t.size, 0);
  });

  it('tắt hoặc URL rỗng không tạo timer/request', async () => {
    const t = clock();
    const options = { ...t, fetch: async () => { throw new Error('must not fetch'); } };
    startChatKeepalive({ ...options, baseUrl, enabled: false });
    startChatKeepalive({ ...options, baseUrl: '' });
    await t.advance(100_000);
    assert.equal(t.size, 0);
  });
});

import { startAppChatKeepalive } from '../src/lib/chat/start-keepalive';
it('app adapter starts before login and supports a public kill-switch', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => Response.json({ ok: true, cached: false }));
  vi.stubGlobal('fetch', fetcher);
  vi.stubEnv('VITE_CHAT_KEEPALIVE_ENABLED', 'true');
  vi.stubEnv('VITE_CHAT_GATEWAY_URL', 'https://gateway.example.test/v1/chat');
  const stop = startAppChatKeepalive();
  try {
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(fetcher.mock.calls.length, 1);
    stop();
    vi.stubEnv('VITE_CHAT_KEEPALIVE_ENABLED', 'false');
    const stopDisabled = startAppChatKeepalive();
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(fetcher.mock.calls.length, 1);
    stopDisabled();
  } finally { stop(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});
