// 打开工作区唯一流程:开始页面按钮、File 菜单广播、最近工作区三入口共用。
export interface WorkspaceInfo {
  root: string;
  sourceDir: string;
  rulesDir: string;
  entitiesDir: string;
  dbPath: string;
}

/** 弹原生选择框;取消返回 null。 */
export async function openWorkspace(): Promise<WorkspaceInfo | null> {
  const rootPath = await window.onworking.pickFolder();
  if (!rootPath) return null;
  return openWorkspacePath(rootPath);
}

/** 按已知路径打开/新建(打开或新建由后端 workspace.launch 判定)。 */
export async function openWorkspacePath(rootPath: string): Promise<WorkspaceInfo> {
  const res = await window.onworking.api.call('workspace.launch', { rootPath });
  if (!res.success) throw new Error(res.error ?? '打开工作区失败');
  return res.data as WorkspaceInfo;
}
