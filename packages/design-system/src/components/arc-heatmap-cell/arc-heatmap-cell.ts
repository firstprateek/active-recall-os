/**
 * <arc-heatmap-cell> — one day square in the retention heatmap.
 * Pure rendering: inputs via properties, output via 'arc-cell-hover'.
 * No React, no Zustand, no Dexie — design-system layer.
 */

import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface ArcHeatmapHoverDetail {
  date: string;
  count: number;
}

export type ArcHeatIntensity = 0 | 1 | 2 | 3 | 4;

@customElement('arc-heatmap-cell')
export class ArcHeatmapCell extends LitElement {
  /** ISO date (yyyy-mm-dd) this cell represents. */
  @property({ type: String }) date = '';

  /** Reviews completed on this date. */
  @property({ type: Number }) count = 0;

  /** Bucketed intensity (0–4) driving the heat color ramp. */
  @property({ type: Number }) intensity: ArcHeatIntensity = 0;

  /** Optional tooltip/aria text; falls back to "<count> reviews on <date>". */
  @property({ type: String }) label?: string;

  static styles = css`
    :host {
      display: inline-block;
      line-height: 0;
    }

    .cell {
      width: var(--arc-heatmap-cell-size, 13px);
      height: var(--arc-heatmap-cell-size, 13px);
      border-radius: calc(var(--arc-radius-sm) / 2);
      transition: transform var(--arc-duration-fast) var(--arc-ease);
    }

    .cell:hover {
      transform: scale(1.2);
    }

    .cell:focus-visible {
      outline: 2px solid var(--arc-color-accent);
      outline-offset: 1px;
    }

    .heat-0 {
      background: var(--arc-color-heat-0);
    }
    .heat-1 {
      background: var(--arc-color-heat-1);
    }
    .heat-2 {
      background: var(--arc-color-heat-2);
    }
    .heat-3 {
      background: var(--arc-color-heat-3);
    }
    .heat-4 {
      background: var(--arc-color-heat-4);
    }
  `;

  render() {
    const tooltip =
      this.label ?? `${this.count} review${this.count === 1 ? '' : 's'} on ${this.date}`;
    // title = native tooltip fallback; the app layer may render a richer
    // tooltip by listening to arc-cell-hover instead.
    return html`
      <div
        class="cell heat-${this.intensity}"
        role="img"
        tabindex="0"
        title=${tooltip}
        aria-label=${tooltip}
        @mouseenter=${this.emitHover}
        @focus=${this.emitHover}
      ></div>
    `;
  }

  private emitHover(): void {
    this.dispatchEvent(
      new CustomEvent<ArcHeatmapHoverDetail>('arc-cell-hover', {
        bubbles: true,
        composed: true,
        detail: { date: this.date, count: this.count },
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'arc-heatmap-cell': ArcHeatmapCell;
  }
}
