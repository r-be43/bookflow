// login.js
import { safeStorage } from './data.js';

window.addEventListener('DOMContentLoaded', () => {
    // التحقق إذا المستخدم مسجل دخول مسبقاً
    checkAlreadyLoggedIn();
    
    const form = document.getElementById('user-login-form');
    form.addEventListener('submit', handleLogin);
});

function checkAlreadyLoggedIn() {
    const user = safeStorage.get('currentUser');
    if (user) {
        try {
            const userData = JSON.parse(user);
            if (userData.type === 'user') {
                window.location.href = 'index.html';
            }
        } catch (e) {}
    }
}

function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('user-email').value.trim();
    const password = document.getElementById('user-password').value;

    // Demo accounts للتجربة
    const demoUsers = [
        { email: 'user@books.com', password: '123456', name: 'John Doe', phone: '1234567890' },
        { email: 'test@books.com', password: 'test123', name: 'Test User', phone: '0987654321' }
    ];

    // الحصول على المستخدمين المسجلين
    let users = [];
    const storedUsers = safeStorage.get('users');
    if (storedUsers) {
        try {
            users = JSON.parse(storedUsers);
        } catch (e) {}
    }

    // دمج Demo users مع المسجلين
    const allUsers = [...demoUsers, ...users];

    // البحث عن المستخدم
    const user = allUsers.find(u => u.email === email && u.password === password);

    if (user) {
        // حفظ بيانات المستخدم
        const currentUser = {
            type: 'user',
            name: user.name,
            email: user.email,
            phone: user.phone
        };
        
        safeStorage.set('currentUser', JSON.stringify(currentUser));
        safeStorage.set('user', JSON.stringify(currentUser)); // للتوافق مع الكود القديم
        
        showMessage('Login successful! Redirecting...', 'success');
        
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
    } else {
        showMessage('Invalid email or password', 'error');
    }
}

function showMessage(message, type) {
    // إزالة رسالة قديمة إن وجدت
    const oldMsg = document.querySelector('.auth-message');
    if (oldMsg) oldMsg.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = `auth-message ${type}`;
    msgDiv.textContent = message;
    
    const form = document.getElementById('user-login-form');
    form.insertBefore(msgDiv, form.firstChild);

    setTimeout(() => msgDiv.remove(), 3000);
}