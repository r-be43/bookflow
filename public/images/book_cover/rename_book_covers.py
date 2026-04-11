import argparse
import re
import unicodedata
from pathlib import Path

import pytesseract
from PIL import Image, ImageEnhance, ImageOps
from thefuzz import fuzz, process

BOOK_TITLES = [
    "1984",
    "The Alchemist",
    "One Hundred Years of Solitude",
    "The Forty Rules of Love",
    "Granada Trilogy",
    "The Blue Elephant",
    "Utopia",
    "In My Heart a Hebrew Female",
    "The Da Vinci Code",
    "Les Miserables",
    "Murder on the Orient Express",
    "Cairo Trilogy",
    "Azazeel",
    "Diamond Dust",
    "The Bamboo Stalk",
    "Crime and Punishment",
    "Anna Karenina",
    "Gone with the Wind",
    "The Cairo Modern",
    "The Thief and the Dogs",
    "Memory in the Flesh",
    "Black Suits You",
    "Season of Migration to the North",
    "Miramar",
    "The Prophet",
    "Atomic Habits",
    "Rich Dad Poor Dad",
    "The Subtle Art of Not Giving a F*ck",
    "Think and Grow Rich",
    "The Power of Now",
    "Man's Search for Meaning",
    "The Monk Who Sold His Ferrari",
    "How to Win Friends",
    "The 5 Second Rule",
    "The 5 Love Languages",
    "Men Are from Mars",
    "Surrounded by Idiots",
    "The Pistachio Theory",
    "Because You Are God",
    "I Missed a Prayer",
    "The Richest Man in Babylon",
    "Awaken the Giant Within",
    "The Shallows",
    "Thinking Fast and Slow",
    "Quiet",
    "The Power of Habit",
    "The Miracle Morning",
    "Time Management",
    "Eat That Frog",
    "The Psychology of Money",
    "Sapiens",
    "A Brief History of Time",
    "Muqaddimah of Ibn Khaldun",
    "History of Baghdad",
    "The Genius of Al-Aqqad",
    "Thus Spoke Zarathustra",
    "Sophie's World",
    "The Clash of Civilizations",
    "Orientalism",
    "The Social Contract",
    "The Prince",
    "The Art of War",
    "Muallaqat",
    "Al-Aghani",
    "Meadows of Gold",
    "The Muqaddimah",
    "Kitab al-Ibar",
    "Al-Fitna al-Kubra",
    "The Crusades Through Arab Eyes",
    "Decisive Moments in the History of Islam",
    "The Map of Knowledge",
    "Guns Germs and Steel",
    "The Silk Roads",
    "SPQR",
    "Jerusalem: The Biography",
    "Cosmos",
    "The Selfish Gene",
    "Astrophysics for People in a Hurry",
    "The Elegant Universe",
    "Reality Is Not What It Seems",
    "Seven Brief Lessons on Physics",
    "The Gene: An Intimate History",
    "Homo Deus",
    "Life 3.0",
    "The Innovators",
    "Steve Jobs",
    "Elon Musk Biography",
    "The Code Breaker",
    "Superintelligence",
    "Permanent Record",
    "The Age of AI",
    "Algorithms to Live By",
    "Clean Code",
    "The Pragmatic Programmer",
    "Deep Learning",
    "You Don't Know JS",
    "Python Crash Course",
    "The Art of Computer Programming",
    "Design Patterns",
    "Hackers & Painters",
    "The Little Prince",
    "Hamlet",
    "Macbeth",
    "The Great Gatsby",
    "Moby Dick",
    "War and Peace",
    "Ulysses",
    "Don Quixote",
    "The Divine Comedy",
    "Faust",
    "The Old Man and the Sea",
    "Animal Farm",
    "Brave New World",
    "Lolita",
    "Wuthering Heights",
    "Jane Eyre",
    "Pride and Prejudice",
    "Great Expectations",
    "Frankenstein",
    "Dracula",
    "The Picture of Dorian Gray",
    "Heart of Darkness",
    "Waiting for Godot",
    "The Stranger",
    "Metamorphosis",
]

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def sanitize_filename(name: str) -> str:
    name = re.sub(r'[<>:"/\\|?*]', "", name)
    name = re.sub(r"\s+", " ", name).strip().rstrip(".")
    return name or "untitled"


def unique_target_path(target_path: Path) -> Path:
    if not target_path.exists():
        return target_path

    stem = target_path.stem
    suffix = target_path.suffix
    parent = target_path.parent
    i = 1
    while True:
        candidate = parent / f"{stem} ({i}){suffix}"
        if not candidate.exists():
            return candidate
        i += 1


