import { useState, type ReactNode } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export interface UseDialogResult {
  /** Render this once, anywhere in the screen's tree. */
  dialog: ReactNode;
  /** Ask "are you sure": Cancel or the confirming button. */
  confirm: (options: ConfirmOptions) => void;
  /** Tell them something, with a single "OK". */
  inform: (title: string, message: string) => void;
}

/**
 * The app's replacement for the OS `Alert`: a screen calls `confirm` / `inform`
 * and renders `dialog`. The last content stays put while the dialog fades out.
 */
export function useDialog(): UseDialogResult {
  const [options, setOptions] = useState<(ConfirmOptions & { confirmOnly: boolean }) | null>(null);
  const [visible, setVisible] = useState(false);

  function open(next: ConfirmOptions & { confirmOnly: boolean }) {
    setOptions(next);
    setVisible(true);
  }

  const dialog = options ? (
    <ConfirmDialog
      visible={visible}
      title={options.title}
      message={options.message}
      confirmLabel={options.confirmLabel}
      destructive={options.destructive}
      confirmOnly={options.confirmOnly}
      onConfirm={() => {
        setVisible(false);
        options.onConfirm();
      }}
      onCancel={() => setVisible(false)}
    />
  ) : null;

  return {
    dialog,
    confirm: (confirmOptions) => open({ ...confirmOptions, confirmOnly: false }),
    inform: (title, message) =>
      open({ title, message, confirmLabel: 'OK', onConfirm: () => undefined, confirmOnly: true }),
  };
}
