// onworking/src/renderer/state/TableConfig.ts
// 每个 sheet 一个 TableConfig 实例 — 保存 sheet 配置（表头行、截止行、字段、规则名）
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
  sheetIndex: number;
  sheetName: string;
  headerRow = 1;
  endRow: number | null = null;   // 截止行(1-based 含);null=读到末尾
  merge = false;                  // 是否合并进数据表
  fields: TableField[] = [];
  saved = false;
  rulesDir = '';
  fileName = '';
  ruleBase = '';

  private onChange: () => void;
  private detectSeq = 0;

  constructor(opts: { filePath: string; sheetIndex: number; sheetName: string; onChange: () => void }) {
    this.filePath = opts.filePath;
    this.sheetIndex = opts.sheetIndex;
    this.sheetName = opts.sheetName;
    this.fileName = this.filePath.replace(/^.*[\\/]/, '');
    this.ruleBase = this.fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
    this.onChange = opts.onChange;
  }

  get ruleName(): string {
    return `rule_${this.ruleBase}_${this.sheetIndex + 1}`;
  }

  setHeaderRow(n: number): void {
    this.headerRow = n;
    this.saved = false;
    this.onChange();
  }

  setEndRow(n: number | null): void {
    this.endRow = n;
    this.saved = false;
    this.onChange();
  }

  setMerge(b: boolean): void {
    this.merge = b;
    this.saved = false;
    this.onChange();
  }

  setFieldType(i: number, t: TypeGuess): void {
    if (this.fields[i]) { this.fields[i].typeGuess = t; this.saved = false; this.onChange(); }
  }

  toggleField(i: number): void {
    if (this.fields[i]) { this.fields[i].included = !this.fields[i].included; this.saved = false; this.onChange(); }
  }

  setMappedField(i: number, field: string): void {
    if (this.fields[i]) { this.fields[i].mappedField = field; this.saved = false; this.onChange(); }
  }

  /** 加载已保存的规则(若存在);sheet 0 兼容旧版单 sheet 规则 */
  async load(): Promise<void> {
    const res = await window.onworking.api.call('rule.get', { name: this.ruleName, rulesDir: this.rulesDir || undefined });
    if (res.success) {
      this.loadFromRuleDefinition(res.data as RuleDefinition);
      return;
    }
    if (this.sheetIndex === 0) {
      const old = await window.onworking.api.call('rule.get', { name: `rule_${this.ruleBase}`, rulesDir: this.rulesDir || undefined });
      if (old.success) this.loadFromRuleDefinition(old.data as RuleDefinition);
    }
  }

  loadFromRuleDefinition(rule: RuleDefinition): void {
    const src = rule.sources[0];
    this.headerRow = src?.headerRow ?? this.headerRow;
    this.endRow = src?.endRow ?? null;
    this.merge = true;
    this.fields = rule.fields.map(f => ({
      sourceHeader: f.sourceHeader ?? '',
      outputName: f.outputName,
      included: f.included,
      mappedField: f.outputName || '',
      typeGuess: typeGuessFromTransforms(f.transforms),
    }));
    this.saved = true;
    this.onChange();
  }

  async detectFields(): Promise<void> {
    const seq = ++this.detectSeq;
    const res = await window.onworking.api.call('rule.autoGenerate', {
      file: this.filePath, sheetIndex: this.sheetIndex, headerRow: this.headerRow, save: false,
      rulesDir: this.rulesDir || undefined,
    });
    if (seq !== this.detectSeq) return;
    if (!res.success) return;
    const rule = (res.data as { rule: RuleDefinition }).rule;
    this.headerRow = rule.sources[0]?.headerRow ?? this.headerRow;
    this.fields = rule.fields.map(f => ({
      sourceHeader: f.sourceHeader ?? '',
      outputName: f.outputName,
      included: f.included,
      mappedField: f.outputName || '',
      typeGuess: typeGuessFromTransforms(f.transforms),
    }));
    this.saved = false;
    this.onChange();
  }

  toRuleDefinition(): RuleDefinition {
    return {
      name: this.ruleName,
      display: `提取规则: ${this.fileName} [${this.sheetName}]`,
      version: 1,
      sources: [{
        pattern: `**/${this.fileName}`,
        sheetIndex: this.sheetIndex,
        sheetName: this.sheetName,
        headerRow: this.headerRow,
        endRow: this.endRow ?? undefined,
      }],
      fields: this.fields.map((f, i) => ({
        sourceHeader: f.sourceHeader,
        outputName: f.mappedField || f.sourceHeader,
        included: f.included,
        order: i + 1,
        transforms: buildTransforms(f.typeGuess),
      })),
      mergeStrategy: { mode: 'append' },
    };
  }

  async save(): Promise<void> {
    if (this.merge && this.fields.length > 0) {
      const rule = this.toRuleDefinition();
      const params: Record<string, unknown> = { ...rule as unknown as Record<string, unknown> };
      if (this.rulesDir) params.rulesDir = this.rulesDir;
      await window.onworking.api.call('rule.save', params);
    } else {
      await window.onworking.api.call('rule.delete', { name: this.ruleName, rulesDir: this.rulesDir || undefined });
    }
    // 清理旧版单 sheet 规则(仅 sheet 0 负责)
    if (this.sheetIndex === 0) {
      await window.onworking.api.call('rule.delete', { name: `rule_${this.ruleBase}`, rulesDir: this.rulesDir || undefined });
    }
    this.saved = true;
    this.onChange();
  }
}
