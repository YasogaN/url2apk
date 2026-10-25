import { Data, NtExecutable, NtExecutableResource, Resource } from "resedit";

export function minimalPe(): Uint8Array {
  const bytes = new Uint8Array(0x80);
  bytes[0] = 0x4d;
  bytes[1] = 0x5a;
  new DataView(bytes.buffer).setUint32(0x3c, 0x40, true);
  bytes[0x40] = 0x50;
  bytes[0x41] = 0x45;
  bytes[0x42] = 0;
  bytes[0x43] = 0;
  return bytes;
}

export function minimalElf(): Uint8Array {
  return Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]);
}

export function fixturePng(width = 256, height = 256): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}


export function minimalAppImage(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x7f, 0x45, 0x4c, 0x46], 0);
  bytes[8] = 0x41;
  bytes[9] = 0x49;
  bytes[10] = 0x02;
  return bytes;
}

export function minimalPng(): Uint8Array {
  return fixturePng(1, 1);
}

export type PeFixtureOptions = {
  icon?: boolean;
  version?: boolean;
  versionStrings?: boolean;
};

export function fixturePe({
  icon = true,
  version = true,
  versionStrings = true,
}: PeFixtureOptions = {}): Uint8Array {
  const exe = NtExecutable.createEmpty(false, false);
  const resources = NtExecutableResource.from(exe);
  if (icon) {
    Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      101,
      1033,
      [new Data.RawIconItem(fixturePng(), 256, 256, 32)],
    );
  }
  if (version) {
    const info = Resource.VersionInfo.create({
      lang: 1033,
      fixedInfo: {},
      strings: versionStrings
        ? [
            {
              lang: 1033,
              codepage: 1200,
              values: { FileDescription: "Shell", ProductName: "Shell" },
            },
          ]
        : [],
    });
    info.outputToResourceEntries(resources.entries);
  }
  resources.outputResource(exe);
  return new Uint8Array(exe.generate());
}
