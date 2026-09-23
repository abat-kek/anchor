import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { UpdateState } from '@anchor/shared';
import { installReadyUpdate, updateController } from '../../lib/app-update';

interface UpdateBannerProps {
  state: UpdateState;
}

function describe(state: Exclude<UpdateState, { kind: 'none' }>): string {
  const version = state.info.versionName;
  switch (state.kind) {
    case 'available':
      return state.isMandatory
        ? `Diese Version wird nicht mehr unterstützt. Bitte auf ${version} aktualisieren.`
        : `Neue Version ${version} verfügbar.`;
    case 'downloading':
      return `Lade ${version} … ${state.percent} %`;
    case 'failed':
      return 'Der Download ist fehlgeschlagen.';
    case 'ready':
      return `${version} ist geladen.`;
  }
}

/**
 * Nur auf dem Startscreen und im Pflicht-Vollbild — nie auf der Trip-Seite: der
 * Installer beendet den App-Prozess, ein halb ausgefuelltes Formular waere weg.
 */
export function UpdateBanner({ state }: UpdateBannerProps) {
  const isReady = state.kind === 'ready';

  // Ist das APK geladen und geprueft, startet der Installer ohne weiteren Tipp.
  useEffect(() => {
    if (isReady) installReadyUpdate();
  }, [isReady]);

  if (state.kind === 'none') return null;

  const canPostpone = !state.isMandatory && (state.kind === 'available' || state.kind === 'failed');
  const actionLabel =
    state.kind === 'available'
      ? 'Aktualisieren'
      : state.kind === 'failed'
        ? 'Erneut versuchen'
        : state.kind === 'ready'
          ? 'Installieren'
          : null;

  function handleAction() {
    if (state.kind === 'ready') installReadyUpdate();
    else void updateController?.startDownload();
  }

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>{describe(state)}</Text>
      <View style={styles.actions}>
        {canPostpone && (
          <Pressable onPress={() => updateController?.postpone()} style={styles.secondary}>
            <Text style={styles.secondaryText}>Später</Text>
          </Pressable>
        )}
        {actionLabel && (
          <Pressable onPress={handleAction} style={styles.primary}>
            <Text style={styles.primaryText}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    backgroundColor: '#17171d',
    borderWidth: 1,
    borderColor: '#2f6fed',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  text: { color: '#fff', fontSize: 15 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  primary: { backgroundColor: '#2f6fed', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary: { paddingHorizontal: 16, paddingVertical: 10 },
  secondaryText: { color: '#fff', opacity: 0.7, fontSize: 15 },
});
