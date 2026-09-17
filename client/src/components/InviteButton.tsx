import { useState, useEffect } from 'preact/hooks';
import { Permissions, PermissionUtils } from '@discord/embedded-app-sdk';

import { discordSdk } from '../main';

import { WithTooltip } from '../components/Tooltip';

export function InviteButton() {
  const [canInvite, setCanInvite] = useState(false);

  useEffect(() => {
    async function checkPermissions() {
      try {
        const { permissions } = await discordSdk.commands.getChannelPermissions();
        console.log(permissions);
        if (PermissionUtils.can(Permissions.CREATE_INSTANT_INVITE, permissions)) {
          setCanInvite(true);
        }
      } catch (error) {
        console.warn('Could not fetch channel permissions:', error);
        setCanInvite(false);
      }
    }

    checkPermissions();
  }, []);

  const buttonElement = (
    <button
      disabled={!canInvite}
      onClick={async () => {
        try {
          await discordSdk.commands.openInviteDialog();
        } catch (error) {
          console.error('Failed to open invite dialog:', error);
        }
      }}
    >
      Invite more players
    </button>
  );

  if (!canInvite) {
    return (
      <WithTooltip text="You do not have permission to create invites in this channel.">{buttonElement}</WithTooltip>
    );
  }

  return buttonElement;
}
