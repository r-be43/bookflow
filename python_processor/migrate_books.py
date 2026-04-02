"""
One-time migration script:
- Reads books from public/java/data.js
- Uploads them into Firestore collection: books

Usage:
  python migrate_books.py --service-account "C:/path/to/service-account.json"
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore import SERVER_TIMESTAMP


def resolve_input_path(path_value: str, *, script_dir: Path) -> Path:
    """
    Resolve absolute or relative paths robustly on Windows and Unix.
    For relative paths, try current working directory first, then script directory.
    """
    raw = (path_value or "").strip()
    if not raw:
        return Path()

    candidate = Path(raw).expanduser()
    if candidate.is_absolute():
        return candidate.resolve()

    cwd_candidate = (Path.cwd() / candidate).resolve()
    if cwd_candidate.exists():
        return cwd_candidate

    script_candidate = (script_dir / candidate).resolve()
    if script_candidate.exists():
        return script_candidate

    # Return CWD resolution for a clearer final error message.
    return cwd_candidate


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate books from data.js to Firestore.")
    parser.add_argument(
        "--service-account",
        default="",
        help="Path to Firebase service account JSON file. "
        "If omitted, script reads FIREBASE_SERVICE_ACCOUNT_PATH env var.",
    )
    parser.add_argument(
        "--source",
        default=str((Path(__file__).resolve().parent.parent / "public" / "java" / "data.js")),
        help="Path to source data.js file.",
    )
    parser.add_argument(
        "--collection",
        default="books",
        help="Firestore collection name. Default: books",
    )
    return parser.parse_args()


def load_books_from_js(source_path: Path) -> list[dict]:
    if not source_path.is_file():
        raise FileNotFoundError(f"Source file not found: {source_path}")

    node_script = """
const { pathToFileURL } = require('url');
const sourcePath = process.argv[1];
(async () => {
  const mod = await import(pathToFileURL(sourcePath).href);
  const books = Array.isArray(mod.booksList) ? mod.booksList : [];
  process.stdout.write(JSON.stringify(books));
})().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
"""

    result = subprocess.run(
        ["node", "-e", node_script, str(source_path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "Failed to load booksList from data.js using Node.\n"
            f"stderr:\n{result.stderr.strip()}"
        )

    books = json.loads(result.stdout or "[]")
    if not isinstance(books, list):
        raise ValueError("booksList is not an array.")
    return books


def init_firestore(service_account_path: str) -> firestore.Client:
    if not service_account_path:
        raise ValueError(
            "Service account path missing. Pass --service-account or set FIREBASE_SERVICE_ACCOUNT_PATH."
        )

    sa_path = Path(service_account_path)
    if not sa_path.is_file():
        raise FileNotFoundError(f"Service account not found: {sa_path}")

    if not firebase_admin._apps:
        cred = credentials.Certificate(str(sa_path))
        firebase_admin.initialize_app(cred)

    return firestore.client()


def migrate_books(db: firestore.Client, books: list[dict], collection_name: str) -> tuple[int, int]:
    if not books:
        return (0, 0)

    migrated = 0
    skipped = 0
    batch = db.batch()
    op_count = 0

    for book in books:
        if not isinstance(book, dict):
            skipped += 1
            continue

        book_id = book.get("id")
        if book_id is None:
            skipped += 1
            continue

        doc_ref = db.collection(collection_name).document(str(book_id))
        payload = {**book, "updatedAt": SERVER_TIMESTAMP}
        batch.set(doc_ref, payload, merge=True)
        migrated += 1
        op_count += 1

        if op_count == 400:
            batch.commit()
            batch = db.batch()
            op_count = 0

    if op_count > 0:
        batch.commit()

    return migrated, skipped


def main() -> None:
    args = parse_args()
    script_dir = Path(__file__).resolve().parent

    service_account_input = args.service_account or os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH", "")
    service_account = (
        str(resolve_input_path(service_account_input, script_dir=script_dir))
        if service_account_input
        else ""
    )
    source_path = Path(args.source).resolve()

    try:
        books = load_books_from_js(source_path)
        db = init_firestore(service_account)
        migrated, skipped = migrate_books(db, books, args.collection)
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"[DONE] Source file: {source_path}")
    print(f"[DONE] Collection : {args.collection}")
    print(f"[DONE] Migrated   : {migrated}")
    print(f"[DONE] Skipped    : {skipped}")


if __name__ == "__main__":
    main()
