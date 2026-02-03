import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const projectRoot = resolve(import.meta.dirname, '..');
const configPath = resolve(projectRoot, 'infrastructure/nginx/kaivalo.com');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// Read the config file
let configContent = '';
if (existsSync(configPath)) {
  configContent = readFileSync(configPath, 'utf8');
}

console.log('\nTesting nginx configuration...\n');

// ============================================================================
// File structure tests
// ============================================================================

test('nginx config file exists at infrastructure/nginx/kaivalo.com', () => {
  assert(existsSync(configPath), 'nginx config file should exist');
});

test('nginx config file is readable and not empty', () => {
  assert(configContent.length > 0, 'nginx config should have content');
});

test('nginx config has installation instructions', () => {
  assert(configContent.includes('sudo cp'), 'should include copy instruction');
  assert(configContent.includes('sudo ln -s'), 'should include symlink instruction');
  assert(configContent.includes('nginx -t'), 'should include test instruction');
  assert(configContent.includes('systemctl reload nginx'), 'should include reload instruction');
});

// ============================================================================
// Main site (kaivalo.com) server block tests
// ============================================================================

test('has server block for kaivalo.com', () => {
  assert(configContent.includes('server_name kaivalo.com'), 'should have kaivalo.com server_name');
});

test('has server block for www.kaivalo.com', () => {
  assert(configContent.includes('www.kaivalo.com'), 'should have www.kaivalo.com');
});

test('www.kaivalo.com redirects to kaivalo.com', () => {
  assert(configContent.includes('if ($host = www.kaivalo.com)'), 'should have www redirect condition');
  assert(configContent.includes('return 301') && configContent.includes('kaivalo.com'), 'should redirect www to non-www');
});

test('main site proxies to port 3100', () => {
  assert(configContent.includes('proxy_pass http://127.0.0.1:3100'), 'should proxy to port 3100');
});

// ============================================================================
// MechanicAI subdomain server block tests
// ============================================================================

test('has server block for mechai.kaivalo.com', () => {
  assert(configContent.includes('server_name mechai.kaivalo.com'), 'should have mechai.kaivalo.com server_name');
});

test('mechai subdomain proxies to port 3101', () => {
  assert(configContent.includes('proxy_pass http://127.0.0.1:3101'), 'should proxy to port 3101');
});

// ============================================================================
// Catch-all server block tests
// ============================================================================

test('has catch-all for *.kaivalo.com', () => {
  assert(configContent.includes('server_name *.kaivalo.com'), 'should have wildcard server_name');
});

test('catch-all redirects to kaivalo.com', () => {
  // Check there's a return 301 in the wildcard server block context
  const wildcardMatch = configContent.match(/server_name \*\.kaivalo\.com;[\s\S]*?return 301/);
  assert(wildcardMatch, 'wildcard block should redirect with 301');
});

test('catch-all uses default_server', () => {
  assert(configContent.includes('default_server'), 'should use default_server for catch-all');
});

// ============================================================================
// Proxy headers tests
// ============================================================================

test('includes Host proxy header', () => {
  assert(configContent.includes('proxy_set_header Host $host'), 'should set Host header');
});

test('includes X-Real-IP proxy header', () => {
  assert(configContent.includes('proxy_set_header X-Real-IP $remote_addr'), 'should set X-Real-IP header');
});

test('includes X-Forwarded-For proxy header', () => {
  assert(configContent.includes('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for'), 'should set X-Forwarded-For header');
});

test('includes X-Forwarded-Proto proxy header', () => {
  assert(configContent.includes('proxy_set_header X-Forwarded-Proto $scheme'), 'should set X-Forwarded-Proto header');
});

test('includes WebSocket upgrade headers', () => {
  assert(configContent.includes('proxy_set_header Upgrade $http_upgrade'), 'should set Upgrade header');
  assert(configContent.includes("proxy_set_header Connection 'upgrade'"), 'should set Connection header');
});

// ============================================================================
// SSL placeholder tests
// ============================================================================

test('has SSL certificate placeholder', () => {
  assert(configContent.includes('ssl_certificate'), 'should have ssl_certificate placeholder');
});

test('has SSL certificate key placeholder', () => {
  assert(configContent.includes('ssl_certificate_key'), 'should have ssl_certificate_key placeholder');
});

test('references Let\'s Encrypt paths', () => {
  assert(configContent.includes('/etc/letsencrypt/live/kaivalo.com'), 'should reference Let\'s Encrypt cert path');
});

test('has certbot instructions', () => {
  assert(configContent.includes('certbot'), 'should include certbot command');
});

// ============================================================================
// HTTP to HTTPS redirect placeholder tests
// ============================================================================

test('has HTTP to HTTPS redirect block (commented)', () => {
  assert(configContent.includes('HTTP to HTTPS redirect'), 'should have HTTPS redirect section');
  assert(configContent.includes('return 301 https://'), 'should have HTTPS redirect command');
});

test('has ACME challenge location for SSL verification', () => {
  assert(configContent.includes('/.well-known/acme-challenge/'), 'should have ACME challenge location');
});

// ============================================================================
// General nginx best practices tests
// ============================================================================

test('uses proxy_http_version 1.1', () => {
  assert(configContent.includes('proxy_http_version 1.1'), 'should use HTTP/1.1 for proxy');
});

test('listens on IPv4 and IPv6', () => {
  assert(configContent.includes('listen 80;'), 'should listen on IPv4');
  assert(configContent.includes('listen [::]:80;'), 'should listen on IPv6');
});

test('has proxy_cache_bypass for WebSocket', () => {
  assert(configContent.includes('proxy_cache_bypass $http_upgrade'), 'should bypass cache for upgrades');
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
