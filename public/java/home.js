// home.js
import { collection, doc, getDocs, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { auth, db } from './firebase-client.js';
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

// ========================================
// التهيئة عند تحميل الصفحة
// ========================================
window.addEventListener('DOMContentLoaded', () => {
    initHomePage();
    window.addEventListener('favorites:updated', () => {
        renderAllSections();
    });
});

async function initHomePage() {
    showHomeLoading(true);
    setupBottomNav();
    setupNotifications();

    try {
        booksList = await fetchBooksFromCloud();
        renderCategoryChips();
        renderAllSections();
        setupSearch();
        setupCategories();
    } catch (error) {
        console.error('Failed to fetch books from Firestore:', error);
        showToast('Could not load catalog. Please refresh.', 'error');
    } finally {
        showHomeLoading(false);
    }
}

// ========================================
// عرض كل الأقسام
// ========================================
function renderAllSections() {
    const rows = [
        ['trending-container', getTrendingBooks(booksList)],
        ['new-container', getNewReleases(booksList)],
        ['popular-container', getMostPopular(booksList)],
        ['arabic-container', getArabicBooks(booksList)],
        ['foreign-container', getForeignBooks(booksList)],
    ];
    rows.forEach(([id, books]) => renderSection(id, books));
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

    card.innerHTML = `
        <div class="fav-icon ${isFavorite ? 'active' : ''}" data-book-id="${escapeAttr(bookId)}" aria-label="Toggle favorite">
            <span class="material-icons-outlined">favorite</span>
        </div>
        <div class="book-card__cover-wrap">
            <img class="book-card__cover" src="${book.image}" alt="${book.title}" onerror="this.onerror=null; this.src='https://placehold.co/300x450/eeeeee/999999?text=No+Cover';">
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

    saveFavorites(favorites);

    if (auth.currentUser) {
        try {
            await setDoc(
                doc(db, 'users', auth.currentUser.uid),
                { favorites },
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
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        currentSearchTerm = String(e.target.value || '').trim();
        applyActiveFilters();
    });
}

// ========================================
// إعداد التصنيفات
// ========================================
function renderCategoryChips() {
    const container = document.querySelector('#categories-container, .categories-wrapper, .category-chips');
    if (!container) return;

    container.innerHTML = '';

    CATEGORIES.forEach((category) => {
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
            applyActiveFilters();
        });
    });
}

function applyActiveFilters() {
    const byCategory = filterByCategoryList(booksList, selectedCategory);
    const filtered = currentSearchTerm ? searchInBooks(byCategory, currentSearchTerm) : byCategory;

    if (!currentSearchTerm && selectedCategory === 'All') {
        renderAllSections();
        return;
    }

    const mainContainerId = 'trending-container';
    const mainContainer = document.getElementById(mainContainerId);
    if (!mainContainer) return;

    ['new-container', 'popular-container', 'arabic-container', 'foreign-container'].forEach((id) => {
        setBookSectionVisibility(id, false);
    });
    setBookSectionVisibility(mainContainerId, true);

    if (!filtered.length) {
        mainContainer.innerHTML = '<div class="no-books-found">No books found</div>';
        return;
    }

    renderBookGrid(filtered, mainContainerId);
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

// ========================================
// إعداد الإشعارات
// ========================================
function setupNotifications() {
    const notifBtn = document.getElementById('notif-btn');
    const dropdown = document.getElementById('notif-dropdown');
    const markAllRead = document.getElementById('mark-all-read');
    const badge = document.getElementById('notif-badge');

    if (!notifBtn || !dropdown) return;

    notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== notifBtn) {
            dropdown.classList.remove('active');
        }
    });

    markAllRead?.addEventListener('click', () => {
        document.querySelectorAll('.notif-item.unread').forEach(item => {
            item.classList.remove('unread');
        });
        badge.classList.add('hidden');
        showToast('All notifications marked as read', 'success');
    });

    document.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', () => {
            item.classList.remove('unread');
            updateBadgeCount();
        });
    });
}

// ========================================
// تحديث عدد الإشعارات
// ========================================
function updateBadgeCount() {
    const unreadCount = document.querySelectorAll('.notif-item.unread').length;
    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    if (unreadCount === 0) {
        badge.classList.add('hidden');
    } else {
        badge.classList.remove('hidden');
        badge.textContent = unreadCount;
    }
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
            isSuspended: data.isSuspended === true,
        };
    });

    return books
        .filter((book) => book.isSuspended !== true)
        .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
}

function renderBookGrid(books, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    books.forEach((book) => {
        container.appendChild(createBookCard(book));
    });
}

function searchInBooks(books, query) {
    const searchTerm = String(query || '').toLowerCase();
    return books.filter((book) =>
        String(book.title || '').toLowerCase().includes(searchTerm) ||
        String(book.author || '').toLowerCase().includes(searchTerm) ||
        String(book.category || '').toLowerCase().includes(searchTerm)
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
    if (category === 'All') return books;
    return books.filter((book) => normalizeCategory(book.category) === category);
}

function getTrendingBooks(books) {
    return books.filter((book) => book.isTrending === true);
}

function getNewReleases(books) {
    return [...books]
        .filter((book) => book.year >= 2015)
        .sort((a, b) => b.year - a.year)
        .slice(0, 10);
}

function getMostPopular(books) {
    return [...books]
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 10);
}

function getArabicBooks(books) {
    return books.filter((book) => book.language === 'Arabic');
}

function getForeignBooks(books) {
    return books.filter((book) => book.language === 'English');
}

function showHomeLoading(isLoading) {
    const loader = document.getElementById('home-loading');
    if (!loader) return;
    loader.classList.toggle('is-hidden', !isLoading);
}

function normalizeBookId(id) {
    return String(id ?? '').trim();
}

function normalizeFavoriteIds(ids) {
    const source = Array.isArray(ids) ? ids : [];
    return Array.from(new Set(source.map((id) => normalizeBookId(id)).filter(Boolean)));
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
