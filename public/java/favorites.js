// favorites.js
import {
    collection,
    documentId,
    getDocs,
    query,
    where
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { BOOK_COVER_ONERROR, getBookCoverAttrs } from './cover-utils.js';
import { db } from './firebase-client.js';
import { safeStorage } from './storage.js';

window.addEventListener('DOMContentLoaded', () => {
    initFavoritesPage();
});

async function initFavoritesPage() {
    setupClearAll();
    await renderFavorites();
}

async function renderFavorites() {
    showLoading(true);
    const favorites = getFavorites();

    const emptyState = document.getElementById('empty-state');
    const favoritesSection = document.getElementById('favorites-section');
    const favGrid = document.getElementById('favorites-grid');
    const clearBtn = document.getElementById('clear-all');
    updateFavoritesBadges(favorites.length);

    if (favorites.length === 0) {
        if (favoritesSection) favoritesSection.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        if (clearBtn) clearBtn.style.display = 'none';
        showLoading(false);
        return;
    }

    try {
        const { books, cleanedIds, staleIds } = await fetchFavoriteBooks(favorites);

        if (staleIds.length > 0) {
            // Auto-clean favorites that no longer exist in Firestore.
            saveFavorites(cleanedIds);
            showToast(`${staleIds.length} unavailable favorite(s) were removed.`, 'info');
        }

        favGrid.innerHTML = '';

        if (!books.length) {
            if (favoritesSection) favoritesSection.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
            if (clearBtn) clearBtn.style.display = 'none';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (favoritesSection) favoritesSection.style.display = 'block';
        if (clearBtn) clearBtn.style.display = 'block';

        books.forEach((book) => {
            favGrid.appendChild(createFavoriteCard(book));
        });
    } catch (error) {
        console.error('Error loading favorites from Firestore:', error);
        if (favoritesSection) favoritesSection.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        if (clearBtn) clearBtn.style.display = 'none';
    } finally {
        showLoading(false);
    }
}

async function fetchFavoriteBooks(favoriteIds) {
    const ids = normalizeFavoriteIds(favoriteIds).map((id) => String(id));
    if (!ids.length) return { books: [], cleanedIds: [], staleIds: [] };

    const chunks = chunkArray(ids, 30);
    const docs = [];

    for (const chunk of chunks) {
        const q = query(collection(db, 'books'), where(documentId(), 'in', chunk));
        const snap = await getDocs(q);
        snap.docs.forEach((docSnap) => {
            docs.push(mapBookDoc(docSnap));
        });
    }

    const byId = new Map(docs.map((book) => [normalizeBookId(book.id), book]));
    const normalized = normalizeFavoriteIds(favoriteIds);
    const books = [];
    const cleanedIds = [];
    const staleIds = [];

    normalized.forEach((id) => {
        const key = normalizeBookId(id);
        const book = byId.get(key);
        if (book) {
            books.push(book);
            cleanedIds.push(key);
        } else {
            staleIds.push(key);
        }
    });

    return { books, cleanedIds, staleIds };
}

function createFavoriteCard(book) {
    const bookId = normalizeBookId(book.id);
    const card = document.createElement('div');
    card.className = 'book-card book-card--premium';
    card.dataset.bookId = bookId;

    const stars = renderRatingStarsRow(book.rating);
    const coverAttrs = getBookCoverAttrs(book.title);

    card.innerHTML = `
        <div class="fav-icon active" data-book-id="${escapeAttr(bookId)}" aria-label="Remove favorite">
            <span class="material-icons-outlined">favorite</span>
        </div>
        <div class="book-card__cover-wrap">
            <img class="book-card__cover" src="${escapeAttr(coverAttrs.src)}" alt="${escapeAttr(book.title)}" data-cover-fallbacks="${escapeAttr(coverAttrs.fallbacks)}" onerror="${BOOK_COVER_ONERROR}">
        </div>
        <div class="book-card__body">
            <h3>${escapeHtml(truncateText(book.title, 52))}</h3>
            <p class="book-card__author">${escapeHtml(book.author)}</p>
            <div class="book-card__rating-row">
                <span class="book-card__stars" aria-hidden="true">${stars}</span>
                <span class="book-card__rating-num">${book.rating.toFixed(1)}</span>
            </div>
            <a href="details.html?id=${encodeURIComponent(bookId)}" class="book-card__cta">View Details</a>
        </div>
    `;

    const coverWrap = card.querySelector('.book-card__cover-wrap');
    coverWrap.style.cursor = 'pointer';
    coverWrap.addEventListener('click', () => {
        window.location.href = `details.html?id=${encodeURIComponent(bookId)}`;
    });

    const cta = card.querySelector('.book-card__cta');
    cta.addEventListener('click', (event) => {
        event.preventDefault();
        window.location.href = `details.html?id=${encodeURIComponent(bookId)}`;
    });

    const favIcon = card.querySelector('.fav-icon');
    favIcon.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeFromFavorites(bookId, card);
    });

    return card;
}

