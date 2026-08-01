import React, { useEffect, useRef } from 'react';
import { Univer, UniverInstanceType } from '@univerjs/core';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula';
import { UniverUIPlugin } from '@univerjs/ui';
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui';

import '@univerjs/ui/lib/index.css';
import '@univerjs/sheets-ui/lib/index.css';

interface UniverSheetProps {
  style?: React.CSSProperties;
  /** Callback to expose the Univer instance to parent */
  onReady?: (univer: Univer) => void;
}

/**
 * Univer 电子表格 React 封装组件。
 * 初始化 Univer 实例，挂载到容器 div。
 */
export const UniverSheet: React.FC<UniverSheetProps> = ({ style, onReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const univerRef = useRef<Univer | null>(null);

  useEffect(() => {
    if (!containerRef.current || univerRef.current) return;

    const univer = new Univer();
    univer.registerPlugins([
      [UniverRenderEnginePlugin],
      [UniverFormulaEnginePlugin],
      [UniverSheetsPlugin],
      [UniverSheetsFormulaPlugin],
      [UniverUIPlugin, { container: containerRef.current }],
      [UniverSheetsUIPlugin],
    ]);
    univerRef.current = univer;

    univer.createUnit(UniverInstanceType.UNIVER_SHEET, {});

    onReady?.(univer);

    return () => {
      univer.dispose();
      univerRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 400,
        ...style,
      }}
    />
  );
};
