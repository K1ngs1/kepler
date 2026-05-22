'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const COMMANDS = [
  { label: 'Go to Listings', shortcut: '', href: '/listings' },
  { label: 'Go to Offers', shortcut: '', href: '/trades' },
  { label: 'Create Listing', shortcut: '', href: '/listings/new' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIdx]) {
      onClose();
      router.push(filtered[selectedIdx].href);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480, maxWidth: '95vw',
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5' }}>
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands…"
            style={{
              width: '100%', border: 'none', outline: 'none',
              fontSize: 15, color: '#111', padding: '4px 0',
              background: 'transparent',
            }}
          />
        </div>

        {/* Results */}
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '20px 16px', color: '#999', fontSize: 13, textAlign: 'center' }}>
              No commands found.
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <div
                key={cmd.href}
                onClick={() => { onClose(); router.push(cmd.href); }}
                style={{
                  padding: '10px 16px',
                  fontSize: 14,
                  color: '#111',
                  background: i === selectedIdx ? '#f5f5f5' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.08s',
                }}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span>{cmd.label}</span>
                <span style={{ fontSize: 11, color: '#bbb' }}>↵</span>
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid #e5e5e5',
          fontSize: 11,
          color: '#aaa',
          display: 'flex',
          gap: 12,
        }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
