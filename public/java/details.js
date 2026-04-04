// details.js
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    serverTimestamp,
    where
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { auth, db } from './firebase-client.js';
import { safeStorage } from './storage.js';
import { getVendorProfileById } from './vendors-firestore-service.js';

const BOOK_BTN_DEFAULT = 'Book Now';
const BOOK_BTN_PROCESSING = 'Processing...';
const BOOK_BTN_CONFIRMED = 'Confirmed ✅';
const RESERVATION_DUPLICATE_WINDOW_MINUTES = 30;
let allBooks = [];
let reservationHandlersBound = false;
let currentModalBook = null;
let currentDetailBook = null;
let delegatedActionsBound = false;
let currentLibraryName = '';
let cachedResolvedUser = undefined;

window.addEventListener('DOMContentLoaded', () => {
    initDetailsPage();
    window.addEventListener('storage', (event) => {
        if (event.key === 'cartItems') updateDetailCartBadge();
    });
});

async function initDetailsPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const bookId = normalizeBookId(urlParams.get('id'));

    if (!bookId) {
        showError('No book ID provided');
        return;
    }

    try {
        allBooks = await fetchBooksFromCloud();
    } catch (error) {
        console.error('Failed to fetch books from Firestore:', error);
        showError('Could not load book details');
        return;
    }

    const book = await fetchBookDetails(bookId, allBooks);

    if (!book) {
        showError('Book not found');
        return;
    }

    const extended = getBookDetailExtended(book);
    applyReadingDirection(book);
    bindDetailActionDelegation();
    displayBookDetails(extended);
    setupDetailCartUI();
    await renderVendorLibrary(extended);
    await renderRelatedBooks(extended);
    setupDetailFavoriteToggle(book);
    await setupSaveBookButton(book);
}

function applyReadingDirection(book) {
    const ar = book.language === 'Arabic';
    document.documentElement.lang = ar ? 'ar' : 'en';
    document.body.dir = ar ? 'rtl' : 'ltr';
}

