# MLBB Meta & Counter — Full Extraction V3

## Website

`site/` berisi laman web statik (Hero roster, Counter Lab, Items, Data & Sources)
yang membaca JSON di `site/dataset/` terus-terusan. Tiada build step, tiada
npm dependency — sesuai kontrak. Jalankan secara lokal:

```bash
cd site && python3 -m http.server 5173
```

Butiran seni bina, cara matchup dikira, dan senarai data rosak yang dikendalikan
oleh laman web: [`docs/design/website.md`](docs/design/website.md).

## Daily Auto Update (Cloudflare Worker + KV)

Aliran runtime baharu:

1. Cloudflare Cron Trigger memanggil `scheduled()` sekali sehari.
2. Worker ambil data terkini dari sumber MLBBDex mirror (`achedon12/mlbb`).
3. Worker normalisasi ke kontrak `manifest + heroes + counters + items + maps`.
4. Snapshot terkini disimpan di Cloudflare KV:
   - `mlbb:dataset:latest`
   - `mlbb:meta:latest`
5. Frontend baca data dari endpoint Worker:
   - `GET /api/dataset`
   - `GET /api/meta`

Metadata runtime yang disediakan API:
- `lastUpdated`
- `patch`
- `totalHeroes`
- `source`
- `nextUpdateAt`

### Struktur fail Worker

```text
worker/
  wrangler.toml
  package.json
  tsconfig.json
  .dev.vars.example
  src/
    index.ts
    types.ts
    lib/
      fetch-upstream.ts
      normalize.ts
      store.ts
      time.ts
```

### Setup tempatan

```bash
cd worker
pnpm install
cp .dev.vars.example .dev.vars
pnpm dev
```

Trigger cron secara lokal:

```bash
pnpm dev:cron
```

Trigger manual refresh:

```bash
curl -X POST "http://127.0.0.1:8787/api/refresh" -H "X-Refresh-Token: replace-with-local-token"
```

### Setup production (wrangler + dashboard)

1. Cipta KV namespace:
   - `wrangler kv namespace create MLBB_KV`
   - `wrangler kv namespace create MLBB_KV --preview`
2. Isikan `id` dan `preview_id` dalam `worker/wrangler.toml`.
3. Set secret token manual refresh (opsyenal):
   - `wrangler secret put MANUAL_REFRESH_TOKEN`
4. Deploy Worker:
   - `pnpm deploy`
5. Dashboard Cloudflare > Worker > Triggers:
   - pastikan cron `0 2 * * *` aktif (UTC).

## Profil Hero + Lagu Hero (v3)

Tekan nama hero (di senarai, jadual komposisi, meta movers, atau ringkasan
patch) untuk membuka profil: modal di desktop, bottom sheet di mobile.
Profil memaparkan gambar hero, nama, role, tier, dan win/pick/ban rate.

Tekan gambar hero dalam profil untuk:mainkan lagu hero tersebut (loop,
volume 0.7). Tekan sekali lagi untuk jeda/sambung. Penanda equalizer
muncul semasa lagu bermain. Menutup profil (X, backdrop, ESC, butang
Kembali, swipe turun) menghentikan lagu dengan fade-out ~200ms dan reset
ke 0:00.

Fail audio berada di `web/public/audio/PICS/` - nama folder dan fail dikekalkan
seperti asal (ada koma dan ruang, jadi URL di-encode). Pemetaan hero ke fail
ada dalam satu fail config: `web/src/data/heroAudio.ts`. Manager audio
(satu objek `Audio` global) ada di `web/src/lib/heroAudio.ts`.

Butiran cara tambah hero/lagu baharu: [`docs/design/hero-audio.md`](docs/design/hero-audio.md).

### Deploy

```bash
cd worker
npm install
npm run deploy      # predeploy: build web -> site/, kemudian wrangler deploy
```

Atau guna workflow `.github/workflows/deploy.yml` (perlu secret
`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).

## Frontend Status Bar (v2)

Status bar dipasang di atas hero roster (global di bawah topbar):

- `Live Data` + green pulsing dot
- `Updated X mins/hours ago`
- `Next update in Xh`

Fail berkaitan:
- `site/index.html`
- `site/assets/css/app.css`
- `site/assets/js/live-status.js`
- `site/assets/js/main.js`

Jika `/api/meta` gagal, UI jatuh balik ke `Offline fallback` dan laman masih guna data statik lokal.

## Apa yang disertakan sekarang

- `extract_mlbb_data.py`: collector yang menyimpan HTML asal, jadual yang berjaya diparse, indeks halaman kejohanan, fail manifest, log sumber dan hash SHA-256.
- `data/`: snapshot pro hero global, MSC 2026 dan subset MPL Malaysia S18 yang telah tersedia dalam V2.
- `templates/`: struktur CSV untuk matriks semua hero mengikut musim dan rekod draft per game.
- `.github/workflows/extract.yml`: workflow manual GitHub Actions supaya koleksi boleh dijalankan dalam persekitaran berinternet.
- Laporan Word dan slaid PowerPoint yang menerangkan skop, sumber, aliran ekstraksi dan batasan.

## Tentang syarat 100 MiB

Collector menyemak saiz sebenar hasil ekstraksi melalui `--min-output-mb 100`. Ia cuba mengumpul halaman pro, halaman kejohanan dan repositori rujukan yang mengandungi JSON/aset. Jika hasil sumber sebenar masih kurang daripada 100 MiB, ia melaporkannya sebagai gagal mencapai saiz — **tiada fail kosong, bytes rawak, data pendua atau rekod perlawanan rekaan ditambah**.

## Status build ini

Persekitaran penyediaan pakej ini tidak mempunyai capaian DNS/HTTP terus ke sumber luar. Oleh itu, ZIP yang diberikan ialah **kit ekstraksi dengan snapshot permulaan**, bukan dakwaan bahawa ekstrak sejarah penuh >100 MiB sudah berjaya dijalankan. Jalankan workflow atau skrip dalam persekitaran yang ada internet untuk menghasilkan folder dataset sebenar. Jangan tandakan semua musim sebagai lengkap tanpa memeriksa `source_fetch_log.csv` dan `extraction_report.json`.

## Sumber utama

- MLBBDex esports: https://mlbbdex.com/en/esports
- MLBBDex MSC 2026: https://mlbbdex.com/en/esports/msc-2026
- MLBB Analytics: https://www.mlbbanalytics.com/heroes dan https://www.mlbbanalytics.com/esports
- MLBBHub MPL MY: https://mlbbhub.com/mpl/my/stats
- Historical scrape/analysis repository: https://github.com/LiTianYeoh/MLBB_Tournament_Analysis
- Reference game data and image assets (MIT stated in repository README): https://github.com/Ceplin03/database-mlbb.Mobile-Legends-Bang-Bang

Baca `source_attribution.md` untuk attribution dan batasan lesen.
