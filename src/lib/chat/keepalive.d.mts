export type KeepaliveControl = { pause(): void; resume(): void; stop(): void };
export type KeepaliveOptions = {
  baseUrl: string;
  enabled?: boolean;
  fetch?: typeof fetch;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  online?: () => boolean;
};
export function wakeUrl(baseUrl: string): string | null;
export function startChatKeepalive(options: KeepaliveOptions): KeepaliveControl;
export function startBrowserChatKeepalive(options: KeepaliveOptions & {
  window?: Window; document?: Document; navigator?: Navigator;
}): () => void;
