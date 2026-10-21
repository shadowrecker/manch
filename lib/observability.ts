// Lightweight structured logger + error capture.
//
// Logs JSON to stdout/stderr. If you later add @sentry/nextjs, forward from
// captureException() when env.sentryDsn is set — no call sites need to change.

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ level, message, ...meta, ts: new Date().toISOString() });
  if (level === 'error') console.error('[manch]', line);
  else if (level === 'warn') console.warn('[manch]', line);
  else console.log('[manch]', line);
}

export const log = {
  info: (m: string, meta?: Record<string, unknown>) => emit('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit('error', m, meta),
};

export function captureException(err: unknown, context?: Record<string, unknown>) {
  const message = err instanceof Error ? err.message : String(err);
  emit('error', message, {
    ...context,
    stack: err instanceof Error ? err.stack : undefined,
  });
}
