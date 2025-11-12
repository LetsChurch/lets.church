/**
 * Preloads an image and returns a promise that resolves when the image is loaded
 * @param src - The image URL to preload
 * @returns Promise that resolves when the image loads, rejects if it fails to load
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      resolve();
    };

    img.onerror = () => {
      reject(new Error(`Failed to load image: ${src}`));
    };

    img.src = src;
  });
}
