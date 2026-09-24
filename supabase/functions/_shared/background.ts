// Runs work after the response is sent when the Edge Runtime supports it.
type EdgeRuntimeGlobal = { EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void } };

export function inBackground(task: Promise<unknown>): void {
  const safe = task.catch((err) => console.error('background task failed', String(err)));
  (globalThis as EdgeRuntimeGlobal).EdgeRuntime?.waitUntil(safe);
}
