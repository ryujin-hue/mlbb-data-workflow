# Kontrak Dataset — MLBB Meta Center

Status: **FROZEN** (v1.10). Track collector DAN track website wajib mengikuti file ini persis.
Kalau ada yang perlu berubah, usulkan lewat owner (bukan diedit sepihak oleh worker).

> **v1.10 (2026-10-25)** — edge counter sekarang **wajib** punya field `rank`
> (rank sumber: `all`/`epic`/... atau `relations`). Edge fallback dari
> `relations` wajib dibedakan `strongAgainst` vs `weakAgainst` sesuai field
> yang benar-benar menghasilkan edge itu — label sumber yang tidak akurat
> melanggar aturan "label sumber harus akurat".
>
> **Kenapa v1.10:** dua-dua sisi `counters` (`strong` **dan** `weak`) harus
> dibangun. Sisi `weak` berisi hero yang **kalah** dari hero itu, jadi
> edge-nya dibalik: edge `(target, hero)`. Membaca `weak` sebagai
> `strong` akan reverses seluruh arah matchup.
>
> **v1.9 (2026-10-23)** — `heroes[].stats` **wajib terisi** untuk hero yang punya
> ranking: `win_rate`, `pick_rate`, `ban_rate`, `rank_scope`, `updated_at_utc`,
> `tier`, dan `rates_by_rank` (6 bracket rank). `tier` dihitung dari `tierScore`
> (lihat "Aturan tier"). Tambah `manifest.rates_summary` dan `manifest.counts.rated_heroes`.
>
> **Kenapa v1.9:** di versi sebelumnya `stats` dibiarkan kosong sehingga situs
> menampilkan "-" untuk win rate, pick rate, dan ban rate. Datanya sebenarnya
> ADA di sumber (`statistics.json` -> `rankings.rates[hero]`), cuma tidak pernah
> dibaca. Field `stats` pada roster upstream berisi BASE stats (hp1, hp15, ...),
> bukan rate - membaca `heroes[].stats` untuk rate selalu menghasilkan null.
>
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
| Item | `src/data/game/items.json` | 102 item: slug, name, summary, category, price, bonus, unique, passive, active, recipe[], bestFor |
| Skin | `src/data/game/skins.json` + `src/data/game/visuals.json` | 133 hero, 1056 skin: id, name, release, availability, rarity, label, price{bp,ticket,dm} |
| Visual | `src/data/game/visuals.json` | `heroes{slug}.{portrait,icon,skins}`, `illustrations{hero}{skinName}`, `skills{hero}{skillName}`, `items`, `emblems`, `talents`, `spells` |
| Freshness | `src/data/game/sync.json` | `{date, source, heroes, skins, items, patches, rankings, counters, builds, sources[]}` |

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
      "icon_url": "https://.../alucard/icone.webp",
      "illustration_url": "https://.../alucard/illustrations/duke-of-shards.webp",
      "skins": [
        { "id": "1091", "name": "Duke of Shards", "url": "https://.../skins/1091-duke-of-shards.webp",
          "illustration_url": "https://.../illustrations/duke-of-shards.webp",
          "release": "2021", "rarity": "Epic", "price": { "bp": 1200, "dm": null } }
      ],
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
| `icon_url` | string\|null | tidak | ikon kotak kecil, dari `visuals.json` `heroes[].icon` |
| `illustration_url` | string\|null | tidak | splash art, dari `visuals.json` `illustrations[hero]` |
| `skins` | object\|null | tidak | array skin; **boleh null** kalau sumber tidak menyediakan |
| `skins[].id` | string | ya (kalau `skins` ada) | id skin dari sumber |
| `skins[].name` | string | ya | |
| `skins[].url` | string\|null | ya | URL absolut |
| `skins[].illustration_url` | string\|null | ya | |
| `skins[].release` | string\|null | ya | tahun rilis |
| `skins[].rarity` | string\|null | ya | `null` kalau-common/unknown |
| `skins[].price` | object\|null | ya | `{bp, dm, ticket}` — nilai boleh null |
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
| `stats` | object\|null | ya | **wajib terisi** untuk hero yang punya ranking; `null` hanya kalau sumber memang tidak punya (harus dilaporkan di `manifest.warnings`) |
| `stats.win_rate` | float\|null | ya (kalau `stats` ada) | persen, dari `rankings.rates[hero].winRate` |
| `stats.pick_rate` | float\|null | ya (kalau `stats` ada) | persen, dari `rankings.rates[hero].pickRate` |
| `stats.ban_rate` | float\|null | ya (kalau `stats` ada) | persen, dari `rankings.rates[hero].banRate` |
| `stats.tier` | string\|null | ya (kalau `stats` ada) | hasil hitung `tierScore` (lihat "Aturan tier") |
| `stats.rank_scope` | string | ya (kalau `stats` ada) | `all` untuk bracket utama |
| `stats.updated_at_utc` | string | ya (kalau `stats` ada) | `rankings.measuredAt` |
| `stats.rates_by_rank` | object\|null | ya (kalau `stats` ada) | rate + tier untuk 6 bracket rank |

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