function displayBookDetails(book) {
    currentDetailBook = book;
    const bookId = normalizeBookId(book.id);

    document.getElementById('detail-title').textContent = book.title;
    document.getElementById('detail-author').textContent = book.author;

    const img = document.getElementById('detail-img');
    if (img) {
        img.outerHTML = `<img id="detail-img" class="details-cover__img" src="${book.image}" alt="${book.title}" onerror="this.onerror=null; this.src='https://placehold.co/300x450/eeeeee/999999?text=No+Cover';">`;
    }

    const catEl = document.getElementById('detail-category');
    if (catEl) catEl.textContent = book.category;

    document.getElementById('detail-synopsis-1').textContent = book.synopsisP1;
    document.getElementById('detail-synopsis-2').textContent = book.synopsisP2;
    document.getElementById('detail-author-bio').textContent = book.authorBio;

    document.getElementById('detail-pub-date').textContent = book.publicationDisplay;
    document.getElementById('detail-publisher').textContent = book.publisher;

    const isbnEl = document.getElementById('detail-isbn');
    if (isbnEl) isbnEl.textContent = `ISBN ${book.isbn}`;

    renderStars(book.rating);
    const ratingVal = document.getElementById('detail-rating-value');
    if (ratingVal) ratingVal.textContent = book.rating.toFixed(1);

    const tagsEl = document.getElementById('detail-genre-tags');
    if (tagsEl) {
        tagsEl.innerHTML = book.genres
            .map((g) => `<span class="genre-tag">${escapeHtml(g)}</span>`)
            .join('');
    }

    const avail = document.getElementById('detail-availability');
    const stockLabel = document.getElementById('detail-stock-label');
    if (stockLabel) stockLabel.textContent = book.stockLabel;
    if (avail) {
        avail.classList.remove('availability-pill--in', 'availability-pill--out');
        avail.classList.add(book.stockStatus === 'out' ? 'availability-pill--out' : 'availability-pill--in');
    }

    const buyBtn = document.getElementById('buy-btn');
    if (buyBtn) {
        const out = book.stockStatus === 'out';
        buyBtn.disabled = out;
        buyBtn.classList.toggle('reserve-btn--disabled', out);
        buyBtn.title = out ? 'Currently unavailable — check back soon' : '';
    }

    const priceEl = document.getElementById('book-price');
    if (priceEl) {
        const hasPrice = Number.isFinite(book.price) && book.price > 0;
        priceEl.textContent = hasPrice ? formatPrice(book.price) : 'N/A';
    }

    document.title = `${book.title} · LibraShelf`;

    const favoriteBtn = document.getElementById('detail-favorite-btn');
    if (favoriteBtn) {
        favoriteBtn.dataset.bookId = bookId;
        const isFavorite = getFavorites().includes(bookId);
        favoriteBtn.classList.toggle('active', isFavorite);
        const icon = favoriteBtn.querySelector('.material-icons-outlined');
        if (icon) icon.textContent = isFavorite ? 'favorite' : 'favorite_border';
    }

    setupCommerceActions(book);
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function renderStars(rating) {
    const el = document.getElementById('detail-stars');
    if (!el) return;
    const rounded = Math.round(Math.min(5, Math.max(0, rating)) * 2) / 2;
    let html = '';
    for (let i = 1; i <= 5; i++) {
        if (rounded >= i) {
            html += '<span class="star">★</span>';
        } else if (rounded >= i - 0.5) {
            html += '<span class="star half">★</span>';
        } else {
            html += '<span class="star dim">★</span>';
        }
    }
    el.innerHTML = html;
}

async function renderRelatedBooks(current) {
    const grid = document.getElementById('related-books-grid');
    if (!grid) return;

    const related = await fetchRelatedBooksByVendor(current, 8);
    grid.innerHTML = '';

    if (!related.length) {
        grid.innerHTML = '<div class="no-books-found">No related books found for this library.</div>';
        return;
    }

    related.forEach((book) => {
        grid.appendChild(createRelatedBookCard(book));
    });
}

function createRelatedBookCard(book) {
    const card = document.createElement('a');
    card.href = `details.html?id=${encodeURIComponent(normalizeBookId(book.id))}`;
    card.className = 'book-card book-card--premium related-book-card';
    card.innerHTML = `
        <div class="book-card__cover-wrap">
            <img class="book-card__cover"
                 src="${escapeHtml(book.image)}"
                 alt="${escapeHtml(book.title)}"
                 onerror="this.onerror=null; this.src='https://placehold.co/300x450/eeeeee/999999?text=No+Cover';">
        </div>
        <div class="book-card__body">
            <h3>${escapeHtml(book.title)}</h3>
            <p class="book-card__author">${escapeHtml(book.author)}</p>
        </div>
    `;
    return card;
}

async function fetchRelatedBooksByVendor(currentBook, maxItems = 8) {
    if (!currentBook) return [];

    const currentId = normalizeBookId(currentBook.id);
    const currentCloudId = normalizeBookId(currentBook.cloudId);
    const vendorId = String(currentBook.vendorId || '').trim();

    if (!vendorId) {
        return getRelatedBooks(currentBook, allBooks, maxItems);
    }

    try {
        const relatedQuery = query(
            collection(db, 'books'),
            where('vendorId', '==', vendorId),
            limit(maxItems + 1)
        );
        const relatedSnap = await getDocs(relatedQuery);
        const vendorBooks = relatedSnap.docs
            .map((docSnap) => mapBookDoc(docSnap))
            .filter((book) => {
                const bookId = normalizeBookId(book.id);
                const cloudId = normalizeBookId(book.cloudId);
                return bookId !== currentId && cloudId !== currentCloudId;
            })
            .slice(0, maxItems);

        if (vendorBooks.length) return vendorBooks;
    } catch (error) {
        console.error('Failed to fetch related books by vendorId:', error);
    }

    return getRelatedBooks(currentBook, allBooks, maxItems);
}

async function renderVendorLibrary(book) {
    const container = document.getElementById('libraries-list');
    const countElement = document.getElementById('library-count');
    if (!container) return;

    container.innerHTML = '';

    const vendorId = String(book?.vendorId || '').trim();
    if (!vendorId) {
        currentLibraryName = '';
        populateModalLibraryField(book);
        if (countElement) countElement.textContent = '0 branches';
        container.innerHTML = '<div class="no-books-found">Vendor information is unavailable.</div>';
        return;
    }

    const vendorInfo = await fetchVendorInfo(vendorId);
    const libraryName = String(
        vendorInfo?.storeName || vendorInfo?.name || vendorInfo?.displayName || 'Library Branch'
    ).trim();
    const subtitle = String(vendorInfo?.phone || vendorInfo?.email || '').trim();
    const hasPrice = Number.isFinite(book?.price) && Number(book.price) > 0;
    const priceText = hasPrice ? formatIqdPrice(Number(book.price)) : 'N/A';
    const library = {
        name: libraryName,
        subtitle: subtitle || `Vendor ID: ${vendorId}`,
        price: priceText,
        available: true,
    };

    currentLibraryName = library.name;
    populateModalLibraryField(book);
    if (countElement) countElement.textContent = '1 branch';
    container.appendChild(createLibraryItem(library));
}

function createLibraryItem(library) {
    const item = document.createElement('div');
    item.className = 'library-item';

    const statusClass = library.available ? 'available' : 'unavailable';
    const statusText = library.available ? 'Available' : 'Unavailable';

    item.innerHTML = `
        <div class="lib-info">
            <div class="lib-icon">
                <span class="material-icons-outlined">local_library</span>
            </div>
            <div class="lib-meta">
                <h4>${library.name}</h4>
                <span class="lib-distance">
                    <span class="material-icons-outlined" style="font-size: 14px;">storefront</span>
                    ${library.subtitle}
                </span>
            </div>
        </div>
        <div class="lib-status">
            <span class="status-badge ${statusClass}">${statusText}</span>
            <p class="price-tag">${library.price}</p>
        </div>
    `;

    return item;
}

async function fetchVendorInfo(vendorId) {
    const id = String(vendorId || '').trim();
    if (!id) return null;

    try {
        const vendor = await getVendorProfileById(id);
        if (vendor) {
            return {
                storeName: String(vendor.storeName || '').trim(),
                name: String(vendor.name || '').trim(),
                displayName: String(vendor.displayName || '').trim(),
                phone: String(vendor.phone || vendor.vendorPhone || '').trim(),
                email: String(vendor.email || '').trim(),
            };
        }
    } catch (error) {
        console.warn('Failed to fetch vendor profile from vendors collection:', error);
    }

    try {
        const userSnap = await getDoc(doc(db, 'users', id));
        if (!userSnap.exists()) return null;
        const data = userSnap.data() || {};
        return {
            storeName: String(data.storeName || '').trim(),
            name: String(data.name || '').trim(),
            displayName: String(data.displayName || '').trim(),
            phone: String(data.phone || data.vendorPhone || '').trim(),
            email: String(data.email || '').trim(),
        };
    } catch (error) {
        console.warn('Failed to fetch vendor profile from users collection:', error);
        return null;
    }
}

function formatIqdPrice(value) {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)} IQD`;
}

function showError(message) {
    const main = document.querySelector('main');
    if (main) {
        main.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <span class="material-icons-outlined" style="font-size: 64px; color: var(--text-muted);">
                    error_outline
                </span>
                <h2 style="margin-top: 20px; color: var(--text-primary);">${message}</h2>
                <a href="index.html" class="btn-primary" style="display: inline-block; margin-top: 20px; max-width: 200px;">
                    Back to Home
                </a>
            </div>
        `;
    }
}

