import { CircleUser } from 'lucide-react';

import { useAuth } from '~/auth/auth-context';
import { Menu, MenuItem } from '~/components/Menu';
import { messages } from '~/lib/messages';

export function UtilityMenu() {
  const auth = useAuth();

  return (
    <div className="utility-menu">
      <Menu
        label={messages.menu}
        tooltip={messages.menu}
        trigger={<CircleUser size={18} strokeWidth={1.75} aria-hidden />}
      >
        <MenuItem onSelect={() => void auth.logout()}>{messages.logout}</MenuItem>
      </Menu>
    </div>
  );
}

// モバイル幅では UtilityMenu が行を取るため、同じ寸法のプレースホルダーで場所を空けておく
export function UtilityMenuPlaceholder() {
  return (
    <div className="utility-menu" aria-hidden>
      <span className="utility-menu__placeholder" />
    </div>
  );
}
