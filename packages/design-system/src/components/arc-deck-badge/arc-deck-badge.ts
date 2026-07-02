/**
 * <arc-deck-badge> — clickable deck tile showing a color dot, the deck name,
 * and due/new count chips. Output via 'arc-deck-click' only — the app layer
 * decides what a click means (navigation, selection, ...).
 * No React, no Zustand, no Dexie — design-system layer.
 */

import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface ArcDeckBadgeClickDetail {
  deckId: string;
}

@customElement('arc-deck-badge')
export class ArcDeckBadge extends LitElement {
  @property({ type: String }) deckId = '';

  @property({ type: String }) name = '';

  @property({ type: Number }) dueCount = 0;

  @property({ type: Number }) newCount = 0;

  /** Deck color token suffix, e.g. 'deck-blue' → var(--arc-color-deck-blue). */
  @property({ type: String }) color = 'deck-blue';

  static styles = css`
    :host {
      display: block;
    }

    .tile {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: var(--arc-space-3);
      min-height: var(--arc-touch-target);
      padding: var(--arc-space-3) var(--arc-space-4);
      background: var(--arc-color-surface-raised);
      border: 1px solid var(--arc-color-border);
      border-radius: var(--arc-radius-lg);
      box-shadow: var(--arc-shadow-sm);
      cursor: pointer;
      transition:
        box-shadow var(--arc-duration-fast) var(--arc-ease),
        transform var(--arc-duration-fast) var(--arc-ease);
    }

    .tile:hover {
      box-shadow: var(--arc-shadow-md);
      transform: translateY(-2px);
    }

    .tile:active {
      transform: translateY(0);
    }

    .tile:focus-visible {
      outline: 2px solid var(--arc-color-accent);
      outline-offset: 2px;
    }

    .dot {
      flex: none;
      width: 12px;
      height: 12px;
      border-radius: var(--arc-radius-full);
    }

    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--arc-font-sans);
      font-size: var(--arc-text-base);
      font-weight: 600;
      color: var(--arc-color-text-primary);
    }

    .chips {
      flex: none;
      display: flex;
      align-items: center;
      gap: var(--arc-space-1);
    }

    .chip {
      font-family: var(--arc-font-sans);
      font-size: var(--arc-text-xs);
      font-weight: 600;
      line-height: 1;
      padding: var(--arc-space-1) var(--arc-space-2);
      border-radius: var(--arc-radius-full);
      color: var(--arc-color-text-inverse);
      white-space: nowrap;
    }

    .chip.due {
      background: var(--arc-color-due);
    }

    .chip.new {
      background: var(--arc-color-new);
    }

    /* Quiet state when there is nothing due and nothing new. */
    .chip.done {
      background: var(--arc-color-surface-tertiary);
      color: var(--arc-color-text-secondary);
      font-weight: 500;
    }
  `;

  render() {
    const allClear = this.dueCount === 0 && this.newCount === 0;
    return html`
      <div
        class="tile"
        role="button"
        tabindex="0"
        aria-label="${this.name}: ${this.dueCount} due, ${this.newCount} new"
        @click=${this.emitClick}
        @keydown=${this.handleKeydown}
      >
        <span
          class="dot"
          style="background-color: var(--arc-color-${this.color})"
          aria-hidden="true"
        ></span>
        <span class="name">${this.name}</span>
        <span class="chips">
          ${this.dueCount > 0 ? html`<span class="chip due">${this.dueCount} due</span>` : nothing}
          ${this.newCount > 0 ? html`<span class="chip new">${this.newCount} new</span>` : nothing}
          ${allClear ? html`<span class="chip done">done</span>` : nothing}
        </span>
      </div>
    `;
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault(); // stop Space from scrolling the page
    this.emitClick();
  }

  private emitClick(): void {
    this.dispatchEvent(
      new CustomEvent<ArcDeckBadgeClickDetail>('arc-deck-click', {
        bubbles: true,
        composed: true,
        detail: { deckId: this.deckId },
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'arc-deck-badge': ArcDeckBadge;
  }
}
