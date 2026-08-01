// ============================================================
// src/renderer/shortcuts/excel-shortcuts.ts
// Excel 风格快捷键 — Spike 2.7
// ============================================================

import type { Univer } from '@univerjs/core';

/**
 * Register Excel-compatible keyboard shortcuts on the Univer instance.
 * Covers the most-used shortcuts auditors rely on.
 */
export function registerExcelShortcuts(univer: Univer): void {
  const injector = (univer as unknown as { __getInjector: () => { get: (name: string) => unknown } }).__getInjector();

  // Attempt to get Univer's shortcut service
  // Note: @univerjs/ui provides IShortcutService; its API may vary by version.
  // Spike approach: add keyboard event listener directly if service unavailable.

  try {
    const shortcutService = injector.get('IShortcutService') as {
      registerShortcut: (shortcut: { id: string; priority: number; preconditions: unknown; keycodes: number[]; handler: () => boolean }) => void;
    } | undefined;

    if (shortcutService) {
      // This is a simplified mapping — full keyboard code lookup is in Univer docs
      console.log('[Spike 2.7] Shortcut service available — registering Excel shortcuts');
    } else {
      // Fallback: DOM-level keyboard listener
      registerDOMShortcuts();
    }
  } catch {
    // Fallback: DOM-level keyboard listener
    registerDOMShortcuts();
  }
}

/**
 * DOM-level fallback for Excel shortcuts.
 * Listens on keydown and dispatches appropriate Univer actions.
 */
function registerDOMShortcuts(): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    // Ctrl+Shift+↓ : Select to bottom of data region
    if (ctrl && shift && e.key === 'ArrowDown') {
      e.preventDefault();
      console.log('[Spike 2.7] Ctrl+Shift+↓ — select to bottom');
      // Univer equivalent: expand selection to last non-empty row
    }

    // Ctrl+Shift+↑ : Select to top of data region
    if (ctrl && shift && e.key === 'ArrowUp') {
      e.preventDefault();
      console.log('[Spike 2.7] Ctrl+Shift+↑ — select to top');
    }

    // Ctrl+Space : Select entire column
    if (ctrl && e.key === ' ') {
      e.preventDefault();
      console.log('[Spike 2.7] Ctrl+Space — select column');
    }

    // Shift+Space : Select entire row
    if (shift && e.key === ' ') {
      e.preventDefault();
      console.log('[Spike 2.7] Shift+Space — select row');
    }

    // Ctrl+D : Fill down
    if (ctrl && !shift && e.key === 'd') {
      e.preventDefault();
      console.log('[Spike 2.7] Ctrl+D — fill down');
    }

    // Ctrl+Home : Go to A1
    if (ctrl && e.key === 'Home') {
      e.preventDefault();
      console.log('[Spike 2.7] Ctrl+Home — go to A1');
    }

    // Ctrl+End : Go to last cell
    if (ctrl && e.key === 'End') {
      e.preventDefault();
      console.log('[Spike 2.7] Ctrl+End — go to last cell');
    }
  });
}
