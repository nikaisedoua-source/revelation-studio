#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const script = path.join(__dirname, 'build_web.py');
const candidates = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
for (const command of candidates) {
  const args = command === 'py' ? ['-3', script] : [script];
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error && result.error.code === 'ENOENT') continue;
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status === null ? 1 : result.status);
}
console.error('Python 3 est requis pour assembler la version web (aucune dépendance externe).');
process.exit(1);
