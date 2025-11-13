// server.js - Express + Mongoose + Handlebars
const express = require("express");
const app = express();
const mongoose = require('mongoose'); // MongoDB ODM
const exphbs = require('express-handlebars'); // Handlebars templating engine
const session = require('express-session'); // Session management
const MongoStore = require('connect-mongo'); // MongoDB session store
const path = require('path');
const seedPopularFlights = require('./seeds/seedPopularFlights'); // Seed popular flights
const seedFlights = require('./seeds/seedFlights'); // Seed flights
const seedUsers = require('./seeds/seedUsers'); // Seed Users
const seedReservations = require('./seeds/seedReservations'); // Seed Reservations
const PORT = 3000;  // Server port


// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/airlineDB')
.then(async () => {
    console.log('✅ MongoDB connected.');
    await seedFlights(); // seeds flights if empty
    await seedPopularFlights(); // seed popular flights if empty
    await seedUsers(); // seed users if empty
    await seedReservations(); // seed reservations if empty
  })
.catch(err => console.error('MongoDB connection error:', err));


// Configure Handlebars and handlebars helpers
app.engine('hbs', exphbs.engine({
    extname: '.hbs',                   // File extension for Handlebars files
    layoutsDir: 'views/layouts',       // Folder for layout files
    partialsDir: 'views/partials',     // Folder for partial files/reusable components
    helpers: {
    array: (...args) => args.slice(0, -1),
    inc: (value) => parseInt(value) + 1,

    // Date formatting helper
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
    /* addOne: function (value) {
      return value + 1;
    }, */

    range: function (start, end) {
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

    and: (...args) => args.slice(0, -1).every(Boolean),
    or: (...args) => args.slice(0, -1).some(Boolean),
    not: (a) => !a,

    // Equality helper (used in reservation.hbs)
    ifEquals: function (a, b, options) {
      return a === b ? options.fn(this) : options.inverse(this);
    },

    // gets the current date in string format
    currentDate: function () {
      const now = new Date();
      return now.toISOString().split('T')[0]; // → "2025-11-11"
    },
    
    // fuction to check if the flights are upcoming (Used in myBookings.hbs)
    isUpcoming: function (flights) {
      if (!flights || flights.length === 0) return false;

      const today = new Date();
      const latestFlight = flights[flights.length - 1]; // return flight if round-trip
      const depDate = new Date(latestFlight.departureDate);

      return depDate >= today; // true = upcoming, false = past
    }
}

}));

app.set('view engine', 'hbs');  // Set Handlebars as the view engine
app.set('views', './views'); // Set views directory


// Middleware
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies
app.use(express.json());    // Parse JSON bodies
app.use(express.static(path.join(__dirname, 'public')));  // Serve static files


// Session management
app.use(session({
    secret: 'AASecret23',
    resave: false,  // Don't save session if unmodified
    saveUninitialized: false,   // Don't create session until something stored
    store: MongoStore.create({ mongoUrl: 'mongodb://127.0.0.1:27017/airlineDB' })   // Store sessions in MongoDB
}));


// Make user data available in all views
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});


// Routes
app.use('/', require('./routes/index'));
app.use('/users', require('./routes/users'));
app.use('/flights', require('./routes/flights'));
app.use('/reservations', require('./routes/reservations'));
app.use('/admin', require('./routes/admin'));

// 404 handler - for unmatched routes
app.use((req, res, next) => {
    res.status(404).render('error/404', { url: req.originalUrl });
});


// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});


