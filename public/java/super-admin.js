import { signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { auth } from './firebase-client.js';
import {
    deleteBookById,
    deleteBooksByVendorId,
    fetchAllBooks,
    fetchBooksByVendorId,
    updateBookById,
} from './books-firestore-service.js';
import { deleteVendorById, getAllVendors, updateVendorStatus } from './vendors-firestore-service.js';

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
const selectAllBooksCheckbox = document.getElementById('sa-select-all-books');
const bulkDeleteBtn = document.getElementById('sa-bulk-delete-btn');
const vendorsTableBody = document.getElementById('sa-vendors-table-body');
const selectAllVendorsCheckbox = document.getElementById('sa-select-all-vendors');
const vendorsBulkActionSelect = document.getElementById('sa-vendors-bulk-action');
const vendorsBulkApplyBtn = document.getElementById('sa-vendors-bulk-apply');
const vendorsFilter = document.getElementById('sa-vendors-filter');
const sidebarDashboardLink = document.getElementById('sa-link-dashboard');
const sidebarVendorsLink = document.getElementById('sa-link-vendors');
const sidebarBooksLink = document.getElementById('sa-link-books');
const sidebarSettingsLink = document.getElementById('sa-link-settings');
const sidebarLogout = document.getElementById('sa-sidebar-logout');
const dashboardSection = document.getElementById('sa-dashboard-section');
const statsSection = document.querySelector('.sa-stats');
const booksSection = document.getElementById('sa-books-section');
const vendorsSection = document.getElementById('sa-vendors-section');

let statsLoaded = false;
let totalBooksCount = 0;
let cachedVendorsMap = {};
let cachedVendorRows = [];
let toastTimer = null;

function showToast(message, type = 'success') {
    let toast = document.getElementById('sa-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sa-toast';
        toast.className = 'sa-toast';
        document.body.appendChild(toast);
    }

    toast.textContent = String(message || '');
    toast.classList.remove('sa-toast--success', 'sa-toast--error', 'show');
    toast.classList.add(type === 'error' ? 'sa-toast--error' : 'sa-toast--success');

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 2600);
}

async function fetchAllVendorsFromFirestore() {
    const vendors = await getAllVendors();
    return vendors.map((vendor) => ({
        docId: vendor.docId,
        vendorId: String(vendor.vendorId || vendor.docId || '').trim(),
        storeName: String(vendor.storeName || '').trim(),
        email: String(vendor.email || '').trim().toLowerCase(),
        phone: String(vendor.phone || vendor.vendorPhone || '').trim(),
        status: String(vendor.status || 'active').trim().toLowerCase(),
    }));
}

function ensureEmptyTableBodies() {
    if (recentTableBody) recentTableBody.innerHTML = '';
    if (vendorsTableBody) vendorsTableBody.innerHTML = '';
}

function getSelectedBookCheckboxes() {
    if (!recentTableBody) return [];
    return Array.from(recentTableBody.querySelectorAll('input[data-row-select="book"]'));
}

function getSelectedBookIds() {
    return getSelectedBookCheckboxes()
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => String(checkbox.getAttribute('data-book-id') || '').trim())
        .filter(Boolean);
}

function updateBulkActionsState() {
    const checkboxes = getSelectedBookCheckboxes();
    const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;

    if (bulkDeleteBtn) {
        if (selectedCount > 0) {
            bulkDeleteBtn.classList.remove('hidden');
            bulkDeleteBtn.disabled = false;
            bulkDeleteBtn.textContent = `Bulk Delete (${selectedCount})`;
        } else {
            bulkDeleteBtn.classList.add('hidden');
            bulkDeleteBtn.disabled = true;
            bulkDeleteBtn.textContent = 'Bulk Delete';
        }
    }

    if (selectAllBooksCheckbox) {
        const hasRows = checkboxes.length > 0;
        selectAllBooksCheckbox.checked = hasRows && selectedCount === checkboxes.length;
        selectAllBooksCheckbox.indeterminate = hasRows && selectedCount > 0 && selectedCount < checkboxes.length;
    }
}

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
            <input type="checkbox" data-row-select="book" data-book-id="${book.docId}" aria-label="Select ${title}">
        </td>
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
        row.innerHTML = '<td colspan="6">No recent books found.</td>';
        recentTableBody.appendChild(row);
        updateBulkActionsState();
        return;
    }

    books.forEach((book) => {
        recentTableBody.appendChild(createRecentRow(book));
    });
    updateBulkActionsState();
}

