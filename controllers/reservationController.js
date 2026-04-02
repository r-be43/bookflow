const Reservation = require('../models/Reservation');
const Book = require('../models/Book');

// إنشاء حجز جديد
exports.createReservation = async (req, res) => {
    try {
        const { bookId, userName, userPhone, library, pickupDate } = req.body;
        
        // التحقق من البيانات
        if (!bookId || !userName || !userPhone || !library || !pickupDate) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }
        
        // التحقق من وجود الكتاب
        const book = await Book.findById(bookId);
        
        if (!book) {
            return res.status(404).json({
                success: false,
                message: 'Book not found'
            });
        }
        
        if (book.stockStatus !== 'available') {
            return res.status(400).json({
                success: false,
                message: 'Book is not available'
            });
        }

        const activeDup = await Reservation.findOne({
            userId: req.user._id,
            bookId,
            status: { $in: ['Pending', 'Confirmed'] }
        });
        if (activeDup) {
            return res.status(400).json({
                success: false,
                message: 'You already have an active reservation for this book'
            });
        }
        
        // إنشاء الحجز
        const reservation = await Reservation.create({
            userId: req.user._id,
            bookId,
            ownerId: book.ownerId,
            userName,
            userPhone,
            library,
            pickupDate,
            status: 'Pending'
        });
        
        // Populate book details
        await reservation.populate('bookId', 'title author image');
        
        res.status(201).json({
            success: true,
            message: 'Reservation created successfully',
            reservation
        });
        
    } catch (error) {
        console.error('Create reservation error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating reservation',
            error: error.message
        });
    }
};

// جلب حجوزات المستخدم
exports.getUserReservations = async (req, res) => {
    try {
        const reservations = await Reservation.find({ userId: req.user._id })
            .populate('bookId', 'title author image')
            .populate('ownerId', 'libraryName libraryLocation phone')
            .sort({ createdAt: -1 });
        
        res.status(200).json({
            success: true,
            count: reservations.length,
            reservations
        });
        
    } catch (error) {
        console.error('Get user reservations error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching reservations',
            error: error.message
        });
    }
};

// جلب حجوزات المكتبة (Owner)
exports.getOwnerReservations = async (req, res) => {
    try {
        const reservations = await Reservation.find({ ownerId: req.user._id })
            .populate('bookId', 'title author image')
            .populate('userId', 'name email phone')
            .sort({ createdAt: -1 });
        
        res.status(200).json({
            success: true,
            count: reservations.length,
            reservations
        });
        
    } catch (error) {
        console.error('Get owner reservations error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching reservations',
            error: error.message
        });
    }
};

// تحديث حجز
exports.updateReservation = async (req, res) => {
    try {
        const reservation = await Reservation.findById(req.params.id);
        
        if (!reservation) {
            return res.status(404).json({
                success: false,
                message: 'Reservation not found'
            });
        }
        
        // التحقق من الصلاحيات
        const isOwner = req.user.role === 'owner' && 
                       reservation.ownerId.toString() === req.user._id.toString();
        const isUser = req.user.role === 'user' && 
                      reservation.userId.toString() === req.user._id.toString();
        
        if (!isOwner && !isUser) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this reservation'
            });
        }
        
        const updatedReservation = await Reservation.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('bookId', 'title author image');
        
        res.status(200).json({
            success: true,
            message: 'Reservation updated successfully',
            reservation: updatedReservation
        });
        
    } catch (error) {
        console.error('Update reservation error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating reservation',
            error: error.message
        });
    }
};

// حذف/إلغاء حجز
exports.deleteReservation = async (req, res) => {
    try {
        const reservation = await Reservation.findById(req.params.id);
        
        if (!reservation) {
            return res.status(404).json({
                success: false,
                message: 'Reservation not found'
            });
        }
        
        // التحقق من الصلاحيات
        const isOwner = req.user.role === 'owner' && 
                       reservation.ownerId.toString() === req.user._id.toString();
        const isUser = req.user.role === 'user' && 
                      reservation.userId.toString() === req.user._id.toString();
        
        if (!isOwner && !isUser) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this reservation'
            });
        }
        
        await Reservation.findByIdAndDelete(req.params.id);
        
        res.status(200).json({
            success: true,
            message: 'Reservation cancelled successfully'
        });
        
    } catch (error) {
        console.error('Delete reservation error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting reservation',
            error: error.message
        });
    }
};