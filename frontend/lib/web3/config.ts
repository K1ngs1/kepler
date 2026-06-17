import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { metaMaskWallet, coinbaseWallet, walletConnectWallet, injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import { polygon, polygonAmoy } from 'wagmi/chains';
import { defineChain } from 'viem';
import { http } from 'wagmi';

import { USDC_ADDRESS_MAINNET, USDC_ADDRESS_ARC, USDC_ADDRESS_AMOY } from './usdc';

const ARC_RPC_URL = 'https://rpc.testnet.arc.network';

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
    public: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
});

const isProd = process.env.NEXT_PUBLIC_CHAIN === 'mainnet';
const isAmoy = process.env.NEXT_PUBLIC_CHAIN === 'amoy';

// USDC address: mainnet → Polygon USDC, amoy → Amoy USDC, default testnet → Arc USDC
export const USDC_ADDRESS = isProd
  ? USDC_ADDRESS_MAINNET
  : isAmoy
    ? USDC_ADDRESS_AMOY
    : USDC_ADDRESS_ARC;

// Block-explorer base for tx links, matching the active chain above. Replaces
// the previous `NEXT_PUBLIC_CHAIN === 'mainnet'` checks that always fell back to
// the Arc explorer even on Amoy.
export const BLOCK_EXPLORER_TX = isProd
  ? 'https://polygonscan.com/tx/'
  : isAmoy
    ? 'https://amoy.polygonscan.com/tx/'
    : 'https://testnet.arcscan.app/tx/';

const amoyRpc = process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology';

// Chain selection: mainnet → Polygon, amoy → Polygon Amoy, default → Arc Testnet
const chains = isProd
  ? [polygon] as const
  : isAmoy
    ? [polygonAmoy] as const
    : [arcTestnet] as const;

const transports = isProd
  ? { [polygon.id]: http() }
  : isAmoy
    ? { [polygonAmoy.id]: http(amoyRpc) }
    : { [arcTestnet.id]: http(ARC_RPC_URL) };

export const config = getDefaultConfig({
  appName: 'Kepler',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || '00000000000000000000000000000000',
  chains: chains as any,
  transports: transports as any,
  wallets: [
    {
      groupName: 'Popular',
      wallets: [metaMaskWallet, coinbaseWallet, walletConnectWallet, injectedWallet],
    },
  ],
  ssr: true,
});
