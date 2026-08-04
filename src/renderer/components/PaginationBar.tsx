// onworking/src/renderer/components/PaginationBar.tsx
// 分页条 — 上一页/下一页 + 页码 + 总行数
import React from 'react';
import { t } from '../../common/i18n';

interface PaginationBarProps {
  page: number; // 0-based 当前页
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({ page, pageSize, total, onPageChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, totalPages - 1);
  const btnStyle: React.CSSProperties = {
    border: '1px solid #ccc', background: '#fff', borderRadius: 3,
    padding: '1px 10px', fontSize: 11, cursor: 'pointer',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
      borderBottom: '1px solid #eee', fontSize: 11, color: '#666' }}>
      <span>{t('pagination.pageInfo', { current: cur + 1, total: totalPages })}</span>
      <button onClick={() => onPageChange(cur - 1)} disabled={cur <= 0}
        style={{ ...btnStyle, cursor: cur <= 0 ? 'default' : 'pointer', opacity: cur <= 0 ? 0.4 : 1 }}>{t('pagination.prev')}</button>
      <button onClick={() => onPageChange(cur + 1)} disabled={cur >= totalPages - 1}
        style={{ ...btnStyle, cursor: cur >= totalPages - 1 ? 'default' : 'pointer', opacity: cur >= totalPages - 1 ? 0.4 : 1 }}>{t('pagination.next')}</button>
      <span>{t('pagination.totalInfo', { total, pageSize })}</span>
    </div>
  );
};
