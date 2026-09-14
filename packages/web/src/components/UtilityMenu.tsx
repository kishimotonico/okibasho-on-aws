import { useRouterState } from '@tanstack/react-router';
import { CircleUser } from 'lucide-react';

import { useAuth } from '~/auth/auth-context';
import { Menu, MenuItem } from '~/components/Menu';
import { messages } from '~/lib/messages';

export function UtilityMenu() {
  const auth = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname === '/callback' || !auth.isAuthenticated) {
    return null;
  }

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
