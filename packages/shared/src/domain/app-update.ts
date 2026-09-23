/**
 * Selbstaktualisierung der Android-App ohne Play Store — die plattformfreie
 * Haelfte. Portiert aus der Pumpen-App (`data/update/UpdateInfo.kt`,
 * `UpdateController.kt`); das Vorgehen beschreibt
 * `homelab/HEIMAPPS-SELBSTUPDATE.md`. Download, Pruefsumme und Installer
 * liegen nativ im Modul `apps/mobile/modules/anchor-updater`, hier steht nur,
 * was rechnet: JSON pruefen, Version bewerten, Zustand fuehren.
 */

/** Inhalt von `anchor-latest.json`, geschrieben von `build.sh` auf CT 116. */
export interface UpdateInfo {
  versionCode: number;
  versionName: string;
  minVersionCode: number;
  /** SHA256 des APK, kleingeschrieben. */
  sha256: string;
  url: string;
}

export type UpdateEvaluation =
  | { kind: 'current' }
  | { kind: 'available'; info: UpdateInfo; isMandatory: boolean };

export type UpdateState =
  | { kind: 'none' }
  | { kind: 'available'; info: UpdateInfo; isMandatory: boolean }
  | { kind: 'downloading'; info: UpdateInfo; isMandatory: boolean; percent: number }
  | { kind: 'failed'; info: UpdateInfo; isMandatory: boolean }
  | { kind: 'ready'; info: UpdateInfo; isMandatory: boolean; fileUri: string };

/** Die nativen Faehigkeiten, die der Controller braucht — im Test eine Attrappe. */
export interface UpdateSource {
  /** `null` bei jedem Fehler (kein Netz, kaputte JSON). */
  fetchInfo(): Promise<UpdateInfo | null>;
  /** Liefert die Datei-URI des geprueften APK, `null` bei Abbruch oder falscher Pruefsumme. */
  download(info: UpdateInfo, onProgress: (percent: number) => void): Promise<string | null>;
}

/**
 * Abstand zwischen zwei erfolgreichen Abfragen. Haelt die Zahl der Abrufe klein,
 * ohne dass ein frisch ausgelieferter Pflicht-Build tagelang unbemerkt bleibt.
 */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Prueft die geladene JSON. Unbekannte Felder werden ignoriert, damit ein
 * spaeteres `build.sh` Felder ergaenzen kann, ohne alte Apps zu brechen.
 * Fehlt `minVersionCode`, gibt es keine Pflicht — lieber ein verpasstes
 * Pflicht-Update als eine App, die sich wegen eines Lesefehlers selbst aussperrt.
 */
export function parseUpdateInfo(raw: unknown): UpdateInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const { versionCode, versionName, url } = record;
  const minVersionCode = record.minVersionCode ?? 0;
  const sha256 = typeof record.sha256 === 'string' ? record.sha256.toLowerCase() : null;

  if (!isNonNegativeInteger(versionCode) || !isNonNegativeInteger(minVersionCode)) return null;
  if (typeof versionName !== 'string') return null;
  if (sha256 === null || !SHA256_PATTERN.test(sha256)) return null;
  if (!isHttpUrl(url)) return null;

  return { versionCode, versionName, minVersionCode, sha256, url };
}

/**
 * Pflicht heisst "installiert ist aelter als `minVersionCode`", nicht ein
 * Ja/Nein-Feld: so bleibt ein erzwungenes Update erzwungen, auch wenn danach ein
 * freiwilliger Build erscheint. Eine aeltere Serverversion (zurueckgerollter
 * Build) ist kein Update — ein Downgrade lehnt Android ohnehin ab.
 */
export function evaluateUpdate(info: UpdateInfo, installedVersionCode: number): UpdateEvaluation {
  if (info.versionCode <= installedVersionCode) return { kind: 'current' };
  return { kind: 'available', info, isMandatory: installedVersionCode < info.minVersionCode };
}

type Listener = (state: UpdateState) => void;

/**
 * Haelt den Update-Zustand app-weit. Gehoert auf Modulebene, nicht in eine
 * Komponente: ein Download soll die Navigation ueberleben.
 */
export class UpdateController {
  private state: UpdateState = { kind: 'none' };
  private readonly listeners = new Set<Listener>();
  private lastSuccessfulCheck: number | null = null;
  private runningCheck: Promise<void> | null = null;
  private runningDownload: Promise<void> | null = null;

  constructor(
    private readonly source: UpdateSource,
    private readonly installedVersionCode: number,
    private readonly now: () => number = Date.now,
  ) {}

  getState(): UpdateState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Bei jedem Wechsel in den Vordergrund aufrufen; der Abstand wird hier eingehalten. */
  check(): Promise<void> {
    if (this.runningCheck) return this.runningCheck;
    if (this.runningDownload) return Promise.resolve();
    // Ist schon etwas gefunden oder geladen, gibt es nichts neu zu fragen — ein
    // erneuter Abruf wuerde einen laufenden Download oder ein fertiges APK verwerfen.
    if (this.state.kind !== 'none') return Promise.resolve();
    if (
      this.lastSuccessfulCheck !== null &&
      this.now() - this.lastSuccessfulCheck < UPDATE_CHECK_INTERVAL_MS
    ) {
      return Promise.resolve();
    }
    this.runningCheck = this.runCheck().finally(() => {
      this.runningCheck = null;
    });
    return this.runningCheck;
  }

  startDownload(): Promise<void> {
    if (this.runningDownload) return Promise.resolve();
    const current = this.state;
    if (current.kind !== 'available' && current.kind !== 'failed') return Promise.resolve();
    const { info, isMandatory } = current;
    this.setState({ kind: 'downloading', info, isMandatory, percent: 0 });
    this.runningDownload = this.runDownload(info, isMandatory).finally(() => {
      this.runningDownload = null;
    });
    return this.runningDownload;
  }

  /**
   * "Spaeter" gilt bis zum naechsten erfolgreichen Abruf nach Ablauf des
   * Pruefabstands. Ein Pflicht-Update laesst sich nicht wegklicken — die
   * Oberflaeche bietet den Knopf dann nicht an, und hier wird es zusaetzlich
   * abgelehnt, damit das nicht an einer Stelle allein haengt.
   */
  postpone(): void {
    const current = this.state;
    if (current.kind !== 'available' && current.kind !== 'failed') return;
    if (!current.isMandatory) this.setState({ kind: 'none' });
  }

  private async runCheck(): Promise<void> {
    const info = await this.source.fetchInfo();
    // Nur ein erfolgreicher Abruf zaehlt: ohne Netz beim Start soll der naechste
    // Vordergrundwechsel es gleich wieder versuchen, nicht erst nach sechs Stunden.
    if (info === null) return;
    this.lastSuccessfulCheck = this.now();
    const evaluation = evaluateUpdate(info, this.installedVersionCode);
    if (evaluation.kind === 'available') {
      this.setState({ kind: 'available', info: evaluation.info, isMandatory: evaluation.isMandatory });
    }
  }

  private async runDownload(info: UpdateInfo, isMandatory: boolean): Promise<void> {
    const fileUri = await this.source.download(info, (percent) => {
      this.setState({ kind: 'downloading', info, isMandatory, percent });
    });
    this.setState(
      fileUri === null
        ? { kind: 'failed', info, isMandatory }
        : { kind: 'ready', info, isMandatory, fileUri },
    );
  }

  private setState(next: UpdateState): void {
    this.state = next;
    this.listeners.forEach((listener) => listener(next));
  }
}
