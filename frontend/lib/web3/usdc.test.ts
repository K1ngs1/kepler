import { describe, it, expect } from 'vitest';
import { usdcToUnits, USDC_DECIMALS } from './usdc';

describe('usdcToUnits', () => {
  it('converts whole and fractional amounts to 6-decimal base units', () => {
    expect(usdcToUnits(1)).toBe(BigInt(1_000_000));
    expect(usdcToUnits(42)).toBe(BigInt(42_000_000));
    expect(usdcToUnits(42.5)).toBe(BigInt(42_500_000));
    expect(usdcToUnits(0)).toBe(BigInt(0));
  });

  it('rounds to the nearest base unit (no float drift)', () => {
    expect(usdcToUnits(0.1)).toBe(BigInt(100_000));
    expect(usdcToUnits(0.000001)).toBe(BigInt(1));
    // 0.0000004 rounds down to 0 base units
    expect(usdcToUnits(0.0000004)).toBe(BigInt(0));
  });

  it('uses 6 decimals', () => {
    expect(USDC_DECIMALS).toBe(6);
  });

  it('rejects invalid amounts', () => {
    expect(() => usdcToUnits(-1)).toThrow();
    expect(() => usdcToUnits(NaN)).toThrow();
    expect(() => usdcToUnits(Infinity)).toThrow();
  });
});
