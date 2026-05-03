/** @type {import('next').NextConfig} */
const devDomain = process.env.REPLIT_DEV_DOMAIN ?? '';
const appUrl = devDomain
  ? `https://${devDomain}`
  : (process.env.NEXT_PUBLIC_APP_URL ?? '');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_URL: appUrl,
  },
  allowedDevOrigins: [
    '*.replit.dev',
    '*.riker.replit.dev',
    ...(devDomain ? [devDomain] : []),
  ],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'assets.tcgdex.net' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
