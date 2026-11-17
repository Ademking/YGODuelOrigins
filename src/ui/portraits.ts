export const PORTRAIT_IDS = [
  'yugi', 'kaiba', 'joey', 'mai', 'pegasus', 'jaden', 'zane', 'syrus', 'crowler',
  'exodia', 'orichalcos', 'bakura', 'marik', 'mako', 'weevil', 'chazz', 'aster', 'jesse', 'axel', 'bastion', 'alexis',
  'rex', 'keith', 'bonz',
  'tyranno', 'sartorius',
  'paradox', 'panik', 'rebecca', 'camula', 'chumley', 'zaloog', 'atticus',
  'espa', 'odion', 'ishizu', 'titan', 'amnael', 'kagemaru', 'adrian',
] as const;

/** Duelists with a high-resolution square close-up (Duel Links art) in /portraits/hd; the rest use the small framed portrait. */
export const HD_PORTRAITS = new Set([
  'yugi', 'kaiba', 'joey', 'mai', 'pegasus', 'jaden', 'zane', 'syrus', 'crowler', 'bakura', 'marik', 'mako', 'weevil', 'chazz',
  'aster', 'jesse', 'axel', 'bastion', 'alexis', 'rex', 'keith', 'bonz', 'tyranno', 'sartorius', 'paradox', 'rebecca', 'espa',
  'odion', 'ishizu', 'zaloog', 'panik', 'exodia', 'titan', 'atticus', 'camula', 'amnael', 'kagemaru', 'adrian',
]);
/** Where a portrait id's picture lives. */
export const portraitPath = (id: string) => HD_PORTRAITS.has(id) ? `/portraits/hd/${id}.png` : `/portraits/${id}.png`;

export function portraitKey(opponentId: string): string | null {
  const id = opponentId === 'jaden-neos' ? 'jaden' : opponentId;
  return (PORTRAIT_IDS as readonly string[]).includes(id) ? `portrait_${id}` : null;
}

/** Picture of a character opponent, or null when they have none. */
export function portraitURL(opponentId: string): string | null {
  const key = portraitKey(opponentId);
  return key ? portraitPath(key.slice('portrait_'.length)) : null;
}
