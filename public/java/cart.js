import { addDoc, collection, getDocs, limit, query, serverTimestamp, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { auth, db } from './firebase-client.js';
import { safeStorage } from './storage.js';

const CART_KEY = 'cartItems';
const RESERVATION_DUPLICATE_WINDOW_MINUTES = 30;

window.addEventListener('DOMContentLoaded', () => {
    initCartPage();
});

function initCartPage() {
    renderCart();
    bindCartActions();
}

function bindCartActions() {
    const confirmAllBtn = document.getElementById('confirm-all-btn');
    const checkoutModal = document.getElementById('checkout-modal');
    const closeBtn = document.getElementById('checkout-modal-close');
    const cancelBtn = document.getElementById('checkout-cancel-btn');
    const submitBtn = document.getElementById('checkout-submit-btn');

    confirmAllBtn?.addEventListener('click', () => {
        const items = getCartItems();
        if (!items.length) {
            showToast('Your cart is empty.', 'info');
            return;
        }
        checkoutModal?.classList.add('active');
        document.body.style.overflow = 'hidden';
    });

    const closeModal = () => {
        checkoutModal?.classList.remove('active');
        document.body.style.overflow = '';
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    closeBtn?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') closeModal();
    });
    checkoutModal?.addEventListener('click', (event) => {
        if (event.target === checkoutModal) closeModal();
    });

    submitBtn?.addEventListener('click', async () => {
        await submitAllReservations();
    });
}

function renderCart() {
    const list = document.getElementById('cart-items-list');
    const emptyState = document.getElementById('cart-empty-state');
    const pill = document.getElementById('cart-items-pill');
    if (!list || !emptyState) return;

    const items = getCartItems();
    list.innerHTML = '';

    if (!items.length) {
        emptyState.classList.remove('hidden');
        list.classList.add('hidden');
        updateSummary(0, 0);
        updateCartBadge(0);
        if (pill) pill.textContent = '0 Items';
        return;
    }

    emptyState.classList.add('hidden');
    list.classList.remove('hidden');
    items.forEach((item) => {
        list.appendChild(createCartItemElement(item));
    });

    const totalPrice = items.reduce((sum, item) => sum + Number(item.price || 0), 0);
    updateSummary(items.length, totalPrice);
    updateCartBadge(items.length);
    if (pill) pill.textContent = `${items.length} ${items.length === 1 ? 'Item' : 'Items'}`;
}

function createCartItemElement(item) {
    const element = document.createElement('article');
    element.className = 'cart-item-card';
    element.innerHTML = `
        <img src="${escapeHtml(item.image || '')}" alt="${escapeHtml(item.title || 'Book')}" class="cart-item-cover"
             onerror="this.onerror=null; this.src='https://placehold.co/180x270/eeeeee/999999?text=No+Cover';">
        <div class="cart-item-content">
            <h4>${escapeHtml(item.title || 'Untitled')}</h4>
            <p class="cart-item-meta">${escapeHtml(item.author || 'Unknown author')}</p>
            <p class="cart-item-meta">Vendor: ${escapeHtml(item.vendorId || '--')}</p>
            <p class="cart-item-meta cart-item-meta--time">Added: ${escapeHtml(formatAddedTime(item.addedAt))}</p>
            <p class="cart-item-price">${formatIqdPrice(item.price)}</p>
        </div>
        <button type="button" class="cart-remove-btn" data-remove-id="${escapeHtml(item.bookId || '')}">
            Remove
        </button>
    `;

    const removeBtn = element.querySelector('.cart-remove-btn');
    removeBtn?.addEventListener('click', () => {
        removeCartItem(removeBtn.getAttribute('data-remove-id') || '');
    });
    return element;
}

function removeCartItem(bookId) {
    const id = String(bookId || '').trim();
    if (!id) return;
    const next = getCartItems().filter((item) => String(item.bookId || '').trim() !== id);
    saveCartItems(next);
    renderCart();
    showToast('Item removed from cart.', 'info');
}

async function submitAllReservations() {
    const nameInput = document.getElementById('checkout-name');
    const phoneInput = document.getElementById('checkout-phone');
    const submitBtn = document.getElementById('checkout-submit-btn');
    const modal = document.getElementById('checkout-modal');

    const userName = String(nameInput?.value || '').trim();
    const userPhone = String(phoneInput?.value || '').trim();
    const items = getCartItems();
    const userId = String(auth.currentUser?.uid || '');
    const userEmail = String(auth.currentUser?.email || '');

    if (!items.length) {
        showToast('Your cart is empty.', 'info');
        return;
    }
    if (!userName) {
        showToast('Please enter your name.', 'error');
        return;
    }
    if (!userPhone) {
        showToast('Please enter your phone number.', 'error');
        return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
        let createdCount = 0;
        let skippedDuplicates = 0;

        for (const item of items) {
            const isDuplicate = await hasRecentDuplicateReservation(
                String(item.bookId || ''),
                userPhone,
                RESERVATION_DUPLICATE_WINDOW_MINUTES
            );
            if (isDuplicate) {
                skippedDuplicates += 1;
                continue;
            }

            await addDoc(collection(db, 'reservations'), {
                bookId: String(item.bookId || ''),
                title: String(item.title || ''),
                price: Number(item.price || 0),
                vendorId: String(item.vendorId || ''),
                userName,
                userPhone,
                userId,
                userEmail,
                status: 'pending',
                createdAt: serverTimestamp(),
            });
            createdCount += 1;
        }

        saveCartItems([]);
        if (createdCount > 0) {
            showToast('Reservations submitted successfully ✅', 'success');
        } else {
            showToast('No new reservations submitted (duplicates detected).', 'info');
        }
        modal?.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(() => {
            const params = new URLSearchParams({
                created: String(createdCount),
                skipped: String(skippedDuplicates),
            });
            window.location.href = `checkout-success.html?${params.toString()}`;
        }, 650);
    } catch (error) {
        console.error('Failed to submit cart reservations:', error);
        showToast('Checkout failed. Please try again.', 'error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

function updateSummary(totalItems, totalPrice) {
    const itemsEl = document.getElementById('summary-total-items');
    const priceEl = document.getElementById('summary-total-price');
    if (itemsEl) itemsEl.textContent = String(totalItems);
    if (priceEl) priceEl.textContent = formatIqdPrice(totalPrice);
}

function updateCartBadge(count) {
    const badge = document.getElementById('cart-count-badge');
    if (!badge) return;
    badge.textContent = String(count);
    badge.classList.toggle('hidden', count === 0);
}

function getCartItems() {
    const raw = safeStorage.get(CART_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveCartItems(items) {
    safeStorage.set(CART_KEY, JSON.stringify(Array.isArray(items) ? items : []));
}

function formatIqdPrice(value) {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0)} IQD`;
}

function formatAddedTime(value) {
    const timestamp = Number(value || 0);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Just now';
    return new Date(timestamp).toLocaleString();
}

async function hasRecentDuplicateReservation(bookId, userPhone, withinMinutes = 30) {
    const normalizedBookId = String(bookId || '').trim();
    const normalizedPhone = String(userPhone || '').trim();
    if (!normalizedBookId || !normalizedPhone) return false;

    try {
        const phoneQuery = query(
            collection(db, 'reservations'),
            where('userPhone', '==', normalizedPhone),
            limit(50)
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

function escapeHtml(value) {
    const temp = document.createElement('div');
    temp.textContent = String(value ?? '');
    return temp.innerHTML;
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
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 2200);
}
