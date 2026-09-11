import { InviteShareScreen } from '@/features/invites/invite-share-screen';
import { fetchGroupInvite, rotateGroupInvite } from '@/lib/api/groups';

export interface GroupInviteScreenProps {
  groupId: string;
  groupName: string;
}

/**
 * The group's invitation link. One per group rather than per member: every
 * member sees and shares the same one, and it keeps working after whoever
 * created it leaves.
 */
export function GroupInviteScreen({ groupId, groupName }: GroupInviteScreenProps) {
  return (
    <InviteShareScreen
      title="Invite to this group"
      blurb="Anyone who opens this link and signs in joins the group. It doesn’t add them to your friends."
      shareMessage={(url) => `Join “${groupName}” on SplitCount: ${url}`}
      load={(fetcher) => fetchGroupInvite(fetcher, groupId)}
      rotate={(fetcher) => rotateGroupInvite(fetcher, groupId)}
    />
  );
}
