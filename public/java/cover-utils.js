export const BOOK_COVER_ONERROR = "const wrap=this.closest('.book-card__cover-wrap, .book-cover-face, .book-preview__cover, .cart-item-cover-wrap, .mini-book-cover-wrap, .history-book-cover-wrap, .reservation-book-cover-wrap, .ad-book-cover-wrap, .book-cell-cover-wrap')||this.parentElement;const queue=(this.dataset.coverFallbacks||'').split('|').filter(Boolean);if(queue.length){const next=queue.shift();this.dataset.coverFallbacks=queue.join('|');this.style.display='';this.src=next;return;}this.onerror=null;this.style.display='none';if(wrap)wrap.classList.add('no-cover');";

export function formatImageName(title) {
    return String(title || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
}

export function getBookCoverCandidates(title) {
    const rawTitle = String(title || '').trim();
    if (!rawTitle) return [];

    const normalizedTitle = formatImageName(rawTitle);
    return [
        `./images/book_cover/${rawTitle}.jpg`,
        `./images/book_cover/${normalizedTitle}.jpg`,
        `./images/book_cover/${rawTitle}.jfif`,
    ];
}

export function getBookCoverAttrs(title) {
    const candidates = getBookCoverCandidates(title);
    return {
        src: candidates[0] || './images/default-cover.jpg',
        fallbacks: candidates.slice(1).join('|'),
    };
}
