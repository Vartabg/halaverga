import { runtime } from './runtime';
import { useGame } from './store';
type Sample = { deltaX?: number; deltaY?: number; deltaMode?: number; momentum?: boolean };
type Row = Sample & { event: string; ms: number; throttle: number; speed: number; flying: boolean; steering: string };
const LIMIT = 6000;
export const gestureLog = { enabled: false, rows: [] as Row[], count: 0, start: 0 };
export function startGestureLog() { gestureLog.rows = []; gestureLog.count = 0; gestureLog.start = performance.now(); gestureLog.enabled = true; }
export function recordGesture(event: string, sample: Sample = {}) {
  if (!gestureLog.enabled) return;
  const { deltaX, deltaY, deltaMode, momentum } = sample;
  gestureLog.rows[gestureLog.count++ % LIMIT] = { event, ms: Math.round(performance.now() - gestureLog.start), deltaX, deltaY, deltaMode, momentum,
    throttle: runtime.trackpad.throttle, speed: runtime.speed, flying: runtime.trackpad.active, steering: useGame.getState().trackpadSteering };
}
export function gestureRecording() {
  const start = gestureLog.count > LIMIT ? gestureLog.count % LIMIT : 0;
  return { browser: navigator.userAgent, date: new Date().toISOString(), viewport: [innerWidth, innerHeight],
    momentumAvailable: 'momentum' in WheelEvent.prototype, settings: { steering: useGame.getState().trackpadSteering, reverseScroll: useGame.getState().reverseScroll, sustainedEdges: useGame.getState().sustainedEdges },
    scope: 'Latest 6,000 locally recorded input events. Synthetic events are not physical trackpad validation.',
    rows: [...gestureLog.rows.slice(start), ...gestureLog.rows.slice(0, start)] };
}
