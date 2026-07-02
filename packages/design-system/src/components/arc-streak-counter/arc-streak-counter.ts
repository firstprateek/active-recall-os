/**
 * <arc-streak-counter> — flame glyph + day-streak count. Display only,
 * no events. `active` lights the flame (amber, subtle pulse); inactive is
 * grayed out. Pulse is disabled under prefers-reduced-motion.
 * No React, no Zustand, no Dexie — design-system layer.
 */

import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('arc-streak-counter')
export class ArcStreakCounter extends LitElement {
  /** Consecutive days with at least one review. */
  @property({ type: Number }) count = 0;

  /** True when the streak is alive (reviewed today or still salvageable). */
  @property({ type: Boolean }) active = false;

  static styles = css`
    :host {
      display: inline-flex;
    }

    .streak {
      display: inline-flex;
      align-items: center;
      gap: var(--arc-space-2);
      font-family: var(--arc-font-sans);
      color: var(--arc-color-text-primary);
    }

    .flame {
      flex: none;
      width: 24px;
      height: 24px;
      color: var(--arc-color-text-secondary);
    }

    .streak.active .flame {
      color: var(--arc-color-due);
      transform-origin: 50% 85%;
      animation: flame-pulse 1.8s var(--arc-ease) infinite;
    }

    .count {
      font-size: var(--arc-text-xl);
      font-weight: 700;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .label {
      font-size: var(--arc-text-sm);
      color: var(--arc-color-text-secondary);
    }

    .streak.inactive .count {
      color: var(--arc-color-text-secondary);
    }

    @keyframes flame-pulse {
      0%,
      100% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.1);
        opacity: 0.85;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .streak.active .flame {
        animation: none;
      }
    }
  `;

  render() {
    const streakText = `${this.count} day streak${this.active ? '' : ' (inactive)'}`;
    return html`
      <div class="streak ${this.active ? 'active' : 'inactive'}" role="status" aria-label=${streakText}>
        <svg class="flame" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"
          />
        </svg>
        <span class="count">${this.count}</span>
        <span class="label">day streak</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'arc-streak-counter': ArcStreakCounter;
  }
}