function openReserveModal(book) {
    const modal = document.getElementById('reserve-modal');
    if (!modal) return;
    currentModalBook = book || null;
    populateModalLibraryField(book);

    const modalCover = document.getElementById('modal-book-cover');
    modalCover.src = book.image;
    modalCover.alt = book.title;
    modalCover.onerror = () => {
        modalCover.onerror = null;
        modalCover.src = 'https://via.placeholder.com/150x210?text=No+Cover';
    };
    document.getElementById('modal-book-title').textContent = book.title;
    document.getElementById('modal-book-author').textContent = book.author;

    const user = getUserData();
    const nameInput = document.getElementById('userName');
    const phoneInput = document.getElementById('user-phone');
    if (nameInput) nameInput.value = user.name || '';
    if (phoneInput) phoneInput.value = user.phone || '';

    resetBookButton();

    modal.classList.remove('hidden');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeReserveModal() {
    const modal = document.getElementById('reserve-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

function populateModalLibraryField(book) {
    const librarySelect = document.getElementById('library-select');
    if (!librarySelect) return;

    const vendorId = String(book?.vendorId || currentDetailBook?.vendorId || '').trim();
    const displayName = String(currentLibraryName || '').trim() || (vendorId ? `Vendor ${vendorId}` : 'Library');
    const optionValue = displayName;

    librarySelect.innerHTML = '';
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = displayName;
    option.selected = true;
    librarySelect.appendChild(option);
    librarySelect.value = optionValue;
    librarySelect.setAttribute('aria-readonly', 'true');
    librarySelect.disabled = true;
}

function resetBookButton() {
    const bookBtn = document.getElementById('bookBtn');
    if (!bookBtn) return;
    bookBtn.disabled = false;
    bookBtn.textContent = BOOK_BTN_DEFAULT;
    bookBtn.classList.remove('booking-confirmed');
}

function setBookButtonProcessing() {
    const bookBtn = document.getElementById('bookBtn');
    if (!bookBtn) return;
    bookBtn.disabled = true;
    bookBtn.textContent = BOOK_BTN_PROCESSING;
    bookBtn.classList.remove('booking-confirmed');
}

function setBookButtonConfirmed() {
    const bookBtn = document.getElementById('bookBtn');
    if (!bookBtn) return;
    bookBtn.disabled = true;
    bookBtn.textContent = BOOK_BTN_CONFIRMED;
    bookBtn.classList.add('booking-confirmed');
}

async function confirmReservation(book) {
    const library = document.getElementById('library-select').value;
    const pickupDate = document.getElementById('pickup-date').value;
    const userNameEl = document.getElementById('userName');
    const userPhone = document.getElementById('user-phone').value;
    const userName = userNameEl ? userNameEl.value : '';
    const authUser = await getCurrentAuthUser();

    if (!library) {
        showToast('Please select a library', 'error');
        return;
    }

    if (!pickupDate) {
        showToast('Please select a pickup date', 'error');
        return;
    }

    if (!userName.trim()) {
        showToast('Please enter your name', 'error');
        return;
    }

    if (!userPhone.trim()) {
        showToast('Please enter your phone number', 'error');
        return;
    }

    setBookButtonProcessing();

    try {
        const duplicate = await hasRecentDuplicateReservation(
            String(book.id),
            userPhone.trim(),
            RESERVATION_DUPLICATE_WINDOW_MINUTES
        );
        if (duplicate) {
            resetBookButton();
            showToast('A similar reservation already exists. Please wait before retrying.', 'info');
            return;
        }

        const payload = {
            bookId: String(book.id),
            title: String(book.title || ''),
            price: Number(book.price || 0),
            vendorId: String(book.vendorId || ''),
            library: String(library || ''),
            pickupDate: String(pickupDate || ''),
            userName: userName.trim(),
            userPhone: userPhone.trim(),
            userId: String(authUser?.uid || ''),
            userEmail: String(authUser?.email || ''),
            status: 'pending',
            createdAt: serverTimestamp(),
        };

        const reservationRef = await addDoc(collection(db, 'reservations'), payload);
        setBookButtonConfirmed();

        saveReservation({
            id: reservationRef.id,
            ...payload,
            status: 'pending',
            date: new Date().toLocaleDateString(),
        });

        closeReserveModal();
        showToast('Reservation submitted successfully ✅', 'success');

        document.getElementById('library-select').value = '';
        document.getElementById('user-phone').value = '';
    } catch (error) {
        console.error('Failed to write reservation:', error);
        resetBookButton();
        showToast('Reservation failed. Please try again.', 'error');
    }
}

async function hasRecentDuplicateReservation(bookId, userPhone, withinMinutes = 30) {
    const normalizedBookId = String(bookId || '').trim();
    const normalizedPhone = String(userPhone || '').trim();
    if (!normalizedBookId || !normalizedPhone) return false;

    try {
        const phoneQuery = query(
            collection(db, 'reservations'),
            where('userPhone', '==', normalizedPhone),
            limit(30)
        );
        const snap = await getDocs(phoneQuery);
        if (snap.empty) return false;

        const now = Date.now();
        const maxAgeMs = withinMinutes * 60 * 1000;
        return snap.docs.some((docSnap) => {
            const data = docSnap.data() || {};
            if (String(data.bookId || '').trim() !== normalizedBookId) return false;
            const createdAtMs = typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
            if (!createdAtMs) return false;
            return now - createdAtMs <= maxAgeMs;
        });
    } catch (error) {
        console.warn('Duplicate reservation check failed:', error);
        return false;
    }
}

function saveReservation(reservation) {
    const stored = safeStorage.get('reservations');
    let reservations = [];

    if (stored) {
        try {
            reservations = JSON.parse(stored);
        } catch (e) {
            console.error('Error parsing reservations:', e);
        }
    }

    reservations.push(reservation);
    safeStorage.set('reservations', JSON.stringify(reservations));
}

function getUserData() {
    const stored = safeStorage.get('user');
    if (stored) {
        try {
            const parsed = JSON.parse(stored) || {};
            return {
                name: String(parsed.name || auth.currentUser?.displayName || 'Guest User'),
                email: String(parsed.email || auth.currentUser?.email || ''),
                phone: String(parsed.phone || ''),
                uid: String(parsed.uid || auth.currentUser?.uid || ''),
            };
        } catch (e) {}
    }
    return {
        name: String(auth.currentUser?.displayName || 'Guest User'),
        email: String(auth.currentUser?.email || 'guest@books.com'),
        phone: '',
        uid: String(auth.currentUser?.uid || ''),
    };
}

async function fetchBooksFromCloud() {
    const snapshot = await getDocs(collection(db, 'books'));
    const books = snapshot.docs.map((docSnap) => mapBookDoc(docSnap));
    return books.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
}

async function fetchBookDetails(bookId, preloadedBooks = []) {
    const normalizedId = normalizeBookId(bookId);
    if (!normalizedId) return null;

    const directRef = doc(db, 'books', normalizedId);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) return mapBookDoc(directSnap);

    const byStringId = query(collection(db, 'books'), where('id', '==', normalizedId), limit(1));
    const byStringSnap = await getDocs(byStringId);
    if (!byStringSnap.empty) return mapBookDoc(byStringSnap.docs[0]);

    const asNumber = Number.parseInt(normalizedId, 10);
    if (Number.isFinite(asNumber)) {
        const byNumberId = query(collection(db, 'books'), where('id', '==', asNumber), limit(1));
        const byNumberSnap = await getDocs(byNumberId);
        if (!byNumberSnap.empty) return mapBookDoc(byNumberSnap.docs[0]);
    }

    return preloadedBooks.find((item) => normalizeBookId(item.id) === normalizedId) || null;
}

function mapBookDoc(docSnap) {
    const data = docSnap.data() || {};
    const resolvedId = normalizeBookId(data.id ?? docSnap.id);
    const coverUrl = data.coverUrl || data.cover || data.image || '';
    return {
        id: resolvedId,
        cloudId: docSnap.id,
        title: data.title || '',
        author: data.author || '',
        category: data.category || 'General',
        image: coverUrl,
        description: data.description || '',
        rating: Number(data.rating || 0),
        year: Number(data.year || 0),
        language: data.language || 'English',
        isTrending: Boolean(data.isTrending),
        price: Number(data.price || 0),
        sampleUrl: data.sampleUrl || '',
        vendorId: data.vendorId || '',
        vendorPhone: data.vendorPhone || data.sellerPhone || '',
        status: String(data.status || '').trim().toLowerCase(),
        publisher: String(data.publisher || '').trim(),
        authorBio: String(data.authorBio || data.author_bio || '').trim(),
        isbn: String(data.isbn || '').trim(),
        publicationDate: String(data.publicationDate || data.publishedAt || '').trim(),
    };
}

function normalizeBookId(id) {
    return String(id ?? '').trim();
}

function getFavorites() {
    const stored = safeStorage.get('favorites');
    if (!stored) return [];
    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.map((item) => normalizeBookId(item)).filter(Boolean) : [];
    } catch {
        return [];
    }
}

function saveFavorites(favorites) {
    const normalized = Array.from(new Set((favorites || []).map((item) => normalizeBookId(item)).filter(Boolean)));
    safeStorage.set('favorites', JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('favorites:updated', { detail: { count: normalized.length } }));
}

function setupDetailFavoriteToggle(book) {
    const favBtn = document.getElementById('detail-favorite-btn') || document.querySelector('[data-detail-favorite]');
    if (!favBtn) return;

    const bookId = normalizeBookId(book.id);
    const renderState = () => {
        const active = getFavorites().includes(bookId);
        favBtn.classList.toggle('active', active);
        const icon = favBtn.querySelector('.material-icons-outlined');
        if (icon) icon.textContent = active ? 'favorite' : 'favorite_border';
    };

    favBtn.dataset.bookId = bookId;
    renderState();
    favBtn.addEventListener('click', (event) => {
        event.preventDefault();
        const favorites = getFavorites();
        const index = favorites.indexOf(bookId);
        if (index > -1) favorites.splice(index, 1);
        else favorites.push(bookId);
        saveFavorites(favorites);
        renderState();
    });
}

async function setupSaveBookButton(book) {
    const saveBtn = document.getElementById('save-book-btn');
    if (!saveBtn || !book) return;

    const user = await getCurrentAuthUser();
    if (!user) {
        updateSaveButtonUi(saveBtn, false);
        saveBtn.onclick = () => {
            showToast('Please login to save books.', 'info');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 400);
        };
        return;
    }

    const bookId = normalizeBookId(book.id);
    if (!bookId) return;
    const alreadySaved = await isBookSavedByUser(user.uid, bookId);
    updateSaveButtonUi(saveBtn, alreadySaved);

    saveBtn.onclick = async () => {
        if (saveBtn.disabled) return;
        if (saveBtn.dataset.saved === 'true') {
            showToast('Book already saved.', 'info');
            return;
        }

        saveBtn.disabled = true;
        try {
            await addDoc(collection(db, 'saved_books'), {
                userId: String(user.uid),
                bookId,
                title: String(book.title || ''),
                author: String(book.author || ''),
                image: String(book.image || ''),
                vendorId: String(book.vendorId || ''),
                createdAt: serverTimestamp(),
            });
            updateSaveButtonUi(saveBtn, true);
            showToast('Book saved successfully.', 'success');
        } catch (error) {
            console.error('Failed to save book:', error);
            showToast('Could not save this book. Try again.', 'error');
        } finally {
            saveBtn.disabled = false;
        }
    };
}

