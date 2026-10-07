import {
  deleteKotlinCachedModel,
  listKotlinCachedModels,
} from './litertKotlinEngine';

export type CachedModel = {
  fileName: string;
  sizeBytes: number;
  absolutePath: string;
};

/** Local Kotlin model files under document/models (single store). */
export function listCachedModels(): CachedModel[] {
  return listKotlinCachedModels().map((f) => ({
    fileName: f.fileName,
    sizeBytes: f.sizeBytes,
    absolutePath: f.path,
  }));
}

/** Delete one Kotlin-cached model by filename. */
export function deleteCachedModel(file: Pick<CachedModel, 'fileName'>): void {
  deleteKotlinCachedModel(file.fileName);
}
