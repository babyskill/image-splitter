import JSZip from 'jszip';
import { ImageDetector, type Box } from './ImageDetector';

export type { Box } from './ImageDetector';

export const STANDARD_GAME_ROW_PRESETS: string[] = [
  'idle',
  'walk',
  'run',
  'watching',
  'attack',
  'hurt',
  'jump',
  'die',
  'climb',
  'dance',
  'defend',
  'fall',
  'dash',
  'cast',
  'shoot',
  'swim',
];

export interface ExportOptions {
  format?: 'png' | 'webp';
  background?: 'transparent' | 'white';
  sizePreset?: 'original' | 'sticker512' | 'icon256';
  canvasPadding?: number;
  enableRowGroups?: boolean;
}

export class ImageEditorState {
  sourceImage: HTMLImageElement | null = null;
  boxes: Box[] = [];
  gridArea: Box | null = null;
  gridRows: number = 2;
  gridCols: number = 2;
  selectionWidth: number | undefined = undefined;
  selectionHeight: number | undefined = undefined;
  rowNames: string[] = ['idle', 'walk', 'run', 'watching'];
  enableRowGroups: boolean = true;

  private t: (key: string) => string;

  constructor(t: (key: string) => string) {
    this.t = t;
    this.syncRowNames(this.gridRows);
  }

  syncRowNames(rows: number) {
    if (rows <= 0) {
      this.rowNames = [];
      return;
    }
    const updated: string[] = [];
    for (let i = 0; i < rows; i++) {
      if (i < this.rowNames.length && this.rowNames[i] !== undefined && this.rowNames[i].trim() !== '') {
        updated.push(this.rowNames[i]);
      } else {
        updated.push(STANDARD_GAME_ROW_PRESETS[i % STANDARD_GAME_ROW_PRESETS.length] || `row${i + 1}`);
      }
    }
    this.rowNames = updated;
  }

  applyGamePresets() {
    this.rowNames = Array.from({ length: this.gridRows }, (_, i) =>
      STANDARD_GAME_ROW_PRESETS[i % STANDARD_GAME_ROW_PRESETS.length] || `row${i + 1}`
    );
  }

