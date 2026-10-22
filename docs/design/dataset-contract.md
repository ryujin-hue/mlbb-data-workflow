# Kontrak Dataset — MLBB Meta Center

Status: **FROZEN** (v1.1). Track collector DAN track website wajib mengikuti file ini persis.
Kalau ada yang perlu berubah, usulkan lewat owner (bukan diedit sepihak oleh worker).

> **v1.1 (2026-10-22)** — tambahan field opsional (`title`, `damage_type`, `attack_type`,
> `resource`, `region`, `ratings`, `base_stats`, `skills[].id`) + `maps[].points` berisi
> koordinat. Semua **opsional/nullable**, jadi sample yang sudah dibuat sebelum v1.1
> tetap valid.

## Kenapa kontrak ini ada

Dua track bekerja paralel tanpa boleh saling menunggu:
- Track **collector** mengisi file JSON di `site/dataset/`.
- Track **website** consuming file JSON itu sebagai data runtime.

Kalau bentuk datanya beda, situsnya bakal kosong atau crash. Jadi bentuknya dikunci di sini.

## Sumber data primer (TEMUAN PENTING — pakai ini)

Repo `achedon12/mlbb` (branch `develop`) adalah **source code website MLBBDex**, dan
file datanya di-commit ke GitHub. Artinya kita **tidak perlu** bergantung ke API live
untuk dataset inti. Sumber primer (semua JSON, di `raw.githubusercontent.com`):

| Data | File | Isi |
|---|---|---|
| Roster hero | `src/data/game/heroes.json` | slug, name, title, roles, lanes, specialties, release, resource, damageType, attackType, region, ratings, stats |
| Skill | `src/data/game/skills.json` | 134 hero × 4 skill: `name` + `description` penuh |
| Counter + synergy | `src/data/game/statistics.json` | `counters` (133 hero, per rank: `strong`/`weak` + `advantage` + `winRate`), `teammates`, `relations` (`strongAgainst`/`weakAgainst`/`synergies`), `rankings.measuredAt` |
| Map | `src/lib/game-map.ts` | `MAP_POINTS`: koordinat x/y (0-100) tiap objek + `source` ke halaman wiki |
| Objective/timer | `src/lib/objectives.ts` | durasi spawn tiap objective, tiap nilai disitat ke halaman wiki |
| Item | `src/app/api/v1/items/route.ts` + data | |
| Gambar | `public/visuels/heros/<slug>/portrait.webp` | |

Base URL: `https://raw.githubusercontent.com/achedon12/mlbb/develop/<path>`

**API live `https://mlbbdex.com/api/v1/heroes/{slug}`** = convenience layer di atas
data yang sama. Bentuk response-nya sudah diketahui persis dari route handler-nya
(`src/app/api/v1/heroes/[slug]/route.ts`): `slug, name, title, roles, lanes,
specialties, release, resource, damageType, attackType, region, ratings, stats,
skills[], skins[], images, illustrations, analysis`. Pakai live API hanya sebagai
**refresh opsional di CI**, bukan sumber wajib. Semua yang inti HARUS bisa dibangun
dari GitHub-hosted JSON saja, supaya bisa diuji di mana saja.


## Konvensi

- Direktori dataset: **`site/dataset/`** (di dalam folder `site/` — ikut ter-deploy ke
  Cloudflare Pages tanpa build step). TIDAK ada duplikat di root repo.

  **Kenapa di dalam `site/`, bukan di root?** Cloudflare Pages hanya meng-upload isi
  build output directory; isi root repo lain tidak ikut serve. Opsi lain yang ditolak:
  symlink (Cloudflare asset walker melompati symlink -> 404 diam-diam di produksi),
  build step `cp` (dilarang: build command harus kosong), dan duplikasi + CI sync gate
  (dua sumber kebenaran -> bisa drift). Satu direktori = satu sumber kebenaran.
