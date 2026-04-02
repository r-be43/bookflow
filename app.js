const express = require('express');
const path = require('path');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books');
const reservationRoutes = require('./routes/reservations');

const app = express();

/** Static assets + HTML (View layer for this SPA) */
const publicPath = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicPath));

app.get('/api', (req, res) => {
  res.json({
    message: '📚 Book Reservation API',
    version: '1.0.0',
    status: 'Running',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/reservations', reservationRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

module.exports = app;
