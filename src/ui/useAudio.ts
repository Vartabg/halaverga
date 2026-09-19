import { useEffect } from 'react';
import { useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
export function useAudio() {
  const started = useGame(s => s.started), paused = useGame(s => s.paused), muted = useGame(s => s.muted);
  const flow = useGame(s => s.desktopMode === 'trackpad' && s.trackpadSteering === 'flow');
  useEffect(() => {
    if (!started || paused || muted) return;
    const context = new AudioContext();
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = context.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 450;
    const gain = context.createGain(); gain.gain.value = 0;
    noise.connect(filter).connect(gain).connect(context.destination); noise.start();
    void context.resume().catch(() => {});
    const id = setInterval(() => {
      const u = Math.min(1, Math.max(0, runtime.speed / 34)), envelope = u * u * (3 - 2 * u);
      gain.gain.setTargetAtTime(flow ? .008 + envelope * .065 : .015 + Math.min(runtime.speed / 300, .1), context.currentTime, flow ? .3 : .2);
      filter.frequency.setTargetAtTime(250 + runtime.speed * (flow ? 22 : 32), context.currentTime, .2);
    }, 100);
    return () => {
      clearInterval(id); gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setTargetAtTime(0, context.currentTime, .012);
      // A suspended context cannot advance to the scheduled stop; still release it after the fade window.
      const close = setTimeout(() => { void context.close(); }, 120);
      noise.onended = () => { clearTimeout(close); void context.close(); }; noise.stop(context.currentTime + .06);
    };
  }, [started, paused, muted, flow]);
}
