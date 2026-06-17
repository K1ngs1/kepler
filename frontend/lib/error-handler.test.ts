import { describe, it, expect } from 'vitest';
import { handleError, friendlyMessage } from './error-handler';

describe('handleError', () => {
  it('normalizes Error instances', () => {
    const r = handleError(new Error('boom'));
    expect(r.message).toBe('boom');
  });

  it('normalizes strings', () => {
    expect(handleError('nope').message).toBe('nope');
  });

  it('normalizes Supabase-style { message, code } objects', () => {
    const r = handleError({ message: 'permission denied', code: '42501' });
    expect(r.message).toBe('permission denied');
    expect(r.code).toBe('42501');
  });

  it('falls back for unknown shapes', () => {
    expect(handleError(undefined).message).toMatch(/unknown/i);
  });
});

describe('friendlyMessage', () => {
  it('maps auth/jwt errors to a session message', () => {
    expect(friendlyMessage({ message: 'JWT expired' })).toMatch(/session/i);
  });

  it('maps not-found errors', () => {
    expect(friendlyMessage({ message: 'row does not exist' })).toMatch(/could not be found/i);
  });

  it('maps network errors', () => {
    expect(friendlyMessage({ message: 'fetch failed' })).toMatch(/network/i);
  });

  it('maps permission/RLS errors', () => {
    expect(friendlyMessage({ message: 'new row violates row-level security policy' })).toMatch(/permission/i);
  });

  it('passes through an otherwise-unknown message', () => {
    expect(friendlyMessage({ message: 'Weird specific failure' })).toBe('Weird specific failure');
  });
});
