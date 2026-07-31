import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Skin } from './types';

interface SkinContextValue {
  skins: Skin[];
  activeSkin: Skin | null;
  setActiveSkin: (skinId: string) => void;
}

const SkinContext = createContext<SkinContextValue | null>(null);

const DEFAULT_SKIN: Skin = {
  id: 'default',
  manifest: {
    name: 'Default Dark',
    version: '1.0.0',
    author: 'hifi',
    description: 'The default dark theme',
    tokens: {
      colors: {
        background: '#0a0a0f',
        surface: '#14141f',
        surfaceHover: '#1e1e30',
        surfaceActive: '#282844',
        primary: '#6366f1',
        primaryHover: '#818cf8',
        text: '#e2e8f0',
        textSecondary: '#94a3b8',
        textMuted: '#64748b',
        border: '#1e293b',
        lossless: '#4ade80',
        compressed: '#60a5fa',
        castActive: '#22d3ee',
        castIdle: '#52525b',
        progressFill: '#6366f1',
        progressBuffered: 'rgba(99, 102, 241, 0.2)',
        progressBg: '#1e293b',
        error: '#ef4444',
        success: '#22c55e',
        warning: '#f59e0b',
        overlay: 'rgba(0,0,0,0.6)',
      },
      fonts: {
        ui: "'Inter', -apple-system, sans-serif",
        display: "'Inter', -apple-system, sans-serif",
        mono: "'JetBrains Mono', 'Fira Code', monospace",
      },
      sizing: {
        touchTarget: '48px',
        fontBase: '15px',
        fontLarge: '22px',
        fontSmall: '12px',
        radiusSm: '6px',
        radiusMd: '10px',
        radiusLg: '16px',
        spacingXs: '4px',
        spacingSm: '8px',
        spacingMd: '16px',
        spacingLg: '24px',
        spacingXl: '32px',
      },
      visualization: {
        waveformColor: '#6366f1',
        barColor: '#818cf8',
        particleColor: '#a78bfa',
        fftSize: '2048',
        smoothingTimeConstant: '0.8',
      },
    },
  },
  cssUrl: '',
};

export function SkinProvider({ children }: { children: React.ReactNode }) {
  const [skins, setSkins] = useState<Skin[]>([DEFAULT_SKIN]);
  const [activeSkin, setActiveSkinState] = useState<Skin>(DEFAULT_SKIN);

  // Inject CSS custom properties (validated against injection)
  useEffect(() => {
    const styleId = 'skin-tokens';
    let el = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = styleId;
      document.head.appendChild(el);
    }

    const tokens = activeSkin.manifest.tokens;
    let css = ':root {\n';
    // Validate color values: hex, rgb(), rgba(), or CSS named colors
    const colorRe = /^(#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|[a-z]+)$/;
    for (const [key, val] of Object.entries(tokens.colors)) {
      if (!colorRe.test(String(val))) continue;
      css += `  --color-${key}: ${val};\n`;
    }
    // Validate font values: quote-wrapped or CSS-standard font names
    const fontRe = /^['"]?[a-zA-Z][a-zA-Z0-9 '\-]+['"]?(,\s*)?(sans-serif|serif|monospace)?$/;
    for (const [key, val] of Object.entries(tokens.fonts)) {
      if (!fontRe.test(String(val))) continue;
      css += `  --font-${key}: ${val};\n`;
    }
    // Validate sizing values: number + px/em/rem/vh/vw/%/pt
    const sizeRe = /^[\d.]+(px|em|rem|vh|vw|%|pt)$/;
    for (const [key, val] of Object.entries(tokens.sizing)) {
      if (!sizeRe.test(String(val))) continue;
      css += `  --${key}: ${val};\n`;
    }
    // Validate visualization values: number or CSS color
    for (const [key, val] of Object.entries(tokens.visualization)) {
      const s = String(val);
      if (colorRe.test(s) || /^[\d.]+$/.test(s)) {
        css += `  --viz-${key}: ${s};\n`;
      }
    }
    css += '}';
    el.textContent = css;

    return () => {
      el?.remove();
    };
  }, [activeSkin]);

  // Load skins from /skins/ at runtime
  useEffect(() => {
    // Known skin directories — try fetching skin.json from each
    const KNOWN_SKINS = ['default', 'tesla'];

    async function loadSkins() {
      const loaded: Skin[] = [DEFAULT_SKIN]; // default always available
      for (const dir of KNOWN_SKINS) {
        if (dir === 'default') continue; // already loaded
        try {
          const res = await fetch(`/skins/${dir}/skin.json`);
          if (!res.ok) continue;
          const manifest = await res.json();
          loaded.push({
            id: dir,
            manifest,
            cssUrl: `/skins/${dir}/theme.css`,
          });
        } catch { /* skip missing skins */ }
      }
      setSkins(loaded);
    }
    loadSkins();
  }, []);

  const setActiveSkin = useCallback((skinId: string) => {
    const skin = skins.find(s => s.id === skinId);
    if (skin) setActiveSkinState(skin);
  }, [skins]);

  return (
    <SkinContext.Provider value={{ skins, activeSkin, setActiveSkin }}>
      {children}
    </SkinContext.Provider>
  );
}

export function useSkin() {
  const ctx = useContext(SkinContext);
  if (!ctx) throw new Error('useSkin must be inside SkinProvider');
  return ctx;
}
