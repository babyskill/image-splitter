export interface Box {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageDataLike {
  data: Uint8ClampedArray | Uint8Array | number[];
  width: number;
  height: number;
}

export interface ImageDetectorOptions {
  /**
   * Pixels with alpha <= alphaThreshold are considered transparent background.
   * Default: 24 (filters anti-aliasing artifacts & compression noise)
   */
  alphaThreshold?: number;

  /**
   * Manhattan color distance tolerance (|dr| + |dg| + |db|) for border flood fill.
   * Default: 42
   */
  borderTolerance?: number;

  /**
   * Minimum pixel area for a standalone component.
   * Default: Math.max(60, Math.floor(0.0008 * totalPixels))
   */
  minArea?: number;

  /**
   * Maximum area ratio of image size.
   * Default: 0.9 * totalPixels
   */
  maxArea?: number;

  /**
   * Minimum width in pixels.
   * Default: 8
   */
  minWidth?: number;

  /**
   * Minimum height in pixels.
   * Default: 8
   */
  minHeight?: number;

  /**
   * Padding to expand around each detected bounding box.
   * Default: 0
   */
  padding?: number;

  /**
   * Offset of the image on the editor canvas.
   * Default: 0
   */
  canvasPadding?: number;

  /**
   * Fixed box width if fixed size mode is enabled.
   */
  fixedWidth?: number;

  /**
   * Fixed box height if fixed size mode is enabled.
   */
  fixedHeight?: number;

  /**
   * Maximum distance to cluster small fragments into adjacent major items.
   * If not specified, dynamically calculated based on item dimensions.
   */
  maxClusterDistance?: number;
}

interface RawComponent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

export class ImageDetector {
  /**
   * Detects distinct items / sprites in an image with dual background detection,
   * 1D Connected Component Labeling, strict noise filtering, smart fragment clustering,
   * and natural reading order sorting.
   */
  static detect(imageData: ImageDataLike, options: ImageDetectorOptions = {}): Box[] {
    const { width, height, data } = imageData;
    const totalPixels = width * height;
    if (totalPixels === 0 || width <= 0 || height <= 0) return [];

    const alphaThreshold = options.alphaThreshold ?? 24;
    const borderTolerance = options.borderTolerance ?? 42;
    const minArea = options.minArea ?? Math.max(60, Math.floor(0.0008 * totalPixels));
    const maxArea = options.maxArea ?? (0.9 * totalPixels);
    const minWidth = options.minWidth ?? 8;
    const minHeight = options.minHeight ?? 8;
    const padding = options.padding ?? 0;
    const canvasPadding = options.canvasPadding ?? 0;

    // 1. Dual Background Detection
    // Count pixels with alpha < 245
    let nonOpaqueCount = 0;
    const len = totalPixels * 4;
    for (let i = 3; i < len; i += 4) {
      if (data[i] < 245) {
        nonOpaqueCount++;
      }
    }

    const hasAlphaChannel = (nonOpaqueCount / totalPixels) > 0.01;
    const isForeground = new Uint8Array(totalPixels);

    if (hasAlphaChannel) {
      // Transparent background: foreground is any pixel with alpha > alphaThreshold
      for (let i = 0; i < totalPixels; i++) {
        const a = data[i * 4 + 3];
        if (a > alphaThreshold) {
          isForeground[i] = 1;
        }
      }
    } else {
      // Opaque background: Run Border Flood-Fill from the 4 edges
      // Determine background reference color using corner samples
      const corners = [
        0,                                   // Top-Left (0, 0)
        (width - 1),                         // Top-Right (w-1, 0)
        (height - 1) * width,                // Bottom-Left (0, h-1)
        (height - 1) * width + (width - 1),  // Bottom-Right (w-1, h-1)
      ];

      const rSamples = corners.map(idx => data[idx * 4]).sort((a, b) => a - b);
      const gSamples = corners.map(idx => data[idx * 4 + 1]).sort((a, b) => a - b);
      const bSamples = corners.map(idx => data[idx * 4 + 2]).sort((a, b) => a - b);

      // Median color of the corners
      const bgR = rSamples[Math.floor(rSamples.length / 2)];
      const bgG = gSamples[Math.floor(gSamples.length / 2)];
      const bgB = bSamples[Math.floor(bSamples.length / 2)];

      const isBg = new Uint8Array(totalPixels);
      const stack = new Int32Array(totalPixels);
      let stackPtr = 0;

      const checkAndPush = (idx: number) => {
        if (isBg[idx] === 0) {
          const r = data[idx * 4];
          const g = data[idx * 4 + 1];
          const b = data[idx * 4 + 2];
          const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
          if (dist <= borderTolerance) {
            isBg[idx] = 1;
            stack[stackPtr++] = idx;
          }
        }
      };

      // Top & Bottom edges
      for (let x = 0; x < width; x++) {
        checkAndPush(x);
        checkAndPush((height - 1) * width + x);
      }

      // Left & Right edges
      for (let y = 1; y < height - 1; y++) {
        checkAndPush(y * width);
        checkAndPush(y * width + (width - 1));
      }

      // Flood-Fill Expansion
      while (stackPtr > 0) {
        const curIdx = stack[--stackPtr];
        const cx = curIdx % width;
        const cy = (curIdx / width) | 0;

        // 4-neighborhood
        if (cx > 0) checkAndPush(curIdx - 1);
        if (cx < width - 1) checkAndPush(curIdx + 1);
        if (cy > 0) checkAndPush(curIdx - width);
        if (cy < height - 1) checkAndPush(curIdx + width);
      }

      // Foreground is everything not reached by border background flood-fill
      // and having alpha > alphaThreshold
      for (let i = 0; i < totalPixels; i++) {
        const a = data[i * 4 + 3];
        if (isBg[i] === 0 && a > alphaThreshold) {
          isForeground[i] = 1;
        }
      }
    }

    // 2. Connected Component Labeling (CCL) with flat 1D stack
    const visited = new Uint8Array(totalPixels);
    const stack = new Int32Array(totalPixels);
    let stackPtr = 0;
    const rawComponents: RawComponent[] = [];

    for (let idx = 0; idx < totalPixels; idx++) {
      if (!isForeground[idx] || visited[idx] === 1) continue;

      let minX = idx % width;
      let maxX = minX;
      let minY = (idx / width) | 0;
      let maxY = minY;
      let area = 0;

      visited[idx] = 1;
      stack[0] = idx;
      stackPtr = 1;

      while (stackPtr > 0) {
        const cur = stack[--stackPtr];
        const cx = cur % width;
        const cy = (cur / width) | 0;
        area++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        // 8-neighborhood connectivity
        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          if (ny < 0 || ny >= height) continue;
          const rowOffset = ny * width;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = rowOffset + nx;
            if (isForeground[nIdx] === 1 && visited[nIdx] === 0) {
              visited[nIdx] = 1;
              stack[stackPtr++] = nIdx;
            }
          }
        }
      }

      rawComponents.push({ minX, minY, maxX, maxY, area });
    }

    // 3. Strict Noise Filtering & Categorization into Major vs Fragment Candidates
    const majorComponents: RawComponent[] = [];
    const fragmentCandidates: RawComponent[] = [];

    for (const comp of rawComponents) {
      const w = comp.maxX - comp.minX + 1;
      const h = comp.maxY - comp.minY + 1;

      // Discard huge components (e.g. background frames) or microscopic noise (< 4px)
      if (comp.area > maxArea || comp.area < 4) {
        continue;
      }

      if (w >= minWidth && h >= minHeight && comp.area >= minArea) {
        majorComponents.push(comp);
      } else {
        fragmentCandidates.push(comp);
      }
    }

    // 4. Smart Clustering Algorithm
    // Automatically merges small detached fragments (dots, sparks, shadows) into the nearest major component
    if (majorComponents.length > 0 && fragmentCandidates.length > 0) {
      let changed = true;
      let passes = 0;
      while (changed && passes < 3) {
        changed = false;
        passes++;

        for (let fIdx = fragmentCandidates.length - 1; fIdx >= 0; fIdx--) {
          const frag = fragmentCandidates[fIdx];
          let bestMajor: RawComponent | null = null;
          let bestDist = Infinity;

          for (const major of majorComponents) {
            const dx = Math.max(0, Math.max(frag.minX - major.maxX, major.minX - frag.maxX));
            const dy = Math.max(0, Math.max(frag.minY - major.maxY, major.minY - frag.maxY));
            const dist = Math.hypot(dx, dy);

            const mW = major.maxX - major.minX + 1;
            const mH = major.maxY - major.minY + 1;
            const maxDim = Math.max(mW, mH);
            const dynamicThreshold = options.maxClusterDistance ?? Math.max(12, Math.min(36, Math.round(maxDim * 0.28)));

            if (dist <= dynamicThreshold && dist < bestDist) {
              bestDist = dist;
              bestMajor = major;
            }
          }

          if (bestMajor) {
            bestMajor.minX = Math.min(bestMajor.minX, frag.minX);
            bestMajor.minY = Math.min(bestMajor.minY, frag.minY);
            bestMajor.maxX = Math.max(bestMajor.maxX, frag.maxX);
            bestMajor.maxY = Math.max(bestMajor.maxY, frag.maxY);
            bestMajor.area += frag.area;
            fragmentCandidates.splice(fIdx, 1);
            changed = true;
          }
        }
      }
    }

    // Subsumption check: remove components completely contained within another major component
    const finalMajor: RawComponent[] = [];
    for (let i = 0; i < majorComponents.length; i++) {
      const a = majorComponents[i];
      let contained = false;
      for (let j = 0; j < majorComponents.length; j++) {
        if (i === j) continue;
        const b = majorComponents[j];
        if (a.minX >= b.minX && a.maxX <= b.maxX && a.minY >= b.minY && a.maxY <= b.maxY) {
          contained = true;
          b.area += a.area;
          break;
        }
      }
      if (!contained) {
        finalMajor.push(a);
      }
    }

    // 5. Convert to Bounding Boxes with padding & fixed size support
    const rawBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (const comp of finalMajor) {
      let boxW = (comp.maxX - comp.minX + 1) + padding * 2;
      let boxH = (comp.maxY - comp.minY + 1) + padding * 2;
      let boxX = comp.minX - padding + canvasPadding;
      let boxY = comp.minY - padding + canvasPadding;

      if (options.fixedWidth != null && options.fixedHeight != null) {
        boxW = options.fixedWidth;
        boxH = options.fixedHeight;
      }

      rawBoxes.push({
        x: Math.round(boxX),
        y: Math.round(boxY),
        w: Math.round(boxW),
        h: Math.round(boxH),
      });
    }

    // 6. Natural Reading-Order Sorting (top-to-bottom, left-to-right)
    return this.sortReadingOrder(rawBoxes, Date.now());
  }

  /**
   * Groups boxes into horizontal rows based on vertical overlap and average row height,
   * sorting rows top-to-bottom and items within each row left-to-right.
   */
  private static sortReadingOrder(
    boxes: Array<{ x: number; y: number; w: number; h: number }>,
    baseId: number
  ): Box[] {
    if (boxes.length === 0) return [];
    if (boxes.length === 1) {
      return [{ ...boxes[0], id: baseId + 1 }];
    }

    const avgHeight = boxes.reduce((sum, b) => sum + b.h, 0) / boxes.length;
    const rowTolerance = Math.max(8, avgHeight * 0.45);

    // Initial sort by vertical center
    const sorted = [...boxes].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));

    interface RowGroup {
      boxes: Array<{ x: number; y: number; w: number; h: number }>;
      centerYSum: number;
      minY: number;
      maxY: number;
    }

    const rows: RowGroup[] = [];

    for (const box of sorted) {
      const cy = box.y + box.h / 2;
      let targetRow: RowGroup | null = null;
      let minDiff = Infinity;

      for (const row of rows) {
        const rowAvgY = row.centerYSum / row.boxes.length;
        const diff = Math.abs(cy - rowAvgY);

        const overlap = Math.max(0, Math.min(box.y + box.h, row.maxY) - Math.max(box.y, row.minY));
        const minBoxH = Math.min(box.h, row.maxY - row.minY);
        const hasSignificantOverlap = minBoxH > 0 && (overlap / minBoxH) > 0.35;

        if (diff <= rowTolerance || hasSignificantOverlap) {
          if (diff < minDiff) {
            minDiff = diff;
            targetRow = row;
          }
        }
      }

      if (targetRow) {
        targetRow.boxes.push(box);
        targetRow.centerYSum += cy;
        targetRow.minY = Math.min(targetRow.minY, box.y);
        targetRow.maxY = Math.max(targetRow.maxY, box.y + box.h);
      } else {
        rows.push({
          boxes: [box],
          centerYSum: cy,
          minY: box.y,
          maxY: box.y + box.h,
        });
      }
    }

    // Sort rows from top to bottom
    rows.sort((r1, r2) => (r1.centerYSum / r1.boxes.length) - (r2.centerYSum / r2.boxes.length));

    // Sort items within each row from left to right
    const result: Box[] = [];
    let counter = 1;
    for (const row of rows) {
      row.boxes.sort((a, b) => a.x - b.x);
      for (const b of row.boxes) {
        result.push({
          id: baseId + counter++,
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
        });
      }
    }

    return result;
  }
}

export function detectImageItems(imageData: ImageDataLike, options: ImageDetectorOptions = {}): Box[] {
  return ImageDetector.detect(imageData, options);
}
