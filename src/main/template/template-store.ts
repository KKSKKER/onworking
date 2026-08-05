// onworking/src/main/template/template-store.ts
// 复制格式模板 — YAML 读写,目录由调用方(大表)指定,只检索该大表。
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { t } from '../../common/i18n';

export interface TemplateMapping {
  source: string;
  target: string;
}

export interface TemplateDefinition {
  name: string;
  mappings: TemplateMapping[];
}

export class TemplateStore {
  constructor(private templateDir: string) {}

  private ensureDir(): void {
    if (!fs.existsSync(this.templateDir)) fs.mkdirSync(this.templateDir, { recursive: true });
  }

  private filePath(name: string): string {
    return path.join(this.templateDir, `template_${name}.yaml`);
  }

  /** 清洗模板名:去首尾空格、把非法文件名字符替换为 `_`;空名抛错。 */
  static sanitizeName(name: string): string {
    const cleaned = name.trim().replace(/[\\/:*?"<>|]/g, '_');
    if (!cleaned) throw new Error(t('copyFormat.nameRequired'));
    return cleaned;
  }

  load(name: string): TemplateDefinition {
    const filePath = this.filePath(name);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const def = yaml.load(raw) as TemplateDefinition;
    return { name: def?.name ?? name, mappings: def?.mappings ?? [] };
  }

  list(): TemplateDefinition[] {
    this.ensureDir();
    return fs.readdirSync(this.templateDir)
      .filter(f => f.startsWith('template_') && f.endsWith('.yaml'))
      .map(f => {
        const name = f.replace(/^template_/, '').replace(/\.yaml$/, '');
        try {
          return this.load(name);
        } catch {
          // 损坏文件不阻塞列表,降级为仅按文件名展示
          return { name, mappings: [] };
        }
      })
      .filter(d => d.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }

  save(name: string, mappings: TemplateMapping[]): void {
    const safe = TemplateStore.sanitizeName(name);
    this.ensureDir();
    const def: TemplateDefinition = { name: safe, mappings };
    fs.writeFileSync(this.filePath(safe), yaml.dump(def, {
      indent: 2, lineWidth: 120, quotingType: '"', forceQuotes: false,
    }), 'utf-8');
  }

  delete(name: string): void {
    const safe = TemplateStore.sanitizeName(name);
    this.ensureDir();
    fs.rmSync(this.filePath(safe), { force: true });
  }
}
