#!/usr/bin/env python3
"""Refresh rankings locally and optionally upload them to Supabase storage.

Example:
  python scripts/refresh_rankings.py --top 100 --skip-upload
  npm run refresh-rankings
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRAPER = ROOT / "fortnite_rankings_scraper.py"
UPLOAD_SCRIPT = ROOT / "scripts" / "upload_to_supabase.py"
OUTPUT_FILE = ROOT / "rankings_all_regions.json"
PUBLIC_OUTPUT = ROOT / "public" / "rankings_all_regions.json"


def build_scraper_command(args: argparse.Namespace) -> list[str]:
    cmd = [
        sys.executable,
        str(SCRAPER),
        "--region",
        args.region,
        "--pageSize",
        str(args.page_size),
        "--source",
        args.source,
    ]

    if args.top is not None:
        cmd.extend(["--top", str(args.top)])
    else:
        cmd.extend(["--pages", str(args.pages)])

    if args.start_page is not None:
        cmd.extend(["--startPage", str(args.start_page)])
    if args.end_page is not None:
        cmd.extend(["--endPage", str(args.end_page)])
    if args.headless:
        cmd.append("--headless")
    if getattr(args, 'live_upload', False):
        cmd.append("--upload-each-page")

    return cmd


def run_scraper(args: argparse.Namespace) -> int:
    cmd = build_scraper_command(args)
    print("▶ Running:", " ".join(cmd))
    result = subprocess.run(cmd, cwd=ROOT, text=True)
    return result.returncode


def copy_output() -> bool:
    if not OUTPUT_FILE.exists():
        print("⚠ No rankings file produced at", OUTPUT_FILE)
        return False
    PUBLIC_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    try:
        # try direct copy
        shutil.copy2(OUTPUT_FILE, PUBLIC_OUTPUT)
    except PermissionError:
        # fallback: read and rewrite contents (avoids replace errors on Windows)
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as inf:
            data = inf.read()
        with open(PUBLIC_OUTPUT, 'w', encoding='utf-8') as outf:
            outf.write(data)

    print(f"✅ Copied {OUTPUT_FILE.name} -> {PUBLIC_OUTPUT.relative_to(ROOT)}")
    return True


def upload_to_supabase() -> bool:
    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        print("⚠ Skipping Supabase upload. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable online storage.")
        return False

    print("▶ Uploading to Supabase Storage...")
    result = subprocess.run([sys.executable, str(UPLOAD_SCRIPT)], cwd=ROOT, text=True)
    if result.returncode != 0:
        print("⚠ Upload failed.")
        return False

    print("✅ Uploaded rankings to Supabase Storage")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh rankings locally and optionally sync to Supabase")
    parser.add_argument("--region", default="EU", help="Region to scrape, e.g. EU")
    parser.add_argument("--page-size", type=int, default=50, help="Entries per page")
    parser.add_argument("--top", type=int, default=10000, help="Fetch the top N players")
    parser.add_argument("--pages", type=int, default=20, help="Number of pages to scrape if --top is not used")
    parser.add_argument("--start-page", type=int, default=1, help="First page to scrape")
    parser.add_argument("--end-page", type=int, default=None, help="Last page to scrape")
    parser.add_argument("--source", choices=["fortnite", "eucompetitive"], default="fortnite", help="Source site")
    parser.add_argument("--skip-upload", action="store_true", help="Do not upload to Supabase")
    parser.add_argument("--live-upload", action="store_true", help="Ask scraper to upload partial results to Supabase as pages complete")
    parser.add_argument("--headless", action=argparse.BooleanOptionalAction, default=True, help="Run browser headlessly")
    args = parser.parse_args()

    if args.top is not None and args.top <= 0:
        print("⚠ --top must be greater than 0")
        return 2

    scraper_rc = run_scraper(args)
    if scraper_rc != 0:
        print("❌ Scraper failed")
        return scraper_rc

    copy_output()

    if not args.skip_upload:
        upload_to_supabase()

    print("✅ Refresh complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
