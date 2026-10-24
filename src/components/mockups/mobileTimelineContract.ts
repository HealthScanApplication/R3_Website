/**
 * Web-safe subset of the current mobile Home timeline contract.
 * Values are sourced from mobile:
 *   features/protocol/timeline/homeAxis.ts
 *   features/protocol/timeline/timelineVisualState.ts
 *   features/protocol/timeline/spineReach.ts
 * Keep this file framework-free so the web preview can use the real geometry
 * without importing React Native.
 */
export const MOBILE_TIMELINE = {
  screenCardInset: 16,
  cardContentInset: 10,
  headerPadX: 12,
  headerLeadPad: 8,
  avatarSize: 32,
  axisX: 36,
  rowContentX: 70,
  groupItemInset: 8,
  itemOriginX: 78,
  nodeWidth: 32,
  railWidth: 1.5,
  groupRadius: 14,
  itemRadius: 12,
  groupHeaderPadY: 10,
  groupItemGap: 6,
  groupPadBottom: 6,
  singletonPadTop: 8,
} as const;

export const MOBILE_CATEGORY_TINTS = {
  light: {
    supplements: { fg: '#0097A7', bg: '#E8F5F7' },
    consume: { fg: '#388E3C', bg: '#EBF5EB' },
    do: { fg: '#D45B0A', bg: '#FEF3EB' },
    sleep: { fg: '#245FAE', bg: '#EAF2FC' },
  },
  dark: {
    supplements: { fg: '#4DD0E1', bg: '#0C2E36' },
    consume: { fg: '#6FCF77', bg: '#0F2A1C' },
    do: { fg: '#F0955A', bg: '#331E0E' },
    sleep: { fg: '#8AB9F1', bg: '#12233A' },
  },
} as const;
