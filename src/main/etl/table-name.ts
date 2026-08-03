/** BigTable 表名规范化。与 etl.mergeFolder 共用同一规则。 */
export function normalizeTableName(raw: string): string {
  const sanitized = raw.replace(/[^a-zA-Z0-9一-鿿_]/g, '_').toLowerCase();
  // 仅剩下划线(或为空)视为无有效字符,回退到 bigtable。
  return sanitized.replace(/_/g, '').length > 0 ? sanitized : 'bigtable';
}
