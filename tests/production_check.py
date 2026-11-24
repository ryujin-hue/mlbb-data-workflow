#!/usr/bin/env python3
"""Cek cepat situs produksi MLBB Almanac.

Menjalankan Chromium terhadap URL produksi (bukan dev server) untuk memastikan
deploy terakhir benar-benar hidup: rate terisi, SPA fallback laluan berfungsi
(/heroes, /patches/2.2.16 dimuat terus dari server), setiap halaman IA
baharu memaparkan data, dan tiada console error.

    python3 tests/production_check.py

Env:
    QA_BASE   URL target (default: URL Worker produksi)
"""
from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.request

from playwright.sync_api import sync_playwright

# Proxy di lingkungan sandbox memakai sertifikat kedaluwarsa, dan memblokir
# User-Agent bawaan python-urllib. Jadi: UA peramban + SSL tanpa verifikasi.
_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE


def get_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=45, context=_CTX) as resp:
        return json.loads(resp.read())


def get_bytes(url: str) -> tuple[int, str]:
    request = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(request, timeout=45, context=_CTX) as resp:
        return len(resp.read()), resp.headers.get("Content-Type") or ""


BASE = os.environ.get("QA_BASE", "https://mlbb-data-workflow.mlvv.workers.dev").rstrip("/")
CHROME = "/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome"

checks: list[tuple[str, bool, str]] = []


