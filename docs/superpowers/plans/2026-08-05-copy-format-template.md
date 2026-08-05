# 复制格式(模板保存与应用)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在视图一的映射视图(`RuleEditor`)顶部新增单行紧凑「复制格式」条:把当前映射保存为模板(存 `<大表>/.onworking/template/`),并能把模板应用到当前映射(先取消全选,再逐条匹配源字段→大表字段)。

**Architecture:** 仿 `rule.*` 模块。主进程新增 `TemplateStore`(YAML 读写,目录由 `dir` 参数指定)+ `template.list/save/delete` 三条路由(在 `initModules` 注册);renderer 新增 `CopyFormat` 组件挂在 `RuleEditor` 顶部,保存/应用逻辑落在 `TableConfig.templateMappings()` / `TableConfig.applyTemplate()`(纯逻辑,可被 vitest 直接测)。

**Tech Stack:** Electron + React + TypeScript + js-yaml + Vite + Vitest

## Global Constraints

- 模板目录固定为 `<大表目录>/.onworking/template/`,只检索当前大表,不跨大表。
- 模板文件名:`template_<模板名>.yaml`;同名直接覆盖,不弹确认。
- 模板名来源:界面输入框,预填当前源文件名(去扩展名),可改。
- 应用逻辑:先 `setAllIncluded(false)` 取消全选;逐条二元组匹配第一个 `sourceHeader === 源字段` **且尚未匹配(`included=false`)** 的字段;目标字段在 `validTargets` 内才应用,否则跳过。
- 文案一律走 `t()` + `zh.json`/`en.json`,禁止硬编码中文;禁止模块顶层调用 `t()`(记忆约束)。
- 应用后不自动保存规则(仍走原「保存规则」按钮)。
- 所有 `window.onworking.api.call` 返回 `{ success: boolean; data?: unknown; error?: string }`,调用处要先判 `success`。

---

### Task 1: `TemplateStore`(主进程)+ 单元测试

**Files:**
- Create: `src/main/template/template-store.ts`
- Test: `tests/template-store.test.ts`

**Interfaces:**
- Consumes: 无(仅 node:fs / node:path / js-yaml / i18n `t`)
- Produces: 供 Task 2 使用
  - `interface TemplateMapping { source: string; target: string }`
  - `interface TemplateDefinition { name: string; mappings: TemplateMapping[] }`
  - `class TemplateStore { constructor(templateDir: string); list(): TemplateDefinition[]; load(name: string): TemplateDefinition; save(name: string, mappings: TemplateMapping[]): void; delete(name: string): void; static sanitizeName(name: string): string }`

- [ ] **Step 1: 写失败测试** `tests/template-store.test.ts`

```ts
import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TemplateStore } from '../src/main/template/template-store';

const dirs: string[] = [];
function makeStore(): TemplateStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onw-tpl-'));
  dirs.push(dir);
  return new TemplateStore(path.join(dir, 'template'));
}
afterEach(() => {
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* 忽略 */ } }
  dirs.length = 0;
});

describe('TemplateStore', () => {
  it('lists empty when the dir has no templates', () => {
    expect(makeStore().list()).toEqual([]);
  });

  it('saves and lists a template', () => {
    const s = makeStore();
    s.save('发票模板', [{ source: '数电发票号码', target: '发票代码' }, { source: '金额', target: '金额' }]);
    const list = s.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      name: '发票模板',
      mappings: [{ source: '数电发票号码', target: '发票代码' }, { source: '金额', target: '金额' }],
    });
  });

  it('overwrites a template with the same name', () => {
    const s = makeStore();
    s.save('t', [{ source: 'a', target: 'b' }]);
    s.save('t', [{ source: 'c', target: 'd' }]);
    expect(s.list()).toHaveLength(1);
    expect(s.list()[0].mappings).toEqual([{ source: 'c', target: 'd' }]);
  });

  it('deletes a template', () => {
    const s = makeStore();
    s.save('t', []);
    expect(s.list()).toHaveLength(1);
    s.delete('t');
    expect(s.list()).toEqual([]);
  });

  it('sanitizes illegal filename characters and rejects empty names', () => {
    const s = makeStore();
    s.save('a/b\\c:d', []);
    expect(s.list().map(d => d.name)).toEqual(['a_b_c_d']);
    expect(() => s.save('   ', [])).toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/template-store.test.ts`
