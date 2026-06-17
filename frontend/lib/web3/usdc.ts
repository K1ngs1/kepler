export const USDC_ADDRESS_MAINNET = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // Polygon PoS native USDC
export const USDC_ADDRESS_AMOY = '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582';   // Polygon Amoy testnet USDC

// Arc Testnet USDC — system contract providing ERC-20 interface for native USDC.
export const USDC_ADDRESS_ARC = '0x3600000000000000000000000000000000000000';
export const USDC_DECIMALS = 6;

/**
 * Convert a human USDC amount (e.g. 42.5) to base units (6 decimals) for an
 * ERC-20 transfer. Rounds to the nearest base unit to avoid float drift.
 */
export function usdcToUnits(amount: number): bigint {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid USDC amount: ${amount}`);
  }
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}
