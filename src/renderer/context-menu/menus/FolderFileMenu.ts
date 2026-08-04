import { BaseContextMenu, MenuContext, MenuItem } from '../base';
import { FileClipboard } from '../../state/FileClipboard';
import { t } from '../../../common/i18n';

interface FolderFileTarget { path: string; folderPath: string; }

/** 大表内文件(FolderTree 文件行)。 */
export class FolderFileMenu extends BaseContextMenu {
  getItems(ctx: MenuContext): MenuItem[] {
    const target = ctx.target as FolderFileTarget;
    return [
      { id: 'open-preview', label: t('contextMenu.openPreview'), icon: '📄', group: 'open', onClick: () => ctx.actions.onPreview?.(target.path) },
      { id: 'open-dir', label: t('contextMenu.openDataDir'), group: 'open', onClick: () => { void window.onworking.showInFolder(target.path); } },
      { id: 'copy', label: t('contextMenu.copySource'), group: 'edit', onClick: () => FileClipboard.copy(target.path) },
      { id: 'paste', label: t('contextMenu.pasteSource'), group: 'edit', enabled: FileClipboard.has(), onClick: () => ctx.actions.onPaste?.(`${target.folderPath}/source`) },
      { id: 'rename', label: t('contextMenu.rename'), group: 'edit', onClick: () => ctx.actions.onRenameStart?.(target.path) },
      { id: 'delete', label: t('contextMenu.deleteFile'), group: 'danger', danger: true, onClick: () => ctx.actions.onDelete?.(target.path) },
    ];
  }
}
