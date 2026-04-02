import { collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase-client.js';

const SESSION_KEY = 'superAdminAuthenticated';
const TEST_PASSWORD = 'admin2026';

const body = document.body;
const app = document.getElementById('sa-app');
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const menuToggle = document.getElementById('menu-toggle');
const mobileBackdrop = document.getElementById('mobile-backdrop');
const loginOverlay = document.getElementById('super-admin-login-overlay');
const passwordInput = document.getElementById('sa-admin-password');
const loginButton = document.getElementById('sa-login-btn');
const loginError = document.getElementById('sa-login-error');
const vendorsKpi = document.getElementById('kpi-total-vendors');
const booksKpi = document.getElementById('kpi-total-books');
const recentTableBody = document.getElementById('sa-recent-table-body');
const vendorsTableBody = document.getElementById('sa-vendors-table-body');
const vendorsFilter = document.getElementById('sa-vendors-filter');

let statsLoaded = false;
let totalBooksCount = 0;
let cachedVendorsMap = {};

function formatCount(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function setStatsFallback() {
    [vendorsKpi, booksKpi].forEach((el) => {
        if (!el) return;
        el.classList.remove('shimmer');
        el.textContent = '--';
    });
}

function getTimestampMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatPrice(value) {
    const n = Number(value);
    if (Number.isFinite(n)) return `$${n.toFixed(2)}`;
    return String(value || '--');
}

function createRecentRow(book) {
    const row = document.createElement('tr');
    const safeImage = book.coverUrl || book.image || 'https://placehold.co/48x64/e2e8f0/111827?text=B';
    const title = String(book.title || 'Untitled');
    const author = String(book.author || 'Unknown Author');
    const vendorPhone = String(book.vendorPhone || '--');
    const price = formatPrice(book.price);
    const isSuspended = book.isSuspended === true;
    const statusText = isSuspended ? 'Suspended' : 'Active';
    const statusClass = isSuspended ? 'suspended' : 'active';
    const toggleText = isSuspended ? 'Activate' : 'Suspend';
    const toggleBtnClass = isSuspended ? 'activate-btn' : 'suspend-btn';

    row.innerHTML = `
        <td>
            <div class="book-cell">
                <img src="${safeImage}" alt="${title}" onerror="this.onerror=null; this.src='https://placehold.co/48x64/e2e8f0/111827?text=B';">
                <div>
                    <strong></strong>
                    <small></small>
                </div>
            </div>
        </td>
        <td class="vendor-phone-cell"></td>
        <td class="book-price-cell"></td>
        <td><span class="status ${statusClass}">${statusText}</span></td>
        <td>
            <button class="action-btn ${toggleBtnClass}" type="button" data-action="toggle-suspend" data-book-id="${book.docId}" data-is-suspended="${String(isSuspended)}">
                ${toggleText}
            </button>
            <button class="action-btn remove-btn" type="button" data-action="remove-book" data-book-id="${book.docId}">
                <span class="material-icons-outlined" style="font-size:16px; vertical-align:middle;">delete</span>
                Remove
            </button>
        </td>
    `;

    row.querySelector('strong').textContent = title;
    row.querySelector('small').textContent = author;
    row.querySelector('.vendor-phone-cell').textContent = vendorPhone;
    row.querySelector('.book-price-cell').textContent = price;

    return row;
}

function renderRecentActivity(books) {
    if (!recentTableBody) return;
    recentTableBody.innerHTML = '';

    if (!books.length) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5">No recent books found.</td>';
        recentTableBody.appendChild(row);
        return;
    }

    books.forEach((book) => {
        recentTableBody.appendChild(createRecentRow(book));
    });
}

function renderVendors(vendorsMap, filterState = 'all') {
    if (!vendorsTableBody) return;
    vendorsTableBody.innerHTML = '';

    const vendorEntries = Object.entries(vendorsMap).filter(([, stats]) => {
        if (filterState === 'active') return stats.active > 0;
        if (filterState === 'suspended') return stats.active === 0 && stats.suspended > 0;
        return true;
    });

    if (!vendorEntries.length) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5">No vendors found.</td>';
        vendorsTableBody.appendChild(row);
        return;
    }

    vendorEntries
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([phone, stats]) => {
            const hasAnyActive = stats.active > 0;
            const btnText = hasAnyActive ? 'Suspend All' : 'Activate All';
            const btnClass = hasAnyActive ? 'bulk-suspend-btn' : 'bulk-activate-btn';
            const targetState = hasAnyActive ? 'true' : 'false';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${phone}</td>
                <td>${formatCount(stats.total)}</td>
                <td>${formatCount(stats.active)}</td>
                <td>${formatCount(stats.suspended)}</td>
                <td>
                    <button class="action-btn ${btnClass}" type="button" data-action="bulk-toggle" data-vendor-phone="${phone}" data-target-state="${targetState}">
                        ${btnText}
                    </button>
                </td>
            `;
            vendorsTableBody.appendChild(row);
        });
}

function applyKpiStats(totalBooks, totalVendors) {
    totalBooksCount = Number(totalBooks) || 0;

    if (booksKpi) {
        booksKpi.classList.remove('shimmer');
        booksKpi.textContent = formatCount(totalBooksCount);
    }
    if (vendorsKpi) {
        vendorsKpi.classList.remove('shimmer');
        vendorsKpi.textContent = formatCount(totalVendors);
    }
}

async function loadPlatformStats(forceReload = false) {
    if (statsLoaded && !forceReload) return;
    statsLoaded = true;

    try {
        const snapshot = await getDocs(collection(db, 'books'));
        const allBooks = [];
        const vendorPhones = new Set();
        const vendorsMap = {};

        snapshot.forEach((docSnap) => {
            const data = docSnap.data() || {};
            allBooks.push({
                ...data,
                docId: docSnap.id,
            });
            const phone = String(data.vendorPhone || '').trim();
            if (phone) {
                vendorPhones.add(phone);
                if (!vendorsMap[phone]) {
                    vendorsMap[phone] = {
                        total: 0,
                        active: 0,
                        suspended: 0,
                    };
                }
                vendorsMap[phone].total += 1;
                if (data.isSuspended === true) {
                    vendorsMap[phone].suspended += 1;
                } else {
                    vendorsMap[phone].active += 1;
                }
            }
        });

        const sortedBooks = [...allBooks]
            .sort((a, b) => {
                const bTime = Math.max(getTimestampMs(b.updatedAt), getTimestampMs(b.createdAt));
                const aTime = Math.max(getTimestampMs(a.updatedAt), getTimestampMs(a.createdAt));
                return bTime - aTime;
            })
            .slice(0, 10);

        cachedVendorsMap = vendorsMap;
        applyKpiStats(snapshot.size, vendorPhones.size);
        renderRecentActivity(sortedBooks);
        renderVendors(vendorsMap, vendorsFilter?.value || 'all');
    } catch (error) {
        console.error('Failed to load platform stats:', error);
        setStatsFallback();
    }
}

function closeSidebar() {
    app.classList.remove('sidebar-open');
    mobileBackdrop.classList.add('hidden');
}

function openSidebar() {
    app.classList.add('sidebar-open');
    mobileBackdrop.classList.remove('hidden');
}

function unlockDashboard(skipFade) {
    app.classList.remove('is-locked');

    if (skipFade) {
        loginOverlay.classList.add('hidden');
        return;
    }

    loginOverlay.classList.add('is-fading');
    setTimeout(() => {
        loginOverlay.classList.add('hidden');
    }, 260);
}

function initThemeToggle() {
    themeToggle.addEventListener('click', () => {
        const isLight = body.classList.contains('sa-theme-light');
        body.classList.toggle('sa-theme-light', !isLight);
        body.classList.toggle('sa-theme-dark', isLight);
        themeIcon.textContent = isLight ? 'light_mode' : 'dark_mode';
    });
}

function initSidebar() {
    menuToggle.addEventListener('click', () => {
        const isOpen = app.classList.contains('sidebar-open');
        if (isOpen) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    mobileBackdrop.addEventListener('click', closeSidebar);

    window.addEventListener('resize', () => {
        if (window.innerWidth > 900) closeSidebar();
    });
}

function initRecentTableActions() {
    if (!recentTableBody) return;

    recentTableBody.addEventListener('click', async (event) => {
        const toggleBtn = event.target.closest('[data-action="toggle-suspend"]');
        if (toggleBtn) {
            const bookId = toggleBtn.getAttribute('data-book-id');
            if (!bookId) return;

            const currentState = toggleBtn.getAttribute('data-is-suspended') === 'true';
            const nextState = !currentState;

            try {
                await updateDoc(doc(db, 'books', bookId), { isSuspended: nextState });

                const row = toggleBtn.closest('tr');
                const statusEl = row?.querySelector('.status');
                if (statusEl) {
                    statusEl.classList.remove('active', 'suspended');
                    statusEl.classList.add(nextState ? 'suspended' : 'active');
                    statusEl.textContent = nextState ? 'Suspended' : 'Active';
                }

                toggleBtn.setAttribute('data-is-suspended', String(nextState));
                toggleBtn.textContent = nextState ? 'Activate' : 'Suspend';
                toggleBtn.classList.remove('suspend-btn', 'activate-btn');
                toggleBtn.classList.add(nextState ? 'activate-btn' : 'suspend-btn');
            } catch (error) {
                console.error('Failed to toggle suspend state:', error);
                alert('Failed to update book visibility. Please try again.');
            }
            return;
        }

        const removeBtn = event.target.closest('[data-action="remove-book"]');
        if (!removeBtn) return;

        const bookId = removeBtn.getAttribute('data-book-id');
        if (!bookId) return;

        const ok = confirm('Are you sure you want to permanently delete this book from the platform?');
        if (!ok) return;

        try {
            await deleteDoc(doc(db, 'books', bookId));
            const row = removeBtn.closest('tr');
            row?.remove();

            totalBooksCount = Math.max(0, totalBooksCount - 1);
            if (booksKpi) booksKpi.textContent = formatCount(totalBooksCount);

            if (!recentTableBody.children.length) {
                renderRecentActivity([]);
            }
        } catch (error) {
            console.error('Failed to delete book:', error);
            alert('Failed to delete book. Please try again.');
        }
    });
}

function initLoginProtection() {
    loginButton.addEventListener('click', async () => {
        const value = String(passwordInput.value || '').trim();
        if (value === TEST_PASSWORD) {
            loginError.textContent = '';
            sessionStorage.setItem(SESSION_KEY, '1');
            unlockDashboard(false);
            await loadPlatformStats();
            return;
        }
        loginError.textContent = 'Invalid Admin Password';
    });

    passwordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') loginButton.click();
    });

    if (sessionStorage.getItem(SESSION_KEY) === '1') {
        unlockDashboard(true);
        loadPlatformStats();
    }
}

function initVendorsTableActions() {
    if (!vendorsTableBody) return;

    vendorsTableBody.addEventListener('click', async (event) => {
        const bulkBtn = event.target.closest('[data-action="bulk-toggle"]');
        if (!bulkBtn) return;

        const phone = String(bulkBtn.getAttribute('data-vendor-phone') || '').trim();
        if (!phone) return;

        const targetState = bulkBtn.getAttribute('data-target-state') === 'true';
        const ok = confirm('Are you sure you want to update all books for this vendor?');
        if (!ok) return;

        try {
            const q = query(collection(db, 'books'), where('vendorPhone', '==', phone));
            const snap = await getDocs(q);
            const updatePromises = snap.docs.map((bookDoc) =>
                updateDoc(bookDoc.ref, { isSuspended: targetState })
            );
            await Promise.all(updatePromises);
            await loadPlatformStats(true);
        } catch (error) {
            console.error('Failed to bulk update vendor books:', error);
            alert('Failed to update vendor books. Please try again.');
        }
    });
}

function initVendorsFilter() {
    if (!vendorsFilter) return;

    vendorsFilter.addEventListener('change', (event) => {
        renderVendors(cachedVendorsMap, event.target.value);
    });
}

function initSuperAdminPage() {
    initThemeToggle();
    initSidebar();
    initRecentTableActions();
    initVendorsFilter();
    initVendorsTableActions();
    initLoginProtection();
}

initSuperAdminPage();
