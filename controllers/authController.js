const User = require('../models/User');
const jwt = require('jsonwebtoken');

// إنشاء JWT Token
const signToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d'
    });
};

// إرسال Response مع Token
const sendTokenResponse = (user, statusCode, res) => {
    const token = signToken(user._id);
    
    res.status(statusCode).json({
        success: true,
        token,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            libraryName: user.libraryName,
            libraryLocation: user.libraryLocation
        }
    });
};

// تسجيل مستخدم جديد
exports.register = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        
        // التحقق من البيانات
        if (!name || !email || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }
        
        // التحقق من وجود المستخدم
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }
        
        // إنشاء المستخدم
        const user = await User.create({
            name,
            email,
            phone,
            password,
            role: 'user'
        });
        
        sendTokenResponse(user, 201, res);
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating user',
            error: error.message
        });
    }
};

// تسجيل دخول مستخدم
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // التحقق من البيانات
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }
        
        // البحث عن المستخدم
        const user = await User.findOne({ email, role: 'user' }).select('+password');
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // التحقق من الباسورد
        const isPasswordCorrect = await user.comparePassword(password);
        
        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        sendTokenResponse(user, 200, res);
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Error logging in',
            error: error.message
        });
    }
};

// تسجيل مكتبة جديدة (Owner)
exports.registerOwner = async (req, res) => {
    try {
        const { libraryName, phone, libraryLocation, password } = req.body;
        
        // التحقق من البيانات
        if (!libraryName || !phone || !libraryLocation || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }
        
        // التحقق من وجود المكتبة
        const existingOwner = await User.findOne({ libraryName, role: 'owner' });
        if (existingOwner) {
            return res.status(400).json({
                success: false,
                message: 'Library name already registered'
            });
        }
        
        // إنشاء Owner
        const owner = await User.create({
            name: libraryName,
            email: `${libraryName.toLowerCase().replace(/\s+/g, '')}@library.com`,
            phone,
            password,
            role: 'owner',
            libraryName,
            libraryLocation
        });
        
        sendTokenResponse(owner, 201, res);
        
    } catch (error) {
        console.error('Register owner error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating library account',
            error: error.message
        });
    }
};

// تسجيل دخول Owner
exports.loginOwner = async (req, res) => {
    try {
        const { libraryName, password } = req.body;
        
        // التحقق من البيانات
        if (!libraryName || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide library name and password'
            });
        }
        
        // البحث عن Owner
        const owner = await User.findOne({ 
            libraryName, 
            role: 'owner' 
        }).select('+password');
        
        if (!owner) {
            return res.status(401).json({
                success: false,
                message: 'Invalid library name or password'
            });
        }
        
        // التحقق من الباسورد
        const isPasswordCorrect = await owner.comparePassword(password);
        
        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: 'Invalid library name or password'
            });
        }
        
        sendTokenResponse(owner, 200, res);
        
    } catch (error) {
        console.error('Owner login error:', error);
        res.status(500).json({
            success: false,
            message: 'Error logging in',
            error: error.message
        });
    }
};