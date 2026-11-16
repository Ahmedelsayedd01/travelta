import { demoSnapshotSchema, type DemoSnapshot } from '@travelta/schemas';
import * as DocumentPicker from 'expo-document-picker';
import { readText, shareJson } from '@/lib/files';

/** Write the export to the cache directory and open the share sheet (MOCK_DATA_ARCHITECTURE §3). */
export async function shareSnapshot(snapshot: DemoSnapshot): Promise<void> {
  // Native: share sheet; web: file download (lib/files).
  await shareJson(`travelta-demo-${(snapshot.exportedAt ?? new Date().toISOString()).slice(0, 10)}.json`, JSON.stringify(snapshot), 'Travelta demo data');
}

/** Let the user pick an exported JSON file. Returns null when cancelled; throws when the file isn't a valid export. */
export async function pickSnapshot(): Promise<{ name: string; snapshot: DemoSnapshot } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const parsed = demoSnapshotSchema.safeParse(JSON.parse(await readText(asset.uri)));
  if (!parsed.success) throw new Error('invalid-export');
  return { name: asset.name, snapshot: parsed.data };
}
