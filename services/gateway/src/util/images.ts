import { execa } from 'execa';
import invariant from 'tiny-invariant';
import sharp from 'sharp';
import { encode as encodeBlurhash } from 'blurhash';
import { imageMagickJsonSchema } from './zod';

export async function imgJson(cwd: string, inputFileNames: string[]) {
  const res = await execa('convert', [...inputFileNames, 'json:'], { cwd });
  const [json] = imageMagickJsonSchema.parse(JSON.parse(res.stdout));
  invariant(json, 'No JSON output from ImageMagick!');
  return json.image;
}

export function concatThumbs(cwd: string, inputFileNames: Array<string>) {
  return execa('convert', [...inputFileNames, '-append', 'hovernail.jpg'], {
    cwd,
  });
}

export function oxiPng(cwd: string, inputFileNames: Array<string>) {
  return execa('oxipng', ['-o', 'max', ...inputFileNames], { cwd });
}

export function jpegOptim(cwd: string, inputFileNames: Array<string>) {
  return execa('jpegoptim', [...inputFileNames], { cwd });
}

export async function imageToBlurhash(path: string) {
  const {
    data,
    info: { width, height },
  } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return encodeBlurhash(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width,
    height,
    4,
    4,
  );
}
