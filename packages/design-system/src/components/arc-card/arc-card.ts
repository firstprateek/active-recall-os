/**
 * <arc-card> — the flashcard primitive.
 *
 * Pure rendering per the design-system contract: inputs via reactive
 * properties, outputs via composed CustomEvents. No React/Zustand/Dexie.
 * Markdown rendering happens in the app layer — the app slots rendered
 * content into slot="front"/slot="back", which overrides the string props.
 */

import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface ArcCardFlipDetail {
  /** The side now facing the user after the flip. */
  side: 'front' | 'back';
}

export interface ArcCardRateDetail {
  /** SM-2 grade: 1 Again | 2 Hard | 3 Good | 4 Easy. */
  rating: 1 | 2 | 3 | 4;
}

const RATING_BUTTONS = [
  { rating: 1, label: 'Again', modifier: 'again' },
  { rating: 2, label: 'Hard', modifier: 'hard' },
  { rating: 3, label: 'Good', modifier: 'good' },
  { rating: 4, label: 'Easy', modifier: 'easy' },
] as const satisfies ReadonlyArray<{
  rating: ArcCardRateDetail['rating'];
  label: string;
  modifier: string;
}>;

/** Keyboard shortcuts 1–4 map straight onto SM-2 grades. */
const RATING_KEYS: Readonly<Record<string, ArcCardRateDetail['rating']>> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
};

@customElement('arc-card')
export class ArcCard extends LitElement {
  @property({ type: String }) front = '';
  @property({ type: String }) back = '';
  /** Reflected so the flip transform is driven purely by CSS. */
  @property({ type: Boolean, reflect: true }) flipped = false;
  @property({ type: Boolean, attribute: 'show-rating' }) showRating = false;
  @property({ type: String, reflect: true }) variant: 'default' | 'due' | 'new' = 'default';

  static override styles = css`
    :host {
      display: block;
      font-family: var(--arc-font-sans);
    }

    .scene {
      /* Perspective lives on the parent so the child rotation reads as 3D. */
      perspective: 1200px;
    }

    .card {
      position: relative;
      display: grid;
      transform-style: preserve-3d;
      transition: transform var(--arc-duration-med) var(--arc-ease);
      border-radius: var(--arc-radius-lg);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    :host([flipped]) .card {
      transform: rotateY(180deg);
    }

    .card:focus-visible {
      outline: 2px solid var(--arc-color-accent);
      outline-offset: 3px;
    }

    /*
     * Both faces share grid cell 1/1 so the card height tracks the taller
     * face without hardcoding a height (position:absolute would need one).
     */
    .face {
      grid-area: 1 / 1;
      display: flex;
      box-sizing: border-box;
      min-height: 10rem;
      max-height: 60vh;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: var(--arc-space-6) var(--arc-space-5);
      background: var(--arc-color-surface-raised);
      border: 1px solid var(--arc-color-border);
      border-radius: var(--arc-radius-lg);
      box-shadow: var(--arc-shadow-md);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      font-family: var(--arc-font-reading);
      font-size: var(--arc-text-lg);
      line-height: 1.6;
      color: var(--arc-color-text-primary);
    }

    .face--back {
      transform: rotateY(180deg);
    }

    /* margin:auto centers short content but degrades gracefully on overflow,
       unlike flex alignment which clips the top of scrollable content. */
    .face-content {
      margin: auto;
      width: 100%;
      text-align: center;
      white-space: pre-wrap;
      overflow-wrap: break-word;
    }

    /* String props are plain text (pre-wrap preserves newlines); slotted
       app-layer markdown manages its own whitespace. */
    .face-content ::slotted(*) {
      white-space: normal;
    }

    :host([variant='due']) .face {
      border-color: var(--arc-color-due);
      box-shadow:
        var(--arc-shadow-md),
        0 0 0 1px var(--arc-color-due),
        0 0 18px color-mix(in srgb, var(--arc-color-due) 30%, transparent);
    }

    :host([variant='new']) .face {
      border-color: var(--arc-color-new);
      box-shadow:
        var(--arc-shadow-md),
        0 0 0 1px var(--arc-color-new),
        0 0 18px color-mix(in srgb, var(--arc-color-new) 30%, transparent);
    }

    .rating-bar {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--arc-space-2);
      margin-top: var(--arc-space-3);
      animation: rating-in var(--arc-duration-fast) var(--arc-ease);
    }

    @keyframes rating-in {
      from {
        opacity: 0;
        transform: translateY(var(--arc-space-1));
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .rating-btn {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      min-height: var(--arc-touch-target);
      padding: var(--arc-space-1) var(--arc-space-2);
      border: none;
      border-radius: var(--arc-radius-md);
      font-family: var(--arc-font-sans);
      font-size: var(--arc-text-sm);
      font-weight: 700;
      color: var(--arc-color-text-inverse);
      cursor: pointer;
      transition:
        filter var(--arc-duration-fast) var(--arc-ease),
        transform var(--arc-duration-fast) var(--arc-ease);
    }

    .rating-btn:hover {
      filter: brightness(1.08);
    }

    .rating-btn:active {
      transform: scale(0.97);
    }

    .rating-btn:focus-visible {
      outline: 2px solid var(--arc-color-accent);
      outline-offset: 2px;
    }

    .rating-btn--again {
      background: var(--arc-color-danger);
    }

    .rating-btn--hard {
      background: var(--arc-color-warning);
    }

    .rating-btn--good {
      background: var(--arc-color-success);
    }

    .rating-btn--easy {
      background: var(--arc-color-easy);
    }

    .key-hint {
      font-size: var(--arc-text-xs);
      font-weight: 400;
      opacity: 0.75;
    }
  `;

