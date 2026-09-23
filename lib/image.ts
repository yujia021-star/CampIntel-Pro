// ブラウザ側で画像を縮小してBase64化する（Vision APIの推奨上限 長辺1568px に合わせる）
const MAX_EDGE = 1568;

export async function resizeImageToBase64(file: File): Promise<{ media_type: "image/jpeg"; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas not supported");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { media_type: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}
