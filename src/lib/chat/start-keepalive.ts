import { startBrowserChatKeepalive } from './keepalive.mjs';

export function startAppChatKeepalive() {
  return startBrowserChatKeepalive({
    baseUrl: import.meta.env.VITE_CHAT_GATEWAY_URL ?? 'https://chat-server-poc.vercel.app/v1/chat',
    enabled: import.meta.env.VITE_CHAT_KEEPALIVE_ENABLED !== 'false',
  });
}
