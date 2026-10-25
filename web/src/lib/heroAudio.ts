/**
 * Manager lagu hero - SATU objek `Audio` untuk seluruh aplikasi.
 *
 *ebab kenapa satu objek sahaja:
 *   - hanya satu lagu boleh:main pada satu masa, jadi tidak perlu banyak
 *     elemen audio yang berebut-rebut.
 *   - `audio.play()` dipanggil terus dalam handler klik (lihat `playHeroTrack`),
 *     jadi dasar autoplay browser - termasuk iOS Safari - dipatuhi.
 *
 * API:
 *   - `playHeroTrack(hero)`  -> mula (atau tukar ke) lagu hero, loop, volume 0.7
 *   - `toggleHeroTrack(hero)` -> jeda / sambung
 *   - `stopHeroTrack()`      -> fade-out ~200ms, reset ke 0:00
 *   - `prepareHeroTrack(hero)`-> pra-muat (preload) tanpa memain
 *
 * Hero tanpa lagu: `findHeroAudioTrack` mengembalikan null, jadi semua fungsi
 * di sini keluar senyap - tiada error, tiada penanda di UI.
 */
import { findHeroAudioTrack, heroAudioUrl, type HeroAudioTrack } from '../data/heroAudio';

const DEFAULT_VOLUME = 0.7;
const FADE_OUT_MS = 200;

export interface HeroAudioState {
  /** Nama hero yang sedang dimainkan (null kalau tiada). */
  hero: string | null;
  /** Adakah lagu sedang berbunyi. */
  playing: boolean;
  /** Adakah hero yang dibuka ada lagunya. */
  hasTrack: boolean;
}

type Listener = (state: HeroAudioState) => void;

let audioEl: HTMLAudioElement | null = null;
let activeHero: string | null = null;
let fadeFrame = 0;

let state: HeroAudioState = { hero: null, playing: false, hasTrack: false };
const listeners = new Set<Listener>();

function emit(patch: Partial<HeroAudioState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

/** Langgan perubahan state (untuk penanda equalizer). */
export function subscribeHeroAudio(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

function ensureElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (audioEl) return audioEl;

  audioEl = new Audio();
  audioEl.preload = 'auto';
  audioEl.loop = true;
  audioEl.volume = DEFAULT_VOLUME;
  // Elemen audio ditampal pada DOM (senyap, tiada visual). Safari/iOS lebih
  //uja boleh Playselepas `play()` dipanggil dalam user gesture, dan ia
  // memudahkan debugging dari console.
  audioEl.setAttribute('aria-hidden', 'true');
  audioEl.style.display = 'none';
  if (typeof document !== 'undefined' && document.body) {
    document.body.appendChild(audioEl);
  }

  audioEl.addEventListener('play', () => emit({ playing: true }));
  audioEl.addEventListener('pause', () => emit({ playing: false }));
  // Err loading (mis. fail 404) ditelan senyap - tiada console error.
  audioEl.addEventListener('error', () => emit({ playing: false }));

  return audioEl;
}

function trackFor(heroName: string): HeroAudioTrack | null {
  return findHeroAudioTrack(heroName);
}

/**
 * Pra-muat lagu hero.
 *
 * Dipanggil sebaik profil hero dibuka supaya bila gambar ditekan, lagu
 * mula serta-merta (tidak tunggu network). Tidak memain apa-apa.
 */
export function prepareHeroTrack(heroName: string): void {
  const track = trackFor(heroName);
  if (!track) return;

  const el = ensureElement();
  if (!el) return;

  const url = heroAudioUrl(track);
  if (el.getAttribute('src') === url) return;

  el.src = url;
  el.preload = 'auto';
  try {
    el.load();
  } catch {
    /* browser tidak suka `load()` - abaikan, `play()` akan cuba semula */
  }
}

/**
 * Mainkan lagu hero.
 *
 * PENTING: fungsi ini dipanggil terus dalam handler klik, jadi
 * `audio.play()` berada dalam user gesture (kepatuhan autoplay iOS Safari).
 * Promise `play()` yang ditolak ditelan senyap.
 */
export function playHeroTrack(heroName: string): boolean {
  const track = trackFor(heroName);
  if (!track) {
    // Hero tanpa lagu: senyap, tiada apa-apa berlaku.
    emit({ hasTrack: false });
    return false;
  }

  const el = ensureElement();
  if (!el) return false;

  if (activeHero !== heroName) {
    // Hero lain dibuka: hentikan lagu lama DULU, reset ke 0:00.
    stopHeroTrack({ immediate: true });
    activeHero = heroName;
    el.src = heroAudioUrl(track);
    try {
      el.load();
    } catch {
      /* abaikan */
    }
  }

  el.loop = true;
  el.volume = DEFAULT_VOLUME;

  try {
    const promise = el.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => {
        // Autoplay ditolak (atau fail rosak): senyap, tiada error di console.
        emit({ playing: false });
      });
    }
  } catch {
    emit({ playing: false });
  }

  emit({ hero: heroName, playing: true, hasTrack: true });
  return true;
}

/** Jeda / sambung lagu hero. */
export function toggleHeroTrack(heroName: string): boolean {
  const track = trackFor(heroName);
  if (!track) {
    emit({ hasTrack: false });
    return false;
  }

  const el = ensureElement();
  if (!el) return false;

  if (activeHero === heroName) {
    if (el.paused) {
      try {
        const promise = el.play();
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => emit({ playing: false }));
        }
      } catch {
        /* abaikan */
      }
      emit({ playing: true });
    } else {
      el.pause();
      emit({ playing: false });
    }
    return true;
  }

  return playHeroTrack(heroName);
}

/**
 * Hentikan lagu: fade-out ~200ms, kemudian reset ke 0:00.
 *
 * Dipanggil bila profil ditutup (X, backdrop, ESC, butang Kembali, swipe
 * turun) dan bila hero lain dibuka.
 */
export function stopHeroTrack(options: { immediate?: boolean } = {}): void {
  const el = audioEl;

  if (fadeFrame) {
    cancelAnimationFrame(fadeFrame);
    fadeFrame = 0;
  }

  activeHero = null;

  if (!el) {
    emit({ hero: null, playing: false, hasTrack: false });
    return;
  }

  const reset = (): void => {
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      /* abaikan - sesetengah engine tak boleh set currentTime sebelum load */
    }
    el.volume = DEFAULT_VOLUME;
    emit({ hero: null, playing: false, hasTrack: false });
  };

  if (options.immediate || el.paused || el.volume <= 0) {
    reset();
    return;
  }

  const from = el.volume;
  const started = performance.now();

  const step = (now: number): void => {
    const progress = Math.min(1, (now - started) / FADE_OUT_MS);
    el.volume = Math.max(0, from * (1 - progress));
    if (progress < 1) {
      fadeFrame = requestAnimationFrame(step);
    } else {
      fadeFrame = 0;
      reset();
    }
  };

  fadeFrame = requestAnimationFrame(step);
}

/** Hero yang sedang dimainkan (untuk UI). */
export function currentHeroTrack(): string | null {
  return activeHero;
}
