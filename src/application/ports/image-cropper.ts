export interface ImageMetadata {
  width: number;
  height: number;
}

export interface CropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ImageCropper {
  getMetadata(filePath: string): Promise<ImageMetadata>;
  crop(inputPath: string, outputPath: string, region: CropRegion): Promise<void>;
}

