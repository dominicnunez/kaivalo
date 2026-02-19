import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const hubSrc = resolve(import.meta.dirname, '..', 'apps', 'hub', 'src');
const hubRoutes = resolve(hubSrc, 'routes');

describe('Auth Layout — +layout.server.ts', () => {
  const layoutServerPath = resolve(hubRoutes, '+layout.server.ts');
  const content = existsSync(layoutServerPath) ? readFileSync(layoutServerPath, 'utf8') : '';

  it('file exists', () => {
    assert.ok(existsSync(layoutServerPath), '+layout.server.ts should exist');
  });

  it('imports authKit from @workos/authkit-sveltekit', () => {
    assert.ok(
      content.includes('authKit') && content.includes('@workos/authkit-sveltekit'),
      'should import authKit from @workos/authkit-sveltekit'
    );
  });

  it('imports LayoutServerLoad type', () => {
    assert.ok(
      content.includes('LayoutServerLoad'),
      'should import LayoutServerLoad type for typed load function'
    );
  });

  it('exports a load function', () => {
    assert.ok(
      content.includes('export const load'),
      'should export a load function'
    );
  });

  it('calls authKit.getUser to get current user', () => {
    assert.ok(
      content.includes('authKit.getUser'),
      'should call authKit.getUser(event) to get user session'
    );
  });

  it('calls authKit.getSignInUrl for unauthenticated users', () => {
    assert.ok(
      content.includes('getSignInUrl'),
      'should call getSignInUrl to generate sign-in URL'
    );
  });

  it('returns user in load data', () => {
    assert.ok(
      content.includes('user'),
      'should return user in load response'
    );
  });

  it('returns signInUrl in load data', () => {
    assert.ok(
      content.includes('signInUrl'),
      'should return signInUrl for unauthenticated users'
    );
  });

  it('does not use withAuth (landing page stays public)', () => {
    assert.ok(
      !content.includes('withAuth'),
      'should NOT use withAuth — landing page must remain public for unauthenticated users'
    );
  });

  it('does not hardcode credentials', () => {
    assert.ok(!content.includes('sk_'), 'should not hardcode API keys');
    assert.ok(!content.includes('client_'), 'should not hardcode client IDs');
  });
});

describe('Auth Layout — +layout.svelte (nav UI)', () => {
  const layoutPath = resolve(hubRoutes, '+layout.svelte');
  const content = existsSync(layoutPath) ? readFileSync(layoutPath, 'utf8') : '';

  it('file exists', () => {
    assert.ok(existsSync(layoutPath), '+layout.svelte should exist');
  });

  it('has a nav element', () => {
    assert.ok(content.includes('<nav'), 'should have a nav element for auth UI');
  });

  it('imports LayoutData type', () => {
    assert.ok(
      content.includes('LayoutData'),
      'should import LayoutData type for typed data prop'
    );
  });

  it('destructures data from $props()', () => {
    assert.ok(
      content.includes('data') && content.includes('$props()'),
      'should destructure data from $props() for auth state'
    );
  });

  it('has kaivalo brand link in nav', () => {
    assert.ok(
      content.includes('kaivalo') && content.includes('href="/"'),
      'should have kaivalo brand link back to home'
    );
  });

  it('conditionally renders based on data.user', () => {
    assert.ok(
      content.includes('data.user'),
      'should check data.user for conditional auth rendering'
    );
  });

  it('shows sign-in button for unauthenticated users', () => {
    assert.ok(
      content.includes('Sign in') || content.includes('sign in'),
      'should show sign-in button when user is not authenticated'
    );
  });

  it('links sign-in to signInUrl from server data', () => {
    assert.ok(
      content.includes('data.signInUrl'),
      'should link sign-in button to signInUrl from layout server data'
    );
  });

  it('shows sign-out link for authenticated users', () => {
    assert.ok(
      content.includes('Sign out') || content.includes('sign out'),
      'should show sign-out option for authenticated users'
    );
  });

  it('links sign-out to /auth/sign-out', () => {
    assert.ok(
      content.includes('/auth/sign-out'),
      'should link sign-out to /auth/sign-out route'
    );
  });

  it('shows user avatar or initial when authenticated', () => {
    assert.ok(
      content.includes('profilePictureUrl'),
      'should check for user profile picture URL'
    );
  });

  it('shows fallback initial when no avatar', () => {
    assert.ok(
      content.includes('firstName') || content.includes('email'),
      'should show user first name or email initial as fallback'
    );
  });

  it('shows user name or email when authenticated', () => {
    assert.ok(
      (content.includes('data.user.firstName') || content.includes('data.user.email')),
      'should display user name or email when authenticated'
    );
  });

  it('imports LogIn and LogOut icons', () => {
    assert.ok(
      content.includes('LogIn') && content.includes('LogOut'),
      'should import LogIn and LogOut icons from lucide-svelte'
    );
  });

  it('uses Container component for nav layout', () => {
    assert.ok(
      content.includes('Container'),
      'should use Container component for consistent nav width'
    );
  });

  it('still renders children with @render', () => {
    assert.ok(
      content.includes('@render children()') || content.includes('{@render children()}'),
      'should still render children content'
    );
  });

  it('still imports app.css', () => {
    assert.ok(
      content.includes("app.css"),
      'should still import app.css for global styles'
    );
  });

  it('nav has proper z-index for grain overlay', () => {
    assert.ok(
      content.includes('z-20') || content.includes('z-10'),
      'nav should have z-index to appear above grain overlay'
    );
  });
});

describe('Auth Layout — Sign-out route', () => {
  const signOutPath = resolve(hubRoutes, 'auth', 'sign-out', '+server.ts');
  const content = existsSync(signOutPath) ? readFileSync(signOutPath, 'utf8') : '';

  it('file exists', () => {
    assert.ok(existsSync(signOutPath), 'auth/sign-out/+server.ts should exist');
  });

  it('imports authKit from @workos/authkit-sveltekit', () => {
    assert.ok(
      content.includes('authKit') && content.includes('@workos/authkit-sveltekit'),
      'should import authKit from @workos/authkit-sveltekit'
    );
  });

  it('imports RequestHandler type', () => {
    assert.ok(
      content.includes('RequestHandler'),
      'should import RequestHandler type'
    );
  });

  it('exports a POST handler', () => {
    assert.ok(
      content.includes('export const POST'),
      'should export POST handler (sign-out is triggered via form submission)'
    );
  });

  it('calls authKit.signOut', () => {
    assert.ok(
      content.includes('authKit.signOut'),
      'should call authKit.signOut(event) to clear session'
    );
  });

  it('does not hardcode credentials', () => {
    assert.ok(!content.includes('sk_'), 'should not hardcode API keys');
    assert.ok(!content.includes('client_'), 'should not hardcode client IDs');
  });
});

describe('Auth Layout — Build verification', () => {
  const buildDir = resolve(import.meta.dirname, '..', 'apps', 'hub', 'build');

  it('build directory exists (app builds with auth changes)', () => {
    assert.ok(existsSync(buildDir), 'build directory should exist — run npm run build first');
  });

  it('build has layout server entry', () => {
    // Check that the build output includes the layout server
    const serverDir = resolve(buildDir, 'server');
    assert.ok(
      existsSync(serverDir),
      'build should have server directory with layout server code'
    );
  });
});
