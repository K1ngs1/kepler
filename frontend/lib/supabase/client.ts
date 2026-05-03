'use client';

import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function isConfigured() {
  return (
    url.startsWith('http') &&
    key.length > 10 &&
    key !== 'your-supabase-anon-key'
  );
}

export function getConfigError(): string | null {
  if (!url || !url.startsWith('http')) {
    return 'NEXT_PUBLIC_SUPABASE_URL is missing or invalid.';
  }
  if (!key || key.length <= 10 || key === 'your-supabase-anon-key') {
    return 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or invalid.';
  }
  return null;
}

export function createClient() {
  if (!isConfigured()) {
    const err = getConfigError();
    console.error('[Supabase] Configuration error:', err);
    return null;
  }
  try {
    return createBrowserClient(url, key);
  } catch (e) {
    console.error('[Supabase] Failed to initialise client:', e);
    return null;
  }
}

export { isConfigured };
