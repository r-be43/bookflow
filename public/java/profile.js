import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { auth, db } from './firebase-client.js';
import { BOOK_COVER_ONERROR, getBookCoverAttrs } from './cover-utils.js';
import { safeStorage } from './storage.js';

const PROCESSED_STATUSES = new Set(['approved', 'rejected', 'completed', 'cancelled', 'picked_up', 'picked up']);
const ACTIVE_STATUSES = new Set(['pending', 'active', 'confirmed']);

const state = {
    user: null,
    profile: null,
    booksByKey: new Map(),
    savedEntries: [],
    reservationsByUid: [],
    reservationsByPhone: [],
    unsubscribers: [],
};

window.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupSettings();
    bootstrapProfile();
});

async function bootstrapProfile() {
    await preloadBooks();
    onAuthStateChanged(auth, async (user) => {
        cleanupRealtime();
        if (!user) return;
        state.user = user;
        state.profile = await resolveUserProfile(user);
        renderUserInfo();
        subscribeSavedBooks();
        subscribeReservations();
    });
}

async function preloadBooks() {
    try {
        const snap = await getDocs(collection(db, 'books'));
        const nextMap = new Map();
        snap.docs.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const payload = {
                docId: docSnap.id,
                id: String(data.id ?? docSnap.id),
                title: String(data.title || 'Untitled'),
                author: String(data.author || 'Unknown author'),
                image: String(data.coverUrl || data.image || data.cover || ''),
                category: String(data.category || ''),
            };
            nextMap.set(String(docSnap.id), payload);
            nextMap.set(String(payload.id), payload);
        });
        state.booksByKey = nextMap;
    } catch (error) {
        console.error('Failed to preload books for profile:', error);
    }
}

async function resolveUserProfile(user) {
    const fallback = {
        uid: String(user.uid || ''),
        name: String(user.displayName || 'Reader'),
        email: String(user.email || ''),
        phone: '',
    };
    try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (!userSnap.exists()) return fallback;
        const data = userSnap.data() || {};
        return {
            uid: fallback.uid,
            name: String(data.name || user.displayName || 'Reader'),
            email: String(data.email || user.email || ''),
            phone: String(data.phone || ''),
        };
    } catch {
        return fallback;
    }
}

function subscribeSavedBooks() {
    const uid = String(state.user?.uid || '');
    if (!uid) return;
    const savedQuery = query(collection(db, 'saved_books'), where('userId', '==', uid));
    const unsubscribe = onSnapshot(savedQuery, (snapshot) => {
        state.savedEntries = snapshot.docs.map((docSnap) => ({ docId: docSnap.id, ...docSnap.data() }));
        renderSavedBooks();
        updateStats();
    });
    state.unsubscribers.push(unsubscribe);
}

function subscribeReservations() {
    const uid = String(state.user?.uid || '').trim();
    const phone = String(state.profile?.phone || '').trim();
    if (!uid && !phone) return;

    if (uid) {
        const uidQuery = query(collection(db, 'reservations'), where('userId', '==', uid));
        const unsubscribeUid = onSnapshot(uidQuery, (snapshot) => {
            state.reservationsByUid = snapshot.docs.map((docSnap) => ({ docId: docSnap.id, ...docSnap.data() }));
            renderReservationSections();
        });
        state.unsubscribers.push(unsubscribeUid);
    }

    if (phone) {
        const phoneQuery = query(collection(db, 'reservations'), where('userPhone', '==', phone));
        const unsubscribePhone = onSnapshot(phoneQuery, (snapshot) => {
            state.reservationsByPhone = snapshot.docs.map((docSnap) => ({ docId: docSnap.id, ...docSnap.data() }));
            renderReservationSections();
        });
        state.unsubscribers.push(unsubscribePhone);
    }
}

