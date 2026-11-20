export const zh = /^zh\b/i.test(navigator.language);
export const t = (en: string, cn: string) => zh ? cn : en;
