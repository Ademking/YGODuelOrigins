export const PORTRAIT_IDS = [
  'yugi', 'kaiba', 'joey', 'mai', 'pegasus', 'jaden', 'zane', 'syrus', 'crowler',
  'exodia', 'orichalcos', 'bakura', 'marik', 'mako', 'weevil', 'chazz', 'aster', 'jesse', 'axel', 'bastion', 'alexis',
  'rex', 'keith', 'bonz',
] as const;

export function portraitKey(opponentId: string): string | null {
  const id = opponentId === 'jaden-neos' ? 'jaden' : opponentId;
  return (PORTRAIT_IDS as readonly string[]).includes(id) ? `portrait_${id}` : null;
}
