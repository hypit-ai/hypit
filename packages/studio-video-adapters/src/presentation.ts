/** Official video-domain lane ranges. These are not part of the stable Adapter ABI. */
export const videoLaneHeights = {
  // The semantic ruler is a three-band group. Each band matches the ordinary
  // item's first row; the group therefore occupies three such rows.
  semantic: { minPx: 45, preferredPx: 45, maxPx: 45 },
  picture: { minPx: 60, preferredPx: 76, maxPx: 128 },
  audio: { minPx: 40, preferredPx: 48, maxPx: 88 },
  text: { minPx: 42, preferredPx: 48, maxPx: 72 },
  component: { minPx: 44, preferredPx: 52, maxPx: 96 },
} as const;
