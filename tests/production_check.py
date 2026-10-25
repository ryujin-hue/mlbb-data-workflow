#!/usr/bin/env python3
"""Cek cepat situs produksi MLBB Meta Center.

Menjalankan Chromium terhadap URL produksi (bukan dev server) untuk memastikan
deploy terakhir benar-benar hidup: rate terisi, filter rank bekerja, tab
Movers dan tab Data terbuka.

    python3 tests/production_check.py

Env:
    QA_BASE   URL target (default: situs produksi)
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

    snaps = get_json(f"{BASE}/api/snapshots")
    entries = snaps.get("entries") or []
    ck("snapshot >= 2 versi", len(entries) >= 2, f"{len(entries)} versi")
    versions = [e.get("version") for e in entries]
    ck("versi snapshot unik", len(set(versions)) == len(versions), ", ".join(versions))

    # --- browser ---
    launch_kwargs = {"args": ["--no-sandbox", "--disable-dev-shm-usage"]}
    if os.path.exists(CHROME):
        launch_kwargs["executable_path"] = CHROME

    with sync_playwright() as pw:
        browser = pw.chromium.launch(**launch_kwargs)
        page = browser.new_page(viewport={"width": 390, "height": 844})
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_selector(".hcard", timeout=45_000)
        page.wait_for_timeout(1500)

        body = page.inner_text("body")
        ck("halaman memuat kartu hero", len(page.query_selector_all(".hcard")) > 0)
        ck("rata-rata win rate tampil", "rata-rata win rate" in body.lower())
        ck("tidak ada rate kosong", "—" not in (page.query_selector(".hcard").inner_text()))

        # Ganti rank: angka harus berubah, dan tidak boleh ada request baru.
        def numbers() -> list[str]:
            card = page.query_selector(".hcard")
            return [x for x in (card.inner_text() if card else "").split("\n") if "%" in x]

        def avg() -> str:
            grid = page.query_selector(".statgrid")
            for line in (grid.inner_text() if grid else "").split("\n"):
                if "%" in line:
                    return line.strip()
            return ""

        all_nums, all_avg = numbers(), avg()
        hits: list[str] = []
        page.on(
            "request",
            lambda r: hits.append(r.url) if "/api/heroes" in r.url else None,
        )
        page.query_selector_all("select")[0].select_option("mythic")
        page.wait_for_timeout(1200)
        myth_nums, myth_avg = numbers(), avg()
        ck(
            "ganti rank mengubah angka rate",
            bool(all_nums) and bool(myth_nums) and all_nums != myth_nums,
            f"all={all_nums} mythic={myth_nums}",
        )
        ck("ringkasan ikut bracket", all_avg != myth_avg, f"{all_avg!r} -> {myth_avg!r}")
        ck("ganti rank tanpa request baru", len(hits) == 0, f"{len(hits)} request")

        # Tab movers & data.
        page.click('.tabbar button:has-text("Movers")')
        page.wait_for_timeout(1200)
        movers = page.inner_text("body").lower()
        ck("tab movers terbuka", "movers" in movers or "naik" in movers or "turun" in movers)
        ck(
            "movers jujur soal status history",
            any(k in movers for k in ("belum ada", "riwayat", "history", "snapshot")),
            "",
        )

        page.click('.tabbar button:has-text("Data")')
        page.wait_for_timeout(1000)
        sources = page.inner_text("body").lower()
        ck("tab data menampilkan sumber", "sumber" in sources or "github" in sources)

        ck("tidak ada console error", len(errors) == 0, "; ".join(errors[:3]))
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
