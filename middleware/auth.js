const jwt = require('jsonwebtoken');
const User = require('../models/User');

// التحقق من Token
exports.protect = async (req, res, next) => {
    try {
        let token;
        
        // التحقق من وجود Token في Header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Please login to access this resource'
            });
        }
        
        // التحقق من Token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // جلب المستخدم
        req.user = await User.findById(decoded.id);
        
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }
        
        next();
    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
};

// التحقق من الصلاحيات
exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to perform this action'
            });
        }
        next();
    };
};