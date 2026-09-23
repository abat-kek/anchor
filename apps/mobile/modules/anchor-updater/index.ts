import { NativeModule, requireOptionalNativeModule } from 'expo';

type AnchorUpdaterEvents = {
  onDownloadProgress: (event: { percent: number }) => void;
};

declare class AnchorUpdaterNativeModule extends NativeModule<AnchorUpdaterEvents> {
  getInstalledVersionCode(): number;
  fetchText(url: string): Promise<string | null>;
  downloadApk(url: string, sha256: string): Promise<string | null>;
  canRequestPackageInstalls(): boolean;
  openInstallPermissionSettings(): void;
  installApk(path: string): boolean;
}

/**
 * `null` ausserhalb eines Android-Release-Builds (Expo Go, Web, iOS) — dort gibt
 * es keine Selbstaktualisierung, und die App soll trotzdem laufen.
 */
export const AnchorUpdater =
  requireOptionalNativeModule<AnchorUpdaterNativeModule>('AnchorUpdater');
