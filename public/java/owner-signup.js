// owner-signup.js
import { safeStorage } from './data.js';

window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('owner-signup-form');
    form.addEventListener('submit', handleOwnerSignup);
});

function handleOwnerSignup(e) {
    e.preventDefault();
    
    const name = document.getElementById('owner-name').value.trim();
    const phone = document.getElementById('owner-phone').value.trim();
    const location = document.getElementById('owner-location').value.trim();
    const password = document.getElementById('owner-password').value;

    if (!name || !phone || !location || !password) {
        showMessage('Please fill all fields', 'error');
        return;
    }

    if (password.length < 6) {
        showMessage('Password must be at least 6 characters', 'error');
        return;
    }

    let owners = [];
    const storedOwners = safeStorage.get('owners');
    if (storedOwners) {
        try {
            owners = JSON.parse(storedOwners);
        } catch (e) {}
    }

    const nameExists = owners.some(o => o.name === name);
    if (nameExists) {
        showMessage('Library name already registered', 'error');
        return;
    }

    const newOwner = { name, phone, location, password };
    owners.push(newOwner);
    
    safeStorage.set('owners', JSON.stringify(owners));

    showMessage('Library registered successfully! Redirecting to login...', 'success');
    
    setTimeout(() => {
        window.location.href = 'owner-login.html';
    }, 1500);
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