'use strict';
/* Copies the failing tests from a node:test log into the GitHub run summary
   and its annotations, which anyone can read, unlike the step logs.

   node .github/report-failures.js <log file> <heading>                     */

const fs = require('fs');

const [file, heading] = process.argv.slice(2);
const log = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r/g, '') : '(no log was written)';
const at = log.lastIndexOf('failing tests:');
const failing = (at >= 0 ? log.slice(at) : log.slice(-8000)).slice(0, 60000);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### ' + (heading || 'Failing tests') + '\n\n```\n' + failing + '\n```\n');
}

// one annotation per failing test, first lines only (GitHub keeps ten per step)
const blocks = failing.split(/\n(?=✖ )/).slice(1, 11);
for (const block of blocks.length ? blocks : [failing.slice(0, 2000)]) {
  const msg = block.split('\n').slice(0, 14).join('\n').replace(/%/g, '%25').replace(/\n/g, '%0A');
  console.log('::error title=' + (heading || 'tests') + '::' + msg);
}
