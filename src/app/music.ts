// Background music: Yu-Gi-Oh! tracks streamed from YouTube through an off-screen embedded player, with a corner
// Music section in Settings (song list, play / pause, previous / next and mute). The choice is remembered.
import { icon } from './icons';
import { t } from '../i18n';
import { esc, html } from './dom';
import { onJingle } from '../ui/sfx';

const SONGS = [
  ['SsoY3W8-2zQ', 'Fang of Critias'],
  ['m8pZjRTHIa0', 'Passionate Duelist'],
  ['BGxYef6pmN0', 'God’s Anger'],
  ['woINXzunmyg', 'Duel of Friendship'],
  ['svMoIZYwVU4', 'Jaden’s Theme'],
  ['6MR8GPSTwOk', 'Impossible Victory'],
  ['WHUcHw7j2Mc', 'Duel Monsters Opening'],
  ['CN_DjYDHEVU', 'Get Your Game On'],
] as const;

const KEY = 'arcana-duel.music';
type State = { track: number; playing: boolean; muted: boolean };
const state: State = { track: 0, playing: true, muted: false };
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* storage unavailable */ }
state.track = Math.min(Math.max(0, state.track | 0), SONGS.length - 1);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } };

// The subset of the YouTube IFrame API used here.
interface YTPlayer {
  loadVideoById(id: string): void; cueVideoById(id: string): void; playVideo(): void; pauseVideo(): void;
  mute(): void; unMute(): void; setVolume(v: number): void;
}
declare global { interface Window { YT?: { Player: new (el: HTMLElement, o: object) => YTPlayer }; onYouTubeIframeAPIReady?: () => void } }

let player: YTPlayer | undefined;
let loading: Promise<YTPlayer> | undefined;

/** Load the IFrame API and make the off-screen player (only once the player has interacted, so it may play sound). */
function ready() {
  loading ??= new Promise<YTPlayer>((resolve) => {
    const host = html('<div aria-hidden="true" style="position:fixed;left:-9999px;top:0;width:200px;height:200px;pointer-events:none;opacity:0"><div></div></div>');
    document.body.append(host);
    window.onYouTubeIframeAPIReady = () => {
      const made: YTPlayer = new window.YT!.Player(host.firstElementChild as HTMLElement, {
        width: 200, height: 200, videoId: SONGS[state.track][0],
        playerVars: { autoplay: 0, controls: 0, playsinline: 1 },
        events: {
          onReady: () => { player = made; made.setVolume(volumeNow); if (state.muted) made.mute(); resolve(made); },
          // 0: ended → next song
          onStateChange: (event: { data: number }) => { if (event.data === 0) play(state.track + 1); },
          // a video that cannot be embedded is skipped
          onError: () => { if (state.playing) setTimeout(() => play(state.track + 1), 500); },
        },
      });
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.append(script);
  });
  return loading;
}

// ---------------------------------------------------------------- dipping under the game's own jingles
const VOLUME = 45, DIPPED = 6;
let volumeNow = VOLUME, fadeTimer: ReturnType<typeof setInterval> | undefined;
/** Slide the music's volume to `target` over `ms`. */
function fadeTo(target: number, ms: number) {
  clearInterval(fadeTimer);
  const from = volumeNow, start = performance.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - start) / ms);
    volumeNow = Math.round(from + (target - from) * k);
    player?.setVolume(volumeNow);
    if (k === 1) clearInterval(fadeTimer);
  }, 50);
}
const jingles = new Set<HTMLAudioElement>();
onJingle((audio) => {
  jingles.add(audio);
  fadeTo(DIPPED, 350);
  const done = () => {
    audio.removeEventListener('ended', done);
    audio.removeEventListener('pause', done);
    jingles.delete(audio);
    if (!jingles.size) fadeTo(VOLUME, 1500);
  };
  audio.addEventListener('ended', done);
  audio.addEventListener('pause', done);
});

function play(track = state.track) {
  const changed = track !== state.track || !player;
  state.track = (track + SONGS.length) % SONGS.length;
  state.playing = true;
  save();
  void ready().then((p) => { if (changed) p.loadVideoById(SONGS[state.track][0]); else p.playVideo(); });
  draw();
}
function pause() { state.playing = false; save(); player?.pauseVideo(); draw(); }
function setMuted(muted: boolean) { state.muted = muted; save(); if (muted) player?.mute(); else player?.unMute(); draw(); }

// ---------------------------------------------------------------- the Music section of Settings
// Every open Settings panel (title screen, duel menu) holds one of these; they all redraw when the music changes.
const panels = new Set<HTMLElement>();

function drawPanel(root: HTMLElement) {
  root.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="flex-1 text-sm">${esc(t('Music'))}</span>
      <button type="button" class="mp-icon !size-9" data-prev aria-label="${esc(t('Previous'))}">${icon('skipBack', 'size-4')}</button>
      <button type="button" class="mp-icon !size-9 ${state.playing ? 'on' : ''}" data-toggle aria-label="${esc(state.playing ? t('Pause music') : t('Play music'))}">${icon(state.playing ? 'pause' : 'play', 'size-4')}</button>
      <button type="button" class="mp-icon !size-9" data-next aria-label="${esc(t('Next'))}">${icon('skipNext', 'size-4')}</button>
      <button type="button" class="mp-icon !size-9 ${state.muted ? 'on' : ''}" data-mute aria-label="${esc(state.muted ? t('Unmute') : t('Mute'))}">${icon(state.muted ? 'mute' : 'volume', 'size-4')}</button>
    </div>
    <ol class="mt-1 flex max-h-44 flex-col gap-0.5 overflow-y-auto">${SONGS.map(([, name], index) => `<li><button type="button" data-song="${index}" class="flex w-full items-center gap-2 px-2.5 py-1.5 text-start text-sm ${index === state.track ? 'text-brass-txt' : 'text-ink hover:text-brass-lit'}">
      <span class="w-4 flex-none text-center">${index === state.track && state.playing ? icon('music', 'size-3.5') : `<small class="text-faint">${index + 1}</small>`}</span>${esc(name)}</button></li>`).join('')}</ol>`;
}

function draw() {
  for (const root of panels) {
    if (!root.isConnected && root.dataset.mounted) { panels.delete(root); continue; }
    drawPanel(root);
  }
}

/** Play / pause, previous / next, mute and the song list, for a Settings panel. */
export function musicControls() {
  const root = html('<div class="music-panel"></div>');
  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (!target) return;
    if (target.dataset.song) play(Number(target.dataset.song));
    else if ('prev' in target.dataset) play(state.track - 1);
    else if ('next' in target.dataset) play(state.track + 1);
    else if ('toggle' in target.dataset) { if (state.playing) pause(); else play(); }
    else if ('mute' in target.dataset) setMuted(!state.muted);
  });
  panels.add(root);
  drawPanel(root);
  requestAnimationFrame(() => { root.dataset.mounted = '1'; });
  return root;
}

/** Start the music with the player's first click or key press (its controls live in Settings). */
export function mountMusic() {
  const start = () => { if (state.playing) play(); };
  document.addEventListener('pointerdown', start, { once: true, capture: true });
  document.addEventListener('keydown', start, { once: true, capture: true });
}
