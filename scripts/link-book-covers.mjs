import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const coversDir = path.join(projectRoot, 'public', 'images', 'book_cover');

// Reuse your current project config.
const firebaseConfig = {
    apiKey: 'AIzaSyBsjRcqkobZGB3PuI25fe4NPcjEKRxH3Wk',
    authDomain: 'bookflow2004.firebaseapp.com',
    projectId: 'bookflow2004',
    storageBucket: 'bookflow2004.firebasestorage.app',
    messagingSenderId: '532819231327',
    appId: '1:532819231327:web:01939ee4b68ca4fb1a51ea',
    measurementId: 'G-X5T68CWX0D',
};

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.jfif', '.png', '.webp']);

function normalizeName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/['’`]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function fileNameWithoutExt(fileName) {
    return fileName.slice(0, fileName.length - path.extname(fileName).length);
}

async function loadCoverFiles() {
    const files = await readdir(coversDir, { withFileTypes: true });
    const coverMap = new Map();

    files.forEach((entry) => {
        if (!entry.isFile()) return;
        const ext = path.extname(entry.name).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) return;

        const baseName = fileNameWithoutExt(entry.name);
        const normalized = normalizeName(baseName);
        if (!normalized) return;

        // Keep first seen file for each normalized key.
        if (!coverMap.has(normalized)) {
            coverMap.set(normalized, entry.name);
        }
    });

    return coverMap;
}

async function main() {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const coverMap = await loadCoverFiles();
    const snapshot = await getDocs(collection(db, 'books'));

    let matched = 0;
    let updated = 0;
    const unmatchedTitles = [];

    for (const bookDoc of snapshot.docs) {
        const data = bookDoc.data() || {};
        const title = String(data.title || '').trim();
        if (!title) continue;

        const normalizedTitle = normalizeName(title);
        const matchedFile = coverMap.get(normalizedTitle);

        if (!matchedFile) {
            unmatchedTitles.push(title);
            continue;
        }

        matched += 1;
        const coverUrl = `/images/book_cover/${matchedFile}`;

        // Skip write if already linked.
        if (data.coverUrl === coverUrl) continue;

        await updateDoc(doc(db, 'books', bookDoc.id), {
            coverUrl,
        });
        updated += 1;
    }

    console.log('--- Cover linking finished ---');
    console.log(`Books scanned  : ${snapshot.size}`);
    console.log(`Books matched  : ${matched}`);
    console.log(`Books updated  : ${updated}`);
    console.log(`No match count : ${unmatchedTitles.length}`);

    if (unmatchedTitles.length) {
        console.log('\nUnmatched titles:');
        unmatchedTitles.slice(0, 50).forEach((title) => {
            console.log(`- ${title}`);
        });
        if (unmatchedTitles.length > 50) {
            console.log(`... and ${unmatchedTitles.length - 50} more`);
        }
    }
}

main().catch((error) => {
    console.error('Failed to link book covers:', error);
    process.exitCode = 1;
});
