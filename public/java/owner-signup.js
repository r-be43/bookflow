import { createUserWithEmailAndPassword, updateProfile } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { auth } from './firebase-client.js';
import { upsertVendorProfile } from './vendors-firestore-service.js';

window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('owner-signup-form');
    form.addEventListener('submit', handleOwnerSignup);
});

async function handleOwnerSignup(e) {
    e.preventDefault();
    
    const storeName = document.getElementById('owner-name').value.trim();
    const email = document.getElementById('owner-email').value.trim().toLowerCase();
    const phone = document.getElementById('owner-phone').value.trim();
    const password = document.getElementById('owner-password').value;

    if (!storeName || !email || !phone || !password) {
        showMessage('Please fill all fields', 'error');
        return;
    }

    if (password.length < 6) {
        showMessage('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: storeName });
        await upsertVendorProfile(credential.user.uid, {
            vendorId: credential.user.uid,
            storeName,
            email,
            phone,
            status: 'active',
            createdAt: serverTimestamp(),
        });

        showMessage('Library registered successfully! Redirecting to dashboard...', 'success');
        setTimeout(() => {
            window.location.href = 'admin-dashboard.html';
        }, 1200);
    } catch (error) {
        const message = error?.code?.includes('email-already-in-use')
            ? 'This email is already registered.'
            : (error?.message || 'Failed to register library.');
        showMessage(message, 'error');
    }
}

function showMessage(message, type) {
    const oldMsg = document.querySelector('.auth-message');
    if (oldMsg) oldMsg.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = `auth-message ${type}`;
    msgDiv.textContent = message;
    
    const form = document.getElementById('owner-signup-form');
    form.insertBefore(msgDiv, form.firstChild);

    setTimeout(() => msgDiv.remove(), 3000);
}