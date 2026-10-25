# Meta Center v2 — assessment, arsitektur, dan rencana implementasi

Dokumen ini menjawab tiga hal: apa yang salah dengan arsitektur & pipeline data
sekarang, gimana bentuk yang disarankan, dan dengan urutan apa dikerjakan.

---

## 1. Technical assessment — kondisi sekarang

### 1.1 Arsitektur yang berjalan

```
                 cron 02:00 UTC
                      │
                      ▼
        ┌──────────────────────────────┐
        │  Cloudflare Worker            │
        │  fetch-upstream.ts            │  ← raw.githubusercontent.com/achedon12/mlbb
        │  normalize.ts                 │  ← 10 file JSON + 2 file .ts
        │        │                      │
        │        ▼                      │
        │  DatasetPayload (JSON)       │
        │        │                      │
        │        ▼                      │
        │  KV: mlbb:dataset:latest ────┼──► /api/dataset  (1.0 MB)
        │  KV: mlbb:meta:latest   ─────┼──► /api/meta
        └──────────────────────────────┘
                      │
        assets.directory = "./site" ──► SPA vanilla JS (2.731 baris)
                                          └─► fetch('/api/dataset') 1× full
```

### 1.2 Gap yang ditemukan (dengan bukti, bukan feeling)

| # | Gap | Dampak | Bukti |
|---|---|---|---|
| **G1** | **Win/pick/ban rate tidak pernah diisi.** `normalizeHeroStats()` membaca `rawHero.stats`, padahal di upstream itu blok **base stats** (`hp1`, `hp15`, `mana1`). Rate ada di `statistics.json → rankings.rates[hero]`, yang tidak pernah dibaca. | 134/134 hero punya `win_rate: null` di API produksi → situs menampilkan "-" untuk win rate, pick rate, ban rate. Strip "Avg win rate" dan "Most banned" jadi kosong. | `GET /api/dataset` produksi: `hero dengan win_rate: 0/134`. |
| **G2** | **Tidak ada versi snapshot.** KV cuma punya satu kunci `mlbb:dataset:latest` yang ditimpa tiap refresh. | Window 1d/7d/30d mustahil. Meta Movers mustahil. Tidak ada "data transparency" versi. | `worker/src/lib/store.ts` (sebelum v2). |
| **G3** | **Payload 1 MB untuk semua halaman.** Satu endpoint mengiri seluruh heroes + skills + counters + items + maps. | Grid daftar hero menarik 1 MB padahal butuh ~85 KB. Pambat di HP dan boros kuota. | `GET /api/dataset` = 1.007.769 byte. |
| **G4** | **Client-side SPA tanpa virtualisasi.** 134 kartu dirender semua. | Scroll lambat di HP; tidak ada code splitting; PWA/offline belum ada. | `site/assets/js/views/heroes.js` render grid penuh. |
| **G5** | **Tanpa service worker / manifest.** | Tidak bisa offline, tidak installable. | Tidak ada `sw.js` / `manifest.webmanifest` di `site/`. |
| **G6** | **Tanpa persistensi lokal.** | Favorit & catatan harus disimpan ulang tiap reload. | Tidak ada-state lokal di situs lama. |
| **G7** | **`counter_edges` tidak konsisten antar jalur.** Worker = 1.047 edge, snapshot statis = 1.166, dan yang benar menurut kontrak v1.7 = 1.563 (dengan `weak` + fallback `relations`). Worker cuma memakai sisi `strong`. | Sisi "hero yang mengalahkannya" kehilangan ~400 edge. | Perbandingan `statistics.json` vs output worker. |
| **G8** | **Tidak ada type safety di data layer.** `site/assets/js/data.js` manipulating `heroes[].counters` yangroduction sengaja dik损坏, lalu dibuang pakai log integritas. | Rapuh; setiap field baru butuh-edit manual di 3 tempat. | Komentar di `data.js` baris "counters_raw". |

### 1.3 Yang sudah benar dan harus dipertahankan

- **Worker + KV sudah benar** sebagai bentuk deploy: asset statis + API dari
  cache edge, cron harian, satuKV namespace. Ini fondasi yang bagus.
- **Normalisasi sudah rapi**: fungsi kecil, toleran, berbasis `asRecord`/`toNum`.
- **Kode produksi terverifikasi**: 133/133 tier & rate cocok dengan aturan
  upstream MLBBDex.
- **Ekosistem sumber terbuka**: `achedon12/mlbb` commit semua data ke GitHub,
  jadi tidak ada ketergantungan API berbayar.

---

