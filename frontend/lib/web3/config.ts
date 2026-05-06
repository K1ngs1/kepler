'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { polygon, polygonAmoy } from 'wagmi/chains';

const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? '';

const chainEnv = process.env.NEXT_PUBLIC_CHAIN ?? 'amoy';
const activeChain = chainEnv === 'polygon' ? polygon : polygonAmoy;

export const wagmiConfig = getDefaultConfig({
  appName: 'Kepler',
  projectId,
  chains: [activeChain],
  ssr: true,
});

export { activeChain };
