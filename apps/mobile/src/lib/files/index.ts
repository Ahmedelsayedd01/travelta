import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** Native: read a picked file as base64. */
export async function readBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

/** Native: read a picked file as text. */
export async function readText(uri: string): Promise<string> {
  return new File(uri).text();
}

/** Native: write JSON to the cache and open the share sheet. */
export async function shareJson(name: string, json: string, title: string): Promise<void> {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(json);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: title, UTI: 'public.json' });
}

/** Native: render HTML to a PDF and open the share sheet. */
export async function sharePdf(html: string, title: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title });
}
