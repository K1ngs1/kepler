'use client';

import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function isConfigured() {
  return url.startsWith('http') && key.length > 10 && key !== 'your-supabase-anon-key';
}

export function createClient() {
  if (!isConfigured()) return null;
  return createBrowserClient(url, key);
}

export { isConfigured };
