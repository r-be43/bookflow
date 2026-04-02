# 📚 Centralized Multi-Library Book Reservation System

A modern web application for browsing and reserving books from multiple libraries.

## 🌟 Features

### User Features
- 🔍 Advanced book search and filtering
- 📖 Browse books by categories (Fantasy, Science, History, etc.)
- ⭐ Trending and Most Popular sections
- 🌍 Arabic & Foreign books sections
- ❤️ Favorites management
- 📅 Book reservations with date selection
- 📚 Reading history tracking
- ✏️ Edit and cancel reservations
- 👤 User profile management

### Admin Features
- 📊 Dashboard with real-time statistics
- 📋 Reservations management (Accept/Reject/Track)
- 📚 Inventory management
- 💰 Price management per library
- 📦 Stock status control
- 📞 Direct user contact system

## 🎨 Design
- Light Modern Theme with gradient accents
- Responsive design (Mobile, Tablet, Desktop)
- Netflix-style horizontal scrolling
- Smooth animations and transitions
- Material Icons integration

## 🛠️ Technologies Used

- **Frontend:**
  - HTML5
  - CSS3 (Custom properties, Flexbox, Grid)
  - JavaScript ES6+ (Modules)
  - localStorage for data persistence

- **Fonts & Icons:**
  - Google Fonts (Poppins)
  - Material Icons Outlined

## 📊 Project Status

- Frontend: ✅ 95% Complete
- Backend: 🚧 In Progress
- Overall: 🚀 50% Complete

## 🚀 Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Live Server extension (for VS Code) or any local server

### Installation

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/book-reservation-system.git
```

2. Navigate to the project directory:
```bash
cd book-reservation-system
```

3. Open with Live Server or any local server

4. Open `index.html` in your browser

### Demo Accounts

**User Login:**
- Email: `user@books.com`
- Password: `123456`

**Admin Login:**
- Library Name: `Central Library`
- Password: `admin123`

## 📁 Project Structure
```
book-reservation-system/
├── index.html              # Homepage
├── login.html              # User login
├── signup.html             # User registration
├── owner-login.html        # Admin login
├── owner-signup.html       # Admin registration
├── details.html            # Book details & reservation
├── favorites.html          # User favorites
├── profile.html            # User profile
├── admin-dashboard.html    # Admin dashboard
├── css/
│   └── style.css          # Main stylesheet (~1500 lines)
└── java/
    ├── data.js            # Data management & storage
    ├── home.js            # Homepage logic
    ├── details.js         # Book details & reservation
    ├── favorites.js       # Favorites management
    ├── profile.js         # Profile management
    ├── login.js           # User authentication
    ├── signup.js          # User registration
    ├── owner-login.js     # Admin authentication
    ├── owner-signup.js    # Admin registration
    └── admin.js           # Admin dashboard logic
```

## 🎓 Academic Context

This project is developed as a graduation project for [Your University Name], demonstrating:
- Full-stack web development skills
- Modern UI/UX design principles
- Database design and management
- Authentication and authorization
- Responsive web design

## 👨‍💻 Developer

**Your Name**
- University: [Your University]
- Department: [Your Department]
- Email: [your.email@example.com]
- Year: 2024-2025

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Material Icons by Google
- Poppins Font by Google Fonts
- Inspiration from modern booking platforms

## 🔮 Future Enhancements

- [ ] Backend implementation (Node.js + MongoDB)
- [ ] Real-time notifications
- [ ] Email confirmations
- [ ] Payment integration
- [ ] Mobile app (React Native)
- [ ] Dark mode
- [ ] Multi-language support
- [ ] Advanced analytics
```

---

### **3. إنشاء ملف `.gitignore`:**

أنشئ ملف `.gitignore` في جذر المشروع:
```
# OS Files
.DS_Store
Thumbs.db

# Editor Files
.vscode/
.idea/
*.swp
*.swo
*~

# Logs
*.log
npm-debug.log*

# Dependencies (إذا أضفت npm لاحقاً)
node_modules/

# Environment variables
.env
.env.local

# Build files (إذا استخدمت build tools)
dist/
build/