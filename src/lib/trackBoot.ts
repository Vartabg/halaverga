// The inline script that starts anonymous counts on the game page (AnalyticsBoot.tsx). Plain ES5 text, so it costs no first-load
// JavaScript: it skips everything when the browser sends Do Not Track or Global Privacy Control (the same test as track.ts), sets up
// Vercel's event queue (the snippet Vercel documents for plain HTML) and adds the vendor script, which Vercel serves only for a project
// that has Web Analytics enabled. If that script fails to load (not enabled, blocked) the queue is dropped, so track() becomes a no-op.
export const SCRIPT_SRC = '/_vercel/insights/script.js';
export const TRACK_BOOT =
  '(function(w,n,d){try{' +
  'var o=function(v){return v==="1"||v==="yes"};' +
  'if(o(n.doNotTrack)||o(w.doNotTrack)||o(n.msDoNotTrack)||n.globalPrivacyControl===true)return;' +
  'w.va=w.va||function(){(w.vaq=w.vaq||[]).push(arguments)};' +
  `var s=d.createElement("script");s.src="${SCRIPT_SRC}";s.defer=true;` +
  's.onerror=function(){w.va=void 0;w.vaq=void 0};' +
  'd.head.appendChild(s)}catch(e){}})(window,navigator,document)';
