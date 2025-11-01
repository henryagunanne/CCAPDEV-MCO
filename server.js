// server.js - Express + Mongoose + Handlebars
const express = require('express');
const mongoose = require('mongoose');
const exphbs = require('express-handlebars');
const seedPopularFlights = require('./seeds/seedPopularFlights'); // Seed popular flights
const seedFlights = require('./seeds/seedFlights'); // Seed flights
const app = express();
const PORT = 3000;

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/airlineDB')
.then(async () => {
    console.log('✅ MongoDB connected.');
    await seedFlights(); // 🌱 seeds flights if empty
    await seedPopularFlights(); // 🌱 seed popular flights if empty
  })
.catch(err => console.error('❌ MongoDB connection error:', err));

// Configure Handlebars
app.engine('hbs', exphbs.engine({
    extname: '.hbs',                   // File extension for Handlebars files
    layoutsDir: 'views/layouts',       // Folder for layout files
    partialsDir: 'views/partials',     // Folder for partial files/reusable components
    helpers: {
        inc: (value) => parseInt(value) + 1,
        formatDate: (date) => {
          if (!date) return '';
          return new Date(date).toLocaleDateString('en-US', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });
        },
        // Chunk helper to group flights (e.g., 4 per slide)
        chunk: function (array, size) {
            if (!Array.isArray(array)) return [];
            const chunks = [];
            for (let i = 0; i < array.length; i += size) {
              chunks.push(array.slice(i, i + size));
            }
            return chunks;
        },
        divide: (a, b) => Math.ceil(a / b),
        range: function(start, end) {
            const rangeArray = [];
            for (let i = start; i < end; i++) {
              rangeArray.push(i);
            }
            return rangeArray;
        },
        // --- Logic Helpers ---
        eq: (a, b) => a === b,
        ne: (a, b) => a !== b,
        gt: (a, b) => a > b,
        gte: (a, b) => a >= b,
        lt: (a, b) => a < b,
        lte: (a, b) => a <= b,

        // Allows multiple AND conditions
        and: (...args) => args.slice(0, -1).every(Boolean),

        // Allows multiple OR conditions
        or: (...args) => args.slice(0, -1).some(Boolean),

        // Logical NOT
        not: (a) => !a
    }
}));
app.set('view engine', 'hbs');
app.set('views', './views'); // might need to edit this path later

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/', require('./routes/index'));
//app.use('/users', require('./routes/users'));
app.use('/flights', require('./routes/flights'));
//app.use('/reservations', require('./routes/reservations'));
app.use('/admin', require('./routes/admin'));

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});