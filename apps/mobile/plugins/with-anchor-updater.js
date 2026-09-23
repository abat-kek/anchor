const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Haengt die Netzwerkkonfiguration des Moduls `anchor-updater` an die
 * <application>. Die XML-Datei selbst liegt als Ressource im Modul
 * (`modules/anchor-updater/android/src/main/res/xml/`) und wird beim Bauen in die
 * App gemischt; das Attribut kann ein Bibliotheksmanifest aber nicht setzen.
 */
module.exports = function withAnchorUpdater(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('with-anchor-updater: <application> fehlt im AndroidManifest');
    }
    application.$['android:networkSecurityConfig'] = '@xml/anchor_network_security_config';
    return mod;
  });
};
