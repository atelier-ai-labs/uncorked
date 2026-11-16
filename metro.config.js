const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Prefer browser/react-native exports so @supabase/realtime-js (ws) uses the browser WebSocket shim
// while keeping package exports enabled for react-native 0.88+.
config.resolver.unstable_conditionNames = [
  'react-native',
  'browser',
  'require',
  'import',
];

module.exports = config;
