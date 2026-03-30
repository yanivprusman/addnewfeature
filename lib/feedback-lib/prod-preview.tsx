'use client';

import { useState, useEffect, useCallback } from 'react';

const ATTR = 'data-prod-preview';
const EVENT = 'prodpreviewtoggle';

/**
 * ProdToggle — renders nothing visible.
 * Listens for 'P' keypress (when not in an input) and toggles
 * the `data-prod-preview` attribute on <html>.
 * Injects CSS: html[data-prod-preview] .dev-only { display: none !important }
 */
export function ProdToggle() {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `html[${ATTR}] .dev-only { display: none !important; }`;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'p' && e.key !== 'P') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (el && (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        (el as HTMLElement).isContentEditable
      )) return;
      const html = document.documentElement;
      html.toggleAttribute(ATTR);
      window.dispatchEvent(new Event(EVENT));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}

/**
 * Hook: returns true when the prod-preview toggle is active.
 * Re-renders the component when the toggle changes.
 */
export function useProdPreview(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(document.documentElement.hasAttribute(ATTR));
    function onToggle() {
      setActive(document.documentElement.hasAttribute(ATTR));
    }
    window.addEventListener(EVENT, onToggle);
    return () => window.removeEventListener(EVENT, onToggle);
  }, []);

  return active;
}

/**
 * Hook: returns true if the app should behave as prod.
 * True when NEXT_PUBLIC_IS_PROD=true (real prod) OR when
 * the prod-preview toggle is active (P pressed in dev).
 */
export function useIsProd(): boolean {
  const preview = useProdPreview();
  return process.env.NEXT_PUBLIC_IS_PROD === 'true' || preview;
}