function updateSaveButtonUi(button, isSaved) {
    const icon = button?.querySelector('.material-icons-outlined');
    const label = button?.querySelector('.save-book-label');
    button.dataset.saved = isSaved ? 'true' : 'false';
    button.classList.toggle('active', isSaved);
    if (icon) icon.textContent = isSaved ? 'bookmark_added' : 'bookmark_add';
    if (label) label.textContent = isSaved ? 'Saved' : 'Save';
}

async function isBookSavedByUser(userId, bookId) {
    if (!userId || !bookId) return false;
    try {
        const existingQuery = query(
            collection(db, 'saved_books'),
            where('userId', '==', String(userId)),
            where('bookId', '==', String(bookId)),
            limit(1)
        );
        const snap = await getDocs(existingQuery);
        return !snap.empty;
    } catch (error) {
        console.warn('Saved-book lookup failed:', error);
        return false;
    }
}

function getCurrentAuthUser() {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    if (cachedResolvedUser !== undefined) return Promise.resolve(cachedResolvedUser);

    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            cachedResolvedUser = user || null;
            resolve(cachedResolvedUser);
        });
    });
}

function setupCommerceActions(book) {
    const quickBuyBtn = document.getElementById('quick-buy-btn');
    if (!quickBuyBtn) {
        setupReservationModalHandlers(book);
        return;
    }

    if (quickBuyBtn) {
        quickBuyBtn.onclick = async () => {
            let phoneRaw = String(book.vendorPhone || '').trim();
            if (!phoneRaw && book.vendorId) {
                const vendor = await getVendorProfileById(book.vendorId);
                phoneRaw = String(vendor?.phone || '').trim();
            }
            if (!phoneRaw) {
                showToast('Seller contact info is missing for this book.', 'error');
                return;
            }

            const sanitizedPhone = phoneRaw.replace(/\D/g, '');
            if (!sanitizedPhone) {
                showToast('Seller contact info is missing for this book.', 'error');
                return;
            }

            const message = `Hello, I would like to buy the book "${book.title}" by ${book.author} for ${formatPrice(book.price)}.`;
            const waUrl = `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(message)}`;
            window.open(waUrl, '_blank', 'noopener,noreferrer');
        };
    }

    setupReservationModalHandlers(book);
}

