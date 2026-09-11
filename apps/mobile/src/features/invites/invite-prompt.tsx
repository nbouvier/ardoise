import type { AcceptInviteResult } from '@splitcount/shared';
import { useSyncExternalStore } from 'react';
import { Modal, StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { friendsChanged } from '@/features/friends/friends-changed';
import { groupsChanged } from '@/features/groups/groups-changed';

import { AcceptInviteScreen } from './accept-invite-screen';
import { pendingInvite } from './pending-invite';

/** Tell whichever list the acceptance changed to reload. */
function announce(result: AcceptInviteResult): void {
  if (result.kind === 'group') {
    groupsChanged.notify();
  } else {
    friendsChanged.notify();
  }
}

/**
 * Shows the confirmation screen whenever an invitation is pending. Rendered
 * inside the auth gate, so it only ever appears with a session: a code that
 * arrived while signed out waits here until sign-in completes.
 *
 * A modal rather than a route: the flow is identical whether the code came from
 * a deep link or was typed by hand, and it does not need a place in the tab
 * navigator.
 */
export function InvitePrompt() {
  const code = useSyncExternalStore(
    pendingInvite.subscribe,
    pendingInvite.getSnapshot,
    pendingInvite.getSnapshot,
  );

  return (
    <Modal
      visible={code !== null}
      animationType="fade"
      transparent={false}
      onRequestClose={() => pendingInvite.clear()}>
      <ThemedView style={styles.container}>
        {code ? (
          <AcceptInviteScreen
            code={code}
            onClose={() => pendingInvite.clear()}
            onAccepted={announce}
          />
        ) : null}
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
