#!/usr/bin/env python3
"""Upload `rankings_all_regions.json` to Supabase Storage bucket.

Requires the following environment variables to be set (store in GitHub Secrets):
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_BUCKET (optional, default: public)
"""
import os
import sys
from pathlib import Path

try:
    from supabase import create_client
except Exception:
    print("Please install supabase: pip install supabase")
    raise


def main():
    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    bucket = os.environ.get('SUPABASE_BUCKET', 'public')

    if not url or not key:
        print('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
        sys.exit(1)

    client = create_client(url, key)

    file_path = Path('rankings_all_regions.json')
    if not file_path.exists():
        print('rankings_all_regions.json not found')
        sys.exit(1)

    dest_path = file_path.name
    print(f'Uploading {file_path} -> bucket={bucket} path={dest_path}')

    with open(file_path, 'rb') as f:
        try:
            res = client.storage.from_(bucket).upload(dest_path, f, {'upsert': True})
            print('Upload response:', res)
        except Exception as e:
            print('Upload failed:', str(e))
            sys.exit(1)


if __name__ == '__main__':
    main()
