import { InviteShareScreen } from '@/features/invites/invite-share-screen';
import { fetchInvite, rotateInvite } from '@/lib/api/friends';

/** The "add me as a friend" link. Opened as a sheet from the Friends tab. */
export function InviteScreen() {
  return (
    <InviteShareScreen
      title="Invite a friend"
      blurb="Send this link. Whoever opens it and signs in is added to your friends."
      shareMessage={(url) => `Join me on SplitCount: ${url}`}
      load={fetchInvite}
      rotate={rotateInvite}
    />
  );
}
