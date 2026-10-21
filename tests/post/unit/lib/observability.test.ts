import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, captureException } from '@/lib/observability';

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

/** Pull the JSON payload out of a `console.*('[manch]', line)` call. */
function payloadOf(spy: ReturnType<typeof vi.spyOn>, call = 0) {
  const args = spy.mock.calls[call];
  expect(args[0]).toBe('[manch]');
  return JSON.parse(args[1] as string) as Record<string, unknown>;
}

describe('log.info', () => {
  it('emits a JSON line to console.log with level + message + ts', () => {
    log.info('hello world');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const p = payloadOf(logSpy);
    expect(p.level).toBe('info');
    expect(p.message).toBe('hello world');
    expect(typeof p.ts).toBe('string');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('merges meta fields into the JSON payload', () => {
    log.info('with meta', { userId: 'u1', count: 3 });
    const p = payloadOf(logSpy);
    expect(p.userId).toBe('u1');
    expect(p.count).toBe(3);
    expect(p.message).toBe('with meta');
  });
});

describe('log.warn', () => {
  it('emits a JSON line to console.warn with level warn', () => {
    log.warn('careful');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const p = payloadOf(warnSpy);
    expect(p.level).toBe('warn');
    expect(p.message).toBe('careful');
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('log.error', () => {
  it('emits a JSON line to console.error with level error', () => {
    log.error('boom', { code: 'E_BOOM' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const p = payloadOf(errorSpy);
    expect(p.level).toBe('error');
    expect(p.message).toBe('boom');
    expect(p.code).toBe('E_BOOM');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('captureException', () => {
  it('logs an Error message and includes its stack', () => {
    const err = new Error('kaboom');
    captureException(err);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const p = payloadOf(errorSpy);
    expect(p.level).toBe('error');
    expect(p.message).toBe('kaboom');
    expect(typeof p.stack).toBe('string');
    expect(p.stack as string).toContain('kaboom');
  });

  it('merges context fields alongside the error', () => {
    captureException(new Error('with ctx'), { route: '/api/x', requestId: 'r1' });
    const p = payloadOf(errorSpy);
    expect(p.message).toBe('with ctx');
    expect(p.route).toBe('/api/x');
    expect(p.requestId).toBe('r1');
    expect(typeof p.stack).toBe('string');
  });

  it('stringifies a non-Error input and omits the stack', () => {
    captureException('just a string');
    const p = payloadOf(errorSpy);
    expect(p.message).toBe('just a string');
    expect(p.stack).toBeUndefined();
  });

  it('stringifies a non-Error object input', () => {
    captureException({ foo: 'bar' });
    const p = payloadOf(errorSpy);
    // String({foo:'bar'}) === '[object Object]'
    expect(p.message).toBe('[object Object]');
    expect(p.stack).toBeUndefined();
  });

  it('stringifies null/number inputs without a stack', () => {
    captureException(null);
    captureException(42);
    expect(payloadOf(errorSpy, 0).message).toBe('null');
    expect(payloadOf(errorSpy, 1).message).toBe('42');
    expect(payloadOf(errorSpy, 0).stack).toBeUndefined();
    expect(payloadOf(errorSpy, 1).stack).toBeUndefined();
  });
});
