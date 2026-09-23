// Ergaenzt app.json um die Werte, die erst beim Bauen feststehen. build.sh auf
// CT 116 setzt ANCHOR_VERSION_CODE (Minuten seit 2024-01-01 UTC) und
// ANCHOR_VERSION_NAME; ohne sie entsteht Version 1 — ein lokaler Build ueberholt
// so nie ein ausgeliefertes APK (HEIMAPPS-SELBSTUPDATE.md).
const DEFAULT_VERSION_CODE = 1;

function readVersionCode() {
  const raw = process.env.ANCHOR_VERSION_CODE;
  if (raw === undefined || raw === '') return DEFAULT_VERSION_CODE;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`ANCHOR_VERSION_CODE ist keine positive ganze Zahl: ${raw}`);
  }
  return parsed;
}

module.exports = ({ config }) => ({
  ...config,
  version: process.env.ANCHOR_VERSION_NAME || '0.0.0-lokal',
  android: { ...config.android, versionCode: readVersionCode() },
  plugins: [...(config.plugins ?? []), './plugins/with-anchor-updater'],
});
