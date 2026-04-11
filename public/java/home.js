// home.js
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { collection, doc, getDocs, onSnapshot, orderBy, query, setDoc, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { auth, db } from './firebase-client.js';
import { BOOK_COVER_ONERROR, getBookCoverAttrs } from './cover-utils.js';
import { normalizeFavoriteIds } from './favorites-utils.js';
import { safeStorage } from './storage.js';

let booksList = [];
const CATEGORIES = [
    'All',
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

let selectedCategory = 'All';
let currentSearchTerm = '';
let searchDebounce = null;
let booksLoaded = false;
let availableCategories = [...CATEGORIES];
let forceGridMode = false;
const notificationState = {
    itemsById: new Map(),
    unsubscribers: [],
};

// ========================================
// التهيئة عند تحميل الصفحة
// ========================================
window.addEventListener('DOMContentLoaded', () => {
    initHomePage();
    window.addEventListener('favorites:updated', () => {
        if (isBrowsingRowsMode()) {
            renderHomeRows();
        } else {
            runSearchAndFilter();
        }
    });
    window.addEventListener('storage', (event) => {
        if (event.key === 'cartItems') updateCartBadge();
    });
});

async function initHomePage() {
    showHomeLoading(true);
    setupBottomNav();
    setupNotifications();
    setupCartBadge();
    setupSearch();

    try {
        booksList = await fetchBooksFromCloud();
        console.log('Total books rendered: ', booksList.length);
        availableCategories = buildAvailableCategories(booksList);
        booksLoaded = true;
        renderCategoryChips();
        setupCategories();
        syncSearchTermFromInput();
        await runSearchAndFilter();
    } catch (error) {
        console.error('Failed to fetch books from Firestore:', error);
        showToast('Could not load catalog. Please refresh.', 'error');
    } finally {
        showHomeLoading(false);
    }
}

function isBrowsingRowsMode() {
    return !forceGridMode && !currentSearchTerm && selectedCategory === 'All';
}

function renderHomeRows() {
    const wrapper = document.getElementById('home-rows-wrapper');
    if (!wrapper) return;
    wrapper.innerHTML = '';

    const sections = buildStreamingSections(booksList);
    if (!sections.length) {
        wrapper.innerHTML = '<div class="no-books-found">No books found</div>';
        toggleHomeMode(true);
        return;
    }

    sections.forEach((section) => {
        wrapper.appendChild(createCategorySection(section.title, section.tag, section.books));
    });
    toggleHomeMode(true);
}

// ========================================
// Show / hide entire book row (header + carousel)
// ========================================
function setBookSectionVisibility(containerId, visible) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const section = container.closest('.books-section--premium');
    if (!section) return;

    if (visible) {
        section.removeAttribute('hidden');
        section.classList.remove('is-section-empty');
    } else {
        section.setAttribute('hidden', '');
        section.classList.add('is-section-empty');
    }
}

// ========================================
// عرض قسم واحد
// ========================================
function renderSection(containerId, books) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!books.length) {
        container.innerHTML = '';
        setBookSectionVisibility(containerId, false);
        return;
    }

    setBookSectionVisibility(containerId, true);
    renderBookGrid(books, containerId);
}

function renderHorizontalRow(containerId, books) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (!books.length) {
        container.innerHTML = '<div class="no-books-found">No books found</div>';
        return;
    }
    books.forEach((book) => {
        container.appendChild(createBookCard(book));
    });
}

function createCategorySection(title, tag, books) {
    const section = document.createElement('section');
    section.className = 'category-section horizontal-row-section';

    const header = document.createElement('div');
    header.className = 'section-header section-header--premium';
    header.innerHTML = `
        <h2>${escapeHtml(title)}</h2>
        <span class="section-tag section-tag--muted">${escapeHtml(tag || 'Category')}</span>
    `;

    const row = document.createElement('div');
    row.className = 'books-row';
    books.forEach((book) => row.appendChild(createBookCard(book)));

    section.appendChild(header);
    section.appendChild(row);
    return section;
}

