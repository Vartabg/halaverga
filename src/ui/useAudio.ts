import { useEffect } from 'react';
import { useGame } from '@/game/store';
import { runtime } from '@/game/runtime';
export function useAudio() {
  const started = useGame(s => s.started), paused = useGame(s => s.paused), muted = useGame(s => s.muted);
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
      gain.gain.setTargetAtTime(.015 + Math.min(runtime.speed / 300, .1), context.currentTime, .2);
      filter.frequency.setTargetAtTime(250 + runtime.speed * 32, context.currentTime, .2);
    }, 100);
    return () => { clearInterval(id); noise.stop(); void context.close(); };
  }, [started, paused, muted]);
}
