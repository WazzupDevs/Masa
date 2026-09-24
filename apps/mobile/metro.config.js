const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const sharedPure = path.resolve(monorepoRoot, 'supabase/functions/_shared/pure');

const config = getDefaultConfig(projectRoot);

// Only the dependency-free shared folder is visible to the app.
// `@shared/*` itself is resolved from tsconfig `paths`.
config.watchFolders = [sharedPure];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
