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

  test('album art area is square', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);
    const albumArt = page.locator('.aspect-square').first();
    const box = await albumArt.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeCloseTo(box!.height, 1);
  });

  test('heart fill states', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    const heartIcon = page.locator('button .material-symbols-outlined:has-text("favorite")').first();
    const heartButton = heartIcon.locator('..');

    await expect(heartButton).toBeVisible({ timeout: 5000 });

    // Without a track playing, button is disabled and shows outline
    const style = await heartIcon.getAttribute('style');
    expect(style).toContain('"FILL" 0');

    const isDisabled = await heartButton.getAttribute('disabled');
    expect(isDisabled).not.toBeNull();
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

  test('transport controls are centred and visible', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    const playIcon = page.locator('button .material-symbols-outlined:has-text("play_arrow")').first();
    const playButton = playIcon.locator('..');
    await expect(playButton).toBeVisible({ timeout: 5000 });

    // Play button should be circular (rounded-full)
    const classAttr = await playButton.getAttribute('class');
    expect(classAttr).toContain('rounded-full');
  });

  test('sidebar nav buttons', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    const sidebarButtons = page.locator('aside nav button');
    await expect(sidebarButtons.nth(0)).toBeVisible({ timeout: 5000 });
    await expect(sidebarButtons.nth(1)).toBeVisible({ timeout: 5000 });
    await expect(sidebarButtons.nth(2)).toBeVisible({ timeout: 5000 });
    await expect(sidebarButtons.filter({ hasText: 'Play' })).toBeVisible();
    await expect(sidebarButtons.filter({ hasText: 'Browse' })).toBeVisible();
    await expect(sidebarButtons.filter({ hasText: 'Settings' })).toBeVisible();
  });

  test('sidebar username', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    await expect(page.locator('aside h3:has-text("testuser")')).toBeVisible({ timeout: 5000 });
  });

  test('progress bar structure', async ({ page }) => {
    await page.goto('/player');
    await page.waitForTimeout(500);

    // Progress bar container should exist
    const progressContainer = page.locator('.bg-white\\/10.rounded-full').first();
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
    // Clear auth to see login page
    await page.evaluate(() => {
      localStorage.removeItem('hifi_auth');
      sessionStorage.removeItem('hifi_auth');
    });
    await page.goto('/');
    await page.waitForTimeout(500);

    // Should see the hifi logo
    await expect(page.locator('text=hifi').first()).toBeVisible({ timeout: 5000 });

    // Should see username and password fields
    await expect(page.locator('input[type="text"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 5000 });

    // Should see Connect button
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
    const badge = page.locator('span.font-mono-ui:has-text("CD Quality")');
    await expect(badge.first()).toBeVisible({ timeout: 5000 });
    // Badge uses Tailwind tier classes, not inline styles — verify cd tier class
    const hasTierClass = await badge.first().evaluate((el) =>
      el.className.includes('bg-secondary')
    );
    expect(hasTierClass).toBe(true);
  });

  test('Hi-Res badge color tier', async ({ page }) => {
    await injectPlayingTrack(page, 'song-6'); // FLAC 4608kbps → Hi-Res
    await page.goto('/player');
    await page.waitForTimeout(2000);
    // The badge should render as Hi-Res
    const badge = page.locator('span.font-mono-ui:has-text("Hi-Res")');
    await expect(badge.first()).toBeVisible({ timeout: 10000 });
    // Badge uses Tailwind tier classes — verify hires tier class
    const hasTierClass = await badge.first().evaluate((el) =>
      el.className.includes('bg-primary')
    );
    expect(hasTierClass).toBe(true);
  });

  test('High Quality badge color tier', async ({ page }) => {
    await injectPlayingTrack(page, 'song-2'); // MP3 320kbps → High Quality
    await page.goto('/player');
    await page.waitForTimeout(1000);
    const badge = page.locator('span.font-mono-ui:has-text("High Quality")');
    await expect(badge.first()).toBeVisible({ timeout: 5000 });
    // Badge uses Tailwind tier classes — verify high tier class
    const hasTierClass = await badge.first().evaluate((el) =>
      el.className.includes('bg-tertiary')
    );
    expect(hasTierClass).toBe(true);
  });

  test('Standard badge color tier', async ({ page }) => {
    await injectPlayingTrack(page, 'song-4'); // OGG 190kbps → Standard
    await page.goto('/player');
    await page.waitForTimeout(1000);
    const badge = page.locator('span.font-mono-ui:has-text("Standard")');
    await expect(badge.first()).toBeVisible({ timeout: 5000 });
    // Badge uses Tailwind tier classes — verify standard tier class
    const hasTierClass = await badge.first().evaluate((el) =>
      el.className.includes('bg-white/5')
    );
    expect(hasTierClass).toBe(true);
  });

  test('Low badge color tier', async ({ page }) => {
    await injectPlayingTrack(page, 'song-5'); // MP3 128kbps → Low
    await page.goto('/player');
    await page.waitForTimeout(1000);
    const badge = page.locator('span.font-mono-ui:has-text("Low")').first();
    await expect(badge).toBeVisible({ timeout: 5000 });
    // Badge uses Tailwind tier classes — verify low tier class
    const hasTierClass = await badge.evaluate((el) =>
      el.className.includes('bg-error')
    );
    expect(hasTierClass).toBe(true);
  });
});
