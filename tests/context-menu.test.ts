import { describe, expect, it, beforeEach } from 'vitest';
import { ContextMenuRegistry } from '../src/renderer/context-menu/registry';
import { BaseContextMenu, MenuItem, MenuContext } from '../src/renderer/context-menu/base';

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = { onworking: { api: { call: () => Promise.resolve({ success: true, data: null }) } } };
});

class FakeMenu extends BaseContextMenu {
  getItems(ctx: MenuContext): MenuItem[] {
    return [
      { id: 'a', label: 'A', group: 'g1', onClick: () => { ctx.actions.didRun?.(); } },
      { id: 'b', label: 'B', danger: true, group: 'g2', enabled: false },
    ];
  }
}

describe('ContextMenuRegistry', () => {
  it('registers and resolves a menu class', () => {
    ContextMenuRegistry.register('fake', FakeMenu);
    const Ctor = ContextMenuRegistry.resolve('fake');
    expect(Ctor).toBe(FakeMenu);
  });
  it('returns undefined for unknown target type', () => {
    expect(ContextMenuRegistry.resolve('nope')).toBeUndefined();
  });
});

describe('BaseContextMenu', () => {
  it('derived getItems returns menu items and onClick can call actions', () => {
    let ran = false;
    const ctx: MenuContext = { targetType: 'fake', target: {}, api: window.onworking.api, actions: { didRun: () => { ran = true; } } };
    const items = new FakeMenu().getItems(ctx);
    expect(items.map(i => i.id)).toEqual(['a', 'b']);
    expect(items[1].danger).toBe(true);
    expect(items[1].enabled).toBe(false);
    items[0].onClick?.(ctx);
    expect(ran).toBe(true);
  });
});
