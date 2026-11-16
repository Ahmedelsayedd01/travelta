/**
 * Expo Web versions of the file helpers. The browser has no app file system or native share sheet:
 * picked files are read with fetch/FileReader, exports are downloaded, and vouchers open the browser's print dialog
 * (where "Save as PDF" is available). Behaviour is labelled in the UI; nothing pretends to be native.
 */
async function blobOf(uri: string): Promise<Blob> {
  return (await fetch(uri)).blob();
}

export async function readBase64(uri: string): Promise<string> {
  const blob = await blobOf(uri);
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function readText(uri: string): Promise<string> {
  return (await blobOf(uri)).text();
}

export async function shareJson(name: string, json: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function sharePdf(html: string, title: string): Promise<void> {
  const w = window.open('', '_blank');
  if (!w) throw new Error('popup-blocked');
  w.document.write(html.replace('<head>', `<head><title>${title}</title>`));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
