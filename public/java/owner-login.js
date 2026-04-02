// owner-login.js
import { safeStorage } from './data.js';

window.addEventListener('DOMContentLoaded', () => {
    checkAlreadyLoggedIn();
    
    const form = document.getElementById('owner-login-form');
    form.addEventListener('submit', handleOwnerLogin);
});

function checkAlreadyLoggedIn() {
    const user = safeStorage.get('currentUser');
    if (user) {
        try {
            const userData = JSON.parse(user);
            if (userData.type === 'owner') {
                window.location.href = 'admin-dashboard.html';
            }
        } catch (e) {}
    }
}

function handleOwnerLogin(e) {
    e.preventDefault();
    
    const name = document.getElementById('owner-name').value.trim();
    const password = document.getElementById('owner-password').value;

    // Demo owner للتجربة
    const demoOwners = [
        { 
            name: 'Central Library', 
            password: 'admin123', 
            phone: '1234567890',
            location: 'Downtown, Baghdad'
        }
    ];

    // الحصول على الـ owners المسجلين
    let owners = [];
    const storedOwners = safeStorage.get('owners');
    if (storedOwners) {
        try {
            owners = JSON.parse(storedOwners);
        } catch (e) {}
    }

    const allOwners = [...demoOwners, ...owners];

    const owner = allOwners.find(o => o.name === name && o.password === password);

    if (owner) {
        const currentUser = {
            type: 'owner',
            name: owner.name,
            phone: owner.phone,
            location: owner.location
        };
        
        safeStorage.set('currentUser', JSON.stringify(currentUser));
        
        showMessage('Login successful! Redirecting to dashboard...', 'success');
        
        setTimeout(() => {
            window.location.href = 'admin-dashboard.html';
        }, 1000);
    } else {
        showMessage('Invalid library name or password', 'error');
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