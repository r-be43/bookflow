const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST /api/auth/register - تسجيل مستخدم جديد
router.post('/register', authController.register);

// POST /api/auth/login - تسجيل دخول
router.post('/login', authController.login);

// POST /api/auth/owner/register - تسجيل مكتبة جديدة
router.post('/owner/register', authController.registerOwner);

// POST /api/auth/owner/login - تسجيل دخول صاحب مكتبة
router.post('/owner/login', authController.loginOwner);

module.exports = router;