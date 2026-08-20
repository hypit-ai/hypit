const paths: Readonly<Record<string, string>> = {
  code: '<path d="M9 7 4 12l5 5M15 7l5 5-5 5M13 4l-2 16"/>',
  edit: '<path d="m4 16-.8 4 4-.8L18.5 8.9 15.1 5.5 4 16Z"/><path d="m13.8 6.8 3.4 3.4"/>',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  preview: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m10 8 5 3.5-5 3.5V8ZM8 21h8"/>',
  tune: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  select: '<path d="M5 3v15l4-4 3 6 3-1.5-3-6h6L5 3Z"/>',
  timeline: '<path d="M3 6h18M3 12h18M3 18h18"/><path d="M8 4v4M16 10v4M11 16v4"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  fit: '<path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/>',
  previous: '<path d="M7 5v14M18 6l-8 6 8 6V6Z"/>',
  next: '<path d="M17 5v14M6 6l8 6-8 6V6Z"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  volume: '<path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9c1.5 1.7 1.5 4.3 0 6M19 6.5c3 3 3 8 0 11"/>',
  muted: '<path d="M4 10v4h4l5 4V6l-5 4H4ZM17 10l4 4M21 10l-4 4"/>',
  speech: '<path d="M7 17H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-4l-4 3v-3Z"/><path d="M7 9h6M7 12h4"/>',
  waveform: '<path d="M3 12h2l1.5-6 3 12 3-14 3 16 2-8H21"/>',
  video: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2v-4Z"/>',
  text: '<path d="M5 5h14M12 5v14M8 19h8"/>',
  captions: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 11h4M13 11h4M7 15h3M12 15h5"/>',
  component: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  ranking: '<path d="M5 19V9h4v10M10 19V5h4v14M15 19v-7h4v7M3 19h18"/>',
};

export function icon(name: string, className = "icon"): string {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.layers}</svg>`;
}

export function setIcon(target: Element, name: string): void {
  target.innerHTML = icon(name);
}
