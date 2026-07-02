/**
 * ReviewPage — route shell for /decks/:deckId/review.
 * All session behavior lives in the review feature; this file only extracts
 * the route param and keys the flow so switching decks remounts it cleanly
 * (fresh refs, fresh preflight, no leaked session state).
 */

import { Navigate, useParams } from 'react-router-dom';
import { ReviewFlow } from '@/features/review/ReviewFlow';

export default function ReviewPage() {
  const { deckId } = useParams<{ deckId: string }>();

  if (deckId === undefined || deckId.length === 0) {
    return <Navigate to="/" replace />;
  }

  return <ReviewFlow key={deckId} deckId={deckId} />;
}
