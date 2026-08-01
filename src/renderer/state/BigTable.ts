import type { TypeGuess } from './TableConfig';

export interface BigTableField {
  name: string;
  type: TypeGuess;
  order: number;
  isPrimaryKey?: boolean;
}

export interface BigTableSettings {
  name: string;
  tableName: string;
  autoIncrementId: boolean;
  fields: BigTableField[];
}

export class BigTable {
  name: string;
  tableName = '';
  autoIncrementId = true;
  folderPath: string;
  fields: BigTableField[] = [];
  sourceFiles: string[] = [];
  private onChange: () => void;

  constructor(opts: { name: string; folderPath: string; onChange: () => void }) {
    this.name = opts.name;
    this.folderPath = opts.folderPath;
    this.onChange = opts.onChange;
  }

  get settingsPath(): string { return this.folderPath + '/settings.json'; }

  get primaryKeyFields(): BigTableField[] {
    return this.fields.filter(f => f.isPrimaryKey);
  }

  /** Validate: if autoIncrementId is off, must have at least one primary key */
  validate(): string | null {
    if (!this.autoIncrementId && this.primaryKeyFields.length === 0) {
      return '未启用自增主键时必须至少设置一个主键字段';
    }
    if (!this.tableName.trim()) {
      return '请输入表名';
    }
    return null;
  }

  async load(): Promise<void> {
    const res = await window.onworking.api.call('workspace.readFile', { path: this.settingsPath });
    if (res.success && res.data) {
      const s = (res.data as { content: string }).content;
      try {
        const settings = JSON.parse(s) as BigTableSettings;
        this.name = settings.name;
        this.tableName = settings.tableName || '';
        this.autoIncrementId = settings.autoIncrementId !== false;
        this.fields = settings.fields || [];
      } catch { /* settings.json may not exist yet */ }
    }
    const scanRes = await window.onworking.api.call('etl.scanDir', { dir: this.folderPath + '/source' });
    if (scanRes.success) this.sourceFiles = (scanRes.data as { path: string }[]).map(f => f.path);
    this.onChange();
  }

  async save(): Promise<void> {
    const settings: BigTableSettings = {
      name: this.name,
      tableName: this.tableName,
      autoIncrementId: this.autoIncrementId,
      fields: this.fields,
    };
    await window.onworking.api.call('workspace.writeFile', {
      path: this.settingsPath,
      content: JSON.stringify(settings, null, 2),
    });
    this.onChange();
  }

  addField(name: string, type: TypeGuess): void {
    if (this.fields.find(f => f.name === name)) return;
    this.fields.push({ name, type, order: this.fields.length + 1 });
    this.onChange();
  }

  removeField(name: string): void {
    this.fields = this.fields.filter(f => f.name !== name);
    this.onChange();
  }

  reorderField(name: string, newOrder: number): void {
    const idx = this.fields.findIndex(f => f.name === name);
    if (idx < 0) return;
    const [field] = this.fields.splice(idx, 1);
    this.fields.splice(newOrder - 1, 0, field);
    this.fields.forEach((f, i) => { f.order = i + 1; });
    this.onChange();
  }

  setFieldType(name: string, type: TypeGuess): void {
    const f = this.fields.find(f => f.name === name);
    if (f) { f.type = type; this.onChange(); }
  }

  setPrimaryKey(name: string, isPK: boolean): void {
    const f = this.fields.find(f => f.name === name);
    if (f) { f.isPrimaryKey = isPK; this.onChange(); }
  }
}
