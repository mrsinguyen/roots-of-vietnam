import { registerSW } from 'virtual:pwa-register';

export type UpdateHandler = (reload: () => Promise<void>) => void;

let pendingHandler: UpdateHandler | null = null;
let pendingReload: (() => Promise<void>) | null = null;

export function onServiceWorkerUpdate(handler: UpdateHandler): () => void {
  pendingHandler = handler;
  if (pendingReload) handler(pendingReload);
  return () => {
    pendingHandler = null;
  };
}

export function setupServiceWorker(): void {
  if (typeof window === 'undefined') return;
  const reload = registerSW({
    immediate: true,
    onNeedRefresh() {
      pendingReload = async () => {
        await reload(true);
      };
      if (pendingHandler) pendingHandler(pendingReload);
    },
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        // Hourly background update probe.
        window.setInterval(() => {
          void registration.update();
        }, 60 * 60 * 1000);
      }
    },
  });
}
