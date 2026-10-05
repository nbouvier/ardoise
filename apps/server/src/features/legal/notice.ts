/**
 * The legal notice — *mentions légales* (`docs/specs/legal-pages.md`): who
 * publishes Ardoise and who hosts it, as French law requires.
 */

import { escapeHtml, legalFooter, page } from '../../http/html.js';
import type { Language } from '../../http/language.js';

import { mailto, type LegalIdentity } from './identity.js';

/** Change it with the text below. */
export const NOTICE_UPDATED_ON = '2026-10-05';

export function renderLegalNotice(identity: LegalIdentity, lang: Language): string {
  const name = escapeHtml(identity.publisherName);
  const contact = mailto(identity.contact);
  const host = [identity.hostName, identity.hostAddress, identity.hostPhone]
    .map(escapeHtml)
    .join('<br>');

  const body =
    lang === 'fr'
      ? `<div class="prose">
<h1>Mentions légales</h1>
<h2>Éditeur</h2>
<p>Ardoise est éditée par ${name}, à titre personnel et non professionnel.
Contact&nbsp;: ${contact}.</p>
<p>Directeur de la publication&nbsp;: ${name}.</p>
<p>Comme le permet la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l’économie
numérique à une personne éditant un service à titre non professionnel, l’adresse de
l’éditeur n’est pas publiée&nbsp;: ses éléments d’identification ont été communiqués à
l’hébergeur.</p>
<h2>Hébergeur</h2>
<p>${host}</p>
<h2>Code source</h2>
<p>Le code source d’Ardoise est public, sous licence GNU Affero General Public License,
version 3 (AGPL-3.0).</p>
<h2>Données personnelles</h2>
<p>Ce qu’Ardoise fait de vos données est décrit dans la
<a href="/privacy?lang=fr">politique de confidentialité</a>.</p>
</div>`
      : `<div class="prose">
<h1>Legal notice</h1>
<p>This English version is a translation; the French version prevails.</p>
<h2>Publisher</h2>
<p>Ardoise is published by ${name}, as a private individual, on a non-professional
basis. Contact: ${contact}.</p>
<p>Director of publication: ${name}.</p>
<p>As French law (loi n° 2004-575 du 21 juin 2004 pour la confiance dans l’économie
numérique) allows a person publishing on a non-professional basis, the publisher’s address
is not published: their identification details have been given to the hosting
provider.</p>
<h2>Hosting provider</h2>
<p>${host}</p>
<h2>Source code</h2>
<p>Ardoise’s source code is public, under the GNU Affero General Public License, version 3
(AGPL-3.0).</p>
<h2>Personal data</h2>
<p>What Ardoise does with your data is described in the
<a href="/privacy?lang=en">privacy policy</a>.</p>
</div>`;

  return page(lang === 'fr' ? 'Mentions légales — Ardoise' : 'Legal notice — Ardoise', body, {
    lang,
    footer: legalFooter('/legal', lang, NOTICE_UPDATED_ON),
  });
}