function renderUserInfo() {
    const user = state.profile || {};
    setText('profile-name', user.name || 'Reader');
    setText('profile-email', user.email || 'No email');
    setText('settings-name', user.name || '-');
    setText('settings-email', user.email || '-');

    const avatar = document.getElementById('profile-avatar');
    if (avatar) {
        avatar.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name || 'Reader')}`;
    }
}

function renderSavedBooks() {
    const grid = document.getElementById('profile-saved-grid');
    const empty = document.getElementById('empty-saved');
    if (!grid || !empty) return;
    grid.innerHTML = '';

    const savedBooks = state.savedEntries
        .map((entry) => {
            const key = String(entry.bookId || '').trim();
            const book = state.booksByKey.get(key);
            return book || {
                id: key,
                title: String(entry.title || 'Book'),
                author: String(entry.author || 'Unknown author'),
                image: String(entry.image || ''),
            };
        })
        .filter(Boolean);

    if (!savedBooks.length) {
        grid.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }

    grid.style.display = 'grid';
    empty.style.display = 'none';
    savedBooks.forEach((book) => grid.appendChild(createBookCard(book)));
}

function renderReservationSections() {
    const merged = mergeReservations();
    const history = merged.filter((item) => PROCESSED_STATUSES.has(normalizeStatus(item.status)));
    const active = merged.filter((item) => ACTIVE_STATUSES.has(normalizeStatus(item.status)) || !item.status);

    renderHistory(history);
    renderReserved(active);
    updateStats();
}

function renderHistory(items) {
    const grid = document.getElementById('profile-history-grid');
    const empty = document.getElementById('empty-history');
    if (!grid || !empty) return;
    grid.innerHTML = '';

    if (!items.length) {
        grid.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }

    grid.style.display = 'grid';
    empty.style.display = 'none';
    items
        .sort((a, b) => getTimestampMs(b.updatedAt || b.createdAt) - getTimestampMs(a.updatedAt || a.createdAt))
        .forEach((reservation) => {
            grid.appendChild(createHistoryCard(reservation));
        });
}

function renderReserved(items) {
    const list = document.getElementById('reserved-list');
    const empty = document.getElementById('empty-reserved');
    if (!list || !empty) return;
    list.innerHTML = '';

    if (!items.length) {
        list.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }

    list.style.display = 'flex';
    empty.style.display = 'none';
    items
        .sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt))
        .forEach((reservation) => {
            const node = document.createElement('div');
            const status = normalizeStatus(reservation.status || 'pending');
            const book = resolveBookFromReservation(reservation);
            const coverAttrs = getBookCoverAttrs(book.title);
            node.className = 'reservation-item';
            node.innerHTML = `
                <div class="reservation-book-cover-wrap">
                    <img src="${escapeHtml(coverAttrs.src)}" alt="${escapeHtml(book.title)}" data-cover-fallbacks="${escapeHtml(coverAttrs.fallbacks)}" onerror="${BOOK_COVER_ONERROR}">
                </div>
                <div class="reservation-info">
                    <h4>${escapeHtml(truncate(book.title, 35))}</h4>
                    <p class="res-author">${escapeHtml(book.author)}</p>
                    <p class="reservation-library">${escapeHtml(String(reservation.library || 'Library'))}</p>
                    <p class="reservation-date-text">${formatDate(reservation.createdAt)}</p>
                </div>
                <div class="reservation-status">
                    <span class="res-badge profile-status-badge profile-status--pending">${escapeHtml(toTitle(status))}</span>
                </div>
            `;
            list.appendChild(node);
        });
}

function createBookCard(book) {
    const card = document.createElement('div');
    card.className = 'mini-book-card';
    const id = String(book.id || book.docId || '').trim();
    const coverAttrs = getBookCoverAttrs(book.title);
    card.innerHTML = `
        <div class="mini-book-cover-wrap">
            <img src="${escapeHtml(coverAttrs.src)}" alt="${escapeHtml(book.title)}" data-cover-fallbacks="${escapeHtml(coverAttrs.fallbacks)}" onerror="${BOOK_COVER_ONERROR}">
        </div>
        <p>${escapeHtml(truncate(book.title, 24))}</p>
    `;
    card.addEventListener('click', () => {
        if (!id) return;
        window.location.href = `details.html?id=${encodeURIComponent(id)}`;
    });
    return card;
}

function createHistoryCard(reservation) {
    const book = resolveBookFromReservation(reservation);
    const status = normalizeStatus(reservation.status);
    const statusClass = status === 'approved' ? 'profile-status--approved' : status === 'rejected' ? 'profile-status--rejected' : 'profile-status--neutral';
    const coverAttrs = getBookCoverAttrs(book.title);
    const node = document.createElement('div');
    node.className = 'history-book-card';
    node.innerHTML = `
        <div class="history-book-cover-wrap">
            <img src="${escapeHtml(coverAttrs.src)}" alt="${escapeHtml(book.title)}" data-cover-fallbacks="${escapeHtml(coverAttrs.fallbacks)}" onerror="${BOOK_COVER_ONERROR}">
        </div>
        <p>${escapeHtml(truncate(book.title, 26))}</p>
        <span class="profile-status-badge ${statusClass}">${escapeHtml(toTitle(status || 'processed'))}</span>
    `;
    return node;
}

function resolveBookFromReservation(reservation) {
    const key = String(reservation.bookId || '').trim();
    const book = state.booksByKey.get(key);
    return book || {
        id: key,
        title: String(reservation.title || reservation.bookTitle || 'Book'),
        author: String(reservation.author || 'Unknown author'),
        image: String(reservation.image || ''),
    };
}

function mergeReservations() {
    const map = new Map();
    [...state.reservationsByUid, ...state.reservationsByPhone].forEach((item) => {
        map.set(String(item.docId || ''), item);
    });
    return Array.from(map.values());
}

function updateStats() {
    const merged = mergeReservations();
    const processedCount = merged.filter((item) => PROCESSED_STATUSES.has(normalizeStatus(item.status))).length;
    setText('stat-favorites', String(state.savedEntries.length));
    setText('stat-reserved', String(merged.filter((item) => ACTIVE_STATUSES.has(normalizeStatus(item.status)) || !item.status).length));
    setText('stat-read', String(processedCount));
}

function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            tabBtns.forEach((b) => b.classList.remove('active'));
            tabContents.forEach((c) => c.classList.remove('active'));
            btn.classList.add('active');
            const tabId = `tab-${btn.getAttribute('data-tab')}`;
            document.getElementById(tabId)?.classList.add('active');
        });
    });
}

function setupSettings() {
    const toggle = document.getElementById('notif-toggle');
    if (!toggle) return;
    const stored = safeStorage.get('profileNotifEnabled');
    if (stored != null) toggle.checked = stored === '1';
    toggle.addEventListener('change', () => {
        safeStorage.set('profileNotifEnabled', toggle.checked ? '1' : '0');
    });
}

function cleanupRealtime() {
    state.unsubscribers.forEach((unsubscribe) => {
        try { unsubscribe(); } catch {}
    });
    state.unsubscribers = [];
    state.savedEntries = [];
    state.reservationsByUid = [];
    state.reservationsByPhone = [];
}

function normalizeStatus(status) {
    return String(status || '').trim().toLowerCase();
}

function getTimestampMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
    const ms = getTimestampMs(value);
    if (!ms) return 'Date not available';
    return new Date(ms).toLocaleDateString();
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value ?? '');
}

function toTitle(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function truncate(text, length) {
    const t = String(text || '');
    return t.length > length ? `${t.slice(0, length)}...` : t;
}

function escapeHtml(input) {
    const div = document.createElement('div');
    div.textContent = String(input || '');
    return div.innerHTML;
}
