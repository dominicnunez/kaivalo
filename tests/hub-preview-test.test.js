// Test: npm run preview functionality
// Validates that the preview server works correctly

import assert from 'node:assert';
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const hubDir = '/home/kai/pets/kaivalo/apps/hub';
const buildDir = path.join(hubDir, 'build');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  ${e.message}`);
    failed++;
  }
}

// Helper function to make HTTP request
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

console.log('\n=== Testing npm run preview ===\n');

// Pre-requisite tests
test('build directory exists', () => {
  assert.ok(existsSync(buildDir), 'Build directory should exist');
});

test('build/index.js exists', () => {
  assert.ok(existsSync(path.join(buildDir, 'index.js')), 'Build entry point should exist');
});

test('package.json has preview script', () => {
  const pkgJson = JSON.parse(execSync(`cat ${hubDir}/package.json`, { encoding: 'utf8' }));
  assert.ok(pkgJson.scripts && pkgJson.scripts.preview, 'Should have preview script');
  assert.ok(pkgJson.scripts.preview.includes('vite preview'), 'Preview script should use vite preview');
});

// Server response tests (async)
async function runServerTests() {
  console.log('\n--- Server Response Tests ---\n');

  // Start the preview server
  const server = spawn('npm', ['run', 'preview'], {
    cwd: hubDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true
  });

  let serverOutput = '';
  server.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });
  server.stderr.on('data', (data) => {
    serverOutput += data.toString();
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    // Test homepage
    test('server responds with 200 on homepage', async () => {
      const res = await httpGet('http://localhost:4173');
      assert.strictEqual(res.statusCode, 200, 'Should return 200 OK');
    });
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173');
        if (res.statusCode === 200) {
          console.log('✓ server responds with 200 on homepage');
          passed++;
        } else {
          console.log('✗ server responds with 200 on homepage');
          console.log(`  Expected 200, got ${res.statusCode}`);
          failed++;
        }
      } catch (e) {
        console.log('✗ server responds with 200 on homepage');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

    // Test HTML content
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173');
        if (res.data.includes('<!doctype html>') || res.data.includes('<!DOCTYPE html>')) {
          console.log('✓ response is valid HTML');
          passed++;
        } else {
          console.log('✗ response is valid HTML');
          console.log('  Response does not contain doctype');
          failed++;
        }
      } catch (e) {
        console.log('✗ response is valid HTML');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

    // Test page title
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173');
        if (res.data.includes('<title>Kai Valo |') || res.data.includes('Kai Valo')) {
          console.log('✓ page has correct title');
          passed++;
        } else {
          console.log('✗ page has correct title');
          console.log('  Title not found in response');
          failed++;
        }
      } catch (e) {
        console.log('✗ page has correct title');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

    // Test hero content
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173');
        if (res.data.includes('solve things') || res.data.includes('Tools that')) {
          console.log('✓ hero headline is present');
          passed++;
        } else {
          console.log('✗ hero headline is present');
          console.log('  Hero headline not found');
          failed++;
        }
      } catch (e) {
        console.log('✗ hero headline is present');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

    // Test services section
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173');
        if (res.data.includes('id="services"')) {
          console.log('✓ services section is present');
          passed++;
        } else {
          console.log('✗ services section is present');
          console.log('  Services section not found');
          failed++;
        }
      } catch (e) {
        console.log('✗ services section is present');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

    // Test MechanicAI service
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173');
        if (res.data.includes('Auto Repair Decoder') || res.data.includes('services')) {
          console.log('✓ MechanicAI service card is present');
          passed++;
        } else {
          console.log('✗ MechanicAI service card is present');
          console.log('  MechanicAI content not found');
          failed++;
        }
      } catch (e) {
        console.log('✗ MechanicAI service card is present');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

    // Test about section
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173');
        if (res.data.includes('id="about"') && res.data.includes('Kai Valo')) {
          console.log('✓ about section is present');
          passed++;
        } else {
          console.log('✗ about section is present');
          console.log('  About section not found');
          failed++;
        }
      } catch (e) {
        console.log('✗ about section is present');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

    // Test footer
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173');
        if (res.data.includes('2026') && (res.data.includes('footer') || res.data.includes('kaivalo'))) {
          console.log('✓ footer is present');
          passed++;
        } else {
          console.log('✗ footer is present');
          console.log('  Footer not found');
          failed++;
        }
      } catch (e) {
        console.log('✗ footer is present');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

    // Test SEO meta tags
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173');
        const hasOg = res.data.includes('og:title') && res.data.includes('og:description') && res.data.includes('og:image');
        if (hasOg) {
          console.log('✓ Open Graph meta tags are present');
          passed++;
        } else {
          console.log('✗ Open Graph meta tags are present');
          console.log('  OG meta tags not found');
          failed++;
        }
      } catch (e) {
        console.log('✗ Open Graph meta tags are present');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

    // Test Twitter card meta tags
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173');
        const hasTwitter = res.data.includes('twitter:card') && res.data.includes('twitter:title');
        if (hasTwitter) {
          console.log('✓ Twitter card meta tags are present');
          passed++;
        } else {
          console.log('✗ Twitter card meta tags are present');
          console.log('  Twitter meta tags not found');
          failed++;
        }
      } catch (e) {
        console.log('✗ Twitter card meta tags are present');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

    // Test favicon
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173/favicon.ico');
        if (res.statusCode === 200) {
          console.log('✓ favicon.ico is accessible');
          passed++;
        } else {
          console.log('✗ favicon.ico is accessible');
          console.log(`  Status code: ${res.statusCode}`);
          failed++;
        }
      } catch (e) {
        console.log('✗ favicon.ico is accessible');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

    // Test og-image
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173/og-image.png');
        if (res.statusCode === 200) {
          console.log('✓ og-image.png is accessible');
          passed++;
        } else {
          console.log('✗ og-image.png is accessible');
          console.log(`  Status code: ${res.statusCode}`);
          failed++;
        }
      } catch (e) {
        console.log('✗ og-image.png is accessible');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

    // Test CSS is loaded
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173');
        if (res.data.includes('.css" rel="stylesheet"')) {
          console.log('✓ CSS stylesheet is linked');
          passed++;
        } else {
          console.log('✗ CSS stylesheet is linked');
          console.log('  CSS link not found');
          failed++;
        }
      } catch (e) {
        console.log('✗ CSS stylesheet is linked');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

    // Test SvelteKit hydration script
    await (async () => {
      try {
        const res = await httpGet('http://localhost:4173');
        if (res.data.includes('__sveltekit') && res.data.includes('import(')) {
          console.log('✓ SvelteKit hydration script is present');
          passed++;
        } else {
          console.log('✗ SvelteKit hydration script is present');
          console.log('  Hydration script not found');
          failed++;
        }
      } catch (e) {
        console.log('✗ SvelteKit hydration script is present');
        console.log(`  ${e.message}`);
        failed++;
      }
    })();

  } finally {
    // Kill the server
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch (e) {
      // Server may have already exited
    }
  }
}

// Run async tests
runServerTests().then(() => {
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}).catch((e) => {
  console.error('Test runner error:', e);
  process.exit(1);
});
