const paths: Readonly<Record<string, string>> = {
  brand: '<g transform="translate(0 1.282) scale(.091603) translate(-50 -180)"><path fill="currentColor" stroke="none" d="M303.78,277.82c-5.98-8.63-15.83-13.77-26.32-13.77h-93.41c-12.28,0-24.92,7.44-29.6,18.8l-28.26,75.82c-4.6,11.25-4.54,24.05,2.22,34.16,6.79,10.15,19.36,16.15,31.57,16.15h85.98c14.12,0,26.9-8.88,31.84-22.1l29.69-79.57c3.67-9.84,2.29-20.86-3.69-29.48v-.02h-.02ZM252.02,377.25c-.94,2.52-3.39,4.22-6.08,4.22h-83.45c-4.34,0-6.68-2.8-7.49-3.99s-2.5-4.43-.84-8.44l23.85-66.24c2.29-6.35,8.08-10.87,14.82-11.22.33-.02.67-.02,1.02-.02h75.41s12.51,1.42,9.29,14.61l-26.53,71.09h0ZM106.85,361.73s-22.36-11.59-17.66-32.66l29.67-82.23c4.78-13.25,17.36-22.09,31.45-22.09h95.02c6.25,0,12.1,3.03,15.71,8.14l13.89,19.68h-112.97c-8.7,0-16.49,5.41-19.52,13.57l-35.59,95.6h0ZM73.3,323.27s-22.37-11.59-17.66-32.66l29.67-82.23c4.79-13.25,17.37-22.09,31.45-22.09h89.91c6.25,0,12.1,3.03,15.71,8.14l13.89,19.68h-107.84c-8.7,0-16.49,5.41-19.52,13.57l-35.59,95.6h-.02Z"/></g>',
  code: '<path d="M9 7 4 12l5 5M15 7l5 5-5 5M13 4l-2 16"/>',
  edit: '<path d="m4 16-.8 4 4-.8L18.5 8.9 15.1 5.5 4 16Z"/><path d="m13.8 6.8 3.4 3.4"/>',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  preview: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m10 8 5 3.5-5 3.5V8ZM8 21h8"/>',
  tune: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  where: '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M12 2v7M12 15v7M2 12h7M15 12h7"/>',
  how: '<path d="M6 3v18M12 3v18M18 3v18"/><rect x="4" y="7" width="4" height="5" rx="1"/><rect x="10" y="13" width="4" height="5" rx="1"/><rect x="16" y="5" width="4" height="5" rx="1"/>',
  when: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2M4.5 4.5 2.5 7M19.5 4.5 21.5 7"/>',
  chevron: '<path d="m7 9 5 5 5-5"/>',
  select: '<path d="M5 3v15l4-4 3 6 3-1.5-3-6h6L5 3Z"/>',
  tasks: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3.5 6 1.5 1.5L7.5 4.5M3.5 12 5 13.5l2.5-3M3.5 18 5 19.5l2.5-3"/>',
  archive: '<path d="M4 8v12h16V8M3 4h18v4H3zM9 12h6"/>',
  run: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="2"/><path d="m4 18 5-5 3 3 3-4 5 6"/>',
  sidebarCollapse: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16m7-11-3 3 3 3"/>',
  wrap: '<path d="M4 6h16M4 10h12a4 4 0 0 1 0 8h-5m3-3-3 3 3 3M4 14h5M4 18h4"/>',
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
  // The speech bubble's geometric path is left-heavy because of its tail.
  // Shift it two view-box units so its optical centre shares the same column
  // as the symmetric video, waveform, text and caption glyphs.
  speech: '<g transform="translate(2 0)"><path d="M7 17H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-4l-4 3v-3Z"/><path d="M7 9h6M7 12h4"/></g>',
  waveform: '<path d="M3 12h2l1.5-6 3 12 3-14 3 16 2-8H21"/>',
  video: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2v-4Z"/>',
  text: '<path d="M5 5h14M12 5v14M8 19h8"/>',
  captions: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 11h4M13 11h4M7 15h3M12 15h5"/>',
  link: '<path d="m9 15 6-6"/><path d="M7.5 17.5h-1a4 4 0 0 1 0-8h3"/><path d="M16.5 6.5h1a4 4 0 0 1 0 8h-3"/>',
  moment: '<path d="m12 3 3 9-3 9-3-9 3-9Z"/>',
  component: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  ranking: '<path d="M5 19V9h4v10M10 19V5h4v14M15 19v-7h4v7M3 19h18"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.5 9a7 7 0 0 0-11.8-2.3L4 9M5.5 15a7 7 0 0 0 11.8 2.3L20 15"/>',
};

export function icon(name: string, className = "icon"): string {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.layers}</svg>`;
}

export function setIcon(target: Element, name: string): void {
  target.innerHTML = icon(name);
}
