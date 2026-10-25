# Meta Center — frontend v2

React 19 + TypeScript + Vite. Build output ditulis ke `../site` (folder yang
di-serve Cloudflare Worker lewat `assets.directory`).

```bash
npm install
npm run dev      # dev server Vite, proxy /api -> Worker produksi
npm run build    # typecheck + build ke ../site
npm run typecheck
```

## Struktur

```
src/
  App.tsx                 shell, tab, pemuatan data, routing (hash)
  main.tsx                entry + registrasi service worker
  styles.css              mobile-first, dark theme
  data/
    client.ts             fetch + cache memori + IndexedDB + stale-while-revalidate
    store.ts              Zustand: state meta + state persisten (favorit, catatan)
  calc/
    composition.ts        Team Composition Analyzer (murni, tanpa I/O)
  components/
    HeroGrid.tsx          grid virtual (TanStack Virtual)
    HeroCard.tsx          kartu hero
    FilterPanel.tsx       filter rank / periode / role / lane / damage / sorting
    StatStrip.tsx         rata-rata win rate, hero paling di-ban & di-pick
    MoversPanel.tsx       Meta Movers (risers / fallers)
    CompositionPanel.tsx  analyzer komposisi tim + catatan lokal
    SourcesPanel.tsx      transparansi data: versi snapshot, sumber, warning
    HeroDetailDrawer.tsx  detail hero (dimuat terpisah)
  lib/format.ts           format id-ID
```

## Kontrak dengan Worker

| Endpoint | Dipakai oleh |
|---|---|
| `GET /api/heroes?rank=all` | grid daftar hero (indeks ramping, ~85 KB) |
| `GET /api/hero?id=<id>` | drawer detail hero |
| `GET /api/deltas?window=7d` | Meta Movers + badge Rising/Falling |
| `GET /api/snapshots` | daftar versi snapshot (tab transparansi) |
| `GET /api/meta` | status runtime |

Kalau jaringan gagal, `fetchOfflineFirst()` jatuh ke snapshot terakhir di
IndexedDB dan UI menampilkan banner "mode offline".

## Aturan main

- **Tidak ada data hero yang di-hardcode.** Semuanya lewat `fetch()`.
- **Rumus tier tidak ditulis ulang.** `shared/tier.ts` dipakai worker dan web.
- **Tidak ada request ke host eksternal** selain Worker sendiri; gambar hero
  diambil dari `raw.githubusercontent.com` (diizinkan CSP `img-src`).
- **Bundle dijaga kecil**: chunk react / app / virtual dipisah, aset hashed +
  immutable.