## 2. Arsitektur & model data yang disarankan

### 2.1 Prinsip

1. **Data mentah ≠ metrik turunan.** `win_rate` adalah pengukuran sumber;
   `tierScore`, `trend`, `balance_rating` adalah hasil hitung. Yang turunan
   selalu bisa dihitung ulang, tidak pernah disimpan sebagai kebenaran.
2. **Satu sumber kebenaran untuk rumus.** `shared/tier.ts` dipakai worker dan
   web, jadi angka tier yang tampil di edge dan di client tidak mungkin beda.
3. **Snapshot immutable + pointer.** Setiap refresh menulis versi baru; yang
   lama tidak pernah ditulis ulang. Ini yang membuat delta dan window 1d/7d/30d
   mungkin terjadi.
4. **Payload sesuai layar.** Daftar hero ≠ detail hero ≠ item ≠ counter.
5. **Jujur soal gap.** Kalau tidak ada riwayat, API bilang `available: false`
   — bukan 404, bukan angka karangan.

### 2.2 Model data

```
Snapshot (immutable, 1 versi per refresh)
├── version            : ISO timestamp, jadi aman jadi kunci KV
├── measured_at_utc    : kapan rate diukur sumber (bukan kapan kita ambil)
├── stored_at          : kapan Worker menulisnya
└── payload
    ├── manifest
    │   ├── counts { heroes, rated_heroes, counter_edges, items, maps }
    │   ├── rates_summary            ← BARU: avg win rate, most banned, most picked
    │   ├── tier_derivation           ← ambang + bobot, supaya transparan
    │   ├── sources[]                 ← atribusi + lisensi
    │   └── warnings[]                ≤ 100 entri
    ├── heroes[]  →  HeroStats { win_rate, pick_rate, ban_rate, tier,
    │                              rank_scope, updated_at_utc, rates_by_rank }
    ├── counters.edges[]
    ├── items[]
    └── maps[]
```

`rates_summary` (dihitung di edge, dipakai situs):

| Field | Arti |
|---|---|
| `avg_win_rate` | rata-rata win rate seluruh hero ber-rate |
| `avg_win_rate_by_role` | rata-rata per role |
| `most_banned` / `most_picked` | `{id, name, value, win_rate}` |
| `highest_win_rate` / `lowest_win_rate` | `{id, name, value, win_rate}` |

### 2.3 Kunci KV

```
mlbb:snap:<version>   → StoredSnapshot      (immutable, retensi 45 versi ≈ 45 hari)
mlbb:snap:index       → SnapshotIndex        (daftar versi, terbaru di depan)
mlbb:dataset:latest   → pointer ke versi terkini (kompatibilitas)
mlbb:meta:latest      → RuntimeMeta
```

Retensi 45 versi cukup untuk window 30d + buffer, dan menjaga KV tetap kecil.

### 2.4 Endpoint

| Endpoint | Isi | Ukuran | Cache |
|---|---|---|---|
| `GET /api/heroes?rank=all` | daftar hero ramping + matrix `rates_by_rank` + manifest | 127 KB raw / **10 KB gzip** | SWR 5 menit |
| `GET /api/hero?id=<id>` | detail 1 hero (skill, matchup, item) | ~10 KB | SWR 5 menit |
| `GET /api/deltas?window=7d` | Meta Movers + delta per hero | 83 KB raw / ~9 KB gzip | SWR 5 menit |
| `GET /api/snapshots` | daftar versi | <1 KB | SWR 5 menit |
| `GET /api/meta` | status runtime | <1 KB | no-store |
| `GET /api/dataset` | dataset penuh (kompatibilitas) | 1.14 MB raw / 137 KB gzip | SWR 5 menit |

Cache-Control: `public, max-age=300, s-maxage=300, stale-while-revalidate=3600`.

### 2.4.1 Kenapa bracket rank dihitung ulang di client

`/api/heroes` mengirim **matrix `rates_by_rank`** untuk keenam bracket, bukan
cuma rate bracket aktif. Alasannya:

- Ganti rank jadi **instan** - tanpa request baru, tanpa grid flicker.
- Tetap jalan saat **offline** (data tersimpan di IndexedDB).
- Angka identik dengan edge, karena sama-sama memakai `shared/tier.ts`.

Server tetap menerima `?rank=epic|legend|mythic|honor|glory` untuk konsumen API
yang butuh langsung. Endpoint `?rank=all` yang dipakai web app.

### 2.5 Strategi delta

Worker menyimpan tiap versi. Saat `/api/deltas?window=Nd` dipanggil:

