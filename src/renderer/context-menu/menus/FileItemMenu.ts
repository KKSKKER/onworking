import { BaseContextMenu, MenuContext, MenuItem } from '../base';
import { FileClipboard } from '../../state/FileClipboard';

interface FileTarget { path: string; }

/** View1 源文件列表(FileTree)。 */
export class FileItemMenu extends BaseContextMenu {
  getItems(ctx: MenuContext): MenuItem[] {
    const target = ctx.target as FileTarget;
    const dir = target.path.replace(/[\\/][^\\/]*$/, '');
    return [
      { id: 'open-preview', label: '打开预览', icon: '📄', group: 'open', onClick: () => ctx.actions.onPreview?.(target.path) },
      { id: 'open-dir', label: '打开数据目录', icon: '📂', group: 'open', onClick: () => { void window.onworking.showInFolder(target.path); } },
      { id: 'copy', label: '复制源文件', group: 'edit', onClick: () => FileClipboard.copy(target.path) },
      { id: 'paste', label: '粘贴源文件', group: 'edit', enabled: FileClipboard.has(), onClick: () => ctx.actions.onPaste?.(dir) },
      { id: 'rename', label: '重命名', group: 'edit', onClick: () => ctx.actions.onRenameStart?.(target.path) },
      { id: 'delete', label: '删除文件', group: 'danger', danger: true, onClick: () => ctx.actions.onDelete?.(target.path) },
    ];
  }
}