def extract_text_from_image(image_path: Path, lang: str) -> str:
    image = Image.open(image_path)
    gray = ImageOps.grayscale(image)

    contrast = ImageEnhance.Contrast(gray).enhance(2.0)
    processed = ImageOps.autocontrast(contrast)

    text1 = pytesseract.image_to_string(gray, lang=lang, config="--oem 3 --psm 6")
    text2 = pytesseract.image_to_string(processed, lang=lang, config="--oem 3 --psm 11")

    combined = f"{text1}\n{text2}".strip()
    return combined


def best_title_match(extracted_text: str):
    query = normalize_text(extracted_text)
    choices = [normalize_text(title) for title in BOOK_TITLES]

    result = process.extractOne(query, choices, scorer=fuzz.token_set_ratio)
    if not result:
        return None, 0

    matched_normalized, score = result[0], result[1]

    for original in BOOK_TITLES:
        if normalize_text(original) == matched_normalized:
            return original, score

    return None, 0


def iter_image_files(folder: Path):
    for path in sorted(folder.iterdir()):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
            yield path


def main():
    parser = argparse.ArgumentParser(
        description="Rename book cover images using OCR + fuzzy title matching."
    )
    parser.add_argument(
        "--folder",
        type=Path,
        default=Path("book_cover"),
        help='Folder containing cover images (default: "book_cover")',
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=60,
        help="Confidence threshold to flag low matches (default: 60)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually rename files. Without this flag, dry-run mode is used.",
    )
    parser.add_argument(
        "--skip-low-confidence",
        action="store_true",
        help="In --apply mode, skip renaming if confidence is below threshold.",
    )
    parser.add_argument(
        "--lang",
        default="eng",
        help='Tesseract language(s), e.g. "eng" or "eng+ara" (default: eng)',
    )
    parser.add_argument(
        "--tesseract-cmd",
        default="",
        help=r'Optional full path to tesseract.exe (e.g. "C:\Program Files\Tesseract-OCR\tesseract.exe")',
    )
    args = parser.parse_args()

    if args.tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = args.tesseract_cmd

    folder = args.folder
    if not folder.exists() or not folder.is_dir():
        print(f"[ERROR] Folder not found: {folder}")
        return

    mode = "APPLY (renaming enabled)" if args.apply else "DRY RUN (no changes)"
    print(f"\nMode: {mode}")
    print(f"Folder: {folder.resolve()}")
    print(f"Threshold: {args.threshold}\n")

    image_files = list(iter_image_files(folder))
    if not image_files:
        print("No supported image files found.")
        return

    renamed_count = 0
    skipped_count = 0
    low_conf_count = 0
    ocr_fail_count = 0

    for image_path in image_files:
        try:
            extracted_text = extract_text_from_image(image_path, args.lang)
        except Exception as e:
            print(f"[OCR ERROR] {image_path.name}: {e}")
            ocr_fail_count += 1
            continue

        if not extracted_text.strip():
            print(f"[NO OCR TEXT] {image_path.name} -> (skipped)")
            ocr_fail_count += 1
            continue

        best_title, score = best_title_match(extracted_text)
        if not best_title:
            print(f"[NO MATCH] {image_path.name} -> (skipped)")
            skipped_count += 1
            continue

        low_conf = score < args.threshold
        flag = " [LOW CONFIDENCE]" if low_conf else ""

        safe_title = sanitize_filename(best_title)
        proposed_path = image_path.with_name(f"{safe_title}{image_path.suffix}")
        final_path = unique_target_path(proposed_path)

        print(f"{image_path.name} -> {final_path.name} (score={score}){flag}")

        if low_conf:
            low_conf_count += 1

        if args.apply:
            if args.skip_low_confidence and low_conf:
                print("  -> skipped due to low confidence")
                skipped_count += 1
                continue

            if image_path.resolve() == final_path.resolve():
                print("  -> unchanged (already correct name)")
                continue

            try:
                image_path.rename(final_path)
                renamed_count += 1
            except Exception as e:
                print(f"  -> rename failed: {e}")
                skipped_count += 1

    print("\n--- Summary ---")
    print(f"Total images scanned: {len(image_files)}")
    print(f"Renamed: {renamed_count}")
    print(f"Low confidence flagged (<{args.threshold}): {low_conf_count}")
    print(f"Skipped: {skipped_count}")
    print(f"OCR failures / empty text: {ocr_fail_count}")


if __name__ == "__main__":
    main()
