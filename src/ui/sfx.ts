// Every sound is one .wav in /sfx (assets/sfx), named as below. Setting and Normal Summoning reuse the draw sound.
export const soundFiles = {
  click: 'click', hover: 'hover', draw: 'draw', set: 'draw', summon: 'draw', specialSummon: 'special-summon', equip: 'equip', flip: 'flip',
  activate: 'activate', field: 'field', chain: 'chain', attack: 'attack', hit: 'hit', destroy: 'destroy', battleDestroy: 'battle-destroy',
  damage: 'damage', heal: 'heal', phase: 'phase', turn: 'turn', deny: 'deny', win: 'win', lose: 'lose',
  coinToss: 'coin-toss', fusion: 'fusion', fusionComplete: 'fusion-complete', start: 'start',
  godSummon: 'god-summon', tribute: 'tribute', exodiaCharge: 'exodia-charge', exodiaBlast: 'exodia-blast',
};

type Sound = keyof typeof soundFiles;
const voices = new Map<Sound, HTMLAudioElement[]>();
let muted = false;
let volume = 1;
const soundVolume = (sound: Sound) => (sound === 'hover' ? 0.12 : sound === 'click' ? 0.3 : 0.55) * volume;
try {
  const saved = localStorage.getItem('arcana-duel.volume');
  if (saved !== null && Number.isFinite(Number(saved))) volume = Math.max(0, Math.min(1, Number(saved)));
} catch {}
try { muted = localStorage.getItem('arcana-duel.muted') === '1'; } catch {}

function play(sound: Sound) {
  if (muted || volume === 0) return;
  let pool = voices.get(sound);
  if (!pool) { pool = []; voices.set(sound, pool); }
  let audio = pool.find(voice => voice.paused || voice.ended);
  if (!audio && pool.length < 4) {
    audio = new Audio(`/sfx/${soundFiles[sound]}.${sound === 'godSummon' ? 'mp3' : 'wav'}`);
    pool.push(audio);
  }
  audio ??= pool[0];
  audio.currentTime = 0;
  audio.volume = soundVolume(sound);
  void audio.play().catch(() => undefined);
}

function stop(sound: Sound) {
  for (const audio of voices.get(sound) ?? []) { audio.pause(); audio.currentTime = 0; }
}

function fadeOut(sound: Sound, duration: number) {
  for (const audio of voices.get(sound) ?? []) {
    if (audio.paused || audio.ended) continue;
    const initialVolume = audio.volume;
    const start = performance.now();
    const fade = () => {
      if (audio.paused || audio.ended) return;
      const progress = Math.min(1, (performance.now() - start) / duration);
      audio.volume = initialVolume * (1 - progress);
      if (progress < 1) requestAnimationFrame(fade);
      else { audio.pause(); audio.currentTime = 0; }
    };
    requestAnimationFrame(fade);
  }
}

export const sfx = {
  get muted() { return muted; },
  get volume() { return volume; },
  setVolume(value: number) {
    if (!Number.isFinite(value)) return;
    volume = Math.min(1, Math.max(0, value));
    for (const [sound, pool] of voices) for (const audio of pool) audio.volume = soundVolume(sound);
    try { localStorage.setItem('arcana-duel.volume', String(volume)); } catch {}
  },
  setMuted(value: boolean) {
    muted = value;
    if (value) for (const pool of voices.values()) for (const audio of pool) audio.pause();
    try { localStorage.setItem('arcana-duel.muted', value ? '1' : '0'); } catch {}
  },
  click: () => play('click'), hover: () => play('hover'), draw: () => play('draw'),
  set: () => play('set'), summon: () => play('summon'), specialSummon: () => play('specialSummon'), equip: () => play('equip'), flip: () => play('flip'),
  activate: () => play('activate'), chain: () => play('chain'), attack: () => play('attack'),
  hit: () => play('hit'), destroy: () => play('destroy'), battleDestroy: () => play('battleDestroy'), damage: () => play('damage'),
  heal: () => play('heal'), phase: () => play('phase'), turn: () => play('turn'),
  deny: () => play('deny'), win: () => play('win'), lose: () => play('lose'),
  field: () => play('field'), coinToss: () => play('coinToss'), fusion: () => play('fusion'),
  fusionComplete: () => play('fusionComplete'), start: () => play('start'),
  tribute: () => play('tribute'), exodiaCharge: () => play('exodiaCharge'), exodiaBlast: () => play('exodiaBlast'),
  godSummon: () => play('godSummon'),
  stopGodSummon: () => stop('godSummon'),
  fadeGodSummon: (duration: number) => fadeOut('godSummon', duration),
  stopExodia: () => { stop('exodiaCharge'); stop('exodiaBlast'); },
  stopExodiaCharge: () => stop('exodiaCharge'),
  fadeExodiaBlast: (duration: number) => fadeOut('exodiaBlast', duration),
};
