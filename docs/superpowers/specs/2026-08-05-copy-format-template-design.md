# 复制格式(模板保存与应用)— 设计文档

- 日期: 2026-08-05
- 状态: 方案 A 已确认,待实现
- 范围: 视图一(RuleEditor 原文件映射视图)新增「复制格式」模块

## 背景与目标

处理同一大表下的多张同类源文件时,每个文件都要在映射视图里重复勾选字段、把源字段映射到大表字段。本功能把「已配置好的映射关系」保存为模板,并在新文件上逐条套用,减少重复操作。

- **保存模板**:把当前 sheet 的映射情况(勾选了哪些字段、每个源字段映射哪个大表字段)提取为模板。
- **应用模板**:选一个模板,先取消全选,再按模板自上而下匹配源字段并链接到对应大表字段;匹配不到的跳过。

速度优先:模板模块放在映射视图**顶部**、**单行紧凑**,减少翻页/移动视线。

## 已确认的决策(Q&A)

1. 模板命名:界面内输入框,自动预填当前源文件名(去扩展名),可改。
2. 应用时目标字段校验:目标字段不在当前大表字段列表 → 跳过该条,其余照常。
3. 同名模板:直接覆盖,不弹确认。
4. 实现方案:**方案 A** —— 主进程 `TemplateStore`(YAML)+ `template.*` 路由,与 `rule.*` 同构。

## 界面

### 位置

`RuleEditor.tsx` 顶部,sheet 选择行**之上**。单行紧凑条(`flex-wrap`,放不下自动换行),不占页面大部分。

### 布局

```
复制格式: [模板名______] [保存模板] | [▼ 选择模板] [应用] [删除]
```

- **保存**:从当前 sheet 映射状态提取 `included && mappedField` 的字段 → 二元组 → `template.save`。
- **应用**:先 `取消全选`,再逐条匹配。
- **删除**:选中模板后点「删除」,二步确认(按钮文案变「确认删除?」),再点才删。
- **反馈**:不常驻。保存/应用/出错时在条内显示一行小字(如「已应用:匹配 18/20 条」),几秒后消失。
- **未选择大表**:控件禁用,显示提示「请先选择大表」。

## 模板存储

- 目录:`<大表目录>/.onworking/template/`,只检索当前大表,不跨大表。
- 文件名:`template_<模板名>.yaml`;同名直接覆盖。
- 格式:
  ```yaml
  name: 全量发票查询导出结果
  mappings:
    - source: 数电发票号码
      target: 发票代码
    - source: 金额
      target: 金额
  ```

## 主进程

### 新文件 `src/main/template/template-store.ts`:`TemplateStore`

- 构造传目录;`ensureDir()` 自动 `mkdir -p`。
- `list(): string[]` — 返回模板名(去扩展名)。
- `load(name): TemplateDefinition` — 读取并解析 YAML。
- `save(name, mappings): void` — 覆盖写 YAML。
- `delete(name): void` — 删除文件。
- 校验:name 非空、为合法文件名;mappings 为二元组数组,每个二元组含非空 `source`、`target`。

类型:

```ts
interface TemplateDefinition {
  name: string;
  mappings: { source: string; target: string }[];
}
```

### 新文件 `src/main/template/routes.ts`:`registerTemplateRoutes(router)`

- `template.list` → `{ dir }` → `string[]`
- `template.save` → `{ dir, name, mappings }` → `{ ok }`
- `template.delete` → `{ dir, name }` → `{ ok }`

全部带 `dir` 参数,按 `rule.*` 的 `getStore(dir)` 模式动态建 store。

### `src/main/index.ts`

在 `initModules()` 中调用 `registerTemplateRoutes(apiRouter)`。

## 渲染进程

### `TableConfig` 新增

- `setIncluded(i, bool)` — 显式设置勾选(比 `toggleField` 稳,避免重复条目翻转)。
- `templateMappings(): [string, string][]` — 提取 `included && mappedField` 的 `[sourceHeader, mappedField]`。
- `applyTemplate(mappings, validTargets): { matched, skipped }`
  1. `setAllIncluded(false)`(取消全选);
  2. 逐条二元组:在 `fields` 找第一个 `sourceHeader === 源字段` **且尚未被匹配(`included=false`)** 的字段;且目标字段在 `validTargets` 内 → `setMappedField(i, 目标)` + `setIncluded(i, true)`,否则跳过;
  3. 置 `saved=false` + `onChange()`,返回统计。

### 新组件 `src/renderer/components/CopyFormat.tsx`

- Props:`config: TableConfig`、`bigTableFields: string[]`。
- 用 `useBigTableStore` 取 `selectedFolder + workspaceRoot`,拼模板目录。
- 状态:`templateName`(输入值)、`templates`(下拉列表)、`selected`(当前选中)、`message`(反馈)、`armedDelete`(删除确认态)。
- 挂载/切换大表 → `template.list` 刷新;保存/删除后刷新。
- 保存流程:`config.templateMappings()` → 空则提示「没有可保存的映射」;否则 `template.save` → 反馈「已保存模板「name」」。
- 应用流程:`config.applyTemplate(mappings, bigTableFields)` → 反馈「已应用模板「name」:匹配 {matched} / {total} 条」。
- 删除:二步确认 → `template.delete`。

### `RuleEditor.tsx` 接线

把 `<CopyFormat config={config} bigTableFields={bigTableFields} />` 放在 sheet 选择行上方。

## i18n

`i18n/zh.json` + `i18n/en.json` 各加 `copyFormat.*`:

| key | zh | en |
|---|---|---|
| `title` | 复制格式 | Copy Format |
| `templateName` | 模板名 | Template name |
| `saveTemplate` | 保存模板 | Save template |
| `selectPlaceholder` | 选择模板... | Select template... |
| `applyTemplate` | 应用 | Apply |
| `deleteTemplate` | 删除 | Delete |
| `confirmDelete` | 确认删除? | Confirm delete? |
| `noBigTable` | 请先选择大表 | Select a table first |
| `saved` | 已保存模板「{name}」 | Saved template "{name}" |
| `applied` | 已应用模板「{name}」:匹配 {matched} / {total} 条 | Applied "{name}": {matched} / {total} matched |
| `nothingToSave` | 没有可保存的映射(未勾选字段或未选择映射) | Nothing to save (no fields selected or mapped) |
| `noTemplates` | 暂无模板 | No templates |
| `nameRequired` | 请输入模板名 | Enter a template name |

## 边界情况 / 错误处理

- 模板目录不存在:save 时自动创建;list 返回空数组。
- 无大表选中:控件禁用 + 「请先选择大表」。
- 保存时无有效映射:`nothingToSave` 提示,不写文件。
- 模板名非法字符:主进程 store 统一校验/sanitize。
- 应用时源字段或目标字段匹配不到:跳过(计入 skipped)。
- 模板内重复源字段条目:只匹配第一个字段。

## 测试

- `tests/table-config.test.ts` 追加:
  - `applyTemplate` 先取消全选;
  - 匹配成功设置 `included = true` + `mappedField`;
  - 目标字段不在大表 → 跳过;
  - 源字段不存在 → 跳过;
  - 重复源字段 → 只匹配第一个;
  - `templateMappings` 只含 `included && mappedField` 的字段。
- `tests/template-store.test.ts`(新):save / list / 同名覆盖 / delete,用临时目录。

## 不做(非目标)

- 不跨大表检索模板。
- 应用后不自动保存规则(仍走原「保存规则」按钮)。
- 不做模板重命名/拖拽排序。
- 不做模板名查重拦截(直接覆盖)。
