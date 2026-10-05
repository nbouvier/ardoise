/**
 * The public page describing account deletion: the link Google Play asks for,
 * and the way to ask for it without the app (`docs/specs/account-deletion.md`).
 * In French and English like the legal pages (`docs/specs/legal-pages.md`).
 * Static apart from the contact address, which comes from the configuration.
 */

import { escapeHtml, legalFooter, page } from '../../http/html.js';
import type { Language } from '../../http/language.js';

/** Change it with the text below. */
export const DELETION_PAGE_UPDATED_ON = '2026-10-05';

export interface DeletionPageInput {
  /** Where deletion requests made without the app go. Unset, that paragraph is left out. */
  contact?: string | undefined;
  lang: Language;
}

export function renderDeletionPage({ contact, lang }: DeletionPageInput): string {
  const address = contact ? escapeHtml(contact) : undefined;
  const footer = legalFooter('/delete-account', lang, DELETION_PAGE_UPDATED_ON);

  // The backup retention is the off-site one, 30 daily and 12 monthly copies
  // (`docs/OPERATIONS.md`, "Backups"): change both together, and the privacy policy.
  if (lang === 'fr') {
    const byEmail = address
      ? `<h2>Sans l’application</h2>
<p>Écrivez à <a href="mailto:${address}">${address}</a> depuis l’adresse e-mail du compte
Google avec lequel vous vous connectez à Ardoise, en demandant la suppression de votre
compte. Il est supprimé exactement comme depuis l’application, dans un délai d’un mois, et
vous recevez une réponse une fois que c’est fait.</p>`
      : '';
    return page(
      'Supprimer votre compte Ardoise',
      `<div class="prose">
<h1>Supprimer votre compte Ardoise</h1>
<h2>Dans l’application</h2>
<p>Ouvrez <strong>Account</strong>, puis <strong>Delete account</strong>. L’application montre ce
que vous perdrez avant de supprimer quoi que ce soit, et demande deux confirmations.</p>
${byEmail}
<h2>Ce qui est supprimé</h2>
<ul>
<li>Votre profil&nbsp;: nom, adresse e-mail et photo.</li>
<li>Votre connexion et toutes vos sessions, sur tous vos appareils.</li>
<li>Votre liste d’amis, et chaque groupe que vous partagez en tête-à-tête avec un ami, avec
ses sous-groupes et tout ce qu’ils contiennent.</li>
<li>Votre place dans tous les autres groupes. Les groupes que vous avez créés passent au
membre qui en fait partie depuis le plus longtemps&nbsp;; un groupe où il ne reste personne
est supprimé.</li>
</ul>
<h2>Ce qui reste</h2>
<ul>
<li>Dans les groupes partagés avec d’autres personnes, les transactions restent, pour que les
comptes des autres tombent juste. Votre part y apparaît comme «&nbsp;Others&nbsp;», sans rien
qui la relie à vous. Ce qu’on vous devait dans ces groupes, et ce que vous deviez, est
perdu.</li>
<li>Le texte saisi dans le titre ou le commentaire d’une transaction, ou dans le nom d’un
groupe, n’est pas modifié.</li>
<li>Les sauvegardes chiffrées de la base de données en gardent une copie jusqu’à 12 mois.
Elles ne servent qu’à restaurer le service, et une restauration supprime à nouveau chaque
compte supprimé.</li>
</ul>
<p>La suppression est définitive. Se reconnecter plus tard crée un nouveau compte, vide.</p>
</div>`,
      { lang, footer },
    );
  }

  const byEmail = address
    ? `<h2>Without the app</h2>
<p>Write to <a href="mailto:${address}">${address}</a> from the
e-mail address of the Google account you sign in to Ardoise with, asking for your account to
be deleted. It is deleted exactly as from the app, within a month, and you get a reply once it
is done.</p>`
    : '';
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
    { lang, footer },
  );
}
