import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { collection, doc, onSnapshot, orderBy, query, setDoc, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { auth, db } from './firebase-client.js';
import { safeStorage } from './storage.js';

const state = {
    notifications: [],
    unsubscribe: null,
};

window.addEventListener('DOMContentLoaded', () => {
    bindUiEvents();
    updateCartBadge();
    subscribeNotifications();
});

function bindUiEvents() {
    const markAllBtn = document.getElementById('notif-page-mark-all');
    markAllBtn?.addEventListener('click', async () => {
        await markAllAsRead();
    });
}

function subscribeNotifications() {
    onAuthStateChanged(auth, (user) => {
        cleanupSubscription();
        state.notifications = [];
        renderNotifications();
        if (!user) return;

        const q = query(
            collection(db, 'notifications'),
            where('userId', '==', String(user.uid)),
            orderBy('createdAt', 'desc')
        );

        state.unsubscribe = onSnapshot(q, (snapshot) => {
            state.notifications = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
            renderNotifications();
        }, (error) => {
            console.error('Failed to subscribe notifications page:', error);
            showToast('Could not load notifications.', 'error');
        });
    });
}

function renderNotifications() {
    const list = document.getElementById('notifications-page-list');
    const empty = document.getElementById('notifications-page-empty');
    if (!list || !empty) return;

    list.innerHTML = '';
    const items = [...state.notifications].sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt));

    if (!items.length) {
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    items.forEach((item) => {
        list.appendChild(createNotificationItem(item));
    });
}

function createNotificationItem(item) {
    const unread = item.isRead !== true;
    const type = String(item.type || '').trim().toLowerCase();
    const isApproved = type === 'approved';
    const title = isApproved ? 'Reservation Approved' : 'Reservation Rejected';
    const body = isApproved
        ? `Your request for ${String(item.bookTitle || 'this book')} is ready.`
        : `Your request for ${String(item.bookTitle || 'this book')} was declined. Reason: ${String(item.reason || 'Not specified')}.`;
    const icon = isApproved ? '✅' : '❌';
    const typeClass = isApproved ? 'notif-approved' : 'notif-rejected';

    const node = document.createElement('article');
    node.className = `notif-item ${typeClass}${unread ? ' unread' : ' read'}`;
    node.dataset.id = String(item.id || '');
    node.innerHTML = `
        <span class="notif-item__dot" aria-hidden="true"></span>
        <div class="notif-item__icon" aria-hidden="true">${icon}</div>
        <div class="notif-item__content">
            <div class="notif-item__title">${escapeHtml(title)}</div>
            <div class="notif-item__body">${escapeHtml(body)}</div>
            <div class="notif-item__time">${timeAgo(item.createdAt)}</div>
        </div>
    `;

    node.addEventListener('click', async () => {
        const notificationId = String(item.id || '').trim();
        if (!notificationId) return;
        await setDoc(doc(db, 'notifications', notificationId), { isRead: true }, { merge: true });
    });

    return node;
}

async function markAllAsRead() {
    const unread = state.notifications.filter((item) => item.isRead !== true);
    if (!unread.length) {
        showToast('No unread notifications.', 'info');
        return;
    }
    try {
        await Promise.all(
            unread.map((item) => setDoc(doc(db, 'notifications', String(item.id || '')), { isRead: true }, { merge: true }))
        );
        showToast('All notifications marked as read.', 'success');
    } catch (error) {
        console.error('Failed to mark all notifications as read:', error);
        showToast('Could not update notifications.', 'error');
    }
}

function cleanupSubscription() {
    if (typeof state.unsubscribe === 'function') {
        try { state.unsubscribe(); } catch {}
    }
    state.unsubscribe = null;
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
        const minutes = Math.max(1, Math.floor(diff / minute));
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    if (diff < day) {
        const hours = Math.max(1, Math.floor(diff / hour));
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    const days = Math.max(1, Math.floor(diff / day));
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

function updateCartBadge() {
    const badge = document.getElementById('cart-count-badge');
    if (!badge) return;
    const raw = safeStorage.get('cartItems');
    let count = 0;
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            count = Array.isArray(parsed) ? parsed.length : 0;
        } catch {
            count = 0;
        }
    }
    badge.textContent = String(count);
    badge.classList.toggle('hidden', count === 0);
}

function escapeHtml(input) {
    const div = document.createElement('div');
    div.textContent = String(input || '');
    return div.innerHTML;
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
