/**
 * USDC contract constants for Polygon PoS.
 *
 * Mainnet native USDC: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
 * Amoy testnet USDC:   0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582
 *
 * The contract address is selected automatically based on the
 * NEXT_PUBLIC_CHAIN environment variable.
 */

const chainEnv = process.env.NEXT_PUBLIC_CHAIN ?? 'amoy';

export const USDC_ADDRESS: `0x${string}` =
  chainEnv === 'polygon'
    ? '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
    : '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582';

export const USDC_DECIMALS = 6;

export const MERCHANT_WALLET: `0x${string}` =
  (process.env.NEXT_PUBLIC_MERCHANT_WALLET as `0x${string}`) ?? '0x0000000000000000000000000000000000000000';

/** Minimal ERC-20 ABI — only the methods we need */
export const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'Transfer',
    type: 'event',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;

/** Convert a human-readable USDC amount (e.g. 12.50) to on-chain units (6 decimals). */
export function parseUsdc(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

/** Convert on-chain USDC units back to a human-readable number. */
export function formatUsdc(raw: bigint): number {
  return Number(raw) / 10 ** USDC_DECIMALS;
}
