// admin.js
import { booksList, safeStorage } from './data.js';
import { addDoc, collection, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase-client.js';

// ========================================
// التهيئة
// ========================================
window.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
    initAdminDashboard();
});

function checkAdminAuth() {
    const currentUser = safeStorage.get('currentUser');
    
    if (!currentUser) {
        window.location.href = 'owner-login.html';
        return;
    }

    try {
        const user = JSON.parse(currentUser);
        if (user.type !== 'owner') {
            window.location.href = 'owner-login.html';
            return;
        }
        
        document.getElementById('admin-name').textContent = user.name;
    } catch (e) {
        window.location.href = 'owner-login.html';
    }
}

function initAdminDashboard() {
    loadEnhancedStatistics();
    loadReservationsTable();
    loadInventoryTable();
    setupTabs();
    setupFilters();
    setupLogout();
    setupAddBook();
}

// ========================================
// الإحصائيات المحسّنة
// ========================================
function loadEnhancedStatistics() {
    const reservations = getAllReservations();
    const activeReservations = reservations.filter(r => 
        r.status === 'Confirmed' || r.status === 'Pending'
    ).length;
    
    // عدد الكتب المتاحة
    const availableBooks = booksList.filter(b => {
        const inventory = getBookInventory(b.id);
        return inventory.stockStatus === 'available';
    }).length;
    
    // أكثر كتاب مطلوب
    const bookRequests = {};
    reservations.forEach(r => {
        bookRequests[r.bookId] = (bookRequests[r.bookId] || 0) + 1;
    });
    
    let mostRequestedBook = null;
    let maxRequests = 0;
    
    for (const [bookId, count] of Object.entries(bookRequests)) {
        if (count > maxRequests) {
            maxRequests = count;
            const book = booksList.find(b => b.id === parseInt(bookId));
            if (book) {
                mostRequestedBook = book.title;
            }
        }
    }
    
    document.getElementById('stat-active').textContent = activeReservations;
    document.getElementById('stat-available').textContent = availableBooks;
    document.getElementById('most-requested-title').textContent = 
        truncateText(mostRequestedBook || 'No data', 25);
    document.getElementById('most-requested-count').textContent = 
        `${maxRequests} request${maxRequests !== 1 ? 's' : ''}`;
}

// ========================================
// جدول الحجوزات
// ========================================
function loadReservationsTable(filter = 'all') {
    let reservations = getAllReservations();
    
    if (filter === 'active') {
        reservations = reservations.filter(r => 
            r.status === 'Confirmed' || r.status === 'Pending'
        );
    } else if (filter === 'completed') {
        reservations = reservations.filter(r => 
            r.status === 'Picked Up' || r.status === 'Cancelled'
        );
    }
    
    const tbody = document.getElementById('reservations-tbody');
    const empty = document.getElementById('empty-reservations');
    const table = document.querySelector('#reservations-table').parentElement;
    
    if (reservations.length === 0) {
        table.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }
    
    table.style.display = 'block';
    empty.style.display = 'none';
    tbody.innerHTML = '';
    
    reservations.reverse().forEach(reservation => {
        const row = createReservationRow(reservation);
        tbody.appendChild(row);
    });
}

function createReservationRow(reservation) {
    const tr = document.createElement('tr');
    
    const statusColor = {
        'Confirmed': '#27ae60',
        'Pending': '#ff9f43',
        'Picked Up': '#2196f3',
        'Cancelled': '#e74c3c'
    }[reservation.status] || '#666';
    
    const timeAgo = getTimeAgo(reservation.id);
    
    tr.innerHTML = `
        <td>
            <div class="user-cell">
                <div class="user-avatar-small">${reservation.userName.charAt(0).toUpperCase()}</div>
                <div>
                    <strong>${reservation.userName}</strong>
                    <small>${reservation.userPhone}</small>
                </div>
            </div>
        </td>
        <td>
            <div class="book-cell">
                <img src="${reservation.image}" alt="${reservation.title}">
                <div>
                    <strong>${truncateText(reservation.title, 30)}</strong>
                    <small>${reservation.author}</small>
                </div>
            </div>
        </td>
        <td>${reservation.library}</td>
        <td>${reservation.pickupDate || reservation.date}</td>
        <td><span class="time-badge">${timeAgo}</span></td>
        <td><span class="status-badge-table" style="background:${statusColor};">${reservation.status}</span></td>
        <td>
            <div class="table-actions">
                ${reservation.status !== 'Picked Up' && reservation.status !== 'Cancelled' ? `
                    <button class="icon-action complete" onclick="markAsPickedUp(${reservation.id})" title="Mark as Picked Up">
                        <span class="material-icons-outlined">check_circle</span>
                    </button>
                    <button class="icon-action cancel" onclick="cancelReservation(${reservation.id})" title="Cancel">
                        <span class="material-icons-outlined">cancel</span>
                    </button>
                ` : ''}
                <button class="icon-action contact" onclick="contactUser(${reservation.id})" title="Contact User">
                    <span class="material-icons-outlined">phone</span>
                </button>
            </div>
        </td>
    `;
    
    return tr;
}

