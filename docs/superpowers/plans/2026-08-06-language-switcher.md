# 顶栏语言切换 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在顶栏(TopBar)加「语言」下拉选择器,选中即写 `language.json` 并自动重启应用,重启后界面与菜单按新语言显示。

**Architecture:** 复用现有 i18n 双目录(`i18n/zh.json`/`i18n/en.json`)与 `language.json` 持久化机制。主进程新增 `app:setLanguage` IPC(写文件路径镜像读取优先级,然后 `app.relaunch()` + `app.exit(0)`);可测的归一化与写文件逻辑抽成纯函数 `src/main/lang.ts`;渲染层 TopBar 用 `getLanguage()` 显示当前语言、`setLanguage()` 触发切换。

**Tech Stack:** Electron 31、React 18、TypeScript 5.6、vitest 2.1(node 环境,纯函数单测)。

**Spec:** `onworking/docs/superpowers/specs/2026-08-06-language-switcher-design.md`

## Global Constraints

- 铁律:**禁止在模块顶层调用 `t()`**——只能在组件/函数体内调用(ESM 求值顺序会让 catalog 未装载,渲染成裸 key;TopBar 现有 `TABS` 常量存 key 而非渲染好的词,即为此)。
- i18n key 必须**同步更新** `i18n/zh.json` 与 `i18n/en.json` 两个文件,缺一会在另一语言露出裸 key。
- 语言归一化唯一真源:`pickLanguage(value)` 只认 `'en'`,其余一律 `'zh'`。
- 写路径优先级镜像读路径:打包版 → `app.getPath('userData')/language.json`,dev → `__dirname/../../../language.json`(= `onworking/language.json`)。
- 不新增依赖;不改 `onworking/language.json` 的 git 跟踪状态。
- 测试用 vitest,`environment: 'node'`,临时目录模式参照 `tests/workspace-launch.test.ts`。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `i18n/zh.json`、`i18n/en.json` | 修改 | 各加 `lang.zhName`、`lang.enName`、`topBar.language` 三个 key |
| `src/main/lang.ts` | 创建 | 纯函数:`pickLanguage`(归一化)、`writeLanguageFile`(同步写 JSON) |
| `src/main/index.ts` | 修改 | `resolveLanguage` 复用 `pickLanguage`;`setupIPC` 新增 `app:setLanguage` handler |
| `src/main/preload.ts` | 修改 | `onworking` 暴露 `setLanguage` |
| `src/renderer/global.d.ts` | 修改 | `onworking` 类型补 `setLanguage` |
| `src/renderer/components/TopBar.tsx` | 修改 | 右侧加「语言」标签 + 下拉选择器 |
| `tests/i18n-lang-switcher.test.ts` | 创建 | 双目录下三个新 key 的 `t()` 解析 |
| `tests/lang.test.ts` | 创建 | `pickLanguage`、`writeLanguageFile` 纯函数单测 |

---

### Task 1: 新增 i18n key(zh/en 同步)

**Files:**
- Modify: `onworking/i18n/zh.json`
- Modify: `onworking/i18n/en.json`
- Test: `onworking/tests/i18n-lang-switcher.test.ts`

**Interfaces:**
- Consumes: `t(key)` / `setCatalog(catalog)` 来自 `src/common/i18n.ts`。
- Produces: 三个 key —— `lang.zhName`、`lang.enName`、`topBar.language`;Task 4 的 TopBar 用 `t()` 读取它们。

- [ ] **Step 1: 写失败测试**

创建 `tests/i18n-lang-switcher.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { t, setCatalog } from '../src/common/i18n';
import zh from '../i18n/zh.json';
import en from '../i18n/en.json';

describe('语言切换 key', () => {
  it('lang.zhName / lang.enName 双目录下均母语自指', () => {
    setCatalog(zh);
    expect(t('lang.zhName')).toBe('中文');
    expect(t('lang.enName')).toBe('English');
    setCatalog(en);
    expect(t('lang.zhName')).toBe('中文');
    expect(t('lang.enName')).toBe('English');
  });
  it('topBar.language 在 zh / en 下分别解析', () => {
    setCatalog(zh);
    expect(t('topBar.language')).toBe('语言');
    setCatalog(en);
    expect(t('topBar.language')).toBe('Language');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd onworking && npx vitest run tests/i18n-lang-switcher.test.ts`

