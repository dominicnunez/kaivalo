import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const configPath = resolve(projectRoot, 'infrastructure/nginx/kaivalo.com');
const configContent = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';

describe('nginx configuration', () => {
  describe('file structure', () => {
    it('config file exists at infrastructure/nginx/kaivalo.com', () => {
      assert.ok(existsSync(configPath));
    });

    it('config file is readable and not empty', () => {
      assert.ok(configContent.length > 0);
    });

    it('has installation instructions', () => {
      assert.ok(configContent.includes('install.sh'));
      assert.ok(configContent.includes('systemctl reload nginx'));
    });
  });

  describe('main site (kaivalo.com)', () => {
    it('has server block for kaivalo.com', () => {
      assert.ok(configContent.includes('server_name kaivalo.com'));
    });

    it('has server block for www.kaivalo.com', () => {
      assert.ok(configContent.includes('www.kaivalo.com'));
    });

    it('www.kaivalo.com redirects to kaivalo.com', () => {
      assert.ok(configContent.includes('if ($host = www.kaivalo.com)'));
      assert.ok(configContent.includes('return 301'));
    });

    it('proxies to port 3100', () => {
      assert.ok(configContent.includes('proxy_pass http://127.0.0.1:3100'));
    });
  });

  describe('MechanicAI subdomain', () => {
    it('has server block for mechai.kaivalo.com', () => {
      assert.ok(configContent.includes('server_name mechai.kaivalo.com'));
    });

    it('proxies to port 3101', () => {
      assert.ok(configContent.includes('proxy_pass http://127.0.0.1:3101'));
    });
  });

  describe('catch-all', () => {
    it('has catch-all for *.kaivalo.com', () => {
      assert.ok(configContent.includes('server_name *.kaivalo.com'));
    });

    it('redirects to kaivalo.com', () => {
      const wildcardMatch = configContent.match(/server_name \*\.kaivalo\.com;[\s\S]*?return 301/);
      assert.ok(wildcardMatch);
    });

    it('does not use default_server', () => {
      assert.ok(!configContent.match(/listen 80 default_server/));
    });
  });

  describe('proxy headers', () => {
    it('includes Host proxy header', () => {
      assert.ok(configContent.includes('proxy_set_header Host $host'));
    });

    it('includes X-Real-IP proxy header', () => {
      assert.ok(configContent.includes('proxy_set_header X-Real-IP $remote_addr'));
    });

    it('includes X-Forwarded-For proxy header', () => {
      assert.ok(configContent.includes('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for'));
    });

    it('includes X-Forwarded-Proto proxy header', () => {
      assert.ok(configContent.includes('proxy_set_header X-Forwarded-Proto $scheme'));
    });

    it('includes WebSocket upgrade headers', () => {
      assert.ok(configContent.includes('proxy_set_header Upgrade $http_upgrade'));
      assert.ok(configContent.includes('proxy_set_header Connection $connection_upgrade'));
    });
  });

  describe('HTTPS redirect placeholder', () => {
    it('has certbot instructions', () => {
      assert.ok(configContent.includes('certbot'));
    });

    it('has HTTP to HTTPS redirect block (commented)', () => {
      assert.ok(configContent.includes('HTTP to HTTPS redirect'));
      assert.ok(configContent.includes('return 301 https://'));
    });

    it('has ACME challenge location for SSL verification', () => {
      assert.ok(configContent.includes('/.well-known/acme-challenge/'));
    });
  });

  describe('general best practices', () => {
    it('uses proxy_http_version 1.1', () => {
      assert.ok(configContent.includes('proxy_http_version 1.1'));
    });

    it('listens on IPv4 and IPv6', () => {
      assert.ok(configContent.includes('listen 80;'));
      assert.ok(configContent.includes('listen [::]:80;'));
    });

    it('has proxy_cache_bypass for WebSocket', () => {
      assert.ok(configContent.includes('proxy_cache_bypass $http_upgrade'));
    });
  });
});