window.markAsPickedUp = function(reservationId) {
    if (!confirm('Confirm that user has picked up the book?')) return;
    
    updateReservationStatus(reservationId, 'Picked Up');
}

window.cancelReservation = function(reservationId) {
    if (!confirm('Cancel this reservation?')) return;
    
    updateReservationStatus(reservationId, 'Cancelled');
}

function updateReservationStatus(reservationId, newStatus) {
    let reservations = getAllReservations();
    const index = reservations.findIndex(r => r.id === reservationId);
    
    if (index > -1) {
        reservations[index].status = newStatus;
        safeStorage.set('reservations', JSON.stringify(reservations));
        
        loadReservationsTable();
        loadEnhancedStatistics();
        
        showToast(`Reservation ${newStatus.toLowerCase()}!`, 'success');
    }
}

window.contactUser = function(reservationId) {
    const reservations = getAllReservations();
    const reservation = reservations.find(r => r.id === reservationId);
    
    if (!reservation) return;
    
    document.getElementById('contact-name').textContent = reservation.userName;
    document.getElementById('contact-phone').textContent = reservation.userPhone;
    document.getElementById('contact-book').textContent = reservation.title;
    
    const phone = reservation.userPhone.replace(/\D/g, '');
    document.getElementById('call-link').href = `tel:${phone}`;
    document.getElementById('sms-link').href = `sms:${phone}`;
    
    document.getElementById('contact-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

window.closeContactModal = function() {
    document.getElementById('contact-modal').classList.remove('active');
    document.body.style.overflow = '';
}

// ========================================
// جدول المخزون
// ========================================
function loadInventoryTable() {
    const tbody = document.getElementById('inventory-tbody');
    const empty = document.getElementById('empty-inventory');
    const table = document.querySelector('#inventory-table').parentElement;
    
    if (booksList.length === 0) {
        table.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }
    
    table.style.display = 'block';
    empty.style.display = 'none';
    tbody.innerHTML = '';
    
    booksList.forEach(book => {
        const row = createInventoryRow(book);
        tbody.appendChild(row);
    });
}

function createInventoryRow(book) {
    const tr = document.createElement('tr');
    
    const inventory = getBookInventory(book.id);
    const isAvailable = inventory.stockStatus === 'available';
    
    tr.innerHTML = `
        <td>
            <div class="book-cell">
                <img src="${book.image}" alt="${book.title}">
                <div>
                    <strong>${truncateText(book.title, 35)}</strong>
                </div>
            </div>
        </td>
        <td><span class="category-badge">${book.category}</span></td>
        <td>${book.author}</td>
        <td>
            <div class="price-cell">
                <strong>${inventory.price}</strong>
                <button class="edit-price-btn" onclick="editPrice(${book.id})">
                    <span class="material-icons-outlined">edit</span>
                </button>
            </div>
        </td>
        <td>
            <label class="stock-toggle">
                <input type="checkbox" ${isAvailable ? 'checked' : ''} 
                       onchange="toggleStock(${book.id}, this.checked)">
                <span class="toggle-slider-stock"></span>
                <span class="stock-label">${isAvailable ? 'Available' : 'Out of Stock'}</span>
            </label>
        </td>
        <td>
            <div class="table-actions">
                <button class="icon-action edit" onclick="editBook(${book.id})" title="Edit Book">
                    <span class="material-icons-outlined">edit</span>
                </button>
                <button class="icon-action delete" onclick="deleteBook(${book.id})" title="Delete Book">
                    <span class="material-icons-outlined">delete</span>
                </button>
            </div>
        </td>
    `;
    
    return tr;
}

window.editPrice = function(bookId) {
    const book = booksList.find(b => b.id === bookId);
    if (!book) return;
    
    const inventory = getBookInventory(bookId);
    
    document.getElementById('price-book-title').value = book.title;
    document.getElementById('book-price').value = inventory.price;
    
    const modal = document.getElementById('price-modal');
    modal.dataset.bookId = bookId;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

window.closePriceModal = function() {
    document.getElementById('price-modal').classList.remove('active');
    document.body.style.overflow = '';
}

window.savePriceChange = function() {
    const modal = document.getElementById('price-modal');
    const bookId = parseInt(modal.dataset.bookId);
    const newPrice = document.getElementById('book-price').value.trim();
    
    if (!newPrice) {
        showToast('Please enter a price', 'error');
        return;
    }
    
    const inventory = getAllInventory();
    if (!inventory[bookId]) {
        inventory[bookId] = { stockStatus: 'available', price: 'Free' };
    }
    inventory[bookId].price = newPrice;
    
    safeStorage.set('inventory', JSON.stringify(inventory));
    
    loadInventoryTable();
    closePriceModal();
    showToast('Price updated successfully!', 'success');
}

window.toggleStock = function(bookId, isAvailable) {
    const inventory = getAllInventory();
    
    if (!inventory[bookId]) {
        inventory[bookId] = { stockStatus: 'available', price: 'Free' };
    }
    
    inventory[bookId].stockStatus = isAvailable ? 'available' : 'out_of_stock';
    
    safeStorage.set('inventory', JSON.stringify(inventory));
    
    const status = isAvailable ? 'Available' : 'Out of Stock';
    showToast(`Book marked as ${status}`, 'info');
    
    loadEnhancedStatistics();
}

// ========================================
// إدارة الكتب
// ========================================
window.editBook = function(bookId) {
    const book = booksList.find(b => String(b.id) === String(bookId));
    if (!book) return;
    
    const inventory = getBookInventory(bookId);
    
    document.getElementById('book-modal-title').textContent = 'Edit Book';
    document.getElementById('book-title').value = book.title;
    document.getElementById('book-author').value = book.author;
    document.getElementById('book-category').value = book.category;
    document.getElementById('book-description').value = book.description;
    document.getElementById('book-image').value = book.coverUrl || book.image || '';
    document.getElementById('book-price-add').value = inventory.price;
    document.getElementById('book-sample-url').value = book.sampleUrl || '';
    document.getElementById('book-vendor-phone').value = book.vendorPhone || '';
    
    const modal = document.getElementById('book-modal');
    modal.dataset.editId = bookId;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

window.deleteBook = function(bookId) {
    if (!confirm('Are you sure you want to delete this book?')) return;
    
    const index = booksList.findIndex(b => b.id === bookId);
    if (index > -1) {
        booksList.splice(index, 1);
        
        // حذف من المخزون أيضاً
        const inventory = getAllInventory();
        delete inventory[bookId];
        safeStorage.set('inventory', JSON.stringify(inventory));
        
        loadInventoryTable();
        loadEnhancedStatistics();
        showToast('Book deleted successfully', 'info');
    }
}

function setupAddBook() {
    const addBtn = document.getElementById('add-book-btn');
    const saveBtn = document.getElementById('save-book-btn');
    
    addBtn.addEventListener('click', () => {
        document.getElementById('book-modal-title').textContent = 'Add New Book';
        clearBookForm();
        const modal = document.getElementById('book-modal');
        delete modal.dataset.editId;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    
    saveBtn.addEventListener('click', saveBook);
}

window.closeBookModal = function() {
    document.getElementById('book-modal').classList.remove('active');
    document.body.style.overflow = '';
    clearBookForm();
}

function clearBookForm() {
    document.getElementById('book-title').value = '';
    document.getElementById('book-author').value = '';
    document.getElementById('book-category').value = '';
    document.getElementById('book-description').value = '';
    document.getElementById('book-image').value = '';
    document.getElementById('book-price-add').value = '';
    document.getElementById('book-sample-url').value = '';
    document.getElementById('book-vendor-phone').value = '';
}

async function saveBook() {
    const title = document.getElementById('book-title').value.trim();
    const author = document.getElementById('book-author').value.trim();
    const category = document.getElementById('book-category').value;
    const description = document.getElementById('book-description').value.trim();
    const coverUrl = document.getElementById('book-image').value.trim();
    const priceValue = document.getElementById('book-price-add').value.trim();
    const sampleUrl = document.getElementById('book-sample-url').value.trim();
    const vendorPhoneRaw = document.getElementById('book-vendor-phone').value.trim();

    if (!title || !author || !category || !description || !coverUrl || !priceValue || !vendorPhoneRaw) {
        showToast('Please fill all required fields', 'error');
        return;
    }

    const price = Number(priceValue);
    if (!Number.isFinite(price) || price < 0) {
        showToast('Please enter a valid non-negative price', 'error');
        return;
    }

    const formatVendorPhone = (phone) => {
        let normalized = String(phone || '').trim();
        normalized = normalized.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
        if (normalized.startsWith('00')) normalized = `+${normalized.slice(2)}`;
        if (!normalized.startsWith('+')) {
            normalized = `+${normalized.replace(/\D/g, '')}`;
        }
        return normalized;
    };

    const vendorPhone = formatVendorPhone(vendorPhoneRaw);
    if (vendorPhone.length < 8) {
        showToast('Please enter a valid vendor phone number', 'error');
        return;
    }

    const ratingInput = document.getElementById('book-rating');
    const yearInput = document.getElementById('book-year');
    const rating = ratingInput ? parseFloat(ratingInput.value || '0') : 0;
    const year = yearInput ? parseInt(yearInput.value || '0', 10) : 0;

    const payload = {
        title,
        author,
        category,
        description,
        coverUrl,
        image: coverUrl,
        price,
        sampleUrl,
        vendorPhone,
        rating: Number.isFinite(rating) ? rating : 0,
        year: Number.isFinite(year) ? year : 0,
        language: 'English',
        isTrending: false,
        updatedAt: serverTimestamp(),
    };

    const modal = document.getElementById('book-modal');
    const editId = modal.dataset.editId;

    try {
        if (editId) {
            const book = booksList.find(b => String(b.id) === String(editId));
            if (!book) {
                showToast('Book not found for update', 'error');
                return;
            }

            const cloudId = book.cloudId || String(editId);
            await setDoc(doc(db, 'books', cloudId), { ...payload }, { merge: true });

            Object.assign(book, payload);

            const inventory = getAllInventory();
            if (!inventory[book.id]) {
                inventory[book.id] = { stockStatus: 'available', price: 0 };
            }
            inventory[book.id].price = price;
            safeStorage.set('inventory', JSON.stringify(inventory));

            showToast('Book updated successfully!', 'success');
        } else {
            const newBookId = String(Date.now());
            const createPayload = {
                ...payload,
                id: newBookId,
                createdAt: serverTimestamp(),
            };

            const docRef = await addDoc(collection(db, 'books'), createPayload);
            const newBook = {
                ...createPayload,
                cloudId: docRef.id,
            };
            booksList.push(newBook);

            const inventory = getAllInventory();
            inventory[newBookId] = {
                stockStatus: 'available',
                price,
            };
            safeStorage.set('inventory', JSON.stringify(inventory));

            showToast('Book added successfully!', 'success');
        }
    } catch (error) {
        console.error('Failed to save book:', error);
        showToast('Failed to save book. Please try again.', 'error');
        return;
    }

    loadInventoryTable();
    loadEnhancedStatistics();
    closeBookModal();
}

// ========================================
// Helper Functions
// ========================================
function getAllReservations() {
    const stored = safeStorage.get('reservations');
    if (!stored) return [];
    try {
        return JSON.parse(stored);
    } catch (e) {
        return [];
    }
}

function getAllInventory() {
    const stored = safeStorage.get('inventory');
    if (!stored) return {};
    try {
        return JSON.parse(stored);
    } catch (e) {
        return {};
    }
}

function getBookInventory(bookId) {
    const inventory = getAllInventory();
    return inventory[bookId] || { 
        stockStatus: 'available', 
        price: 'Free' 
    };
}

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

function truncateText(text, maxLength) {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function setupTabs() {
    const tabBtns = document.querySelectorAll('.admin-tab-btn');
    const tabContents = document.querySelectorAll('.admin-tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const tabId = `tab-${btn.getAttribute('data-tab')}`;
            document.getElementById(tabId).classList.add('active');
        });
    });
}

function setupFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const filter = btn.getAttribute('data-filter');
            loadReservationsTable(filter);
        });
    });
}

function setupLogout() {
    document.getElementById('admin-logout').addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) {
            safeStorage.remove('currentUser');
            window.location.href = 'owner-login.html';
        }
    });
}

function showToast(message, type = 'info') {
    let toast = document.getElementById('toast');
    
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
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