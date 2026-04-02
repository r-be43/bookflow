"""
Bulk upload 125 books into Firestore `books` collection.

Features:
- Uses firebase-admin with service account from python_processor/key.json by default
- Inserts 5 categories x 25 books (125 total)
- Auto-loads 5 real vendor IDs from Firestore `vendors` collection
- Supports manual vendor IDs override via CLI
- Generates dynamic cover URL:
  https://placehold.co/400x600/2c3e50/ffffff?text={Book+Title}
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path
from typing import Iterable
from urllib.parse import quote_plus

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_client import DEFAULT_DATABASE


BOOKS_BY_CATEGORY: list[dict[str, object]] = [
    {
        "category": "Novels",
        "items": [
            ("1984", "George Orwell"),
            ("The Alchemist", "Paulo Coelho"),
            ("One Hundred Years of Solitude", "Gabriel Garcia Marquez"),
            ("The Forty Rules of Love", "Elif Shafak"),
            ("Granada Trilogy", "Radwa Ashour"),
            ("The Blue Elephant", "Ahmed Mourad"),
            ("Utopia", "Ahmed Khaled Towfik"),
            ("In My Heart a Hebrew Female", "Khawla Hamdi"),
            ("The Da Vinci Code", "Dan Brown"),
            ("Les Miserables", "Victor Hugo"),
            ("Murder on the Orient Express", "Agatha Christie"),
            ("Cairo Trilogy", "Naguib Mahfouz"),
            ("Azazeel", "Youssef Ziedan"),
            ("Diamond Dust", "Ahmed Mourad"),
            ("The Bamboo Stalk", "Saud Alsanousi"),
            ("Crime and Punishment", "Fyodor Dostoevsky"),
            ("Anna Karenina", "Leo Tolstoy"),
            ("Gone with the Wind", "Margaret Mitchell"),
            ("The Cairo Modern", "Naguib Mahfouz"),
            ("The Thief and the Dogs", "Naguib Mahfouz"),
            ("Memory in the Flesh", "Ahlam Mosteghanemi"),
            ("Black Suits You", "Ahlam Mosteghanemi"),
            ("Season of Migration to the North", "Tayeb Salih"),
            ("Miramar", "Naguib Mahfouz"),
            ("The Prophet", "Kahlil Gibran"),
        ],
    },
    {
        "category": "Self-Help",
        "items": [
            ("Atomic Habits", "James Clear"),
            ("Rich Dad Poor Dad", "Robert Kiyosaki"),
            ("The Subtle Art of Not Giving a F*ck", "Mark Manson"),
            ("Think and Grow Rich", "Napoleon Hill"),
            ("The Power of Now", "Eckhart Tolle"),
            ("Man's Search for Meaning", "Viktor E. Frankl"),
            ("The Monk Who Sold His Ferrari", "Robin Sharma"),
            ("How to Win Friends", "Dale Carnegie"),
            ("The 5 Second Rule", "Mel Robbins"),
            ("The 5 Love Languages", "Gary Chapman"),
            ("Men Are from Mars", "John Gray"),
            ("Surrounded by Idiots", "Thomas Erikson"),
            ("The Pistachio Theory", "Fahad Amer Alahmadi"),
            ("Because You Are God", "Ali Bin Jaber Al-Fifi"),
            ("I Missed a Prayer", "Islam Jamal"),
            ("The Richest Man in Babylon", "George S. Clason"),
            ("Awaken the Giant Within", "Tony Robbins"),
            ("The Shallows", "Nicholas Carr"),
            ("Thinking Fast and Slow", "Daniel Kahneman"),
            ("Quiet", "Susan Cain"),
            ("The Power of Habit", "Charles Duhigg"),
            ("The Miracle Morning", "Hal Elrod"),
            ("Time Management", "Brian Tracy"),
            ("Eat That Frog", "Brian Tracy"),
            ("The Psychology of Money", "Morgan Housel"),
        ],
    },
    {
        "category": "History & Thought",
        "items": [
            ("Sapiens", "Yuval Noah Harari"),
            ("A Brief History of Time", "Stephen Hawking"),
            ("Muqaddimah of Ibn Khaldun", "Ibn Khaldun"),
            ("History of Baghdad", "Abbas Al-Azzawi"),
            ("The Genius of Al-Aqqad", "Abbas Mahmoud Al-Aqqad"),
            ("Thus Spoke Zarathustra", "Friedrich Nietzsche"),
            ("Sophie's World", "Jostein Gaarder"),
            ("The Clash of Civilizations", "Samuel P. Huntington"),
            ("Orientalism", "Edward Said"),
            ("The Social Contract", "Jean-Jacques Rousseau"),
            ("The Prince", "Niccolo Machiavelli"),
            ("The Art of War", "Sun Tzu"),
            ("Muallaqat", "Various"),
            ("Al-Aghani", "Abu al-Faraj al-Isfahani"),
            ("Meadows of Gold", "Al-Masudi"),
            ("The Muqaddimah", "Ibn Khaldun"),
            ("Kitab al-Ibar", "Ibn Khaldun"),
            ("Al-Fitna al-Kubra", "Taha Hussein"),
            ("The Crusades Through Arab Eyes", "Amin Maalouf"),
            ("Decisive Moments in the History of Islam", "Muhammad Abdullah Enan"),
            ("The Map of Knowledge", "Violet Moller"),
            ("Guns Germs and Steel", "Jared Diamond"),
            ("The Silk Roads", "Peter Frankopan"),
            ("SPQR", "Mary Beard"),
            ("Jerusalem: The Biography", "Simon Sebag Montefiore"),
        ],
    },
    {
        "category": "Science & Tech",
        "items": [
            ("Cosmos", "Carl Sagan"),
            ("The Selfish Gene", "Richard Dawkins"),
            ("Astrophysics for People in a Hurry", "Neil deGrasse Tyson"),
            ("The Elegant Universe", "Brian Greene"),
            ("Reality Is Not What It Seems", "Carlo Rovelli"),
            ("Seven Brief Lessons on Physics", "Carlo Rovelli"),
            ("The Gene: An Intimate History", "Siddhartha Mukherjee"),
            ("Homo Deus", "Yuval Noah Harari"),
            ("Life 3.0", "Max Tegmark"),
            ("The Innovators", "Walter Isaacson"),
            ("Steve Jobs", "Walter Isaacson"),
            ("Elon Musk Biography", "Walter Isaacson"),
            ("The Code Breaker", "Walter Isaacson"),
            ("Superintelligence", "Nick Bostrom"),
            ("Permanent Record", "Edward Snowden"),
            ("The Age of AI", "Henry A. Kissinger"),
            ("Algorithms to Live By", "Brian Christian"),
            ("Clean Code", "Robert C. Martin"),
            ("The Pragmatic Programmer", "Andrew Hunt"),
            ("Deep Learning", "Ian Goodfellow"),
            ("You Don't Know JS", "Kyle Simpson"),
            ("Python Crash Course", "Eric Matthes"),
            ("The Art of Computer Programming", "Donald Knuth"),
            ("Design Patterns", "Erich Gamma"),
            ("Hackers & Painters", "Paul Graham"),
        ],
    },
    {
        "category": "Literature & Classics",
        "items": [
            ("The Little Prince", "Antoine de Saint-Exupery"),
            ("Hamlet", "William Shakespeare"),
            ("Macbeth", "William Shakespeare"),
            ("The Great Gatsby", "F. Scott Fitzgerald"),
            ("Moby Dick", "Herman Melville"),
            ("War and Peace", "Leo Tolstoy"),
            ("Ulysses", "James Joyce"),
            ("Don Quixote", "Miguel de Cervantes"),
            ("The Divine Comedy", "Dante Alighieri"),
            ("Faust", "Johann Wolfgang von Goethe"),
            ("The Old Man and the Sea", "Ernest Hemingway"),
            ("Animal Farm", "George Orwell"),
            ("Brave New World", "Aldous Huxley"),
            ("Lolita", "Vladimir Nabokov"),
            ("Wuthering Heights", "Emily Bronte"),
            ("Jane Eyre", "Charlotte Bronte"),
            ("Pride and Prejudice", "Jane Austen"),
            ("Great Expectations", "Charles Dickens"),
            ("Frankenstein", "Mary Shelley"),
            ("Dracula", "Bram Stoker"),
            ("The Picture of Dorian Gray", "Oscar Wilde"),
            ("Heart of Darkness", "Joseph Conrad"),
            ("Waiting for Godot", "Samuel Beckett"),
            ("The Stranger", "Albert Camus"),
            ("Metamorphosis", "Franz Kafka"),
        ],
    },
]

DEFAULT_VENDOR_IDS = [
    "B8Rfq6imp8PXZXr4007Z6q3sT792",
    "TWKJZAtCAVXvidV4M0UabgXDx7g1",
    "avx8OJAswdVfHk3jZxpvktMyXeA3",
    "mJMKNG3JbTZHZqeeeBqMUd18bEv1",
    "onMR9rehR8f3r6SrhLNCmnICr4U2",
]


def parse_args() -> argparse.Namespace:
    script_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Bulk upload 125 books to Firestore.")
    parser.add_argument(
        "--service-account",
        default=str(script_dir / "key.json"),
        help="Path to Firebase service account JSON (default: python_processor/key.json).",
    )
    parser.add_argument(
        "--vendors-collection",
        default="vendors",
        help="Vendors collection name (default: vendors).",
    )
    parser.add_argument(
        "--books-collection",
        default="books",
        help="Books collection name (default: books).",
    )
    parser.add_argument(
        "--vendor-ids",
        default="",
        help="Comma-separated list of exactly 5 vendor IDs. If omitted, first 5 vendor docs are used.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=20260402,
        help="Random seed for reproducible prices.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build and preview payload without writing to Firestore.",
    )
    return parser.parse_args()


def init_firestore(service_account_path: str) -> firestore.Client:
    sa_path = Path(service_account_path).expanduser().resolve()
    if not sa_path.is_file():
        raise FileNotFoundError(f"Service account file not found: {sa_path}")

    if not firebase_admin._apps:
        cred = credentials.Certificate(str(sa_path))
        firebase_admin.initialize_app(cred)
    return firestore.client()


def resolve_vendor_ids(
    db: firestore.Client,
    vendors_collection: str,
    vendor_ids_csv: str,
) -> list[str]:
    parsed = [part.strip() for part in vendor_ids_csv.split(",") if part.strip()]
    if parsed:
        if len(parsed) != 5:
            raise ValueError("You must provide exactly 5 vendor IDs in --vendor-ids.")
        return parsed

    if len(DEFAULT_VENDOR_IDS) == 5:
        return DEFAULT_VENDOR_IDS

    snapshots = list(db.collection(vendors_collection).limit(5).stream())
    if len(snapshots) < 5:
        raise ValueError(
            f"Found only {len(snapshots)} vendor docs in `{vendors_collection}`. At least 5 are required."
        )
    return [snap.id for snap in snapshots]


def image_url_for_title(title: str) -> str:
    return f"https://placehold.co/400x600/2c3e50/ffffff?text={quote_plus(title)}"


def build_books_payload(vendor_ids: list[str], *, seed: int) -> list[dict]:
    random.seed(seed)
    payload: list[dict] = []

    for group_index, group in enumerate(BOOKS_BY_CATEGORY):
        category = str(group["category"])
        items = group["items"]
        vendor_id = vendor_ids[group_index]

        if not isinstance(items, Iterable):
            continue

        for title, author in items:
            payload.append(
                {
                    "title": title,
                    "author": author,
                    "price": random.randint(5000, 25000),
                    "category": category,
                    "vendorId": vendor_id,
                    "imageUrl": image_url_for_title(title),
                    "status": "available",
                }
            )

    return payload


def write_books(db: firestore.Client, books_collection: str, books: list[dict]) -> int:
    if not books:
        return 0

    total_written = 0
    batch = db.batch()
    ops = 0

    for book in books:
        doc_ref = db.collection(books_collection).document()
        batch.set(doc_ref, book)
        ops += 1
        total_written += 1

        if ops >= 400:
            batch.commit()
            batch = db.batch()
            ops = 0

    if ops > 0:
        batch.commit()

    return total_written


def main() -> None:
    args = parse_args()

    try:
        db = init_firestore(args.service_account)
        vendor_ids = resolve_vendor_ids(db, args.vendors_collection, args.vendor_ids)
        books = build_books_payload(vendor_ids, seed=args.seed)

        if len(books) != 125:
            raise ValueError(f"Expected 125 books, got {len(books)}")

        print("Vendor IDs in use:")
        for idx, vendor_id in enumerate(vendor_ids, start=1):
            print(f"  Vendor {idx}: {vendor_id}")

        if args.dry_run:
            print("\n[DRY RUN] No documents written.")
            print(f"[DRY RUN] Prepared books: {len(books)}")
            return

        inserted = write_books(db, args.books_collection, books)
        print(f"\n[DONE] Firestore database: {DEFAULT_DATABASE}")
        print(f"[DONE] Collection: {args.books_collection}")
        print(f"[DONE] Inserted books: {inserted}")
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
