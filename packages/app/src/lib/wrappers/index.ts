/**
 * React wrappers for the arc-* Lit web components (@lit-labs/react).
 *
 * This is the only place the app layer touches the web-component boundary:
 * properties become typed React props, CustomEvents become on* callbacks.
 * Feature code imports from '@/lib/wrappers' and never uses raw tag names.
 */

import * as React from 'react';
import { createComponent, type EventName } from '@lit-labs/react';
import {
  ArcCard as ArcCardElement,
  ArcTag as ArcTagElement,
  ArcProgressRing as ArcProgressRingElement,
  ArcHeatmapCell as ArcHeatmapCellElement,
  ArcDeckBadge as ArcDeckBadgeElement,
  ArcStreakCounter as ArcStreakCounterElement,
} from '@arc/design-system';
import type {
  ArcCardFlipDetail,
  ArcCardRateDetail,
  ArcTagRemoveDetail,
  ArcHeatmapHoverDetail,
  ArcDeckBadgeClickDetail,
} from '@arc/design-system';

export const ArcCard = createComponent({
  react: React,
  tagName: 'arc-card',
  elementClass: ArcCardElement,
  events: {
    onArcCardFlip: 'arc-card-flip' as EventName<CustomEvent<ArcCardFlipDetail>>,
    onArcCardRate: 'arc-card-rate' as EventName<CustomEvent<ArcCardRateDetail>>,
  },
});

export const ArcTag = createComponent({
  react: React,
  tagName: 'arc-tag',
  elementClass: ArcTagElement,
  events: {
    onArcTagRemove: 'arc-tag-remove' as EventName<CustomEvent<ArcTagRemoveDetail>>,
  },
});

export const ArcProgressRing = createComponent({
  react: React,
  tagName: 'arc-progress-ring',
  elementClass: ArcProgressRingElement,
});

export const ArcHeatmapCell = createComponent({
  react: React,
  tagName: 'arc-heatmap-cell',
  elementClass: ArcHeatmapCellElement,
  events: {
    onArcCellHover: 'arc-cell-hover' as EventName<CustomEvent<ArcHeatmapHoverDetail>>,
  },
});

export const ArcDeckBadge = createComponent({
  react: React,
  tagName: 'arc-deck-badge',
  elementClass: ArcDeckBadgeElement,
  events: {
    onArcDeckClick: 'arc-deck-click' as EventName<CustomEvent<ArcDeckBadgeClickDetail>>,
  },
});

export const ArcStreakCounter = createComponent({
  react: React,
  tagName: 'arc-streak-counter',
  elementClass: ArcStreakCounterElement,
});
