#!/usr/bin/env python3
"""Smoke test Meta Center v2 di browser sungguhan.

Menjalankan build `site/` lewat mock Worker API (`tools/dev-server.mjs`),
lalu memeriksa:
  - semua status 200, tanpa console error
  - win/pick/ban rate TERISI (bukan "-") untuk hampir semua hero
  - rata-rata win rate & hero paling di-ban tampil
  - filter rank / pencarian / sorting bekerja
  - drawer detail hero termuat
  - analyzer komposisi tim menghitung skor
  - manifest PWA + service worker terdaftar
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = int(__import__("os").environ.get("QA_PORT", "5178"))
BASE = f"http://127.0.0.1:{PORT}"
CHROME = "/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome"

checks: list[tuple[str, bool, str]] = []


def ck(name: str, ok: bool, detail: str = "") -> None:
    checks.append((name, bool(ok), detail))


def main() -> int:
    server = subprocess.Popen(
        [
            "node",
            "--experimental-strip-types",
            "--import",
            "./worker/tests/register-ts.mjs",
            "tools/dev-server.mjs",
            str(PORT),
        ],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    # Pre-warm: endpoint /api/heroes menarik upstream ~3 MB, jadi tunggu
    # sampai jawab dulu sebelum browser mulai (networkidle tidak akan tercapai
    # selama itu).
    import urllib.request

    for _ in range(60):
        try:
            with urllib.request.urlopen(f"{BASE}/api/heroes?rank=all", timeout=30) as resp:
                if resp.status == 200:
                    break
        except Exception:
            time.sleep(1)
    else:
        print("dev server tidak siap", file=sys.stderr)

    failures: list[str] = []
    try:
        with sync_playwright() as pw:
            launch_kwargs = {"args": ["--no-sandbox", "--disable-dev-shm-usage"]}
            if Path(CHROME).exists():
                launch_kwargs["executable_path"] = CHROME
            browser = pw.chromium.launch(**launch_kwargs)
            ctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                ignore_https_errors=True,
                service_workers="allow",
            )

            # ------------------------------------------------ landing / grid
            page = ctx.new_page()
            errors: list[str] = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(f"PAGEERROR {e}"))

            resp = page.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector(".hcard", timeout=45000)
            page.wait_for_timeout(1200)
            body = page.inner_text("body")
            low = body.lower()

            ck("landing status 200", resp is not None and resp.status == 200)
            ck("tanpa console error", not errors, str(errors[:2]))

            ck("judul aplikasi tampil", "MetaCenter" in page.title() or "Meta Center" in page.title())
            ck("strip Ringkasan Patch tampil", "Ringkasan Patch" in body)
            ck("label 'Rata-rata Win Rate' tampil", "rata-rata win rate" in low)
            ck("nilai avg win rate tampil (bukan —)", "50,0%" in body, body[:0])
            ck("label 'Paling Banyak di-Ban' tampil", "paling banyak di-ban" in low)
            ck("hero paling di-ban tampil", "Hirara" in body)
            ck("label 'Paling Banyak di-Pick' tampil", "paling banyak di-pick" in low)
            ck("rata-rata win rate per role tampil", "rata-rata win rate per role" in low)

            # Kartu hero harus punya angka rate.
            cards = page.query_selector_all(".hcard")
            ck("grid merender kartu hero", len(cards) > 0, str(len(cards)))
            first_card = page.query_selector(".hcard")
            card_text = first_card.inner_text() if first_card else ""
            ck("kartu memuat WR/PR/BR", "WR" in card_text and "PR" in card_text and "BR" in card_text, card_text[:120])
            ck("kartu bukan menampilkan — untuk rate", "—" not in card_text, card_text[:120])

            # Regresi: di desktop, tinggi baris virtualizer dikunci sehingga
            # BR/PR sempat tertimpa baris berikutnya dan hilang dari kartu.
            # Kalau tinggi baris diukur dinamis, ketiga metrik selalu tampil.
            ck(
                "ketiga metrik punya nilai di kartu pertama",
                len([x for x in card_text.split("\n") if "%" in x]) == 3,
                card_text[:120],
            )

            # Tidak boleh ada scroll di dalam scroll: panel grid harus
            # mengikuti scroll halaman.
            nested = page.evaluate(
                "() => { const g = document.querySelector('.vgrid');"
                " if (!g) return 'tidak ada .vgrid';"
                " const s = getComputedStyle(g);"
                " return s.overflowY + '/' + s.overflowX; }"
            )
            ck(
                "tidak ada panel scroll di dalam halaman",
                nested in ("visible/visible", "visible/hidden"),
                str(nested),
            )

            # Cek banyak hero: rate harus terisi di semua kartu yang ter-render.
            empties = [c.inner_text() for c in page.query_selector_all(".hcard") if "—" in c.inner_text()]
            ck("tidak ada kartu dengan rate kosong", len(empties) == 0, f"{len(empties)} kartu kosong")

            # ------------------------------------------------ filter pencarian
            page.fill("input[type='search']", "alucard")
            page.wait_for_timeout(600)
            filtered = page.query_selector_all(".hcard")
            ck("pencarian menyaring grid", len(filtered) == 1, f"{len(filtered)} kartu")
            page.fill("input[type='search']", "")
            page.wait_for_timeout(500)

            # ------------------------------------------------ filter rank
            def grid_text() -> str:
                return " ".join(c.inner_text() for c in page.query_selector_all(".hcard"))

            def first_card_numbers() -> list[str]:
                card = page.query_selector(".hcard")
                if not card:
                    return []
                return [x for x in card.inner_text().split("\n") if "%" in x]

            def stat_avg() -> str:
                panel = page.query_selector(".statgrid")
                text = panel.inner_text() if panel else ""
                for line in text.split("\n"):
                    if "%" in line:
                        return line.strip()
                return ""

            # Re-query tiap kali: React membuat ulang node <select> saat re-render.
            rank_select = page.query_selector_all("select")[0]
            rank_select.select_option("all")
            page.wait_for_timeout(1200)
            all_numbers = first_card_numbers()
            all_avg = stat_avg()

            # Hitung request ke /api/heroes supaya kita bisa membuktikan ganti
            # rank TIDAK memaksa fetch baru (perhitungan bracket di client).
            hero_requests = []
            page.on(
                "request",
                lambda req: hero_requests.append(req.url)
                if "/api/heroes" in req.url
                else None,
            )

            page.query_selector_all("select")[0].select_option("mythic")
            page.wait_for_timeout(1200)

            myth_numbers = first_card_numbers()
            myth_avg = stat_avg()
            ck(
                "filter rank mengubah angka rate (bukan cuma label)",
                bool(all_numbers) and bool(myth_numbers) and all_numbers != myth_numbers,
                f"all={all_numbers} mythic={myth_numbers}",
            )
            ck(
                "ringkasan ikut mengikuti bracket rank",
                bool(all_avg) and bool(myth_avg) and all_avg != myth_avg,
                f"all={all_avg!r} mythic={myth_avg!r}",
            )
            ck(
                "ganti rank tidak memicu request /api/heroes baru",
                len(hero_requests) == 0,
                f"{len(hero_requests)} request",
            )

            page.query_selector_all("select")[0].select_option("all")
            page.wait_for_timeout(900)

            # ------------------------------------------------ filter sheet
            page.click(".toolbar__filter")
            page.wait_for_timeout(700)
            sheet = page.query_selector(".sheet__panel")
            sheet_text = (sheet.inner_text() if sheet else "").lower()
            ck("sheet filter terbuka", sheet is not None and "role" in sheet_text)
            ck("sheet filter berisi lane", "lane" in sheet_text)
            ck("sheet filter berisi tipe damage", "tipe damage" in sheet_text)
            page.click(".sheet__foot .btn--primary")
            page.wait_for_timeout(600)

            # ------------------------------------------------ sorting
            # Urutan select: [0] rank, [1] periode, [2] urutkan.
            page.query_selector_all("select")[2].select_option("win_rate")
            page.wait_for_timeout(900)
            names = [c.inner_text().split("\n")[0] for c in page.query_selector_all(".hcard")]
            ck("sorting menghasilkan urutan hero", len(names) > 0, str(names[:3]))

            # ------------------------------------------------ drawer detail
            page.click(".hcard__name button")
            page.wait_for_timeout(1500)
            drawer = page.query_selector(".drawer__panel")
            drawer_text = drawer.inner_text() if drawer else ""
            drawer_low = drawer_text.lower()
            ck("drawer detail terbuka", drawer is not None)
            ck("detail menampilkan Win Rate", "win rate" in drawer_low)
            ck("detail menampilkan Pick Rate", "pick rate" in drawer_low)
            ck("detail menampilkan Ban Rate", "ban rate" in drawer_low)
            ck("detail menampilkan rate per rank", "rate per rank" in drawer_low)
            ck("detail menampilkan skill", "skill (" in drawer_low)
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)

            # ------------------------------------------------ tab komposisi
            # Pilih satu hero dari daftar DULU (tombol tambah pada kartu),
            # baru pindah ke tab "Tim".
            add_buttons = page.query_selector_all(".hcard button[aria-pressed]")
            if add_buttons:
                add_buttons[0].click()
                page.wait_for_timeout(600)
            page.click('.tabbar button:has-text("Tim")')
            page.wait_for_timeout(900)
            body = page.inner_text("body")
            low = body.lower()
            ck("tab komposisi terbuka", "komposisi tim" in low)
            ck("komposisi menampilkan skor", "skor komposisi" in low or "balance rating" in low)
            ck("komposisi menampilkan CC density", "cc density" in low)
            ck("komposisi menampilkan frontline", "frontline" in low)

            # ------------------------------------------------ tab movers
            page.goto(BASE + "/#/movers", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1800)
            body = page.inner_text("body").lower()
            ck("tab movers terbuka", "meta movers" in body)
            ck("movers menjelaskan ketiadaan riwayat", "riwayat snapshot" in body)

            # ------------------------------------------------ tab data
            page.goto(BASE + "/#/sources", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1800)
            body = page.inner_text("body").lower()
            ck("tab data terbuka", "status data" in body)
            ck("tab data menampilkan sumber", "sumber" in body)
            ck("tab data menampilkan versi snapshot", "riwayat snapshot" in body)

            # ------------------------------------------------ PWA
            manifest = page.request.get(BASE + "/manifest.webmanifest")
            ck("manifest.webmanifest dilayani", manifest.status == 200)
            if manifest.status == 200:
                data = manifest.json()
                ck("manifest punya nama", bool(data.get("name")))
                ck("manifest punya icons", len(data.get("icons") or []) >= 2)
                ck("manifest display standalone", data.get("display") == "standalone")
            sw = page.request.get(BASE + "/sw.js")
            ck("service worker dilayani", sw.status == 200)

            # ------------------------------------------------ API langsung
            api = page.request.get(BASE + "/api/heroes?rank=all")
            api_heroes = (api.json() or {}).get("heroes") or []
            with_bracket = [
                h for h in api_heroes if (h.get("rates_by_rank") or {}).get("mythic")
            ]
            ck(
                "payload /api/heroes menyertakan rates_by_rank",
                len(with_bracket) > 100,
                f"{len(with_bracket)} hero punya bracket mythic",
            )
            ck("API /api/heroes 200", api.status == 200)
            if api.status == 200:
                payload = api.json()
                heroes = payload.get("heroes") or []
                rated = [h for h in heroes if h.get("win_rate") is not None]
                ck("API mengisi rate", len(rated) >= len(heroes) - 2, f"{len(rated)}/{len(heroes)}")
                ck("API punya rates_summary", payload.get("manifest", {}).get("rates_summary") is not None)
                summary = payload["manifest"]["rates_summary"]
                ck("rates_summary.avg_win_rate ada", summary.get("avg_win_rate") is not None)
                ck("rates_summary.most_banned ada", summary.get("most_banned") is not None)

            detail = page.request.get(BASE + "/api/hero?id=alucard")
            ck("API /api/hero 200", detail.status == 200)
            if detail.status == 200:
                hero = detail.json()["hero"]
                ck("detail punya stats terisi", (hero.get("stats") or {}).get("win_rate") is not None)
                ck("detail punya rates_by_rank", bool((hero.get("stats") or {}).get("rates_by_rank")))

            page.close()
            browser.close()
    finally:
        server.terminate()
        try:
            _, err = server.communicate(timeout=5)
            if err:
                tail = err.decode(errors="replace").strip().splitlines()[-5:]
                if tail:
                    print("server stderr:", *tail, sep="\n  ")
        except Exception:
            pass

    print()
    bad = 0
    for name, ok, detail in checks:
        print(f"  {'OK  ' if ok else 'FAIL'} {name}" + (f"   [{detail}]" if detail and not ok else ""))
        if not ok:
            bad += 1
    print("=" * 66)
    print(f"{len(checks)} pemeriksaan, {len(checks) - bad} lolos, {bad} gagal")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
