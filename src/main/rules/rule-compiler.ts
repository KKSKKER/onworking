// ============================================================
// src/main/rules/rule-compiler.ts
// RuleDefinition → ParseConfig[] 编译器 — SOURCE_LAYER_SPEC.md §6.2
// ============================================================

import type { RuleDefinition, ResolvedFile } from '../../common/types/etl-types';
import type { ParseConfig } from '../../common/types/parse-config';
import { defaultParseConfig } from '../../common/types/parse-config';

export function ruleToParseConfigs(rule: RuleDefinition, resolvedFiles: ResolvedFile[]): ParseConfig[] {
  const configs: ParseConfig[] = [];

  for (const file of resolvedFiles) {
    const source = findMatchingSource(file.relativePath, rule.sources);
    if (!source) continue;

    const base = defaultParseConfig(file.path, source.sheetIndex ?? 0, source.headerRow);

    configs.push({
      ...base,
      expectedContentHash: file.contentHash,
      sheetName: source.sheetName,
      dataStartRow: source.headerRow + 1,
      headerRows: source.headerRows,
      headerJoinSeparator: source.headerJoinSeparator,
    });
  }

  return configs;
}

function findMatchingSource(
  filePath: string,
  sources: RuleDefinition['sources'],
): RuleDefinition['sources'][number] | undefined {
  return sources.find(s => matchGlob(filePath, s.pattern));
}

function matchGlob(filePath: string, pattern: string): boolean {
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*');

  return new RegExp(`^${regexStr}$`, 'i').test(filePath);
}
