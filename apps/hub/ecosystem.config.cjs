const fs = require('fs');
const path = require('path');

const ALLOWED_ENV_VARS = new Set([
  'WORKOS_CLIENT_ID',
  'WORKOS_API_KEY',
  'WORKOS_REDIRECT_URI',
  'WORKOS_COOKIE_PASSWORD',
  'ORIGIN',
  'PORT',
  'HOST',
  'NODE_ENV',
]);

const envPath = path.join(__dirname, '.env');
const envVars = { PORT: '3100', HOST: '127.0.0.1', NODE_ENV: 'production' };

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx);
      if (!ALLOWED_ENV_VARS.has(key)) continue;
      let val = trimmed.slice(eqIdx + 1);
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      envVars[key] = val;
    }
  }
}

const MAX_RESTARTS = 10;
const RESTART_DELAY_MS = 3000;
const MAX_MEMORY_MB = '512M';

module.exports = {
  apps: [{
    name: 'kaivalo-hub',
    script: 'build/index.js',
    max_restarts: MAX_RESTARTS,
    restart_delay: RESTART_DELAY_MS,
    max_memory_restart: MAX_MEMORY_MB,
    env: envVars
  }]
};