def ck(name: str, ok: bool, detail: str = "") -> None:
    checks.append((name, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {name}" + (f"  [{detail}]" if detail else ""))


def main() -> int:
    print(f"Target: {BASE}\n")

    # --- API ---
    index = get_json(f"{BASE}/api/heroes?rank=all")
    heroes = index.get("heroes") or []
    rated = [h for h in heroes if h.get("win_rate") is not None]
    ck("API /api/heroes 200", True, f"{len(heroes)} hero")
    ck("rate terisi", len(rated) >= 130, f"{len(rated)}/{len(heroes)} hero ber-rate")
    ck(
        "rates_by_rank ikut",
        len([h for h in heroes if h.get("rates_by_rank")]) >= 130,
        f"{len([h for h in heroes if h.get('rates_by_rank')])} hero",
    )
    ck(
        "tier terisi",
        len([h for h in heroes if h.get("tier")]) >= 130,
        f"{len([h for h in heroes if h.get('tier')])} hero",
    )
    summary = (index.get("manifest") or {}).get("rates_summary") or {}
    ck("rates_summary ada", summary.get("avg_win_rate") is not None, f"avg={summary.get('avg_win_rate')}")
    ck(
        "most_banned ada",
        bool((summary.get("most_banned") or {}).get("name")),
        (summary.get("most_banned") or {}).get("name", "-"),
    )

    deltas = get_json(f"{BASE}/api/deltas?window=7d")
    ck(
        "/api/deltas punya flag available",
        "available" in deltas,
        f"available={deltas.get('available')} reason={deltas.get('reason')}",
    )
    ck("threshold default 0.5", deltas.get("threshold") == 0.5, str(deltas.get("threshold")))
    if deltas.get("available"):
        ck(
            "/api/deltas ada senarai naik/turun",
            len(deltas.get("rising") or []) + len(deltas.get("falling") or []) > 0,
            f"naik={len(deltas.get('rising') or [])} turun={len(deltas.get('falling') or [])}",
        )

    snaps = get_json(f"{BASE}/api/snapshots")
    entries = snaps.get("entries") or []
    ck("snapshot >= 2 versi", len(entries) >= 2, f"{len(entries)} versi")
    versions = [e.get("version") for e in entries]
    ck("versi snapshot unik", len(set(versions)) == len(versions), ", ".join(versions))

    # --- arkib statik (hasil build_archive.py) ---
    for name, minimum in (("core", 100_000), ("reference", 10_000), ("docs", 10_000)):
        try:
            size, _ = get_bytes(f"{BASE}/archive/{name}.json")
            ck(f"/archive/{name}.json ada", size >= minimum, f"{size} bait")
        except Exception as err:  # noqa: BLE001
            ck(f"/archive/{name}.json ada", False, str(err)[:60])

    # --- lagu hero (aset audio + Range request) ---
    # Range wajib untuk iOS Safari. Sousa dulu, route /audio/* pulangkan JSON
    # Worker (bukan mp3) tanpa disedar - jadi ia perlu dikawal setiap hari.
    audio_path = "/audio/PICS/Mathilda/336387.mp3"
    req = urllib.request.Request(
        f"{BASE}{audio_path}", headers={"User-Agent": _UA, "Accept": "audio/mpeg"}
    )
    with urllib.request.urlopen(req, timeout=45, context=_CTX) as resp:
        audio_type = resp.headers.get("Content-Type") or ""
        audio_len = len(resp.read())
    ck("audio hero 200", True, f"{audio_len} bait")
    ck("audio hero Content-Type audio/mpeg", audio_type.startswith("audio/mpeg"), audio_type)
    ck("audio hero ada bait", audio_len > 100_000, f"{audio_len} bait")

    range_req = urllib.request.Request(
        f"{BASE}{audio_path}",
        headers={"User-Agent": _UA, "Range": "bytes=0-1023"},
    )
    try:
        with urllib.request.urlopen(range_req, timeout=45, context=_CTX) as resp:
            range_status = resp.status
            content_range = resp.headers.get("Content-Range") or ""
            range_len = len(resp.read())
    except urllib.error.HTTPError as err:
        range_status = err.code
        content_range = err.headers.get("Content-Range") or ""
        range_len = 0
    ck("audio hero Range -> 206", range_status == 206, f"status={range_status}")
    ck(
        "audio hero ada Content-Range",
        content_range.startswith("bytes 0-1023/"),
        content_range,
    )
    ck("audio hero Range hantar 1024 bait", range_len == 1024, f"{range_len} bait")

    # --- browser ---
    launch_kwargs = {"args": ["--no-sandbox", "--disable-dev-shm-usage"]}
    if os.path.exists(CHROME):
        launch_kwargs["executable_path"] = CHROME

    with sync_playwright() as pw:
        browser = pw.chromium.launch(**launch_kwargs)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        def load(path: str, wait: str = "", settle: int = 1800) -> str:
            """Muat laluan terus dari server - menguji SPA fallback."""
            resp = page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=60_000)
            if wait:
                page.wait_for_selector(wait, timeout=45_000)
            page.wait_for_timeout(settle)
            status = resp.status if resp else 0
            ck(f"laluan {path} 200", status == 200, f"status={status}")
            return page.inner_text("body")

        # 1. Landing = senarai hero
        body = load("/", wait=".hcard")
        ck("landing: senarai hero", len(page.query_selector_all(".hcard")) > 100)

        nav_links = page.eval_on_selector_all(
            ".topnav__link", "els => els.map(e => e.textContent.trim())"
        )
        ck(
            "nav: Heroes dulu, Meta kemudian",
            nav_links[:2] == ["Heroes", "Meta"] and len(nav_links) == 7,
            str(nav_links),
        )

        # 2. Meta (halaman ringkasan)
        body = load("/meta", wait=".statusstrip")
        ck("Meta: strip status patch", bool(page.query_selector(".statusstrip__patch")))
        ck("Meta: KPI 4 statistik", len(page.query_selector_all(".kpirow .stat")) == 4)
        ck("Meta: bar win rate ikut role", len(page.query_selector_all(".rolebar")) >= 4)
        ck("Meta: lajur naik & turun", len(page.query_selector_all(".metacols .panel")) == 2)
        ck("Meta: patch semasa dipapar", "2.2.23" in body, "2.2.23")

        foot = page.inner_text(".footer").lower()
        ck("footer: lesen + penafian Moonton", "cc by-sa" in foot and "moonton" in foot)

        # 3. Heroes
        body = load("/heroes", wait=".hcard")
        cards = page.query_selector_all(".hcard")
        ck("Heroes: > 100 kad", len(cards) > 100, str(len(cards)))
        first_card = page.query_selector(".hcard")
        card_text = first_card.inner_text() if first_card else ""
        metrics = [x for x in card_text.split("\n") if "%" in x]
        ck("kad hero: 3 metrik rate", len(metrics) == 3, card_text[:100])
        ck("kad hero: tiada rate kosong", "—" not in card_text)
        ck("kad hero: strip patch arkib", len(page.query_selector_all(".hcard__arch")) > 0)

        page.click(".toggle__btn:has-text('Jadual')")
        page.wait_for_timeout(1000)
        ck("Heroes: jadual > 100 baris", len(page.query_selector_all(".tbl tbody tr")) > 100)

        # 3. Detail hero + sejarah imbangan
        body = load("/heroes/lancelot", wait=".detailhead")
        ck("Detail hero: nama dipapar", "Lancelot" in body)
        page.click(".tabs__btn:has-text('Balance history')")
        page.wait_for_timeout(1000)
        ck("Detail hero: sejarah imbangan ada baris", len(page.query_selector_all(".tbl--history tbody tr")) >= 1)

        # 4. Movers (data sebenar di produksi)
        body = load("/movers", wait=".page--movers")
        movers_text = page.inner_text(".counts") if page.query_selector(".counts") else ""
        ck("Movers: kiraan naik/turun", "naik" in movers_text and "turun" in movers_text, movers_text[:60])
        ck(
            "Movers: senarai naik/turun dipapar",
            len(page.query_selector_all(".moverrow")) > 0
            or bool(page.query_selector(".empty")),
            f"{len(page.query_selector_all('.moverrow'))} baris",
        )

        # 5. Patches
        body = load("/patches", wait=".tbl")
        ck("Patches: patch semasa dipin", "PATCH TERKINI" in body.upper())
        ck("Patches: > 80 versi", len(page.query_selector_all(".tbl tbody tr")) > 80)

        # 6. Detail patch
        body = load("/patches/2.2.16", wait=".tabs")
        ck("Detail patch: versi dipapar", "2.2.16" in body)
        ck("Detail patch: baris perubahan hero", len(page.query_selector_all(".tbl--patch tbody tr")) > 0)

        # 7. Patch notes (MLBB Hub)
        body = load("/patch-notes", wait=".pagehead")
        ck("Patch Notes: halaman dipapar", "Patch Notes" in body)
        ck("Patch Notes: sumber dinyatakan", "MLBB Hub" in body, body[:60])

        # 8. Items
        body = load("/items", wait=".icard")
        ck("Items: > 90 kad item", len(page.query_selector_all(".icard")) > 90)
        ck("Items: imej item dimuat", len(page.query_selector_all(".icard__img img")) > 90)

        # 9. Data
        body = load("/data", wait=".page--data")
        for title in ("Status", "Sumber", "Statistik arkib", "Jadual rujukan"):
            ck(f"Data: seksyen {title}", title.lower() in body.lower())
        ck(
            "Data: katalog API dikelompokkan",
            len(page.query_selector_all(".apigroup")) >= 3,
            str(len(page.query_selector_all(".apigroup"))),
        )
        ck(
            "Data: katalog ada endpoint patch-notes + tournaments",
            "/api/patch-notes" in body and "/api/tournaments" in body,
        )

        ck("tiada console error", len(errors) == 0, "; ".join(errors[:3]))

        # --- mobile: bar bawah + menu More ---
        mctx = browser.new_context(viewport={"width": 390, "height": 844})
        mp = mctx.new_page()
        mp.on("pageerror", lambda e: errors.append(f"MOBILE {e}"))
        mp.goto(f"{BASE}/", wait_until="domcontentloaded", timeout=60_000)
        mp.wait_for_timeout(2200)
        ck("mobile: bar bawah kelihatan", mp.is_visible(".tabbar"))
        ck("mobile: navigasi atas tersembunyi", not mp.is_visible(".topnav"))
        mp.click(".tabbar__link:has-text('Heroes')")
        mp.wait_for_timeout(1400)
        ck("mobile: tab Heroes -> /heroes", mp.url.endswith("/heroes"), mp.url)
        mp.click(".tabbar__link:has-text('Meta')")
        mp.wait_for_timeout(1400)
        ck("mobile: tab Meta -> /meta", mp.url.endswith("/meta"), mp.url)
        mp.click(".tabbar__link:has-text('Heroes')")
        mp.wait_for_timeout(1400)
        ck("mobile: kad hero dipapar", len(mp.query_selector_all(".hcard")) > 100)
        mp.click(".tabbar__link:has-text('More')")
        mp.wait_for_timeout(900)
        ck(
            "mobile: menu More ada Patch Notes + Items + Data",
            mp.is_visible(".moremenu__link:has-text('Patch Notes')")
            and mp.is_visible(".moremenu__link:has-text('Items')")
            and mp.is_visible(".moremenu__link:has-text('Data')"),
        )
        mctx.close()

        # --- desktop: kad tidak terpotong ---
        dctx = browser.new_context(viewport={"width": 1440, "height": 900})
        dpage = dctx.new_page()
        dpage.goto(f"{BASE}/heroes", wait_until="domcontentloaded", timeout=60_000)
        dpage.wait_for_selector(".hcard", timeout=45_000)
        dpage.wait_for_timeout(2000)
        card = dpage.query_selector(".hcard")
        card_text = card.inner_text() if card else ""
        metrics = [x for x in card_text.split("\n") if "%" in x]
        ck("desktop: kad menampilkan 3 metrik", len(metrics) == 3, card_text[:120])
        ck(
            "desktop: tiada panel scroll dalam halaman",
            dpage.evaluate(
                "() => { const g = document.querySelector('.herogrid');"
                " if (!g) return false;"
                " return getComputedStyle(g).overflowY === 'visible'; }"
            ),
            "",
        )
        dctx.close()
        browser.close()

    failed = [name for name, ok, _ in checks if not ok]
    print(f"\n{len(checks)} pemeriksaan, {len(checks) - len(failed)} lolos, {len(failed)} gagal")
    if failed:
        for name in failed:
            print(f"  GAGAL: {name}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
