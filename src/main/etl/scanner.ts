// ============================================================
// src/main/etl/scanner.ts
// Stage 1: 文件发现 + 规则匹配 — SOURCE_LAYER_SPEC.md §4.1
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { RuleDefinition, ResolvedFile } from '../../common/types/etl-types';

export function scanWorkspace(sourceDir: string, rules: RuleDefinition[]): ResolvedFile[] {
  const results: ResolvedFile[] = [];

  if (!fs.existsSync(sourceDir)) return results;

  const allFiles = walkDir(sourceDir);

  for (const filePath of allFiles) {
    const relativePath = path.relative(sourceDir, filePath);
    const stat = fs.statSync(filePath);

    for (const rule of rules) {
      for (const source of rule.sources) {
        if (matchGlob(relativePath, source.pattern)) {
          const fileBuf = fs.readFileSync(filePath);
          const contentHash = crypto.createHash('sha256').update(fileBuf).digest('hex');

          results.push({
            path: filePath,
            relativePath,
            name: path.basename(filePath),
            extension: path.extname(filePath),
            sizeBytes: stat.size,
            contentHash,
            modifiedAt: stat.mtime.toISOString(),
            matchedRule: rule.name,
            matchedSource: source,
          });
          break;
        }
      }
    }
  }

  return results;
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function matchGlob(filePath: string, pattern: string): boolean {
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*');
  return new RegExp(`^${regexStr}$`, 'i').test(filePath);
}
