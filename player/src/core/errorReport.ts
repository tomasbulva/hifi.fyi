/**
 * Error reporting — thin wrapper over Sentry.
 *
 * Initialized in main.tsx with the DSN from GET /api/analytics-config.
 * When no DSN is configured every function is a no-op, so call sites never
 * need to check whether reporting is enabled.
 *
 * Use reportError() inside catch blocks for real failures. Skip it for
 * intentional/silent ignores (e.g. abort errors, "best effort" cleanups).
 */

import * as Sentry from '@sentry/react';

export function initErrorReporting(dsn: string | undefined, release?: string) {
  if (!dsn) return;
  Sentry.init({
    dsn,
    release,
    environment: import.meta.env.MODE,
    // Frontend noise control: network blips and aborts are handled locally
    ignoreErrors: [
      'AbortError',
      'The user aborted a request',
      /AbortSignal/,
      'ResizeObserver loop',
      'NetworkError when attempting to fetch resource',
      'Load failed',
    ],
    tracesSampleRate: 0.1,
  });
}

/** Report a caught error with optional context. Safe to call anywhere. */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (context) {
    Sentry.withScope(scope => {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/** Report a non-exception problem (e.g. unexpected API state). */
export function reportMessage(message: string, context?: Record<string, unknown>) {
  Sentry.captureMessage(message, { extra: context, level: 'warning' });
}
