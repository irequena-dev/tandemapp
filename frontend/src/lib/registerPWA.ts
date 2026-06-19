export async function registerPWA(): Promise<void> {
  if (!('serviceWorker' in navigator)) return

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch {
    // Registration may fail in dev or non-HTTPS; silently ignored.
  }
}
