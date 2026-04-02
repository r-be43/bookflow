const Book = require('../models/Book');

// جلب جميع الكتب
exports.getAllBooks = async (req, res) => {
    try {
        const books = await Book.find({ stockStatus: 'available' })
            .populate('ownerId', 'libraryName libraryLocation')
            .sort({ createdAt: -1 });
        
        res.status(200).json({
            success: true,
            count: books.length,
            books
        });
        
    } catch (error) {
        console.error('Get books error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching books',
            error: error.message
        });
    }
};

// جلب كتاب واحد
exports.getBook = async (req, res) => {
    try {
        const book = await Book.findById(req.params.id)
            .populate('ownerId', 'libraryName libraryLocation phone');
        
        if (!book) {
            return res.status(404).json({
                success: false,
                message: 'Book not found'
            });
        }
        
        res.status(200).json({
            success: true,
            book
        });
        
    } catch (error) {
        console.error('Get book error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching book',
            error: error.message
        });
    }
};

// إضافة كتاب جديد
exports.createBook = async (req, res) => {
    try {
        const bookData = {
            ...req.body,
            ownerId: req.user._id
        };
        
        const book = await Book.create(bookData);
        
        res.status(201).json({
            success: true,
            message: 'Book created successfully',
            book
        });
        
    } catch (error) {
        console.error('Create book error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating book',
            error: error.message
        });
    }
};

// تعديل كتاب
exports.updateBook = async (req, res) => {
    try {
        const book = await Book.findById(req.params.id);
        
        if (!book) {
            return res.status(404).json({
                success: false,
                message: 'Book not found'
            });
        }
        
        // التحقق أن الكتاب يخص هذا الـ owner
        if (book.ownerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this book'
            });
        }
        
        const updatedBook = await Book.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        
        res.status(200).json({
            success: true,
            message: 'Book updated successfully',
            book: updatedBook
        });
        
    } catch (error) {
        console.error('Update book error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating book',
            error: error.message
        });
    }
};

// حذف كتاب
exports.deleteBook = async (req, res) => {
    try {
        const book = await Book.findById(req.params.id);
        
        if (!book) {
            return res.status(404).json({
                success: false,
                message: 'Book not found'
            });
        }
        
        // التحقق أن الكتاب يخص هذا الـ owner
        if (book.ownerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this book'
            });
        }
        
        await Book.findByIdAndDelete(req.params.id);
        
        res.status(200).json({
            success: true,
            message: 'Book deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete book error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting book',
            error: error.message
        });
    }
};