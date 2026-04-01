import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import type {
  CropRegion,
  ImageCropper,
  ImageMetadata,
} from "../../../application/ports/image-cropper";

export class SharpImageCropper implements ImageCropper {
  async getMetadata(filePath: string): Promise<ImageMetadata> {
    const metadata = await sharp(filePath).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error(`Unable to read image size for ${filePath}`);
    }

    return {
      width: metadata.width,
      height: metadata.height,
    };
  }

  async crop(inputPath: string, outputPath: string, region: CropRegion): Promise<void> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    await sharp(inputPath)
      .extract(region)
      .png()
      .toFile(outputPath);
  }
}

