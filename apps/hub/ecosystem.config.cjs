const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const envVars = { PORT: '3100', HOST: '127.0.0.1', NODE_ENV: 'production' };

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      let val = trimmed.slice(eqIdx + 1);
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      envVars[trimmed.slice(0, eqIdx)] = val;
    }
  }
}

module.exports = {
  apps: [{
    name: 'kaivalo-hub',
    script: 'build/index.js',
    env: envVars
  }]
};
