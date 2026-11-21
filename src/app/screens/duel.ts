// The duel is drawn with PixiJS (src/duel); the menus around it are HTML. A rematch builds a fresh view in the same root.
import { DuelView, type DuelInit } from '../../duel/DuelView';
import { loadFonts } from '../../duel/fonts';
import type { Screen } from '../dom';

export type { DuelInit };

const duelScreen: Screen<DuelInit> = (root, init) => {
  root.className = 'duel-root fixed inset-0 bg-void';
  let view: DuelView | null = null;
  const open = (data: DuelInit) => {
    view?.destroy();
    root.replaceChildren();
    const next = new DuelView(root, data, open);
    view = next;
    if (import.meta.env.DEV) (window as unknown as { __duel: DuelView }).__duel = next;
    void loadFonts().then(() => next.start()).catch((error: unknown) => {
      console.error(error);
      document.dispatchEvent(new Event('duel-origins:boot-error'));
    });
  };
  open(init);
  return () => { view?.destroy(); view = null; };
};
export default duelScreen;
