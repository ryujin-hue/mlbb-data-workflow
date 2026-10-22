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
