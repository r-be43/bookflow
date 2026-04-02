const express = require('express');
const router = express.Router();
const bookController = require('../controllers/bookController');
const auth = require('../middleware/auth');

// GET /api/books - جلب جميع الكتب
router.get('/', bookController.getAllBooks);

// GET /api/books/:id - جلب كتاب واحد
router.get('/:id', bookController.getBook);

// POST /api/books - إضافة كتاب (يحتاج owner authentication)
router.post('/', auth.protect, auth.restrictTo('owner'), bookController.createBook);

// PUT /api/books/:id - تعديل كتاب
router.put('/:id', auth.protect, auth.restrictTo('owner'), bookController.updateBook);

// DELETE /api/books/:id - حذف كتاب
router.delete('/:id', auth.protect, auth.restrictTo('owner'), bookController.deleteBook);

module.exports = router;