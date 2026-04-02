// signup.js
import { safeStorage } from './data.js';

window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('user-signup-form');
    form.addEventListener('submit', handleSignup);
});

function handleSignup(e) {
    e.preventDefault();
    
    const name = document.getElementById('user-name').value.trim();
    const phone = document.getElementById('user-phone').value.trim();
    const email = document.getElementById('user-email').value.trim();
    const password = document.getElementById('user-password').value;

    // التحقق من البيانات
    if (!name || !phone || !email || !password) {
        showMessage('Please fill all fields', 'error');
        return;
    }

    if (password.length < 6) {
        showMessage('Password must be at least 6 characters', 'error');
        return;
    }

    // الحصول على المستخدمين الحاليين
    let users = [];
    const storedUsers = safeStorage.get('users');
    if (storedUsers) {
        try {
            users = JSON.parse(storedUsers);
        } catch (e) {}
    }

    // التحقق من أن الإيميل غير مستخدم
    const emailExists = users.some(u => u.email === email);
    if (emailExists) {
        showMessage('Email already registered', 'error');
        return;
    }

    // إضافة المستخدم الجديد
    const newUser = { name, phone, email, password };
    users.push(newUser);
    
    safeStorage.set('users', JSON.stringify(users));

    showMessage('Account created successfully! Redirecting to login...', 'success');
    
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 1500);
}

function showMessage(message, type) {
    const oldMsg = document.querySelector('.auth-message');
    if (oldMsg) oldMsg.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = `auth-message ${type}`;
    msgDiv.textContent = message;
    
    const form = document.getElementById('user-signup-form');
    form.insertBefore(msgDiv, form.firstChild);

    setTimeout(() => msgDiv.remove(), 3000);
}