Expected: FAIL——`t('lang.zhName')` 返回裸 key `'lang.zhName'`(目录里还没有这些 key),`toBe('中文')` 断言不过。

- [ ] **Step 3: 加 key 让测试通过**

在 `i18n/zh.json` 顶部(命名空间保持现有风格)增加:

```json
  "lang": {
    "zhName": "中文",
    "enName": "English"
  },
```

并在已有 `topBar` 命名空间内增加 `"language": "语言"`。

在 `i18n/en.json` 同样位置增加:

```json
  "lang": {
    "zhName": "中文",
    "enName": "English"
  },
```

`topBar` 命名空间内增加 `"language": "Language"`。

> 注意:两个文件都必须改——`lang.*` 两文件同值(母语自指),`topBar.language` 两文件不同值。只改一个会破坏另一语言。
> 若 `zh.json`/`en.json` 中 `topBar` 命名空间不存在,则新建一个顶层 `topBar` 对象;存在则在其内追加字段。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd onworking && npx vitest run tests/i18n-lang-switcher.test.ts`

Expected: 2 个测试全 PASS。

- [ ] **Step 5: 提交**

```bash
git add onworking/i18n/zh.json onworking/i18n/en.json onworking/tests/i18n-lang-switcher.test.ts
git commit -m "feat(i18n): 新增语言切换 key(母语自指 + 语言标签)"
```

---

### Task 2: 主进程纯函数 `lang.ts` + `app:setLanguage` IPC

**Files:**
- Create: `onworking/src/main/lang.ts`
- Modify: `onworking/src/main/index.ts`(`resolveLanguage` 复用 `pickLanguage`;`setupIPC` 加 handler)
- Test: `onworking/tests/lang.test.ts`

**Interfaces:**
- Consumes: `pickLanguage`/`writeLanguageFile` 由本任务定义并产出。
- Produces: `pickLanguage(value: unknown): 'zh' | 'en'`、`writeLanguageFile(filePath: string, lang: 'zh'|'en'): void`;Task 4 通过 `window.onworking.setLanguage` 触发 `app:setLanguage`。

- [ ] **Step 1: 写失败测试**

创建 `tests/lang.test.ts`(临时目录模式照 `tests/workspace-launch.test.ts`):

```ts
import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pickLanguage, writeLanguageFile } from '../src/main/lang';

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-'));
  dirs.push(d);
  return d;
}
afterEach(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); dirs.length = 0; });

describe('pickLanguage', () => {
  it('只认 en,其余一律 zh', () => {
    expect(pickLanguage('en')).toBe('en');
    expect(pickLanguage('zh')).toBe('zh');
    expect(pickLanguage(undefined)).toBe('zh');
    expect(pickLanguage('de')).toBe('zh');
  });
});

describe('writeLanguageFile', () => {
  it('写入 {language} JSON 可回读', () => {
    const file = path.join(tmp(), 'language.json');
    writeLanguageFile(file, 'en');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ language: 'en' });
  });
  it('覆盖已有文件', () => {
    const file = path.join(tmp(), 'language.json');
    writeLanguageFile(file, 'zh');
    writeLanguageFile(file, 'en');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ language: 'en' });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd onworking && npx vitest run tests/lang.test.ts`

Expected: FAIL——`../src/main/lang` 模块不存在。

- [ ] **Step 3: 实现 `src/main/lang.ts`**

```ts
// onworking/src/main/lang.ts
// 语言偏好归一化 + 写文件的纯函数,独立成模块以便 node 环境单测。
import * as fs from 'node:fs';

// 归一化:只认 'en',其余一律 'zh'。读路径 resolveLanguage 与写路径共用此真源。
export function pickLanguage(value: unknown): 'zh' | 'en' {
  return value === 'en' ? 'en' : 'zh';
}