- Format: JSON UTF-8, `ensure_ascii=false`, indent 2.
- Semua path gambar itu **URL absolut** (https://...), bukan path lokal. Situsnya bakal jalan
  di browser user, jadi file lokal ga bisa dipakai.
- Hero diidentifikasi dengan `id` = slug ASCII lowercase, misal `alucard`, `chang-e`, `yi-shin`.
  `id` ini yang dipakai sebagai kunci relasi (counter, synergy, map, dsb).
- Timestamp selalu ISO-8601 UTC, format `2026-10-22T04:12:33Z`.
- Nilai yang tidak diketahui = `null`, bukan string kosong dan bukan `[]` menipu.
  Array kosong artinya "sumbernya memang bilang tidak ada".

## File 1 — `site/dataset/manifest.json`

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

## File 2 — `site/dataset/heroes.json`

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
      "title": "Chosen of the Raven",
      "damage_type": "Physical",
      "attack_type": "Melee",
      "resource": "Mana",
      "region": "Moniyan Empire",
      "ratings": { "offense": 7, "durability": 3, "ability_effect": 1, "difficulty": 6 },
      "base_stats": { "hp1": 2614, "hp15": 4742, "mana1": 500, "mana15": 1900 },
      "skills": [
        {
          "id": "alucard-s1",
          "name": "Spear of Death",
          "type": "active",
          "description": "Alucard throws his spear forward...",
          "cooldown": null,
          "mana_cost": null,
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
| `title` | string\|null | tidak | julukan hero |
| `damage_type` | string\|null | tidak | `Physical` / `Magic` / `True` |
| `attack_type` | string\|null | tidak | `Melee` / `Ranged` |
| `resource` | string\|null | tidak | `Mana` / `Energy` |
| `region` | string\|null | tidak | asal/region hero |
| `ratings` | object\|null | tidak | `{offense, durability, ability_effect, difficulty}` int |
| `base_stats` | object\|null | tidak | `{hp1, hp15, mana1, mana15, ...}` |
| `skills` | object[] | ya | **minimal 1** (passive pun dihitung). Urutan: passive, skill1, skill2, ultimate |
| `skills[].type` | string | ya | `passive` \| `active` |
| `skills[].cooldown` | string\|null | ya (boleh null) | sumber utama **tidak** menyediakan angka cooldown terpisah → `null` |
| `skills[].mana_cost` | string\|null | ya (boleh null) | idem → `null` |
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

## Pemetaan field sumber -> kontrak (WAJIB DIPAKAI, bukan diterjemahkan sendiri)

Sumber: `src/data/game/heroes.json` (per hero) dan `src/data/game/skills.json` (per hero).

| Field di sumber | -> Field di kontrak | Tipe | Catatan |
|---|---|---|---|
| `slug` | `id` | string | ambil dari sumber apa adanya, JANGAN slugify ulang. Sudah ASCII lowercase. |
| `name` | `name` | string | |
| `title` | `title` | string | julukan |
| `roles` | `roles` | string[] | |
| `lanes` | `lanes` | string[] | |
| `specialties` | `speciality` | string[] | ejaan berubah (`specialties` -> `speciality`) |
| `year` | `release_year` | int | sumbernya `year` = "2021" (string) -> jadi int |
| `release` | (tidak dipakai, atau `release_date`) | string | tanggal lengkap "19 March 2021" |
| `resource` | `resource` | string | "Mana" / "Energy" / "None" |
| `damageType` | `damage_type` | string | |
| `attackType` | `attack_type` | string | |
| `region` | `region` | string | |
| `ratings.offense` | `ratings.offense` | int | sumber sudah int |
| `ratings.durability` | `ratings.durability` | int | |
| `ratings.abilityEffects` | `ratings.ability_effect` | int | **nama field berubah** |
| `ratings.difficulty` | `difficulty` | int | jadi langsung ke field top-level `difficulty` (1-10) |
| `stats.hp1`,`stats.hp15`,`stats.mana1`,`stats.mana15`, dst. | `base_stats.*` | **number** | sumbernya **STRING** ("2550") -> WAJIB dikonversi ke number |
| `skills[i].name` | `skills[i].name` | string | |
| `skills[i].description` | `skills[i].description` | string | teks dari wiki, boleh ada artefak kalimat terpotong — JANGAN diperbaiki/diedit, teruskan apa adanya |

### Aturan skill (WAJIB dibaca, ini yang paling sering bikin bug)

Jumlah skill per hero **TIDAK selalu 4**. Distribusi real di sumber:
`4` skill untuk 111 hero, `5` untuk 8 hero, `6` untuk 1, `8` untuk 10, lalu `10`, `12`, `15`,
dan `20` (Beatrix = 4 stance x 5 skill). Jadi:

- `skills` berisi **SELURUH** skill hero, urut sesuai sumber. Jangan dipotong ke 4.
- `skills[i].id` = `<slug>-s<index>` dengan index mulai dari 0. Wajib **unik per hero**.
  (Beatrix punya nama skill yang sama berulang — makanya ID berbasis index, bukan nama.)
- `skills[i].type`: `"passive"` untuk index 0, `"active"` untuk index >= 1. Sumber tidak
  memberi label tipe, jadi ini konvensi kita — truthfully, index 0 memang passive.
- `skills[i].label` (opsional): `"Passive"` / `"Skill 1"` / `"Skill 2"` / `"Ultimate"`
  **hanya kalau** hero-nya punya tepat 4 skill. Kalau lebih dari 4, `label` = `null` dan
  website harus menampilkan label generik ("Skill N") — bukan mengarang "Ultimate" untuk
  skill ke-4 dan seterusnya.
- Website WAJIB merender jumlah skill yang variabel. Jangan asumsikan 4.

### URL gambar (WAJIB — ada jebakan path yang bikin 100% gambar skill rusak)

Base: `https://raw.githubusercontent.com/achedon12/mlbb/develop/public/`

| Jenis | Path |
|---|---|
| Portrait hero | `visuels/heros/<slug>/portrait.webp` |
| Ikon skill | `visuels/competences/<skill-slug>.webp` |

Contoh:
`https://raw.githubusercontent.com/achedon12/mlbb/develop/public/visuels/heros/alucard/portrait.webp`
`https://raw.githubusercontent.com/achedon12/mlbb/develop/public/visuels/competences/tai-chi.webp`

**JEBEKAN:** path-nya `public/visuels/competences/` — **BUKAN** `public/visuels/visuels/competences/`.
Repo itu TIDAK punya folder `visuels/visuels` sama sekali, jadi URL yang salah itu **404 untuk
semua ikon skill** (portrait tetap aman karena path-nya beda). Sudah diverifikasi: 572 URL
ikon skill dengan path yang benar -> **572/572 HTTP 200**.

`<skill-slug>` = nama skill di-slugify: lowercase, karakter non-alnum jadi hyphen, hyphen
dobel dirapikan, hyphen di awal/akhir dibuang. Contoh: "Tai Chi" -> `tai-chi`,
"Invisible Armor" -> `invisible-armor`.

Tambahan: `heroes[].resource` bisa bernilai string `"None"` (21 hero yang nggak punya
mana/energy). Itu nilai asli dari sumber, BUKAN placeholder. Website boleh tampilkan sebagai
"—" atau "Tanpa resource", tapi jangan dianggap data hilang.

### Hero tanpa data counter

`Dori` ada di `heroes.json` tapi **tidak ada** di `statistics.json`. Untuk hero seperti
ini: `counters` = `[]`, `weak_against` = `[]`, `synergies` = `[]`, dan **WAJIB** catat di
`manifest.warnings` (nama hero-nya). Jangan isi dengan tebakan, jangan skip hero-nya.

## File 3 — `site/dataset/maps.json`

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
      ],
      "points": [
        { "key": "turtle", "group": "objective", "x": 29, "y": 29,
          "side": "shared", "source": "https://mobilelegends.fandom.com/wiki/Turtle" },
        { "key": "purple-buff", "group": "buff", "x": 20, "y": 56,
          "side": "ours", "source": "https://mobilelegends.fandom.com/wiki/Thunder_Fenrir" }
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
- `points` (opsional tapi sangat berguna untuk peta interaktif): koordinat pada
  **bujur sangkar 100×100, y ke bawah**, basis tim sendiri di kiri bawah.
  `group` ∈ `objective` | `buff` | `camp` | `terrain` | `lane`.
  `side` ∈ `ours` | `theirs` | `shared`.
  `source` = URL halaman wiki yang jadi dasar koordinat (wajib, biar data bisa
  diaudit). Sumber: `src/lib/game-map.ts` di repo `achedon12/mlbb`.

## File 4 — `site/dataset/counters.json`

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

### Sumber counter yang sudah diverifikasi (JAWABAN ORIENTASI)

Sumber utama: `src/data/game/statistics.json` di repo `achedon12/mlbb`:

```json
"counters": {
  "aamon": {
    "all": {
      "strong": [ { "slug": "cici", "advantage": 4.1 } ],
      "weak":   [ { "slug": "gloo", "advantage": -4.5 } ],
      "winRate": 50
    },
    "epic": { ... }
  }
}
```

**Orientasi sudah pasti, bukan tebakan** — dibuktikan dari kode sumbernya
(`src/lib/data.ts`: "Measured counters, taken from the game's win rates" dan
`src/lib/counters.ts`: "average gap, in points, over those ranks (from the page
hero's point of view)"):

| Nilai sumber | Arti | Masuk ke |
|---|---|---|
| `strong[].advantage` POSITIF | hero ini MENANG lawan slug itu | `heroes[hero].counters` + edge `from=hero, to=slug` |
| `weak[].advantage` NEGATIF | hero ini KALAH dari slug itu | `heroes[hero].weak_against` |

Tidak boleh dibalik. Kalau sebuah sumber cuma nyediain satu sisi, isi sisi itu saja
dan catat di `manifest.warnings`.

`statistics.json` juga punya `relations` dengan key persis
`strongAgainst` / `weakAgainst` / `synergies` (satu array slug per hero) — ini yang
dipakai untuk isi `counters` / `weak_against` / `synergies` di `heroes.json`.
`statistics.json` -> `teammates` memberi synergy DENGAN angka advantage per rank,
lebih baik daripada `relations.synergies` yang cuma daftar slug.
`statistics.json` -> `rankings.measuredAt` = kapan data diukur — pakai buat
`manifest.generated_at_utc` dan `heroes[].stats.updated_at_utc`.

Tambahan: kalau sumber menyediakan "advantage" dalam poin (misal +4.1 / -4.5),
simpan angka aslinya per edge di `counters.json` sebagai `advantage_points`, dan
`strength` dinormalisasi ke 0..1 dengan cara yang bisa dibalik.

## File 5 — `site/dataset/items.json` (opsional, boleh kosong/null)

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
  buang semuanya gara-gara satu sumber mati.

## Cara website consuming kontrak ini

Website **hanya** baca file di `site/dataset/` lewat `fetch()`. Website tidak boleh scraping
sendiri, tidak boleh punya data hero hardcoded, dan tidak boleh bergantung pada file
di luar `site/dataset/`. Kalau website butuh field baru, field itu harus masuk kontrak dulu.

## Cloudflare Pages

- Build command: **kosong** (tidak ada build step).
- Output directory: `site`
- Tidak ada dependency npm. Kalau suatu saat butuh dependency, kontraknya harus diubah dulu.
