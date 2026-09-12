// Conservative pixel-error checks, not a guarantee of perceptual equivalence.
// Stagger samples to avoid repeatedly missing thin rows/columns of text.
export function imageQuality(original: Uint8ClampedArray, candidate: Uint8ClampedArray, width: number, height: number) {
 if (original.length !== candidate.length || original.length !== width * height * 4) throw new Error('Image dimensions differ');
 const stride = Math.max(1, Math.ceil(Math.sqrt(width * height / 250000)));
 let squared = 0, channels = 0, edgeError = 0, edgeChannels = 0, alphaError = 0;
 for (let y = 0; y < height; y += stride) {
  for (let x = (Math.floor(y / stride) * 7) % stride; x < width; x += stride) {
   const i = (y * width + x) * 4;
   alphaError = Math.max(alphaError, Math.abs(original[i + 3] - candidate[i + 3]));
   if (!original[i + 3]) continue;
   let edge = false;
   for (const j of [x + 1 < width ? i + 4 : i, y + 1 < height ? i + width * 4 : i]) {
    for (let c = 0; c < 3; c++) if (Math.abs(original[i + c] - original[j + c]) > 32) edge = true;
   }
   for (let c = 0; c < 3; c++) {
    const difference = Math.abs(original[i + c] - candidate[i + c]);
    squared += difference * difference; channels++;
    if (edge) { edgeError += difference; edgeChannels++; }
   }
  }
 }
 const mse = channels ? squared / channels : 0;
 const psnr = mse ? 10 * Math.log10(255 * 255 / mse) : Infinity;
 const edgeMae = edgeChannels ? edgeError / edgeChannels : 0;
 return { psnr, edgeMae, alphaError, acceptable: psnr >= 38 && edgeMae <= 5 && alphaError === 0 };
}

export function pickImageCandidate<T extends {size: number; lossless: boolean}>(originalSize: number, candidates: T[]): T | undefined {
 const smaller = candidates.filter(c => c.size > 0 && c.size <= originalSize * .95).sort((a,b) => a.size - b.size);
 if (!smaller.length) return undefined;
 // Prefer lossless when its size is close to the smallest acceptable lossy file.
 return smaller.find(c => c.lossless && c.size <= smaller[0].size * 1.2) || smaller[0];
}
