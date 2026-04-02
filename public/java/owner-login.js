import { onAuthStateChanged, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { auth } from './firebase-client.js';
import { getVendorProfileById } from './vendors-firestore-service.js';
import { safeStorage } from './storage.js';

window.addEventListener('DOMContentLoaded', () => {
    checkAlreadyLoggedIn();
    
    const form = document.getElementById('owner-login-form');
    form.addEventListener('submit', handleOwnerLogin);
});

function checkAlreadyLoggedIn() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        const vendor = await getVendorProfileById(user.uid);
        if (vendor) {
            safeStorage.set('currentUser', JSON.stringify({
                type: 'owner',
                vendorId: vendor.vendorId || user.uid,
                name: vendor.storeName || user.displayName || 'Vendor',
                phone: vendor.phone || '',
                email: vendor.email || user.email || '',
            }));
            if ((vendor.status || 'active') === 'active') {
                window.location.href = 'admin-dashboard.html';
            }
        }
    });
}

async function handleOwnerLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('owner-email').value.trim().toLowerCase();
    const password = document.getElementById('owner-password').value;

    try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        const vendor = await getVendorProfileById(credential.user.uid);
        if (!vendor) {
            showMessage('This account is not registered as a vendor.', 'error');
            return;
        }
        if ((vendor.status || 'active') !== 'active') {
            showMessage('Vendor account is suspended. Contact platform admin.', 'error');
            return;
        }

        safeStorage.set('currentUser', JSON.stringify({
            type: 'owner',
            vendorId: vendor.vendorId || credential.user.uid,
            name: vendor.storeName || credential.user.displayName || 'Vendor',
            phone: vendor.phone || '',
            email: vendor.email || credential.user.email || email,
        }));

        showMessage('Login successful! Redirecting to dashboard...', 'success');
        setTimeout(() => {
            window.location.href = 'admin-dashboard.html';
        }, 900);
    } catch (error) {
        showMessage('Invalid email or password', 'error');
    }
}

function showMessage(message, type) {
    const oldMsg = document.querySelector('.auth-message');
    if (oldMsg) oldMsg.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = `auth-message ${type}`;
    msgDiv.textContent = message;
    
    const form = document.getElementById('owner-login-form');
    form.insertBefore(msgDiv, form.firstChild);

    setTimeout(() => msgDiv.remove(), 3000);
}