1. Ambil versi terbaru dari `mlbb:snap:index`.
2. Cari versi yang **paling dekat** dengan `now - N hari` (jarak absolut
   minimum) → `previous`.
3. Hitung delta per hero: `win_rate`, `pick_rate`, `ban_rate`, `tierScore`.
4. Klasifikasi `rising` / `falling` / `steady` / `new` dengan ambang
   (default 0.5 poin, bisa diubah dari UI).
5. Balas `available: false` kalau belum ada 2 versi.

**Aturanmain yang tidak boleh dilanggar:**

- **Versi snapshot = kapan kita menyimpan**, bukan kapan sumber mengukur.
  Kalau versinya ikut `measured_at_utc` upstream, semua refresh menimpa versi
  yang sama selama upstream tidak berubah - history tinggal satu, dan delta
  membandingkan snapshot dengan dirinya sendiri.
- **Snapshot terbaru tidak boleh jadi pembanding.** `from === to` menghasilkan
  delta nol yang palsu.
- **Lantai umur.** Kandidat untuk window 7d harus minimal 3.5 hari lama,
  supaya label "7d" tidak diam-dim menampilkan perubahan 1 hari. Kalau tidak
  ada yang cukup, jawab `available: false` + `oldest_available_days`.
- **`actual_days` + `approximate`** selalu ikut di jawaban, supaya UI bisa
  jujur menampilkan "vs 4 hari lalu" kalau snapshot yang dipakai bukan tepat
  7 hari.

Perhitungan di edge, bukan client: client menerima angka jadi, bukan dua
dataset penuh untuk dibandingkan sendiri.

### 2.6 Frontend

```
web/                       React 19 + TypeScript + Vite
├── src/
│   ├── data/
│   │   ├── client.ts      fetch + cache memori + IndexedDB + SWR
│   │   └── store.ts       Zustand (meta state + persist lokal)
│   ├── calc/
│   │   └── composition.ts Team Composition Analyzer (murni, tanpa I/O)
│   ├── components/        HeroGrid (virtualized), FilterPanel, StatStrip,
│   │                      MoversPanel, CompositionPanel, SourcesPanel,
│   │                      HeroDetailDrawer
│   └── App.tsx
├── shared/                tipe & rumus yang dipakai worker DAN web
└── public/                manifest.webmanifest, sw.js, dataset fallback
```

- **Virtualisasi**: `@tanstack/react-virtual`, baris = beberapa kartu, jumlah
  kolom dihitung dari lebar container. 134 hero → ~10 baris ter-render.
- **State**: Zustand. Dua store: `useMetaStore` (filter/sorting/tab, tidak
  dipersist) dan `useLocalStore` (favorit + catatan, dipersist ke
  localStorage).
- **Offline**: SW menyimpan respons `/api/*`; `fetchOfflineFirst()` jatuh ke
  IndexedDB kalau jaringan gagal, dan UI menampilkan banner "mode offline".
- **Code splitting**: `react` (69 KB gzip) / `app` (12 KB) / `virtual` (10 KB)
  dipisah; chunk hashed dan di-cache immutable.

---

## 3. Rencana implementasi bertahap

| Fase | Isi | Status |
|---|---|---|
| **F0 — P0: rate tidak tampil** | Baca `rankings.rates`, isi `win/pick/ban`, tier pakai aturan upstream, `rates_summary`, `rates_by_rank`. Test yang menjalankan normalizer sungguhan. | **Selesai** (commit `6b59c0c`) |
| **F1 — Data layer v2** | Snapshot immutable di KV + index + retensi. Endpoint `/api/heroes`, `/api/hero`, `/api/deltas`, `/api/snapshots`. Header SWR. | **Selesai** |
| **F2 — Frontend v2** | React 19 + TS + Vite, Zustand, grid virtual, filter rank/periode/role/lane/damage, 6 mode sorting, deteksi Rising/Falling. | **Selesai** |
| **F3 — FG4: composition + movers + PWA + persistensi** | Team Composition Analyzer, Meta Movers, service worker + manifest + offline, favorit & catatan lokal, panel transparansi data. | **Selesai** |
| **F4 — Menutup gap counter (G7)** | Worker pakai `weak[]` + fallback `relations` supaya `weak_against` lengkap dan konsisten dengan kontrak v1.7 (1.563 edge, bukan 1.047). | **Belum** |
| **F5 — Riwayat 30 hari** | Butuh ~30 refresh cron berjalan dulu. Setelah itu window 30d & perbandingan 7d-vs-30d otomatis aktif. | Menunggu waktu |
| **F6 — Lighthouse ≥ 90 (mobile)** | Audit di CI dengan Lighthouse CI; targetkan LCP < 2.0s dari cache SWR. | **Belum** |
| **F7 — Delta payload** | Kirim delta terikat bukan array penuh untuk `/api/deltas`. | **Belum** |

