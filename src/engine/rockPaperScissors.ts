export type RpsChoice = 'Rock' | 'Paper' | 'Scissors';

export const RPS_CHOICES: RpsChoice[] = ['Rock', 'Paper', 'Scissors'];

export function rpsResult(player: RpsChoice, opponent: RpsChoice): 'win' | 'lose' | 'tie' {
  if (player === opponent) return 'tie';
  return (player === 'Rock' && opponent === 'Scissors') ||
    (player === 'Paper' && opponent === 'Rock') ||
    (player === 'Scissors' && opponent === 'Paper') ? 'win' : 'lose';
}
