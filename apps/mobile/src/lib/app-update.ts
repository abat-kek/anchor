import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  UpdateController,
  parseUpdateInfo,
  type UpdateInfo,
  type UpdateSource,
  type UpdateState,
} from '@anchor/shared';
import { AnchorUpdater } from '../../modules/anchor-updater';

// Geschrieben von build.sh auf CT 116, neben dem APK (HEIMAPPS-SELBSTUPDATE.md).
const UPDATE_INFO_URL = 'https://apk.kek.de/anchor/anchor-latest.json';

type NativeUpdater = NonNullable<typeof AnchorUpdater>;

function createSource(updater: NativeUpdater): UpdateSource {
  return {
    async fetchInfo(): Promise<UpdateInfo | null> {
      const text = await updater.fetchText(UPDATE_INFO_URL);
      if (text === null) return null;
      try {
        return parseUpdateInfo(JSON.parse(text));
      } catch {
        return null;
      }
    },
    async download(info, onProgress) {
      const subscription = updater.addListener('onDownloadProgress', ({ percent }) =>
        onProgress(percent),
      );
      try {
        return await updater.downloadApk(info.url, info.sha256);
      } finally {
        subscription.remove();
      }
    },
  };
}

/**
 * App-weit ein Controller, auf Modulebene statt in einer Komponente: ein
 * Download soll die Navigation ueberleben. `null`, wo es kein natives Modul gibt.
 */
export const updateController: UpdateController | null = AnchorUpdater
  ? new UpdateController(createSource(AnchorUpdater), AnchorUpdater.getInstalledVersionCode())
  : null;

// Gesetzt, wenn der Nutzer fuer die Installationserlaubnis in die Einstellungen
// geschickt wurde. Nach der Rueckkehr wird die Installation von selbst erneut
// versucht — niemand soll danach noch einmal druecken muessen.
let isAwaitingInstallPermission = false;

/** Startet den Installer fuer ein fertig geladenes, geprueftes APK. */
export function installReadyUpdate(): void {
  const state = updateController?.getState();
  if (!AnchorUpdater || state?.kind !== 'ready') return;
  if (!AnchorUpdater.canRequestPackageInstalls()) {
    isAwaitingInstallPermission = true;
    AnchorUpdater.openInstallPermissionSettings();
    return;
  }
  isAwaitingInstallPermission = false;
  AnchorUpdater.installApk(state.fileUri);
}

/**
 * Einmal im Wurzel-Layout aufrufen: prueft beim Start und bei jedem Wechsel in
 * den Vordergrund; der Controller haelt den Abstand von sechs Stunden selbst ein.
 */
export function useUpdateCheckOnForeground(): void {
  useEffect(() => {
    if (!updateController) return;
    void updateController.check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (isAwaitingInstallPermission) installReadyUpdate();
      void updateController?.check();
    });
    return () => subscription.remove();
  }, []);
}

export function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>(
    () => updateController?.getState() ?? { kind: 'none' },
  );
  useEffect(() => updateController?.subscribe(setState), []);
  return state;
}