function bindDetailActionDelegation() {
    if (delegatedActionsBound) return;
    delegatedActionsBound = true;

    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const buyBtn = target.closest('#buy-btn');
        if (buyBtn) {
            event.preventDefault();
            if (!currentDetailBook) {
                showToast('Book details are still loading...', 'info');
                return;
            }
            if (buyBtn.hasAttribute('disabled')) return;
            openReserveModal(currentDetailBook);
            return;
        }

        const addToCartBtn = target.closest('#add-to-cart-btn');
        if (addToCartBtn) {
            event.preventDefault();
            if (!currentDetailBook) {
                showToast('Book details are still loading...', 'info');
                return;
            }
            addBookToCart(currentDetailBook);
            return;
        }

        const sampleBtn = target.closest('#sample-btn');
        if (sampleBtn) {
            event.preventDefault();
            if (!currentDetailBook) {
                showToast('Book details are still loading...', 'info');
                return;
            }
            const url = String(currentDetailBook.sampleUrl || '').trim();
            if (!url) {
                showToast('Sample is not available for this title yet.', 'info');
                return;
            }
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    });
}

function setupReservationModalHandlers(book) {
    const modal = document.getElementById('reserve-modal');
    const modalClose = document.getElementById('modal-close');
    const cancelBtn = document.getElementById('cancel-btn');
    const bookBtn = document.getElementById('bookBtn');
    if (!modal || !modalClose || !cancelBtn || !bookBtn) return;

    // Keep latest book context when navigating between details pages.
    modal.dataset.currentBookId = normalizeBookId(book.id);

    if (reservationHandlersBound) return;
    reservationHandlersBound = true;

    const close = () => closeReserveModal();

    modalClose.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    modalClose.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') close();
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    bookBtn.addEventListener('click', async () => {
        const targetBook = currentModalBook;
        if (!targetBook) {
            showToast('Book details not found.', 'error');
            return;
        }
        await confirmReservation(targetBook);
    });

    const pickupDate = document.getElementById('pickup-date');
    if (pickupDate) {
        const today = new Date().toISOString().split('T')[0];
        pickupDate.setAttribute('min', today);
        pickupDate.value = today;
    }
}

