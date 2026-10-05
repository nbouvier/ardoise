/**
 * The privacy policy (`docs/specs/legal-pages.md`): GDPR articles 13–14, and the
 * public URL Google Play asks for.
 */

import { escapeHtml, legalFooter, page } from '../../http/html.js';
import type { Language } from '../../http/language.js';

import { mailto, type LegalIdentity } from './identity.js';

/** Change it with the text below. */
export const PRIVACY_UPDATED_ON = '2026-10-05';

export interface PrivacyFacts {
  /** How long an unused session lasts (`AUTH_REFRESH_TTL_SECONDS`), in days. */
  sessionDays: number;
}

// Retention stated below, kept in step with where it is set:
// - backups, 12 months: the off-site retention, 30 daily and 12 monthly copies
//   (`docs/OPERATIONS.md`, "Backups"), also on the deletion page;
// - error reports, 30 days: Sentry's retention on the plan in use
//   (`docs/LOGGING.md`).
export function renderPrivacyPolicy(
  identity: LegalIdentity,
  { sessionDays }: PrivacyFacts,
  lang: Language,
): string {
  const name = escapeHtml(identity.publisherName);
  const contact = mailto(identity.contact);

  const body =
    lang === 'fr'
      ? `<div class="prose">
<h1>Politique de confidentialité</h1>
<p>Ardoise est une application pour partager des dépenses entre amis, en famille ou en
colocation. Cette page explique quelles données elle traite, pourquoi, avec qui, combien de
temps, et comment exercer vos droits.</p>

<h2>Qui est responsable</h2>
<p>Le responsable du traitement est ${name}, qui édite Ardoise à titre personnel et non
professionnel (voir les <a href="/legal?lang=fr">mentions légales</a>). Pour toute question
ou demande&nbsp;: ${contact}.</p>

<h2>Les données traitées</h2>
<ul>
<li><strong>Votre compte Google</strong>, à chaque connexion&nbsp;: nom, adresse e-mail, photo
de profil et identifiant Google. Ardoise n’a jamais accès à votre mot de passe Google.</li>
<li><strong>Ce que vous saisissez</strong>&nbsp;: vos groupes et leurs noms&nbsp;; les transactions
(montant, date, titre, commentaire, catégorie, qui a payé, qui est concerné et pour quelle
part)&nbsp;; vos amis, vos invitations et vos favoris.</li>
<li><strong>Le nom de personnes sans compte</strong>, qu’un membre ajoute à un groupe pour
tenir les comptes avant qu’elles rejoignent Ardoise (voir plus bas).</li>
<li><strong>Des données techniques</strong>&nbsp;: les identifiants de votre session&nbsp;; en cas
d’erreur, un rapport (modèle d’appareil, système, version de l’application, ce qui a
échoué, identifiant interne de votre compte — jamais votre nom, votre e-mail ni un
montant).</li>
</ul>
<p>Votre adresse IP sert seulement, au moment de chaque requête, à limiter le trafic
abusif&nbsp;: elle n’est pas conservée dans les journaux du serveur. Ardoise n’affiche pas de
publicité, ne mesure pas l’audience, n’utilise aucun traceur et ne vend aucune donnée.</p>

<h2>Pourquoi, et sur quelle base</h2>
<ul>
<li><strong>Faire fonctionner le service</strong> (compte, groupes, soldes,
remboursements)&nbsp;: l’exécution du contrat que sont les
<a href="/terms?lang=fr">conditions d’utilisation</a>.</li>
<li><strong>Sécuriser le service, prévenir les abus, corriger les erreurs et sauvegarder
les données</strong>&nbsp;: l’intérêt légitime de l’éditeur à fournir un service fiable et
sûr.</li>
<li><strong>Le nom de personnes sans compte</strong>&nbsp;: l’intérêt légitime des membres d’un
groupe à tenir des comptes complets.</li>
</ul>

<h2>Qui voit vos données</h2>
<ul>
<li>Les <strong>membres d’un groupe</strong> voient le nom et la photo de chacun de ses
membres, et toutes ses transactions.</li>
<li>Vos <strong>amis</strong> voient votre nom et votre photo. Votre adresse e-mail n’est
montrée à aucun autre utilisateur.</li>
<li>Des <strong>prestataires</strong>, chacun pour sa seule tâche&nbsp;:
<ul>
<li>un hébergeur dans l’Union européenne, pour le serveur et la base de données (nommé dans
les <a href="/legal?lang=fr">mentions légales</a>)&nbsp;;</li>
<li>un service de stockage dans l’Union européenne, pour les sauvegardes, chiffrées avant
envoi et illisibles par lui&nbsp;;</li>
<li>Sentry (Functional Software, Inc.), pour les rapports d’erreur, stockés dans l’Union
européenne&nbsp;;</li>
<li>Google, pour la connexion&nbsp;; c’est aussi Google qui fournit les photos de
profil&nbsp;;</li>
<li>Expo (650 Industries, Inc.), qui distribue les mises à jour de l’application.</li>
</ul></li>
</ul>
<p>Aucune donnée n’est communiquée à quiconque d’autre, sauf obligation légale.</p>

<h2>Transferts hors de l’Union européenne</h2>
<p>Google, Expo et Sentry sont des sociétés américaines&nbsp;: certaines données peuvent leur
parvenir aux États-Unis. Ces transferts reposent sur le cadre de protection des données
UE–États-Unis (Data Privacy Framework) ou sur les clauses contractuelles types de la
Commission européenne.</p>

<h2>Combien de temps</h2>
<ul>
<li>Votre compte et ses données&nbsp;: jusqu’à ce que vous supprimiez votre compte.</li>
<li>Après une suppression, ne reste que ce que décrit la page
<a href="/delete-account?lang=fr">Supprimer son compte</a>&nbsp;: notamment les transactions
partagées avec d’autres, où votre part devient «&nbsp;Others&nbsp;» (des personnes hors du
groupe), sans lien avec vous.</li>
<li>Les sauvegardes&nbsp;: jusqu’à 12 mois. Elles ne servent qu’à restaurer le service, et
une restauration supprime à nouveau les comptes supprimés entre-temps.</li>
<li>Les rapports d’erreur&nbsp;: 30 jours.</li>
<li>Une session&nbsp;: jusqu’à la déconnexion, et au plus ${sessionDays} jours sans
utilisation.</li>
<li>Les journaux du serveur&nbsp;: jusqu’à leur rotation automatique. Ils ne contiennent que
des identifiants internes.</li>
</ul>

<h2>Vos droits</h2>
<p>Vous pouvez accéder à vos données, les rectifier, les effacer, en limiter le traitement,
vous y opposer et les recevoir dans un format réutilisable (portabilité). Écrivez à
${contact} depuis l’adresse de votre compte Google&nbsp;; la réponse vient dans un délai d’un
mois.</p>
<p>Vous pouvez aussi supprimer votre compte directement dans l’application
(<strong>Account</strong>, puis <strong>Delete account</strong>). Votre nom et votre photo viennent
de Google&nbsp;: modifiez-les dans votre compte Google, Ardoise les reprend à la connexion
suivante.</p>
<p>Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une
réclamation à la CNIL (<a href="https://www.cnil.fr">cnil.fr</a>), ou à l’autorité de
protection des données du pays où vous résidez.</p>

<h2>Si quelqu’un vous a ajouté par votre nom</h2>
<p>Un membre peut ajouter à un groupe une personne qui n’a pas de compte, en indiquant
seulement son nom. Si c’est votre cas, vous pouvez rejoindre le groupe et dire que c’est
vous, ou demander à ${contact} que votre nom soit effacé.</p>

<h2>Âge minimum</h2>
<p>Ardoise est réservée aux personnes de 15 ans ou plus.</p>

<h2>Sécurité</h2>
<p>Les échanges avec le serveur sont chiffrés (HTTPS), les sauvegardes sont chiffrées, et
seul l’éditeur a accès au serveur.</p>

<h2>Sur votre appareil</h2>
<p>L’application garde les identifiants de votre session dans le stockage sécurisé du
système. Ni l’application ni ces pages n’utilisent de cookie.</p>

<h2>Modifications</h2>
<p>La date de dernière mise à jour figure en bas de cette page. Toute modification
importante sera annoncée dans l’application.</p>
</div>`
      : `<div class="prose">
<h1>Privacy policy</h1>
<p>This English version is a translation; the French version prevails.</p>
<p>Ardoise is an app for sharing expenses among friends, family or flatmates. This page
explains what data it processes, why, with whom, for how long, and how to exercise your
rights.</p>

<h2>Who is responsible</h2>
<p>The controller is ${name}, who publishes Ardoise as a private individual, on a
non-professional basis (see the <a href="/legal?lang=en">legal notice</a>). For any question
or request: ${contact}.</p>

<h2>The data processed</h2>
<ul>
<li><strong>Your Google account</strong>, at each sign-in: name, e-mail address, profile
picture and Google identifier. Ardoise never has access to your Google password.</li>
<li><strong>What you enter</strong>: your groups and their names; transactions (amount, date,
title, comment, category, who paid, who it concerns and for what share); your friends,
invitations and favorites.</li>
<li><strong>The names of people without an account</strong>, which a member adds to a group to
keep its accounts before they join Ardoise (see below).</li>
<li><strong>Technical data</strong>: your session credentials; when something fails, an error
report (device model, operating system, app version, what failed, your account’s internal
identifier — never your name, your e-mail or an amount).</li>
</ul>
<p>Your IP address is only used, at the time of each request, to limit abusive traffic: it
is not kept in the server’s logs. Ardoise shows no advertising, measures no audience, uses no
tracker and sells no data.</p>

<h2>Why, and on what basis</h2>
<ul>
<li><strong>Running the service</strong> (account, groups, balances, reimbursements): the
performance of the contract formed by the <a href="/terms?lang=en">terms of use</a>.</li>
<li><strong>Securing the service, preventing abuse, fixing errors and backing data
up</strong>: the publisher’s legitimate interest in a reliable, secure service.</li>
<li><strong>The names of people without an account</strong>: the legitimate interest of a
group’s members in keeping complete accounts.</li>
</ul>

<h2>Who sees your data</h2>
<ul>
<li><strong>Members of a group</strong> see the name and picture of each of its members, and
all its transactions.</li>
<li>Your <strong>friends</strong> see your name and picture. Your e-mail address is shown to
no other user.</li>
<li><strong>Service providers</strong>, each for its own task only:
<ul>
<li>a hosting provider in the European Union, for the server and the database (named in
the <a href="/legal?lang=en">legal notice</a>);</li>
<li>a storage service in the European Union, for backups, encrypted before they are sent
and unreadable by it;</li>
<li>Sentry (Functional Software, Inc.), for error reports, stored in the European
Union;</li>
<li>Google, for sign-in; Google also serves profile pictures;</li>
<li>Expo (650 Industries, Inc.), which delivers the app’s updates.</li>
</ul></li>
</ul>
<p>No data is passed to anyone else, unless the law requires it.</p>

<h2>Transfers outside the European Union</h2>
<p>Google, Expo and Sentry are US companies: some data may reach them in the United States.
These transfers rely on the EU–US Data Privacy Framework or on the European Commission’s
standard contractual clauses.</p>

<h2>For how long</h2>
<ul>
<li>Your account and its data: until you delete your account.</li>
<li>After a deletion, only what the <a href="/delete-account?lang=en">Delete your account</a>
page describes remains: in particular the transactions shared with other people, where your
part becomes “Others” (people outside the group), with no link to you.</li>
<li>Backups: up to 12 months. They are only used to restore the service, and a restore
deletes again the accounts deleted in the meantime.</li>
<li>Error reports: 30 days.</li>
<li>A session: until you sign out, and at most ${sessionDays} days without use.</li>
<li>Server logs: until they are automatically rotated. They hold only internal
identifiers.</li>
</ul>

<h2>Your rights</h2>
<p>You can access your data, correct it, erase it, restrict or object to its processing,
and receive it in a reusable format (portability). Write to ${contact} from your Google
account’s address; you will get an answer within one month.</p>
<p>You can also delete your account directly in the app (<strong>Account</strong>, then
<strong>Delete account</strong>). Your name and picture come from Google: change them in your
Google account, and Ardoise picks them up at your next sign-in.</p>
<p>If you believe your rights are not respected, you can complain to the CNIL, the French
data protection authority (<a href="https://www.cnil.fr">cnil.fr</a>), or to the authority of
the country where you live.</p>

<h2>If someone added you by name</h2>
<p>A member can add a person without an account to a group, giving only their name. If that
is you, you can join the group and say it is you, or ask ${contact} to erase your
name.</p>

<h2>Minimum age</h2>
<p>Ardoise is for people aged 15 or over.</p>

<h2>Security</h2>
<p>Exchanges with the server are encrypted (HTTPS), backups are encrypted, and only the
publisher has access to the server.</p>

<h2>On your device</h2>
<p>The app keeps your session credentials in the system’s secure storage. Neither the app
nor these pages use cookies.</p>

<h2>Changes</h2>
<p>The date of the last update is at the bottom of this page. Any material change will be
announced in the app.</p>
</div>`;

  return page(
    lang === 'fr' ? 'Politique de confidentialité — Ardoise' : 'Privacy policy — Ardoise',
    body,
    { lang, footer: legalFooter('/privacy', lang, PRIVACY_UPDATED_ON) },
  );
}
