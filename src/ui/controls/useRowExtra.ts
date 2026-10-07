'use client';
import { useEffect } from 'react';

/**
 * The row is one 44 px line, with one exception: large text on a phone with the Vote pill in it, where the pill wraps under Controls
 * (ControlsPicker.module.css) and the header is 96 px tall. Whatever is laid out under the row (the hint, a card, the sheet) follows `--hdr`
 * (Experience.module.css), which adds `--row-extra`. This keeps `--row-extra` equal to the header's height beyond the row while the play row
 * shows (and 0 otherwise), on the element that defines `--hdr`, so nothing lands on the wrapped pill.
 */
export function useRowExtra() {
  useEffect(() => {
    const header = document.querySelector('main > header'), box = header?.parentElement;
    if (!header || !box || typeof ResizeObserver === 'undefined') return;
    const set = () => {
      const row = parseFloat(getComputedStyle(box).getPropertyValue('--row')) || 44;
      const extra = header.hasAttribute('data-play') ? Math.max(0, Math.round(header.getBoundingClientRect().height - row)) : 0;
      box.style.setProperty('--row-extra', `${extra}px`);
    };
    const watch = new ResizeObserver(set);
    watch.observe(header); set();
    return () => { watch.disconnect(); box.style.removeProperty('--row-extra'); };
  }, []);
}
