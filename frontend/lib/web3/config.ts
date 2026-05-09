import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { polygon, polygonAmoy } from 'wagmi/chains';

import { USDC_ADDRESS_MAINNET, USDC_ADDRESS_AMOY } from './usdc';

const isProd = process.env.NEXT_PUBLIC_CHAIN === 'mainnet';
export const USDC_ADDRESS = isProd ? USDC_ADDRESS_MAINNET : USDC_ADDRESS_AMOY;

export const config = getDefaultConfig({
  appName: 'Kepler',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || '00000000000000000000000000000000',
  chains: isProd ? [polygon] : [polygonAmoy],
  ssr: true,
});
