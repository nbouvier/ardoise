import { createChangeSignal } from '@/lib/change-signal';

/**
 * Announces that the group list changed outside the Groups tab — joining
 * through the invitation modal, or creating, archiving, leaving or deleting a
 * group from its own screen.
 */
export const groupsChanged = createChangeSignal();
