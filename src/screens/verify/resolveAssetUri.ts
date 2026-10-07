import { Asset } from 'expo-asset';

/** Turn a bundled require() module id into a local file uri. */
export async function resolveAssetUri(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('asset has no local uri');
  return uri;
}
