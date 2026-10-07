import * as ImagePicker from 'expo-image-picker';

import { log } from '../../util/log';

export type ImageSource = 'camera' | 'library';

export type PickImageResult = { uri: string } | { error: string } | null;

export type PickImageMeta = {
  /** e.g. before | after | address */
  purpose?: string;
};

/** Opens camera or library; returns uri, a short error, or null if cancelled. */
export async function pickImage(
  source: ImageSource,
  meta: PickImageMeta = {},
): Promise<PickImageResult> {
  const purpose = meta.purpose;
  log.info('pickImage', 'open', { source, purpose });

  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      log.warn('pickImage', 'camera permission denied', { source, purpose });
      return { error: 'Camera permission needed' };
    }
  }

  const res =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });

  if (res.canceled || !res.assets[0]) {
    log.info('pickImage', 'cancelled', { source, purpose });
    return null;
  }
  log.info('pickImage', 'ok', {
    source,
    purpose,
    uriTail: res.assets[0].uri.slice(-40),
  });
  return { uri: res.assets[0].uri };
}
