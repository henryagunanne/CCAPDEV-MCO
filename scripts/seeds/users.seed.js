const crypto = require('crypto');
const User = require('../../models/User');

module.exports = async function seedUsers() {
  const fixtures = [
    ['seed.customer.one@archers-airline.invalid', 'Mika', 'Santos'],
    ['seed.customer.two@archers-airline.invalid', 'Liam', 'Reyes'],
    ['seed.customer.three@archers-airline.invalid', 'Ava', 'Cruz']
  ];
  let created = 0;
  for (const [email, firstName, lastName] of fixtures) {
    const exists = await User.exists({ email });
    if (exists) continue;
    const user = new User({
      email, firstName, lastName,
      // Disabled fixture accounts cannot authenticate; no shared/default password is provisioned.
      password: crypto.randomBytes(48).toString('hex'),
      role: 'User',
      status: 'disabled',
      mfaEnabled: false,
      mfaVerified: false
    });
    await user.save();
    created += 1;
  }
  console.log(`Users: ${created} disabled fixture account(s) created.`);
};
