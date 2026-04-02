/**
 * Firebase v9+ Modular SDK (ES modules).
 * Load with: <script type="module" src="/js/booking.js"></script>
 * Uses the official CDN so you do not need a bundler.
 */

import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from '../java/firebase-client.js';

const COLLECTION = 'reservations';

/**
 * Creates a reservation and subscribes to that document until status becomes 'confirmed'.
 * @param {string} bookId
 * @param {string} userName
 * @param {{ onConfirmed?: (data: object) => void, onError?: (err: Error) => void }} [options]
 * @returns {Promise<string>} The new document ID (returned once the write succeeds; confirmation is async via onConfirmed)
 */
export async function createReservation(bookId, userName, options = {}) {
  const { onConfirmed, onError } = options;

  let docRef;
  try {
    docRef = await addDoc(collection(db, COLLECTION), {
      bookId,
      userName,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('createReservation addDoc error:', err);
    if (typeof onError === 'function') onError(err);
    else alert(err.message || 'Could not create reservation.');
    throw err;
  }

  let confirmedOnce = false;

  const unsubscribe = onSnapshot(
    docRef,
    (snapshot) => {
      if (!snapshot.exists) return;
      const data = snapshot.data();
      if (data.status === 'confirmed' && !confirmedOnce) {
        confirmedOnce = true;
        unsubscribe();
        if (typeof onConfirmed === 'function') onConfirmed(data);
        else alert('Your reservation has been confirmed!');
      }
    },
    (error) => {
      console.error('Reservation listener error:', error);
      if (typeof onError === 'function') onError(error);
    }
  );

  return docRef.id;
}

// Optional: expose for non-module scripts if needed
if (typeof window !== 'undefined') {
  window.createReservation = createReservation;
}