### Aturan tier (WAJIB, v1.9)

Sumber **tidak menyediakan tier**. Tier dihitung dari `tierScore`:

```
tierScore = (winRate - 50) + pickRate * weightP + banRate * weightB
```

`winRate`/`pickRate`/`banRate` dalam **persen** (61.03 = 61.03%). Bentuk
`(winRate - 0.5) * 100` pada brief adalah hal yang sama dengan winRate
dinar-normalisasi ke fraksi 0..1, jadi keduanya setara setelah satuan diseragamkan.

Default `weightP = 0`, `weightB = 0.25` -> `tierScore = winRate + banRate * 0.25 - 50`.
Ambang tier:

| Tier | tierScore minimum | (padanan aturan MLBBDex) |
|---|---|---|
| `S+` | 6 | 56 |
| `S` | 3 | 53 |
| `A` | 0.5 | 50.5 |
| `B` | -2 | 48 |
| `C` | -Infinity | -Infinity |

Nilai default + ambang ini **persis** aturan tier list MLBBDex sendiri
(`src/lib/tier-list.ts` di repo upstream), yang diuji cocok untuk 133/133 hero
yang punya rate. `weightP = 0` karena pick rate mengukur popularitas, bukan
kekuatan - argumen yang sama dipakai upstream.

Fungsi ini tinggal di satu file yang dipakai worker dan web:
`shared/tier.ts` (`tierScore`, `tierFromScore`, `WEIGHTS`).

### `heroes[].stats.rates_by_rank` (WAJIB, v1.9)

Rate per bracket rank, untuk filter rank di situs:

```json
"rates_by_rank": {
  "all":    { "win_rate": 48.5,  "pick_rate": 0.75, "ban_rate": 0.47, "tier": "B" },
  "epic":   { "win_rate": 48.93, "pick_rate": 0.91, "ban_rate": 1.2,  "tier": "B" },
  "legend": { "win_rate": 48.79, "pick_rate": 0.96, "ban_rate": 0.67, "tier": "B" },
  "mythic": { "win_rate": 48.46, "pick_rate": 0.88, "ban_rate": 0.49, "tier": "B" },
  "honor":  { "win_rate": 47.93, "pick_rate": 0.62, "ban_rate": 0.23, "tier": "C" },
  "glory":  { "win_rate": 48.26, "pick_rate": 0.45, "ban_rate": 0.12, "tier": "B" }
}
```

Tier di dalam `rates_by_rank` dihitung dari rate bracket itu, bukan disalin
dari bracket `all` - seorang hero bisa S di Mythic dan cuma A di semua rank.

### Batas jumlah warning di `manifest.warnings` (WAJIB)

`manifest.warnings` akan ditampilkan di website. Isinya harus **ringkas dan bermakna**, bukan
dump semua anomali. Batas keras: **maksimal 100 entri**.

Aturan:
- **WAJIB masuk** (semuanya, mengurutkan prioritas):
  - `counter-conflict: <from> vs <to> (...)` — dua sumber Measured-vs-list berbeda arah.
  - `counter-relations-contradictory: <from> vs <to> (...)` — sumbernya sendiri bertentangan antar rank.
  - `counter-ambiguous: <from> vs <to> (...)` — advantage seri, pasangan dibuang.
  - `hero-no-counter-data: <id>` — hero tanpa matchup sama sekali (mis. `dori`).
  - `source-failed: <name> (...)` — sumber yang gagal diambil.
  - `data-incomplete: <field> (<n> heroes) (...)` — ringkasan cakupan per field.
- **TIDAK** masuk per-pasangan: `counter-gap-relations-only` dan `counter-gap-counters-only`.
  Itu cuma catatan cakupan, bukan masalah. Masukkan **satu baris ringkasan** per kategori:
  `counter-gap-relations-only: 466 pairs measured-source silent (see dataset/counters.json)`.

