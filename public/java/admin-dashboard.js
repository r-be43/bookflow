import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    where,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { auth, db } from './firebase-client.js';
import { getVendorProfileById } from './vendors-firestore-service.js';

const state = {
    vendor: null,
    books: [],
    reservations: [],
    rawReservations: [],
    reservationFilter: 'all',
    inventoryPage: 1,
    pageSize: 8,
    unsubscribes: [],
    pendingConfirmAction: null,
    quickEditBookId: '',
};

const el = {
    vendorName: document.getElementById('ad-vendor-name'),
    vendorNameSidebar: document.getElementById('ad-vendor-name-side'),
    kpiBooks: document.getElementById('ad-kpi-books'),
    kpiActive: document.getElementById('ad-kpi-active'),
    kpiCompleted: document.getElementById('ad-kpi-completed'),
    reservationBody: document.getElementById('ad-reservations-body'),
    inventoryBody: document.getElementById('ad-inventory-body'),
    inventoryEmpty: document.getElementById('ad-inventory-empty'),
    reservationEmpty: document.getElementById('ad-reservations-empty'),
    reservationsSection: document.getElementById('ad-section-reservations'),
    inventorySection: document.getElementById('ad-section-inventory'),
    dashboardSection: document.getElementById('ad-section-dashboard'),
    inventoryPageInfo: document.getElementById('ad-inventory-page-info'),
    inventoryPrev: document.getElementById('ad-inventory-prev'),
    inventoryNext: document.getElementById('ad-inventory-next'),
    addBookBtn: document.getElementById('ad-add-book-btn'),
    bookModal: document.getElementById('ad-book-modal'),
    closeBookModal: document.getElementById('ad-close-book-modal'),
    cancelBookModal: document.getElementById('ad-cancel-book-modal'),
    saveBookBtn: document.getElementById('ad-save-book-btn'),
    bookForm: document.getElementById('ad-book-form'),
    confirmModal: document.getElementById('ad-confirm-modal'),
    confirmMessage: document.getElementById('ad-confirm-message'),
    confirmCancel: document.getElementById('ad-confirm-cancel'),
    confirmSubmit: document.getElementById('ad-confirm-submit'),
    quickEditModal: document.getElementById('ad-quick-edit-modal'),
    quickEditForm: document.getElementById('ad-quick-edit-form'),
    quickEditTitle: document.getElementById('ad-quick-edit-title'),
    quickEditPrice: document.getElementById('ad-quick-edit-price'),
    quickEditStatus: document.getElementById('ad-quick-edit-status'),
    quickEditCancel: document.getElementById('ad-quick-edit-cancel'),
    quickEditSave: document.getElementById('ad-quick-edit-save'),
    logoutBtn: document.getElementById('ad-logout-btn'),
    reservationFilters: Array.from(document.querySelectorAll('[data-res-filter]')),
    navLinks: Array.from(document.querySelectorAll('[data-ad-nav]')),
};

window.addEventListener('DOMContentLoaded', () => {
    bootstrap().catch((error) => {
        console.error('Vendor dashboard failed to initialize:', error);
        showToast('Failed to initialize dashboard', 'error');
    });
});

async function bootstrap() {
    const authUser = await resolveVendorAuth();
    if (!authUser) return;
    bindUiEvents();
    startRealtimeSubscriptions();
}

function resolveVendorAuth() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                window.location.href = 'owner-login.html';
                resolve(null);
                return;
            }
            const vendor = await getVendorProfileById(user.uid);
            if (!vendor || (vendor.status || 'active') !== 'active') {
                window.location.href = 'owner-login.html';
                resolve(null);
                return;
            }
            state.vendor = {
                vendorId: String(vendor.vendorId || user.uid),
                storeName: String(vendor.storeName || user.displayName || 'Vendor Store'),
                phone: String(vendor.phone || ''),
            };
            if (el.vendorName) el.vendorName.textContent = state.vendor.storeName;
            if (el.vendorNameSidebar) el.vendorNameSidebar.textContent = state.vendor.storeName;
            resolve(user);
        });
    });
}

