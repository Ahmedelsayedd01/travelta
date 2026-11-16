import { KYC_FILE_TYPES, KYC_MAX_FILE_BYTES, type KycFile } from '@travelta/schemas';

export const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Local upload (SIMULATION: kept as a data URL in the demo dataset). Returns an i18n error key when refused. */
export async function toStoredFile(file: File): Promise<{ file: KycFile } | { error: string }> {
  if (!(KYC_FILE_TYPES as readonly string[]).includes(file.type)) return { error: 'validation.file_type' };
  if (file.size > KYC_MAX_FILE_BYTES) return { error: 'validation.file_too_large' };
  return { file: { name: file.name.slice(0, 160), type: file.type as KycFile['type'], size: file.size, dataUrl: await readAsDataUrl(file) } };
}