function buildStreamingSections(books) {
    const source = Array.isArray(books) ? books : [];
    const sections = [];

    const topRated = getMostPopular(source, 18);
    if (topRated.length) sections.push({ title: 'Top Rated', tag: 'Trending', books: topRated });

    const newReleases = getNewReleases(source, 18);
    if (newReleases.length) sections.push({ title: 'New Releases', tag: 'Latest', books: newReleases });

    const history = getHistoryAndThoughtBooks(source, 18);
    if (history.length) sections.push({ title: 'History', tag: 'Featured', books: history });

    const groups = new Map();
    source.forEach((book) => {
        const category = normalizeCategory(book.category || book.genre || 'General');
        if (!category) return;
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(book);
    });

    [...groups.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 8)
        .forEach(([category, items]) => {
            sections.push({
                title: category,
                tag: `${items.length} titles`,
                books: items.slice(0, 18),
            });
        });

    return sections;
}

// ========================================
// إنشاء كارت الكتاب (premium storefront)
// ========================================
function createBookCard(book) {
    const card = document.createElement('div');
    card.className = 'book-card book-card--premium';

    const bookId = normalizeBookId(book.id);
    const isFavorite = checkIfFavorite(bookId);
    const detailsUrl = `details.html?id=${encodeURIComponent(bookId)}`;
    const starRow = renderRatingStarsRow(book.rating);
    const coverAttrs = getBookCoverAttrs(book.title);

    card.innerHTML = `
        <div class="fav-icon ${isFavorite ? 'active' : ''}" data-book-id="${escapeAttr(bookId)}" aria-label="Toggle favorite">
            <span class="material-icons-outlined">favorite</span>
        </div>
        <div class="book-card__cover-wrap">
            <img
                class="book-card__cover"
                src="${escapeAttr(coverAttrs.src)}"
                alt="${escapeAttr(book.title)}"
                data-cover-fallbacks="${escapeAttr(coverAttrs.fallbacks)}"
                onerror="${BOOK_COVER_ONERROR}"
            >
        </div>
        <div class="book-card__body">
            <h3>${escapeHtml(truncateText(book.title, 52))}</h3>
            <p class="book-card__author">${escapeHtml(book.author)}</p>
            <div class="book-card__rating-row">
                <span class="book-card__stars" aria-hidden="true">${starRow}</span>
                <span class="book-card__rating-num">${book.rating.toFixed(1)}</span>
            </div>
            <a href="${detailsUrl}" class="book-card__cta">View Details</a>
        </div>
    `;

    const coverWrap = card.querySelector('.book-card__cover-wrap');
    coverWrap.addEventListener('click', () => goToDetails(bookId));
    coverWrap.style.cursor = 'pointer';

    const favIcon = card.querySelector('.fav-icon');
    favIcon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetBookId = favIcon.dataset.bookId;
        toggleFavorite(targetBookId, favIcon);
    });

    const cta = card.querySelector('.book-card__cta');
    cta.addEventListener('click', (e) => {
        e.preventDefault();
        goToDetails(bookId);
    });

    return card;
}

function renderRatingStarsRow(rating) {
    const r = Math.min(5, Math.max(0, Number(rating) || 0));
    const full = Math.floor(r);
    let s = '';
    for (let i = 0; i < full; i++) s += '★';
    for (let i = full; i < 5; i++) s += '☆';
    return s;
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
}

