# 顶栏语言切换 — 设计文档

- 日期: 2026-08-06
- 状态: 方案已确认,待实现
- 范围: 顶栏(TopBar)新增语言下拉选择器;切换方式为「写 `language.json` + 自动重启」

## 背景与目标

i18n 改造已完成:`i18n/zh.json`(中文)+ `i18n/en.json`(英文)双语全量翻译,界面/菜单均通过 `t(key)` 取词;语言持久化靠 `language.json`(dev=项目根,打包后=用户数据目录),内容 `{"language":"zh"|"en"}`。

**当前切换方式 = 手工改 `language.json` + 手动重启,没有任何 UI。** 本功能在顶栏加一个语言下拉选择器,选中即写文件并自动重启,重启后主进程按新语言重建界面与菜单。

用户已确认:**不要求热切换,采用「写文件 + 自动重启」**——菜单、所有 `t()` 取词无需逐处改,重启后自动跟随。

## 已确认的决策(Q&A)

1. 生效方式:写文件后自动重启(`app.relaunch()` + `app.exit(0)`),不热切换。
2. 控件:顶栏右侧**下拉选择器**。
3. 选项文案:「中文 / English」各自**母语自指**,两种语言下显示相同,故不翻译。
4. 不弹确认框:select 本身就是明确的主动动作。
5. 持久化位置:复用现有 `language.json`,写路径与读取优先级一致(打包版 → userData,dev → 项目根),不新增文件。

## 界面

TopBar 右侧(现有 flex 布局末尾)追加:

```
... [SQL 工作台]                     [语言: ▼ 中文 | English]
```

- select 前有标签「语言」(`topBar.language`,en 下显示 "Language"),再是 `<select>` 两选项「中文 / English」,值 = 当前语言(zh|en)。
- 挂载时 `window.onworking.getLanguage()` 取当前语言作为选中值,取到前默认 zh。
- `onChange` → `window.onworking.setLanguage(newLang)` → 主进程写文件并重启,渲染层无需后续处理。

## 主进程改动

`src/main/index.ts` 新增 IPC handler,写路径镜像 `resolveLanguage()` 的读取优先级:

```ts
ipcMain.handle('app:setLanguage', (_e, lang: string) => {
  const target = lang === 'en' ? 'en' : 'zh';
  const file = app.isPackaged
    ? path.join(app.getPath('userData'), 'language.json')
    : path.join(__dirname, '../../../language.json');
  fs.writeFileSync(file, JSON.stringify({ language: target }), 'utf8');
  app.relaunch();
  app.exit(0);
});
```

同步写文件后再 relaunch,无竞态;重启后既有 `resolveLanguage()` 自动读取新语言。

## 渲染层改动

- **`src/main/preload.ts`**:暴露 `setLanguage(lang: string): Promise<void>` → `ipcRenderer.invoke('app:setLanguage', lang)`。
- **`src/renderer/global.d.ts`**:`onworking` 类型补 `setLanguage(lang: string): Promise<void>`。
- **`src/renderer/components/TopBar.tsx`**:新增 `lang` state(`useState<string>('zh')`),`useEffect` 中 `getLanguage()` 更新;`<select>` 选项文案用 i18n key(`lang.zhName` / `lang.enName`),母语自指故两语言文件同值;选择非当前语言时调用 `setLanguage`。

## i18n key(zh.json 与 en.json 同步新增)

| key | zh.json | en.json |
|---|---|---|
| `lang.zhName` | 中文 | 中文 |
| `lang.enName` | English | English |
| `topBar.language` | 语言 | Language |

`topBar.language` 为 select 前的固定小标签(保持双语一致性,也向非技术用户点明用途)。

## 测试与验证

- `npm test`(vitest)全绿;重点确认 `smoke.test.ts` 不受 TopBar 结构变化影响。
- 手工验证 dev:下拉选 English → 应用自动重启 → 界面/菜单全英文,`onworking/language.json` 内容变 `{"language":"en"}`;再切回中文。
- 手工验证打包版:切换写 `%APPDATA%\onworking\language.json` 而非项目根。

## 已知说明

- dev 模式下 `onworking/language.json` 已被 git 跟踪,切换会弄脏工作区——用户本地偏好文件,不改 .gitignore,仅提示。
- 重启会丢失当前工作区/视图的瞬态状态,这是「重启生效」方案的固有代价,用户已确认接受。