  override render() {
    const ratingBar =
      this.flipped && this.showRating
        ? html`
            <div class="rating-bar" part="rating-bar" role="group" aria-label="Rate your recall">
              ${RATING_BUTTONS.map(
                (button) => html`
                  <button
                    type="button"
                    class="rating-btn rating-btn--${button.modifier}"
                    aria-keyshortcuts=${String(button.rating)}
                    @click=${(event: Event) => this.handleRateClick(event, button.rating)}
                  >
                    ${button.label}
                    <span class="key-hint" aria-hidden="true">${button.rating}</span>
                  </button>
                `,
              )}
            </div>
          `
        : nothing;

    return html`
      <div class="scene">
        <div
          class="card"
          part="card"
          role="button"
          tabindex="0"
          aria-pressed=${this.flipped ? 'true' : 'false'}
          aria-roledescription="flashcard"
          @click=${this.handleCardClick}
          @keydown=${this.handleCardKeydown}
        >
          <div
            class="face face--front"
            part="card-front"
            aria-hidden=${this.flipped ? 'true' : 'false'}
          >
            <div class="face-content"><slot name="front">${this.front}</slot></div>
          </div>
          <div
            class="face face--back"
            part="card-back"
            aria-hidden=${this.flipped ? 'false' : 'true'}
          >
            <div class="face-content"><slot name="back">${this.back}</slot></div>
          </div>
        </div>
        ${ratingBar}
      </div>
    `;
  }

  private handleCardClick(): void {
    this.toggleFlip();
  }

  private handleCardKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleFlip();
      return;
    }
    if (!this.flipped || !this.showRating) return;
    const rating = RATING_KEYS[event.key];
    if (rating === undefined) return;
    event.preventDefault();
    this.rate(rating);
  }

  private handleRateClick(event: Event, rating: ArcCardRateDetail['rating']): void {
    // Rating a card must never also flip it.
    event.stopPropagation();
    this.rate(rating);
  }

  private toggleFlip(): void {
    this.flipped = !this.flipped;
    this.dispatchEvent(
      new CustomEvent<ArcCardFlipDetail>('arc-card-flip', {
        bubbles: true,
        composed: true,
        detail: { side: this.flipped ? 'back' : 'front' },
      }),
    );
  }

  private rate(rating: ArcCardRateDetail['rating']): void {
    this.dispatchEvent(
      new CustomEvent<ArcCardRateDetail>('arc-card-rate', {
        bubbles: true,
        composed: true,
        detail: { rating },
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'arc-card': ArcCard;
  }
}
