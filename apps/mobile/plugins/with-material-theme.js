const { withAndroidStyles } = require('expo/config-plugins');

const MATERIAL_THEME = 'Theme.Material3.DayNight.NoActionBar';

/**
 * Stellt das Eltern-Theme von AppTheme auf Material 3. Der Datumsdialog mit
 * design="material" (@react-native-community/datetimepicker) verlangt das laut
 * README ("Android styling"); die Material-Bibliothek selbst bringt der Picker mit.
 */
module.exports = function withMaterialTheme(config) {
  return withAndroidStyles(config, (mod) => {
    const appTheme = (mod.modResults.resources.style ?? []).find((style) => style.$.name === 'AppTheme');
    if (!appTheme) {
      throw new Error('with-material-theme: AppTheme fehlt in styles.xml');
    }
    appTheme.$.parent = MATERIAL_THEME;
    return mod;
  });
};
