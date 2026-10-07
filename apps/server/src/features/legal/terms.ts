/**
 * The terms of use — *conditions générales d'utilisation*
 * (`docs/specs/legal-pages.md`): the rules of use, and what Ardoise does not
 * promise. Accepted by creating an account or signing in.
 */

import { escapeHtml, legalFooter, page } from '../../http/html.js';
import type { Language } from '../../http/language.js';

import type { LegalIdentity } from './identity.js';

/** Change it with the text below. */
export const TERMS_UPDATED_ON = '2026-10-07';

export function renderTerms(identity: LegalIdentity, lang: Language): string {
  const name = escapeHtml(identity.publisherName);

  const body =
    lang === 'fr'
      ? `<div class="prose">
<h1>Conditions d’utilisation</h1>
<p>Ces conditions encadrent l’utilisation d’Ardoise, éditée par ${name} (voir les
<a href="/legal?lang=fr">mentions légales</a>). En créant un compte ou en vous connectant,
avec une adresse e-mail ou avec Google, vous les acceptez.</p>
<h2>Le service</h2>
<p>Ardoise permet de suivre des dépenses partagées&nbsp;: qui a payé quoi, qui doit combien
à qui, et comment rembourser. Ardoise <strong>ne détient ni ne transfère d’argent</strong>&nbsp;:
les remboursements se font directement entre les personnes concernées, en dehors de
l’application. Les soldes et les plans de remboursement sont calculés uniquement à partir
de ce que les membres saisissent&nbsp;; Ardoise ne garantit pas qu’ils correspondent à la
réalité.</p>
<h2>Accès</h2>
<p>Ardoise est gratuite. Il faut avoir au moins 15 ans, et une adresse e-mail ou un compte
Google.</p>
<h2>Vos engagements</h2>
<ul>
<li>Saisir des informations exactes et licites.</li>
<li>Ne rien écrire d’injurieux, de haineux, de diffamatoire ou d’illicite dans les noms,
titres et commentaires.</li>
<li>N’ajouter une personne par son nom que si elle prend vraiment part aux dépenses du
groupe, en sachant que les autres membres le verront.</li>
<li>Ne pas chercher à perturber le service ni à accéder aux données d’autrui.</li>
<li>Garder votre mot de passe pour vous, et ne créer un compte qu’avec une adresse e-mail
qui est la vôtre.</li>
</ul>
<p>Vous êtes responsable de ce que vous saisissez.</p>
<h2>Ce qui est partagé</h2>
<p>Ce que vous saisissez dans un groupe est visible par tous ses membres, et chacun d’eux
peut le modifier ou le supprimer. N’y mettez que ce que vous acceptez de partager avec
eux.</p>
<h2>Disponibilité</h2>
<p>Ardoise est fournie telle quelle, par un particulier, sans garantie de disponibilité ni
d’absence d’erreur. Le service peut évoluer, être interrompu ou s’arrêter&nbsp;; avant un
arrêt définitif, vous serez prévenu dans un délai raisonnable lorsque c’est possible.</p>
<h2>Suspension</h2>
<p>Un compte qui ne respecte pas ces conditions peut être suspendu ou supprimé.</p>
<h2>Responsabilité</h2>
<p>Dans les limites permises par la loi, l’éditeur n’est pas responsable des pertes liées
à l’utilisation d’Ardoise, notamment d’un solde erroné. Ardoise n’intervient pas dans les
désaccords entre membres.</p>
<h2>Fin</h2>
<p>Vous pouvez arrêter à tout moment en supprimant votre compte, dans l’application ou
comme l’indique la page <a href="/delete-account?lang=fr">Supprimer son compte</a>.</p>
<h2>Modifications</h2>
<p>Ces conditions peuvent changer&nbsp;; tout changement important sera annoncé dans
l’application. Continuer à utiliser Ardoise après un changement vaut acceptation.</p>
<h2>Droit applicable</h2>
<p>Ces conditions sont soumises au droit français. En cas de litige, une solution amiable
est d’abord recherchée&nbsp;; à défaut, les tribunaux compétents sont ceux que désigne la
loi, y compris, pour un consommateur, ceux de son domicile.</p>
</div>`
      : `<div class="prose">
<h1>Terms of use</h1>
<p>This English version is a translation; the French version prevails.</p>
<p>These terms govern the use of Ardoise, published by ${name} (see the
<a href="/legal?lang=en">legal notice</a>). By creating an account or signing in, with an
e-mail address or with Google, you accept them.</p>
<h2>The service</h2>
<p>Ardoise tracks shared expenses: who paid for what, who owes how much to whom, and how to
pay it back. Ardoise <strong>holds and moves no money</strong>: people pay each other back
directly, outside the app. Balances and reimbursement plans are computed only from what
members enter; Ardoise does not guarantee that they match reality.</p>
<h2>Access</h2>
<p>Ardoise is free. You must be 15 or older, and have an e-mail address or a Google
account.</p>
<h2>Your commitments</h2>
<ul>
<li>Enter accurate, lawful information.</li>
<li>Write nothing insulting, hateful, defamatory or unlawful in names, titles and
comments.</li>
<li>Add a person by name only when they really take part in the group’s expenses, knowing
the other members will see it.</li>
<li>Do not try to disrupt the service or to reach other people’s data.</li>
<li>Keep your password to yourself, and only create an account with an e-mail address that
is yours.</li>
</ul>
<p>You are responsible for what you enter.</p>
<h2>What is shared</h2>
<p>What you enter in a group is visible to all its members, and any of them can change or
remove it. Only put there what you are willing to share with them.</p>
<h2>Availability</h2>
<p>Ardoise is provided as is, by a private individual, with no guarantee that it is always
available or free of errors. The service may change, be interrupted or stop; before it
stops for good, you will be told reasonably in advance when possible.</p>
<h2>Suspension</h2>
<p>An account that breaks these terms may be suspended or deleted.</p>
<h2>Liability</h2>
<p>As far as the law allows, the publisher is not liable for losses arising from the use of
Ardoise, in particular from a wrong balance. Ardoise plays no part in disagreements between
members.</p>
<h2>Ending</h2>
<p>You can stop at any time by deleting your account, in the app or as the
<a href="/delete-account?lang=en">Delete your account</a> page describes.</p>
<h2>Changes</h2>
<p>These terms may change; any material change will be announced in the app. Continuing to
use Ardoise after a change means accepting it.</p>
<h2>Governing law</h2>
<p>These terms are governed by French law. In a dispute, an amicable solution is sought
first; failing that, the competent courts are those the law designates, including, for a
consumer, those of their place of residence.</p>
</div>`;

  return page(lang === 'fr' ? 'Conditions d’utilisation — Ardoise' : 'Terms of use — Ardoise', body, {
    lang,
    footer: legalFooter('/terms', lang, TERMS_UPDATED_ON),
  });
}
