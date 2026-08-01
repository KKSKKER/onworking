// onworking/src/renderer/state/TableConfig.ts
// 每个源文件一个 TableConfig 实例 — 保存文件配置（表头行、字段、规则名）
import type { RuleDefinition } from '../../common/types/etl-types';
import type { FieldTransform } from '../../common/types/transforms';

export type TypeGuess = 'string' | 'cents' | 'number' | 'date';

export interface TableField {
  sourceHeader: string;
  outputName: string;
  included: boolean;
  mappedField: string;  // references BigTable field name
  typeGuess: TypeGuess;
}

function typeGuessFromTransforms(transforms: FieldTransform[]): TypeGuess {
  const t = transforms[0];
  if (t?.kind === 'coerce_number') return (t as { outputType: string }).outputType as TypeGuess;
  if (t?.kind === 'coerce_date') return 'date';
  return 'string';
}

function buildTransforms(g: TypeGuess): FieldTransform[] {
  switch (g) {
    case 'cents':
      return [{ kind: 'coerce_number', outputType: 'cents', negativePattern: 'leading_dash' as const, aiRationale: '字段类型: 金额(分)' }];
    case 'number':
      return [{ kind: 'coerce_number', outputType: 'number', negativePattern: 'leading_dash' as const, aiRationale: '字段类型: 数字' }];
    case 'date':
      return [{ kind: 'coerce_date', formats: ['YYYY/M/D', 'YYYY-MM-DD', 'YYYY年M月D日'], excelSerial: true, fallbackStrategy: 'null' as const, timezone: 'preserve' as const, aiRationale: '字段类型: 日期' }];
    default:
      return [{ kind: 'coerce_string', trim: true, aiRationale: '字段类型: 文本' }];
  }
}

export class TableConfig {
  filePath: string;
  headerRow = 1;
  ruleName = '';
  sheetIndex = 0;
  fields: TableField[] = [];
  saved = false;
  rulesDir = '';  // BigTable folder's .onworking/rules/ path

  private onChange: () => void;
  private detectSeq = 0;
  private detectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: { filePath: string; onChange: () => void }) {
    this.filePath = opts.filePath;
    this.onChange = opts.onChange;
  }

  setHeaderRow(n: number): void {
    this.headerRow = n;
    this.saved = false;
    this.onChange();
    if (this.detectTimer) clearTimeout(this.detectTimer);
    this.detectTimer = setTimeout(() => this.detectFields(), 400);
  }

  setRuleName(n: string): void { this.ruleName = n; this.onChange(); }
  setFieldType(i: number, t: TypeGuess): void { if (this.fields[i]) { this.fields[i].typeGuess = t; this.saved = false; this.onChange(); } }
  toggleField(i: number): void { if (this.fields[i]) { this.fields[i].included = !this.fields[i].included; this.saved = false; this.onChange(); } }

  setMappedField(i: number, field: string): void {
    if (this.fields[i]) { this.fields[i].mappedField = field; this.saved = false; this.onChange(); }
  }

  async detectFields(): Promise<void> {
    const seq = ++this.detectSeq;
    const res = await window.onworking.api.call('rule.autoGenerate', {
      file: this.filePath, headerRow: this.headerRow, save: false,
      rulesDir: this.rulesDir || undefined,
    });
    if (seq !== this.detectSeq) return;
    if (!res.success) return;
    const data = res.data as { rule: RuleDefinition; savedTo: string | null };
    const rule = data.rule;
    this.ruleName = rule.name;
    this.headerRow = rule.sources[0]?.headerRow ?? this.headerRow;
    this.sheetIndex = rule.sources[0]?.sheetIndex ?? 0;
    this.fields = rule.fields.map(f => ({
      sourceHeader: f.sourceHeader ?? '',
      outputName: f.outputName,
      included: f.included,
      mappedField: f.outputName || '',  // try matching by name initially
      typeGuess: typeGuessFromTransforms(f.transforms),
    }));
    this.saved = false;
    this.onChange();
  }

  loadFromRuleDefinition(rule: RuleDefinition): void {
    this.ruleName = rule.name;
    this.headerRow = rule.sources[0]?.headerRow ?? this.headerRow;
    this.sheetIndex = rule.sources[0]?.sheetIndex ?? 0;
    this.fields = rule.fields.map(f => ({
      sourceHeader: f.sourceHeader ?? '',
      outputName: f.outputName,
      included: f.included,
      mappedField: f.outputName || '',  // outputName IS the mapped field
      typeGuess: typeGuessFromTransforms(f.transforms),
    }));
    this.saved = true;
    this.onChange();
  }

  toRuleDefinition(): RuleDefinition {
    const fileName = this.filePath.replace(/^.*[\\/]/, '');
    const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
    const name = this.ruleName || `rule_${baseName}`;
    return {
      name, display: `提取规则: ${fileName}`, version: 1,
      sources: [{ pattern: `**/${fileName}`, sheetIndex: this.sheetIndex, headerRow: this.headerRow }],
      fields: this.fields.map((f, i) => ({
        sourceHeader: f.sourceHeader,
        outputName: f.mappedField || f.sourceHeader,  // mapped field name = output column
        included: f.included,
        order: i + 1,
        transforms: buildTransforms(f.typeGuess),
      })),
      mergeStrategy: { mode: 'append' },
    };
  }

  async save(): Promise<void> {
    const rule = this.toRuleDefinition();
    const params: Record<string, unknown> = { ...rule as unknown as Record<string, unknown> };
    if (this.rulesDir) params.rulesDir = this.rulesDir;
    await window.onworking.api.call('rule.save', params);
    this.saved = true;
    this.onChange();
  }
}
