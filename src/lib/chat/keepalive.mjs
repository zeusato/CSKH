// Browser/Electron-safe public client. No session, storage, identity or internal warmup key.
export function wakeUrl(baseUrl) {
  try {
    const url = new URL(baseUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const path = url.pathname.replace(/\/+$/, '');
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
        url.username || url.password || url.search || url.hash || !['', '/v1/chat'].includes(path)) return null;
    url.pathname = '/v1/chat/wake';
    return url.href;
  } catch { return null; }
}

export function startChatKeepalive(options) {
  const url = wakeUrl(options.baseUrl);
  const fetcher = options.fetch ?? ((...args) => globalThis.fetch(...args));
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? (id => clearTimeout(id));
  const online = options.online ?? (() => true);
  let stopped = options.enabled === false || !url;
  let paused = false;
  let timer;
  let active = null;
  let nextAt = 0;
  let failures = 0;
  function schedule() {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    if (!stopped && !paused && !active && online()) timer = setTimer(() => { timer = undefined; void run(); }, Math.max(0, nextAt - now()));
  }
  async function run() {
    if (stopped || paused || active || !online()) return;
    if (now() < nextAt) { schedule(); return; }
    const controller = new AbortController();
    const request = { controller, interrupted: false };
    active = request;
    const started = now();
    nextAt = started + 20_000;
    const timeout = setTimer(() => controller.abort(), 60_000);
    try {
      const response = await fetcher(url, {
        method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
        referrerPolicy: 'no-referrer', signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      const body = await response.json();
      const healthy = response.status === 200 && body?.ok === true && typeof body.cached === 'boolean';
      const warming = response.status === 202 && body?.ok === false && body.warming === true &&
        Number.isInteger(body.retryAfterMs) && body.retryAfterMs > 0 && body.retryAfterMs <= 20_000;
      if (!healthy && !warming) throw new Error('wake unavailable');
      failures = 0;
    } catch {
      // Background best-effort only: no UI/log, and never retry chat/session/trading requests.
      if (!stopped && !paused && !request.interrupted) {
        failures = Math.min(failures + 1, 4);
        nextAt = now() + Math.min(300_000, 20_000 * 2 ** failures);
      }
    } finally {
      clearTimer(timeout);
      active = null;
      schedule();
    }
  }
  const control = {
    pause() {
      paused = true;
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
      if (active) { active.interrupted = true; active.controller.abort(); }
    },
    resume() { if (!stopped) { paused = false; schedule(); } },
    stop() { stopped = true; control.pause(); },
  };
  schedule(); // Defer the first fetch: opening/rendering the application never awaits it.
  return control;
}

export function startBrowserChatKeepalive(options) {
  const win = options.window ?? globalThis.window;
  const doc = options.document ?? globalThis.document;
  const nav = options.navigator ?? globalThis.navigator;
  const control = startChatKeepalive({ ...options, online: () => nav?.onLine !== false });
  let pageActive = true;
  function update() {
    if (pageActive && nav?.onLine !== false) control.resume(); else control.pause();
  }
  const hide = () => { pageActive = false; update(); };
  const show = () => { pageActive = true; update(); };
  const visible = () => { if (doc?.visibilityState === 'visible') update(); };
  win?.addEventListener('online', update);
  win?.addEventListener('offline', update);
  win?.addEventListener('pagehide', hide);
  win?.addEventListener('pageshow', show);
  doc?.addEventListener('visibilitychange', visible);
  // Hidden tabs remain eligible; the browser/OS may throttle or suspend their timers.
  return () => {
    control.stop();
    win?.removeEventListener('online', update);
    win?.removeEventListener('offline', update);
    win?.removeEventListener('pagehide', hide);
    win?.removeEventListener('pageshow', show);
    doc?.removeEventListener('visibilitychange', visible);
  };
}