function escapeAttr(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ========================================
// الانتقال لصفحة التفاصيل
// ========================================
function goToDetails(id) {
    const normalizedId = normalizeBookId(id);
    const book = booksList.find((b) => normalizeBookId(b.id) === normalizedId);
    if (book) {
        safeStorage.set('selectedBook', JSON.stringify(book));
        window.location.href = `details.html?id=${encodeURIComponent(normalizedId)}`;
    }
}

// ========================================
// إضافة/إزالة من المفضلة
// ========================================
async function toggleFavorite(bookId, iconElement) {
    bookId = normalizeBookId(bookId);
    let favorites = getFavorites();

    const index = favorites.indexOf(bookId);

    if (index > -1) {
        favorites.splice(index, 1);
        iconElement.classList.remove('active');
        showToast('Removed from favorites', 'info');
    } else {
        favorites.push(bookId);
        iconElement.classList.add('active');
        showToast('Added to favorites ❤️', 'success');

        iconElement.style.animation = 'heartBeat 0.3s ease';
        setTimeout(() => iconElement.style.animation = '', 300);
    }

    const normalizedFavorites = normalizeFavoriteIds(favorites);
    saveFavorites(normalizedFavorites);

    if (auth.currentUser) {
        try {
            await setDoc(
                doc(db, 'users', auth.currentUser.uid),
                { favorites: normalizedFavorites },
                { merge: true }
            );
        } catch (error) {
            console.error('Failed to sync favorites to Firestore:', error);
        }
    }
}

// ========================================
// إعداد البحث
// ========================================
function setupSearch() {
    const searchInput = getSearchInputElement();
    if (!searchInput) return;
    if (searchInput.dataset.homeSearchBound === '1') return;
    searchInput.dataset.homeSearchBound = '1';

    searchInput.addEventListener('input', (e) => {
        currentSearchTerm = String(e.target.value || '').trim();
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            void runSearchAndFilter();
        }, 300);
    });

    searchInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (searchDebounce) clearTimeout(searchDebounce);
        void runSearchAndFilter();
    });
}

// ========================================
// إعداد التصنيفات
// ========================================
function renderCategoryChips() {
    const container = document.querySelector('#categories-container, .categories-wrapper, .category-chips');
    if (!container) return;

    container.innerHTML = '';

    availableCategories.forEach((category) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `category-chip category-btn${category === 'All' ? ' active' : ''}`;
        button.setAttribute('data-category', category);
        button.textContent = category;
        container.appendChild(button);
    });
}

function setupCategories() {
    const categoryButtons = document.querySelectorAll('.category-btn');
    if (!categoryButtons.length) return;

    categoryButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            categoryButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            selectedCategory = btn.getAttribute('data-category') || btn.innerText || 'All';
            forceGridMode = true;
            runSearchAndFilter();
        });
    });
}

async function runSearchAndFilter() {
    if (!booksLoaded) return;
    showHomeLoading(true);
    if (isBrowsingRowsMode()) {
        renderHomeRows();
        showHomeLoading(false);
        return;
    }

    const byCategory = filterByCategoryList(booksList, selectedCategory);
    const filtered = currentSearchTerm ? searchInBooks(byCategory, currentSearchTerm) : byCategory;
    toggleHomeMode(false);
    renderBookGridByElement(filtered, document.getElementById('search-results-grid'));
    showHomeLoading(false);
}

function syncSearchTermFromInput() {
    const searchInput = getSearchInputElement();
    if (!searchInput) return;
    currentSearchTerm = String(searchInput.value || '').trim();
}

function getSearchInputElement() {
    return document.querySelector('#search-input, .search-bar-premium__input');
}

// ========================================
// إعداد القائمة السفلية
// ========================================
function setupBottomNav() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const href = item.getAttribute('href');
            if (href === '#') {
                e.preventDefault();
                showToast('This feature is coming soon!', 'info');
            }
        });
    });
}

function setupCartBadge() {
    updateCartBadge();
}

function updateCartBadge() {
    const badge = document.getElementById('cart-count-badge');
    if (!badge) return;
    const items = getCartItems();
    badge.textContent = String(items.length);
    badge.classList.toggle('hidden', items.length === 0);
}

// ========================================
// إعداد الإشعارات
// ========================================
function setupNotifications() {
    const notifBtn = document.getElementById('notif-btn');
    const dropdown = document.getElementById('notification-dropdown');
    const markAllRead = document.getElementById('mark-all-read');
    const notifList = document.getElementById('notification-list');

    if (!notifBtn || !dropdown) return;
    closeNotificationDropdown(dropdown, notifBtn);

    notifBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const willOpen = !isNotificationDropdownOpen(dropdown);
        if (willOpen) {
            openNotificationDropdown(dropdown, notifBtn);
        } else {
            closeNotificationDropdown(dropdown, notifBtn);
        }
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !notifBtn.contains(e.target)) {
            closeNotificationDropdown(dropdown, notifBtn);
        }
    });

    markAllRead?.addEventListener('click', async () => {
        await markAllNotificationsRead();
        showToast('All notifications marked as read', 'success');
    });

    notifList?.addEventListener('click', async (event) => {
        const item = event.target.closest('.notif-item[data-id]');
        if (!item) return;
        const id = String(item.getAttribute('data-id') || '').trim();
        if (!id) return;

        await markSingleNotificationRead(id);
        window.location.href = 'profile.html';
    });

    onAuthStateChanged(auth, (user) => {
        cleanupNotificationSubscriptions();
        notificationState.itemsById.clear();
        renderNotifications([]);
        if (!user) return;

        // Real-time stream: only notifications for current user, newest first.
        const notificationsQuery = query(
            collection(db, 'notifications'),
            where('userId', '==', String(user.uid)),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
            notificationState.itemsById.clear();
            snapshot.docs.forEach((docSnap) => {
                notificationState.itemsById.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
            });
            renderNotifications(Array.from(notificationState.itemsById.values()));
        }, (error) => {
            console.error('Notification listener failed:', error);
        });
        notificationState.unsubscribers.push(unsubscribe);
    });
}

