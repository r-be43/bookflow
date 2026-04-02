const memoryStorage = {};

export const safeStorage = {
    get(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            console.warn('localStorage blocked, using memory:', error);
            return memoryStorage[key] || null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            console.warn('localStorage blocked, using memory:', error);
            memoryStorage[key] = value;
        }
    },
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn('localStorage blocked, using memory:', error);
            delete memoryStorage[key];
        }
    }
};
