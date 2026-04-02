// details.js
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    where
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase-client.js';
import { safeStorage } from './storage.js';
import { createReservation } from '../js/booking.js';

const BOOK_BTN_DEFAULT = 'Book Now';
const BOOK_BTN_PROCESSING = 'Processing...';
const BOOK_BTN_CONFIRMED = 'Confirmed ✅';
let allBooks = [];

window.addEventListener('DOMContentLoaded', () => {
    initDetailsPage();
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
    displayBookDetails(extended);
    generateFakeLibraries(extended);
    renderRelatedBooks(extended);
    setupDetailFavoriteToggle(book);
}

function applyReadingDirection(book) {
    const ar = book.language === 'Arabic';
    document.documentElement.lang = ar ? 'ar' : 'en';
    document.body.dir = ar ? 'rtl' : 'ltr';
}

function displayBookDetails(book) {
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

function renderRelatedBooks(current) {
    const grid = document.getElementById('related-books-grid');
    if (!grid) return;

    const related = getRelatedBooks(current, allBooks, 4);
    grid.innerHTML = '';

    related.forEach((b) => {
        const a = document.createElement('a');
        a.href = `details.html?id=${encodeURIComponent(normalizeBookId(b.id))}`;
        a.className = 'related-card';
        a.innerHTML = `
            <img src="${escapeHtml(b.image)}"
                 alt="${escapeHtml(b.title)}"
                 onerror="this.onerror=null;this.src='https://via.placeholder.com/150x210?text=No+Cover'">
            <div class="related-card-body">
                <div class="related-card-title">${escapeHtml(b.title)}</div>
                <div class="related-card-author">${escapeHtml(b.author)}</div>
            </div>
        `;
        grid.appendChild(a);
    });
}

function generateFakeLibraries(book) {
    const libraries = [
        { name: 'Central Public Library', distance: '2.3 km', price: 'Free', available: true },
        { name: 'University Library', distance: '4.1 km', price: '$5', available: true },
        { name: 'City Book Center', distance: '5.8 km', price: '$8', available: false },
        { name: 'Downtown Library', distance: '7.2 km', price: 'Free', available: true },
    ];

    const container = document.getElementById('libraries-list');
    const countElement = document.getElementById('library-count');

    if (!container) return;

    const availableCount = libraries.filter((lib) => lib.available).length;
    if (countElement) {
        countElement.textContent = `${availableCount} ${availableCount === 1 ? 'branch' : 'branches'}`;
    }

    container.innerHTML = '';

    libraries.forEach((lib) => {
        container.appendChild(createLibraryItem(lib));
    });
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
                    <span class="material-icons-outlined" style="font-size: 14px;">location_on</span>
                    ${library.distance}
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

function setupReservation(book) {
    const reserveBtn = document.getElementById('reserve-btn');
    const modal = document.getElementById('reserve-modal');
    const modalClose = document.getElementById('modal-close');
    const cancelBtn = document.getElementById('cancel-btn');
    const bookBtn = document.getElementById('bookBtn');

    if (!reserveBtn || !modal || !bookBtn) return;

    reserveBtn.addEventListener('click', () => {
        if (reserveBtn.disabled) return;
        openReserveModal(book);
    });

    modalClose.addEventListener('click', closeReserveModal);
    cancelBtn.addEventListener('click', closeReserveModal);

    modalClose.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') closeReserveModal();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeReserveModal();
        }
    });

    bookBtn.addEventListener('click', () => {
        confirmReservation(book);
    });

    const pickupDate = document.getElementById('pickup-date');
    if (pickupDate) {
        const today = new Date().toISOString().split('T')[0];
        pickupDate.setAttribute('min', today);
        pickupDate.value = today;
    }
}

function openReserveModal(book) {
    const modal = document.getElementById('reserve-modal');

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
    if (nameInput) nameInput.value = user.name || '';

    resetBookButton();

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeReserveModal() {
    const modal = document.getElementById('reserve-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
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
        const reservationId = await createReservation(String(book.id), userName.trim(), {
            onConfirmed: () => {
                setBookButtonConfirmed();

                const reservation = {
                    id: reservationId,
                    firebaseStatus: 'confirmed',
                    bookId: book.id,
                    title: book.title,
                    author: book.author,
                    image: book.image,
                    library: library,
                    pickupDate: pickupDate,
                    userName: userName.trim(),
                    userPhone: userPhone.trim(),
                    status: 'Confirmed',
                    date: new Date().toLocaleDateString(),
                };
                saveReservation(reservation);

                closeReserveModal();
                showToast('Reservation confirmed! ✅', 'success');

                document.getElementById('library-select').value = '';
                document.getElementById('user-phone').value = '';
            },
            onError: (err) => {
                resetBookButton();
                const msg = err?.message || err?.code || 'Reservation failed. Please try again.';
                alert(msg);
            },
        });
    } catch {
        resetBookButton();
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
            return JSON.parse(stored);
        } catch (e) {}
    }
    return { name: 'Guest User', email: 'guest@books.com' };
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
        vendorPhone: data.vendorPhone || data.sellerPhone || '',
    };
}

