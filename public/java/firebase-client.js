import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

// بيانات مشروعك الحقيقية (من الصورة اللي دزيتها)
const firebaseConfig = {
    apiKey: "AIzaSyBsjRcqkobZGB3PuI25fe4NPcjEKRxH3Wk",
    authDomain: "bookflow2004.firebaseapp.com",
    projectId: "bookflow2004",
    storageBucket: "bookflow2004.firebasestorage.app",
    messagingSenderId: "532819231327",
    appId: "1:532819231327:web:01939ee4b68ca4fb1a51ea",
    measurementId: "G-X5T68CWX0D"
};

// تشغيل الفايربيس وقاعدة البيانات
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);