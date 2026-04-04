import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase-client.js';

window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('support-form');
    const submitBtn = document.getElementById('support-submit-btn');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = String(document.getElementById('support-name')?.value || '').trim();
        const role = String(document.getElementById('support-role')?.value || '').trim();
        const message = String(document.getElementById('support-message')?.value || '').trim();

        if (!name || !role || !message) {
            showToast('Please fill all fields.', 'error');
            return;
        }

        if (submitBtn) submitBtn.disabled = true;
        try {
            await addDoc(collection(db, 'support_tickets'), {
                name,
                role,
                message,
                createdAt: serverTimestamp(),
            });
            form.reset();
            showToast('Feedback submitted successfully. Thank you!', 'success');
        } catch (error) {
            console.error('Failed to submit support ticket:', error);
            showToast('Could not submit your feedback. Try again.', 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
});

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
        success: '#0d9488',
        info: '#1e3a5f',
        error: '#e74c3c',
    };
    toast.textContent = message;
    toast.style.background = colors[type] || colors.info;
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 2200);
}
