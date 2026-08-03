import { describe, expect, it, beforeEach } from 'vitest';
import { ContextMenuRegistry } from '../src/renderer/context-menu/registry';
import { BaseContextMenu, MenuItem, MenuContext } from '../src/renderer/context-menu/base';
import { FileItemMenu } from '../src/renderer/context-menu/menus/FileItemMenu';
import { FolderItemMenu } from '../src/renderer/context-menu/menus/FolderItemMenu';
import { FolderFileMenu } from '../src/renderer/context-menu/menus/FolderFileMenu';
import { RuleItemMenu } from '../src/renderer/context-menu/menus/RuleItemMenu';
import { FileClipboard } from '../src/renderer/state/FileClipboard';

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

const ctx = (target: unknown): MenuContext =>
  ({ targetType: 'x', target, api: window.onworking.api, actions: {} }) as MenuContext;

describe('menu classes', () => {
  beforeEach(() => FileClipboard.clear());
  it('FileItemMenu exposes file ops', () => {
    const items = new FileItemMenu().getItems(ctx({ path: '/ws/source/a.xlsx' }));
    expect(items.map(i => i.id)).toEqual(['open-preview', 'open-dir', 'copy', 'paste', 'rename', 'delete']);
    expect(items.find(i => i.id === 'delete')?.danger).toBe(true);
  });
  it('FolderItemMenu exposes folder ops', () => {
    const items = new FolderItemMenu().getItems(ctx({ name: '大表1', folderPath: '/ws/大表1' }));
    expect(items.map(i => i.id)).toEqual(['settings', 'merge', 'open-dir', 'paste', 'delete']);
  });
  it('FolderFileMenu exposes file ops', () => {
    const items = new FolderFileMenu().getItems(ctx({ path: '/ws/大表1/source/b.xlsx', folderPath: '/ws/大表1' }));
    expect(items.map(i => i.id)).toEqual(['open-preview', 'open-dir', 'copy', 'paste', 'rename', 'delete']);
  });
  it('RuleItemMenu exposes rule ops', () => {
    const items = new RuleItemMenu().getItems(ctx({ name: 'rule_a' }));
    expect(items.map(i => i.id)).toEqual(['edit', 'delete']);
    expect(items.find(i => i.id === 'delete')?.danger).toBe(true);
  });
  it('paste is disabled when clipboard empty', () => {
    const items = new FileItemMenu().getItems(ctx({ path: '/ws/source/a.xlsx' }));
    expect(items.find(i => i.id === 'paste')?.enabled).toBe(false);
  });
});
