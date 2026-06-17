import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Always evaluated at request time — never cached.
export const dynamic = 'force-dynamic';

/**
 * Liveness/readiness probe. Reports app reachability and Supabase connectivity
 * so uptime monitors and the deploy checklist have a single endpoint to hit.
 */
export async function GET() {
  const startedAt = Date.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let db: 'ok' | 'error' | 'unconfigured' = 'unconfigured';
  if (url && anonKey) {
    try {
      const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
      // Cheap public read to confirm the DB is reachable (RLS-safe).
      const { error } = await supabase.from('listings').select('id', { head: true, count: 'exact' }).limit(1);
      db = error ? 'error' : 'ok';
    } catch {
      db = 'error';
    }
  }

  const healthy = db === 'ok';
  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      db,
      latency_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
