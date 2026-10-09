// The first-visit demo note: dismissed once, remembered in localStorage. With storage blocked the dismissal holds for this page load.
export const DEMO_KEY = 'halaverga.controls.demo.v1';
let seen = false;

export function demoSeen(): boolean {
  if (seen) return true;
  try { return localStorage.getItem(DEMO_KEY) === '1'; } catch { return false; }
}
export function markDemoSeen() {
  seen = true;
  try { localStorage.setItem(DEMO_KEY, '1'); } catch { /* storage blocked: hidden for this page load only */ }
}
