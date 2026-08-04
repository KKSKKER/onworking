import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertInsideRoot } from './guard';
import { RuleStore } from '../rules/rule-store';
import { rewriteRulePatterns } from '../rules/pattern-rewrite';
import { t } from '../../common/i18n';

export function deleteFileWithinRoot(root: string, targetPath: string): void {
  fs.rmSync(assertInsideRoot(root, targetPath), { force: true });
}

export function copyFileWithinRoot(
  root: string, sourcePath: string, destDir: string, overwrite: boolean,
): { copied: boolean; conflict: boolean; targetPath: string } {
  const srcAbs = assertInsideRoot(root, sourcePath);
  const destAbs = path.join(assertInsideRoot(root, destDir), path.basename(srcAbs));
  if (fs.existsSync(destAbs) && !overwrite) {
    return { copied: false, conflict: true, targetPath: destAbs };
  }
  fs.copyFileSync(srcAbs, destAbs);
  return { copied: true, conflict: false, targetPath: destAbs };
}

export function renameSourceFileWithinRoot(
  root: string, oldPath: string, newName: string, rulesDirs: string[],
): { newPath: string; rulesUpdated: number } {
  const oldAbs = assertInsideRoot(root, oldPath);
  if (!newName || newName.includes('/') || newName.includes('\\') || newName === '.' || newName === '..') {
    throw new Error(t('error.invalidNewName'));
  }
  const oldBasename = path.basename(oldAbs);
  if (oldBasename === newName) return { newPath: oldAbs, rulesUpdated: 0 };
  const newPath = path.join(path.dirname(oldAbs), newName);
  if (fs.existsSync(newPath)) throw new Error(t('error.nameAlreadyExists', { name: newName }));
  fs.renameSync(oldAbs, newPath);

  let rulesUpdated = 0;
  for (const dir of rulesDirs) {
    if (!fs.existsSync(dir)) continue;
    const store = new RuleStore(dir);
    for (const def of store.listAll()) {
      const next = rewriteRulePatterns([def], oldBasename, newName)[0];
      if (next !== def) { store.save(next); rulesUpdated++; }
    }
  }
  return { newPath, rulesUpdated };
}

/** 收集工作区规则目录 + 每个大表文件夹的规则目录,用于改名后的 pattern 同步。 */
export function collectRulesDirs(root: string, wsRulesDir: string): string[] {
  const dirs = [wsRulesDir];
  if (!fs.existsSync(root)) return dirs;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      if (fs.existsSync(path.join(root, entry.name, 'source'))) {
        dirs.push(path.join(root, entry.name, '.onworking', 'rules'));
      }
    }
  }
  return [...new Set(dirs)];
}
