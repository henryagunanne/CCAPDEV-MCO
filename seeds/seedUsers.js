const User = require('../models/User');
const bcrypt = require('bcryptjs');

async function seedUsers() {
    const count = await User.countDocuments();

    if (count === 0) {
        console.log('Seeding Users collection...');

        await User.insertMany([
            {
                firstName: 'Juan',
                lastName: 'Dela Cruz',
                email: 'juan@example.com',
                password: await bcrypt.hash('password123', 10),
                dateOfBirth: new Date('1990-05-15'),
                role: 'User'
              },
              {
                firstName: 'Maria',
                lastName: 'Santos',
                email: 'maria@example.com',
                password: await bcrypt.hash('password123', 10),
                dateOfBirth: new Date('1985-10-10'),
                role: 'User'
              },
              {
                firstName: 'Carlos',
                lastName: 'Reyes',
                email: 'carlos@example.com',
                password: await bcrypt.hash('password123', 10),
                dateOfBirth: new Date('1995-03-22'),
                role: 'User'
              },
              {
                firstName: 'Anna',
                lastName: 'Lopez',
                email: 'anna@example.com',
                password: await bcrypt.hash('password123', 10),
                dateOfBirth: new Date('1992-08-19'),
                role: 'User'
              },
              {
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@example.com',
                password: await bcrypt.hash('adminpass', 10),
                dateOfBirth: new Date('1980-01-01'),
                role: 'Admin'
              }
        ]);
        
        console.log('Users collection seeded successfully.');
    }else {
        console.log('Users collection already has data. Skipping seeding.');
    }

}

module.exports = seedUsers;