### Catatan urutan

F0 dulu karena tanpa itu semua angka di UI kosong dan mustahil dievaluasi.
F1 mendahului F2 karena frontend baru butuh endpoint ramping supaya payload
tidak naikWhile migrasi. F4 sengaja ditunda: memindahkan sisi `weak` mengubah
semua angka matchup, jadi harus lewat satu siklus review terpisah — bukan
disisipkan ke dalam fix P0.

---

## 3.5 Bug yang ditemukan saat verifikasi produksi (2026-10-25)

Deploy pertama di produksi memunculkan 4 bug yang lolos dari smoke test
lokal. Semuanya "diam-diam tidak jalan" - tidak ada error, cuma angka yang
salah. Nilainya penting buat dicatat:

| # | Bug | Gejala | Akar masalah |
|---|---|---|---|
| B1 | **Delta selalu nol** | `/api/deltas` menjawab `available: true` tapi semua delta 0 dan `from.version == to.version` | Versi snapshot diturunkan dari `measured_at_utc` **upstream**. Selama upstream tidak mengubah data, semua refresh menulis versi yang sama -> hanya 1 snapshot -> tidak ada yang bisa dibandingkan. |
| B2 | **Ambang default jadi 0** | Semua noise dianggap "rising" | `Number(url.searchParams.get('threshold'))` -> `Number(null)` = 0, dan `0` lolos `isFinite`. |
| B3 | **Snapshot terbaru jadi pembanding** | `findSnapshotForDaysAgo` mengembalikan `index.entries[0]` kalau itu satu-satunya | Tidak ada guard "butuh minimal 2 versi". |
| B4 | **Ringkasan salah label** | Strip "Ringkasan Patch" ditulis "Mythic" padahal angkanya scope "all" | `manifest.rates_summary` selalu scope "all", tapi UI men-label-nya dengan bracket yang dipilih. |

Perbaikan: versi snapshot jadi unik per penyimpanan, guard "minimal 2 versi",
parse threshold eksplisit, dan ringkasan dihitung ulang di client per bracket.

Yang bikin bug B1 lolos: smoke test lokal memakai `tools/dev-server.mjs` yang
selalu menjawab `available: false` - jadi jalur "history ada" sama sekali
nggak pernah dieksekusi. Sekarang ada `worker/tests/store.test.ts` yang
menguji logika snapshot pakai KV in-memory, plus smoke test yang memeriksa
bahwa `/api/heroes` benar-benar menyertakan `rates_by_rank`.

## 4. Cara menjalankan & deploy

```bash
# Worker (butuh kredensial Cloudflare)
cd worker && npm install && npm run deploy    # build web dulu, lalu wrangler deploy

# Test worker
cd worker && npm test                        # node --test + strip-types

# Typecheck + build web
cd web && npm install && npm run build        # output ke ../site/

# Dev lokal + mock API
node --experimental-strip-types --import ./worker/tests/register-ts.mjs \
     tools/dev-server.mjs 5173

# Smoke test browser
python3 tests/smoke_test_v2.py
```

### Refresh manual

Endpoint `POST /api/refresh` dilindungi header `X-Refresh-Token` yang nilainya
harus cocok dengan secret `MANUAL_REFRESH_TOKEN` di Worker. Tanpa header yang benar
situs membalas **401**. Secret-nya disimpan di secret store Mavis sebagai
`MLBB_MANUAL_REFRESH_TOKEN`.

```bash
curl -sk -X POST https://mlbb-data-workflow.mlvv.workers.dev/api/refresh \
  -H "X-Refresh-Token: $MLBB_MANUAL_REFRESH_TOKEN"
```

### Konfigurasi Cloudflare

| Setting | Nilai |
|---|---|
| Worker name | `mlbb-data-worker` |
| Entry point | `worker/src/index.ts` |
| Assets directory | `./site` (hasil build `web/`) |
| KV namespace | `MLBB_KV` → `b3d0ca5b38974afc92192873b81f23c3` |
| Cron | `0 2 * * *` (refresh harian 02:00 UTC) |
| Vars | `UPSTREAM_BASE_URL`, `CRON_HOUR_UTC=2`, `DATA_CACHE_SECONDS=300` |
