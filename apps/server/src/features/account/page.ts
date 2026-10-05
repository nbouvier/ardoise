/**
 * The public page describing account deletion: the link Google Play asks for,
 * and the way to ask for it without the app (`docs/specs/account-deletion.md`).
 * Static apart from the contact address, which comes from the configuration.
 */

import { escapeHtml, page } from '../../http/html.js';

export interface DeletionPageInput {
  /** Where deletion requests made without the app go. Unset, that paragraph is left out. */
  contact?: string | undefined;
}

export function renderDeletionPage({ contact }: DeletionPageInput): string {
  const byEmail = contact
    ? `<h2>Without the app</h2>
<p>Write to <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a> from the
e-mail address of the Google account you sign in to Ardoise with, asking for your account to
be deleted. It is deleted exactly as from the app, within a month, and you get a reply once it
is done.</p>`
    : '';

  // The backup retention is the off-site one, 30 daily and 12 monthly copies
  // (`docs/OPERATIONS.md`, "Backups"): change both together.
  return page(
    'Delete your Ardoise account',
    `<div class="prose">
<h1>Delete your Ardoise account</h1>
<h2>In the app</h2>
<p>Open <strong>Account</strong>, then <strong>Delete account</strong>. The app shows what you
will lose before anything is deleted, and asks you to confirm twice.</p>
${byEmail}
<h2>What is deleted</h2>
<ul>
<li>Your profile: name, e-mail address and picture.</li>
<li>Your sign-in and every session, on every device.</li>
<li>Your friend list, and every group you share one-to-one with a friend, with its sub-groups
and everything in them.</li>
<li>Your place in every other group. Groups you created pass to the member who has been in
them the longest; a group with nobody else in it is deleted.</li>
</ul>
<h2>What stays</h2>
<ul>
<li>In groups you share with other people, the transactions stay, so the others' accounts
still add up. Your part in them is shown as “Others”, with nothing linking it to you. What you
were owed in those groups, and what you owed, is lost.</li>
<li>Text typed into a transaction's title or comment, or a group's name, is not changed.</li>
<li>Encrypted backups of the database keep a copy for up to 12 months. They are only used to
restore the service, and a restore deletes every deleted account again.</li>
</ul>
<p>Deletion cannot be undone. Signing in again later creates a new, empty account.</p>
</div>`,
  );
}
