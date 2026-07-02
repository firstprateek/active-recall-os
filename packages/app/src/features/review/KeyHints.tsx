/**
 * KeyHints — kbd chips for the review shortcuts. Purely decorative
 * (the shortcuts are announced via aria-keyshortcuts on the actual
 * controls), so the row is aria-hidden and disappears on touch-only
 * devices where a keyboard is unlikely.
 */

import styles from './KeyHints.module.css';

const RATING_HINTS = [
  { key: '1', label: 'Again' },
  { key: '2', label: 'Hard' },
  { key: '3', label: 'Good' },
  { key: '4', label: 'Easy' },
] as const;

export function KeyHints({ revealed }: { revealed: boolean }) {
  return (
    <div className={styles['hints']} aria-hidden="true">
      {revealed ? (
        RATING_HINTS.map((hint) => (
          <span key={hint.key} className={styles['hint']}>
            <kbd className={styles['key']}>{hint.key}</kbd> {hint.label}
          </span>
        ))
      ) : (
        <span className={styles['hint']}>
          <kbd className={styles['key']}>Space</kbd> Reveal answer
        </span>
      )}
    </div>
  );
}