Detail lengkap per-pasangan (jika perlu) tetap boleh ada di file terpisah, misal
`site/dataset/counter-notes.json` — bukan di `manifest.warnings`.

### Koherensi arah: ATURAN WAJIB (satu pasangan maksimal satu arah)

`statistics.json` punya 6 rank per hero: `all`, `epic`, `legend`, `mythic`, `honor`, `glory`.
Tiap rank punya `strong[]` (6 entri) dan `weak[]` (6 entri) — jadi **relasi bisa BERBEDA antar
rank**. Contoh nyata: di rank `all` `lolita` kalah dari `zhuxin`, tapi di rank lain `lolita` menang.

Kalau semua rank di-union-mentah, hasilnya **kontradiktif**: ada pasangan hero yang saling
menyatakan "aku ngalahin kamu" (22 pasangan), dan 28 pasangan di mana satu sisi bilang
"aku ngalahin X" sementara sisi lain bilang "X ngalahin aku". Data kontradiktif kayak gini
bakal tampil di website sebagai klaim yang saling bertentangan — dan itu reputationally fatal
buat situs yang tujuannya jadi rujukan meta.

**Aturan (WAJIB, collector yang implementasikan):**

1. **Bangun graf dari satu rank Canonical dulu:** `all`. Untuk hero TIDAK ada di `all`,
   ambil dari rank berikutnya, dengan urutan prioritas:
   `all` -> `epic` -> `legend` -> `mythic` -> `honor` -> `glory`.
   (Rank yang dipakai WAJIB dicatat di `counters.json` per edge, misal
   `"source": "MLBBDex statistics.json counters.all.strong"`.)
2. **Enforce mutual exclusivity.** Untuk setiap pasangan tak-terurut {a, b}, maksimal SATU
   arah yang boleh ada:
   - Kalau hanya satu rank yang punya klaim -> pakai klaim itu.
   - Kalau dua rank punya klaim BERLAWANAN (a menang b di rank X, b menang a di rank Y):
     **yang menang = yang punya `|advantage|` lebih besar.** Drop yang kalah.
   - Kalau `|advantage|` SAMA PERSIS -> **drop keduanya** (ambigu) dan catat warning:
     `counter-ambiguous: <a> vs <b> (rank X says a wins +N, rank Y says b wins +N)`.
3. **`weak_against[h]` TIDAK boleh diisi terpisah dari `counters`.** Define:
   `weak_against[h] = { t : ada edge t -> h }`. Jadi sisi terbalik otomatis konsisten
   dengan sisi depan, secara definisi.
4. Setelah semua itu, invariant yang WAJIB berlaku (dan diuji verifier):
   - Tidak ada pasangan {a,b} dengan `b ∈ counters[a]` DAN `a ∈ counters[b]`.
   - Tidak ada pasangan {a,b} dengan `b ∈ counters[a]` DAN `a ∈ weak_against[b]`.
   - `a ∈ weak_against[b]`  <=>  `b ∈ counters[a]` (setara perfect).

### Prioritas sumber counter (WAJIB, sudah diverifikasi owner)

Ada DUA sumber counter di `statistics.json`, dan **keduanya tidak selalu sama**:

| Sumber | Sifat | Dipakai untuk |
|---|---|---|
| `counters[hero][rank].strong[] / .weak[]` | **Terukur** dari win rate game, ada `advantage` per rank, ada `winRate` | **PRIMARY** |
| `relations[hero].strongAgainst / .weakAgainst` | List flat, **tanpa angka, tanpa rank, tanpa tanggal** | **FALLBACK** saja |

Owner sudah mengukur konsistensinya: dari 63 pasangan yang bisa dibandingkan,
**52 cocok (82,5%)** dan **11 berlawanan arah** (contoh: `lukas` vs `fanny`,
`floryn` vs `lolita`, `gloo` vs `lesley`).

**Aturan:**
1. `heroes[].counters` dan `heroes[].weak_against` **WAJIB** dibangun dari `counters[]`
   (source primer) — dengan advantage dari rank `all` kalau ada, atau rank terdekat.
2. `relations[]` hanya dipakai untuk **mengisi hero/sisi yang `counters[]` tidak punya**,
   DAN hanya kalau sisi itu **tidak ada** di `counters[]` untuk hero tersebut sama sekali.
3. Kalau `relations` dan `counters` **berlawanan** untuk satu pasangan: `counters` yang
   menang, dan perbedaan itu **WAJIB dicatat** di `manifest.warnings` dengan format
   `counter-conflict: <from> vs <to> (relations says X, counters says Y)`.
