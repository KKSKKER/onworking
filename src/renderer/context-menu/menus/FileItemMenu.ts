import { BaseContextMenu, MenuContext, MenuItem } from '../base';
import { FileClipboard } from '../../state/FileClipboard';
import { t } from '../../../common/i18n';

interface FileTarget { path: string; }

/** View1 源文件列表(FileTree)。 */
export class FileItemMenu extends BaseContextMenu {
  getItems(ctx: MenuContext): MenuItem[] {
    const target = ctx.target as FileTarget;
    const dir = target.path.replace(/[\\/][^\\/]*$/, '');
    return [
      { id: 'open-preview', label: t('contextMenu.openPreview'), icon: '📄', group: 'open', onClick: () => ctx.actions.onPreview?.(target.path) },
      { id: 'open-dir', label: t('contextMenu.openDataDir'), icon: '📂', group: 'open', onClick: () => { void window.onworking.showInFolder(target.path); } },
      { id: 'copy', label: t('contextMenu.copySource'), group: 'edit', onClick: () => FileClipboard.copy(target.path) },
      { id: 'paste', label: t('contextMenu.pasteSource'), group: 'edit', enabled: FileClipboard.has(), onClick: () => ctx.actions.onPaste?.(dir) },
      { id: 'rename', label: t('contextMenu.rename'), group: 'edit', onClick: () => ctx.actions.onRenameStart?.(target.path) },
      { id: 'delete', label: t('contextMenu.deleteFile'), group: 'danger', danger: true, onClick: () => ctx.actions.onDelete?.(target.path) },
    ];
  }
}