function bindUiEvents() {
    el.navLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const target = String(link.getAttribute('data-ad-nav') || 'dashboard');
            setActiveNav(target);
            focusSection(target);
        });
    });

    el.reservationFilters.forEach((button) => {
        button.addEventListener('click', () => {
            el.reservationFilters.forEach((b) => b.classList.remove('active'));
            button.classList.add('active');
            state.reservationFilter = String(button.getAttribute('data-res-filter') || 'all');
            renderReservations();
        });
    });

    el.inventoryPrev?.addEventListener('click', () => {
        state.inventoryPage = Math.max(1, state.inventoryPage - 1);
        renderInventory();
    });
    el.inventoryNext?.addEventListener('click', () => {
        const maxPage = Math.max(1, Math.ceil(state.books.length / state.pageSize));
        state.inventoryPage = Math.min(maxPage, state.inventoryPage + 1);
        renderInventory();
    });

    el.addBookBtn?.addEventListener('click', () => openBookModal());
    el.closeBookModal?.addEventListener('click', closeBookModal);
    el.cancelBookModal?.addEventListener('click', closeBookModal);
    el.saveBookBtn?.addEventListener('click', submitBookForm);
    el.confirmCancel?.addEventListener('click', closeConfirmModal);
    el.confirmSubmit?.addEventListener('click', submitConfirmAction);
    el.quickEditCancel?.addEventListener('click', closeQuickEditModal);
    el.quickEditSave?.addEventListener('click', submitQuickEditForm);

    el.inventoryBody?.addEventListener('click', async (event) => {
        const editBtn = event.target.closest('[data-action="edit-book"]');
        if (editBtn) {
            openBookModal(String(editBtn.getAttribute('data-book-id') || ''));
            showToast('Edit form opened', 'info');
            return;
        }
        const quickEditBtn = event.target.closest('[data-action="quick-edit-book"]');
        if (quickEditBtn) {
            openQuickEditModal(String(quickEditBtn.getAttribute('data-book-id') || ''));
            showToast('Quick edit opened', 'info');
            return;
        }
        const deleteBtn = event.target.closest('[data-action="delete-book"]');
        if (!deleteBtn) return;
        const docId = String(deleteBtn.getAttribute('data-book-id') || '').trim();
        if (!docId) return;
        showConfirmModal('Are you sure you want to delete this book?', async () => {
            await deleteDoc(doc(db, 'books', docId));
            showToast('Book deleted', 'success');
        });
    });

    el.reservationBody?.addEventListener('click', async (event) => {
        const completeBtn = event.target.closest('[data-action="mark-completed"]');
        if (completeBtn) {
            const reservationId = String(completeBtn.getAttribute('data-reservation-id') || '').trim();
            if (reservationId) {
                showConfirmModal('Are you sure you want to mark this reservation as completed?', async () => {
                    await updateReservationStatus(reservationId, 'completed');
                    showToast('Reservation marked as completed', 'success');
                });
            }
            return;
        }

        const cancelBtn = event.target.closest('[data-action="cancel-reservation"]');
        if (!cancelBtn) return;
        const reservationId = String(cancelBtn.getAttribute('data-reservation-id') || '').trim();
        if (!reservationId) return;
        showConfirmModal('Are you sure you want to cancel this reservation?', async () => {
            await updateReservationStatus(reservationId, 'cancelled', { makeBookAvailable: true });
            showToast('Reservation cancelled and book marked available', 'success');
        });
    });

    el.logoutBtn?.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = 'owner-login.html';
    });
}

function startRealtimeSubscriptions() {
    const booksQuery = query(collection(db, 'books'), where('vendorId', '==', state.vendor.vendorId));
    const unsubscribeBooks = onSnapshot(booksQuery, (snapshot) => {
        state.books = snapshot.docs.map((docSnap) => ({ docId: docSnap.id, ...docSnap.data() }));
        const maxPage = Math.max(1, Math.ceil(state.books.length / state.pageSize));
        if (state.inventoryPage > maxPage) state.inventoryPage = maxPage;
        renderAll();
    });

    const unsubscribeReservations = onSnapshot(collection(db, 'reservations'), (snapshot) => {
        state.rawReservations = snapshot.docs.map((docSnap) => ({ docId: docSnap.id, ...docSnap.data() }));
        hydrateVendorReservations();
        renderAll();
    });

    state.unsubscribes = [unsubscribeBooks, unsubscribeReservations];
}

function renderAll() {
    hydrateVendorReservations();
    renderKpis();
    renderReservations();
    renderInventory();
}

