const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please provide a book title'],
        trim: true
    },
    author: {
        type: String,
        required: [true, 'Please provide an author'],
        trim: true
    },
    category: {
        type: String,
        required: [true, 'Please provide a category'],
        enum: ['Fantasy', 'Science', 'Novel', 'History', 'Philosophy', 'Self-Help']
    },
    description: {
        type: String,
        required: [true, 'Please provide a description']
    },
    image: {
        type: String,
        default: 'https://placehold.co/200x300?text=No+Image'
    },
    rating: {
        type: Number,
        default: 4.5,
        min: 1,
        max: 5
    },
    year: {
        type: Number,
        required: [true, 'Please provide publication year']
    },
    language: {
        type: String,
        enum: ['English', 'Arabic'],
        default: 'English'
    },
    isTrending: {
        type: Boolean,
        default: false
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    price: {
        type: String,
        default: 'Free'
    },
    stockStatus: {
        type: String,
        enum: ['available', 'out_of_stock'],
        default: 'available'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Book', bookSchema);