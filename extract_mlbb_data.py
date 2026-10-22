#!/usr/bin/env python3
"""MLBB public-data collector. No fabricated rows and no size padding.

Collects publicly reachable HTML/table snapshots, known season pages, and
open GitHub source archives. Run only where network access is permitted.
"""
from __future__ import annotations
import argparse, csv, hashlib, json, os, re, sys, time, zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

UA = "MLBB-Public-Research-Collector/3.0 (research; respectful rate limits)"
TIMEOUT = 40
MAX_ARCHIVE_BYTES = 1_500_000_000

SOURCES = [
    {"name":"MLBBDex esports index", "url":"https://mlbbdex.com/en/esports", "kind":"html_index"},
    {"name":"MLBB Analytics heroes", "url":"https://www.mlbbanalytics.com/heroes", "kind":"html"},
    {"name":"MLBB Analytics tournaments", "url":"https://www.mlbbanalytics.com/esports", "kind":"html"},
    {"name":"MLBBHub MPL MY hero statistics", "url":"https://mlbbhub.com/mpl/my/stats", "kind":"html"},
    {"name":"Liquipedia statistics portal", "url":"https://liquipedia.net/mobilelegends/Portal:Statistics", "kind":"html_optional"},
    {"name":"Liquipedia S-Tier tournaments index", "url":"https://liquipedia.net/mobilelegends/S-Tier_Tournaments", "kind":"html_optional"},
]
GITHUB_ARCHIVES = [
    {"name":"community MLBB game/eSports database and assets (MIT-listed)", "url":"https://api.github.com/repos/Ceplin03/database-mlbb.Mobile-Legends-Bang-Bang/zipball/master", "extract_to":"reference/community_mlbb_database"},
    {"name":"Liquipedia tournament analysis dataset (documented last refresh 2024-05-05)", "url":"https://api.github.com/repos/LiTianYeoh/MLBB_Tournament_Analysis/zipball/master", "extract_to":"reference/liquipedia_tournament_analysis"},
]

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept":"text/html,application/json,*/*"})


def utc_now(): return datetime.now(timezone.utc).isoformat(timespec="seconds")
def safe_name(s):
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s.strip())
    return s[:140] or "unnamed"
def sha256_file(p):
    h=hashlib.sha256()
    with open(p,"rb") as f:
        for b in iter(lambda:f.read(1024*1024), b""): h.update(b)
    return h.hexdigest()
def size_tree(root):
    return sum(p.stat().st_size for p in root.rglob('*') if p.is_file())


def fetch(url, dest, source_name, log_rows, *, optional=False):
    dest.parent.mkdir(parents=True, exist_ok=True)
    row = {"retrieved_at_utc":utc_now(),"source_name":source_name,"url":url,"status":"","http_status":"","bytes":0,"sha256":"","saved_path":"","error":""}
    try:
        resp=SESSION.get(url, timeout=TIMEOUT, stream=True, allow_redirects=True)
        row["http_status"]=resp.status_code
        if resp.status_code >= 400:
            row["status"]="http_error"
            row["error"]=f"HTTP {resp.status_code}"
            resp.close(); log_rows.append(row); return None
        tmp = dest.with_suffix(dest.suffix+".part")
        total=0
        with open(tmp,"wb") as f:
            for chunk in resp.iter_content(chunk_size=1024*256):
                if chunk:
                    total += len(chunk)
                    if total > MAX_ARCHIVE_BYTES:
                        raise RuntimeError(f"file exceeds safety cap ({MAX_ARCHIVE_BYTES} bytes)")
                    f.write(chunk)
        tmp.replace(dest)
        row.update(status="ok", bytes=total, sha256=sha256_file(dest), saved_path=str(dest))
        log_rows.append(row)
        return dest
    except Exception as e:
        row.update(status="error", error=f"{type(e).__name__}: {e}")
        log_rows.append(row)
        if not optional:
            print(f"[WARN] {source_name}: {row['error']}", file=sys.stderr)
        return None


def table_to_rows(table):
    rows=[]
    for tr in table.find_all('tr'):
        cells=tr.find_all(['th','td'])
        vals=[re.sub(r"\s+"," ", c.get_text(" ", strip=True)) for c in cells]
        if vals: rows.append(vals)
    if not rows: return [], []
    header=rows[0]
    # Make headers unique and deterministic.
    used={}; hdr=[]
    for i,h in enumerate(header):
        h=h or f"column_{i+1}"
        used[h]=used.get(h,0)+1
        hdr.append(h if used[h]==1 else f"{h}_{used[h]}")
    fixed=[]
    for r in rows[1:]:
        if len(r)<len(hdr): r=r+[""]*(len(hdr)-len(r))
        elif len(r)>len(hdr): r=r[:len(hdr)]
        fixed.append(r)
    return hdr, fixed


def extract_html_tables(html_path, url, out_root, log_rows):
    raw=html_path.read_text(encoding="utf-8", errors="replace")
    soup=BeautifulSoup(raw,"html.parser")
    slug=safe_name(urlparse(url).path.strip('/').replace('/','_') or urlparse(url).netloc)
    links=[]
    base=url
    for a in soup.find_all('a', href=True):
        href=urljoin(base, a['href'])
        text=re.sub(r"\s+"," ",a.get_text(" ",strip=True))
        if urlparse(href).netloc and text:
            links.append({"link_text":text,"url":href})
    if links:
        lp=out_root/"parsed_tables"/f"{slug}_links.csv"; lp.parent.mkdir(parents=True,exist_ok=True)
        with open(lp,"w",newline="",encoding="utf-8-sig") as f:
            w=csv.DictWriter(f, fieldnames=["link_text","url"]);w.writeheader();w.writerows(links)
    for idx,table in enumerate(soup.find_all('table'),1):
        hdr, rows=table_to_rows(table)
        if not hdr: continue
        p=out_root/"parsed_tables"/f"{slug}_table_{idx:03}.csv";p.parent.mkdir(parents=True,exist_ok=True)
        with open(p,"w",newline="",encoding="utf-8-sig") as f:
            w=csv.writer(f);w.writerow(hdr);w.writerows(rows)
        log_rows.append({"retrieved_at_utc":utc_now(),"source_name":f"parsed table {idx}","url":url,"status":"parsed_table","http_status":"","bytes":p.stat().st_size,"sha256":sha256_file(p),"saved_path":str(p),"error":f"rows={len(rows)}; columns={len(hdr)}"})
    return links


def safe_extract(zip_path, dest):
    dest=dest.resolve(); dest.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            name=info.filename
            # Strip single GitHub zipball top-level directory.
            parts=Path(name).parts
            if len(parts)<=1: continue
            relative=Path(*parts[1:])
            if str(relative)=='.' or relative.is_absolute() or '..' in relative.parts:
                continue
            target=(dest/relative).resolve()
            if dest not in target.parents and target != dest:
                continue
            if info.is_dir(): target.mkdir(parents=True,exist_ok=True); continue
            target.parent.mkdir(parents=True,exist_ok=True)
            with zf.open(info) as src, open(target,'wb') as out:
                while True:
                    chunk=src.read(1024*256)
                    if not chunk: break
                    out.write(chunk)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out',default='MLBB_DATASET_OUTPUT', help='output directory')
    ap.add_argument('--max-tournament-pages',type=int,default=250, help='maximum unique MLBBDex tournament/detail URLs to visit')
    ap.add_argument('--delay',type=float,default=1.2, help='polite delay between website requests in seconds')
    ap.add_argument('--skip-github-assets',action='store_true', help='skip downloading GitHub reference datasets and images')
    ap.add_argument('--keep-source-archives',action='store_true', help='keep raw downloaded repository ZIPs alongside extracted files')
    ap.add_argument('--min-output-mb',type=float,default=100, help='minimum output size target; if not reached, report and exit 2 (no filler files)')
    args=ap.parse_args()
    root=Path(args.out).resolve(); root.mkdir(parents=True,exist_ok=True)
    logs=[]; all_links=[]; started=utc_now()
    (root/'raw_html').mkdir(exist_ok=True); (root/'logs').mkdir(exist_ok=True)
    source_manifest=[]
    # Fetch top-level sources first. Requests to protected pages are logged, not bypassed.
    for i,src in enumerate(SOURCES,1):
        p=root/'raw_html'/f"{i:02}_{safe_name(src['name'])}.html"
        got=fetch(src['url'],p,src['name'],logs,optional=src.get('kind')=='html_optional')
        source_manifest.append({**src,"saved_path":str(got) if got else "","status":"ok" if got else "unavailable_or_blocked"})
        if got:
            try:
                txt=got.read_text(encoding='utf-8',errors='replace')
                # Use text filename even if response is not valid HTML; response content remains raw for audit.
                if '<' in txt[:1000]:
                    all_links.extend(extract_html_tables(got,src['url'],root,logs))
            except Exception as e:
                logs.append({"retrieved_at_utc":utc_now(),"source_name":src['name'],"url":src['url'],"status":"parse_error","http_status":"","bytes":0,"sha256":"","saved_path":str(got),"error":str(e)})
        time.sleep(max(0,args.delay))

    # Tournament detail page discovery from MLBBDex index and known public index pages.
    detail_urls=[]
    for item in all_links:
        u=item['url']
        if 'mlbbdex.com' in urlparse(u).netloc and re.search(r'/en/esports/[^/?#]+/?$',urlparse(u).path) and urlparse(u).path.rstrip('/')!='/en/esports':
            detail_urls.append((item.get('link_text',''),u))
    # Keep distinct URLs, do not invent season URLs.
    seen=set(); unique=[]
    for label,u in detail_urls:
        u=u.split('#')[0]
        if u not in seen: seen.add(u); unique.append((label,u))
    unique=unique[:max(0,args.max_tournament_pages)]
    index_rows=[]
    for i,(label,url) in enumerate(unique,1):
        slug=safe_name(urlparse(url).path.strip('/').replace('/','_'))
        p=root/'raw_html'/'tournaments'/f'{i:04}_{slug}.html'; p.parent.mkdir(parents=True,exist_ok=True)
        got=fetch(url,p,f'MLBBDex tournament page: {label or slug}',logs,optional=True)
        index_rows.append({"sequence":i,"label":label,"url":url,"status":"ok" if got else "unavailable"})
        if got:
            try: extract_html_tables(got,url,root,logs)
            except Exception as e: logs.append({"retrieved_at_utc":utc_now(),"source_name":label,"url":url,"status":"parse_error","http_status":"","bytes":0,"sha256":"","saved_path":str(got),"error":str(e)})
        if i%20==0: print(f"Tournament pages processed: {i}/{len(unique)}")
        time.sleep(max(0,args.delay))
    write_csv(root/'tournament_page_inventory.csv', index_rows, ["sequence","label","url","status"])

    # Fetch structured open repositories and their image assets. This is real asset data, not padding.
    archive_records=[]
    if not args.skip_github_assets:
        for i,repo in enumerate(GITHUB_ARCHIVES,1):
            archive_dir=root/repo['extract_to']; archive_dir.parent.mkdir(parents=True,exist_ok=True)
            zip_path=root/'raw_sources'/f'{i:02}_{safe_name(repo["name"])}.zip'
            zip_path.parent.mkdir(parents=True,exist_ok=True)
            got=fetch(repo['url'],zip_path,repo['name'],logs,optional=True)
            if got:
                try:
                    safe_extract(got,archive_dir)
                    rec={"name":repo['name'],"url":repo['url'],"archive_path":str(got) if args.keep_source_archives else "removed_after_extraction","extracted_to":str(archive_dir),"status":"extracted","expanded_bytes":size_tree(archive_dir)}
                    if not args.keep_source_archives: got.unlink(missing_ok=True)
                except Exception as e:
                    rec={"name":repo['name'],"url":repo['url'],"archive_path":str(got),"extracted_to":str(archive_dir),"status":"extract_error","error":str(e)}
            else:
                rec={"name":repo['name'],"url":repo['url'],"status":"download_failed"}
            archive_records.append(rec)
            time.sleep(max(0,args.delay))

    # Table-based canonical index and provenance logs.
    write_csv(root/'source_fetch_log.csv',logs,["retrieved_at_utc","source_name","url","status","http_status","bytes","sha256","saved_path","error"])
    write_csv(root/'source_manifest.csv',source_manifest,["name","url","kind","saved_path","status"])
    (root/'source_archives_manifest.json').write_text(json.dumps(archive_records,ensure_ascii=False,indent=2),encoding='utf-8')
    report={
      "dataset_name":"MLBB public data extraction",
      "version":"3.0",
      "started_at_utc":started,
      "completed_at_utc":utc_now(),
      "collector_version":"3.0",
      "tournament_pages_discovered":len(detail_urls),
      "tournament_pages_attempted":len(unique),
      "successful_http_fetches":sum(1 for r in logs if r.get('status')=='ok'),
      "failed_or_blocked_sources":[r for r in logs if r.get('status') in ('error','http_error')],
      "output_directory_bytes":size_tree(root),
      "output_directory_mib":round(size_tree(root)/1024/1024,2),
      "required_minimum_mib":args.min_output_mb,
      "minimum_met":size_tree(root)>=args.min_output_mb*1024*1024,
      "integrity":"No synthetic match records or artificial padding are generated. Missing data remains missing and is logged.",
      "limitations":["Historical coverage depends on what public source pages expose at run time.","Some Liquipedia pages may return access errors; the collector records failures and does not bypass them.","Hero pick/ban statistics are not equivalent to complete match-by-match drafts."]
    }
    (root/'extraction_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    (root/'README_AFTER_RUN.txt').write_text(
      "MLBB PUBLIC-DATA EXTRACTION RESULTS\n\n"
      f"Finished: {report['completed_at_utc']}\n"
      f"Output size: {report['output_directory_mib']} MiB\n"
      f"Minimum requested: {args.min_output_mb} MiB\n"
      f"Minimum met: {report['minimum_met']}\n"
      f"Tournament/detail pages attempted: {report['tournament_pages_attempted']}\n"
      f"Successful fetches: {report['successful_http_fetches']}\n\n"
      "The collector does not fabricate missing records or add filler bytes. Review extraction_report.json and source_fetch_log.csv before treating any season as complete.\n",
      encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    if not report['minimum_met']:
        print(f"\nTARGET NOT MET: collected {report['output_directory_mib']} MiB; requested {args.min_output_mb} MiB. No padding was added.",file=sys.stderr)
        return 2
    return 0


def write_csv(path,rows,fields):
    path.parent.mkdir(parents=True,exist_ok=True)
    with open(path,'w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader()
        for r in rows: w.writerow(r)

if __name__=='__main__':
    raise SystemExit(main())