function setupDetailCartUI() {
    updateDetailCartBadge();
}

function updateDetailCartBadge() {
    const badge = document.getElementById('detail-cart-count-badge');
    if (!badge) return;
    const items = getCartItems();
    badge.textContent = String(items.length);
    badge.classList.toggle('hidden', items.length === 0);
}

function addBookToCart(book) {
    const cart = getCartItems();
    const bookId = normalizeBookId(book?.id);
    if (!bookId) {
        showToast('Book info is incomplete.', 'error');
        return;
    }

    const exists = cart.some((item) => normalizeBookId(item.bookId) === bookId);
    if (exists) {
        showToast('This book is already in your cart.', 'info');
        return;
    }

    cart.push({
        bookId,
        title: String(book.title || ''),
        author: String(book.author || ''),
        image: String(book.image || ''),
        price: Number(book.price || 0),
        vendorId: String(book.vendorId || ''),
        addedAt: Date.now(),
    });
    safeStorage.set('cartItems', JSON.stringify(cart));
    updateDetailCartBadge();
    showToast('Added to cart 🛒', 'success');
}

function getCartItems() {
    const raw = safeStorage.get('cartItems');
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function formatPrice(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value) || 0);
}

function genreTagsFromCategory(category) {
    const extra = {
        Fantasy: ['Fantasy', 'Adventure', 'Epic'],
        Science: ['Science', 'Non-Fiction', 'Popular Science'],
        Novel: ['Fiction', 'Literary Fiction', 'Classic'],
        History: ['History', 'Non-Fiction', 'World'],
        Philosophy: ['Philosophy', 'Non-Fiction', 'Classic'],
        'Self-Help': ['Self-Help', 'Personal Growth', 'Non-Fiction']
    };
    const tags = extra[category] || [category, 'Fiction', 'Literature'];
    return tags.map((tag) => (tag.startsWith('#') ? tag : `#${tag.replace(/\s+/g, '')}`));
}

