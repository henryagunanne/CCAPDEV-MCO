// routes/users.js
const express = require('express');
const User = require('../models/User');
const bcrypt = require('bcryptjs'); // for password hashing
const router = express.Router();

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.user) {
      return next();
    }else 
    res.status(401).send('Unauthorized: Please log in to access this resource');  
}

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

      const existingUser = await User.findOne({email: email}).lean();
      if (existingUser) {
        return res
        .status(400)
        .json({ success: false, message: 'Email already registered' });
      }
  
      await newUser.save();
      res.json({ success: true });
    } catch (err) {
      console.error('❌ Registration error:', err);
      res.status(500).send('Server error during registration');
    }
});

// POST /users/login - Handle user login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
  
    try {
      const user = await User.findOne({ email: email }).lean();
  
      if (!user) {
        return res.status(400).send('User not found');
      }
  
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).send('Invalid password');
      }
  
      // Password matched
      req.session.user = user; // store user in session
      return res.json({ 
        success: true, 
        message: `Welcome, ${user.firstName}!` 
      });

    } catch (err) {
      console.error('❌ Login error:', err);
      res.status(500).send('Server error during login');
    }
});

// POST /users/logout - Handle user logout
router.post('/logout', isAuthenticated, (req, res) => {
    req.session.destroy(err => {
      if (err) {
        console.error('❌ Logout error:', err);
        return res.status(500).send('Server error during logout');
      }
      res.json({ success: true });
    });
});

// GET /users/profile - Display user profile
router.get('/profile', isAuthenticated, (req, res) => {
    if (!req.session.user) {
      return res.redirect('/'); // redirect to home if not logged in
    }
  
    res.render('users/profile', {
      title: 'User Profile',
      user: req.session.user
    });
});

// POST /users/edit/:userId - Edit user profile
router.post('/edit/:userId', isAuthenticated, async (req, res) => {
    const { userId } = req.params;
    const { firstName, lastName, email, dateOfBirth } = req.body;

    try {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { firstName, lastName, email, dateOfBirth },
        { new: true }
      ).lean();
  
      if (!updatedUser) {
        return res.status(404).send('User not found');
      }
  
      // Update session user data
      req.session.user = updatedUser;
      res.json({ 
        success: true, 
        message: 'Profile updated successfully!',
        user: updatedUser 
      });
    } catch (err) {
      console.error('❌ Profile update error:', err);
      res.status(500).send('Server error during profile update');
    }
});

// POST /users/change-password/:userId - Change user password
router.post('/change-password/:userId', isAuthenticated, async (req, res) => {
    const { userId } = req.params;
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
  
    try {
      const user = await User.findById(userId);
  
      if (!user) {
        return res.status(404).send('User not found');
      }
  
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).send('Current password is incorrect');
      }

      // ensure that current password and new passwords are not the same
      if (currentPassword === newPassword) {
        return res.status(400).send('New password must be different from current password');
      }

      // ensure that new password and confirm password match
      if (newPassword !== confirmNewPassword) {
        return res.status(400).send('New password and confirmation do not match');
      }
  
      // Hash the new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedNewPassword;
      await user.save();
  
      res.json({ success: true });
    } catch (err) {
      console.error('❌ Password change error:', err);
      res.status(500).send('Server error during password change');
    }
});

// POST /users/delete/:userId - Delete user account
router.post('/delete/:userId', isAuthenticated, async (req, res) => {
    const { userId } = req.params;
  
    try {
      const deletedUser = await User.findByIdAndDelete(userId);
  
      if (!deletedUser) {
        return res.status(404).send('User not found');
      }
  
      // Destroy session after account deletion
      req.session.destroy(err => {
        if (err) {
          console.error('❌ Session destruction error:', err);
        }
        res.json({ success: true });
      });
    } catch (err) {
      console.error('❌ Account deletion error:', err);
      res.status(500).send('Server error during account deletion');
    }
});

// POST /users/forgot-password - Handle forgot password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body; 

  try {
    const findUser = await User.findOne({ email: email }).lean();
    if (!findUser) {
      return res.status(400).send('User not found');
    }

    // Here you would typically generate a password reset token and send an email
    res.json({ 
      success: true, 
      message: 'Password reset link sent to email (simulated)' 
    });
  } catch (err) {
    console.error('❌ Forgot password error:', err);
    res.status(500).send('Server error during password reset');
  }
});

// Export the router
module.exports = router;
