import React, { useEffect, useRef, useState } from 'react';
import { ContextMenuRegistry } from './registry';
import { MenuItem, MenuContext } from './base';
import { FileItemMenu } from './menus/FileItemMenu';
import { FolderItemMenu } from './menus/FolderItemMenu';
import { FolderFileMenu } from './menus/FolderFileMenu';
import { RuleItemMenu } from './menus/RuleItemMenu';

ContextMenuRegistry.register('file', FileItemMenu);
ContextMenuRegistry.register('folder', FolderItemMenu);
ContextMenuRegistry.register('folder-file', FolderFileMenu);
ContextMenuRegistry.register('rule', RuleItemMenu);

interface HostState { items: MenuItem[]; ctx: MenuContext; x: number; y: number; }
interface SubState { items: MenuItem[]; ctx: MenuContext; x: number; y: number; }

let openMenu: ((s: HostState | null) => void) | null = null;

/** 组件右键入口:查注册表 → 实例化 → 收集菜单 → Host 渲染。 */
export function triggerMenu(
  targetType: string,
  target: unknown,
  x: number,
  y: number,
  actions: Record<string, (...args: unknown[]) => void> = {},
): void {
  const Ctor = ContextMenuRegistry.resolve(targetType);
  if (!Ctor) return;
  const menu = new Ctor();
  const ctx: MenuContext = { targetType, target, api: window.onworking.api, actions };
  // 不过滤 disabled 项:Host 负责置灰 + 禁用点击(与 VS Code 一致)
  openMenu?.({ items: menu.getItems(ctx), ctx, x, y });
}

const MENU_W = 200;
const ROW_H = 28;
const PAD = 8;

export const ContextMenuHost: React.FC = () => {
  const [state, setState] = useState<HostState | null>(null);
  const [sub, setSub] = useState<SubState | null>(null);
  const [active, setActive] = useState(0);
  const [subActive, setSubActive] = useState(0);

  openMenu = setState;

  const close = (): void => { setState(null); setSub(null); setActive(0); setSubActive(0); };

  const stateRef = useRef(state);
  stateRef.current = state;
  const subRef = useRef(sub);
  subRef.current = sub;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { close(); return; }
      const list = subRef.current ? subRef.current.items : (stateRef.current?.items ?? []);
      if (list.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (subRef.current) setSubActive(i => Math.min(i + 1, list.length - 1)); else setActive(i => Math.min(i + 1, list.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (subRef.current) setSubActive(i => Math.max(i - 1, 0)); else setActive(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const it = list[subRef.current ? subActive : active];
        if (!it || it.enabled === false) return;
        const ctx = subRef.current ? subRef.current.ctx : stateRef.current!.ctx;
        it.onClick?.(ctx); close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, subActive]);

  if (!state) return null;

  const height = state.items.length * ROW_H + PAD * 2;
  const x = Math.min(state.x, window.innerWidth - MENU_W - PAD);
  const y = Math.min(state.y, window.innerHeight - height - PAD);

  const run = (it: MenuItem): void => { if (it.enabled === false) return; it.onClick?.(state.ctx); close(); };
  const groupOf = (i: number): string => state.items[i].group ?? '';
  const sep = (i: number): boolean => i > 0 && groupOf(i) !== groupOf(i - 1);

  const row = (it: MenuItem, i: number, list: MenuItem[], ctx: MenuContext, activeIdx: number, setIdx: (f: (i: number) => number) => void, onHover?: () => void): React.ReactNode => {
    const disabled = it.enabled === false;
    return (
    <div key={it.id} onMouseEnter={() => { setIdx(() => i); onHover?.(); }}
      onClick={() => run(it)}
      style={{ padding: '5px 12px', cursor: disabled ? 'default' : 'pointer', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: 12, background: disabled ? 'transparent' : (i === activeIdx ? '#007acc' : 'transparent'),
        color: disabled ? '#999' : (it.danger ? (i === activeIdx ? '#ffd0d4' : '#d13438') : (i === activeIdx ? '#fff' : '#333')),
        opacity: disabled ? 0.6 : 1, fontSize: 13, whiteSpace: 'nowrap' }}>
      <span>{it.icon ? `${it.icon} ` : ''}{it.label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {it.shortcut && <span style={{ fontSize: 11, color: i === activeIdx ? '#d0e8ff' : '#999' }}>{it.shortcut}</span>}
        {it.children?.length ? <span style={{ fontSize: 10 }}>▶</span> : null}
      </span>
    </div>
    );
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
        onMouseDown={close}
        onContextMenu={e => { e.preventDefault(); close(); }} />
      <div onContextMenu={e => e.preventDefault()}
        style={{ position: 'fixed', left: x, top: y, zIndex: 10001, background: '#fff', border: '1px solid #ccc',
          borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.18)', padding: `${PAD}px 0`,
          minWidth: MENU_W, fontFamily: 'system-ui, sans-serif', userSelect: 'none' }}>
        {state.items.map((it, i) => (
          <React.Fragment key={it.id}>
            {sep(i) && <div style={{ height: 1, background: '#e5e5e5', margin: '4px 8px' }} />}
            {row(it, i, state.items, state.ctx, active, setActive, () => {
              if (it.children?.length) {
                const childTop = y + PAD + state.items.slice(0, i).reduce((acc, m) => acc + ROW_H, 0);
                setSub({ items: it.children ?? [], ctx: state.ctx, x: x + MENU_W - 6, y: childTop });
                setSubActive(0);
              } else { setSub(null); }
            })}
          </React.Fragment>
        ))}
      </div>
      {sub && (
        <div onContextMenu={e => e.preventDefault()}
          style={{ position: 'fixed', left: sub.x, top: Math.min(sub.y, window.innerHeight - sub.items.length * ROW_H - PAD),
            zIndex: 10002, background: '#fff', border: '1px solid #ccc', borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)', padding: `${PAD}px 0`, minWidth: MENU_W,
            fontFamily: 'system-ui, sans-serif', userSelect: 'none' }}>
          {sub.items.map((it, i) => (
            <React.Fragment key={it.id}>
              {sep(i) && <div style={{ height: 1, background: '#e5e5e5', margin: '4px 8px' }} />}
              {row(it, i, sub.items, sub.ctx, subActive, setSubActive)}
            </React.Fragment>
          ))}
        </div>
      )}
    </>
  );
};
