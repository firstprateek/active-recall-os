/**
 * <arc-progress-ring> — SVG progress ring using the stroke-dasharray/offset
 * technique. Design-system layer: pure rendering, token-driven styling,
 * no events. No React/Zustand/Dexie.
 */

import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

/* Fixed 100×100 viewBox; the `size` prop scales the whole drawing. */
const STROKE_WIDTH = 8;
const RADIUS = (100 - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

@customElement('arc-progress-ring')
export class ArcProgressRing extends LitElement {
  /** Current progress; clamped to [0, max] before rendering. */
  @property({ type: Number }) value = 0;

  /** Upper bound. max <= 0 renders an empty ring (0%) — never NaN. */
  @property({ type: Number }) max = 100;

  /** Rendered width/height in px. */
  @property({ type: Number }) size = 96;

  /** Optional custom center text; defaults to the clamped value. */
  @property({ type: String }) label?: string;

  static styles = css`
    :host {
      display: inline-flex;
    }

    svg {
      display: block;
    }

    .track {
      fill: none;
      stroke: var(--arc-color-surface-tertiary);
    }

    .progress {
      fill: none;
      stroke: var(--arc-color-accent);
      stroke-linecap: round;
      /* Start at 12 o'clock. */
      transform: rotate(-90deg);
      transform-origin: 50% 50%;
      transition:
        stroke-dashoffset var(--arc-duration-slow) var(--arc-ease),
        opacity var(--arc-duration-fast) var(--arc-ease);
    }

    /* At 0% a round linecap would still paint a dot — hide the arc instead. */
    .progress.empty {
      opacity: 0;
    }

    text {
      fill: var(--arc-color-text-primary);
      font-family: var(--arc-font-sans);
      font-weight: 600;
    }

    text.numeric {
      font-size: 26px;
    }

    text.custom {
      font-size: 14px;
    }
  `;

  render() {
    const max = this.max > 0 ? this.max : 0;
    const clamped = Math.min(Math.max(0, this.value), max);
    const fraction = max > 0 ? clamped / max : 0;
    const dashOffset = CIRCUMFERENCE * (1 - fraction);
    const hasCustomLabel = this.label !== undefined && this.label !== '';
    const text = hasCustomLabel ? this.label : String(Math.round(clamped));

    return html`
      <svg
        width=${this.size}
        height=${this.size}
        viewBox="0 0 100 100"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax=${max}
        aria-valuenow=${clamped}
        aria-label=${hasCustomLabel ? `${this.label}` : 'Progress'}
      >
        <circle class="track" cx="50" cy="50" r=${RADIUS} stroke-width=${STROKE_WIDTH}></circle>
        <circle
          part="ring"
          class=${classMap({ progress: true, empty: fraction === 0 })}
          cx="50"
          cy="50"
          r=${RADIUS}
          stroke-width=${STROKE_WIDTH}
          stroke-dasharray=${CIRCUMFERENCE}
          stroke-dashoffset=${dashOffset}
        ></circle>
        <text
          part="label"
          class=${classMap({ numeric: !hasCustomLabel, custom: hasCustomLabel })}
          x="50"
          y="50"
          dy="0.35em"
          text-anchor="middle"
        >
          ${text}
        </text>
      </svg>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'arc-progress-ring': ArcProgressRing;
  }
}
