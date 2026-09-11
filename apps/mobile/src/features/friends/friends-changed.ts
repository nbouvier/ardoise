import { createChangeSignal } from '@/lib/change-signal';

/** Announces that the friend list changed outside the Friends tab. */
export const friendsChanged = createChangeSignal();
