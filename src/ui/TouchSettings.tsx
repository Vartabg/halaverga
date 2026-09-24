import { persistGame, useGame } from '@/game/store';
import styles from './Experience.module.css';
type Patch = Parameters<ReturnType<typeof useGame.getState>['set']>[0];
const save = (patch: Patch) => { useGame.setState(patch); persistGame(); };
// Touch controls (Flight settings, any coarse pointer, blaster on or off). Two thumbs is the default; One thumb (classic) is the
// opt-in main scheme. Every control is a labelled native input with a 44 px target, saved at once. Range inputs get an inline
// 44 px height because Experience.module.css styles only select and number inputs.
const RANGE = { width: '100%', minHeight: 44, accentColor: 'var(--lime)' } as const;
function Range({ label, value, min, max, step, shown, onChange }: {
  label: string; value: number; min: number; max: number; step: number; shown: string; onChange: (v: number) => void;
}) {
  return <label className={styles.setting}>{label} · {shown}
    <input type="range" min={min} max={max} step={step} value={value} style={RANGE}
      onChange={e => { const v = e.target.valueAsNumber; if (Number.isFinite(v)) onChange(v); }} />
  </label>;
}
function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: string }) {
  return <label className={styles.check}><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /> {children}</label>;
}
const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function TouchSettings() {
  const scheme = useGame(s => s.touchScheme), shooter = useGame(s => s.shooter);
  const touchLook = useGame(s => s.touchLook), touchAim = useGame(s => s.touchAim), lookAccel = useGame(s => s.lookAccel);
  const invertY = useGame(s => s.invertY), flipSides = useGame(s => s.flipSides), flyWhereILook = useGame(s => s.flyWhereILook);
  const controlSize = useGame(s => s.controlSize), controlOpacity = useGame(s => s.controlOpacity);
  const twin = scheme !== 'classic';
  return <fieldset data-testid="touch-settings"><legend>Touch controls</legend>
    <div className={styles.segment} role="group" aria-label="Touch scheme">
      <button aria-pressed={twin} onClick={() => save({ touchScheme: 'twin' })}>Two thumbs</button>
      <button aria-pressed={!twin} onClick={() => save({ touchScheme: 'classic' })}>One thumb (classic)</button>
    </div>
    {twin && <>
      <p className={styles.muted}>Left thumb moves, right thumb looks. Rise and Descend change height.</p>
      <Range label="Look sensitivity" value={touchLook} min={.5} max={2} step={.05} shown={`${touchLook.toFixed(2)}x`}
        onChange={v => save({ touchLook: v })} />
      {shooter && <Range label="Aim sensitivity" value={touchAim} min={.5} max={1.5} step={.05} shown={`${touchAim.toFixed(2)}x`}
        onChange={v => save({ touchAim: v })} />}
      <Check checked={lookAccel} onChange={v => save({ lookAccel: v })}>Look acceleration</Check>
      <Check checked={invertY} onChange={v => save({ invertY: v })}>Invert look up and down</Check>
      <Check checked={flipSides} onChange={v => save({ flipSides: v })}>Left-handed (swap sides)</Check>
      <Check checked={flyWhereILook} onChange={v => save({ flyWhereILook: v })}>Fly where I look (climb by aiming up)</Check>
      <Range label="Control size" value={controlSize} min={.85} max={1.2} step={.05} shown={pct(controlSize)}
        onChange={v => save({ controlSize: v })} />
      <Range label="Control opacity" value={controlOpacity} min={.4} max={1} step={.05} shown={pct(controlOpacity)}
        onChange={v => save({ controlOpacity: v })} />
    </>}
  </fieldset>;
}
