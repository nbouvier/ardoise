import { InviteShareScreen } from '@/features/invites/invite-share-screen';
import { fetchGroupInvite, rotateGroupInvite } from '@/lib/api/groups';

export interface GroupInviteScreenProps {
  groupId: string;
  groupName: string;
  /** Just the link card, for a page that has more to show above it. */
  embedded?: boolean;
}

/**
 * The group's invitation link. One per group rather than per member: every
 * member sees and shares the same one, and it keeps working after whoever
 * created it leaves.
 */
export function GroupInviteScreen({ groupId, groupName, embedded }: GroupInviteScreenProps) {
  return (
    <InviteShareScreen
      title="Invite to this group"
      blurb="Anyone who opens this link and signs in joins the group. It doesn’t add them to your friends."
      shareMessage={(url) => `Join “${groupName}” on Ardoise: ${url}`}
      inviteKey={`group:${groupId}`}
      load={(fetcher) => fetchGroupInvite(fetcher, groupId)}
      rotate={(fetcher) => rotateGroupInvite(fetcher, groupId)}
      embedded={embedded}
    />
  );
}
