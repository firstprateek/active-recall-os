/**
 * ModalHost — renders whichever modal the UI slice says is active.
 * Pages render one <ModalHost /> each; a null activeModal renders nothing.
 */

import { useAppStore } from '@/stores';
import { CardEditorModal } from '@/features/editor/CardEditorModal';
import { DeckEditorModal } from '@/features/editor/DeckEditorModal';
import { ConfirmDialog } from '@/features/editor/ConfirmDialog';

export interface ModalHostProps {
  /**
   * Invoked after a modal successfully mutates data. syncBus messages only
   * reach OTHER tabs, so the hosting page uses this to refresh its own
   * page-local queries (e.g. useCardsByDeck) in the current tab.
   */
  onDataChanged?: (() => void) | undefined;
}

export function ModalHost({ onDataChanged }: ModalHostProps) {
  const activeModal = useAppStore((s) => s.activeModal);
  if (activeModal === null) return null;

  switch (activeModal.kind) {
    case 'card-editor':
      return (
        <CardEditorModal
          key={`card-${activeModal.cardId ?? 'new'}`}
          deckId={activeModal.deckId}
          cardId={activeModal.cardId}
          onDataChanged={onDataChanged}
        />
      );
    case 'deck-editor':
      return (
        <DeckEditorModal
          key={`deck-${activeModal.deckId ?? 'new'}`}
          deckId={activeModal.deckId}
          onDataChanged={onDataChanged}
        />
      );
    case 'confirm-delete':
      return (
        <ConfirmDialog
          key={`confirm-${activeModal.entity}-${activeModal.id}`}
          entity={activeModal.entity}
          id={activeModal.id}
          name={activeModal.name}
          onDataChanged={onDataChanged}
        />
      );
  }
}

export default ModalHost;
