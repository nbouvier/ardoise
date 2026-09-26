import type { ReactNode } from 'react';
import { Modal, Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export interface SheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A page opened over the current one, sliding up from the bottom ("New
 * group", "New friend", a transaction…). On iOS a native page sheet, which
 * closes by swiping down. Elsewhere a see-through window, so that dragging a
 * `DismissiblePage`'s banner down reveals the page underneath instead of a
 * blank. Gestures need their own root inside a modal window.
 */
export function SheetModal({ visible, onClose, children }: SheetModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      transparent={Platform.OS !== 'ios'}
      onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>{children}</GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