function getBookDetailExtended(book) {
    if (!book) return null;
    const publicationDisplay = String(book.publicationDate || '').trim() || (book.year ? String(book.year) : '—');
    const normalizedStatus = String(book.status || '').trim().toLowerCase();
    const stockStatus = normalizedStatus === 'unavailable' || normalizedStatus === 'out' ? 'out' : 'in';
    const stockLabel = stockStatus === 'out' ? 'Out of Stock' : 'Available';
    const synopsisP2 = '';
    const authorBio = String(book.authorBio || '').trim() || 'Author information is not available.';
    const safeIsbn = String(book.isbn || '').trim() || 'N/A';
    const safePublisher = String(book.publisher || '').trim() || '—';

    return {
        ...book,
        synopsisP1: String(book.description || '').trim() || 'No synopsis available for this title yet.',
        synopsisP2,
        authorBio,
        genres: genreTagsFromCategory(book.category),
        publisher: safePublisher,
        publicationDisplay,
        stockStatus,
        stockLabel,
        isbn: safeIsbn,
    };
}

function getRelatedBooks(book, books, limit = 4) {
    if (!book) return [];
    const currentId = normalizeBookId(book.id);
    const same = books.filter((b) => normalizeBookId(b.id) !== currentId && b.category === book.category);
    const other = books.filter((b) => normalizeBookId(b.id) !== currentId && b.category !== book.category);
    return [...same, ...other].slice(0, limit);
}

function showToast(message, type = 'info') {
    let toast = document.getElementById('toast');

    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            font-size: 0.9rem;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.3s ease;
            white-space: nowrap;
        `;
        document.body.appendChild(toast);
    }

    const colors = {
        success: '#0d9488',
        info: '#1e3a5f',
        error: '#e74c3c',
    };

    toast.textContent = message;
    toast.style.background = colors[type] || colors.info;
    toast.style.opacity = '1';

    setTimeout(() => (toast.style.opacity = '0'), 2200);
}
