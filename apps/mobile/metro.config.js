// Metro configuration for use inside the Ardoise monorepo.
// https://docs.expo.dev/guides/monorepos/
//
// Built on Sentry's Expo config, which is Expo's default plus a debug id stamped into
// every bundle and its source map: that is how Sentry pairs a reported stack trace with
// the right uploaded map, for builds and over-the-air updates alike.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getSentryExpoConfig(projectRoot);

// Watch all files within the monorepo.
config.watchFolders = [monorepoRoot];

// Resolve modules from the app first, then fall back to the hoisted root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
