// onworking/src/renderer/components/ResizableSidebar.tsx
// 可拖动调宽的侧边栏 — 右侧把手拖动改变宽度,容器 min/max 限制
import React, { useRef, useState } from 'react';

interface ResizableSidebarProps {
  children: React.ReactNode;
  initialWidth: number;
  minWidth?: number;
  maxWidth?: number;
  contentStyle?: React.CSSProperties;
}

export const ResizableSidebar: React.FC<ResizableSidebarProps> = ({
  children, initialWidth, minWidth = 160, maxWidth = 700, contentStyle,
}) => {
  const [width, setWidth] = useState(initialWidth);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const startDrag = (e: React.MouseEvent): void => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };

    const onMove = (ev: MouseEvent): void => {
      const d = dragRef.current;
      if (!d) return;
      const next = Math.max(minWidth, Math.min(maxWidth, d.startW + (ev.clientX - d.startX)));
      setWidth(next);
    };
    const onUp = (): void => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <>
      <div style={{ width, flexShrink: 0, overflow: 'auto', height: '100%', boxSizing: 'border-box', ...contentStyle }}>
        {children}
      </div>
      <div onMouseDown={startDrag} title="拖动调整宽度"
        style={{ width: 5, flexShrink: 0, cursor: 'col-resize', background: 'transparent' }} />
    </>
  );
};
