import { useEffect, useRef } from 'react';
import styles from './Experience.module.css';
export default function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current; dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={styles.modal} aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className={styles.modalTop}><h2 id="dialog-title">{title}</h2><button onClick={onClose} aria-label="Close dialog">×</button></div>
    {children}
  </dialog>;
}
