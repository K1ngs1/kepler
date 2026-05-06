import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { polygon, polygonAmoy } from 'wagmi/chains';

const isProd = process.env.NEXT_PUBLIC_CHAIN === 'mainnet';

export const config = getDefaultConfig({
  appName: 'Kepler',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? '00000000000000000000000000000000',
  chains: isProd ? [polygon] : [polygonAmoy],
  ssr: true,
});
