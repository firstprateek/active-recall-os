/**
 * @arc/design-system — public entry.
 * Importing this module registers all arc-* custom elements.
 */

export { ArcCard } from './components/arc-card/arc-card';
export { ArcTag } from './components/arc-tag/arc-tag';
export { ArcProgressRing } from './components/arc-progress-ring/arc-progress-ring';
export { ArcHeatmapCell } from './components/arc-heatmap-cell/arc-heatmap-cell';
export { ArcDeckBadge } from './components/arc-deck-badge/arc-deck-badge';
export { ArcStreakCounter } from './components/arc-streak-counter/arc-streak-counter';

export type { ArcCardFlipDetail, ArcCardRateDetail } from './components/arc-card/arc-card';
export type { ArcTagRemoveDetail } from './components/arc-tag/arc-tag';
export type { ArcHeatmapHoverDetail } from './components/arc-heatmap-cell/arc-heatmap-cell';
export type { ArcDeckBadgeClickDetail } from './components/arc-deck-badge/arc-deck-badge';
