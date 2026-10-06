/**
 * Android App Links: what lets an invitation link (`https://<host>/i/<code>`) open
 * the app itself, and only it. The `ardoise://` scheme cannot promise that — any app
 * may declare it and would then receive the code.
 *
 * - `/.well-known/assetlinks.json` vouches for the app (its id and signing
 *   certificates), so Android hands this host's links straight to it, without
 *   showing the landing page;
 * - when the page is shown anyway (app not installed, link opened somewhere that
 *   ignores App Links), its button uses an intent that names the app.
 */

/** The application a deployment's links open. */
export interface AndroidApp {
  appId?: string | undefined;
  certFingerprints?: readonly string[] | undefined;
}

/** The Digital Asset Links statement, or null when the deployment has none to make. */
export function assetLinks(app: AndroidApp): unknown[] | null {
  if (!app.appId || !app.certFingerprints?.length) {
    return null;
  }
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: app.appId,
        sha256_cert_fingerprints: app.certFingerprints,
      },
    },
  ];
}

/** Whether a request comes from an Android browser. */
export function isAndroid(userAgent: string | undefined): boolean {
  return /\bAndroid\b/i.test(userAgent ?? '');
}
