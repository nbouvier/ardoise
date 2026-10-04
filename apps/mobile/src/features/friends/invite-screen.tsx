import { InviteShareScreen } from '@/features/invites/invite-share-screen';
import { fetchInvite, rotateInvite } from '@/lib/api/friends';

export const FRIEND_INVITE_BLURB =
  'Send this link. Whoever opens it and signs in is added to your friends.';

export interface InviteScreenProps {
  /** Just the link card, for a page that has more to show around it. */
  embedded?: boolean;
}

/** The "add me as a friend" link. Shown on the "New friend" page. */
export function InviteScreen({ embedded }: InviteScreenProps = {}) {
  return (
    <InviteShareScreen
      title="Invite a friend"
      blurb={FRIEND_INVITE_BLURB}
      shareMessage={(url) => `Join me on Ardoise: ${url}`}
      load={fetchInvite}
      rotate={rotateInvite}
      embedded={embedded}
    />
  );
}