function normalizeBookId(id) {
    return String(id ?? '').trim();
}

function getNumericSeed(id) {
    const value = normalizeBookId(id);
    const asNumber = Number.parseInt(value, 10);
    if (Number.isFinite(asNumber)) return asNumber;

    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash || 1;
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

function setupCommerceActions(book) {
    const buyBtn = document.getElementById('buy-btn');
    const quickBuyBtn = document.getElementById('quick-buy-btn');
    const sampleBtn = document.getElementById('sample-btn');
    if (!buyBtn && !quickBuyBtn && !sampleBtn) return;

    if (buyBtn) {
        buyBtn.onclick = () => {
            if (buyBtn.disabled) return;
            showToast('Proceeding to checkout...', 'info');
        };
    }

    if (quickBuyBtn) {
        quickBuyBtn.onclick = () => {
            const phoneRaw = String(book.vendorPhone || '').trim();
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

    if (sampleBtn) {
        sampleBtn.onclick = () => {
            const url = String(book.sampleUrl || '').trim();
            if (!url) {
                showToast('Sample is not available for this title yet.', 'info');
                return;
            }
            window.open(url, '_blank', 'noopener,noreferrer');
        };
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

const PUBLISHERS = [
    'Penguin Classics', 'HarperCollins', 'Simon & Schuster', 'Random House',
    'Oxford University Press', 'Vintage Books', 'Anchor Books', 'Scribner'
];

const AUTHOR_BIOS = {
    'J.K. Rowling': "British author best known for the Harry Potter series, which became a global phenomenon and redefined modern children's literature.",
    'James Clear': 'Author and speaker focused on habits, decision-making, and continuous improvement; his work emphasizes small, repeatable changes.',
    'J.R.R. Tolkien': 'Professor and philologist whose epic fantasy works, including The Hobbit and The Lord of the Rings, shaped the modern fantasy genre.',
    'George Orwell': 'Journalist and novelist whose sharp critiques of totalitarianism and social injustice remain essential reading worldwide.',
    'Yuval Noah Harari': "Historian and bestselling author exploring humanity's past and future through big-picture narratives bridging science and culture.",
    'Patrick Rothfuss': 'Fantasy author celebrated for lyrical prose and intricate world-building in The Kingkiller Chronicle series.',
    'Harper Lee': 'American novelist whose To Kill a Mockingbird remains one of the most influential works on race and justice in the United States.',
    'Paulo Coelho': 'Brazilian lyricist and novelist whose allegorical storytelling has reached readers in more than eighty languages.',
    'Stephen Hawking': 'Theoretical physicist and author who brought cosmology and black holes to millions through clear, passionate prose.',
    'Carl Sagan': 'Astronomer and science communicator who inspired generations to look up at the cosmos with wonder and skepticism.',
    'طه حسين': 'أديب وناقد مصري، من أعلام النهضة العربية، اشتهر بسيرته الذاتية «الأيام» وأعماله في الأدب والفلسفة.',
    'الطيب صالح': 'روائي سوداني صاحب أسلوب سردي متميز، تناول في أعماله الهوية والاستعمار والهجرة.',
    'غسان كنفاني': 'كاتب ومناضل فلسطيني، من أبرز أدباء المقاومة، اشتهر بقصصه القصيرة ورواياته عن القضية الفلسطينية.'
};

function pickPublisher(year) {
    const idx = Math.abs((year || 0) % PUBLISHERS.length);
    return PUBLISHERS[idx];
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
    const seed = getNumericSeed(book.id);
    const publisher = pickPublisher(book.year);
    const month = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'][seed % 12];
    const publicationDisplay = `${month} ${book.year}`;
    const copiesSeed = (seed * 7) % 8;
    const copiesAvailable = copiesSeed === 0 ? 0 : copiesSeed;
    const stockStatus = copiesAvailable === 0 ? 'out' : 'in';
    const stockLabel = copiesAvailable === 0
        ? 'Out of Stock'
        : `${copiesAvailable} ${copiesAvailable === 1 ? 'copy' : 'copies'} available`;

    const synopsisP2 = `Across libraries and reading communities, ${book.title} continues to spark discussion and discovery. This synopsis highlights themes of character, conflict, and craft-inviting you to reserve a physical copy and experience the full arc at your own pace.`;

    const authorBio = AUTHOR_BIOS[book.author]
        || `${book.author} is a widely read author whose work spans ${book.category.toLowerCase()} and resonates with contemporary audiences.`;

    return {
        ...book,
        synopsisP1: book.description,
        synopsisP2,
        authorBio,
        genres: genreTagsFromCategory(book.category),
        publisher,
        publicationDisplay,
        copiesAvailable,
        stockStatus,
        stockLabel,
        isbn: `978-0-${String(1000000 + seed).slice(0, 6)}-${String(seed).padStart(2, '0')}`
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