function isNotificationDropdownOpen(dropdown) {
    if (!dropdown) return false;
    return dropdown.classList.contains('active') || dropdown.style.display === 'block';
}

function openNotificationDropdown(dropdown, trigger) {
    dropdown.classList.remove('hidden');
    dropdown.classList.add('active');
    dropdown.style.display = 'block';
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
}

function closeNotificationDropdown(dropdown, trigger) {
    dropdown.classList.remove('active');
    dropdown.classList.add('hidden');
    dropdown.style.display = 'none';
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

// ========================================
// تحديث عدد الإشعارات
// ========================================
function updateBadgeCount(unreadCount) {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    if (unreadCount === 0) {
        badge.classList.add('hidden');
    } else {
        badge.classList.remove('hidden');
        badge.textContent = unreadCount;
    }
}

function renderNotifications(items) {
    const list = document.getElementById('notification-list');
    if (!list) return;
    const sorted = [...items].sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt));
    const displayItems = sorted.slice(0, 3);
    list.innerHTML = '';

    if (!sorted.length) {
        list.innerHTML = `
            <div class="notif-empty-state" role="status" aria-live="polite">
                <span class="material-icons-outlined notif-empty-state__icon" aria-hidden="true">notifications_none</span>
                <p class="notif-empty-state__title">No notifications yet</p>
                <p class="notif-empty-state__hint">You will see reservation updates here.</p>
            </div>
        `;
        updateBadgeCount(0);
        return;
    }

    const unreadCount = sorted.filter((item) => item.isRead !== true).length;
    displayItems.forEach((item) => {
        const unread = item.isRead !== true;
        const type = String(item.type || '').trim().toLowerCase();
        const isApproved = type === 'approved';
        const title = isApproved ? 'Reservation Approved' : 'Reservation Rejected';
        const body = isApproved
            ? `Your request for ${String(item.bookTitle || 'this book')} is ready.`
            : `Your request for ${String(item.bookTitle || 'this book')} was declined. Reason: ${String(item.reason || 'Not specified')}.`;
        const icon = isApproved ? '✅' : '❌';
        const typeClass = isApproved ? 'notif-approved' : 'notif-rejected';
        const node = document.createElement('div');
        node.className = `notif-item ${typeClass}${unread ? ' unread' : ' read'}`;
        node.setAttribute('data-id', String(item.id || ''));
        node.innerHTML = `
            <span class="notif-item__dot" aria-hidden="true"></span>
            <div class="notif-item__icon" aria-hidden="true">${icon}</div>
            <div class="notif-item__content">
                <div class="notif-item__title">${escapeHtml(title)}</div>
                <div class="notif-item__body">${escapeHtml(body)}</div>
                <div class="notif-item__time">${timeAgo(item.createdAt)}</div>
            </div>
        `;
        list.appendChild(node);
    });
    updateBadgeCount(unreadCount);
}

async function markAllNotificationsRead() {
    const unread = Array.from(notificationState.itemsById.values()).filter((item) => item.isRead !== true);
    await Promise.all(unread.map((item) => markSingleNotificationRead(item.id)));
}

