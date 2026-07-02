/**
 * CardEditorModal — the quick-capture surface.
 *
 * Optimized for consecutive captures: front is autofocused, Cmd/Ctrl+Enter
 * saves, and the default "Save & add another" flow clears the content
 * fields, refocuses front, and flashes "Saved ✓" so a batch of cards takes
 * seconds. Tags persist across consecutive captures (Anki-style batch
 * tagging). Edit mode (cardId present) loads the card and saves in place.
 *
 * Same-tab freshness: syncBus only reaches OTHER tabs, so after each write
 * we refresh the deck slice (store action) and invoke onDataChanged so the
 * hosting page can re-query its card list.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { cardRepository } from '@/repositories/card.repository';
import { syncBus } from '@/lib/sync/broadcast';
import { useAppStore } from '@/stores';
import { useCardsByDeck } from '@/hooks';
import { ArcTag } from '@/lib/wrappers';
import { Modal } from '@/features/editor/Modal';
import modalStyles from './Modal.module.css';
import styles from './CardEditorModal.module.css';

const MAX_TAG_SUGGESTIONS = 6;
const SAVED_FLASH_MS = 1600;

function normalizeTag(raw: string): string {
  return raw.replace(/,/g, ' ').trim().toLowerCase();
}

interface CardEditorModalProps {
  deckId: string;
  cardId?: string | undefined;
  onDataChanged?: (() => void) | undefined;
}

export function CardEditorModal({ deckId, cardId, onDataChanged }: CardEditorModalProps) {
  const uid = useId();
  const closeModal = useAppStore((s) => s.uiActions.closeModal);
  const loadDecks = useAppStore((s) => s.deckActions.loadDecks);
  // Deck cards power tag suggestions and provide the card being edited.
  const { cards, loading } = useCardsByDeck(deckId);

  const editing = cardId !== undefined;
  const existing = editing ? cards.find((card) => card.id === cardId) : undefined;

  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagsFocused, setTagsFocused] = useState(false);
  const [frontError, setFrontError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [hydrated, setHydrated] = useState(!editing);

  const frontRef = useRef<HTMLTextAreaElement>(null);
  const flashTimerRef = useRef<number | null>(null);

  // Edit mode: the card list loads async — prefill exactly once when it lands.
  useEffect(() => {
    if (hydrated || existing === undefined) return;
    setHydrated(true);
    setFront(existing.front);
    setBack(existing.back);
    setTags(existing.tags);
  }, [hydrated, existing]);

  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    },
    [],
  );

  // Existing deck tags, most-used first, for one-tap suggestions.
  const deckTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of cards) {
      for (const tag of card.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  }, [cards]);

  const suggestions = useMemo(() => {
    const needle = normalizeTag(tagInput);
    return deckTags
      .filter((tag) => !tags.includes(tag) && (needle === '' || tag.includes(needle)))
      .slice(0, MAX_TAG_SUGGESTIONS);
  }, [deckTags, tags, tagInput]);

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    setTagInput('');
    if (tag === '') return;
    setTags((previous) => (previous.includes(tag) ? previous : [...previous, tag]));
  };

  const removeTag = (label: string) => {
    setTags((previous) => previous.filter((tag) => tag !== label));
  };

  const handleTagKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag(tagInput);
      return;
    }
    if (event.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags((previous) => previous.slice(0, -1));
    }
  };

  const save = async (mode: 'again' | 'close') => {
    if (saving) return;
    const trimmedFront = front.trim();
    if (trimmedFront.length === 0) {
      setFrontError('The front side is required.');
      frontRef.current?.focus();
      return;
    }
    setFrontError(null);
    setFormError(null);

    // A tag still sitting in the input counts — capture should never lose it.
    const pendingTag = normalizeTag(tagInput);
    const finalTags =
      pendingTag !== '' && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;

    setSaving(true);
    const result =
      editing && cardId !== undefined
        ? await cardRepository.update(cardId, {
            front: trimmedFront,
            back: back.trim(),
            tags: finalTags,
          })
        : await cardRepository.create({
            deckId,
            front: trimmedFront,
            back: back.trim(),
            tags: finalTags,
          });
    setSaving(false);

    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }

    syncBus.publish('card:updated', result.value.id);
    void loadDecks(); // due/new counts changed — keep this tab's deck slice fresh
    onDataChanged?.();

    if (mode === 'close' || editing) {
      closeModal();
      return;
    }

    // Quick-capture loop: clear content, keep tags, refocus, flash.
    setFront('');
    setBack('');
    setTags(finalTags);
    setTagInput('');
    setSavedFlash(true);
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
    frontRef.current?.focus();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save(editing ? 'close' : 'again');
  };

  const handleFormKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save(editing ? 'close' : 'again');
    }
  };

  let body: ReactNode;
  if (editing && !hydrated) {
    body = loading ? (
      <p className={styles['status']} role="status">
        Loading card…
      </p>
    ) : (
      <div className={styles['status']}>
        <p role="alert">This card no longer exists — it may have been deleted in another tab.</p>
        <div className={modalStyles['actions']}>
          <button
            type="button"
            className={`${modalStyles['btn']} ${modalStyles['btnSecondary']}`}
            onClick={closeModal}
          >
            Close
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <form className={modalStyles['form']} onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
        <div className={modalStyles['field']}>
          <label className={modalStyles['label']} htmlFor={`${uid}-front`}>
            Front
          </label>
          <textarea
            id={`${uid}-front`}
            ref={frontRef}
            data-autofocus
            className={modalStyles['textarea']}
            placeholder="Question / prompt"
            rows={3}
            value={front}
            onChange={(event) => setFront(event.target.value)}
            aria-invalid={frontError !== null}
            aria-describedby={frontError !== null ? `${uid}-front-error` : undefined}
          />
          {frontError !== null && (
            <p id={`${uid}-front-error`} className={modalStyles['fieldError']} role="alert">
              {frontError}
            </p>
          )}
        </div>

        <div className={modalStyles['field']}>
          <label className={modalStyles['label']} htmlFor={`${uid}-back`}>
            Back
          </label>
          <textarea
            id={`${uid}-back`}
            className={modalStyles['textarea']}
            placeholder="Answer"
            rows={3}
            value={back}
            onChange={(event) => setBack(event.target.value)}
          />
        </div>

        <div className={modalStyles['field']}>
          <label className={modalStyles['label']} htmlFor={`${uid}-tags`}>
            Tags
          </label>
          <div className={styles['tagBox']}>
            {tags.map((tag) => (
              <ArcTag key={tag} label={tag} removable onArcTagRemove={(event) => removeTag(event.detail.label)} />
            ))}
            <input
              id={`${uid}-tags`}
              className={styles['tagInput']}
              type="text"
              value={tagInput}
              placeholder={tags.length === 0 ? 'Add tags (Enter or comma)' : ''}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={handleTagKeyDown}
              onFocus={() => setTagsFocused(true)}
              onBlur={() => setTagsFocused(false)}
              aria-describedby={`${uid}-tags-hint`}
              autoComplete="off"
            />
          </div>
          <p id={`${uid}-tags-hint`} className={styles['srOnly']}>
            Press Enter or comma to add a tag. Backspace removes the last tag.
          </p>
          {(tagsFocused || tagInput !== '') && suggestions.length > 0 && (
            // preventDefault keeps focus in the input so the row stays visible
            // long enough for the click to land.
            <div
              className={styles['suggestions']}
              onMouseDown={(event) => event.preventDefault()}
            >
              {suggestions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={styles['suggestion']}
                  onClick={() => addTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {formError !== null && (
          <p className={modalStyles['formError']} role="alert">
            {formError}
          </p>
        )}

        <div className={modalStyles['actions']}>
          <span
            className={`${styles['flash']} ${savedFlash ? styles['flashVisible'] : ''}`}
            role="status"
            aria-live="polite"
          >
            {savedFlash ? 'Saved ✓' : ''}
          </span>
          {editing ? (
            <button
              type="submit"
              className={`${modalStyles['btn']} ${modalStyles['btnPrimary']}`}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`${modalStyles['btn']} ${modalStyles['btnSecondary']}`}
                onClick={() => {
                  void save('close');
                }}
                disabled={saving}
              >
                Save &amp; close
              </button>
              <button
                type="submit"
                className={`${modalStyles['btn']} ${modalStyles['btnPrimary']}`}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save & add another'}
              </button>
            </>
          )}
        </div>
        <p className={styles['shortcutHint']} aria-hidden="true">
          ⌘/Ctrl + Enter to save
        </p>
      </form>
    );
  }

  return (
    <Modal title={editing ? 'Edit card' : 'Add card'} onClose={closeModal}>
      {body}
    </Modal>
  );
}