// 同步写语言偏好 JSON,供「写文件后自动重启」的切换流程使用。
export function writeLanguageFile(filePath: string, lang: 'zh' | 'en'): void {
  fs.writeFileSync(filePath, JSON.stringify({ language: lang }), 'utf8');
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd onworking && npx vitest run tests/lang.test.ts`

Expected: 2 个 describe 全 PASS。

- [ ] **Step 5: 接线 `src/main/index.ts`**

在 `import { setCatalog } from '../common/i18n';`(第 16 行)后加:

```ts
import { pickLanguage, writeLanguageFile } from './lang';
```

把 `resolveLanguage()` 第 34 行的 `return cfg.language === 'en' ? 'en' : 'zh';` 改为:

```ts
      return pickLanguage(cfg.language);
```

(第 37 行兜底 `return 'zh'` 保持不变。)

在 `setupIPC`(第 86 行 `ipcMain.handle('app:getLanguage', ...)` 之后)加:

```ts
  ipcMain.handle('app:setLanguage', (_event, lang: string) => {
    const target = pickLanguage(lang);
    const file = app.isPackaged
      ? path.join(app.getPath('userData'), 'language.json')
      : path.join(__dirname, '../../../language.json');
    writeLanguageFile(file, target);
    app.relaunch();
    app.exit(0);
  });
```

> 写路径与读路径优先级保持一致:打包版写 userData(可写),dev 写项目根 `onworking/language.json`。`fs.writeFileSync` 同步写完再 relaunch,无竞态。

- [ ] **Step 6: 类型检查**

Run: `cd onworking && npx tsc -p tsconfig.main.json --noEmit`

Expected: 无错误。

- [ ] **Step 7: 提交**

```bash
git add onworking/src/main/lang.ts onworking/src/main/index.ts onworking/tests/lang.test.ts
git commit -m "feat(main): app:setLanguage IPC — 写 language.json 并自动重启"
```

---

### Task 3: preload 暴露 `setLanguage`

**Files:**
- Modify: `onworking/src/main/preload.ts`
- Modify: `onworking/src/renderer/global.d.ts`

**Interfaces:**
- Consumes: `app:setLanguage` IPC(Task 2)。
- Produces: `window.onworking.setLanguage(lang: string): Promise<void>`;Task 4 的 TopBar 调用它。

- [ ] **Step 1: preload 加 `setLanguage`**

在 `onworking/src/main/preload.ts` 的 `getLanguage`(第 20 行)之后加:

```ts
  setLanguage: (lang: string): Promise<void> => ipcRenderer.invoke('app:setLanguage', lang),
```

- [ ] **Step 2: `global.d.ts` 补类型**

在 `onworking/src/renderer/global.d.ts` 的 `getLanguage(): Promise<string>;`(第 12 行)之后加:

```ts
      setLanguage(lang: string): Promise<void>;
```

- [ ] **Step 3: 类型检查(渲染层)**

Run: `cd onworking && npx tsc -p tsconfig.renderer.json --noEmit`

Expected: 无错误。

- [ ] **Step 4: 提交**

```bash
git add onworking/src/main/preload.ts onworking/src/renderer/global.d.ts
git commit -m "feat(ipc): preload 暴露 setLanguage"
```

---

### Task 4: TopBar 语言下拉选择器

**Files:**
- Modify: `onworking/src/renderer/components/TopBar.tsx`

**Interfaces:**
- Consumes: `window.onworking.getLanguage()` / `window.onworking.setLanguage()`(Task 3)、`t('topBar.language')` / `t('lang.zhName')` / `t('lang.enName')`(Task 1)。
- Produces: 顶栏右侧「语言」下拉选择器。

- [ ] **Step 1: 改造 `TopBar.tsx`**

把文件替换为(保留现有 `TABS` 常量与 tab 渲染逻辑不变,仅把组件体从隐式返回改为函数体以放 hooks,并在 flex 末尾追加语言控件):

```tsx
// onworking/src/renderer/components/TopBar.tsx
import React, { useEffect, useState } from 'react';
import { t } from '../../common/i18n';

export type ViewId = 'config' | 'preview' | 'results' | 'sql';

interface TopBarProps {
  workspaceName: string;
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
}

// 存 key 而非渲染好的词:ESM 下本模块体先于 main.tsx 的 setCatalog(zh) 执行,
// 模块顶层调 t() 会拿不到目录而渲染成裸 key。改成渲染时取词,规避时序问题。
const TABS: { id: ViewId; labelKey: string }[] = [
  { id: 'config', labelKey: 'topBar.view1' },
  { id: 'preview', labelKey: 'topBar.view2' },
  { id: 'results', labelKey: 'topBar.view3' },
  { id: 'sql', labelKey: 'topBar.view4' },
];

export const TopBar: React.FC<TopBarProps> = ({ workspaceName, activeView, onViewChange }) => {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  useEffect(() => {
    window.onworking.getLanguage().then(l => setLang(l === 'en' ? 'en' : 'zh')).catch(() => {});
  }, []);

  const handleLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value === 'en' ? 'en' : 'zh';
    setLang(next); // 立即反映选中(重启生效前)
    void window.onworking.setLanguage(next); // 主进程写文件并自动重启
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 12px',
      borderBottom: '1px solid #ddd', background: '#fafafa', gap: 16 }}>
      <strong style={{ fontSize: 13 }}>OnWorking</strong>
      <span style={{ color: '#666', fontSize: 12 }}>[{workspaceName}]</span>
      <div style={{ display: 'flex', gap: 0, marginLeft: 24 }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => onViewChange(tab.id)}
            style={{ padding: '4px 16px', border: 'none', cursor: 'pointer',
              background: activeView === tab.id ? '#007acc' : 'transparent',
              color: activeView === tab.id ? 'white' : '#333',
              borderRadius: 3, fontSize: 12, fontWeight: activeView === tab.id ? 600 : 400 }}>
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#666' }}>{t('topBar.language')}</span>
        <select value={lang} onChange={handleLangChange} style={{ fontSize: 12, padding: '2px 4px' }}>
          <option value="zh">{t('lang.zhName')}</option>
          <option value="en">{t('lang.enName')}</option>
        </select>
      </span>
    </div>
  );
};
```

> `marginLeft: 'auto'` 把语言控件推到顶栏最右。`t('lang.zhName')`/`t('lang.enName')` 在两语言下都显示「中文 / English」(母语自指)。

- [ ] **Step 2: 类型检查(渲染层)**

Run: `cd onworking && npx tsc -p tsconfig.renderer.json --noEmit`

Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add onworking/src/renderer/components/TopBar.tsx
git commit -m "feat(topbar): 语言下拉选择器(写文件+自动重启)"
```

