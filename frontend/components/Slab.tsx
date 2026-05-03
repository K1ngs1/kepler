interface SlabProps {
  grade: string;
  label: string;
  set: string;
  scale?: number;
}

export default function Slab({ grade, label, set, scale = 1 }: SlabProps) {
  return (
    <div className="slab" style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
      <div className="slab-top">PSA · Pokémon TCG</div>
      <div className="slab-body">
        <div className="slab-stripe" />
        <div className="slab-label">{label || 'Card'}<br />{set || ''}</div>
        <div className="slab-grade-badge">{grade}</div>
      </div>
      <div className="slab-bottom">Authentic · Graded</div>
    </div>
  );
}
