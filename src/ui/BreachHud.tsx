import { useEffect, useState } from 'react';
import { breachRoute, ROUTE_COPY } from '@/game/breachRoutes';
import { runtime } from '@/game/runtime';
import styles from './BreachHud.module.css';
export default function BreachHud() {
  const [route, set] = useState(() => breachRoute(runtime.position));
  useEffect(() => { const timer = setInterval(() => set(breachRoute(runtime.position)), 180); return () => clearInterval(timer); }, []);
  return <div className={styles.route} data-testid="breach-route" data-route={route}>
    <span>{ROUTE_COPY[route][0]}</span><small>{ROUTE_COPY[route][1]}</small>
  </div>;
}
