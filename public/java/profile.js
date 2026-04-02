// profile.js
import { booksList } from './data.js';
import { safeStorage } from './storage.js';

// ========================================
// التهيئة
// ========================================
window.addEventListener('DOMContentLoaded', () => {
    loadUserInfo();
    loadReadingHistory();
    loadReservations();
    setupTabs();
    setupSettings();
});

// ========================================
// تحميل بيانات المستخدم
// ========================================
function loadUserInfo() {
    const user = getUserData();

    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-email').textContent = user.email;
    document.getElementById('settings-name').textContent = user.name;
    document.getElementById('settings-email').textContent = user.email;

    // تحديث الصورة بناءً على الاسم
    const avatar = document.getElementById('profile-avatar');
    avatar.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`;

    // تحديث الإحصائيات
    const favorites = getFavorites();
    const reservations = getReservations();
    document.getElementById('stat-favorites').textContent = favorites.length;
    document.getElementById('stat-reserved').textContent = reservations.length;
    document.getElementById('stat-read').textContent = reservations.length;
}

// ========================================
// تحميل سجل القراءة
// ========================================
function loadReadingHistory() {
    const history = getReadingHistory();
    const grid = document.getElementById('profile-history-grid');
    const empty = document.getElementById('empty-history');

    if (history.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }

    grid.style.display = 'grid';
    empty.style.display = 'none';
    grid.innerHTML = '';

    history.forEach(bookId => {
        const book = booksList.find(b => b.id === parseInt(bookId));
        if (book) {
            const card = createMiniCard(book);
            grid.appendChild(card);
        }
    });
}

// ========================================
// تحميل الكتب المحجوزة
// ========================================
function loadReservations() {
    const reservations = getReservations();
    const list = document.getElementById('reserved-list');
    const empty = document.getElementById('empty-reserved');

    if (reservations.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }

    list.style.display = 'flex';
    empty.style.display = 'none';
    list.innerHTML = '';

    reservations.forEach(reservation => {
        const item = createReservationItem(reservation);
        list.appendChild(item);
    });
}

// ========================================
// إنشاء كارت كتاب صغير
// ========================================
function createMiniCard(book) {
    const card = document.createElement('div');
    card.className = 'mini-book-card';

    card.innerHTML = `
        <img src="${book.image}" 
             alt="${book.title}"
             onerror="this.src='https://placehold.co/100x150?text=No+Image'">
        <p>${truncateText(book.title, 20)}</p>
    `;

    card.addEventListener('click', () => {
        window.location.href = `details.html?id=${book.id}`;
    });

    return card;
}

// ========================================
// إنشاء عنصر الحجز
// ========================================
function createReservationItem(reservation) {
    const item = document.createElement('div');
    item.className = 'reservation-item';

    const statusColor = reservation.status === 'Confirmed' ? '#27ae60' : '#ff9f43';

    item.innerHTML = `
        <img src="${reservation.image}" 
             alt="${reservation.title}"
             onerror="this.src='https://placehold.co/60x90?text=No+Image'">
        <div class="reservation-info">
            <h4>${truncateText(reservation.title, 25)}</h4>
            <p class="res-author">${reservation.author}</p>
            <p class="reservation-library">
                <span class="material-icons-outlined" style="font-size:14px;">location_on</span>
                ${reservation.library}
            </p>
            <p class="reservation-date-text">
                <span class="material-icons-outlined" style="font-size:14px;">event</span>
                ${reservation.pickupDate || reservation.date}
            </p>
        </div>
        <div class="reservation-status">
            <span class="res-badge" style="background:${statusColor};">
                ${reservation.status}
            </span>
            <div class="reservation-actions">
                <button class="action-btn edit-btn" data-id="${reservation.id}">
                    <span class="material-icons-outlined">edit</span>
                </button>
                <button class="action-btn cancel-btn" data-id="${reservation.id}">
                    <span class="material-icons-outlined">close</span>
                </button>
            </div>
        </div>
    `;

    // إضافة Event Listeners للأزرار
    const editBtn = item.querySelector('.edit-btn');
    const cancelBtn = item.querySelector('.cancel-btn');

    editBtn.addEventListener('click', () => openEditModal(reservation));
    cancelBtn.addEventListener('click', () => cancelReservation(reservation.id));

    return item;
}

// ========================================
// إعداد التابات
// ========================================
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // إزالة active من الكل
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // تفعيل المضغوط
            btn.classList.add('active');
            const tabId = `tab-${btn.getAttribute('data-tab')}`;
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// ========================================
// إعداد الإعدادات
// ========================================
function setupSettings() {
    // Reserved for non-auth settings interactions.
}

// ========================================
// LocalStorage Functions
// ========================================
function getUserData() {
    const stored = safeStorage.get('user');
    if (stored) {
        try { return JSON.parse(stored); } catch (e) {}
    }
    // بيانات افتراضية
    return {
        name: 'Guest User',
        email: 'guest@books.com'
    };
}

function getFavorites() {
    const stored = safeStorage.get('favorites');
    if (!stored) return [];
    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.map(id => parseInt(id)) : [];
    } catch (e) { return []; }
}

function getReservations() {
    const stored = safeStorage.get('reservations');
    if (!stored) return [];
    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
}

// ========================================
// دوال مساعدة
// ========================================
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// ========================================
// Reading History Storage
// ========================================
function getReadingHistory() {
    const stored = safeStorage.get('readingHistory');
    if (!stored) return [];
    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.map(id => parseInt(id)) : [];
    } catch (e) { return []; }
}

// ========================================
// تعديل الحجز
// ========================================
function openEditModal(reservation) {
    // إنشاء Modal للتعديل
    let modal = document.getElementById('edit-reservation-modal');
    
    if (!modal) {
        modal = createEditModal();
        document.body.appendChild(modal);
    }

    // ملء البيانات
    document.getElementById('edit-book-title').textContent = reservation.title;
    document.getElementById('edit-book-author').textContent = reservation.author;
    document.getElementById('edit-book-cover').src = reservation.image;
    document.getElementById('edit-library-select').value = reservation.library;
    document.getElementById('edit-pickup-date').value = reservation.pickupDate;
    document.getElementById('edit-user-name').value = reservation.userName;
    document.getElementById('edit-user-phone').value = reservation.userPhone;

    // حفظ ID الحجز
    modal.dataset.reservationId = reservation.id;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function createEditModal() {
    const modal = document.createElement('div');
    modal.id = 'edit-reservation-modal';
    modal.className = 'modal-overlay';

    const today = new Date().toISOString().split('T')[0];

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Edit Reservation</h3>
                <span class="material-icons-outlined modal-close" onclick="closeEditModal()">close</span>
            </div>

            <div class="modal-body">
                <div class="book-preview">
                    <img src="" alt="Book Cover" id="edit-book-cover">
                    <div>
                        <h4 id="edit-book-title">-</h4>
                        <p id="edit-book-author">-</p>
                    </div>
                </div>

                <div class="form-group">
                    <label>Select Library</label>
                    <select id="edit-library-select" class="form-select">
                        <option value="">Choose a library...</option>
                        <option value="Central Library">Central Library</option>
                        <option value="City Library">City Library</option>
                        <option value="University Library">University Library</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Pickup Date</label>
                    <input type="date" id="edit-pickup-date" class="form-input" min="${today}">
                </div>

                <div class="form-group">
                    <label>Your Name</label>
                    <input type="text" id="edit-user-name" class="form-input" placeholder="Enter your name">
                </div>

                <div class="form-group">
                    <label>Phone Number</label>
                    <input type="tel" id="edit-user-phone" class="form-input" placeholder="Enter your phone">
                </div>
            </div>

            <div class="modal-footer">
                <button class="btn-secondary" onclick="closeEditModal()">Cancel</button>
                <button class="btn-primary" onclick="saveEditedReservation()">Save Changes</button>
            </div>
        </div>
    `;

    return modal;
}

