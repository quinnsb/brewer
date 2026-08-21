/* Sampling a cover's colour in the browser.

   The build does this with macOS `sips`, which does not exist on Vercel's
   Linux. Rather than ship an image decoder to the server, the admin does it
   here: the canvas is already a decoder, and derivePalette is the very same
   function the build calls, so the two agree by construction.

   The cover is loaded through /api/cover so it is same-origin; a cross-origin
   image taints the canvas and getImageData throws. */

import { derivePalette } from "../../tools/lib/palette.mjs";

const GRID = 8;

export async function samplePalette(coverUrl) {
  const image = await loadImage(`/api/cover?url=${encodeURIComponent(coverUrl)}`);

  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, GRID, GRID);

  const { data } = context.getImageData(0, 0, GRID, GRID);
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) pixels.push([data[i], data[i + 1], data[i + 2]]);

  return {
    /* No fingerprint: the file this describes does not exist locally yet, so
       the next real build will resample it and fill one in. */
    fingerprint: null,
    width: image.naturalWidth,
    height_px: image.naturalHeight,
    palette: derivePalette(pixels),
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load that cover"));
    image.src = src;
  });
}