---

### Task 5: 全量验证

**Files:**(仅验证,无代码改动)

- [ ] **Step 1: 跑全量测试**

Run: `cd onworking && npx vitest run`

Expected: 全部 PASS(含新增 `tests/i18n-lang-switcher.test.ts`、`tests/lang.test.ts`)。

- [ ] **Step 2: 全量类型检查**

Run: `cd onworking && npm run typecheck`

Expected: 无错误。

- [ ] **Step 3: 构建**

Run: `cd onworking && npm run build`

Expected: `build:main`(tsc)与 `build:renderer`(vite)均成功。

- [ ] **Step 4: 手工验证(dev)**

1. `cd onworking && npm start` 启动。
2. 顶栏右侧应显示「语言 ▾」下拉,当前值高亮当前语言(`language.json` 现为 `en`,故显示 English)。
3. 选择「中文」→ 应用自动重启。
4. 重启后界面/菜单全中文;`onworking/language.json` 内容变 `{"language":"zh"}`。
5. 再选「English」→ 重启 → 恢复英文。

Expected: 切换生效、文件内容正确、无裸 key。

- [ ] **Step 5: 检查工作区状态并提交收尾**

Run: `cd "D:\Jeffrey\测试1" && git status --short`

Expected: 仅本计划的文件变更(设计/计划文档已另提交);`onworking/language.json` 可能因手工验证而显示 modified——属预期,不改 git 跟踪,如需恢复内容 `git checkout -- onworking/language.json`(内容为 `{"language":"zh"}`)。

无收尾提交(各任务已各自提交)。

---

## Self-Review 记录

- **Spec 覆盖**:下拉控件 ✓(Task 4)、写文件+自动重启 ✓(Task 2)、写路径镜像读优先级 ✓(Task 2 Step 5)、母语自指选项 ✓(Task 1/4)、语言标签固定显示 ✓(Task 1/4)、i18n key 同步改两文件 ✓(Task 1)、dev 下 git 跟踪提示 ✓(Task 5 Step 5)、测试与验证 ✓(Task 1/2/5)。
- **占位符**:无 TBD/TODO;所有步骤含实际代码。
- **类型一致性**:`pickLanguage` / `writeLanguageFile` 签名在 lang.ts 定义与 lang.test.ts、index.ts 中使用处一致;`setLanguage(lang: string): Promise<void>` 在 preload、global.d.ts、TopBar 三处一致。
