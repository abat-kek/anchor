import { describe, it, expect } from 'vitest';
import {
  UPDATE_CHECK_INTERVAL_MS,
  UpdateController,
  evaluateUpdate,
  parseUpdateInfo,
  type UpdateInfo,
  type UpdateSource,
  type UpdateState,
} from '../src/domain/app-update';

const SHA = 'a'.repeat(64);

function info(versionCode: number, minVersionCode = 0): UpdateInfo {
  return {
    versionCode,
    versionName: 'x',
    minVersionCode,
    sha256: SHA,
    url: 'https://apk.kek.de/anchor/anchor-1.apk',
  };
}

describe('evaluateUpdate', () => {
  it('treats the same version as current', () => {
    expect(evaluateUpdate(info(100), 100)).toEqual({ kind: 'current' });
  });

  it('treats a higher version as a voluntary update', () => {
    expect(evaluateUpdate(info(101), 100)).toEqual({
      kind: 'available',
      info: info(101),
      isMandatory: false,
    });
  });

  it('makes the update mandatory when the installed version is below minVersionCode', () => {
    expect(evaluateUpdate(info(105, 103), 102)).toMatchObject({ isMandatory: true });
  });

  it('keeps an earlier mandatory update in force after a later voluntary build', () => {
    // Build 103 hat die Pflicht gesetzt, 105 ist freiwillig — wer auf 102 sitzt, muss trotzdem.
    expect(evaluateUpdate(info(105, 103), 102)).toMatchObject({ isMandatory: true });
    expect(evaluateUpdate(info(105, 103), 104)).toMatchObject({ isMandatory: false });
  });

  it('does not offer an older server version as an update', () => {
    expect(evaluateUpdate(info(99), 100)).toEqual({ kind: 'current' });
  });
});

describe('parseUpdateInfo', () => {
  const valid = {
    versionCode: 5,
    versionName: '2026.09.23-1412',
    minVersionCode: 3,
    sha256: SHA,
    url: 'https://apk.kek.de/anchor/anchor-20260923-1412.apk',
  };

  it('reads a complete document', () => {
    expect(parseUpdateInfo(valid)).toEqual(valid);
  });

  it('defaults a missing minVersionCode to 0 and ignores unknown fields', () => {
    const { minVersionCode: _omitted, ...rest } = valid;
    expect(parseUpdateInfo({ ...rest, newField: 1 })).toEqual({ ...rest, minVersionCode: 0 });
  });

  it('normalizes the checksum to lower case', () => {
    expect(parseUpdateInfo({ ...valid, sha256: 'A'.repeat(64) })?.sha256).toBe(SHA);
  });

  it.each([
    ['not an object', 'text'],
    ['null', null],
    ['non-integer versionCode', { ...valid, versionCode: 1.5 }],
    ['missing versionName', { ...valid, versionName: undefined }],
    ['checksum of wrong length', { ...valid, sha256: 'ab' }],
    ['checksum with non-hex characters', { ...valid, sha256: 'z'.repeat(64) }],
    ['url with an unsupported scheme', { ...valid, url: 'file:///sdcard/a.apk' }],
    ['url that does not parse', { ...valid, url: 'kein link' }],
    ['negative minVersionCode', { ...valid, minVersionCode: -1 }],
  ])('rejects %s', (_label, input) => {
    expect(parseUpdateInfo(input)).toBeNull();
  });
});

class FakeSource implements UpdateSource {
  infoResults: (UpdateInfo | null)[] = [];
  fetchCount = 0;
  downloadResult: string | null = 'file:///cache/updates/anchor.apk';
  pendingDownload: ((uri: string | null) => void) | null = null;
  holdDownload = false;
  progressSteps: number[] = [];

  async fetchInfo(): Promise<UpdateInfo | null> {
    this.fetchCount += 1;
    return this.infoResults.shift() ?? null;
  }

  download(_info: UpdateInfo, onProgress: (percent: number) => void): Promise<string | null> {
    this.progressSteps.forEach(onProgress);
    if (this.holdDownload) {
      return new Promise((resolve) => {
        this.pendingDownload = resolve;
      });
    }
    return Promise.resolve(this.downloadResult);
  }
}

