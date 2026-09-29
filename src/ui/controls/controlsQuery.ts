// Lazy-only: ?controls= is applied from a chunk the landing page imports on demand (Experience awaits it before Begin is enabled).
import { parseControlParam } from '@/game/controlTypes';
import { overrideControlFields } from '@/game/store';

/** ?controls=<id>|standard: this session only, through the per-field pin (the saved choices stay). Unknown values are ignored. */
export function applyControlsQuery(raw: string) {
  const patch = parseControlParam(raw);
  if (patch) overrideControlFields(patch);
}
