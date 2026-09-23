const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Haengt die Netzwerkkonfiguration des Moduls `anchor-updater` an die
 * <application>. Die XML-Datei selbst liegt als Ressource im Modul
 * (`modules/anchor-updater/android/src/main/res/xml/`) und wird beim Bauen in die
 * App gemischt; das Attribut kann ein Bibliotheksmanifest aber nicht setzen.
 *
 * Nur fuer die Release-Builds von build.sh (erkennbar an ANCHOR_VERSION_CODE):
 * sobald eine networkSecurityConfig gesetzt ist, verbietet Android jeden
 * Klartextverkehr, und ein lokaler Debug-Build bekaeme sein Metro-Bundle ueber
 * http:// nicht mehr. Ohne die Konfiguration scheitert dort nur der
 * Update-Abruf — den braucht ein Debug-Build nicht.
 */
module.exports = function withAnchorUpdater(config) {
  if (!process.env.ANCHOR_VERSION_CODE) return config;
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('with-anchor-updater: <application> fehlt im AndroidManifest');
    }
    application.$['android:networkSecurityConfig'] = '@xml/anchor_network_security_config';
    return mod;
  });
};
