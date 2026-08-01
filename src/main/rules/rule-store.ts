// ============================================================
// src/main/rules/rule-store.ts
// YAML 规则读写 — SOURCE_LAYER_SPEC.md §7.1
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { RuleDefinition, FieldDefinition, RuleSource } from '../../common/types/etl-types';

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

/** Column profile data from source_profile analysis */
export interface ColumnProfile {
  colLetter: string;
  headerText: string;
  nonNullCount: number;
  nullCount: number;
  nullRate: number;
  typeGuess: { primary: string; confidence: number; evidence: string };
  sampleValues: string[];
}

/**
 * Auto-generate a RuleDefinition from an Excel file's structure.
 * Output:
 * - Rule name derived from filename
 * - One source entry for the file
 * - One field per column with type-based default transforms
 * - mergeStrategy: append (default)
 */
export function autoGenerateRule(
  filePath: string,
  fileName: string,
  sheets: { index: number; name: string; rowCount: number }[],
  sheetIndex: number,
  headerRow: number,
  profiles: ColumnProfile[],
): RuleDefinition {
  const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
  const ruleName = `rule_${baseName}`.slice(0, 64);

  const primarySheet = sheets[sheetIndex] ?? sheets[0];
  if (!primarySheet) {
    throw new Error('No sheets available to auto-generate rule');
  }

  // Detect file extension pattern
  const ext = path.extname(filePath);
  const pattern = `**/*${ext}`;

  const source: RuleSource = {
    pattern,
    sheetIndex: primarySheet.index,
    sheetName: primarySheet.name,
    headerRow,
    dataRange: `A${headerRow + 1}:ZZ`,
  };

  // Map type guesses to default transforms
  const fields: FieldDefinition[] = profiles.map((p, i) => {
    const transforms: FieldDefinition['transforms'] = [];

    switch (p.typeGuess.primary) {
      case 'number':
      case 'cents':
        transforms.push({
          kind: 'coerce_number' as const,
          outputType: 'cents' as const,
          negativePattern: 'leading_dash' as const,
          thousandsSeparator: p.typeGuess.evidence.includes('千分位') ? ',' : undefined,
          aiRationale: `Auto-detected type: ${p.typeGuess.primary} (confidence: ${p.typeGuess.confidence}). Evidence: ${p.typeGuess.evidence}`,
        });
        break;
      case 'date':
        transforms.push({
          kind: 'coerce_date' as const,
          formats: ['YYYY/M/D', 'YYYY-MM-DD', 'YYYY年M月D日'],
          excelSerial: true,
          fallbackStrategy: 'null' as const,
          timezone: 'preserve' as const,
          aiRationale: `Auto-detected type: date (confidence: ${p.typeGuess.confidence}). Enabling Excel serial number auto-detection.`,
        });
        break;
      case 'string':
      default:
        transforms.push({
          kind: 'coerce_string' as const,
          trim: true,
          aiRationale: 'Auto-detected type: string. Trimming whitespace.',
        });
        break;
    }

    return {
      sourceHeader: p.headerText,
      outputName: p.headerText || `col_${p.colLetter}`,
      included: true,
      order: i + 1,
      transforms,
    };
  });

  return {
    name: ruleName,
    display: `提取规则: ${fileName}`,
    version: 1,
    sources: [source],
    fields,
    mergeStrategy: {
      mode: 'append',
    },
  };
}