Expected: FAIL — 找不到 `../src/main/template/template-store` 模块。

- [ ] **Step 3: 实现 `src/main/template/template-store.ts`**

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/template-store.test.ts`
Expected: PASS — 5 个用例全绿。

- [ ] **Step 5: 提交**

```bash
git add src/main/template/template-store.ts tests/template-store.test.ts
git commit -m "feat(template): TemplateStore — 大表模板 YAML 读写(list/save/delete)"
```

---

### Task 2: `template.*` 路由 + 注册到主进程

**Files:**
- Create: `src/main/template/routes.ts`
- Modify: `src/main/index.ts:97-108`(`initModules` 函数体内)
- Test: `tests/template-routes.test.ts`

**Interfaces:**
- Consumes: `TemplateStore`(Task 1), `APIRouter`(已有)
- Produces: 供 Task 4 使用
  - `registerTemplateRoutes(router: APIRouter): void` — 注册 `template.list`(`{ dir }` → `TemplateDefinition[]`)、`template.save`(`{ dir, name, mappings }` → `{ ok: true }`)、`template.delete`(`{ dir, name }` → `{ ok: true }`),均带 `dir` 参数按需建 store。

- [ ] **Step 1: 写失败测试** `tests/template-routes.test.ts`

```ts
import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { APIRouter } from '../src/main/api/router';
import { registerTemplateRoutes } from '../src/main/template/routes';

const dirs: string[] = [];
function tmpTemplateDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'onw-rt-'));
  dirs.push(d);
  return path.join(d, 'template');
}
afterEach(() => {
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* 忽略 */ } }
  dirs.length = 0;
});

