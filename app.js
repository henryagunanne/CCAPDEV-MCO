// app.js - Express + Mongoose + Handlebars
const express = require("express");
const app = express();
const mongoose = require('mongoose'); // MongoDB ODM
const exphbs = require('express-handlebars'); // Handlebars templating engine
const session = require('express-session'); // Session management
const MongoStore = require('connect-mongo'); // MongoDB session store
const path = require('path');
const { mongoUri, sessionSecret, isTestEnvironment } = require('./config/env');
const helmet = require('helmet');
const { csrfProtection } = require('./middleware/csrfProtection');
const crypto = require('crypto');

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const seedPopularFlights = require('./seeds/seedPopularFlights'); // Seed popular flights
const seedFlights = require('./seeds/seedFlights'); // Seed flights
const seedUsers = require('./seeds/seedUsers'); // Seed Users
const seedReservations = require('./seeds/seedReservations'); // Seed Reservations

// System logging
const httpLogger = require('./logs/httpLogger');
const logger = require('./logs/logger');  

 

// Connect to MongoDB
if (!isTestEnvironment) {
    mongoose.connect(mongoUri)
    .then(async () => {
        logger.info('✅ MongoDB connected.');
        await seedFlights(); // seeds flights if empty
        await seedPopularFlights(); // seed popular flights if empty
        await seedUsers(); // seed users if empty
        await seedReservations(); // seed reservations if empty
    })
    .catch(err => logger.error('MongoDB connection failed.', { code: err.code || 'DATABASE_CONNECTION_ERROR' }));
}

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
const trustedProxyCidrs = String(process.env.TRUSTED_PROXY_CIDRS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
if (trustedProxyCidrs.length) app.set('trust proxy', trustedProxyCidrs);

// Middleware to generate a unique nonce for each request, used in CSP headers
app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(18).toString('base64');
    next();
});

// Security headers using Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            formAction: ["'self'"],
            scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`, 'https://code.jquery.com', 'https://cdn.jsdelivr.net'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
            imgSrc: ["'self'", 'data:'],
            fontSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
            connectSrc: ["'self'"],
        }
    },
    crossOriginEmbedderPolicy: false,
    hsts: false
}));

// Enforce HTTPS in production and set HSTS header
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.secure) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    if (process.env.NODE_ENV === 'production' && !req.secure) {
        return res.status(403).json({ success: false, message: 'HTTPS is required.' });
    }
    next();
});

app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies
app.use(express.json());    // Parse JSON bodies
app.use(express.static(path.join(__dirname, 'public')));  // Serve static files
app.use(httpLogger);    // HTTP Request Logging 


// Session management
app.use(session({
    secret: sessionSecret,
    resave: false,  // Don't save session if unmodified
    saveUninitialized: false,   // Don't create session until something stored
    rolling: true,
    store: MongoStore.create({ mongoUrl: mongoUri }),   // Store sessions in MongoDB
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // secure cookies in prod
      sameSite: 'lax',
      maxAge: SESSION_IDLE_TIMEOUT_MS
    }
}));

app.use(csrfProtection);  // CSRF protection middleware

app.use((req, res, next) => {
  const sessionUser = req.session && req.session.user ? req.session.user : null;

  if (sessionUser) {
    const now = Date.now();
    const absoluteExpiresAt = Number(req.session.absoluteExpiresAt || sessionUser.absoluteExpiresAt || 0);
    const lastActivityAt = Number(req.session.lastActivityAt || sessionUser.lastActivityAt || req.session.authenticatedAt || now);
    const isExpired = (absoluteExpiresAt && now > absoluteExpiresAt) || (now - lastActivityAt > SESSION_IDLE_TIMEOUT_MS);

    if (isExpired) {
      req.session.destroy((err) => {
        if (err) logger.error('Session cleanup failed.', { code: err.code || 'SESSION_CLEANUP_ERROR' });
      });

      if (req.accepts('html')) {
        return res.status(401).render('error/access-denied', {
          title: 'Session Expired',
          message: 'Your session expired. Please sign in again.'
        });
      }

      return res.status(401).json({ success: false, message: 'Session expired.' });
    }

    req.session.lastActivityAt = now;
    req.session.absoluteExpiresAt = req.session.absoluteExpiresAt || now + SESSION_ABSOLUTE_TIMEOUT_MS;
    req.session.cookie.maxAge = SESSION_IDLE_TIMEOUT_MS;
    req.session.user = {
      ...sessionUser,
      authenticatedAt: req.session.authenticatedAt || now,
      lastActivityAt: now,
      absoluteExpiresAt: req.session.absoluteExpiresAt
    };
  }

  res.locals.user = req.session ? req.session.user : null;
  req.user = req.session ? req.session.user : null;
  next();
});


// Routes
app.use('/', require('./routes/privacy'));
app.use('/', require('./routes/index'));
app.use('/users', require('./routes/users'));
app.use('/flights', require('./routes/flights'));
app.use('/reservations', require('./routes/reservations'));
app.use('/admin', require('./routes/admin'));


// 404 handler - for unmatched routes
app.use((err, req, res, next) => {
    logger.error('Request processing failed.', { code: err.code || 'UNHANDLED_ERROR' });
    const statusCode = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;
    if (statusCode === 404) {
      return res.status(404).render('error/404', {
        title: '404 Not Found',
        code: 404,
        message: 'Page Not Found',
        description: 'The requested page was not found.'
      });
    }
    return res.status(statusCode).json({ success: false, message: 'Unable to process the request.' });
});




// Export app for testing
module.exports = app;
