/** About 2.4 megapixels: plenty for receipt text, and a few hundred KB to upload. */
const MAX_PIXELS = 2_400_000;

/** Phone photo → smaller JPEG as base64 (no "data:" prefix), the right way up. */
export async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file); // applies EXIF rotation
  const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
