import { BaseContextMenu, MenuContext, MenuItem } from '../base';
import { FileClipboard } from '../../state/FileClipboard';
import { t } from '../../../common/i18n';

interface FolderTarget { name: string; folderPath: string; }

/** 大表文件夹(FolderTree 文件夹行)。 */
export class FolderItemMenu extends BaseContextMenu {
  getItems(ctx: MenuContext): MenuItem[] {
    const target = ctx.target as FolderTarget;
    return [
      { id: 'settings', label: t('contextMenu.openSettings'), group: 'open', onClick: () => ctx.actions.onOpenSettings?.(target.name) },
      { id: 'merge', label: t('contextMenu.mergeFolder'), group: 'open', onClick: () => ctx.actions.onMerge?.(target.folderPath) },
      { id: 'open-dir', label: t('contextMenu.openDataDir'), group: 'open', onClick: () => { void window.onworking.showInFolder(target.folderPath); } },
      { id: 'paste', label: t('contextMenu.pasteSource'), group: 'edit', enabled: FileClipboard.has(), onClick: () => ctx.actions.onPaste?.(`${target.folderPath}/source`) },
      { id: 'delete', label: t('contextMenu.deleteFolder'), group: 'danger', danger: true, onClick: () => ctx.actions.onDeleteFolder?.(target.folderPath) },
    ];
  }
}
