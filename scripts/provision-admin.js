#!/usr/bin/env node

const mongoose = require('mongoose');
const User = require('../models/User');
const { mongoUri } = require('../config/env');

function askQuestion(question) {
  return new Promise((resolve) => {
    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askHidden(promptText) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('Interactive terminal required to provision the administrator account.'));
      return;
    }

    const stdin = process.stdin;
    const stdout = process.stdout;
    let password = '';

    stdin.setRawMode(true);
    stdin.resume();
    stdout.write(promptText);

    const onData = (chunk) => {
      const key = chunk.toString('utf8');

      if (key === '\r' || key === '\n') {
        stdout.write('\n');
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
        resolve(password);
        return;
      }

      if (key === '\u0003') {
        stdout.write('\n');
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
        reject(new Error('Admin provisioning cancelled.'));
        return;
      }

      if (key === '\b' || key === '\u007f') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          stdout.write('\b \b');
        }
        return;
      }

      if (key.length === 1 && !key.includes('\x00')) {
        password += key;
        stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function main() {
  const cliEmail = process.argv[2];
  const emailInput = cliEmail || (await askQuestion('Administrator email: '));
  const email = emailInput.trim().toLowerCase();

  if (!validateEmail(email)) {
    throw new Error('A valid administrator email address is required.');
  }

  const password = await askHidden('Enter initial administrator password: ');

  if (!password || password.length < 12) {
    throw new Error('The administrator password must be at least 12 characters long.');
  }

  const existingAdmin = await User.exists({ role: 'Admin' });
  if (existingAdmin) {
    throw new Error('Administrator initialization has already been completed. Use the documented recovery procedure.');
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error('A user already exists with that email address. Choose a different email for the administrator account.');
  }

  const adminUser = new User({
    firstName: 'System',
    lastName: 'Administrator',
    email,
    password,
    dateOfBirth: new Date('2000-01-01'),
    role: 'Admin'
  });

  await adminUser.save();
  console.log(`Administrator account created for ${email}.`);
}

async function run() {
  await mongoose.connect(mongoUri);

  try {
    await main();
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('Administrator provisioning failed:');
  console.error(error.message);
  process.exitCode = 1;
});
