<div align="center">

<img src="assets/logo-mlbb-a.svg" alt="MLBB Almanac" width="380" />

# MLBB Data Workflow

**The live half of [MLBB Almanac](https://github.com/ryujin-hue/mlbb-almanac).**

[![Live](https://img.shields.io/badge/live-mlbb--almanac.pages.dev-00E5FF)](https://mlbb-almanac.pages.dev)
[![Worker](https://img.shields.io/badge/worker-mlbb--data--workflow.mlvv.workers.dev-F5C518)](https://mlbb-data-workflow.mlvv.workers.dev)

</div>

---

> **This repository is now `live/` inside the
> [mlbb-almanac](https://github.com/ryujin-hue/mlbb-almanac) monorepo.**
> That repository is the source of truth: it carries this tree under `live/`,
> adds the archive layer, and runs the deploys.
>
> The deploy workflows here are **disabled** so an old push cannot overwrite
> the live site. `QA Site` and `QA Production` still run against the live
> deployment, and the archive updater still keeps its datasets fresh.
>
> **Work on the site happens in the monorepo:**
> <https://github.com/ryujin-hue/mlbb-almanac>

## What this is

A Cloudflare Worker that fetches and normalises Mobile Legends: Bang Bang
data once a day, stores each snapshot in KV, and serves it to a React front
end — plus a Pages deployment that puts the static site in front of it.

```
MLBBDex mirror ──> Worker (KV, cron 02:00 UTC) ──> Pages Functions ──> Browser
                                     └──> /api/* and /audio/*
```

| Piece | Path | Role |
|---|---|---|
| Worker | `worker/` | Cron trigger, upstream fetch, normaliser, KV store, API |
| Web app | `web/` | React + Vite front end, six tabs |
| Pages | `pages/` | Static hosting + Functions that proxy `/api/*` and `/audio/*` |
| Dev tools | `tools/` | `dev-server.mjs` (mock API), `build_archive.py` |
| Tests | `tests/` | `smoke_test_v2.py` (88 checks), `production_check.py` (29 checks) |

Detailed architecture notes live in [`docs/design/website.md`](docs/design/website.md).
The Indonesian walkthrough of the extraction and worker internals is in
[`README_ML.md`](README_ML.md).

## The API

| Endpoint | Returns |
|---|---|
| `GET /api/heroes?rank=all\|epic\|legend\|mythic\|honor\|glory` | 133 heroes with rates, tier and per-rank breakdown |
| `GET /api/hero?id=<heroId>` | one hero in full: stats, skills, ratings, rates by rank |
| `GET /api/meta` | refresh status, patch, counts, next update time |
| `GET /api/snapshots` | every stored snapshot version |
| `GET /api/deltas?window=1d\|7d\|30d` | movers and trend per hero |
| `GET /api/refresh` | trigger a refresh by hand |

```bash
curl https://mlbb-data-workflow.mlvv.workers.dev/api/meta
curl "https://mlbb-data-workflow.mlvv.workers.dev/api/heroes?rank=mythic"
```

## Local development

```bash
cd worker && npm install && npm test      # unit tests against the real normaliser
cd ../web && npm install && npm run build # -> site/
cd .. && node --experimental-strip-types --import ./worker/tests/register-ts.mjs \
    tools/dev-server.mjs 5178             # site + a mock of the Worker API
```

Checks:

```bash
python3 tests/smoke_test_v2.py                                        # 88 checks in a real browser
QA_BASE=https://mlbb-data-workflow.mlvv.workers.dev \
    python3 tests/production_check.py                                 # 29 checks against the live site
```

## Deploy

Deploys run from the monorepo (`ryujin-hue/mlbb-almanac`) because the site
now includes the archive layer, which is built from `archive/` in that same
repository. To deploy from there:

```bash
gh workflow run deploy.yml       --repo ryujin-hue/mlbb-almanac
gh workflow run deploy-pages.yml --repo ryujin-hue/mlbb-almanac
```

Both need the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
The token needs `Cloudflare Pages: Edit`, `Workers Scripts: Edit`,
`Workers KV Storage: Edit` and `Account Settings: Read`.

## Notes

- `site/` is a build artifact and is not committed.
- The Worker serves `/audio/*` itself so hero music answers `206` with a
  `Content-Range` header — Safari and iOS need Range support for media.
- The front end recomputes bracket rates locally, so switching rank never
  refetches and the grid never flickers.
- Data from the [MLBBDex mirror](https://github.com/achedon12/mlbb)
  (CC BY-SA 4.0 via Mobile Legends Wiki). Not affiliated with Moonton.
