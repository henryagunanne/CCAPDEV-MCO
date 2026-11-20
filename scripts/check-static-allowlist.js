#!/usr/bin/env node
/**
 * C-25 / REQ-C-06 build check (MCO4): fails when a file that should never be served sits inside
 * one of the folders app.js serves (/assets, /src/css, /src/javascript).
 * Usage: node scripts/check-static-allowlist.js
 */
const fs = require('fs');
const path = require('path');

const served = ['public/assets', 'public/src/css', 'public/src/javascript'];
const allowedExtensions = new Set(['.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.gif', '.woff', '.woff2']);
const problems = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    const ext = path.extname(entry.name).toLowerCase();
    if (entry.name.startsWith('.') || !allowedExtensions.has(ext)) problems.push(full);
  }
}

for (const dir of served) {
  if (fs.existsSync(dir)) walk(dir);
}
const tracked = require('child_process').execSync('git ls-files', { encoding: 'utf8' }).split('\n');
const trackedProblems = problems.filter((file) => tracked.includes(file));
if (trackedProblems.length) {
  console.error('Files outside the static allowlist are inside a served folder:');
  for (const file of trackedProblems) console.error(`  - ${file}`);
  process.exit(1);
}
console.log(`Static allowlist check passed (${served.join(', ')}).`);
