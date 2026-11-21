import { isRTL } from '../i18n';

/** Wait for the faces the current language draws with, so canvas text is not rasterised in a fallback font. */
export function loadFonts(): Promise<unknown> {
  const loads = [document.fonts.load('16px Tektur'), document.fonts.load('bold 16px Tektur')];
  if (isRTL()) loads.push(document.fonts.load('400 16px Cairo', 'عربي'), document.fonts.load('700 16px Cairo', 'عربي'));
  return Promise.race([Promise.all(loads), new Promise((resolve) => setTimeout(resolve, 4000))]).catch(() => undefined);
}
