'use client';
import { useState } from 'react';
import { persistGame, useGame } from '@/game/store';
import LabSwitch from './LabSwitch';
import { exportStats, flushLabStats, LAB_IDS, LAB_NAMES, labStats, resetLabStats, statsTable } from './labStats';
import { strokeLog } from './strokeLog';
import styles from './Lab.module.css';
// Flight settings' Gesture Lab section (spec 8, 11): the switch, the 'Shots slow me down' option, and the local side-by-side table
// with its exports. Everything stays on this device; the exports are files the player saves.
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LabStatsTable() {
  const [rows, setRows] = useState(() => { flushLabStats(); return statsTable(labStats()); });
  return <details data-testid="lab-stats">
    <summary>Control lab measurements</summary>
    <p>Played on this device only. Standard stays empty: it is the baseline you rate.</p>
    <div className={styles.tableWrap} role="region" aria-label="Control lab measurements table" tabIndex={0}>
      <table className={styles.table}>
        <thead><tr><th scope="col">Measure</th>{LAB_IDS.map(id => <th key={id} scope="col">{LAB_NAMES[id]}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r.label}><th scope="row">{r.label}</th>{r.values.map((v, i) => <td key={LAB_IDS[i]}>{v}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className={styles.fallback}>
      <button type="button" onClick={() => download('halaverga-lab-stats.json', exportStats(labStats()))}>Download measurements</button>
      <button type="button" onClick={() => download('halaverga-lab-strokes.json', strokeLog.exportJson())}>Download last 50 strokes</button>
      <button type="button" onClick={() => { resetLabStats(); strokeLog.clear(); setRows(statsTable(labStats())); }}>Clear lab measurements</button>
    </div>
  </details>;
}

export default function LabPanel() {
  const lab = useGame(s => s.controlLab), slow = useGame(s => s.labShotsSlow);
  return <section aria-label="Control lab">
    <LabSwitch name="control-lab-settings" />
    {lab !== 'standard' && <label className={styles.check}><input type="checkbox" checked={slow}
      onChange={e => { useGame.setState({ labShotsSlow: e.target.checked }); persistGame(); }} /> Shots slow me down</label>}
  </section>;
}
