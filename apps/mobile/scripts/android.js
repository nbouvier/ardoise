// Runs `expo run:android` with a JDK the Android build can use.
//
// The native build breaks under JDK 24+ (the prefab tool prints a warning that Gradle treats
// as a failure), so this picks a JDK 17-23 — preferring 21 — for this process only. Nothing
// global changes: the developer's JAVA_HOME and PATH stay as they are for every other project.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PREFERRED = 21;
const MIN = 17;
const MAX = 23;

/** Major version of the JDK at `home`, read from its `release` file, or null. */
function jdkMajor(home) {
  try {
    const release = fs.readFileSync(path.join(home, 'release'), 'utf8');
    const match = /JAVA_VERSION="?(\d+)(?:\.(\d+))?/.exec(release);
    if (!match) return null;
    const major = Number(match[1]);
    return major === 1 ? Number(match[2]) : major;
  } catch {
    return null;
  }
}

function subdirectories(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

/** Folders that usually hold one JDK per subfolder, per platform. */
function jdkParents() {
  if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
    const vendors = [
      'Eclipse Adoptium',
      'Microsoft',
      'Java',
      'Zulu',
      'Amazon Corretto',
      'BellSoft',
    ];
    return roots.flatMap((root) => vendors.map((vendor) => path.join(root, vendor)));
  }
  if (process.platform === 'darwin') {
    return ['/Library/Java/JavaVirtualMachines'].flatMap((dir) =>
      subdirectories(dir).map((jdk) => path.join(jdk, 'Contents')),
    );
  }
  return [
    '/usr/lib/jvm',
    '/usr/java',
    path.join(process.env.HOME ?? '', '.sdkman/candidates/java'),
  ];
}

function installedJdks() {
  const homes = [];
  for (const parent of jdkParents()) {
    for (const home of subdirectories(parent)) {
      homes.push(fs.existsSync(path.join(home, 'Home')) ? path.join(home, 'Home') : home);
    }
  }
  return homes
    .map((home) => ({ home, major: jdkMajor(home) }))
    .filter((jdk) => jdk.major !== null && jdk.major >= MIN && jdk.major <= MAX);
}

function pickJdk() {
  const current = process.env.JAVA_HOME;
  if (current) {
    const major = jdkMajor(current);
    if (major !== null && major >= MIN && major <= MAX) return current;
  }
  const candidates = installedJdks().sort(
    (a, b) => Math.abs(a.major - PREFERRED) - Math.abs(b.major - PREFERRED) || b.major - a.major,
  );
  return candidates.length > 0 ? candidates[0].home : null;
}

const home = pickJdk();
if (!home) {
  console.error(
    `No JDK ${MIN}-${MAX} found. The Android build needs one (JDK ${PREFERRED} recommended):\n` +
      '  winget install EclipseAdoptium.Temurin.21.JDK   (Windows)\n' +
      '  brew install --cask temurin@21                   (macOS)\n' +
      'It does not need to be your default JDK; this script finds it on its own.',
  );
  process.exit(1);
}

const env = {
  ...process.env,
  JAVA_HOME: home,
  PATH: `${path.join(home, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
};
console.log(`Building with the JDK at ${home}`);

const result = spawnSync('npx', ['expo', 'run:android', ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
