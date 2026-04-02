import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase-client.js';

const VENDORS_COLLECTION = 'vendors';

export async function upsertVendorProfile(vendorId, payload) {
    const id = String(vendorId || '').trim();
    if (!id) throw new Error('vendorId is required');
    const safePayload = {
        vendorId: id,
        storeName: String(payload.storeName || '').trim(),
        email: String(payload.email || '').trim().toLowerCase(),
        phone: String(payload.phone || '').trim(),
        status: payload.status === 'suspended' ? 'suspended' : 'active',
        createdAt: payload.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, VENDORS_COLLECTION, id), safePayload, { merge: true });
    return { success: true, id };
}

export async function getVendorProfileById(vendorId) {
    const id = String(vendorId || '').trim();
    if (!id) return null;
    const snap = await getDoc(doc(db, VENDORS_COLLECTION, id));
    if (!snap.exists()) return null;
    return { ...snap.data(), docId: snap.id };
}

export async function getAllVendors() {
    const snapshot = await getDocs(collection(db, VENDORS_COLLECTION));
    return snapshot.docs.map((docSnap) => ({ ...docSnap.data(), docId: docSnap.id }));
}

export async function findVendorByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return null;
    const snap = await getDocs(query(collection(db, VENDORS_COLLECTION), where('email', '==', normalized)));
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return { ...docSnap.data(), docId: docSnap.id };
}

export async function updateVendorStatus(vendorId, status) {
    const id = String(vendorId || '').trim();
    if (!id) throw new Error('vendorId is required');
    await updateDoc(doc(db, VENDORS_COLLECTION, id), {
        status: status === 'suspended' ? 'suspended' : 'active',
        updatedAt: serverTimestamp(),
    });
}

export async function deleteVendorById(vendorId) {
    const id = String(vendorId || '').trim();
    if (!id) throw new Error('vendorId is required');
    await deleteDoc(doc(db, VENDORS_COLLECTION, id));
}