function setup(installed = 100) {
  const source = new FakeSource();
  let now = 1_000_000;
  const controller = new UpdateController(source, installed, () => now);
  const states: UpdateState[] = [];
  controller.subscribe((state) => states.push(state));
  return {
    source,
    controller,
    states,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('UpdateController', () => {
  it('starts with no update', () => {
    const { controller } = setup();
    expect(controller.getState()).toEqual({ kind: 'none' });
  });

  it('reports an available update after a successful check', async () => {
    const { source, controller } = setup();
    source.infoResults = [info(101)];
    await controller.check();
    expect(controller.getState()).toEqual({ kind: 'available', info: info(101), isMandatory: false });
  });

  it('stays at none when the server offers nothing newer', async () => {
    const { source, controller } = setup();
    source.infoResults = [info(100)];
    await controller.check();
    expect(controller.getState()).toEqual({ kind: 'none' });
  });

  it('does not ask again within the check interval after a successful check', async () => {
    const { source, controller, advance } = setup();
    source.infoResults = [info(100), info(100)];
    await controller.check();
    advance(UPDATE_CHECK_INTERVAL_MS - 1);
    await controller.check();
    expect(source.fetchCount).toBe(1);
    advance(1);
    await controller.check();
    expect(source.fetchCount).toBe(2);
  });

  it('asks again right away after a failed check', async () => {
    const { source, controller } = setup();
    source.infoResults = [null, info(101)];
    await controller.check();
    await controller.check();
    expect(source.fetchCount).toBe(2);
    expect(controller.getState()).toMatchObject({ kind: 'available' });
  });

  it('runs only one check at a time', async () => {
    const { source, controller } = setup();
    source.infoResults = [info(101)];
    await Promise.all([controller.check(), controller.check()]);
    expect(source.fetchCount).toBe(1);
  });

  it('does not check again once an update was found', async () => {
    const { source, controller, advance } = setup();
    source.infoResults = [info(101), info(102)];
    await controller.check();
    advance(UPDATE_CHECK_INTERVAL_MS);
    await controller.check();
    expect(source.fetchCount).toBe(1);
  });

  it('downloads with progress and ends ready with the file', async () => {
    const { source, controller, states } = setup();
    source.infoResults = [info(101)];
    source.progressSteps = [40, 100];
    await controller.check();
    await controller.startDownload();
    expect(states).toContainEqual({ kind: 'downloading', info: info(101), isMandatory: false, percent: 40 });
    expect(controller.getState()).toEqual({
      kind: 'ready',
      info: info(101),
      isMandatory: false,
      fileUri: 'file:///cache/updates/anchor.apk',
    });
  });

  it('ends in failed when the download or checksum fails, and can retry from there', async () => {
    const { source, controller } = setup();
    source.infoResults = [info(101)];
    source.downloadResult = null;
    await controller.check();
    await controller.startDownload();
    expect(controller.getState()).toEqual({ kind: 'failed', info: info(101), isMandatory: false });
    source.downloadResult = 'file:///cache/updates/anchor.apk';
    await controller.startDownload();
    expect(controller.getState()).toMatchObject({ kind: 'ready' });
  });

  it('runs only one download at a time', async () => {
    const { source, controller } = setup();
    source.infoResults = [info(101)];
    source.holdDownload = true;
    await controller.check();
    const first = controller.startDownload();
    await controller.startDownload();
    expect(controller.getState()).toMatchObject({ kind: 'downloading' });
    source.pendingDownload?.('file:///cache/updates/anchor.apk');
    await first;
    expect(controller.getState()).toMatchObject({ kind: 'ready' });
  });

  it('lets a voluntary update be postponed', async () => {
    const { source, controller } = setup();
    source.infoResults = [info(101)];
    await controller.check();
    controller.postpone();
    expect(controller.getState()).toEqual({ kind: 'none' });
  });

  it('refuses to postpone a mandatory update', async () => {
    const { source, controller } = setup(102);
    source.infoResults = [info(105, 103)];
    await controller.check();
    controller.postpone();
    expect(controller.getState()).toEqual({ kind: 'available', info: info(105, 103), isMandatory: true });
  });

  it('stops notifying after unsubscribe', async () => {
    const { source, controller } = setup();
    const seen: UpdateState[] = [];
    const unsubscribe = controller.subscribe((state) => seen.push(state));
    unsubscribe();
    source.infoResults = [info(101)];
    await controller.check();
    expect(seen).toEqual([]);
  });
});