  async loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      img.onload = () => {
        this.sourceImage = img;
        this.boxes = [];
        this.gridArea = null;
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };
    });
  }

  addBox(box: Omit<Box, 'id'>): Box {
    const newBox = { ...box, id: Date.now() };
    this.boxes.push(newBox);
    return newBox;
  }

  deleteBox(boxId: number) {
    const index = this.boxes.findIndex(b => b.id === boxId);
    if (index !== -1) {
      this.boxes.splice(index, 1);
    }
  }

  clearBoxes() {
    this.boxes = [];
  }

  setGrid(rows: number, cols: number) {
    this.gridRows = rows;
    this.gridCols = cols;
    this.syncRowNames(rows);
  }

  fitGridToImage(padding: number) {
    if (!this.sourceImage) return;
    this.gridArea = {
      id: Date.now(),
      x: padding,
      y: padding,
      w: this.sourceImage.width,
      h: this.sourceImage.height,
    };
  }

  clearGrid() {
    this.gridArea = null;
  }

  autoDetect(
    imageData: ImageData,
    padding: number,
    canvasPadding: number,
    shouldSetFixedSize?: boolean,
    detectorOptions?: { borderTolerance?: number; alphaThreshold?: number }
  ): Box[] {
    const detected = ImageDetector.detect(imageData, {
      padding,
      canvasPadding,
      fixedWidth: this.selectionWidth,
      fixedHeight: this.selectionHeight,
      borderTolerance: detectorOptions?.borderTolerance,
      alphaThreshold: detectorOptions?.alphaThreshold,
    });

    if (shouldSetFixedSize && (this.selectionWidth == null || this.selectionHeight == null)) {
      if (detected.length > 0) {
        this.selectionWidth = detected[0].w;
        this.selectionHeight = detected[0].h;
      }
    }

    if (this.selectionWidth != null && this.selectionHeight != null) {
      this.boxes = detected.map(b => ({
        ...b,
        w: this.selectionWidth!,
        h: this.selectionHeight!,
      }));
    } else {
      this.boxes = detected;
    }

    return this.boxes;
  }

  async exportSingleBox(
    box: Box,
    optionsOrFormat: ExportOptions | ('png' | 'webp') = 'png',
    canvasPadding: number = 0
  ): Promise<Blob> {
    if (!this.sourceImage) {
      throw new Error(this.t('errors.noSource'));
    }

    const options: ExportOptions = typeof optionsOrFormat === 'string'
      ? { format: optionsOrFormat, canvasPadding }
      : { canvasPadding, ...optionsOrFormat };

    const format = options.format ?? 'png';
    const background = options.background ?? 'transparent';
    const sizePreset = options.sizePreset ?? 'original';
    const pad = options.canvasPadding ?? canvasPadding;

    const img = this.sourceImage;

    // Calculate dimensions based on preset
    let destW = Math.max(1, Math.round(box.w));
    let destH = Math.max(1, Math.round(box.h));

    if (sizePreset === 'sticker512') {
      const scale = Math.min(512 / box.w, 512 / box.h);
      destW = Math.max(1, Math.round(box.w * scale));
      destH = Math.max(1, Math.round(box.h * scale));
    } else if (sizePreset === 'icon256') {
      const scale = Math.min(256 / box.w, 256 / box.h);
      destW = Math.max(1, Math.round(box.w * scale));
      destH = Math.max(1, Math.round(box.h * scale));
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = destW;
    tempCanvas.height = destH;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
      throw new Error('Failed to get 2d context for canvas');
    }

    if (background === 'white') {
      tempCtx.fillStyle = '#ffffff';
      tempCtx.fillRect(0, 0, destW, destH);
    }

    const imageRect = { x: pad, y: pad, w: img.width, h: img.height };
    const intersectX = Math.max(box.x, imageRect.x);
    const intersectY = Math.max(box.y, imageRect.y);
    const intersectMaxX = Math.min(box.x + box.w, imageRect.x + imageRect.w);
    const intersectMaxY = Math.min(box.y + box.h, imageRect.y + imageRect.h);
    const intersectW = intersectMaxX - intersectX;
    const intersectH = intersectMaxY - intersectY;

    if (intersectW > 0 && intersectH > 0) {
      const sourceX = intersectX - pad;
      const sourceY = intersectY - pad;
      const scaleX = destW / box.w;
      const scaleY = destH / box.h;
      const targetRelX = (intersectX - box.x) * scaleX;
      const targetRelY = (intersectY - box.y) * scaleY;
      const targetRelW = intersectW * scaleX;
      const targetRelH = intersectH * scaleY;

      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = 'high';
      tempCtx.drawImage(img, sourceX, sourceY, intersectW, intersectH, targetRelX, targetRelY, targetRelW, targetRelH);
    }

    const mimeType = format === 'webp' ? 'image/webp' : 'image/png';
    return new Promise<Blob>((resolve, reject) => {
      tempCanvas.toBlob(blob => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`Failed to generate ${format.toUpperCase()} blob`));
        }
      }, mimeType);
    });
  }

  async export(
    prefix: string,
    connector: string,
    slicingMode: 'custom' | 'grid',
    optionsOrPadding: ExportOptions | number = 0,
    maybeFormat: 'png' | 'webp' = 'png'
  ): Promise<Blob> {
    if (!this.sourceImage) {
      throw new Error(this.t('errors.noSource'));
    }

    const options: ExportOptions = typeof optionsOrPadding === 'number'
      ? { canvasPadding: optionsOrPadding, format: maybeFormat }
      : optionsOrPadding;

    const format = options.format ?? 'png';
    const enableRowGroups = options.enableRowGroups !== undefined ? options.enableRowGroups : this.enableRowGroups;

    if (slicingMode === 'grid') {
      if (!this.gridArea) throw new Error(this.t('errors.noGrid'));
      const { x, y, w, h } = this.gridArea;
      const cellWidth = w / this.gridCols;
      const cellHeight = h / this.gridRows;
      const zip = new JSZip();
      const ext = format === 'webp' ? 'webp' : 'png';

      for (let i = 0; i < this.gridRows; i++) {
        const folderName = (this.rowNames[i] || '').trim() || `${prefix}${connector}row${i + 1}`;
        for (let j = 0; j < this.gridCols; j++) {
          const box: Box = {
            id: i * this.gridCols + j,
            x: x + j * cellWidth,
            y: y + i * cellHeight,
            w: cellWidth,
            h: cellHeight,
          };
          const blob = await this.exportSingleBox(box, options);
          if (enableRowGroups) {
            zip.file(`${folderName}/${j + 1}.${ext}`, blob);
          } else {
            const index = i * this.gridCols + j;
            const filename = `${prefix}${connector}${index + 1}.${ext}`;
            zip.file(filename, blob);
          }
        }
      }
      return zip.generateAsync({ type: 'blob' });
    }

    if (this.boxes.length === 0) {
      throw new Error(this.t('errors.noBoxes'));
    }

    const zip = new JSZip();
    const ext = format === 'webp' ? 'webp' : 'png';

    for (const [index, box] of this.boxes.entries()) {
      const blob = await this.exportSingleBox(box, options);
      const filename = `${prefix}${connector}${index + 1}.${ext}`;
      zip.file(filename, blob);
    }

    return zip.generateAsync({ type: 'blob' });
  }
}