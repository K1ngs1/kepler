'use client';

interface Props {
  price: number | null | undefined;
}

export default function PriceBadge({ price }: Props) {
  if (price == null || price <= 0) return null;
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10.5,
      color: '#555',
      border: '1px solid #ddd',
      borderRadius: 3,
      padding: '1px 6px',
      whiteSpace: 'nowrap',
    }}>
      Est. ${price.toFixed(2)}
    </span>
  );
}
