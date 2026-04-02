import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase-client.js';

const BOOKS_COLLECTION = 'books';

function normalizeDocId(documentId) {
    const id = String(documentId ?? '').trim();
    if (!id) {
        throw new Error('A valid Firestore document ID is required.');
    }
    return id;
}

/**
 * Delete a book document by Firestore document ID.
 * @param {string} documentId
 * @returns {Promise<{success: boolean, id: string}>}
 */
export async function deleteBookById(documentId) {
    const id = normalizeDocId(documentId);
    await deleteDoc(doc(db, BOOKS_COLLECTION, id));
    return { success: true, id };
}

/**
 * Update a book document by Firestore document ID.
 * @param {string} documentId
 * @param {Object} newData
 * @returns {Promise<{success: boolean, id: string}>}
 */
export async function updateBookById(documentId, newData) {
    const id = normalizeDocId(documentId);

    if (!newData || typeof newData !== 'object' || Array.isArray(newData)) {
        throw new Error('newData must be a plain object.');
    }

    // Keep a write timestamp for traceability in admin flows.
    const payload = {
        ...newData,
        updatedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, BOOKS_COLLECTION, id), payload);
    return { success: true, id };
}

/**
 * Fetch all books from Firestore once.
 * @returns {Promise<Array<Object>>}
 */
export async function fetchAllBooks() {
    const snapshot = await getDocs(collection(db, BOOKS_COLLECTION));
    return snapshot.docs.map((docSnap) => ({
        ...docSnap.data(),
        docId: docSnap.id,
    }));
}

/**
 * Subscribe to real-time books updates.
 * @param {(books: Array<Object>) => void} onData
 * @param {(error: unknown) => void} [onError]
 * @returns {() => void} unsubscribe function
 */
export function subscribeToBooks(onData, onError) {
    return onSnapshot(
        collection(db, BOOKS_COLLECTION),
        (snapshot) => {
            const books = snapshot.docs.map((docSnap) => ({
                ...docSnap.data(),
                docId: docSnap.id,
            }));
            onData(books);
        },
        (error) => {
            if (typeof onError === 'function') onError(error);
        }
    );
}

/**
 * Fetch books by vendorId with optional phone fallback for migration.
 * @param {string} vendorId
 * @param {string} [vendorPhone]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchBooksByVendorId(vendorId, vendorPhone = '') {
    const id = String(vendorId || '').trim();
    const phone = String(vendorPhone || '').trim();
    const byId = id
        ? await getDocs(query(collection(db, BOOKS_COLLECTION), where('vendorId', '==', id)))
        : { docs: [] };
    const byPhone = phone
        ? await getDocs(query(collection(db, BOOKS_COLLECTION), where('vendorPhone', '==', phone)))
        : { docs: [] };

    const map = new Map();
    [...(byId.docs || []), ...(byPhone.docs || [])].forEach((docSnap) => {
        map.set(docSnap.id, { ...docSnap.data(), docId: docSnap.id });
    });
    return [...map.values()];
}

/**
 * Delete all books related to a vendor.
 * Uses vendorId first with optional phone fallback (hybrid migration support).
 * @param {string} vendorId
 * @param {string} [vendorPhone]
 * @returns {Promise<{success: boolean, deletedCount: number}>}
 */
export async function deleteBooksByVendorId(vendorId, vendorPhone = '') {
    const books = await fetchBooksByVendorId(vendorId, vendorPhone);
    await Promise.all(books.map((book) => deleteBookById(book.docId)));
    return { success: true, deletedCount: books.length };
}
