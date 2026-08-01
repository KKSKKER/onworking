// ============================================================
// src/main/rules/rule-store.ts
// YAML 规则读写 — SOURCE_LAYER_SPEC.md §7.1
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { RuleDefinition } from '../../common/types/etl-types';

export class RuleStore {
  constructor(private rulesDir: string) {}

  private ensureDir(): void {
    if (!fs.existsSync(this.rulesDir)) {
      fs.mkdirSync(this.rulesDir, { recursive: true });
    }
  }

  load(name: string): RuleDefinition {
    this.ensureDir();
    const filePath = path.join(this.rulesDir, `${name}.yaml`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Rule not found: ${name} (${filePath})`);
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return yaml.load(raw) as RuleDefinition;
  }

  save(rule: RuleDefinition): void {
    this.ensureDir();
    const filePath = path.join(this.rulesDir, `${rule.name}.yaml`);
    const yamlStr = yaml.dump(rule, {
      indent: 2,
      lineWidth: 120,
      quotingType: '"',
      forceQuotes: false,
    });
    fs.writeFileSync(filePath, yamlStr, 'utf-8');
  }

  list(): string[] {
    this.ensureDir();
    return fs.readdirSync(this.rulesDir)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map(f => path.basename(f, path.extname(f)));
  }

  delete(name: string): void {
    for (const ext of ['.yaml', '.yml']) {
      const filePath = path.join(this.rulesDir, `${name}${ext}`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  listAll(): RuleDefinition[] {
    return this.list().map(name => this.load(name));
  }
}
