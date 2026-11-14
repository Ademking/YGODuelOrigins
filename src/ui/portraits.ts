export const PORTRAIT_IDS = [
  'yugi', 'kaiba', 'joey', 'mai', 'pegasus', 'jaden', 'zane', 'syrus', 'crowler',
  'exodia', 'orichalcos', 'bakura', 'marik', 'mako', 'weevil', 'chazz', 'aster', 'jesse', 'axel', 'bastion', 'alexis',
  'rex', 'keith', 'bonz',
  'tyranno', 'sartorius',
  'paradox', 'panik', 'rebecca', 'camula', 'chumley', 'zaloog', 'atticus',
  'espa', 'odion', 'ishizu', 'titan', 'amnael', 'kagemaru', 'adrian',
] as const;

export function portraitKey(opponentId: string): string | null {
  const id = opponentId === 'jaden-neos' ? 'jaden' : opponentId;
  return (PORTRAIT_IDS as readonly string[]).includes(id) ? `portrait_${id}` : null;
}
