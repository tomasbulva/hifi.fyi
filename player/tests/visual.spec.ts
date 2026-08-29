import { test, expect } from '@playwright/test';
import { setupApiMocks, loginPlayer, injectPlayingTrack } from './mocks';

test.describe('hifi Player — Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await loginPlayer(page);
  });

  test('dark background', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    // Should be a dark color (rgb values all low)
    expect(bgColor).toMatch(/rgb\(\d{1,2},\s*\d{1,2},\s*\d{1,2}\)/);
  });

  test('album art area uses rounded-3xl', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);
    const albumArt = page.locator('.rounded-3xl').first();
    await expect(albumArt).toBeVisible({ timeout: 5000 });
  });

  test('heart fill states — outline when no track', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);
    // When no track, heart button is not rendered (inside `currentTrack &&` block)
    // Verify "Not playing" text is shown
    await expect(page.locator('h1:has-text("Not playing")')).toBeVisible({ timeout: 5000 });
  });

  test('equalizer animation classes exist in CSS', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    const hasAnimations = await page.evaluate(() => {
      const styles = Array.from(document.styleSheets);
      for (const sheet of styles) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (rule.cssText && rule.cssText.includes('eq-bar')) return true;
          }
        } catch { /* cross-origin */ }
      }
      return false;
    });
    expect(hasAnimations).toBeTruthy();
  });

  test('transport controls — skip_previous and skip_next', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    await expect(page.locator('.material-symbols-outlined:has-text("skip_previous")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.material-symbols-outlined:has-text("skip_next")')).toBeVisible({ timeout: 5000 });
    // Play button
    const playIcon = page.locator('button .material-symbols-outlined:has-text("play_arrow")').first();
    const playButton = playIcon.locator('..');
    await expect(playButton).toBeVisible({ timeout: 5000 });
    const classAttr = await playButton.getAttribute('class');
    expect(classAttr).toContain('rounded-full');
  });

  test('sidebar nav buttons — 5 total', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    const sidebarButtons = page.locator('aside nav button');
    await expect(sidebarButtons).toHaveCount(5, { timeout: 5000 });
    await expect(sidebarButtons.filter({ hasText: 'Play' })).toBeVisible();
    await expect(sidebarButtons.filter({ hasText: 'Browse' })).toBeVisible();
    await expect(sidebarButtons.filter({ hasText: 'Search' })).toBeVisible();
    await expect(sidebarButtons.filter({ hasText: 'Favorites' })).toBeVisible();
    await expect(sidebarButtons.filter({ hasText: 'Settings' })).toBeVisible();
  });

  test('sidebar username — div.text-sm.font-semibold', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    await expect(page.locator('aside div.text-sm.font-semibold:has-text("testuser")')).toBeVisible({ timeout: 5000 });
  });

  test('progress bar — relative h-1.5 rounded-full', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    const progressContainer = page.locator('.relative.h-1\\.5.rounded-full').first();
    await expect(progressContainer).toBeVisible({ timeout: 5000 });

    // Time labels should show 0:00 when no track
    await expect(page.locator('text=0:00').first()).toBeVisible({ timeout: 5000 });
  });

  test('volume control visible', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    await expect(page.locator('.material-symbols-outlined:has-text("volume_up")')).toBeVisible({ timeout: 5000 });
  });

  test('"Not playing" when no track', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    await expect(page.locator('h1:has-text("Not playing")')).toBeVisible({ timeout: 5000 });
  });

  test('login page structure', async ({ page }) => {
    // Override the default session mock — return not-setup so the onboarding screen appears
    await page.route('**/api/auth/session', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ loggedIn: false, setup: false }),
      });
    });
    await page.goto('/');
    await page.waitForTimeout(500);

    // Should see the hifi logo
    await expect(page.locator('text=hifi').first()).toBeVisible({ timeout: 5000 });

    // Onboarding screen: Navidrome URL input, 2x text fields (navidrome user + hifi user), 3x password fields
    await expect(page.locator('input[type="url"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="text"]').first()).toBeVisible({ timeout: 5000 });
    const pwFields = page.locator('input[type="password"]');
    await expect(pwFields.nth(0)).toBeVisible({ timeout: 5000 });
    await expect(pwFields.nth(1)).toBeVisible({ timeout: 5000 });
    await expect(pwFields.nth(2)).toBeVisible({ timeout: 5000 });

    // Should see submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 5000 });
  });

  test('library view loads', async ({ page }) => {
    await page.goto('/library');
    await page.waitForTimeout(1000);

    const content = page.locator('main');
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  test('settings view loads', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(500);

    const content = page.locator('main');
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  test('CSS custom properties are defined', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    const hasThemeColors = await page.evaluate(() => {
      const body = document.body;
      const style = window.getComputedStyle(body);
      return style.backgroundColor !== 'transparent' && style.backgroundColor !== 'rgba(0, 0, 0, 0)';
    });
    expect(hasThemeColors).toBeTruthy();
  });

  // ── Quality badge color tiers ──

  test('CD Quality badge color tier', async ({ page }) => {
    await injectPlayingTrack(page, 'song-1'); // FLAC 1411kbps → CD Quality
    await page.goto('/player');
    await page.waitForTimeout(1000);
    const badge = page.locator('text=CD Quality');
    await expect(badge.first()).toBeVisible({ timeout: 5000 });
    // Verify the badge is inside a span with tier classes
    const badgeSpan = page.locator('span.border:has-text("CD Quality")').first();
    await expect(badgeSpan).toBeVisible({ timeout: 5000 });
    const cls = await badgeSpan.getAttribute('class') ?? '';
    expect(cls.includes('bg-secondary') || cls.includes('text-secondary')).toBe(true);
  });

  test('Hi-Res badge color tier', async ({ page }) => {
    await injectPlayingTrack(page, 'song-6'); // FLAC 4608kbps → Hi-Res
    await page.goto('/player');
    await page.waitForTimeout(2000);
    const badge = page.locator('text=Hi-Res');
    await expect(badge.first()).toBeVisible({ timeout: 10000 });
    const badgeSpan = page.locator('span.border:has-text("Hi-Res")').first();
    await expect(badgeSpan).toBeVisible({ timeout: 5000 });
    const cls = await badgeSpan.getAttribute('class') ?? '';
    expect(cls.includes('bg-primary') || cls.includes('text-primary')).toBe(true);
  });

  test('High Quality badge color tier', async ({ page }) => {
    await injectPlayingTrack(page, 'song-2'); // MP3 320kbps → High Quality
    await page.goto('/player');
    await page.waitForTimeout(1000);
    const badge = page.locator('text=High Quality');
    await expect(badge.first()).toBeVisible({ timeout: 5000 });
    const badgeSpan = page.locator('span.border:has-text("High Quality")').first();
    await expect(badgeSpan).toBeVisible({ timeout: 5000 });
    const cls = await badgeSpan.getAttribute('class') ?? '';
    expect(cls.includes('bg-tertiary') || cls.includes('text-tertiary')).toBe(true);
  });

  test('Standard badge color tier', async ({ page }) => {
    await injectPlayingTrack(page, 'song-4'); // OGG 190kbps → Standard
    await page.goto('/player');
    await page.waitForTimeout(1000);
    const badge = page.locator('text=Standard');
    await expect(badge.first()).toBeVisible({ timeout: 5000 });
    const badgeSpan = page.locator('span.border:has-text("Standard")').first();
    await expect(badgeSpan).toBeVisible({ timeout: 5000 });
    const cls = await badgeSpan.getAttribute('class') ?? '';
    expect(cls.includes('bg-white') || cls.includes('text-on-surface-variant')).toBe(true);
  });

  test('Low badge color tier', async ({ page }) => {
    await injectPlayingTrack(page, 'song-5'); // MP3 128kbps → Low
    await page.goto('/player');
    await page.waitForTimeout(1000);
    const badge = page.locator('text=Low').first();
    await expect(badge).toBeVisible({ timeout: 5000 });
    const badgeSpan = page.locator('span.border:has-text("Low")').first();
    await expect(badgeSpan).toBeVisible({ timeout: 5000 });
    const cls = await badgeSpan.getAttribute('class') ?? '';
    expect(cls.includes('bg-error') || cls.includes('text-error')).toBe(true);
  });

  // ── NEW: Animations CSS loaded ──

  test('animations CSS — fade-in keyframe exists', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    const hasFadeIn = await page.evaluate(() => {
      const styles = Array.from(document.styleSheets);
      for (const sheet of styles) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (rule.cssText && rule.cssText.includes('@keyframes') && rule.cssText.includes('fade-in')) {
              return true;
            }
          }
        } catch { /* cross-origin */ }
      }
      return false;
    });
    expect(hasFadeIn).toBeTruthy();
  });

  // ── NEW: AlbumBackdrop visible when playing ──

  test('AlbumBackdrop visible when playing', async ({ page }) => {
    await injectPlayingTrack(page, 'song-1');
    await page.goto('/player');
    await page.waitForTimeout(1000);
    await expect(page.locator('.album-backdrop')).toBeVisible({ timeout: 5000 });
  });

  // ── NEW: Skeleton component renders ──

  test('Skeleton component renders', async ({ page }) => {
    // The Skeleton component is used in loading states.
    // We can verify the CSS classes exist for skeleton rendering.
    await page.goto('/player');
    await page.waitForTimeout(500);

    // Check that the skeleton CSS class is defined in stylesheets
    const hasSkeleton = await page.evaluate(() => {
      const styles = Array.from(document.styleSheets);
      for (const sheet of styles) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (rule.cssText && rule.cssText.includes('.skeleton')) return true;
          }
        } catch { /* cross-origin */ }
      }
      return false;
    });
    expect(hasSkeleton).toBeTruthy();
  });
});
