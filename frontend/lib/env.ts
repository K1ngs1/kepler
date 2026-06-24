import { z } from 'zod';

/**
 * Validated public environment. NEXT_PUBLIC_* vars must be referenced by their
 * literal names here so Next.js inlines them into the client bundle.
 *
 * Behaviour on misconfiguration:
 *  - On the server (build/boot) we throw, so a misconfigured deploy fails fast
 *    instead of shipping a silently-broken app.
 *  - On the client we log and expose the error via getPublicEnvError(), so the
 *    UI can show a clear "not configured" state rather than crashing.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'is missing or too short'),
  // Chain-selection semantics live in lib/web3/config.ts ('polygon' → Polygon,
  // 'amoy' → Polygon Amoy, 'testnet'/unset → Arc testnet). Enum-validated so a
  // typo (e.g. 'mainnet', 'poligon') fails the build instead of silently
  // routing a payments app onto the Arc testnet.
  NEXT_PUBLIC_CHAIN: z
    .enum(['polygon', 'amoy', 'testnet'], {
      message: "must be one of 'polygon', 'amoy', 'testnet'",
    })
    .optional(),
  NEXT_PUBLIC_MERCHANT_WALLET: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 40-hex-char address')
    .optional(),
  NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID: z.string().optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

const raw = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_CHAIN: process.env.NEXT_PUBLIC_CHAIN,
  NEXT_PUBLIC_MERCHANT_WALLET: process.env.NEXT_PUBLIC_MERCHANT_WALLET,
  NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID,
};

const parsed = publicSchema.safeParse(raw);

let publicEnvError: string | null = null;
if (!parsed.success) {
  publicEnvError =
    'Invalid environment configuration — ' +
    parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ');

  if (typeof window === 'undefined') {
    // Fail fast on the server so a broken deploy never starts.
    throw new Error(publicEnvError);
  }
  console.error('[env] ' + publicEnvError);
}

export const env: PublicEnv = parsed.success
  ? parsed.data
  : // On the client we keep going with whatever is present so the UI can render
    // a configuration error instead of a white screen.
    (raw as PublicEnv);

export function getPublicEnvError(): string | null {
  return publicEnvError;
}
