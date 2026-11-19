// Project-owned title, caption, and reveal design values.
export const captionStyle = {
  "activeBox": {
    "background": "#83e21b",
    "borderColor": "#00000000",
    "borderRadius": 6,
    "borderWidth": 0,
    "continuity": "isolated",
    "mode": "current",
    "paddingX": 10,
    "paddingY": 4,
    "shadow": {
      "blur": 10,
      "color": "#70d812",
      "offsetX": 0,
      "offsetY": 0,
      "opacity": 0.36,
      "spread": 0
    },
    "transitionFrames": 2
  },
  "activePaint": {
    "color": "#ffffff",
    "outlineColor": "#090a0f",
    "outlineWidth": 2.6,
    "shadowBlur": 3,
    "shadowColor": "#0000008f",
    "shadowOffsetX": 0,
    "shadowOffsetY": 1
  },
  "activeResponse": {
    "frames": 3,
    "kind": "pop",
    "scale": 1.04
  },
  "blockAlign": "center",
  "color": "#ffffff",
  "cueBox": {
    "background": "#00000000",
    "borderColor": "#00000000",
    "borderRadius": 0,
    "borderWidth": 0,
    "continuity": "isolated",
    "paddingX": 0,
    "paddingY": 0
  },
  "entry": {
    "frames": 2,
    "kind": "fade"
  },
  "exit": {
    "frames": 2,
    "kind": "fade"
  },
  "inlineSize": "hug",
  "karaoke": {
    "activeColor": "#ffffff",
    "mode": "current",
    "transition": "step"
  },
  "maxLines": 2,
  "maxWordsPerLine": 5,
  "outlineColor": "#090a0f",
  "outlineWidth": 2.8,
  "overflow": "visible",
  "shadowBlur": 7,
  "shadowColor": "#000000b8",
  "shadowOffsetX": 0,
  "shadowOffsetY": 3,
  "textAlign": "center",
  "wrap": "word",
  "typography": {
    "fontWeight": 900,
    "lineHeight": 1.25,
    "fontSizePx": 44,
    "letterSpacingPx": -0.8,
    "fonts": [
      "@fontsource-variable/montserrat",
      "Arial Black",
      "Arial",
      "sans-serif"
    ]
  }
};
export const titleStyle = {
  "typography": {
    "fontWeight": 900,
    "lineHeight": 1.02,
    "fonts": [
      "Arial Black",
      "@fontsource-variable/montserrat",
      "Arial",
      "Apple Color Emoji",
      "Segoe UI Emoji",
      "sans-serif"
    ],
    "fontSizePx": 42,
    "letterSpacingPx": -1.2
  },
  "paints": [
    {
      "kind": "fill",
      "paint": {
        "kind": "solid",
        "color": "#070707"
      }
    }
  ],
  "children": [
    {
      "kind": "text",
      "id": "title-first",
      "text": "RANKING THE BEST PERSON"
    },
    {
      "kind": "break",
      "id": "title-break"
    },
    {
      "kind": "text",
      "id": "title-second",
      "text": "JENSEN EVER DATED 🔥💦🍑"
    }
  ],
  "placement": {
    "kind": "flow",
    "paddingPx": {
      "top": 5,
      "right": 20,
      "bottom": 4,
      "left": 20
    },
    "inlineAlign": "center",
    "blockAlign": "start",
    "wrap": "none",
    "overflow": "visible",
    "columns": 1,
    "columnGapPx": 0,
    "background": "#f4f2e8"
  }
};
export const revealFlash = {
  "intensity": 0.72,
  "attackFrames": 2,
  "holdFrames": 1,
  "decayFrames": 5,
  "color": "#78ff18",
  "glowColor": "#f1ffe8"
};
