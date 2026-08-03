import { BaseContextMenu, MenuContext, MenuItem } from '../base';
import { FileClipboard } from '../../state/FileClipboard';

interface FolderTarget { name: string; folderPath: string; }

/** 大表文件夹(FolderTree 文件夹行)。 */
export class FolderItemMenu extends BaseContextMenu {
  getItems(ctx: MenuContext): MenuItem[] {
    const target = ctx.target as FolderTarget;
    return [
      { id: 'settings', label: '打开大表设置', group: 'open', onClick: () => ctx.actions.onOpenSettings?.(target.name) },
      { id: 'merge', label: '合并文件夹', group: 'open', onClick: () => ctx.actions.onMerge?.(target.folderPath) },
      { id: 'open-dir', label: '打开数据目录', group: 'open', onClick: () => { void window.onworking.showInFolder(target.folderPath); } },
      { id: 'paste', label: '粘贴源文件', group: 'edit', enabled: FileClipboard.has(), onClick: () => ctx.actions.onPaste?.(`${target.folderPath}/source`) },
      { id: 'delete', label: '删除大表', group: 'danger', danger: true, onClick: () => ctx.actions.onDeleteFolder?.(target.folderPath) },
    ];
  }
}
