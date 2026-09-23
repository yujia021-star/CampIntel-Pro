// ブラウザ側で画像を縮小してBase64化する（Vision APIの推奨上限 長辺1568px に合わせる）
const MAX_EDGE = 1568;

type Drawable = { source: CanvasImageSource; width: number; height: number; close?: () => void };

/** 画像ファイルを描画できる形に読み込む。createImageBitmap が使えない・失敗する環境では <img> で読む */
async function load(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // iPhone の HEIC などで失敗することがあるので <img> で再挑戦する
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    // decode 済みなので URL は解放してよい
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function resizeImageToBase64(file: File): Promise<{ media_type: "image/jpeg"; data: string }> {
  let img: Drawable;
  try {
    img = await load(file);
  } catch {
    throw new Error("この画像の形式は読み込めませんでした。カメラで撮り直すか、JPEG/PNG の写真を選んでください。");
  }
  if (!img.width || !img.height) throw new Error("画像を読み込めませんでした。");

  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("この端末では画像を処理できませんでした。");
  ctx.drawImage(img.source, 0, 0, width, height);
  img.close?.();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { media_type: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}