window.closeEditModal = function() {
    const modal = document.getElementById('edit-reservation-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

window.saveEditedReservation = function() {
    const modal = document.getElementById('edit-reservation-modal');
    const reservationId = parseInt(modal.dataset.reservationId);

    const library = document.getElementById('edit-library-select').value;
    const pickupDate = document.getElementById('edit-pickup-date').value;
    const userName = document.getElementById('edit-user-name').value;
    const userPhone = document.getElementById('edit-user-phone').value;

    if (!library || !pickupDate || !userName.trim() || !userPhone.trim()) {
        alert('Please fill all fields');
        return;
    }

    // تحديث الحجز
    let reservations = getReservations();
    const index = reservations.findIndex(r => r.id === reservationId);

    if (index > -1) {
        reservations[index].library = library;
        reservations[index].pickupDate = pickupDate;
        reservations[index].userName = userName;
        reservations[index].userPhone = userPhone;

        safeStorage.set('reservations', JSON.stringify(reservations));
        
        closeEditModal();
        
        // إعادة تحميل الحجوزات
        loadReservations();
        
        showToast('Reservation updated successfully! ✅', 'success');
    }
}

// ========================================
// إلغاء الحجز
// ========================================
function cancelReservation(reservationId) {
    if (!confirm('Are you sure you want to cancel this reservation?')) {
        return;
    }

    let reservations = getReservations();
    reservations = reservations.filter(r => r.id !== reservationId);

    safeStorage.set('reservations', JSON.stringify(reservations));

    // إعادة تحميل الحجوزات
    loadReservations();

    // تحديث الإحصائيات
    loadUserInfo();

    showToast('Reservation cancelled', 'info');
}

// ========================================
// Toast Notification
// ========================================
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