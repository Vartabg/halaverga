// The results and privacy styles as one string (CODE-6): /results is a route handler now, so it has no root layout and no CSS module.
// Class names carry a vr- prefix because the string is global on /privacy. Colours are the globals.css tokens (BASE_CSS repeats them for /results).
export const BASE_CSS = ':root{color-scheme:dark;--ink:#eceae4;--muted:#b4b9ba;--accent:#5ee6d0;--panel:#1c2023;--line:#434b50;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#1c2023;color:var(--ink)}*{box-sizing:border-box}body{margin:0}a{color:var(--accent)}a:focus-visible{outline:3px solid var(--accent);outline-offset:5px}p{line-height:1.65}html{-webkit-text-size-adjust:100%;text-size-adjust:100%}@media(forced-colors:active){a{color:LinkText!important}}';

export const RESULTS_CSS = `
/* Vote results. Colours come from globals.css tokens on the #1c2023 page: --ink 13.8:1, --muted 8.4:1, --accent bars 10.9:1. */
.vr-page {
  max-width: 760px;
  margin: 0 auto;
  padding: max(24px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(40px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  color: var(--ink);
  background: var(--panel);
  min-height: 100vh;
}
.vr-title { font-size: 1.6rem; margin: 0 0 8px; }
.vr-lead { font-size: 1.1rem; margin: 0 0 24px; color: var(--muted); }
.vr-head { font-size: 1.2rem; margin: 0 0 8px; }
.vr-table { width: 100%; border-collapse: collapse; margin: 0 0 28px; font-variant-numeric: tabular-nums; }
.vr-table caption { text-align: left; padding: 0 0 8px; }
.vr-table th, .vr-table td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.vr-table thead th { color: var(--muted); font-weight: 400; font-size: .9rem; }
.vr-table tbody th { font-weight: 700; overflow-wrap: anywhere; }
.vr-share { display: flex; align-items: center; gap: 10px; }
.vr-track { flex: 1; min-width: 60px; height: 10px; border-radius: 5px; background: #0e1012; border: 1px solid var(--line); overflow: hidden; }
.vr-bar { display: block; height: 100%; background: var(--accent); }
.vr-muted { color: var(--muted); }
.vr-fine { color: var(--muted); }
@media (forced-colors: active) {
  .vr-bar { background: Highlight; forced-color-adjust: none; }
  .vr-track { border-color: CanvasText; }
}
@media (max-width: 480px) {
  .vr-table th, .vr-table td { padding: 8px 4px; font-size: .92rem; }
}
`;
