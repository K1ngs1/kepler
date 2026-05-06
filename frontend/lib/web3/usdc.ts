export const USDC_ADDRESS_MAINNET = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // Polygon native USDC
// Polygon Amoy does not have a public USDC faucet; using mainnet address as placeholder
export const USDC_ADDRESS_AMOY = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
export const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
] as const;
export const USDC_DECIMALS = 6;
