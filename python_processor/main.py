"""
Listens to Firestore `reservations` and auto-confirms pending bookings (demo processor).

Requires: pip install firebase-admin
Set FIREBASE_SERVICE_ACCOUNT_PATH to your downloaded Service Account JSON path,
or edit SERVICE_ACCOUNT_JSON below.
"""

from __future__ import annotations

import os
import sys
import threading
import time

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore import SERVER_TIMESTAMP

# TODO: Set path to your Firebase Service Account JSON (or use env var).
SERVICE_ACCOUNT_JSON = os.environ.get(
    "FIREBASE_SERVICE_ACCOUNT_PATH",
    "path/to/your-service-account.json",
)


def init_firebase() -> firestore.Client:
    if not SERVICE_ACCOUNT_JSON or not os.path.isfile(SERVICE_ACCOUNT_JSON):
        print(
            "ERROR: Set FIREBASE_SERVICE_ACCOUNT_PATH to a valid Service Account JSON file.",
            file=sys.stderr,
        )
        sys.exit(1)

    if not firebase_admin._apps:
        cred = credentials.Certificate(SERVICE_ACCOUNT_JSON)
        firebase_admin.initialize_app(cred)

    return firestore.client()


db = init_firebase()

# Avoid processing the same document twice if multiple change events overlap
_processing_lock = threading.Lock()
_processing_ids = set()


def confirm_booking(doc_id: str) -> None:
    with _processing_lock:
        if doc_id in _processing_ids:
            return
        _processing_ids.add(doc_id)

    try:
        print(f"[listener] New booking detected: {doc_id}")
        time.sleep(2)  # Simulate heavy / admin work

        ref = db.collection("reservations").document(doc_id)
        ref.update(
            {
                "status": "confirmed",
                "processedAt": SERVER_TIMESTAMP,
            }
        )
        print(f"[listener] Booking confirmed: {doc_id}")
    except Exception as e:
        print(f"[listener] Error processing {doc_id}: {e}", file=sys.stderr)
    finally:
        with _processing_lock:
            _processing_ids.discard(doc_id)


def on_reservations_snapshot(col_snapshot, changes, read_time):
    """Fires on initial load and on every change."""
    if changes:
        docs = [c.document for c in changes]
    else:
        # Some SDK versions deliver the first snapshot via col_snapshot only
        docs = getattr(col_snapshot, "docs", list(col_snapshot))

    for doc in docs:
        if not doc.exists:
            continue
        data = doc.to_dict() or {}
        if data.get("status") != "pending":
            continue
        threading.Thread(target=confirm_booking, args=(doc.id,), daemon=True).start()


def main():
    print("[main] Watching Firestore collection: reservations")
    print("[main] Press Ctrl+C to stop.\n")

    col_ref = db.collection("reservations")
    col_ref.on_snapshot(on_reservations_snapshot)

    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\n[main] Stopped.")


if __name__ == "__main__":
    main()
