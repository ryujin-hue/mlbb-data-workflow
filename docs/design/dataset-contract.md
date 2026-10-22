# Kontrak Dataset — MLBB Meta Center

Status: **FROZEN**. Track collector DAN track website wajib mengikuti file ini persis.
Kalau ada yang perlu berubah, usulkan lewat owner (bukan diedit sepihak oleh worker).

## Kenapa kontrak ini ada

Dua track bekerja paralel tanpa boleh saling menunggu:
- Track **collector** mengisi file JSON di `dataset/`.
- Track **website**WOR consuming file JSON itu sebagai data runtime.

Kalau bentuk datanya beda, situsnya bakal kosong atau crash. Jadi bentuknya dikunci di sini.

## Konvensi

- Direktori dataset: `dataset/` (di root repo).
- Format: JSON UTF-8, `ensure_ascii=false`, indent 2.
- Semua path gambar itu **URL absolut** (https://...), bukan path lokal. Situsnya bakal jalan
  di browser user, jadi file lokal ga bisa dipakai.
- Hero diidentifikasi dengan `id` = slug ASCII lowercase, misal `alucard`, `chang-e`, `yi-shin`.
  `id` ini yang dipakai sebagai kunci relasi (counter, synergy, map, dsb).
- Timestamp selalu ISO-8601 UTC, format `2026-10-22T04:12:33Z`.
- Nilai yang tidak diketahui = `null`, bukan string kosong dan bukan `[]` menipu.
  Array kosong artinya "sumbernya memang bilang tidak ada".

## File 1 — `dataset/manifest.json`

```json
{
  "schema_version": "1.0.0",
  "generated_at_utc": "2026-10-22T04:12:33Z",
  "game_patch": "2.2.16",
  "counts": { "heroes": 134, "maps": 3, "counter_edges": 812, "items": 0 },
  "sources": [
    {
      "name": "MLBBDex Public API",
      "url": "https://mlbbdex.com/en/api-doc",
      "license": "CC BY-SA 4.0 (Mobile Legends Wiki)",
      "retrieved_at_utc": "2026-10-22T04:10:00Z",
      "records": 134,
      "status": "ok"
    }
  ],
  "warnings": []
}
```

`counts.heroes` WAJIB = jumlah entri di `heroes.json`. Selisih apa pun = bug.

## File 2 — `dataset/heroes.json`

```json
{
  "heroes": [
    {
      "id": "alucard",
      "name": "Alucard",
      "roles": ["Fighter", "Assassin"],
      "lanes": ["Jungle", "Exp"],
      "speciality": ["Burst", "DPS"],
      "difficulty": 2,
      "release_year": 2020,
      "price": 0,
      "portrait_url": "https://.../alucard.png",
      "skills": [
        {
          "id": "alucard-s1",
          "name": "Spear of Death",
          "type": "active",
          "description": "Alucard throws his spear forward...",
          "cooldown": "8s",
          "mana_cost": "40",
          "icon_url": "https://.../alucard-s1.png"
        }
      ],
      "counters": ["baxia", "hylos"],
      "weak_against": ["esmeralda"],
      "synergies": ["cyclops"],
      "stats": {
        "tier": "S+",
        "win_rate": 53.6,
        "pick_rate": 0.9,
        "ban_rate": 43.9,
        "rank_scope": "All",
        "updated_at_utc": "2026-10-22T04:10:00Z"
      }
    }
  ]
}
```

Aturan field:

| Field | Tipe | Wajib | Arti |
|---|---|---|---|
| `id` | string | ya | slug ASCII lowercase, unik, stabil |
| `name` | string | ya | nama heroofficial |
| `roles` | string[] | ya | subset dari `Tank, Fighter, Assassin, Mage, Marksman, Support` |
| `lanes` | string[] | ya | subset dari `Gold, Jungle, Mid, Exp, Roam` |
| `speciality` | string[] | ya | boleh kosong |
| `difficulty` | int 1-10 | ya | 1 = paling gampang |
| `release_year` | int | ya | |
| `price` | int | ya | diamond |
| `portrait_url` | string\|null | ya | URL absolut |
| `skills` | object[] | ya | **minimal 1** (passive pun dihitung). Urutan: passive, skill1, skill2, ultimate |
| `skills[].type` | string | ya | `passive` \| `active` |
| `counters` | string[] | ya | hero yang **meng countered** hero ini (hero ini kalah)?. PENTING: lihat catatan di bawah |
| `weak_against` | string[] | ya | hero yang **mengalahkan** hero ini |
| `synergies` | string[] | ya | hero yang ber-synergy |
| `stats` | object\|null | ya | boleh `null` kalau sumber tidak menyediakan |

**Catatan semantik `counters` vs `weak_against` (WAJIB dipatuhi, ini sumber miskonsepsi paling sering):**

- `weak_against` = hero yang **berhasil mengalahkan** hero ini. Kalau hero ini adalah
  Alucard dan Esmeralda ada di `weak_against` Alucard, artinya Alucard kalah lawan Esmeralda.
- `counters` = hero yang bisa dikalahkan oleh hero ini. Kalau Alucard ada di `counters` Esmeralda,
  Alucard menang lawan Esmeralda.

Kalau sumber hanya memberi satu sisi (misal mlbb.io cuma nyediain `counters` satu arah),
isi `weak_against` = `[]` **dan catat di `manifest.warnings`** — jangan mengarang sisi
yang hilang, dan jangan membalik artinya.

Semua isi array `counters` / `weak_against` / `synergies` harus berupa `id` hero yang
**ada di `heroes.json`**. Relasi ke hero yang tidak ada = buang + catat warning.

## File 3 — `dataset/maps.json`

```json
{
  "maps": [
    {
      "id": "land-of-dawn",
      "name": "Land of Dawn",
      "mode": "Classic",
      "image_url": "https://.../land-of-dawn.jpg",
      "description": "Map klasik dengan tiga lane...",
      "lanes": ["Gold", "Mid", "Exp", "Jungle", "Roam"],
      "objectives": [
        { "id": "turtle", "name": "Turtle", "zone": "Bottom River",
          "description": "Memberi tim creepJr gratis" }
      ],
      "zones": [
        { "id": "red-base", "name": "Red Base", "type": "base",
          "description": "Markas tim merah" }
      ]
    }
  ]
}
```

Aturan:
- `mode` = `Classic` | `Brawl` | `Other`.
- `lanes` subset dari `Gold, Mid, Exp, Jungle, Roam`.
- `objectives[].id` dan `zones[].id` slug unik **per map**.
- Minimal harus ada map mode `Classic` (Land of Dawn) dan deskripsi zona/tujuan utama.

## File 4 — `dataset/counters.json`

```json
{
  "edges": [
    { "from": "alucard", "to": "baxia", "relation": "counters",
      "strength": 0.62, "source": "MLBBDex" }
  ],
  "generated_at_utc": "2026-10-22T04:12:33Z"
}
```

- `relation` cuma boleh `"counters"`. Sisi yang terbalik (hero ini kalah) **tidak** disimpan
  di sini — sudah tercermin di `heroes[].weak_against`.
- `strength` float 0..1, boleh `null` kalau sumber ga nyediain angka.
- `from` = hero yang menang, `to` = hero yang kalah.
- Wajib konsisten dengan `heroes.json`: kalau edge `(from,to)` ada, maka `to` harus ada di
  `heroes[from].counters` DAN `from` harus ada di `heroes[to].weak_against`.

## File 5 — `dataset/items.json` (opsional, boleh kosong/null)

```json
{ "items": [ { "id": "blade-of-despise", "name": "Blade of Despise",
    "price": 2120, "type": "Physical Attack", "icon_url": "https://..." } ] }
```

Kalau sumber item tidak bisa diakses, `{"items": []}` **plus** entry di `manifest.warnings`.
Jangan pernah isi item palsu.

## Aturan quality gate (dipakai verifier)

1. Semua 5 file ada dan valid JSON.
2. `heroes.json` berisi **>= 120** hero (game saat ini ~134).
3. Setiap hero punya `>= 1` skill; skill punya `name` non-kosong.
4. Tidak ada `id` duplikat di `heroes.json`; tidak ada `id` hero yang muncul di relasi tapi
   absen dari `heroes.json`.
5. Semua `portrait_url` / `icon_url` yang non-null itu URL absolut (`http://` atau `https://`).
6. `manifest.counts.heroes` == jumlah hero di `heroes.json`.
7. Tidak ada string yang berisi `null`, `undefined`, `NaN`, atau `TODO` di dalam data.
8. Tidak ada file > 25 MB (biar repo & Pages tetap ringan).
9. Kalau satu sumber gagal: `manifest.sources[].status` = `"failed"` + pesan, dan
   `manifest.warnings` menjelaskan dampaknya. **Data yang ada tetap dipakai** — jangan
  丢弃 semuanya gara-gara satu sumber mati.

## Cara website consuming kontrak ini

Website **hanya** baca file di `dataset/` lewat `fetch()`. Website tidak boleh scraping
sendiri, tidak boleh punya data hero hardcoded, dan tidak boleh bergantung pada file
di luar `dataset/`. Kalau website butuh field baru, field itu harus masuk kontrak dulu.

## Cloudflare Pages

- Build command: **kosong** (tidak ada build step).
- Output directory: `site`
- Tidak ada dependency npm. Kalau suatu saat butuh dependency, kontraknya harus diubah dulu.