function renderVendors(vendorsMap, filterState = 'all') {
    if (!vendorsTableBody) return;
    vendorsTableBody.innerHTML = '';

    const vendorEntries = cachedVendorRows.filter((vendor) => {
        const stats = vendorsMap[vendor.vendorId] || { active: 0, suspended: 0, total: 0 };
        if (filterState === 'active') return stats.active > 0;
        if (filterState === 'suspended') return stats.active === 0 && stats.suspended > 0;
        return true;
    });

    if (!vendorEntries.length) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="6">No vendors found.</td>';
        vendorsTableBody.appendChild(row);
        updateVendorsBulkActionsState();
        return;
    }

    vendorEntries
        .sort((a, b) => {
            const aStats = vendorsMap[a.vendorId] || { total: 0 };
            const bStats = vendorsMap[b.vendorId] || { total: 0 };
            return bStats.total - aStats.total;
        })
        .forEach((vendor) => {
            const vendorId = vendor.vendorId;
            const phone = vendor.phone || '--';
            const stats = vendorsMap[vendorId] || { total: 0, active: 0, suspended: 0 };
            const hasAnyActive = stats.active > 0;
            const btnText = hasAnyActive ? 'Suspend All' : 'Activate All';
            const btnClass = hasAnyActive ? 'bulk-suspend-btn' : 'bulk-activate-btn';
            const targetState = hasAnyActive ? 'true' : 'false';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <input type="checkbox" data-row-select="vendor" data-vendor-id="${vendorId}" data-vendor-phone="${vendor.phone || ''}" aria-label="Select vendor ${phone}">
                </td>
                <td>${phone}</td>
                <td>${formatCount(stats.total)}</td>
                <td>${formatCount(stats.active)}</td>
                <td>${formatCount(stats.suspended)}</td>
                <td>
                    <button class="action-btn ${btnClass}" type="button" data-action="bulk-toggle" data-vendor-id="${vendorId}" data-vendor-phone="${vendor.phone || ''}" data-target-state="${targetState}">
                        ${btnText}
                    </button>
                </td>
            `;
            vendorsTableBody.appendChild(row);
        });
    updateVendorsBulkActionsState();
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
        const allBooks = await fetchAllBooks();
        cachedVendorRows = await fetchAllVendorsFromFirestore();
        const vendorsMap = {};
        const vendorByPhone = {};

        cachedVendorRows.forEach((vendor) => {
            const vendorId = String(vendor.vendorId || '').trim();
            if (!vendorId) return;
            vendorsMap[vendorId] = { total: 0, active: 0, suspended: 0 };
            const phone = String(vendor.phone || '').trim();
            if (phone) vendorByPhone[phone] = vendorId;
        });

        allBooks.forEach((data) => {
            const vendorId = String(data.vendorId || '').trim() || vendorByPhone[String(data.vendorPhone || '').trim()] || '';
            if (!vendorId) return;
            if (!vendorsMap[vendorId]) {
                vendorsMap[vendorId] = { total: 0, active: 0, suspended: 0 };
            }
            vendorsMap[vendorId].total += 1;
            if (data.isSuspended === true) {
                vendorsMap[vendorId].suspended += 1;
            } else {
                vendorsMap[vendorId].active += 1;
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
        applyKpiStats(allBooks.length, cachedVendorRows.length);
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

function initSidebarNavigation() {
    console.log('Sidebar Initialized');
    const navItems = [sidebarDashboardLink, sidebarVendorsLink, sidebarBooksLink, sidebarSettingsLink].filter(Boolean);

    function setActiveNav(activeLink) {
        navItems.forEach((item) => item.classList.remove('active'));
        activeLink?.classList.add('active');
    }

    // SPA-style section visibility toggle to guarantee deterministic behavior.
    function setView(view) {
        const showDashboard = view === 'dashboard' || view === 'settings';
        const showBooks = view === 'books';
        const showVendors = view === 'vendors';

        if (dashboardSection) dashboardSection.style.display = showDashboard ? '' : 'none';
        if (statsSection) statsSection.style.display = showDashboard ? 'grid' : 'none';
        if (booksSection) booksSection.style.display = showBooks ? '' : 'none';
        if (vendorsSection) vendorsSection.style.display = showVendors ? '' : 'none';

        const scrollTarget = showDashboard ? dashboardSection : showBooks ? booksSection : vendorsSection;
        scrollTarget?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        if (window.innerWidth <= 900) {
            closeSidebar();
        }
    }

    sidebarDashboardLink?.addEventListener('click', (event) => {
        event.preventDefault();
        const targetId = String(sidebarDashboardLink.getAttribute('data-target-id') || '');
        console.log('Button Clicked: ', targetId);
        setActiveNav(sidebarDashboardLink);
        setView('dashboard');
    });

    sidebarBooksLink?.addEventListener('click', (event) => {
        event.preventDefault();
        const targetId = String(sidebarBooksLink.getAttribute('data-target-id') || '');
        console.log('Button Clicked: ', targetId);
        setActiveNav(sidebarBooksLink);
        setView('books');
    });

    sidebarVendorsLink?.addEventListener('click', (event) => {
        event.preventDefault();
        const targetId = String(sidebarVendorsLink.getAttribute('data-target-id') || '');
        console.log('Button Clicked: ', targetId);
        setActiveNav(sidebarVendorsLink);
        setView('vendors');
    });

    sidebarSettingsLink?.addEventListener('click', (event) => {
        event.preventDefault();
        const targetId = String(sidebarSettingsLink.getAttribute('data-target-id') || '');
        console.log('Button Clicked: ', targetId);
        setActiveNav(sidebarSettingsLink);
        setView('settings');
    });

    // Ensure initial state always matches active dashboard link.
    setActiveNav(sidebarDashboardLink);
    setView('dashboard');

    sidebarLogout?.addEventListener('click', async (event) => {
        event.preventDefault();
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Failed to sign out:', error);
        } finally {
            sessionStorage.removeItem(SESSION_KEY);
            window.location.href = 'login.html';
        }
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
                await updateBookById(bookId, { isSuspended: nextState });

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
                showToast(`Book ${nextState ? 'suspended' : 'activated'} successfully`, 'success');
            } catch (error) {
                console.error('Failed to toggle suspend state:', error);
                showToast('Failed to update book visibility. Please try again.', 'error');
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
            await deleteBookById(bookId);
            const row = removeBtn.closest('tr');
            row?.remove();

            totalBooksCount = Math.max(0, totalBooksCount - 1);
            if (booksKpi) booksKpi.textContent = formatCount(totalBooksCount);

            if (!recentTableBody.children.length) {
                renderRecentActivity([]);
            }
            updateBulkActionsState();
            showToast('Book deleted successfully', 'success');
        } catch (error) {
            console.error('Failed to delete book:', error);
            showToast('Failed to delete book. Please try again.', 'error');
        }
    });

    recentTableBody.addEventListener('change', (event) => {
        const rowCheckbox = event.target.closest('input[data-row-select="book"]');
        if (!rowCheckbox) return;
        updateBulkActionsState();
    });
}

function initBulkBookActions() {
    if (!bulkDeleteBtn || !selectAllBooksCheckbox) return;

    selectAllBooksCheckbox.addEventListener('change', () => {
        const checked = selectAllBooksCheckbox.checked;
        getSelectedBookCheckboxes().forEach((checkbox) => {
            checkbox.checked = checked;
        });
        updateBulkActionsState();
    });

    bulkDeleteBtn.addEventListener('click', async () => {
        const selectedIds = getSelectedBookIds();
        if (!selectedIds.length) return;

        const ok = confirm(`Delete ${selectedIds.length} selected books permanently?`);
        if (!ok) return;

        try {
            await Promise.all(selectedIds.map((id) => deleteBookById(id)));
            await loadPlatformStats(true);
            if (selectAllBooksCheckbox) {
                selectAllBooksCheckbox.checked = false;
                selectAllBooksCheckbox.indeterminate = false;
            }
            updateBulkActionsState();
            showToast(`${selectedIds.length} books deleted successfully`, 'success');
        } catch (error) {
            console.error('Failed to bulk delete selected books:', error);
            showToast('Failed to bulk delete selected books. Please try again.', 'error');
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

        const vendorId = String(bulkBtn.getAttribute('data-vendor-id') || '').trim();
        const vendorPhone = String(bulkBtn.getAttribute('data-vendor-phone') || '').trim();
        if (!vendorId) return;

        const targetState = bulkBtn.getAttribute('data-target-state') === 'true';
        const ok = confirm('Are you sure you want to update all books for this vendor?');
        if (!ok) return;

        try {
            const vendorBooks = await fetchBooksByVendorId(vendorId, vendorPhone);
            const updatePromises = vendorBooks.map((book) =>
                updateBookById(book.docId, { isSuspended: targetState })
            );
            await Promise.all(updatePromises);
            await updateVendorStatus(vendorId, targetState ? 'suspended' : 'active');
            await loadPlatformStats(true);
            showToast(`Vendor ${targetState ? 'suspended' : 'activated'} successfully`, 'success');
        } catch (error) {
            console.error('Failed to bulk update vendor books:', error);
            showToast('Failed to update vendor books. Please try again.', 'error');
        }
    });

    vendorsTableBody.addEventListener('change', (event) => {
        const vendorCheckbox = event.target.closest('input[data-row-select="vendor"]');
        if (!vendorCheckbox) return;
        updateVendorsBulkActionsState();
    });
}

function initVendorsFilter() {
    if (!vendorsFilter) return;

    vendorsFilter.addEventListener('change', (event) => {
        renderVendors(cachedVendorsMap, event.target.value);
    });
}

function getSelectedVendorCheckboxes() {
    if (!vendorsTableBody) return [];
    return Array.from(vendorsTableBody.querySelectorAll('input[data-row-select="vendor"]'));
}

function getSelectedVendorsPayload() {
    return getSelectedVendorCheckboxes()
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => ({
            vendorId: String(checkbox.getAttribute('data-vendor-id') || '').trim(),
            vendorPhone: String(checkbox.getAttribute('data-vendor-phone') || '').trim(),
        }))
        .filter((v) => v.vendorId);
}

function updateVendorsBulkActionsState() {
    const checkboxes = getSelectedVendorCheckboxes();
    const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;

    const hasSelection = selectedCount > 0;
    if (vendorsBulkActionSelect) {
        vendorsBulkActionSelect.classList.toggle('hidden', !hasSelection);
    }
    if (vendorsBulkApplyBtn) {
        vendorsBulkApplyBtn.classList.toggle('hidden', !hasSelection);
        vendorsBulkApplyBtn.disabled = !hasSelection || !vendorsBulkActionSelect?.value;
        vendorsBulkApplyBtn.textContent = hasSelection ? `Apply (${selectedCount})` : 'Apply';
    }

    if (selectAllVendorsCheckbox) {
        const hasRows = checkboxes.length > 0;
        selectAllVendorsCheckbox.checked = hasRows && selectedCount === checkboxes.length;
        selectAllVendorsCheckbox.indeterminate = hasRows && selectedCount > 0 && selectedCount < checkboxes.length;
    }
}

function initVendorsBulkActions() {
    if (!selectAllVendorsCheckbox || !vendorsBulkApplyBtn || !vendorsBulkActionSelect) return;

    selectAllVendorsCheckbox.addEventListener('change', () => {
        const checked = selectAllVendorsCheckbox.checked;
        getSelectedVendorCheckboxes().forEach((checkbox) => {
            checkbox.checked = checked;
        });
        updateVendorsBulkActionsState();
    });

    vendorsBulkActionSelect.addEventListener('change', () => {
        updateVendorsBulkActionsState();
    });

    vendorsBulkApplyBtn.addEventListener('click', async () => {
        const selectedVendors = getSelectedVendorsPayload();
        const action = String(vendorsBulkActionSelect.value || '').trim();
        if (!selectedVendors.length || !action) return;

        const ok = confirm(`Apply "${action}" to ${selectedVendors.length} selected vendors?`);
        if (!ok) return;

        try {
            for (const vendor of selectedVendors) {
                const vendorBooks = await fetchBooksByVendorId(vendor.vendorId, vendor.vendorPhone);

                if (action === 'suspend' || action === 'activate') {
                    const targetState = action === 'suspend';
                    await Promise.all(
                        vendorBooks.map((book) => updateBookById(book.docId, { isSuspended: targetState }))
                    );
                    await updateVendorStatus(vendor.vendorId, targetState ? 'suspended' : 'active');
                } else if (action === 'delete') {
                    await deleteBooksByVendorId(vendor.vendorId, vendor.vendorPhone);
                    await deleteVendorById(vendor.vendorId);
                }
            }

            vendorsBulkActionSelect.value = '';
            if (selectAllVendorsCheckbox) {
                selectAllVendorsCheckbox.checked = false;
                selectAllVendorsCheckbox.indeterminate = false;
            }
            await loadPlatformStats(true);
            updateVendorsBulkActionsState();
            const actionLabel = action === 'delete' ? 'deleted' : action === 'suspend' ? 'suspended' : 'activated';
            showToast(`${selectedVendors.length} vendors ${actionLabel} successfully`, 'success');
        } catch (error) {
            console.error('Failed to apply vendors bulk action:', error);
            showToast('Failed to apply bulk action. Please try again.', 'error');
        }
    });
}

function initSuperAdminPage() {
    ensureEmptyTableBodies();
    initThemeToggle();
    initSidebar();
    initSidebarNavigation();
    initRecentTableActions();
    initBulkBookActions();
    initVendorsFilter();
    initVendorsTableActions();
    initVendorsBulkActions();
    initLoginProtection();
}

try {
    initSuperAdminPage();
} catch (error) {
    console.error('Super Admin initialization failed:', error);
}
