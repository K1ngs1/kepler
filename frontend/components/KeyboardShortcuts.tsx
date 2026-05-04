'use client';

import { useState, useEffect, useCallback } from 'react';
import CommandPalette from './CommandPalette';

export default function KeyboardShortcuts() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

    // Ctrl+K / Cmd+K → open command palette
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      setPaletteOpen((v) => !v);
      return;
    }

    // Esc → close palette or any modal
    if (e.key === 'Escape') {
      if (paletteOpen) {
        setPaletteOpen(false);
        return;
      }
      // Also close any .modal-bg by clicking it
      const modalBg = document.querySelector('.modal-bg') as HTMLElement | null;
      if (modalBg) modalBg.click();
      return;
    }

    // Don't trigger shortcuts while typing in inputs
    if (isInput) return;

    // / → focus search bar
    if (e.key === '/') {
      e.preventDefault();
      const navSearch = document.querySelector('.nav-search-wrap input') as HTMLInputElement
        ?? document.querySelector('.toolbar-search input') as HTMLInputElement;
      if (navSearch) navSearch.focus();
    }
  }, [paletteOpen]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />;
}