async function markSingleNotificationRead(notificationId) {
    if (!notificationId) return;
    try {
        // Persist read state so badge and item UI stay in sync across sessions.
        await setDoc(
            doc(db, 'notifications', String(notificationId)),
            { isRead: true, readAt: new Date().toISOString() },
            { merge: true }
        );
        const existing = notificationState.itemsById.get(notificationId);
        if (existing) {
            notificationState.itemsById.set(notificationId, { ...existing, isRead: true });
            renderNotifications(Array.from(notificationState.itemsById.values()));
        }
    } catch (error) {
        console.error('Failed to mark notification read:', error);
    }
}

function cleanupNotificationSubscriptions() {
    notificationState.unsubscribers.forEach((unsubscribe) => {
        try { unsubscribe(); } catch {}
    });
    notificationState.unsubscribers = [];
}

function getTimestampMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function timeAgo(value) {
    const ms = getTimestampMs(value);
    if (!ms) return 'Just now';
    const diff = Date.now() - ms;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return 'Just now';
    if (diff < hour) {
        const valueInMinutes = Math.max(1, Math.floor(diff / minute));
        return `${valueInMinutes} minute${valueInMinutes > 1 ? 's' : ''} ago`;
    }
    if (diff < day) {
        const valueInHours = Math.max(1, Math.floor(diff / hour));
        return `${valueInHours} hour${valueInHours > 1 ? 's' : ''} ago`;
    }
    const valueInDays = Math.max(1, Math.floor(diff / day));
    return `${valueInDays} day${valueInDays > 1 ? 's' : ''} ago`;
}

// ========================================
// LocalStorage Functions (Safe)
// ========================================
function getFavorites() {
    const stored = safeStorage.get('favorites');
    if (!stored) return [];
    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? normalizeFavoriteIds(parsed) : [];
    } catch (e) {
        console.error('Error parsing favorites:', e);
        return [];
    }
}

function saveFavorites(favorites) {
    const normalized = normalizeFavoriteIds(favorites);
    safeStorage.set('favorites', JSON.stringify(normalized));
    window.dispatchEvent(
        new CustomEvent('favorites:updated', { detail: { count: normalized.length, source: 'home-direct' } })
    );
}

function checkIfFavorite(bookId) {
    bookId = normalizeBookId(bookId);
    const favorites = getFavorites();
    return favorites.includes(bookId);
}

async function fetchBooksFromCloud() {
    const snapshot = await getDocs(collection(db, 'books'));
    const books = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        const resolvedId = data.id ?? docSnap.id;
        const coverUrl = data.coverUrl || data.cover || data.image || '';
        const resolvedCategory = String(data.category || data.genre || 'General').trim();
        const resolvedGenre = String(data.genre || data.category || '').trim();
        return {
            id: resolvedId,
            cloudId: docSnap.id,
            title: data.title || '',
            author: data.author || '',
            category: resolvedCategory,
            genre: resolvedGenre,
            image: coverUrl,
            description: data.description || '',
            rating: Number(data.rating || 0),
            year: Number(data.year || 0),
            language: data.language || 'English',
            isTrending: Boolean(data.isTrending),
            isSuspended: data.isSuspended === true,
            vendorId: data.vendorId || '',
            vendorPhone: data.vendorPhone || data.sellerPhone || '',
        };
    });

    return books
        .filter((book) => book.isSuspended !== true)
        .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
}

function renderBookGrid(books, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    renderBookGridByElement(books, container);
}

function renderBookGridByElement(books, container) {
    if (!container) return;
    container.innerHTML = '';
    if (!books.length) {
        container.innerHTML = '<div class="no-books-found">No books found</div>';
        return;
    }
    books.forEach((book) => {
        container.appendChild(createBookCard(book));
    });
}

function searchInBooks(books, query) {
    const searchTerm = String(query || '').trim().toLowerCase();
    if (!searchTerm) return books;
    return books.filter((book) =>
        String(book.title || '').toLowerCase().includes(searchTerm) ||
        String(book.author || '').toLowerCase().includes(searchTerm) ||
        String(book.category || '').toLowerCase().includes(searchTerm) ||
        String(book.genre || '').toLowerCase().includes(searchTerm)
    );
}