4. Edge di `counters.json` yang berasal dari `relations` (tanpa angka) **wajib** punya
   `source` yang menyebut asal Specifically, contoh:
   `"source": "MLBBDex statistics.json relations.strongAgainst"`.
  _label sumber harus **akurat** — field ini ditampilkan di website.

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
- `rank` (WAJIB, v1.10) = rank sumber yang dipakai edge ini: `all`, `epic`,
  `legend`, `mythic`, `honor`, `glory`, atau `relations` untuk edge fallback.
- Edge **dari `counters`** punya `advantage_points` (angka mentah dari sumber,
  bisa negatif kalau asalnya dari sisi `weak`) dan `strength` =
  `clamp(|advantage| / 10, 0, 1)`.
- Edge **dari `relations`** punya `advantage_points: null` dan `strength: null`.
- `source` wajib menyebut field yang benar-benar menghasilkan edge:
  `MLBBDex statistics.json counters.all.strong`,
  `MLBBDex statistics.json counters.all.weak`,
  `MLBBDex statistics.json relations.strongAgainst`, atau
  `MLBBDex statistics.json relations.weakAgainst`.
- Wajib konsisten dengan `heroes.json`: kalau edge `(from,to)` ada, maka `to` harus ada di
  `heroes[from].counters` DAN `from` harus ada di `heroes[to].weak_against`.
- Edge tidak boleh duplikat: satu pasangan hanya boleh punya SATU arah dan
  hanya boleh muncul SATU kali.

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
lebih baik daripada `relations.synergies` yang cuma daftar slug. **Keduanya
WAJIB dipakai** (union): `relations.synergies` cuma ~278 entri, `teammates`
nambah ~2.198, total ~2.476 per dataset.
`statistics.json` -> `rankings.measuredAt` = kapan data diukur — pakai buat
`manifest.generated_at_utc` dan `heroes[].stats.updated_at_utc`.

Tambahan: kalau sumber menyediakan "advantage" dalam poin (misal +4.1 / -4.5),
simpan angka aslinya per edge di `counters.json` sebagai `advantage_points`, dan
`strength` dinormalisasi ke 0..1 dengan cara yang bisa dibalik.

## File 5 — `site/dataset/items.json` (opsional, boleh kosong/null)

```json
{ "items": [
  { "id": "antique-cuirass", "name": "Antique Cuirass",
    "summary": "Physical Attack Reduction", "category": "Defense",
    "price": 2170, "bonus": "+920 HP, +40 Physical Defense, +4 HP Regen",
    "unique": null, "passive": "Deter: ...", "active": null,
    "recipe": ["Dreadnaught Armor", "Ares Belt"],
    "best_for": "All heroes", "icon_url": "https://..." }
] }
```

Sumber: `src/data/game/items.json` (102 item, sudah terverifikasi 200 + isinya nyata).
Mapping: `slug`->`id`, `bestFor`->`best_for`, sisanya nama field sama.

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
10. **Rate wajib ada (v1.9):** hero yang punya ranking harus punya `stats.win_rate`,
    `stats.pick_rate`, dan `stats.ban_rate` ketiganya non-null. Hero yang tidak punya
    harus dilaporkan di `manifest.warnings` (kategori `data-incomplete`).
11. **`manifest.rates_summary` wajib ada**, `avg_win_rate` tidak null kalau ada hero
    ber-rate, dan `most_banned`/`most_picked` harus menunjuk hero yang benar-benar
    ada di `heroes.json`.
12. **`manifest.warnings` <= 100 entri**, kategori yang diizinkan saja.
13. **Koherensi arah (v1.7):** tidak boleh ada pasangan `{a, b}` dengan `b` di
    `counters[a]` **dan** `a` di `counters[b]`; dan untuk semua a, b:
    `a` ada di `weak_against[b]` **iff** `b` ada di `counters[a]`.

## Cara website consuming kontrak ini

Website **hanya** baca file di `site/dataset/` lewat `fetch()`. Website tidak boleh scraping
sendiri, tidak boleh punya data hero hardcoded, dan tidak boleh bergantung pada file
di luar `site/dataset/`. Kalau website butuh field baru, field itu harus masuk kontrak dulu.

## Cloudflare Pages

- Build command: **kosong** (tidak ada build step).
- Output directory: `site`
- Tidak ada dependency npm. Kalau suatu saat butuh dependency, kontraknya harus diubah dulu.
