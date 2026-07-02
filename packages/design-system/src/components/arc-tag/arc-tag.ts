/**
 * <arc-tag> — pill-shaped tag label with an optional remove affordance.
 * Design-system layer: pure rendering, token-driven styling, outputs via
 * CustomEvent only. No React/Zustand/Dexie.
 */

import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

export interface ArcTagRemoveDetail {
  label: string;
}

@customElement('arc-tag')
export class ArcTag extends LitElement {
  /** Visible tag text; echoed back in the remove event detail. */
  @property({ type: String }) label = '';

  /**
   * Token suffix selecting the accent color, e.g. 'deck-blue' →
   * var(--arc-color-deck-blue). Falls back to the brand accent.
   */
  @property({ type: String }) color?: string;

  /** When true, renders the remove (×) button. */
  @property({ type: Boolean }) removable = false;

  static styles = css`
    :host {
      display: inline-flex;
    }

    .tag {
      display: inline-flex;
      align-items: center;
      gap: var(--arc-space-1);
      /* Soft tint derived from the accent — CSS-only, no per-color soft token. */
      background: color-mix(in srgb, var(--_tag-accent) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--_tag-accent) 28%, transparent);
      color: var(--_tag-accent);
      border-radius: var(--arc-radius-full);
      padding: var(--arc-space-1) var(--arc-space-2);
      font-family: var(--arc-font-sans);
      font-size: var(--arc-text-xs);
      font-weight: 500;
      line-height: 1;
      white-space: nowrap;
    }

    .remove {
      /* 24px minimum hit area; negative block margins keep the pill compact
         while the interactive box stays full size. */
      inline-size: 24px;
      block-size: 24px;
      min-inline-size: 24px;
      min-block-size: 24px;
      margin-block: -6px;
      margin-inline: 0 calc(-1 * var(--arc-space-1));
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      border-radius: var(--arc-radius-full);
      cursor: pointer;
      transition: background var(--arc-duration-fast) var(--arc-ease);
    }

    .remove:hover {
      background: color-mix(in srgb, var(--_tag-accent) 22%, transparent);
    }

    .remove:focus-visible {
      outline: 2px solid var(--_tag-accent);
      outline-offset: 1px;
    }

    .remove svg {
      inline-size: 12px;
      block-size: 12px;
      pointer-events: none;
    }
  `;

  render() {
    const accent =
      this.color !== undefined && this.color !== ''
        ? `var(--arc-color-${this.color}, var(--arc-color-accent))`
        : 'var(--arc-color-accent)';

    return html`
      <span class="tag" style=${styleMap({ '--_tag-accent': accent })}>
        <span>${this.label}</span>
        ${this.removable
          ? html`
              <button
                class="remove"
                type="button"
                aria-label=${`Remove tag ${this.label}`}
                @click=${this.handleRemove}
              >
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path
                    d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            `
          : nothing}
      </span>
    `;
  }

  private handleRemove(): void {
    this.dispatchEvent(
      new CustomEvent<ArcTagRemoveDetail>('arc-tag-remove', {
        bubbles: true,
        composed: true,
        detail: { label: this.label },
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'arc-tag': ArcTag;
  }
}
