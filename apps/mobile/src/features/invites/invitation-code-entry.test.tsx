import { beforeEach, describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { InvitationCodeEntry } from './invitation-code-entry';
import { pendingInvite } from './pending-invite';

beforeEach(() => {
  pendingInvite.clear();
});

describe('InvitationCodeEntry', () => {
  it('disables Join until something is typed', async () => {
    await render(<InvitationCodeEntry />);

    expect(screen.getByRole('button', { name: /^join$/i }).props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it('hands a manually typed code to the pending-invite store', async () => {
    await render(<InvitationCodeEntry />);

    await fireEvent.changeText(screen.getByLabelText('Invitation code'), 'Zx3k9QpL2mN7vR1sT4uW8g');
    await fireEvent.press(screen.getByRole('button', { name: /^join$/i }));

    expect(pendingInvite.getSnapshot()).toBe('Zx3k9QpL2mN7vR1sT4uW8g');
  });

  it('keeps just the code when a whole link is pasted', async () => {
    await render(<InvitationCodeEntry />);

    await fireEvent.changeText(
      screen.getByLabelText('Invitation code'),
      'http://localhost:3000/i/Zx3k9QpL2mN7vR1sT4uW8g',
    );

    expect(screen.getByLabelText('Invitation code').props.value).toBe('Zx3k9QpL2mN7vR1sT4uW8g');

    await fireEvent.press(screen.getByRole('button', { name: /^join$/i }));

    expect(pendingInvite.getSnapshot()).toBe('Zx3k9QpL2mN7vR1sT4uW8g');
  });

  it('shows what a link looks like as the placeholder', async () => {
    await render(<InvitationCodeEntry />);

    expect(screen.getByLabelText('Invitation code').props.placeholder).toMatch(/\/i\/…$/);
  });

  it('clears the field after opening', async () => {
    await render(<InvitationCodeEntry />);

    await fireEvent.changeText(screen.getByLabelText('Invitation code'), 'Zx3k9QpL2mN7vR1sT4uW8g');
    await fireEvent.press(screen.getByRole('button', { name: /^join$/i }));

    expect(screen.getByLabelText('Invitation code').props.value).toBe('');
  });

  it('submits from the keyboard as well as the button', async () => {
    await render(<InvitationCodeEntry />);

    const input = screen.getByLabelText('Invitation code');
    await fireEvent.changeText(input, 'Zx3k9QpL2mN7vR1sT4uW8g');
    await fireEvent(input, 'submitEditing');

    expect(pendingInvite.getSnapshot()).toBe('Zx3k9QpL2mN7vR1sT4uW8g');
  });
});