describe('template routes', () => {
  const router = new APIRouter();
  registerTemplateRoutes(router);

  it('saves and lists templates', async () => {
    const dir = tmpTemplateDir();
    const save = await router.call('template.save', {
      dir, name: '发票模板', mappings: [{ source: '金额', target: '金额' }],
    });
    expect(save).toEqual({ ok: true });
    const list = await router.call('template.list', { dir }) as { name: string; mappings: { source: string; target: string }[] }[];
    expect(list).toEqual([{ name: '发票模板', mappings: [{ source: '金额', target: '金额' }] }]);
  });

  it('deletes a template', async () => {
    const dir = tmpTemplateDir();
    await router.call('template.save', { dir, name: 't', mappings: [] });
    await router.call('template.delete', { dir, name: 't' });
    expect(await router.call('template.list', { dir })).toEqual([]);
  });

  it('lists empty when dir does not exist yet', async () => {
    expect(await router.call('template.list', { dir: path.join(os.tmpdir(), 'onw-rt-missing-xxx') })).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/template-routes.test.ts`
Expected: FAIL — 找不到 `../src/main/template/routes`。

- [ ] **Step 3: 实现 `src/main/template/routes.ts`**

```ts
// onworking/src/main/template/routes.ts
import * as fs from 'node:fs';
import type { APIRouter } from '../api/router';
import { TemplateStore, TemplateMapping } from './template-store';

export function registerTemplateRoutes(router: APIRouter): void {
  function getStore(dir: string): TemplateStore {
    fs.mkdirSync(dir, { recursive: true });
    return new TemplateStore(dir);
  }

  router.register('template.list', async (params) => {
    const { dir } = (params || {}) as { dir?: string };
    if (!dir) return [];
    return getStore(dir).list();
  }, { description: 'List templates (with mappings) in a big table' });

  router.register('template.save', async (params) => {
    const { dir, name, mappings } = params as { dir: string; name: string; mappings: TemplateMapping[] };
    getStore(dir).save(name, mappings ?? []);
    return { ok: true };
  }, { description: 'Save a template to a big table (overwrite allowed)' });

  router.register('template.delete', async (params) => {
    const { dir, name } = params as { dir: string; name: string };
    getStore(dir).delete(name);
    return { ok: true };
  }, { description: 'Delete a template from a big table' });
}
```

- [ ] **Step 4: 修改 `src/main/index.ts`** 注册路由

在文件顶部 import 区(现有 `registerRuleRoutes` import 附近)加:

```ts
import { registerTemplateRoutes } from './template/routes';
```

在 `initModules` 函数体内、`registerRuleRoutes(apiRouter, ws.rulesDir);` 之后加一行:

```ts
registerTemplateRoutes(apiRouter);
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/template-routes.test.ts`
Expected: PASS — 3 个用例全绿。

- [ ] **Step 6: 提交**

```bash
git add src/main/template/routes.ts src/main/index.ts tests/template-routes.test.ts
git commit -m "feat(template): 注册 template.list/save/delete 路由并挂载到主进程"
```

---

### Task 3: `TableConfig` 新增 `setIncluded` / `templateMappings` / `applyTemplate`

**Files:**
- Modify: `src/renderer/state/TableConfig.ts`(在 `setMappedField` 方法后追加三个方法)
- Test: `tests/table-config.test.ts`(追加 `describe` 块)

**Interfaces:**
- Consumes: 已有 `fields: TableField[]`(`sourceHeader` / `included` / `mappedField`)、`setAllIncluded(checked)`、`setMappedField(i, field)`、`onChange()`
- Produces: 供 Task 4 使用
  - `setIncluded(i: number, b: boolean): void`
  - `templateMappings(): Array<[string, string]>`
  - `applyTemplate(mappings: Array<[string, string]>, validTargets: string[]): { matched: number; skipped: number }`

- [ ] **Step 1: 写失败测试** 追加到 `tests/table-config.test.ts` 末尾(复用现有 `makeConfig()` helper)

```ts
describe('TableConfig.templateMappings', () => {
  function withFields(): TableConfig {
    const cfg = makeConfig();
    cfg.fields = [
      { sourceHeader: '发票号码', outputName: '', included: false, mappedField: '', typeGuess: 'string' },
      { sourceHeader: '数电发票号码', outputName: '', included: true, mappedField: '发票代码', typeGuess: 'string' },
      { sourceHeader: '金额', outputName: '', included: true, mappedField: '金额', typeGuess: 'cents' },
      { sourceHeader: '税额', outputName: '', included: false, mappedField: '', typeGuess: 'string' },
    ];
    return cfg;
  }

  it('only includes checked fields with a mapping', () => {
    expect(withFields().templateMappings()).toEqual([['数电发票号码', '发票代码'], ['金额', '金额']]);
  });
});

describe('TableConfig.applyTemplate', () => {
  function withFields(): TableConfig {
    const cfg = makeConfig();
    cfg.fields = [
      { sourceHeader: '发票号码', outputName: '', included: false, mappedField: '', typeGuess: 'string' },
      { sourceHeader: '数电发票号码', outputName: '', included: true, mappedField: '发票代码', typeGuess: 'string' },
      { sourceHeader: '金额', outputName: '', included: true, mappedField: '金额', typeGuess: 'cents' },
    ];
    return cfg;
  }

  it('unchecks all fields first', () => {
    const cfg = withFields();
    cfg.applyTemplate([], ['发票代码', '金额']);
    expect(cfg.fields.map(f => f.included)).toEqual([false, false, false]);
  });

  it('matches source fields and links to target', () => {
    const cfg = withFields();
    const result = cfg.applyTemplate([['数电发票号码', '发票代码'], ['金额', '金额']], ['发票代码', '金额']);
    expect(result).toEqual({ matched: 2, skipped: 0 });
    expect(cfg.fields[1]).toMatchObject({ included: true, mappedField: '发票代码' });
    expect(cfg.fields[2]).toMatchObject({ included: true, mappedField: '金额' });
  });

  it('skips tuples whose target is not in the big table', () => {
    const cfg = withFields();
    const result = cfg.applyTemplate([['金额', '不存在的字段']], ['发票代码']);
    expect(result).toEqual({ matched: 0, skipped: 1 });
    expect(cfg.fields[2].included).toBe(false);
  });

  it('skips tuples whose source field does not exist', () => {
    const cfg = withFields();
    const result = cfg.applyTemplate([['不存在的源字段', '金额']], ['金额']);
    expect(result).toEqual({ matched: 0, skipped: 1 });
  });

  it('matches the first field only when a source repeats', () => {
    const cfg = withFields();
    const result = cfg.applyTemplate(
      [['数电发票号码', '发票代码'], ['数电发票号码', '销方识别号']],
      ['发票代码', '销方识别号'],
    );
    expect(result).toEqual({ matched: 1, skipped: 1 });
    expect(cfg.fields[1].mappedField).toBe('发票代码');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/table-config.test.ts`
Expected: FAIL — `templateMappings` / `applyTemplate` 不是函数。

- [ ] **Step 3: 实现三个方法** 追加到 `src/renderer/state/TableConfig.ts` 的 `setMappedField` 方法之后、`setAllIncluded` 之前

```ts
  setIncluded(i: number, b: boolean): void {
    if (this.fields[i]) { this.fields[i].included = b; this.saved = false; this.onChange(); }
  }

  /** 提取当前勾选且已映射的字段,作为模板二元组 [源字段, 大表字段]。 */
  templateMappings(): Array<[string, string]> {
    return this.fields
      .filter(f => f.included && f.mappedField)
      .map(f => [f.sourceHeader, f.mappedField] as [string, string]);
  }

  /**
   * 应用模板:先取消全选,再逐条二元组匹配第一个 sourceHeader 相同且尚未匹配的字段;
   * 目标字段在 validTargets 内才应用,否则跳过。
   * 返回 { matched, skipped },并置 saved=false + onChange()。
   */
  applyTemplate(mappings: Array<[string, string]>, validTargets: string[]): { matched: number; skipped: number } {
    this.setAllIncluded(false);
    let matched = 0;
    let skipped = 0;
    for (const [src, tgt] of mappings) {
      const idx = this.fields.findIndex(f => f.sourceHeader === src && !f.included);
      if (idx < 0 || !validTargets.includes(tgt)) { skipped++; continue; }
      this.setMappedField(idx, tgt);
      this.setIncluded(idx, true);
      matched++;
    }
    return { matched, skipped };
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/table-config.test.ts`
Expected: PASS — 现有用例 + 新增用例全绿。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/state/TableConfig.ts tests/table-config.test.ts
git commit -m "feat(template): TableConfig.templateMappings/applyTemplate — 保存提取与应用逻辑"
```

---

### Task 4: `CopyFormat` 组件 + i18n + `RuleEditor` 接线

**Files:**
- Create: `src/renderer/components/CopyFormat.tsx`
- Modify: `src/renderer/components/RuleEditor.tsx:1-8`(import)与 `:42-44`(return 根 div 内第一行)
- Modify: `i18n/zh.json`、`i18n/en.json`(各加 `copyFormat` 顶层对象)

**Interfaces:**
- Consumes: `TableConfig.templateMappings` / `applyTemplate`(Task 3)、`useBigTableStore`(已有,暴露 `selectedFolder` / `workspaceRoot`)、`template.list/save/delete` 路由(Task 2)、`t()`(已有)
- Produces: 无(终态组件)

- [ ] **Step 1: 给 `i18n/zh.json` 加 `copyFormat` 对象**

在 `ruleEditor` 顶层对象闭合的 `}` 之后、`view2` 键之前(即 `"autoDetectHint"` 值后的 `}` 与 `"view2": {` 之间)插入顶层键:

```json
  "copyFormat": {
    "title": "复制格式",
    "templateName": "模板名",
    "saveTemplate": "保存模板",
    "selectPlaceholder": "选择模板...",
    "applyTemplate": "应用",
    "deleteTemplate": "删除",
    "confirmDelete": "确认删除?",
    "noBigTable": "请先选择大表",
    "saved": "已保存模板「{name}」",
    "applied": "已应用模板「{name}」:匹配 {matched} / {total} 条",
    "nothingToSave": "没有可保存的映射(未勾选字段或未选择映射)",
    "noTemplates": "暂无模板",
    "nameRequired": "请输入模板名"
  },
```

插入后用 `node -e "JSON.parse(require('fs').readFileSync('i18n/zh.json','utf8'))"` 校验 JSON 合法。

- [ ] **Step 2: 给 `i18n/en.json` 加 `copyFormat` 对象**(同样位置)

```json
  "copyFormat": {
    "title": "Copy Format",
    "templateName": "Template name",
    "saveTemplate": "Save template",
    "selectPlaceholder": "Select template...",
    "applyTemplate": "Apply",
    "deleteTemplate": "Delete",
    "confirmDelete": "Confirm delete?",
    "noBigTable": "Select a table first",
    "saved": "Saved template \"{name}\"",
    "applied": "Applied \"{name}\": {matched} / {total} matched",
    "nothingToSave": "Nothing to save (no fields selected or mapped)",
    "noTemplates": "No templates",
    "nameRequired": "Enter a template name"
  },
```

插入后用同样的 `JSON.parse` 校验 en.json 合法。

- [ ] **Step 3: 实现 `src/renderer/components/CopyFormat.tsx`**

```tsx
// onworking/src/renderer/components/CopyFormat.tsx
// 复制格式:把当前映射保存为模板,或把模板应用到当前映射(仅当前大表)。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TableConfig } from '../state/TableConfig';
import { useBigTableStore } from '../state/BigTableStore';
import { t } from '../../common/i18n';

interface TemplateDef {
  name: string;
  mappings: { source: string; target: string }[];
}

interface CopyFormatProps {
  config: TableConfig;
  bigTableFields: string[];
}

export const CopyFormat: React.FC<CopyFormatProps> = ({ config, bigTableFields }) => {
  const { selectedFolder, workspaceRoot } = useBigTableStore();
  const templateDir = selectedFolder ? `${workspaceRoot}/${selectedFolder}/.onworking/template` : '';
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<TemplateDef[]>([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [armedDelete, setArmedDelete] = useState(false);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 预填模板名:当前源文件名去扩展名
  useEffect(() => {
    setTemplateName(config.filePath.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, ''));
  }, [config.filePath]);

  // 切换大表 → 刷新模板列表
  useEffect(() => {
    setTemplates([]);
    setSelected('');
    setArmedDelete(false);
    if (!templateDir) return;
    window.onworking.api.call('template.list', { dir: templateDir }).then(res => {
      if (res.success) setTemplates((res.data as TemplateDef[]) ?? []);
    });
  }, [templateDir]);

  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMessage(''), 4000);
  }, []);

  const refresh = useCallback(async () => {
    if (!templateDir) return;
    const res = await window.onworking.api.call('template.list', { dir: templateDir });
    if (res.success) setTemplates((res.data as TemplateDef[]) ?? []);
  }, [templateDir]);

  const saveTemplate = async () => {
    if (!templateDir) { showMessage(t('copyFormat.noBigTable')); return; }
    const name = templateName.trim();
    if (!name) { showMessage(t('copyFormat.nameRequired')); return; }
    const mappings = config.templateMappings();
    if (mappings.length === 0) { showMessage(t('copyFormat.nothingToSave')); return; }
    const res = await window.onworking.api.call('template.save', {
      dir: templateDir, name,
      mappings: mappings.map(([source, target]) => ({ source, target })),
    });
    if (!res.success) { showMessage(String(res.error ?? '')); return; }
    setSelected(name);
    await refresh();
    showMessage(t('copyFormat.saved', { name }));
  };

  const applyTemplate = async () => {
    if (!templateDir) { showMessage(t('copyFormat.noBigTable')); return; }
    if (!selected) { showMessage(t('copyFormat.selectPlaceholder')); return; }
    const def = templates.find(d => d.name === selected);
    if (!def) return;
    const mappings = def.mappings.map(m => [m.source, m.target] as [string, string]);
    const { matched, skipped } = config.applyTemplate(mappings, bigTableFields);
    showMessage(t('copyFormat.applied', { name: selected, matched: matched, total: matched + skipped }));
  };

  const handleDelete = async () => {
    if (!templateDir || !selected) return;
    if (!armedDelete) {
      setArmedDelete(true);
      setTimeout(() => setArmedDelete(false), 2500);
      return;
    }
    const res = await window.onworking.api.call('template.delete', { dir: templateDir, name: selected });
    if (res.success) {
      setSelected('');
      await refresh();
      showMessage('');
    }
    setArmedDelete(false);
  };

  const btnStyle: React.CSSProperties = {
    padding: '2px 10px', border: '1px solid #ccc', borderRadius: 3, background: '#fff', cursor: 'pointer', fontSize: 12,
  };
  const primaryStyle: React.CSSProperties = { ...btnStyle, background: '#007acc', color: '#fff', borderColor: '#007acc' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #eee', fontSize: 12 }}>
      <span style={{ color: '#666' }}>{t('copyFormat.title')}</span>
      {!templateDir ? (
        <span style={{ color: '#999' }}>{t('copyFormat.noBigTable')}</span>
      ) : (
        <>
          <input value={templateName} onChange={e => setTemplateName(e.target.value)}
            placeholder={t('copyFormat.templateName')} style={{ width: 160, padding: '2px 6px', fontSize: 12 }} />
          <button onClick={saveTemplate} style={primaryStyle}>{t('copyFormat.saveTemplate')}</button>
          <select value={selected} onChange={e => setSelected(e.target.value)} style={{ padding: '2px 6px', fontSize: 12, width: 150 }}>
            <option value="">{t('copyFormat.selectPlaceholder')}</option>
            {templates.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
          <button onClick={applyTemplate} disabled={!selected} style={btnStyle}>{t('copyFormat.applyTemplate')}</button>
          <button onClick={handleDelete} disabled={!selected} style={{ ...btnStyle, color: armedDelete ? '#d33' : 'inherit' }}>
            {armedDelete ? t('copyFormat.confirmDelete') : t('copyFormat.deleteTemplate')}
          </button>
          {message && <span style={{ color: '#007acc' }}>{message}</span>}
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 4: 接线到 `RuleEditor.tsx`**

在 import 区(`import { SearchableSelect } ...` 附近)加:

```ts
import { CopyFormat } from './CopyFormat';
```

在 return 的根 `<div style={{ fontSize: 12, padding: 8 }}>` 之后、sheet 选择行的 `<div style={{ marginBottom: 8, display: 'flex', ... }}>` **之前**,插入:

```tsx
      <CopyFormat config={config} bigTableFields={bigTableFields} />
```

(注:`bigTableFields` 变量在 `RuleEditor` 中已存在:`const bigTableFields = bigTable?.fields.map(f => f.name) ?? [];`)

- [ ] **Step 5: 校验**

Run: `npm run typecheck`
Expected: 无类型错误(renderer 与 main 均通过)。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/components/CopyFormat.tsx src/renderer/components/RuleEditor.tsx i18n/zh.json i18n/en.json
git commit -m "feat(view1): 映射视图顶部新增复制格式条 — 保存/应用/删除大表模板"
```

---

## 全量验证(收尾)

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 全部通过(含 `tests/smoke.test.ts`、既有 `table-config.test.ts` 等)。

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 3: 手工冒烟(可选,dev 起应用)**

Run: `npm start`,打开一个大表 → 选一个源文件 → 自动检测字段 → 勾选并映射几列 → 顶部「复制格式」输入框已预填文件名 → 点「保存模板」看到「已保存模板…」;切换到另一个源文件 → 下拉选模板 → 点「应用」看到「已应用…匹配 N/M 条」,字段表格中对应行被勾选并链接到目标字段。
