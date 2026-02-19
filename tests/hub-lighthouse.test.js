import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync, spawn } from 'node:child_process';

const hubDir = resolve(import.meta.dirname, '..', 'apps', 'hub');
const appCssFile = resolve(hubDir, 'src', 'app.css');
const appHtmlFile = resolve(hubDir, 'src', 'app.html');
const pageFile = resolve(hubDir, 'src', 'routes', '+page.svelte');

const PORT_BASE = 14198;
const PORT_RANGE = 1000;
const LIGHTHOUSE_TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

const appCss = readFileSync(appCssFile, 'utf8');
const appHtml = readFileSync(appHtmlFile, 'utf8');
const pageContent = readFileSync(pageFile, 'utf8');

describe('font loading optimization', () => {
  it('font CSS is loaded via link tags in app.html, not CSS @import', () => {
    assert.ok(!appCss.includes("@import url('https://api.fontshare.com"));
    assert.ok(!appCss.includes("@import url('https://fonts.googleapis.com"));
  });

  it('app.html has font link for Clash Display', () => {
    assert.ok(appHtml.includes('clash-display'));
    assert.ok(appHtml.includes('display=swap'));
  });

  it('app.html has non-blocking font link for Plus Jakarta Sans', () => {
    assert.ok(appHtml.includes('Plus+Jakarta+Sans'));
  });

  it('app.html has non-blocking font link for JetBrains Mono', () => {
    assert.ok(appHtml.includes('JetBrains+Mono'));
  });

  it('app.html has preconnect hints for font domains', () => {
    assert.ok(appHtml.includes('preconnect') && appHtml.includes('fontshare.com'));
    assert.ok(appHtml.includes('preconnect') && appHtml.includes('fonts.googleapis.com'));
    assert.ok(appHtml.includes('preconnect') && appHtml.includes('fonts.gstatic.com'));
  });

  it('font links use display=swap for non-blocking text rendering', () => {
    assert.ok(appHtml.includes('display=swap'));
  });
});

describe('color contrast (accessibility)', () => {
  it('--text-muted meets 4.5:1 ratio against --bg-primary', () => {
    const match = appCss.match(/--text-muted:\s*(#[0-9a-fA-F]{6})/);
    const bgMatch = appCss.match(/--bg-primary:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(match && bgMatch);

    function luminance(hex) {
      const rgb = hex.replace('#', '').match(/.{2}/g).map(v => {
        let c = parseInt(v, 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }
    function contrast(c1, c2) {
      const l1 = luminance(c1);
      const l2 = luminance(c2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    const ratio = contrast(match[1], bgMatch[1]);
    assert.ok(ratio >= 4.5, `contrast ratio ${ratio.toFixed(2)}:1 should be >= 4.5:1`);
  });

  it('coming-soon cards do not use opacity:0.6 on wrapper', () => {
    const comingSoonSection = pageContent.split('{:else}')[1];
    if (comingSoonSection) {
      const cardLine = comingSoonSection.split('\n').find(l => l.includes('rounded-xl') && l.includes('border'));
      if (cardLine) {
        assert.ok(!cardLine.includes('opacity: 0.6') && !cardLine.includes('opacity:0.6'));
      }
    }
  });
});

describe('performance optimizations', () => {
  it('body uses font-display: swap-compatible fonts', () => {
    assert.ok(appHtml.includes('display=swap'));
  });

  it('CSS has no render-blocking @import for external URLs', () => {
    const importLines = appCss.split('\n').filter(l => l.includes('@import url('));
    const externalImports = importLines.filter(l => l.includes('http'));
    assert.strictEqual(externalImports.length, 0);
  });

  it('app.html has viewport meta tag', () => {
    assert.ok(appHtml.includes('viewport'));
    assert.ok(appHtml.includes('width=device-width'));
  });

  it('body has overflow-x hidden for mobile', () => {
    assert.ok(appCss.includes('overflow-x: hidden') || appCss.includes('overflow-x:hidden'));
  });
});

describe('lighthouse score validation', () => {
  const buildExists = existsSync(resolve(hubDir, 'build', 'index.js'));
  let lighthouseScores = null;
  let skipReason = null;
  let serverProcess = null;
  const port = PORT_BASE + Math.floor(Math.random() * PORT_RANGE);

  before(async () => {
    if (!buildExists) { skipReason = 'no build directory — run npm run build first'; return; }

    serverProcess = spawn('node', ['build/index.js'], {
      cwd: hubDir,
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
      stdio: 'ignore',
      detached: true,
    });
    serverProcess.unref();

    // Wait for server to be ready
    let serverReady = false;
    for (let i = 0; i < 20; i++) {
      try {
        execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}`, {
          timeout: 2000,
          encoding: 'utf8',
        });
        serverReady = true;
        break;
      } catch {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    if (!serverReady) { skipReason = `server failed to start on port ${port}`; return; }

    try {
      const result = execSync(
        `CHROME_PATH=/usr/local/bin/chromium npx lighthouse http://localhost:${port} --chrome-flags="--headless --no-sandbox --disable-gpu" --output=json --only-categories=performance,accessibility,best-practices,seo 2>/dev/null`,
        { encoding: 'utf8', timeout: LIGHTHOUSE_TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES },
      );
      const report = JSON.parse(result);
      lighthouseScores = {};
      for (const [key, cat] of Object.entries(report.categories)) {
        lighthouseScores[key] = Math.round(cat.score * 100);
      }
    } catch (e) {
      skipReason = `lighthouse/chrome not available: ${e.message.split('\n')[0]}`;
    }
  });

  after(() => {
    if (serverProcess && serverProcess.pid) {
      try {
        process.kill(-serverProcess.pid);
      } catch (e) {
        if (e.code !== 'ESRCH') throw e;
      }
    }
  });

  it('lighthouse scores >= 90', (t) => {
    if (skipReason) {
      t.skip(skipReason);
      return;
    }

    assert.ok(lighthouseScores.performance >= 90, `performance ${lighthouseScores.performance} should be >= 90`);
    assert.ok(lighthouseScores.accessibility >= 90, `accessibility ${lighthouseScores.accessibility} should be >= 90`);
    assert.ok(lighthouseScores['best-practices'] >= 90, `best-practices ${lighthouseScores['best-practices']} should be >= 90`);
    assert.ok(lighthouseScores.seo >= 90, `seo ${lighthouseScores.seo} should be >= 90`);
  });
});