function hydrateVendorReservations() {
    const bookIds = new Set(state.books.map((book) => String(book.id || book.docId)));
    state.reservations = state.rawReservations.filter((reservation) => {
        const directVendor = String(reservation.vendorId || '') === state.vendor?.vendorId;
        const byBook = bookIds.has(String(reservation.bookId || ''));
        return directVendor || byBook;
    });
}

function renderKpis() {
    const availableBooks = state.books.filter((book) => {
        const status = String(book.status || '').toLowerCase();
        return status === 'available' || (book.isSuspended !== true && !status);
    }).length;

    const activeReservations = getFilteredReservationsByStatus('active').length;
    const completedReservations = getFilteredReservationsByStatus('completed').length;

    if (el.kpiBooks) el.kpiBooks.textContent = String(availableBooks);
    if (el.kpiActive) el.kpiActive.textContent = String(activeReservations);
    if (el.kpiCompleted) el.kpiCompleted.textContent = String(completedReservations);
}

function renderReservations() {
    if (!el.reservationBody) return;
    const rows = getReservationsByFilter(state.reservationFilter);
    el.reservationBody.innerHTML = '';

    if (!rows.length) {
        if (el.reservationEmpty) el.reservationEmpty.style.display = 'block';
        return;
    }
    if (el.reservationEmpty) el.reservationEmpty.style.display = 'none';

    const booksMap = new Map(state.books.map((book) => [String(book.id || book.docId), book]));
    rows
        .sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt))
        .forEach((reservation) => {
            const book = booksMap.get(String(reservation.bookId || '')) || {};
            const statusClass = getReservationClass(reservation.status);
            const statusLabel = getReservationLabel(reservation.status);
            const statusKey = String(reservation.status || '').toLowerCase();
            const canChange = !new Set(['completed', 'cancelled', 'picked up', 'picked_up']).has(statusKey);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(String(reservation.userName || reservation.customerName || 'Unknown'))}</td>
                <td>${escapeHtml(String(book.title || reservation.bookTitle || reservation.bookId || '--'))}</td>
                <td>${formatDate(reservation.createdAt)}</td>
                <td><span class="ad-status ${statusClass}">${statusLabel}</span></td>
                <td>
                    ${canChange ? `
                        <button class="ad-btn" type="button" data-action="mark-completed" data-reservation-id="${reservation.docId}">Mark as Completed</button>
                        <button class="ad-btn" type="button" data-action="cancel-reservation" data-reservation-id="${reservation.docId}">Cancel</button>
                    ` : '--'}
                </td>
            `;
            el.reservationBody.appendChild(tr);
        });
}

function renderInventory() {
    if (!el.inventoryBody) return;
    el.inventoryBody.innerHTML = '';

    if (!state.books.length) {
        if (el.inventoryEmpty) el.inventoryEmpty.style.display = 'block';
        updatePaging(1, 1);
        return;
    }
    if (el.inventoryEmpty) el.inventoryEmpty.style.display = 'none';

    const totalPages = Math.max(1, Math.ceil(state.books.length / state.pageSize));
    const page = Math.min(totalPages, Math.max(1, state.inventoryPage));
    state.inventoryPage = page;
    const start = (page - 1) * state.pageSize;
    const pageBooks = state.books
        .slice()
        .sort((a, b) => getTimestampMs(b.updatedAt) - getTimestampMs(a.updatedAt))
        .slice(start, start + state.pageSize);

    pageBooks.forEach((book) => {
        const tr = document.createElement('tr');
        const cover = String(book.coverUrl || book.image || 'https://placehold.co/44x60/e2e8f0/475569?text=B');
        tr.innerHTML = `
            <td>
                <div class="ad-book">
                    <img src="${cover}" alt="${escapeHtml(String(book.title || 'Book'))}">
                    <div>
                        <strong>${escapeHtml(String(book.title || 'Untitled'))}</strong><br>
                        <small>${escapeHtml(String(book.author || 'Unknown author'))}</small>
                    </div>
                </div>
            </td>
            <td>${escapeHtml(String(book.category || '--'))}</td>
            <td>${formatPrice(book.price)}</td>
            <td><span class="ad-status ${String(book.status || 'available').toLowerCase() === 'available' ? 'active' : 'completed'}">${escapeHtml(String(book.status || 'available'))}</span></td>
            <td>
                <button class="ad-btn" type="button" data-action="quick-edit-book" data-book-id="${book.docId}">Quick Edit</button>
                <button class="ad-btn" type="button" data-action="edit-book" data-book-id="${book.docId}">Edit</button>
                <button class="ad-btn" type="button" data-action="delete-book" data-book-id="${book.docId}">Delete</button>
            </td>
        `;
        el.inventoryBody.appendChild(tr);
    });
    updatePaging(page, totalPages);
}

function updatePaging(page, totalPages) {
    if (el.inventoryPageInfo) el.inventoryPageInfo.textContent = `Page ${page} of ${totalPages}`;
    if (el.inventoryPrev) el.inventoryPrev.disabled = page <= 1;
    if (el.inventoryNext) el.inventoryNext.disabled = page >= totalPages;
}

function openBookModal(docId = '') {
    if (!el.bookModal || !el.bookForm) return;
    el.bookForm.reset();
    el.bookForm.dataset.editDocId = '';
    if (docId) {
        const book = state.books.find((item) => item.docId === docId);
        if (book) {
            setFormValue('ad-book-title', book.title);
            setFormValue('ad-book-author', book.author);
            setFormValue('ad-book-category', book.category);
            setFormValue('ad-book-cover-url', book.coverUrl || book.image);
            setFormValue('ad-book-price', book.price);
            setFormValue('ad-book-status', book.status || 'available');
            setFormValue('ad-book-description', book.description);
            setFormValue('ad-book-sample-url', book.sampleUrl);
            el.bookForm.dataset.editDocId = book.docId;
        }
    }
    el.bookModal.classList.add('active');
}

function closeBookModal() {
    el.bookModal?.classList.remove('active');
}

function openQuickEditModal(docId) {
    const book = state.books.find((item) => item.docId === docId);
    if (!book || !el.quickEditModal) return;
    state.quickEditBookId = docId;
    if (el.quickEditTitle) el.quickEditTitle.value = String(book.title || 'Untitled');
    if (el.quickEditPrice) el.quickEditPrice.value = String(Number(book.price || 0));
    if (el.quickEditStatus) el.quickEditStatus.value = String(book.status || 'available');
    el.quickEditModal.classList.add('active');
}

function closeQuickEditModal() {
    state.quickEditBookId = '';
    el.quickEditForm?.reset();
    el.quickEditModal?.classList.remove('active');
}

async function submitQuickEditForm() {
    const docId = String(state.quickEditBookId || '').trim();
    if (!docId) return;
    const price = Number(el.quickEditPrice?.value || '');
    const status = String(el.quickEditStatus?.value || 'available').trim();
    if (!Number.isFinite(price) || price < 0) {
        showToast('Please provide a valid price', 'error');
        return;
    }
    await setDoc(
        doc(db, 'books', docId),
        { price, status, updatedAt: serverTimestamp() },
        { merge: true }
    );
    closeQuickEditModal();
    showToast('Book quick edit saved', 'success');
}

async function submitBookForm(event) {
    event.preventDefault();
    if (!state.vendor) return;

    const editDocId = String(el.bookForm?.dataset.editDocId || '').trim();
    const title = getFormValue('ad-book-title');
    const author = getFormValue('ad-book-author');
    const category = getFormValue('ad-book-category');
    const coverUrl = getFormValue('ad-book-cover-url');
    const description = getFormValue('ad-book-description');
    const sampleUrl = getFormValue('ad-book-sample-url');
    const status = getFormValue('ad-book-status') || 'available';
    const price = Number(getFormValue('ad-book-price'));
    if (!title || !author || !category || !coverUrl || !Number.isFinite(price)) {
        showToast('Please fill all required fields', 'error');
        return;
    }

    const payload = {
        title,
        author,
        category,
        coverUrl,
        image: coverUrl,
        description,
        sampleUrl,
        status,
        price,
        vendorId: state.vendor.vendorId,
        vendorPhone: state.vendor.phone,
        storeName: state.vendor.storeName,
        updatedAt: serverTimestamp(),
    };

    if (editDocId) {
        await setDoc(doc(db, 'books', editDocId), payload, { merge: true });
        showToast('Book updated successfully', 'success');
    } else {
        const createPayload = { ...payload, createdAt: serverTimestamp(), id: String(Date.now()) };
        await addDoc(collection(db, 'books'), createPayload);
        showToast('Book created successfully', 'success');
    }
    closeBookModal();
}

function focusSection(sectionKey) {
    const map = {
        dashboard: el.dashboardSection,
        reservations: el.reservationsSection,
        inventory: el.inventorySection,
    };
    map[sectionKey]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setActiveNav(sectionKey) {
    el.navLinks.forEach((link) => {
        const isActive = String(link.getAttribute('data-ad-nav') || '') === sectionKey;
        link.classList.toggle('active', isActive);
    });
}

function getReservationsByFilter(filter) {
    if (filter === 'active') return getFilteredReservationsByStatus('active');
    if (filter === 'completed') return getFilteredReservationsByStatus('completed');
    return [...state.reservations];
}

function getFilteredReservationsByStatus(kind) {
    return state.reservations.filter((reservation) => {
        const status = String(reservation.status || '').toLowerCase();
        const activeStatuses = new Set(['active', 'pending', 'confirmed']);
        const completedStatuses = new Set(['completed', 'cancelled', 'picked up', 'picked_up']);
        return kind === 'active' ? activeStatuses.has(status) : completedStatuses.has(status);
    });
}

function getReservationClass(statusRaw) {
    const status = String(statusRaw || '').toLowerCase();
    if (status === 'cancelled') return 'cancelled';
    if (new Set(['completed', 'picked up', 'picked_up']).has(status)) return 'completed';
    return 'active';
}

function getReservationLabel(statusRaw) {
    const status = String(statusRaw || '').toLowerCase();
    if (status === 'picked_up') return 'Picked Up';
    if (!status) return 'Active';
    return status.replace(/\b\w/g, (char) => char.toUpperCase());
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
    if (!ms) return '--';
    return new Date(ms).toLocaleString();
}

function formatPrice(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '--';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function getFormValue(id) {
    return String(document.getElementById(id)?.value || '').trim();
}

function setFormValue(id, value) {
    const field = document.getElementById(id);
    if (field) field.value = value ?? '';
}

async function updateReservationStatus(reservationDocId, nextStatus, options = {}) {
    const reservation = state.rawReservations.find((item) => item.docId === reservationDocId);
    if (!reservation) return;

    // Optimistic local update for immediate KPI and table refresh.
    reservation.status = nextStatus;
    renderAll();

    const payload = {
        status: nextStatus,
        updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'reservations', reservationDocId), payload, { merge: true });

    if (options.makeBookAvailable) {
        const bookDocId = findBookDocIdForReservation(reservation);
        if (bookDocId) {
            await setDoc(
                doc(db, 'books', bookDocId),
                { status: 'available', isSuspended: false, updatedAt: serverTimestamp() },
                { merge: true }
            );
        }
    }
}

function findBookDocIdForReservation(reservation) {
    const key = String(reservation.bookId || '').trim();
    if (!key) return '';
    const byCustomId = state.books.find((book) => String(book.id || '') === key);
    if (byCustomId?.docId) return byCustomId.docId;
    const byDocId = state.books.find((book) => String(book.docId || '') === key);
    return byDocId?.docId || '';
}

function showConfirmModal(message, onConfirm) {
    state.pendingConfirmAction = typeof onConfirm === 'function' ? onConfirm : null;
    if (el.confirmMessage) el.confirmMessage.textContent = String(message || 'Are you sure?');
    el.confirmModal?.classList.add('active');
}

function closeConfirmModal() {
    state.pendingConfirmAction = null;
    el.confirmModal?.classList.remove('active');
}

async function submitConfirmAction() {
    const action = state.pendingConfirmAction;
    closeConfirmModal();
    if (!action) return;
    try {
        await action();
    } catch (error) {
        console.error('Confirmation action failed:', error);
        showToast('Action failed. Please try again.', 'error');
    }
}

function escapeHtml(input) {
    const div = document.createElement('div');
    div.textContent = String(input || '');
    return div.innerHTML;
}

let toastTimer = null;
function showToast(message, type = 'info') {
    let toast = document.getElementById('ad-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'ad-toast';
        document.body.appendChild(toast);
    }
    toast.className = `${type} show`;
    toast.textContent = String(message || '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}
