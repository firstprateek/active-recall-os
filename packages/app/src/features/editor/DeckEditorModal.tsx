/**
 * DeckEditorModal — create a new deck or edit an existing one.
 * Edit mode (deckId present) prefills from the deck slice; creation
 * navigates straight to the new deck page so capture can start immediately.
 */

import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DECK_COLORS } from '@/types/domain';
import { useAppStore } from '@/stores';
import { useDecks } from '@/hooks';
import { Modal } from '@/features/editor/Modal';
import modalStyles from './Modal.module.css';
import styles from './DeckEditorModal.module.css';

const NAME_MAX_LENGTH = 60;

/** 'deck-blue' → 'Blue' for swatch accessible names. */
function colorLabel(color: string): string {
  const suffix = color.replace(/^deck-/, '');
  return suffix.charAt(0).toUpperCase() + suffix.slice(1);
}

interface DeckEditorModalProps {
  deckId?: string | undefined;
  onDataChanged?: (() => void) | undefined;
}

export function DeckEditorModal({ deckId, onDataChanged }: DeckEditorModalProps) {
  const uid = useId();
  const navigate = useNavigate();
  const closeModal = useAppStore((s) => s.uiActions.closeModal);
  const deckActions = useAppStore((s) => s.deckActions);
  // useDecks (not raw store state) so a deep-linked edit still loads the list.
  const { decks } = useDecks();

  const editing = deckId !== undefined;
  const existing = editing ? decks.find((deck) => deck.id === deckId) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [color, setColor] = useState<string>(existing?.color ?? DECK_COLORS[0]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(existing !== undefined);

  // Decks can arrive after mount (deep link straight into edit) — prefill once.
  useEffect(() => {
    if (!editing || hydrated || existing === undefined) return;
    setHydrated(true);
    setName(existing.name);
    setDescription(existing.description);
    setColor(existing.color);
  }, [editing, hydrated, existing]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setNameError('Deck name is required.');
      return;
    }
    if (trimmedName.length > NAME_MAX_LENGTH) {
      setNameError(`Keep the name under ${NAME_MAX_LENGTH} characters.`);
      return;
    }
    setNameError(null);
    setFormError(null);
    setSaving(true);

    const input = { name: trimmedName, description: description.trim(), color };
    const result =
      editing && deckId !== undefined
        ? await deckActions.updateDeck(deckId, input)
        : await deckActions.createDeck(input);
    setSaving(false);

    if (!result.ok) {
      if (result.error.code === 'VALIDATION') {
        setNameError(result.error.message);
      } else {
        setFormError(result.error.message);
      }
      return;
    }

    onDataChanged?.();
    closeModal();
    if (!editing) {
      navigate(`/decks/${result.value.id}`);
    }
  };

  return (
    <Modal title={editing ? 'Edit deck' : 'New deck'} onClose={closeModal}>
      <form
        className={modalStyles['form']}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className={modalStyles['field']}>
          <label className={modalStyles['label']} htmlFor={`${uid}-name`}>
            Name
          </label>
          <input
            id={`${uid}-name`}
            data-autofocus
            className={modalStyles['input']}
            type="text"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            placeholder="e.g. System design"
            onChange={(event) => setName(event.target.value)}
            aria-invalid={nameError !== null}
            aria-describedby={nameError !== null ? `${uid}-name-error` : undefined}
          />
          {nameError !== null && (
            <p id={`${uid}-name-error`} className={modalStyles['fieldError']} role="alert">
              {nameError}
            </p>
          )}
        </div>

        <div className={modalStyles['field']}>
          <label className={modalStyles['label']} htmlFor={`${uid}-description`}>
            Description <span className={styles['optional']}>(optional)</span>
          </label>
          <textarea
            id={`${uid}-description`}
            className={modalStyles['textarea']}
            value={description}
            rows={2}
            placeholder="What lives in this deck?"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <fieldset className={styles['colorField']}>
          <legend className={modalStyles['label']}>Color</legend>
          <div className={styles['swatches']}>
            {DECK_COLORS.map((deckColor) => (
              <label key={deckColor} className={styles['swatch']} title={colorLabel(deckColor)}>
                <input
                  className={styles['swatchInput']}
                  type="radio"
                  name={`${uid}-color`}
                  value={deckColor}
                  checked={color === deckColor}
                  onChange={() => setColor(deckColor)}
                  aria-label={colorLabel(deckColor)}
                />
                <span
                  className={styles['swatchDot']}
                  style={{ backgroundColor: `var(--arc-color-${deckColor})` }}
                  aria-hidden="true"
                />
              </label>
            ))}
          </div>
        </fieldset>

        {formError !== null && (
          <p className={modalStyles['formError']} role="alert">
            {formError}
          </p>
        )}

        <div className={modalStyles['actions']}>
          <button
            type="button"
            className={`${modalStyles['btn']} ${modalStyles['btnSecondary']}`}
            onClick={closeModal}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`${modalStyles['btn']} ${modalStyles['btnPrimary']}`}
            disabled={saving}
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create deck'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
