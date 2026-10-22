# Cara menjalankan extractor di Android

Pakej ini ialah kit untuk mengumpul dataset dari sumber web awam. Ia belum mengandungi ekstrak sejarah penuh 100 MiB; ekstrak sebenar perlu dijalankan dalam persekitaran yang boleh mencapai sumber-sumber internet tersebut.

## Pilihan A — GitHub Actions (lebih sesuai untuk telefon)

1. Buat repositori GitHub baharu dan muat naik kandungan folder pakej ini ke repositori tersebut. Pastikan folder `.github/workflows/` turut dimuat naik.
2. Buka tab **Actions** pada repositori.
3. Pilih workflow **MLBB Full Public Data Extraction**.
4. Tekan **Run workflow**. Tetapkan `max_tournament_pages` kepada `400`, `minimum_mib` kepada `100`, dan biarkan `skip_assets` pada `false` jika mahu memasukkan aset rujukan.
5. Apabila selesai, buka run itu dan muat turun artifact bernama `MLBB_FULL_DATASET_V3`.
6. Jika sumber tidak dapat diakses atau data sebenar kurang daripada 100 MiB, artifact/log akan menunjukkan status itu. Workflow tidak menambah data rekaan.

Nota: GitHub Actions tertakluk pada had kuota akaun, had artifak, terma sumber, serta perubahan struktur laman web. Workflow manual mungkin mengambil masa yang lama.

## Pilihan B — Termux

1. Pasang Python melalui Termux.
2. Ekstrak folder pakej ini ke storan yang boleh dibaca oleh Termux.
3. Jalankan `bash run_termux.sh` dari direktori pakej.
4. Hasil akan disimpan dalam `MLBB_DATASET_OUTPUT/`. Jika saiz sebenar kurang daripada 100 MiB, skrip akan melaporkan sasaran tidak tercapai dan tidak mereka-reka bytes.

## Fail penting

- `extract_mlbb_data.py` — pengumpul laman, jadual HTML dan repositori rujukan.
- `data/` — snapshot statistik yang sudah disediakan dalam V2, dengan sumber dan tarikh.
- `templates/` — skema untuk matriks hero ikut musim MPL dan data draft per game.
- `extraction_report.json` — ringkasan liputan, saiz, dan batasan selepas run.
- `source_fetch_log.csv` — rekod URL, status HTTP, saiz dan hash fail.

**Had liputan:** laman awam tidak semestinya menyediakan rekod setiap game dan draft untuk setiap musim. Jangan anggap dataset lengkap hanya kerana fail besar atau senarai kejohanan panjang.
