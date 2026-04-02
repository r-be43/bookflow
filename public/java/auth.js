import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { auth, db } from './firebase-client.js';
import { safeStorage } from './storage.js';

window.addEventListener('DOMContentLoaded', () => {
    initAuthForms();
    setupFavoritesCloudSyncListener();
    observeAuthState();
    bindLogoutButtons();
});

function initAuthForms() {
    const loginForm = document.getElementById('user-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginSubmit);
    }

    const signupForm = document.getElementById('user-signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignupSubmit);
    }
}

async function handleSignupSubmit(event) {
    event.preventDefault();
    clearMessage();

    const name = valueOf('user-name');
    const phone = valueOf('user-phone');
    const email = valueOf('user-email').toLowerCase();
    const password = valueOf('user-password');

    if (!name || !phone || !email || !password) {
        showMessage('Please fill all required fields.', 'error');
        return;
    }
    if (password.length < 6) {
        showMessage('Password must be at least 6 characters.', 'error');
        return;
    }

    setLoadingState(true, 'create-account-btn', 'Creating account...');
    try {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (name) {
            await updateProfile(credential.user, { displayName: name });
        }

        safeStorage.set('user', JSON.stringify({
            uid: credential.user.uid,
            name: name || credential.user.displayName || 'Reader',
            email: credential.user.email || email,
            phone: phone || '',
        }));

        showMessage('Account created successfully. Redirecting...', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 900);
    } catch (error) {
        showMessage(readableAuthError(error), 'error');
    } finally {
        setLoadingState(false, 'create-account-btn', 'Create Account');
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    clearMessage();

    const email = valueOf('user-email').toLowerCase();
    const password = valueOf('user-password');

    if (!email || !password) {
        showMessage('Please enter your email and password.', 'error');
        return;
    }

    setLoadingState(true, 'login-btn', 'Signing in...');
    try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        safeStorage.set('user', JSON.stringify({
            uid: credential.user.uid,
            name: credential.user.displayName || 'Reader',
            email: credential.user.email || email,
            phone: '',
        }));

        showMessage('Welcome back! Redirecting...', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 700);
    } catch (error) {
        showMessage(readableAuthError(error), 'error');
    } finally {
        setLoadingState(false, 'login-btn', 'Sign In');
    }
}

export function bindLogoutButtons() {
    document.querySelectorAll('[data-auth-logout]').forEach((button) => {
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            await logout();
        });
    });
}

export async function logout(redirectTo = 'login.html') {
    try {
        await signOut(auth);
    } finally {
        safeStorage.remove('user');
        safeStorage.remove('currentUser');
        window.location.href = redirectTo;
    }
}

export function observeAuthState() {
    return onAuthStateChanged(auth, async (user) => {
        syncStoredUser(user);
        updateAuthAwareHeader(user);

        if (user) {
            await fetchFavoritesFromCloud(user.uid);
        }

        const body = document.body;
        if (!body) return;

        if (body.dataset.authPage === 'guest-only' && user) {
            window.location.href = 'index.html';
        }
        if (body.dataset.authPage === 'private' && !user) {
            window.location.href = 'login.html';
        }
    });
}

export async function syncFavoritesToCloud(uid, localFavorites) {
    if (!uid) return;
    const normalized = normalizeFavoriteIds(localFavorites);
    await setDoc(
        doc(db, 'users', uid),
        { favorites: normalized },
        { merge: true }
    );
}

export async function fetchFavoritesFromCloud(uid) {
    if (!uid) return [];

    const localFavorites = getLocalFavorites();
    const ref = doc(db, 'users', uid);
    const snapshot = await getDoc(ref);

    const cloudFavorites = snapshot.exists()
        ? normalizeFavoriteIds((snapshot.data() || {}).favorites)
        : [];

    const mergedFavorites = Array.from(new Set([...localFavorites, ...cloudFavorites]));
    safeStorage.set('favorites', JSON.stringify(mergedFavorites));

    // If guest/local items added new entries, push merged state to cloud immediately.
    if (mergedFavorites.length > cloudFavorites.length) {
        await syncFavoritesToCloud(uid, mergedFavorites);
    }

    window.dispatchEvent(
        new CustomEvent('favorites:updated', { detail: { count: mergedFavorites.length } })
    );

    return mergedFavorites;
}

function updateAuthAwareHeader(user) {
    document.querySelectorAll('[data-auth="guest"]').forEach((node) => {
        node.style.display = user ? 'none' : '';
    });
    document.querySelectorAll('[data-auth="user"]').forEach((node) => {
        node.style.display = user ? '' : 'none';
    });

    document.querySelectorAll('[data-auth-username]').forEach((node) => {
        node.textContent = user?.displayName || user?.email || 'My Profile';
    });
}

function syncStoredUser(user) {
    if (!user) {
        safeStorage.remove('user');
        safeStorage.remove('currentUser');
        return;
    }

    safeStorage.set('user', JSON.stringify({
        uid: user.uid,
        name: user.displayName || 'Reader',
        email: user.email || '',
        phone: '',
    }));
}

function setupFavoritesCloudSyncListener() {
    window.addEventListener('favorites:updated', async (event) => {
        if (event?.detail?.source === 'home-direct') return;
        if (!auth.currentUser) return;
        try {
            await syncFavoritesToCloud(auth.currentUser.uid, getLocalFavorites());
        } catch (error) {
            console.error('Failed to sync favorites to cloud:', error);
        }
    });
}

function getLocalFavorites() {
    const stored = safeStorage.get('favorites');
    if (!stored) return [];
    try {
        return normalizeFavoriteIds(JSON.parse(stored));
    } catch {
        return [];
    }
}

function normalizeFavoriteIds(input) {
    const source = Array.isArray(input) ? input : [];
    const unique = new Set();
    source.forEach((value) => {
        const id = Number.parseInt(value, 10);
        if (Number.isFinite(id) && id > 0) unique.add(id);
    });
    return [...unique];
}

function valueOf(id) {
    const element = document.getElementById(id);
    return element ? String(element.value || '').trim() : '';
}

function setLoadingState(isLoading, buttonId, text) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    if (isLoading) {
        button.dataset.originalText = button.textContent;
    }
    button.disabled = isLoading;
    button.textContent = isLoading ? text : (button.dataset.originalText || text);
}

function showMessage(message, type) {
    const box = document.getElementById('auth-message');
    if (!box) return;
    box.className = `auth-message ${type}`;
    box.textContent = message;
    box.style.display = 'block';
}

function clearMessage() {
    const box = document.getElementById('auth-message');
    if (!box) return;
    box.style.display = 'none';
    box.textContent = '';
}

function readableAuthError(error) {
    const code = error?.code || '';
    if (code.includes('email-already-in-use')) return 'This email is already registered.';
    if (code.includes('invalid-email')) return 'Please enter a valid email address.';
    if (code.includes('weak-password')) return 'Password is too weak. Use at least 6 characters.';
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
        return 'Invalid email or password.';
    }
    if (code.includes('too-many-requests')) return 'Too many attempts. Please try again later.';
    return error?.message || 'Authentication failed. Please try again.';
}
