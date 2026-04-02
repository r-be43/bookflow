const mongoose = require('mongoose');

/**
 * Options tuned for MongoDB Atlas: reasonable timeouts and connection pooling.
 * @see https://mongoosejs.com/docs/connections.html
 */
const defaultOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
  family: 4,
};

let handlersRegistered = false;

function registerConnectionHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  mongoose.connection.on('connected', () => {
    console.log('[MongoDB] Mongoose connected');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[MongoDB] Mongoose connection error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Mongoose disconnected');
  });
}

/**
 * @param {string} uri - MongoDB connection string (e.g. from MONGODB_URI)
 * @returns {Promise<typeof mongoose>}
 */
async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri || typeof uri !== 'string' || !uri.trim()) {
    throw new Error('MONGODB_URI is missing or empty. Set it in your .env file.');
  }

  registerConnectionHandlers();

  await mongoose.connect(uri.trim(), defaultOptions);
  return mongoose;
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
}

module.exports = { connectDB, disconnectDB };
