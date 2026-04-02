const express = require('express');
const router = express.Router();
const reservationController = require('../controllers/reservationController');
const auth = require('../middleware/auth');

// POST /api/reservations - إنشاء حجز جديد
router.post('/', auth.protect, reservationController.createReservation);

// GET /api/reservations/user - جلب حجوزات المستخدم
router.get('/user', auth.protect, reservationController.getUserReservations);

// GET /api/reservations/owner - جلب حجوزات المكتبة
router.get('/owner', auth.protect, auth.restrictTo('owner'), reservationController.getOwnerReservations);

// PUT /api/reservations/:id - تحديث حجز
router.put('/:id', auth.protect, reservationController.updateReservation);

// DELETE /api/reservations/:id - إلغاء حجز
router.delete('/:id', auth.protect, reservationController.deleteReservation);

module.exports = router;