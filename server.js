require('dotenv').config();

const app = require('./app');
const { connectDB, disconnectDB } = require('./config/database');

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  try {
    await connectDB();

    if (!process.env.JWT_SECRET) {
      console.warn('[Config] JWT_SECRET is not set — auth tokens will fail until you set it in .env');
    }

    const server = app.listen(PORT, () => {
      console.log('----------------------------------------------------');
      console.log(`🚀 Server: http://localhost:${PORT}`);
      console.log(`📡 API:    http://localhost:${PORT}/api`);
      console.log(`📂 Public: ./public (HTML, css/, java/)`);
      console.log('----------------------------------------------------');
    });

    const shutdown = async (signal) => {
      console.log(`\n${signal} — closing HTTP server and MongoDB connection...`);
      server.close(async () => {
        await disconnectDB();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
