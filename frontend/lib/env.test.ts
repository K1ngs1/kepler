import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// env.ts validates at module-load time and throws on the server (node) when
// misconfigured, so each case re-imports a fresh module with stubbed env.
describe('public env validation', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('parses a valid configuration', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'a'.repeat(40));
    const mod = await import('./env');
    expect(mod.env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co');
    expect(mod.getPublicEnvError()).toBeNull();
  });

  it('throws (fail fast) on the server when required vars are missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    await expect(import('./env')).rejects.toThrow(/Invalid environment/i);
  });

  it('rejects a malformed merchant wallet address', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'a'.repeat(40));
    vi.stubEnv('NEXT_PUBLIC_MERCHANT_WALLET', '0xnothex');
    await expect(import('./env')).rejects.toThrow(/MERCHANT_WALLET/i);
  });
});
