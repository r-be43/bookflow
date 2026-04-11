import { initializeApp } from 'firebase/app';
import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: 'AIzaSyBsjRcqkobZGB3PuI25fe4NPcjEKRxH3Wk',
    authDomain: 'bookflow2004.firebaseapp.com',
    projectId: 'bookflow2004',
    storageBucket: 'bookflow2004.firebasestorage.app',
    messagingSenderId: '532819231327',
    appId: '1:532819231327:web:01939ee4b68ca4fb1a51ea',
    measurementId: 'G-X5T68CWX0D',
};

const CATEGORIES = [
    'Fiction',
    'Translated Fiction',
    'Self-Help',
    'Psychology',
    'History',
    'Philosophy',
    'Sci-Fi & Fantasy',
    'Horror & Thriller',
    'Biography',
    'Children & YA',
    'Business',
    'Religion & Spirituality',
    'Poetry',
    'Politics',
    'Technology & Programming',
];

function normalizeCategory(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const compact = raw.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    const key = compact.replace(/\s+/g, '');

    const aliasMap = {
        scifi: 'Sci-Fi & Fantasy',
        scifiandfantasy: 'Sci-Fi & Fantasy',
        fantasy: 'Sci-Fi & Fantasy',
        children: 'Children & YA',
        kids: 'Children & YA',
        youngadult: 'Children & YA',
        selfhelp: 'Self-Help',
        thriller: 'Horror & Thriller',
        horror: 'Horror & Thriller',
        technology: 'Technology & Programming',
        programming: 'Technology & Programming',
        religion: 'Religion & Spirituality',
        spirituality: 'Religion & Spirituality',
    };

    if (aliasMap[key]) return aliasMap[key];
    const exact = CATEGORIES.find((cat) => cat.toLowerCase() === compact);
    return exact || raw;
}

function printDistribution(label, entries) {
    console.log(`\n${label}`);
    CATEGORIES.forEach((category) => {
        console.log(`- ${category}: ${entries.get(category) || 0}`);
    });
}

async function main() {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const snapshot = await getDocs(collection(db, 'books'));

    const counts = new Map();
    CATEGORIES.forEach((category) => counts.set(category, 0));

    const updates = [];
    snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const existing = normalizeCategory(data.genre || data.category);
        if (counts.has(existing)) {
            counts.set(existing, (counts.get(existing) || 0) + 1);
            return;
        }
        updates.push({
            docId: docSnap.id,
            title: String(data.title || '').trim() || '(Untitled)',
            data,
        });
    });

    printDistribution('Distribution before audit:', counts);
    console.log(`\nBooks scanned: ${snapshot.size}`);
    console.log(`Books with missing/unknown genre: ${updates.length}`);

    let applied = 0;
    for (const item of updates) {
        const nextCategory = [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
        await updateDoc(doc(db, 'books', item.docId), {
            category: nextCategory,
            genre: nextCategory,
        });
        counts.set(nextCategory, (counts.get(nextCategory) || 0) + 1);
        applied += 1;
    }

    printDistribution('Distribution after audit:', counts);
    console.log(`\nUpdated books: ${applied}`);
}

main().catch((error) => {
    console.error('Genre audit failed:', error);
    process.exitCode = 1;
});
