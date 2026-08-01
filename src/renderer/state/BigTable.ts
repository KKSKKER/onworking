import type { TypeGuess } from './TableConfig';

export interface BigTableField {
  name: string;
  type: TypeGuess;
  order: number;
}

export interface BigTableSettings {
  name: string;
  fields: BigTableField[];
}

export class BigTable {
  name: string;
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

  async load(): Promise<void> {
    const res = await window.onworking.api.call('workspace.readFile', { path: this.settingsPath });
    if (res.success && res.data) {
      const s = (res.data as { content: string }).content;
      try {
        const settings = JSON.parse(s) as BigTableSettings;
        this.name = settings.name;
        this.fields = settings.fields;
      } catch { /* settings.json may not exist yet */ }
    }
    const scanRes = await window.onworking.api.call('etl.scanDir', { dir: this.folderPath + '/source' });
    if (scanRes.success) this.sourceFiles = (scanRes.data as { path: string }[]).map(f => f.path);
    this.onChange();
  }

  async save(): Promise<void> {
    const settings: BigTableSettings = { name: this.name, fields: this.fields };
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
}