function removeFromFavorites(bookId, cardElement) {
    cardElement.classList.add('removing');
    const targetId = normalizeBookId(bookId);

    setTimeout(async () => {
        let favorites = getFavorites();
        favorites = favorites.filter((id) => normalizeBookId(id) !== targetId);
        saveFavorites(favorites);
        await renderFavorites();
    }, 260);
}

function setupClearAll() {
    const clearBtn = document.getElementById('clear-all');
    if (!clearBtn) return;

    clearBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all favorites?')) {
            saveFavorites([]);
            await renderFavorites();
        }
    });
}

function getFavorites() {
    const stored = safeStorage.get('favorites');
    if (!stored) return [];
    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? normalizeFavoriteIds(parsed) : [];
    } catch (error) {
        console.error('Error parsing favorites:', error);
        return [];
    }
}

function saveFavorites(favorites) {
    const normalized = normalizeFavoriteIds(favorites);
    safeStorage.set('favorites', JSON.stringify(normalized));
    updateFavoritesBadges(normalized.length);
    window.dispatchEvent(new CustomEvent('favorites:updated', { detail: { count: normalized.length } }));
}

function showLoading(isLoading) {
    const loader = document.getElementById('home-loading');
    if (!loader) return;
    loader.classList.toggle('is-hidden', !isLoading);
}

function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

function normalizeFavoriteIds(ids) {
    const seen = new Set();
    const normalized = [];
    (Array.isArray(ids) ? ids : []).forEach((value) => {
        const id = normalizeBookId(value);
        if (!id || seen.has(id)) return;
        seen.add(id);
        normalized.push(id);
    });
    return normalized;
}

function normalizeBookId(id) {
    return String(id ?? '').trim();
}

function mapBookDoc(docSnap) {
    const data = docSnap.data() || {};
    const resolvedId = normalizeBookId(data.id ?? docSnap.id);
    const coverUrl = data.coverUrl || data.cover || data.image || '';
    return {
        id: resolvedId,
        title: data.title || '',
        author: data.author || '',
        image: coverUrl,
        rating: Number(data.rating || 0),
    };
}

function updateFavoritesBadges(count) {
    const safeCount = Math.max(0, Number(count) || 0);
    const targets = document.querySelectorAll(
        '#fav-count, #stat-favorites, .favorites-count, [data-favorites-count]'
    );
    targets.forEach((node) => {
        node.textContent = String(safeCount);
    });
}

function renderRatingStarsRow(rating) {
    const value = Math.min(5, Math.max(0, Number(rating) || 0));
    const full = Math.floor(value);
    let stars = '';
    for (let i = 0; i < full; i += 1) stars += '★';
    for (let i = full; i < 5; i += 1) stars += '☆';
    return stars;
}

function truncateText(text, maxLength) {
    const value = String(text || '');
    if (value.length <= maxLength) return value;
    return `${value.substring(0, maxLength)}...`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

function escapeAttr(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
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
            padding: 12px 18px;
            border-radius: 999px;
            font-size: 0.86rem;
            font-weight: 600;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.25s ease;
            white-space: nowrap;
            pointer-events: none;
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
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 2200);
}