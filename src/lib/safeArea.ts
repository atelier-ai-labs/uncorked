import { Platform, StatusBar } from 'react-native';

/**
 * Returns the top safe-area inset in dp for edge-to-edge Android windows
 * (e.g. Pixel punch-hole camera & status bar) where `StatusBar.currentHeight`
 * may be 0 at module load time or underestimated inside Modals.
 */
export function getTopInset(): number {
  if (Platform.OS === 'android') {
    return Math.max(StatusBar.currentHeight || 0, 48);
  }
  return 0;
}

/**
 * Returns the bottom safe-area inset in dp to clear Android gesture pill /
 * 3-button navigation bars and iOS home indicators in edge-to-edge layouts.
 */
export function getBottomInset(): number {
  if (Platform.OS === 'android') {
    return 48;
  }
  if (Platform.OS === 'ios') {
    return 24;
  }
  return 16;
}
