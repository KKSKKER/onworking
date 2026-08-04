import { BaseContextMenu, MenuContext, MenuItem } from '../base';
import { t } from '../../../common/i18n';

interface RuleTarget { name: string; display?: string; }

/** 规则列表(RuleList)。 */
export class RuleItemMenu extends BaseContextMenu {
  getItems(ctx: MenuContext): MenuItem[] {
    const target = ctx.target as RuleTarget;
    return [
      { id: 'edit', label: t('contextMenu.editRule'), group: 'open', onClick: () => ctx.actions.onEditRule?.(target.name) },
      { id: 'delete', label: t('contextMenu.deleteRule'), group: 'danger', danger: true, onClick: () => ctx.actions.onDeleteRule?.(target.name) },
    ];
  }
}
