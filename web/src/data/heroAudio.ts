/**
 * Konfigurasi lagu hero.
 *
 *_FAIL audio live di `web/public/audio/PICS/`. Nama folder dan nama fail
 * TIDAK boleh diubah - folder itu ikut di-commit sebagai aset statik dan
 * dipanggil dari URL.
 *
 * Aturan pemetaan:
 *   - Nama folder = senarai hero (dipisah koma) yang memakai lagu di folder
 *     itu, jadi satu folder bisa melayani beberapa hero.
 *   - Pencocokan nama hero: case-insensitive + buang ruang lebihan di tepi
 *     (contoh folder "Dori,hirara,zetian,fanny ,floryn" punya "fanny " dengan
 *     satu ruang trailing - tetap cocok dengan hero "Fanny").
 *
 * CARA TAMBAH HERO ATAU LAGU BARU:
 *   1. Letakkan fail .mp3 ke dalam folder yang betul di `web/public/audio/PICS/`.
 *      Kalau butuh folder baharu, nama folder WAJIB senarai hero yang comma
 *      separated, contoh: `Kagura,Chou`.
 *   2. Tambah satu entri di `HERO_AUDIO_TRACKS` dengan `folder`, `file`, dan
 *      senarai `heroes`.
 *   3. Kalau nama folder mengandungi hero yang tidak/DC, senaraikan hero itu
 *      dalam `heroes` - senarai itu yang menentukan hero mana yang boleh
 *      menekan gambar.
 *
 * Tiada fail perlu digabung, dinamakan semula, atau dibuang.
 */

export interface HeroAudioTrack {
  /** Nama folder persis di dalam `/audio/PICS`. Jangan diubah. */
  folder: string;
  /** Nama fail persis di dalam folder. Jangan diubah. */
  file: string;
  /** Hero yang memakai lagu ini. Dicocokkan case-insensitive + trim. */
  heroes: string[];
}

/** Lokasi asas aset audio (ikut `web/public/audio`). */
export const HERO_AUDIO_BASE = '/audio/PICS';

export const HERO_AUDIO_TRACKS: readonly HeroAudioTrack[] = [
  {
    folder: 'Bruno,nolan,Fredrinn,aamon,brody',
    file: 'Tik4Down_01_emergency_-_breakbeat_breakbeat.mp3',
    heroes: ['Bruno', 'Nolan', 'Fredrinn', 'Aamon', 'Brody'],
  },
  {
    folder: 'Camila,hanabi,alice,edith',
    file: 'Tik4Down_02_fanny_skin_aspirant_kau_pikir_hidup_ini_cuma_makan_batu_danc.mp3',
    // "Camila" ikut nama folder asal (tidak diubah). Tiada hero bernama
    // "Camila" dalam dataset - hero yang dimaksudkan ialah "Carmilla", jadi
    // nama itu ditambah sebagai alias supaya lagu boleh dimainkan.
    heroes: ['Camila', 'Carmilla', 'Hanabi', 'Alice', 'Edith'],
  },
  {
    folder: 'Dori,hirara,zetian,fanny ,floryn',
    file: 'Tik4Down_03_pinjem_helm_yah_riri_jipon.mp3',
    heroes: ['Dori', 'Hirara', 'Zetian', 'Fanny', 'Floryn'],
  },
  {
    folder: 'Mathilda',
    file: '336387.mp3',
    heroes: ['Mathilda'],
  },
  {
    folder: 'Miya,layla',
    file: '336388.mp3',
    heroes: ['Miya', 'Layla'],
  },
  {
    folder: 'Vexana,Valentina',
    file: '336390.mp3',
    heroes: ['Vexana', 'Valentina'],
  },
];

/** Normalisasi nama hero: buang ruang tepi, rapatkan ruang dalam, lowercase. */
export function normalizeHeroName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * URL aset untuk satu track.
 *
 * Folder dan nama fail mengandungi koma dan ruang, jadi setiap segmen
 * di-encode (`%2C` untuk koma, `%20` untuk ruang). Pelayan decode balik
 * kepada nama fail asal.
 */
export function heroAudioUrl(track: HeroAudioTrack): string {
  return `${HERO_AUDIO_BASE}/${encodeURIComponent(track.folder)}/${encodeURIComponent(track.file)}`;
}

const TRACK_BY_HERO: Map<string, HeroAudioTrack> = (() => {
  const map = new Map<string, HeroAudioTrack>();
  for (const track of HERO_AUDIO_TRACKS) {
    for (const hero of track.heroes) {
      const key = normalizeHeroName(hero);
      if (!map.has(key)) map.set(key, track);
    }
  }
  return map;
})();

/** Track lagu untuk satu hero, atau null kalau hero itu tiada lagu. */
export function findHeroAudioTrack(heroName: string): HeroAudioTrack | null {
  if (!heroName) return null;
  return TRACK_BY_HERO.get(normalizeHeroName(heroName)) ?? null;
}

/** Semua nama hero yang ada lagunya (untuk laporan / UI). */
export const HERO_AUDIO_HERO_NAMES: readonly string[] = HERO_AUDIO_TRACKS.flatMap(
  (track) => track.heroes
);
