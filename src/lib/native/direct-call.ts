// In the Raksha Android app the page runs inside a Capacitor WebView that exposes a DirectCall plugin,
// which places the call immediately instead of opening the dialer. In a normal browser this returns
// false and the caller lets the tel: link behave as usual.

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { DirectCall?: { call: (opts: { number: string }) => Promise<{ direct: boolean }> } };
}

/** Returns true when the native app took over the call (the caller should preventDefault). */
export function tryDirectCall(number: string): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const plugin = cap?.isNativePlatform?.() ? cap.Plugins?.DirectCall : undefined;
  if (!plugin) return false;
  const clean = number.replace(/[^\d+]/g, "");
  void plugin.call({ number: clean }).catch(() => {
    window.location.href = `tel:${clean}`; // plugin failed: fall back to the dialer
  });
  return true;
}
