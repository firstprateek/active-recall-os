/**
 * Modal — shared dialog shell for the editor modals.
 *
 * Portals to document.body, traps focus, closes on Escape or overlay click,
 * and locks body scroll while open. Renders as a centered panel on desktop
 * and a bottom sheet on small screens (CSS-driven, see Modal.module.css).
 *
 * The element that should receive initial focus opts in with `data-autofocus`;
 * otherwise the first focusable element inside the panel is focused.
 */

import { useEffect, useId, useRef } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface ModalProps {
  title: string;
  onClose(): void;
  children: ReactNode;
  /** 'sm' fits confirmation dialogs; 'md' (default) fits editor forms. */
  size?: 'sm' | 'md';
}

export function Modal({ title, onClose, children, size = 'md' }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Overlay clicks only close when the press also STARTED on the overlay —
  // otherwise a text-selection drag out of a textarea would dismiss the form.
  const pressStartedOnOverlay = useRef(false);

  // Initial focus into the panel; restore focus to the opener on close.
  useEffect(() => {
    const opener = document.activeElement;
    const panel = panelRef.current;
    if (panel !== null) {
      const target =
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
        panel;
      target.focus();
    }
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const panel = panelRef.current;
    if (panel === null) return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first === undefined || last === undefined) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !panel.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !panel.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleOverlayMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    pressStartedOnOverlay.current = event.target === event.currentTarget;
  };

  const handleOverlayClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && pressStartedOnOverlay.current) {
      onClose();
    }
  };

  return createPortal(
    <div
      className={styles['overlay']}
      onKeyDown={handleKeyDown}
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        className={`${styles['panel']} ${size === 'sm' ? styles['panelSm'] : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className={styles['header']}>
          <h2 id={titleId} className={styles['title']}>
            {title}
          </h2>
          <button
            type="button"
            className={styles['close']}
            onClick={onClose}
            aria-label="Close dialog"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3 3 L13 13 M13 3 L3 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        <div className={styles['body']}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
