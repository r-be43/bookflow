const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    bookId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book',
        required: true
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    userPhone: {
        type: String,
        required: true
    },
    library: {
        type: String,
        required: true
    },
    pickupDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Confirmed', 'Picked Up', 'Cancelled'],
        default: 'Pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Reservation', reservationSchema);
