/**
 * ConfirmDialog — destructive confirmation for the 'confirm-delete' modal.
 * Cancel is default-focused so Enter never destroys data by accident.
 * Deck deletion routes through the deck slice (and navigates home);
 * card deletion goes straight to the repository + sync broadcast.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cardRepository } from '@/repositories/card.repository';
import { syncBus } from '@/lib/sync/broadcast';
import { useAppStore } from '@/stores';
import { Modal } from '@/features/editor/Modal';
import modalStyles from './Modal.module.css';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  entity: 'deck' | 'card';
  id: string;
  name: string;
  onDataChanged?: (() => void) | undefined;
}

export function ConfirmDialog({ entity, id, name, onDataChanged }: ConfirmDialogProps) {
  const navigate = useNavigate();
  const closeModal = useAppStore((s) => s.uiActions.closeModal);
  const deckActions = useAppStore((s) => s.deckActions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    if (entity === 'deck') {
      const result = await deckActions.deleteDeck(id);
      setBusy(false);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onDataChanged?.();
      closeModal();
      navigate('/');
      return;
    }

    const result = await cardRepository.delete(id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    syncBus.publish('card:updated', id);
    void deckActions.loadDecks(); // denormalized card/due counts changed
    onDataChanged?.();
    closeModal();
  };

  return (
    <Modal title={entity === 'deck' ? 'Delete deck?' : 'Delete card?'} onClose={closeModal} size="sm">
      <div className={styles['content']}>
        <p className={styles['message']}>
          <strong className={styles['name']}>“{name}”</strong>
          {entity === 'deck'
            ? ' and all of its cards will be permanently deleted. This cannot be undone.'
            : ' will be permanently deleted. This cannot be undone.'}
        </p>

        {error !== null && (
          <p className={modalStyles['formError']} role="alert">
            {error}
          </p>
        )}

        <div className={modalStyles['actions']}>
          <button
            type="button"
            data-autofocus
            className={`${modalStyles['btn']} ${modalStyles['btnSecondary']}`}
            onClick={closeModal}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${modalStyles['btn']} ${modalStyles['btnDanger']}`}
            onClick={() => {
              void confirm();
            }}
            disabled={busy}
          >
            {busy ? 'Deleting…' : entity === 'deck' ? 'Delete deck' : 'Delete card'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
