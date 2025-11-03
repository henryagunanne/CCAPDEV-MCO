// routes/users.js
const express = require('express');
const User = require('../models/User');
const bcrypt = require('bcryptjs'); // for password hashing
const router = express.Router();

// POST /users/register - Handle user registration
router.post('/register', async (req, res) => {
    const { firstName, lastName, email, password, dateOfBirth } = req.body;
  
    try {
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
  
      const newUser = new User({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        dateOfBirth
      });
  
      await newUser.save();
      res.redirect('/login'); // or wherever you want to go after registration
    } catch (err) {
      console.error('❌ Registration error:', err);
      res.status(500).send('Server error during registration');
    }
});

// POST /users/login - Handle user login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
  
    try {
      const user = await User.findOne({ email });
  
      if (!user) {
        return res.status(400).send('User not found');
      }
  
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).send('Invalid password');
      }
  
      // Password matched
      res.send(`Welcome, ${user.firstName}!`);
    } catch (err) {
      console.error('❌ Login error:', err);
      res.status(500).send('Server error during login');
    }
});

// Export the router
module.exports = router;
