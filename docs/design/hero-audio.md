# Lagu Hero (hero audio)

Profil hero di Meta Center boleh memainkan lagu ("voice line") hero itu
apabila gambar hero ditekan. Fail audio diletakkan di `web/public/audio/PICS/`
dan dipetakan ke hero melalui satu fail konfigurasi.

## Susun atur

```text
web/public/audio/PICS/<folder>/<fail>.mp3
web/src/data/heroAudio.ts   <- pemetaan hero -> fail
web/src/lib/heroAudio.ts    <- manager Audio (singleton)
web/src/components/HeroProfileModal.tsx  <- profil + butang main
```

Kontrak folder (tidak boleh diubah):

- Nama folder ialah senarai hero (dipisah koma) yang memakai lagu dalam folder
  itu, contoh `Dori,hirara,zetian,fanny ,floryn`.
- Nama fail kekal seperti asal (ada ruang, underscore, nombor).
- Tiada fail digabung, dinamakan semula, atau dibuang.

## Cara tambah hero atau lagu baru

1. **Letakkan fail** `.mp3` ke dalam folder yang betul dalam
   `web/public/audio/PICS/`. Kalau folder baharu diperlukan, nama folder
   WAJIB senarai hero yang comma separated, contoh `Kagura,Chou`.
2. **Tambah entri** dalam `HERO_AUDIO_TRACKS` (`web/src/data/heroAudio.ts`):

   ```ts
   {
     folder: 'Kagura,Chou',
     file: 'Tik4Down_04_nama_fail.mp3',
     heroes: ['Kagura', 'Chou'],
   },
   ```

3. **Build** - `npm run build` dalam `web/`. Fail `public/` disalin terus ke
   `site/` tanpa perubahan nama.

Tidak perlu menyentuh mana-mana fail lain: `heroes` dengan sendirinya menjadi
kunci pencarian (case-insensitive + `trim`), jadi nama hero dalam config boleh
tak sama dengan ejaan di website dan ia tetap dipadankan.

### Kalau guna semula lagu yang sedia ada

Satu folder boleh melayani beberapa hero - cuma tambah nama hero ke
senarai `heroes` bagi folder tersebut. Contohnya untuk giving lagu folder
`Mathilda` kepada hero `Kagura`:

```ts
{
  folder: 'Mathilda',
  file: '336387.mp3',
  heroes: ['Mathilda', 'Kagura'],
}
```

## Bekal server

Aset audio dihantar oleh Cloudflare Workers Static Assets:

- `Content-Type: audio/mpeg` (ikut ekstensi fail).
- Sokong `Range` request (wajib untuk iOS Safari).
- `_headers` menetapkan `Cache-Control: public, max-age=31536000, immutable`
  untuk `/audio/*`.
- CSP menambah `media-src 'self'`.

## Nota mobile / iOS

- `audio.play()` dipanggil terus dalam handler klik - tiada `await`dahulu,
  jadi dasar autoplay browser (termasuk iOS Safari) dipatuhi.
- `Promise` yang ditolak ditelan senyap - tiada error di console.
- Sound hanya boleh bermula selepas interaksi pengguna (ketikan pada gambar
  hero), bukan automatik bila profil dibuka.