function normalizeCategory(dbCategory) {
    const raw = String(dbCategory ?? '').trim();
    if (!raw) return raw;

    const compact = raw.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    const key = compact.replace(/\s+/g, '');

    const aliasMap = {
        scifi: 'Sci-Fi & Fantasy',
        'sci-fi': 'Sci-Fi & Fantasy',
        scifiandfantasy: 'Sci-Fi & Fantasy',
        fantasy: 'Sci-Fi & Fantasy',
        children: 'Children & YA',
        child: 'Children & YA',
        kids: 'Children & YA',
        kid: 'Children & YA',
        ya: 'Children & YA',
        youngadult: 'Children & YA',
        youngadults: 'Children & YA',
        selfhelp: 'Self-Help',
        development: 'Self-Help',
        thriller: 'Horror & Thriller',
        horror: 'Horror & Thriller',
        tech: 'Technology & Programming',
        technology: 'Technology & Programming',
        programming: 'Technology & Programming',
        computer: 'Technology & Programming',
        computers: 'Technology & Programming',
        religion: 'Religion & Spirituality',
        religious: 'Religion & Spirituality',
        islamic: 'Religion & Spirituality',
        spiritual: 'Religion & Spirituality',
        spirituality: 'Religion & Spirituality',
    };

    if (aliasMap[key]) return aliasMap[key];

    const officialMatch = CATEGORIES.find((cat) => String(cat).toLowerCase() === compact);
    if (officialMatch) return officialMatch;

    return raw;
}

function filterByCategoryList(books, category) {
    const normalizedCategory = String(category || 'All').trim();
    if (normalizedCategory === 'All') return books;
    return books.filter((book) => {
        const resolvedCategory = normalizeCategory(book.category || book.genre);
        return String(resolvedCategory).toLowerCase() === normalizedCategory.toLowerCase();
    });
}

function buildAvailableCategories(books) {
    const source = Array.isArray(books) ? books : [];
    const discovered = new Set();
    source.forEach((book) => {
        const normalized = normalizeCategory(book.category || book.genre);
        if (normalized) discovered.add(normalized);
    });

    const next = ['All'];
    CATEGORIES.filter((cat) => cat !== 'All').forEach((cat) => {
        if (discovered.has(cat)) next.push(cat);
    });
    [...discovered].forEach((cat) => {
        if (!next.includes(cat)) next.push(cat);
    });
    return next;
}

function getTrendingBooks(books) {
    return books.filter((book) => book.isTrending === true);
}

function getNewReleases(books, maxItems = 10) {
    return [...books]
        .filter((book) => book.year >= 2015)
        .sort((a, b) => b.year - a.year)
        .slice(0, maxItems);
}

function getMostPopular(books, maxItems = 10) {
    return [...books]
        .sort((a, b) => b.rating - a.rating)
        .slice(0, maxItems);
}

function getArabicBooks(books) {
    return books.filter((book) => book.language === 'Arabic');
}

function getForeignBooks(books) {
    return books.filter((book) => book.language === 'English');
}

function getWorldLiteratureBooks(books, maxItems = 18) {
    return books
        .filter((book) => String(book.language || '').toLowerCase() === 'english')
        .slice(0, maxItems);
}

function getHistoryAndThoughtBooks(books, maxItems = 18) {
    return books
        .filter((book) => {
            const category = String(book.category || '').toLowerCase();
            return category.includes('history') || category.includes('thought') || category.includes('philosophy');
        })
        .slice(0, maxItems);
}

function toggleHomeMode(showRows) {
    const rowsWrapper = document.getElementById('home-rows-wrapper');
    const searchSection = document.getElementById('search-results-section');
    if (rowsWrapper) rowsWrapper.hidden = !showRows;
    if (searchSection) searchSection.hidden = showRows;
}

function showHomeLoading(isLoading) {
    const loader = document.getElementById('home-loading');
    if (!loader) return;
    loader.classList.toggle('is-hidden', !isLoading);
}

function normalizeBookId(id) {
    return String(id ?? '').trim();
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

// ========================================
// دوال مساعدة
// ========================================
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
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
        success: '#27ae60',
        info: '#3498db',
        error: '#e74c3c'
    };

    toast.textContent = message;
    toast.style.background = colors[type] || colors.info;
    toast.style.opacity = '1';

    setTimeout(() => toast.style.opacity = '0', 2000);
}
