import { ref, onMounted, onUnmounted, computed, watch, nextTick, reactive, watchEffect, toRefs, toRef } from 'vue';
import type { UploadFile, DropdownInstance } from 'element-plus';
import { ElMessageBox, ElMessage } from 'element-plus';
import { ImageEditorState, type Box, type ExportOptions } from '../core/ImageEditorState';
import JSZip from 'jszip';

export type ToolType = 'select' | 'multiselect' | 'draw' | 'hand' | 'delete';
export type DetectionMode = 'cluster' | 'grid' | 'manual';

export function useImageEditor(t: (key: string) => string) {
  // --- Core State ---
  const editorState = reactive(new ImageEditorState(t));

  // --- UI Elements ---
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  const previewCanvasRef = ref<HTMLCanvasElement | null>(null);
  const animationCanvasRef = ref<HTMLCanvasElement | null>(null);
  const fileInputRef = ref<HTMLInputElement | null>(null);
  const ctxRef = ref<CanvasRenderingContext2D | null>(null);

  // --- Active Tool & Selection ---
  const activeTool = ref<ToolType>('select');
  const selectedBoxId = ref<number | null>(null);
  const selectedBoxIds = ref<number[]>([]);

  // --- Interaction State ---
  const isDrawing = ref(false);
  const isMoving = ref(false);
  const isResizing = ref(false);
  const isPanning = ref(false);
  const isSpacePressed = ref(false);
  const startX = ref(0);
  const startY = ref(0);
  const offsetX = ref(0);
  const offsetY = ref(0);
  const panStartX = ref(0);
  const panStartY = ref(0);
  const activeAnchor = ref<string | null>(null);
  const originalAspectRatio = ref(1);
  const cursorStyle = ref('default');

  // --- Pan & Zoom State ---
  const isFitMode = ref(true);
  const canvasZoom = ref(100);
  const canvasPadding = ref(20);
  const panOffset = reactive({ x: 0, y: 0 });

  // --- Slicing & Detection State ---
  const slicingMode = ref<'custom' | 'grid'>('custom');
  const detectionMode = ref<DetectionMode>('cluster');
  const autoDetectMode = ref<'padding' | 'fixedSize'>('padding');
  const autoDetectPadding = ref(0);
  const clusterTolerance = ref(42);
  const clusterAlpha = ref(24);

  // --- Animation Preview State ---
  const previewMode = ref<'animation' | 'static'>('animation');
  const animationTargetRow = ref<number | 'all' | 'selected' | string>(0);
  const animationFps = ref(8); // range 1-30
  const isPlaying = ref(true);
  const currentFrameIndex = ref(0);
  let animationReqId: number | null = null;
  let lastFrameTimestamp = 0;

  // --- Export State ---
  const exportFormat = ref<'png' | 'webp'>('png');
  const exportSizePreset = ref<'original' | 'sticker512' | 'icon256'>('original');
  const exportBackground = ref<'transparent' | 'white'>('transparent');
  const exportPrefix = ref('asset');
  const exportConnector = ref('-');
  const exportScope = ref<'all' | 'row'>('all');
  const exportSelectedRow = ref<number>(0);

  // --- File Metadata ---
  const fileInfo = reactive({
    name: '',
    size: 0,
    formattedSize: '',
    width: 0,
    height: 0,
  });

  // --- Undo / Redo History ---
  const history = ref<Box[][]>([]);
  const historyIndex = ref(-1);
  let isPerformingHistoryAction = false;

  const canUndo = computed(() => historyIndex.value > 0);
  const canRedo = computed(() => historyIndex.value >= 0 && historyIndex.value < history.value.length - 1);

  const saveHistory = () => {
    if (isPerformingHistoryAction) return;
    const snapshot = editorState.boxes.map(b => ({ ...b }));
    // If not at tail of history, truncate redo stack
    if (historyIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, historyIndex.value + 1);
    }
    history.value.push(snapshot);
    if (history.value.length > 40) {
      history.value.shift();
    }
    historyIndex.value = history.value.length - 1;
  };

  const undo = () => {
    if (!canUndo.value) return;
    isPerformingHistoryAction = true;
    historyIndex.value--;
    editorState.boxes = history.value[historyIndex.value].map(b => ({ ...b }));
    if (selectedBoxId.value && !editorState.boxes.some(b => b.id === selectedBoxId.value)) {
      selectedBoxId.value = null;
    }
    isPerformingHistoryAction = false;
    draw();
  };

  const redo = () => {
    if (!canRedo.value) return;
    isPerformingHistoryAction = true;
    historyIndex.value++;
    editorState.boxes = history.value[historyIndex.value].map(b => ({ ...b }));
    isPerformingHistoryAction = false;
    draw();
  };

  const resetAll = () => {
    ElMessageBox.confirm(
      t('messages.clearAllConfirmMsg') || 'Đặt lại toàn bộ trạng thái và các vùng chọn?',
      t('messages.clearAllConfirmTitle') || 'Xác nhận đặt lại',
      { confirmButtonText: 'Đồng ý', cancelButtonText: 'Hủy', type: 'warning' }
    ).then(() => {
      editorState.clearBoxes();
      editorState.clearGrid();
      selectedBoxId.value = null;
      selectedBoxIds.value = [];
      panOffset.x = 0;
      panOffset.y = 0;
      canvasZoom.value = 100;
      history.value = [[]];
      historyIndex.value = 0;
      draw();
    }).catch(() => {});
  };

  const resetSession = () => {
    editorState.sourceImage = null;
    editorState.clearBoxes();
    editorState.clearGrid();
    selectedBoxId.value = null;
    selectedBoxIds.value = [];
    fileInfo.name = '';
    fileInfo.size = 0;
    fileInfo.formattedSize = '';
    fileInfo.width = 0;
    fileInfo.height = 0;
    panOffset.x = 0;
    panOffset.y = 0;
    canvasZoom.value = 100;
    isFitMode.value = true;
    history.value = [[]];
    historyIndex.value = 0;
    if (fileInputRef.value) {
      fileInputRef.value.value = '';
    }
    const canvas = canvasRef.value;
    const ctx = ctxRef.value;
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    draw();
  };

  const createNewSession = (force?: boolean) => {
    if (editorState.sourceImage && !force) {
      ElMessageBox.confirm(
        t('messages.newSessionConfirmMsg') || 'Bạn có muốn đóng phiên làm việc hiện tại để bắt đầu phiên mới không?',
        t('messages.newSessionConfirmTitle') || 'Tạo phiên làm việc mới',
        {
          confirmButtonText: 'Đồng ý',
          cancelButtonText: 'Hủy',
          type: 'warning',
        }
      ).then(() => {
        resetSession();
      }).catch(() => {});
    } else {
      resetSession();
    }
  };

  // --- Context Menu State ---
  const dropdownRef = ref<DropdownInstance | null>(null);
  const isMenuVisible = ref(false);
  const menuTop = ref(0);
  const menuLeft = ref(0);
  const rightClickedBoxId = ref<number | null>(null);

  // --- Computed Properties ---
  const fileNamePreview = computed(() => {
    const ext = exportFormat.value === 'webp' ? 'webp' : 'png';
    return `${exportPrefix.value}${exportConnector.value}1.${ext}`;
  });

  const selectedBox = computed(() => {
    if (!selectedBoxId.value) return null;
    return editorState.boxes.find(b => b.id === selectedBoxId.value) || null;
  });

  const selectedBoxIndex = computed(() => {
    if (!selectedBoxId.value) return -1;
    return editorState.boxes.findIndex(b => b.id === selectedBoxId.value);
  });

  // Helper to determine if box A encloses box B
  const isEnclosingBox = (parent: Box, candidate: Box): boolean => {
    if (parent.id === candidate.id) return false;
    const centerX = candidate.x + candidate.w / 2;
    const centerY = candidate.y + candidate.h / 2;
    return (
      centerX >= parent.x - 2 &&
      centerX <= parent.x + parent.w + 2 &&
      centerY >= parent.y - 2 &&
      centerY <= parent.y + parent.h + 2
    );
  };

  // Find boxes enclosed by a specific box
  const getEnclosedBoxes = (parent: Box): Box[] => {
    return editorState.boxes.filter(b => isEnclosingBox(parent, b));
  };

  // Leaf boxes (boxes that do NOT enclose multiple other boxes)
  const leafBoxes = computed(() => {
    return editorState.boxes.filter(b => {
      const enclosed = getEnclosedBoxes(b);
      return enclosed.length < 2;
    });
  });

  // Clustered rows for custom mode
  const customRows = computed(() => {
    if (slicingMode.value !== 'custom' || leafBoxes.value.length === 0) return [];

    const sorted = [...leafBoxes.value].sort((a, b) => a.y - b.y);
    const rows: Array<{ rowIndex: number; name: string; boxes: Box[] }> = [];

    for (const box of sorted) {
      let placed = false;
      const boxCenterY = box.y + box.h / 2;
      for (const r of rows) {
        const avgCenterY = r.boxes.reduce((sum, b) => sum + (b.y + b.h / 2), 0) / r.boxes.length;
        const avgH = r.boxes.reduce((sum, b) => sum + b.h, 0) / r.boxes.length;
        if (Math.abs(boxCenterY - avgCenterY) < avgH * 0.45) {
          r.boxes.push(box);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push({
          rowIndex: rows.length,
          name: `Row ${rows.length + 1}`,
          boxes: [box],
        });
      }
    }

    rows.forEach((r, idx) => {
      r.boxes.sort((a, b) => a.x - b.x);
      const customName = editorState.rowNames[idx];
      if (customName && customName.trim()) {
        r.name = `Row ${idx + 1}: ${customName.trim()} (${r.boxes.length} frames)`;
      } else {
        r.name = `Row ${idx + 1} (${r.boxes.length} frames)`;
      }
    });

    return rows;
  });

  const availableRows = computed(() => {
    if (slicingMode.value === 'grid') {
      if (!editorState.gridArea) return [];
      return Array.from({ length: editorState.gridRows }, (_, r) => {
        const customName = (editorState.rowNames[r] || '').trim();
        const label = customName ? `Row ${r + 1}: ${customName}` : `Row ${r + 1}`;
        return {
          index: r,
          label: `${label} (${editorState.gridCols} frames)`,
          count: editorState.gridCols,
          name: customName || `row-${r + 1}`,
        };
      });
    }
    return customRows.value.map(r => ({
      index: r.rowIndex,
      label: r.name,
      count: r.boxes.length,
      name: editorState.rowNames[r.rowIndex]?.trim() || `row-${r.rowIndex + 1}`,
    }));
  });

  // Selected boxes computation
  const selectedBoxes = computed(() => {
    if (selectedBoxIds.value.length > 1) {
      return editorState.boxes
        .filter(b => selectedBoxIds.value.includes(b.id))
        .sort((a, b) => {
          if (Math.abs(a.y - b.y) > Math.min(a.h, b.h) * 0.4) {
            return a.y - b.y;
          }
          return a.x - b.x;
        });
    } else if (selectedBoxId.value) {
      const box = editorState.boxes.find(b => b.id === selectedBoxId.value);
      if (!box) return [];
      const enclosed = getEnclosedBoxes(box);
      if (enclosed.length > 1) {
        return enclosed.sort((a, b) => a.x - b.x);
      }
      return [box];
    }
    return [];
  });

  const selectedBoxCustomName = ref('');

  const enclosedBoxesCount = computed(() => {
    if (!selectedBox.value) return 0;
    return getEnclosedBoxes(selectedBox.value).length;
  });

  watch(selectedBox, (newBox) => {
    if (newBox) {
      const idx = selectedBoxIndex.value;
      const enclosed = getEnclosedBoxes(newBox);
      if (enclosed.length > 1) {
        if (customRows.value.length > 0) {
          const rowIdx = customRows.value.findIndex(r => r.boxes.some(b => isEnclosingBox(newBox, b)));
          if (rowIdx !== -1 && editorState.rowNames[rowIdx]) {
            selectedBoxCustomName.value = editorState.rowNames[rowIdx].trim();
            return;
          }
        }
        const fallbackRowIdx = customRows.value.length > 0
          ? customRows.value.findIndex(r => r.boxes.some(b => isEnclosingBox(newBox, b)))
          : -1;
        selectedBoxCustomName.value = fallbackRowIdx !== -1 ? `row-${fallbackRowIdx + 1}` : 'row-1';
        return;
      }
      if (customRows.value.length > 0) {
        const rowIdx = customRows.value.findIndex(r => r.boxes.some(b => b.id === newBox.id));
        if (rowIdx !== -1 && editorState.rowNames[rowIdx]) {
          selectedBoxCustomName.value = editorState.rowNames[rowIdx].trim();
          return;
        }
      }
      selectedBoxCustomName.value = `asset-${idx + 1}`;
    } else {
      selectedBoxCustomName.value = '';
    }
  });

  const animationFrames = computed(() => {
    if (slicingMode.value === 'grid' && editorState.gridArea) {
      const { x, y, w, h } = editorState.gridArea;
      const cellW = w / editorState.gridCols;
      const cellH = h / editorState.gridRows;
      const frames: Array<{ x: number; y: number; w: number; h: number; rowIndex: number; colIndex: number; label: string }> = [];

      if (animationTargetRow.value === 'all') {
        for (let r = 0; r < editorState.gridRows; r++) {
          const rowName = (editorState.rowNames[r] || '').trim() || `Row ${r + 1}`;
          for (let c = 0; c < editorState.gridCols; c++) {
            frames.push({
              x: x + c * cellW,
              y: y + r * cellH,
              w: cellW,
              h: cellH,
              rowIndex: r,
              colIndex: c,
              label: `${rowName} #${c + 1}`,
            });
          }
        }
      } else {
        const r = typeof animationTargetRow.value === 'number' ? animationTargetRow.value : 0;
        const validR = Math.max(0, Math.min(r, editorState.gridRows - 1));
        const rowName = (editorState.rowNames[validR] || '').trim() || `Row ${validR + 1}`;
        for (let c = 0; c < editorState.gridCols; c++) {
          frames.push({
            x: x + c * cellW,
            y: y + validR * cellH,
            w: cellW,
            h: cellH,
            rowIndex: validR,
            colIndex: c,
            label: `${rowName} #${c + 1}`,
          });
        }
      }
      return frames;
    } else if (slicingMode.value === 'custom' && editorState.boxes.length > 0) {
      // 1. If target is explicitly 'selected'
      if (animationTargetRow.value === 'selected') {
        if (selectedBoxes.value.length > 0) {
          return selectedBoxes.value.map((b, idx) => ({
            x: b.x,
            y: b.y,
            w: b.w,
            h: b.h,
            rowIndex: 0,
            colIndex: idx,
            label: `Selected #${idx + 1}`,
          }));
        }
      }

      // 2. If target is a specific row number in customRows
      if (typeof animationTargetRow.value === 'number') {
        const rows = customRows.value;
        if (rows.length > 0) {
          const validR = Math.max(0, Math.min(animationTargetRow.value, rows.length - 1));
          const row = rows[validR];
          if (row && row.boxes.length > 0) {
            return row.boxes.map((b, idx) => ({
              x: b.x,
              y: b.y,
              w: b.w,
              h: b.h,
              rowIndex: validR,
              colIndex: idx,
              label: `${row.name} #${idx + 1}`,
            }));
          }
        }
      }

      // 3. If target is 'all'
      if (animationTargetRow.value === 'all') {
        return leafBoxes.value.map((b, idx) => ({
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          rowIndex: 0,
          colIndex: idx,
          label: `Asset #${idx + 1}`,
        }));
      }

      // 4. Default fallback: if multiple selected boxes exist (e.g. user selected multiple or drawn an enclosing box)
      if (selectedBoxes.value.length > 1) {
        return selectedBoxes.value.map((b, idx) => ({
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          rowIndex: 0,
          colIndex: idx,
          label: `Selected #${idx + 1}`,
        }));
      }

      // If custom rows exist, default to the first row
      if (customRows.value.length > 0) {
        const row = customRows.value[0];
        return row.boxes.map((b, idx) => ({
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          rowIndex: 0,
          colIndex: idx,
          label: `${row.name} #${idx + 1}`,
        }));
      }

      return leafBoxes.value.map((b, idx) => ({
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        rowIndex: 0,
        colIndex: idx,
        label: `Asset #${idx + 1}`,
      }));
    }
    return [];
  });

  const currentFrame = computed(() => {
    const frames = animationFrames.value;
    if (frames.length === 0) return null;
    const idx = Math.min(Math.max(0, currentFrameIndex.value), frames.length - 1);
    return frames[idx] || null;
  });

  // --- Format Bytes Helper ---
  function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  // --- Drawing Constants & Anchors ---
  const ANCHOR_RADIUS = 4.5;
  const ANCHOR_FILL = '#ffffff';
  const ANCHOR_STROKE = '#8b5cf6'; // Indigo/violet
  const BOX_COLOR = '#10b981'; // Emerald
  const SELECTED_BOX_COLOR = '#8b5cf6'; // Violet/Indigo

  const getAnchors = (box: Box) => {
    return {
      topLeft: { x: box.x, y: box.y },
      topMiddle: { x: box.x + box.w / 2, y: box.y },
      topRight: { x: box.x + box.w, y: box.y },
      middleLeft: { x: box.x, y: box.y + box.h / 2 },
      middleRight: { x: box.x + box.w, y: box.y + box.h / 2 },
      bottomLeft: { x: box.x, y: box.y + box.h },
      bottomMiddle: { x: box.x + box.w / 2, y: box.y + box.h },
      bottomRight: { x: box.x + box.w, y: box.y + box.h },
    };
  };

  // Helper to draw a rounded rectangle
  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const draw = () => {
    const canvas = canvasRef.value;
    const ctx = ctxRef.value;
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (editorState.sourceImage) {
      // 1. Draw source image
      ctx.drawImage(editorState.sourceImage, canvasPadding.value, canvasPadding.value);

      // 2. Draw boxes in Custom / Cluster / Manual mode
      if (slicingMode.value === 'custom') {
        editorState.boxes.forEach((box, index) => {
          const isSelected = box.id === selectedBoxId.value || selectedBoxIds.value.includes(box.id);

          // Box rect
          ctx.lineWidth = isSelected ? 2.5 : 2;
          ctx.strokeStyle = isSelected ? SELECTED_BOX_COLOR : BOX_COLOR;
          if (isSelected) {
            ctx.fillStyle = 'rgba(139, 92, 246, 0.08)';
            ctx.fillRect(box.x, box.y, box.w, box.h);
          }
          ctx.strokeRect(box.x, box.y, box.w, box.h);

          // Numbered Badge at top-left
          const badgeNum = String(index + 1);
          ctx.font = '600 11px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const textMetrics = ctx.measureText(badgeNum);
          const badgeH = 18;
          const badgeW = Math.max(18, textMetrics.width + 10);
          const badgeX = box.x;
          const badgeY = box.y >= 20 ? box.y - 19 : box.y + 2;

          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetY = 1;
          drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 4);
          ctx.fillStyle = isSelected ? '#4338ca' : '#0f172a'; // Deep slate / indigo
          ctx.fill();
          ctx.restore();

          // Badge text
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeNum, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);

          // 8 Anchor Handles (only for primary selected box)
          if (isSelected && box.id === selectedBoxId.value) {
            const anchors = getAnchors(box);
            for (const key in anchors) {
              const anchor = anchors[key as keyof typeof anchors];
              ctx.beginPath();
              ctx.arc(anchor.x, anchor.y, ANCHOR_RADIUS, 0, Math.PI * 2);
              ctx.fillStyle = ANCHOR_FILL;
              ctx.fill();
              ctx.lineWidth = 2;
              ctx.strokeStyle = ANCHOR_STROKE;
              ctx.stroke();
            }
          }
        });

        // Highlight active animation frame in custom mode
        const frame = currentFrame.value;
        if (frame && frame.w > 0 && frame.h > 0) {
          ctx.save();
          ctx.fillStyle = 'rgba(99, 102, 241, 0.22)';
          ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#6366f1';
          ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);
          ctx.restore();
        }
      } else if (slicingMode.value === 'grid' && editorState.gridArea) {
        // Grid mode drawing
        const box = editorState.gridArea;
        ctx.lineWidth = 2;
        ctx.strokeStyle = SELECTED_BOX_COLOR;
        ctx.strokeRect(box.x, box.y, box.w, box.h);

        ctx.strokeStyle = SELECTED_BOX_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        const cellWidth = box.w / editorState.gridCols;
        for (let i = 1; i < editorState.gridCols; i++) {
          ctx.beginPath();
          ctx.moveTo(box.x + i * cellWidth, box.y);
          ctx.lineTo(box.x + i * cellWidth, box.y + box.h);
          ctx.stroke();
        }

        const cellHeight = box.h / editorState.gridRows;
        for (let i = 1; i < editorState.gridRows; i++) {
          ctx.beginPath();
          ctx.moveTo(box.x, box.y + i * cellHeight);
          ctx.lineTo(box.x + box.w, box.y + i * cellHeight);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // Active Row & Frame highlight
        if (typeof animationTargetRow.value === 'number' && animationTargetRow.value < editorState.gridRows) {
          ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
          ctx.fillRect(box.x, box.y + animationTargetRow.value * cellHeight, box.w, cellHeight);
        }

        const frame = currentFrame.value;
        if (frame && frame.w > 0 && frame.h > 0) {
          ctx.fillStyle = 'rgba(99, 102, 241, 0.22)';
          ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#6366f1';
          ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);
        }

        const anchors = getAnchors(box);
        for (const key in anchors) {
          const anchor = anchors[key as keyof typeof anchors];
          ctx.beginPath();
          ctx.arc(anchor.x, anchor.y, ANCHOR_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = ANCHOR_FILL;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = ANCHOR_STROKE;
          ctx.stroke();
        }
      }
    }
  };

  const updatePreview = () => {
    const previewCanvas = previewCanvasRef.value;
    if (!previewCanvas || !editorState.sourceImage) return;

    const container = previewCanvas.parentElement;
    if (!container) return;

    previewCanvas.width = container.clientWidth;
    previewCanvas.height = container.clientHeight;

    const previewCtx = previewCanvas.getContext('2d');
    if (!previewCtx) return;

    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    if (slicingMode.value === 'grid') return;

    const currentBox = selectedBox.value;
    if (currentBox && currentBox.w > 0 && currentBox.h > 0) {
      const aspectRatio = currentBox.w / currentBox.h;
      let drawW = previewCanvas.width - 16;
      let drawH = drawW / aspectRatio;

      if (drawH > previewCanvas.height - 16) {
        drawH = previewCanvas.height - 16;
        drawW = drawH * aspectRatio;
      }

      const drawX = (previewCanvas.width - drawW) / 2;
      const drawY = (previewCanvas.height - drawH) / 2;

      previewCtx.drawImage(
        editorState.sourceImage,
        currentBox.x - canvasPadding.value,
        currentBox.y - canvasPadding.value,
        currentBox.w,
        currentBox.h,
        drawX,
        drawY,
        drawW,
        drawH
      );
    }
  };

  // --- Watchers for automatic redraw ---
  watchEffect(() => {
    if (canvasRef.value) {
      draw();
    }
  });

  watchEffect(() => {
    if (previewCanvasRef.value) {
      updatePreview();
    }
  });

  let isRevertingSlicingMode = false;
  watch(slicingMode, (newMode, oldMode) => {
    if (isRevertingSlicingMode) {
      isRevertingSlicingMode = false;
      return;
    }
    const hasWorkInProgress = editorState.boxes.length > 0 || editorState.gridArea;
    if (!hasWorkInProgress) {
      editorState.clearBoxes();
      selectedBoxId.value = null;
      editorState.clearGrid();
      return;
    }

    ElMessageBox.confirm(
      t('messages.replaceConfirmMsg') || 'Chuyển chế độ sẽ xóa các vùng chọn hiện tại, tiếp tục?',
      t('messages.clearAllConfirmTitle') || 'Cảnh báo',
      {
        confirmButtonText: 'Đồng ý',
        cancelButtonText: 'Hủy',
        type: 'warning',
      }
    ).then(() => {
      editorState.clearBoxes();
      selectedBoxId.value = null;
      editorState.clearGrid();
      saveHistory();
    }).catch(() => {
      isRevertingSlicingMode = true;
      slicingMode.value = oldMode;
    });
  });

  watch(() => editorState.gridRows, (newRows) => {
    editorState.syncRowNames(newRows);
    if (typeof animationTargetRow.value === 'number' && animationTargetRow.value >= newRows) {
      animationTargetRow.value = Math.max(0, newRows - 1);
    }
  });

  watch([() => editorState.gridRows, () => editorState.gridCols], () => {
    if (slicingMode.value === 'grid') draw();
  });

  watch(animationFrames, (frames) => {
    if (frames.length === 0) {
      currentFrameIndex.value = 0;
    } else if (currentFrameIndex.value >= frames.length) {
      currentFrameIndex.value = 0;
    }
  });

  watch(animationTargetRow, () => {
    currentFrameIndex.value = 0;
    draw();
  });

  watch(selectedBoxes, (newSel) => {
    if (slicingMode.value === 'custom') {
      if (newSel.length > 1) {
        animationTargetRow.value = 'selected';
        currentFrameIndex.value = 0;
        draw();
      }
    }
  });

  const setupCanvas = (img: HTMLImageElement) => {
    const canvas = canvasRef.value;
    if (!canvas) return;
    ctxRef.value = canvas.getContext('2d');
    canvas.width = img.width + canvasPadding.value * 2;
    canvas.height = img.height + canvasPadding.value * 2;
    canvas.style.width = `${canvas.width * (canvasZoom.value / 100)}px`;
    canvas.style.height = `${canvas.height * (canvasZoom.value / 100)}px`;
    draw();
  };

  watch(canvasPadding, () => {
    if (editorState.sourceImage) setupCanvas(editorState.sourceImage);
  });

  watch(canvasZoom, (newZoom) => {
    const canvas = canvasRef.value;
    if (canvas && editorState.sourceImage) {
      canvas.style.width = `${(editorState.sourceImage.width + canvasPadding.value * 2) * (newZoom / 100)}px`;
      canvas.style.height = `${(editorState.sourceImage.height + canvasPadding.value * 2) * (newZoom / 100)}px`;
    }
  });

  // --- Zoom Widget Controls ---
  const zoomIn = () => {
    isFitMode.value = false;
    canvasZoom.value = Math.min(400, Math.round(canvasZoom.value + 10));
  };

  const zoomOut = () => {
    isFitMode.value = false;
    canvasZoom.value = Math.max(10, Math.round(canvasZoom.value - 10));
  };

  const resetZoom = () => {
    isFitMode.value = false;
    canvasZoom.value = 100;
    panOffset.x = 0;
    panOffset.y = 0;
  };

  const fitToScreen = (viewportWidth?: number, viewportHeight?: number) => {
    isFitMode.value = true;
    if (!editorState.sourceImage) return;
    const viewportEl = (canvasRef.value?.closest('.canvas-viewport') || canvasRef.value?.parentElement?.parentElement || canvasRef.value?.parentElement) as HTMLElement | null;
    const vpW = viewportWidth || (viewportEl?.clientWidth ?? 800);
    const vpH = viewportHeight || (viewportEl?.clientHeight ?? 600);
    const imgW = editorState.sourceImage.width + canvasPadding.value * 2;
    const imgH = editorState.sourceImage.height + canvasPadding.value * 2;
    const availableW = Math.max(100, vpW - 48);
    const availableH = Math.max(100, vpH - 48);
    const optimalScale = Math.min(availableW / imgW, availableH / imgH);
    canvasZoom.value = Math.max(5, Math.min(400, Math.round(optimalScale * 100)));
    panOffset.x = 0;
    panOffset.y = 0;
  };

  // --- Event Handlers & File Load ---
  const handleFileChange = async (uploadFile: UploadFile) => {
    if (!uploadFile.raw || !uploadFile.raw.type.startsWith('image')) return;

    const file = uploadFile.raw;
    fileInfo.name = file.name;
    fileInfo.size = file.size;
    fileInfo.formattedSize = formatBytes(file.size);

    const performLoad = async () => {
      const img = await editorState.loadImage(file);
      fileInfo.width = img.width;
      fileInfo.height = img.height;
      setupCanvas(img);
      selectedBoxId.value = null;
      selectedBoxIds.value = [];
      panOffset.x = 0;
      panOffset.y = 0;

      await nextTick();
      fitToScreen();

      // Automatically run auto-detect on new image
      await nextTick();
      reapplyAutoDetect();
      saveHistory();
    };

    if (editorState.sourceImage) {
      ElMessageBox.confirm(
        t('messages.replaceConfirmMsg') || 'Thao tác này sẽ thay thế ảnh và toàn bộ vùng chọn hiện tại. Tiếp tục?',
        t('messages.replaceConfirmTitle') || 'Cảnh báo',
        { confirmButtonText: 'Đồng ý', cancelButtonText: 'Hủy', type: 'warning' }
      ).then(performLoad).catch(() => {});
    } else {
      performLoad();
    }
  };

  const getBoxAt = (x: number, y: number): Box | null => {
    const hits: Box[] = [];
    for (let i = editorState.boxes.length - 1; i >= 0; i--) {
      const box = editorState.boxes[i];
      if (box.w > 0 && box.h > 0 && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
        hits.push(box);
      }
    }
    if (hits.length === 0) return null;
    if (hits.length === 1) return hits[0];

    // Prioritize the smallest/innermost item so clicking inside an enclosing container selects the inner item
    hits.sort((a, b) => (a.w * a.h) - (b.w * b.h));
    return hits[0];
  };

  const getAnchorAt = (x: number, y: number, box: Box): string | null => {
    const anchors = getAnchors(box);
    const hitArea = ANCHOR_RADIUS * 2.5;
    for (const key in anchors) {
      const anchor = anchors[key as keyof typeof anchors];
      if (x >= anchor.x - hitArea && x <= anchor.x + hitArea && y >= anchor.y - hitArea && y <= anchor.y + hitArea) {
        return key;
      }
    }
    return null;
  };

  // --- Mouse & Pan Interaction ---
  const onMouseDown = (e: MouseEvent) => {
    if (isMenuVisible.value) closeContextMenu();
    if (!canvasRef.value || !editorState.sourceImage) return;

    // Pan Mode (Hand tool, Space pressed, or Middle mouse button)
    if (activeTool.value === 'hand' || isSpacePressed.value || e.button === 1) {
      e.preventDefault();
      isPanning.value = true;
      panStartX.value = e.clientX - panOffset.x;
      panStartY.value = e.clientY - panOffset.y;
      cursorStyle.value = 'grabbing';
      return;
    }

    e.preventDefault();
    const rect = canvasRef.value.getBoundingClientRect();
    startX.value = (e.clientX - rect.left) / (canvasZoom.value / 100);
    startY.value = (e.clientY - rect.top) / (canvasZoom.value / 100);

    // Delete tool active: click on box deletes it immediately
    if (activeTool.value === 'delete') {
      const clicked = getBoxAt(startX.value, startY.value);
      if (clicked) {
        editorState.deleteBox(clicked.id);
        if (selectedBoxId.value === clicked.id) selectedBoxId.value = null;
        saveHistory();
        draw();
      }
      return;
    }

    // Draw tool active: immediately start drawing a new box
    if (activeTool.value === 'draw') {
      selectedBoxId.value = null;
      isDrawing.value = true;
      const newBox = editorState.addBox({ x: startX.value, y: startY.value, w: 0, h: 0 });
      selectedBoxId.value = newBox.id;
      return;
    }

    // Multi-select tool active: toggle box selection
    if (activeTool.value === 'multiselect') {
      const clicked = getBoxAt(startX.value, startY.value);
      if (clicked) {
        const idx = selectedBoxIds.value.indexOf(clicked.id);
        if (idx === -1) {
          selectedBoxIds.value.push(clicked.id);
          selectedBoxId.value = clicked.id;
        } else {
          selectedBoxIds.value.splice(idx, 1);
          selectedBoxId.value = selectedBoxIds.value[0] || null;
        }
      } else {
        selectedBoxIds.value = [];
        selectedBoxId.value = null;
      }
      draw();
      return;
    }

    // Standard Select Mode
    if (slicingMode.value === 'custom') {
      const currentSelected = editorState.boxes.find(b => b.id === selectedBoxId.value);
      if (currentSelected) {
        const anchor = getAnchorAt(startX.value, startY.value, currentSelected);
        if (anchor) {
          isResizing.value = true;
          activeAnchor.value = anchor;
          originalAspectRatio.value = (currentSelected.w || 1) / (currentSelected.h || 1);
          return;
        }
      }

      const clickedBox = getBoxAt(startX.value, startY.value);
      if (clickedBox) {
        selectedBoxId.value = clickedBox.id;
        selectedBoxIds.value = [clickedBox.id];
        isMoving.value = true;
        offsetX.value = startX.value - clickedBox.x;
        offsetY.value = startY.value - clickedBox.y;

        // Auto-sync animation target when clicking a box in Custom mode
        const enclosed = getEnclosedBoxes(clickedBox);
        if (enclosed.length > 1) {
          animationTargetRow.value = 'selected';
          currentFrameIndex.value = 0;
        } else if (customRows.value.length > 0) {
          const foundRowIdx = customRows.value.findIndex(r => r.boxes.some(b => b.id === clickedBox.id));
          if (foundRowIdx !== -1) {
            if (typeof animationTargetRow.value === 'number') {
              animationTargetRow.value = foundRowIdx;
            }
            const frameInRowIdx = customRows.value[foundRowIdx].boxes.findIndex(b => b.id === clickedBox.id);
            if (frameInRowIdx !== -1) {
              currentFrameIndex.value = frameInRowIdx;
            }
          }
        }
      } else {
        selectedBoxId.value = null;
        selectedBoxIds.value = [];
        isDrawing.value = true;
        const newBox = editorState.addBox({ x: startX.value, y: startY.value, w: 0, h: 0 });
        selectedBoxId.value = newBox.id;
      }
    } else if (slicingMode.value === 'grid') {
      if (editorState.gridArea) {
        const anchor = getAnchorAt(startX.value, startY.value, editorState.gridArea);
        if (anchor) {
          isResizing.value = true;
          activeAnchor.value = anchor;
          originalAspectRatio.value = (editorState.gridArea.w || 1) / (editorState.gridArea.h || 1);
          return;
        }
        if (
          startX.value >= editorState.gridArea.x &&
          startX.value <= editorState.gridArea.x + editorState.gridArea.w &&
          startY.value >= editorState.gridArea.y &&
          startY.value <= editorState.gridArea.y + editorState.gridArea.h
        ) {
          // Interactive grid canvas selection: clicking on a grid cell sets target row/frame and highlights it
          const relX = startX.value - editorState.gridArea.x;
          const relY = startY.value - editorState.gridArea.y;
          const cellWidth = editorState.gridArea.w / editorState.gridCols;
          const cellHeight = editorState.gridArea.h / editorState.gridRows;
          const c = Math.min(Math.max(0, Math.floor(relX / cellWidth)), editorState.gridCols - 1);
          const r = Math.min(Math.max(0, Math.floor(relY / cellHeight)), editorState.gridRows - 1);
          animationTargetRow.value = r;
          currentFrameIndex.value = c;
          draw();

          isMoving.value = true;
          offsetX.value = startX.value - editorState.gridArea.x;
          offsetY.value = startY.value - editorState.gridArea.y;
          return;
        }
      }
      if (!editorState.gridArea) {
        isDrawing.value = true;
        editorState.gridArea = { id: Date.now(), x: startX.value, y: startY.value, w: 0, h: 0 };
      }
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    // Canvas Panning
    if (isPanning.value) {
      panOffset.x = e.clientX - panStartX.value;
      panOffset.y = e.clientY - panStartY.value;
      return;
    }

    if (!canvasRef.value || !editorState.sourceImage) return;

    if (activeTool.value === 'hand' || isSpacePressed.value) {
      cursorStyle.value = 'grab';
      return;
    }

    if (activeTool.value === 'draw') {
      cursorStyle.value = 'crosshair';
    } else if (activeTool.value === 'delete') {
      cursorStyle.value = 'not-allowed';
    }

    const rect = canvasRef.value.getBoundingClientRect();
    const currentX = (e.clientX - rect.left) / (canvasZoom.value / 100);
    const currentY = (e.clientY - rect.top) / (canvasZoom.value / 100);

    let targetBox: Box | null = null;
    if (slicingMode.value === 'custom') {
      targetBox = editorState.boxes.find(b => b.id === selectedBoxId.value) || null;
    } else if (slicingMode.value === 'grid') {
      targetBox = editorState.gridArea;
    }

    // Update cursor style when hovering anchors or boxes
    if (activeTool.value === 'select') {
      let cursor = 'default';
      if (targetBox) {
        const anchor = getAnchorAt(currentX, currentY, targetBox);
        if (anchor) {
          if (anchor === 'topLeft' || anchor === 'bottomRight') cursor = 'nwse-resize';
          else if (anchor === 'topRight' || anchor === 'bottomLeft') cursor = 'nesw-resize';
          else if (anchor === 'middleLeft' || anchor === 'middleRight') cursor = 'ew-resize';
          else if (anchor === 'topMiddle' || anchor === 'bottomMiddle') cursor = 'ns-resize';
        } else if (getBoxAt(currentX, currentY)) {
          cursor = 'move';
        }
      } else if (getBoxAt(currentX, currentY)) {
        cursor = 'pointer';
      }
      cursorStyle.value = cursor;
    }

    // Handle box resizing
    if (isResizing.value && targetBox) {
      const originalX = targetBox.x;
      const originalY = targetBox.y;
      const originalW = targetBox.w;
      const originalH = targetBox.h;
      let newX = targetBox.x, newY = targetBox.y, newW = targetBox.w, newH = targetBox.h;

      if (e.shiftKey) {
        originalAspectRatio.value = targetBox.w / targetBox.h;
      }

      switch (activeAnchor.value) {
        case 'topLeft': {
          newW = originalX + originalW - currentX;
          newH = originalY + originalH - currentY;
          if (e.shiftKey) {
            if (Math.abs(newW / originalAspectRatio.value - newH) > Math.abs(newH * originalAspectRatio.value - newW)) {
              newH = newW / originalAspectRatio.value;
            } else {
              newW = newH * originalAspectRatio.value;
            }
          }
          newX = originalX + originalW - newW;
          newY = originalY + originalH - newH;
          break;
        }
        case 'topRight': {
          newW = currentX - originalX;
          newH = originalY + originalH - currentY;
          if (e.shiftKey) {
            if (Math.abs(newW / originalAspectRatio.value - newH) > Math.abs(newH * originalAspectRatio.value - newW)) {
              newH = newW / originalAspectRatio.value;
            } else {
              newW = newH * originalAspectRatio.value;
            }
          }
          newY = originalY + originalH - newH;
          break;
        }
        case 'bottomLeft': {
          newW = originalX + originalW - currentX;
          newH = currentY - originalY;
          if (e.shiftKey) {
            if (Math.abs(newW / originalAspectRatio.value - newH) > Math.abs(newH * originalAspectRatio.value - newW)) {
              newH = newW / originalAspectRatio.value;
            } else {
              newW = newH * originalAspectRatio.value;
            }
          }
          newX = originalX + originalW - newW;
          break;
        }
        case 'bottomRight': {
          newW = currentX - originalX;
          newH = currentY - originalY;
          if (e.shiftKey) {
            if (Math.abs(newW / originalAspectRatio.value - newH) > Math.abs(newH * originalAspectRatio.value - newW)) {
              newH = newW / originalAspectRatio.value;
            } else {
              newW = newH * originalAspectRatio.value;
            }
          }
          break;
        }
        case 'topMiddle': { newY = currentY; newH = originalY + originalH - currentY; break; }
        case 'bottomMiddle': { newH = currentY - originalY; break; }
        case 'middleLeft': { newX = currentX; newW = originalX + originalW - currentX; break; }
        case 'middleRight': { newW = currentX - originalX; break; }
      }
      if (newX < 0) { newW += newX; newX = 0; }
      if (newY < 0) { newH += newY; newY = 0; }
      if (newX + newW > canvasRef.value.width) { newW = canvasRef.value.width - newX; }
      if (newY + newH > canvasRef.value.height) { newH = canvasRef.value.height - newY; }
      targetBox.x = Math.round(newX);
      targetBox.y = Math.round(newY);
      targetBox.w = Math.round(newW);
      targetBox.h = Math.round(newH);
    } else if (isMoving.value && targetBox) {
      let newX = currentX - offsetX.value;
      let newY = currentY - offsetY.value;
      newX = Math.max(0, Math.min(newX, canvasRef.value.width - targetBox.w));
      newY = Math.max(0, Math.min(newY, canvasRef.value.height - targetBox.h));
      targetBox.x = Math.round(newX);
      targetBox.y = Math.round(newY);
    } else if (isDrawing.value) {
      const boxToDraw = slicingMode.value === 'custom'
        ? editorState.boxes[editorState.boxes.length - 1]
        : editorState.gridArea;
      if (boxToDraw) {
        boxToDraw.w = Math.round(currentX - startX.value);
        boxToDraw.h = Math.round(currentY - startY.value);
      }
    }
  };

  const onMouseUp = () => {
    if (isPanning.value) {
      isPanning.value = false;
      cursorStyle.value = (activeTool.value === 'hand' || isSpacePressed.value) ? 'grab' : 'default';
      return;
    }

    if (!editorState.sourceImage) return;

    let subjectBox: Box | null = null;
    const wasDrawingOrResizing = isDrawing.value || isResizing.value || isMoving.value;

    if (slicingMode.value === 'custom' && (isDrawing.value || isResizing.value)) {
      subjectBox = editorState.boxes.find(b => b.id === selectedBoxId.value) || null;
    } else if (slicingMode.value === 'grid' && (isDrawing.value || isResizing.value)) {
      subjectBox = editorState.gridArea;
    }

    if (subjectBox) {
      if (subjectBox.w < 0) { subjectBox.x += subjectBox.w; subjectBox.w = -subjectBox.w; }
      if (subjectBox.h < 0) { subjectBox.y += subjectBox.h; subjectBox.h = -subjectBox.h; }
      if (subjectBox.w < 6 || subjectBox.h < 6) {
        if (slicingMode.value === 'custom') {
          if (isDrawing.value) editorState.deleteBox(subjectBox.id);
          selectedBoxId.value = null;
        } else {
          editorState.clearGrid();
        }
      }
    }

    if (wasDrawingOrResizing) {
      saveHistory();
    }

    isDrawing.value = false;
    isMoving.value = false;
    isResizing.value = false;
    activeAnchor.value = null;
  };

  const onMouseLeave = () => {
    if (isDrawing.value || isMoving.value || isResizing.value || isPanning.value) onMouseUp();
  };

  // Canvas Mouse Wheel for Zoom (Ctrl + Wheel) or Pan
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      isFitMode.value = false;
      const zoomDelta = e.deltaY < 0 ? 10 : -10;
      canvasZoom.value = Math.max(10, Math.min(400, canvasZoom.value + zoomDelta));
    } else if (activeTool.value === 'hand' || isSpacePressed.value) {
      e.preventDefault();
      panOffset.x -= e.deltaX;
      panOffset.y -= e.deltaY;
    }
  };

  // --- Context Menu ---
  const onRightClick = async (e: MouseEvent) => {
    if (slicingMode.value === 'grid') return;
    if (!canvasRef.value || !editorState.sourceImage) return;

    const rect = canvasRef.value.getBoundingClientRect();
    const x = (e.clientX - rect.left) / (canvasZoom.value / 100);
    const y = (e.clientY - rect.top) / (canvasZoom.value / 100);

    const clickedBox = getBoxAt(x, y);
    if (clickedBox) {
      rightClickedBoxId.value = clickedBox.id;
      menuTop.value = e.clientY;
      menuLeft.value = e.clientX;
      isMenuVisible.value = true;
      await nextTick();
      dropdownRef.value?.handleOpen();
    }
  };

  const closeContextMenu = () => { isMenuVisible.value = false; };
  const handleVisibleChange = (visible: boolean) => { if (!visible) closeContextMenu(); };

  const handleCommand = (command: string) => {
    if (rightClickedBoxId.value === null) return;
    if (command === 'deleteBox') {
      if (selectedBoxId.value === rightClickedBoxId.value) selectedBoxId.value = null;
      editorState.deleteBox(rightClickedBoxId.value);
      saveHistory();
    }
    closeContextMenu();
  };

  // --- Keyboard Shortcuts ---
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ignore keybindings if focus is on an input or textarea
    const target = e.target as HTMLElement;
    if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

    // Tool switching shortcuts
    if (e.key === 'v' || e.key === 'V') {
      activeTool.value = 'select';
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      activeTool.value = 'multiselect';
      return;
    }
    if (e.key === 'b' || e.key === 'B') {
      activeTool.value = 'draw';
      return;
    }
    if (e.key === 'h' || e.key === 'H') {
      activeTool.value = 'hand';
      return;
    }

    // Space key for temporary Hand tool
    if (e.code === 'Space' && !isSpacePressed.value) {
      isSpacePressed.value = true;
      cursorStyle.value = 'grab';
      return;
    }

    // Undo / Redo shortcuts
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      if (e.shiftKey) {
        e.preventDefault();
        redo();
      } else {
        e.preventDefault();
        undo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      redo();
      return;
    }

    // New Session shortcut (Alt+N or Ctrl+Shift+N)
    if ((e.altKey && (e.key === 'n' || e.key === 'N')) || ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'n' || e.key === 'N'))) {
      e.preventDefault();
      createNewSession();
      return;
    }

    if (!editorState.sourceImage) return;

    // Delete and Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (slicingMode.value === 'grid' && editorState.gridArea) {
        e.preventDefault();
        editorState.clearGrid();
        saveHistory();
      } else if (slicingMode.value === 'custom' && selectedBoxId.value !== null) {
        e.preventDefault();
        deleteSelectedBox();
      }
      return;
    }

    // Arrow Key Nudge
    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (arrowKeys.includes(e.key)) {
      let targetBox: Box | null = null;
      if (slicingMode.value === 'custom' && selectedBoxId.value !== null) {
        targetBox = editorState.boxes.find(b => b.id === selectedBoxId.value) || null;
      } else if (slicingMode.value === 'grid' && editorState.gridArea) {
        targetBox = editorState.gridArea;
      }

      if (targetBox) {
        e.preventDefault();
        const moveAmount = e.shiftKey ? 10 : 1;
        switch (e.key) {
          case 'ArrowUp': targetBox.y -= moveAmount; break;
          case 'ArrowDown': targetBox.y += moveAmount; break;
          case 'ArrowLeft': targetBox.x -= moveAmount; break;
          case 'ArrowRight': targetBox.x += moveAmount; break;
        }
        draw();
        saveHistory();
      }
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      isSpacePressed.value = false;
      cursorStyle.value = activeTool.value === 'hand' ? 'grab' : 'default';
    }
  };

  // --- Box Actions ---
  const deleteSelectedBox = () => {
    if (selectedBoxId.value !== null) {
      editorState.deleteBox(selectedBoxId.value);
      selectedBoxId.value = null;
      selectedBoxIds.value = [];
      saveHistory();
      draw();
    }
  };

  const adjustBoxPadding = (delta: number) => {
    const box = selectedBox.value;
    if (!box || !canvasRef.value) return;
    box.x = Math.max(0, box.x - delta);
    box.y = Math.max(0, box.y - delta);
    box.w = Math.min(canvasRef.value.width - box.x, box.w + delta * 2);
    box.h = Math.min(canvasRef.value.height - box.y, box.h + delta * 2);
    saveHistory();
    draw();
  };

  const handleClearAll = () => {
    if (slicingMode.value === 'custom') {
      if (editorState.boxes.length === 0) return;
      ElMessageBox.confirm(
        t('messages.clearAllConfirmMsg') || 'Xóa toàn bộ các vùng chọn?',
        t('messages.clearAllConfirmTitle') || 'Xác nhận xóa',
        { confirmButtonText: 'Đồng ý', cancelButtonText: 'Hủy', type: 'warning' }
      ).then(() => {
        editorState.clearBoxes();
        selectedBoxId.value = null;
        selectedBoxIds.value = [];
        saveHistory();
        draw();
      }).catch(() => {});
    } else if (slicingMode.value === 'grid') {
      editorState.clearGrid();
      saveHistory();
      draw();
    }
  };

  // --- Auto-Detect Execution ---
  const reapplyAutoDetect = () => {
    const canvas = canvasRef.value;
    if (!canvas || !editorState.sourceImage) return;

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    tempCanvas.width = editorState.sourceImage.width;
    tempCanvas.height = editorState.sourceImage.height;
    tempCtx.drawImage(editorState.sourceImage, 0, 0);
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

    const detectorOptions = {
      borderTolerance: clusterTolerance.value,
      alphaThreshold: clusterAlpha.value,
    };

    if (autoDetectMode.value === 'padding') {
      editorState.autoDetect(imageData, autoDetectPadding.value, canvasPadding.value, false, detectorOptions);
    } else if (autoDetectMode.value === 'fixedSize') {
      const shouldSetFixedSize = editorState.selectionWidth == null || editorState.selectionHeight == null;
      editorState.autoDetect(imageData, 0, canvasPadding.value, shouldSetFixedSize, detectorOptions);
    }

    draw();
  };

  const handleAutoDetect = () => {
    reapplyAutoDetect();
    selectedBoxId.value = null;
    selectedBoxIds.value = [];
    saveHistory();
    ElMessage.success(`Đã tự động phát hiện ${editorState.boxes.length} asset!`);
  };

  watch(autoDetectPadding, () => {
    if (autoDetectMode.value === 'padding' && editorState.sourceImage) {
      reapplyAutoDetect();
    }
  });

  // --- Export Actions ---
  const handleExportRow = async (targetRowIndex?: number) => {
    try {
      if (!editorState.sourceImage) {
        throw new Error(t('errors.noSource') || 'Không có ảnh nguồn để xuất.');
      }

      const rows = availableRows.value;
      if (rows.length === 0) {
        ElMessage.warning(t('messages.noRowToExport') || 'Không tìm thấy hàng để xuất.');
        return;
      }

      const rIdx = targetRowIndex !== undefined ? targetRowIndex : exportSelectedRow.value;
      const rowItem = rows.find(r => r.index === rIdx) || rows[0];
      const selectedIndex = rowItem.index;

      let boxesToExport: Box[] = [];
      if (slicingMode.value === 'grid') {
        if (!editorState.gridArea) return;
        const { x, y, w, h } = editorState.gridArea;
        const cellWidth = w / editorState.gridCols;
        const cellHeight = h / editorState.gridRows;
        for (let c = 0; c < editorState.gridCols; c++) {
          boxesToExport.push({
            id: selectedIndex * editorState.gridCols + c,
            x: x + c * cellWidth,
            y: y + selectedIndex * cellHeight,
            w: cellWidth,
            h: cellHeight,
          });
        }
      } else {
        const found = customRows.value.find(r => r.rowIndex === selectedIndex);
        if (found) {
          boxesToExport = [...found.boxes];
        }
      }

      if (boxesToExport.length === 0) {
        ElMessage.warning(t('messages.noRowFrames') || 'Hàng này không có khung hình nào.');
        return;
      }

      let defaultName = rowItem.name || `row-${selectedIndex + 1}`;
      defaultName = defaultName.replace(/[^a-zA-Z0-9_\-]/g, '-').replace(/-+/g, '-').toLowerCase();
      if (!defaultName || defaultName === '-') {
        defaultName = `row-${selectedIndex + 1}`;
      }

      const promptTitle = t('messages.exportRowPromptTitle') || 'Xuất theo Hàng (Export Row)';
      const promptMsg = t('messages.exportRowPromptMsg', { row: selectedIndex + 1, count: boxesToExport.length })
        || `Nhập tên file để xuất Row ${selectedIndex + 1} (${boxesToExport.length} items):`;

      let fileName = defaultName;
      try {
        const { value } = await ElMessageBox.prompt(promptMsg, promptTitle, {
          confirmButtonText: t('common.download') || 'Tải về',
          cancelButtonText: t('common.cancel') || 'Hủy',
          inputValue: defaultName,
          inputPattern: /^[a-zA-Z0-9_\-\s]+$/,
          inputErrorMessage: t('messages.invalidFilename') || 'Tên file không được chứa ký tự đặc biệt',
        });
        if (value && value.trim()) {
          fileName = value.trim();
        }
      } catch {
        // User cancelled prompt
        return;
      }

      const ext = exportFormat.value === 'webp' ? 'webp' : 'png';
      const options: ExportOptions = {
        format: exportFormat.value,
        sizePreset: exportSizePreset.value,
        background: exportBackground.value,
        canvasPadding: canvasPadding.value,
      };

      const zip = new JSZip();
      for (let i = 0; i < boxesToExport.length; i++) {
        const itemBlob = await editorState.exportSingleBox(boxesToExport[i], options);
        zip.file(`${fileName}-${i + 1}.${ext}`, itemBlob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      ElMessage.success(
        t('messages.exportRowSuccess', { name: fileName, count: boxesToExport.length }) ||
        `Đã xuất ${fileName}.zip (${boxesToExport.length} items) thành công!`
      );
    } catch (error: any) {
      ElMessageBox.alert(error.message, t('messages.exportErrorTitle'), { type: 'error' });
    }
  };

  const handleExport = async () => {
    if (exportScope.value === 'row') {
      return handleExportRow(exportSelectedRow.value);
    }
    try {
      const options: ExportOptions = {
        format: exportFormat.value,
        sizePreset: exportSizePreset.value,
        background: exportBackground.value,
        canvasPadding: canvasPadding.value,
        enableRowGroups: editorState.enableRowGroups,
      };
      const zipBlob = await editorState.export(
        exportPrefix.value,
        exportConnector.value,
        slicingMode.value,
        options
      );
      const a = document.createElement('a');
      const url = URL.createObjectURL(zipBlob);
      a.href = url;
      a.download = `${exportPrefix.value}-assets.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      ElMessage.success(t('sidebar.exportSuccess') || 'Tải toàn bộ assets thành công!');
    } catch (error: any) {
      ElMessageBox.alert(error.message, t('messages.exportErrorTitle'), { type: 'error' });
    }
  };

  const downloadSingleBox = async (box: Box, index?: number, forceCombined: boolean = false) => {
    try {
      const idx = index !== undefined ? index : editorState.boxes.indexOf(box);
      const ext = exportFormat.value === 'webp' ? 'webp' : 'png';
      const options: ExportOptions = {
        format: exportFormat.value,
        sizePreset: exportSizePreset.value,
        background: exportBackground.value,
        canvasPadding: canvasPadding.value,
      };

      // Check if this box encloses multiple sub-items or if multiple boxes are selected
      let itemsToExport: Box[] = [];
      if (!forceCombined) {
        if (selectedBoxIds.value.length > 1) {
          itemsToExport = selectedBoxes.value;
        } else {
          const enclosed = getEnclosedBoxes(box);
          if (enclosed.length > 1) {
            itemsToExport = enclosed.sort((a, b) => a.x - b.x);
          }
        }
      }

      // Prepare naming prompt
      let fileName = (selectedBoxCustomName.value || '').trim();
      const promptTitle = itemsToExport.length > 1
        ? (t('messages.nameItemsPromptTitle') || 'Đặt tên cho các item tải về')
        : (t('messages.nameItemPromptTitle') || 'Đặt tên file tải về');
      const promptMsg = itemsToExport.length > 1
        ? (t('messages.nameItemsPromptMsg', { count: itemsToExport.length }) || `Phát hiện ${itemsToExport.length} item trong vùng chọn. Nhập tên tiền tố (prefix):`)
        : (t('messages.nameItemPromptMsg') || 'Nhập tên file tải về:');

      try {
        const { value } = await ElMessageBox.prompt(promptMsg, promptTitle, {
          confirmButtonText: t('common.download') || 'Tải về',
          cancelButtonText: t('common.cancel') || 'Hủy',
          inputValue: fileName || (itemsToExport.length > 1 ? 'row-1' : `asset-${idx + 1}`),
          inputPattern: /^[a-zA-Z0-9_\-\s]+$/,
          inputErrorMessage: t('messages.invalidFilename') || 'Tên file không được chứa ký tự đặc biệt',
        });
        if (value && value.trim()) {
          fileName = value.trim();
          selectedBoxCustomName.value = fileName;
        }
      } catch {
        // User cancelled prompt
        return;
      }

      if (itemsToExport.length > 1) {
        // Export multiple individual items as a ZIP archive
        const zip = new JSZip();
        for (let i = 0; i < itemsToExport.length; i++) {
          const itemBlob = await editorState.exportSingleBox(itemsToExport[i], options);
          zip.file(`${fileName}-${i + 1}.${ext}`, itemBlob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        ElMessage.success(t('messages.downloadSuccessMulti', { count: itemsToExport.length }) || `Đã tải về ${itemsToExport.length} item dạng ZIP thành công!`);
      } else {
        // Export single item
        const blob = await editorState.exportSingleBox(box, options);
        const ext = exportFormat.value === 'webp' ? 'webp' : 'png';
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `${fileName}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        ElMessage.success(t('messages.downloadSuccessSingle', { name: fileName }) || `Đã tải về ${fileName}.${ext} thành công!`);
      }
    } catch (error: any) {
      ElMessageBox.alert(error.message, t('messages.exportErrorTitle'), { type: 'error' });
    }
  };

  // --- Render Thumbnail Helper for Tray ---
  const renderThumbnail = (canvas: HTMLCanvasElement | null, box: Box) => {
    if (!canvas || !editorState.sourceImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const img = editorState.sourceImage;
    const maxSize = canvas.width;
    const aspectRatio = (box.w || 1) / (box.h || 1);

    let drawW = maxSize - 8;
    let drawH = drawW / aspectRatio;
    if (drawH > maxSize - 8) {
      drawH = maxSize - 8;
      drawW = drawH * aspectRatio;
    }

    const drawX = (maxSize - drawW) / 2;
    const drawY = (maxSize - drawH) / 2;

    const pad = canvasPadding.value;
    const sourceX = Math.max(0, box.x - pad);
    const sourceY = Math.max(0, box.y - pad);
    const sourceW = Math.min(img.width - sourceX, box.w);
    const sourceH = Math.min(img.height - sourceY, box.h);

    if (sourceW > 0 && sourceH > 0) {
      ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, drawX, drawY, drawW, drawH);
    }
  };

  // --- Sample Image Generator ---
  const loadSampleImage = async () => {
    const width = 800;
    const height = 540;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, width, height);

    const cols = [150, 400, 650];
    const rows = [140, 390];

    // 1. Diamond Gem
    ctx.save();
    ctx.translate(cols[0], rows[0]);
    ctx.beginPath();
    ctx.moveTo(0, -60);
    ctx.lineTo(55, -20);
    ctx.lineTo(35, 60);
    ctx.lineTo(-35, 60);
    ctx.lineTo(-55, -20);
    ctx.closePath();
    const grad1 = ctx.createLinearGradient(-40, -60, 40, 60);
    grad1.addColorStop(0, '#38bdf8');
    grad1.addColorStop(0.5, '#0284c7');
    grad1.addColorStop(1, '#0369a1');
    ctx.fillStyle = grad1;
    ctx.fill();
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -60);
    ctx.lineTo(0, 60);
    ctx.moveTo(-55, -20);
    ctx.lineTo(55, -20);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 2. Star
    ctx.save();
    ctx.translate(cols[1], rows[0]);
    ctx.beginPath();
    const spikes = 5;
    const outerR = 60;
    const innerR = 28;
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.moveTo(0, -outerR);
    for (let i = 0; i < spikes; i++) {
      let x = Math.cos(rot) * outerR;
      let y = Math.sin(rot) * outerR;
      ctx.lineTo(x, y);
      rot += step;
      x = Math.cos(rot) * innerR;
      y = Math.sin(rot) * innerR;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.closePath();
    const grad2 = ctx.createRadialGradient(0, -10, 5, 0, 0, 60);
    grad2.addColorStop(0, '#fef08a');
    grad2.addColorStop(0.6, '#eab308');
    grad2.addColorStop(1, '#ca8a04');
    ctx.fillStyle = grad2;
    ctx.fill();
    ctx.strokeStyle = '#fffbeb';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 3. Heart
    ctx.save();
    ctx.translate(cols[2], rows[0] - 10);
    ctx.beginPath();
    const d = 50;
    ctx.moveTo(0, 45);
    ctx.bezierCurveTo(-d, 0, -d, -45, 0, -25);
    ctx.bezierCurveTo(d, -45, d, 0, 0, 45);
    ctx.closePath();
    const grad3 = ctx.createLinearGradient(0, -40, 0, 45);
    grad3.addColorStop(0, '#f43f5e');
    grad3.addColorStop(1, '#be123c');
    ctx.fillStyle = grad3;
    ctx.fill();
    ctx.strokeStyle = '#ffe4e6';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 4. Gold Coin
    ctx.save();
    ctx.translate(cols[0], rows[1]);
    ctx.beginPath();
    ctx.arc(0, 0, 55, 0, Math.PI * 2);
    const grad4 = ctx.createLinearGradient(-40, -40, 40, 40);
    grad4.addColorStop(0, '#fbbf24');
    grad4.addColorStop(1, '#d97706');
    ctx.fillStyle = grad4;
    ctx.fill();
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = 'bold 36px Arial';
    ctx.fillStyle = '#78350f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 2);
    ctx.restore();

    // 5. Magic Potion
    ctx.save();
    ctx.translate(cols[1], rows[1]);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-12, -55, 24, 20);
    ctx.fillRect(-18, -60, 36, 8);
    ctx.beginPath();
    ctx.arc(0, 5, 48, 0, Math.PI * 2);
    const grad5 = ctx.createRadialGradient(-10, -5, 5, 0, 5, 48);
    grad5.addColorStop(0, '#c084fc');
    grad5.addColorStop(0.7, '#9333ea');
    grad5.addColorStop(1, '#581c87');
    ctx.fillStyle = grad5;
    ctx.fill();
    ctx.strokeStyle = '#f3e8ff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 6. Royal Shield
    ctx.save();
    ctx.translate(cols[2], rows[1]);
    ctx.beginPath();
    ctx.moveTo(0, -55);
    ctx.lineTo(48, -45);
    ctx.lineTo(42, 15);
    ctx.lineTo(0, 60);
    ctx.lineTo(-42, 15);
    ctx.lineTo(-48, -45);
    ctx.closePath();
    const grad6 = ctx.createLinearGradient(-40, -50, 40, 60);
    grad6.addColorStop(0, '#34d399');
    grad6.addColorStop(0.6, '#059669');
    grad6.addColorStop(1, '#064e3b');
    ctx.fillStyle = grad6;
    ctx.fill();
    ctx.strokeStyle = '#ecfdf5';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-6, -30, 12, 60);
    ctx.fillRect(-26, -15, 52, 12);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    const arr = dataUrl.split(',');
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const sampleFile = new File([u8arr], 'sample-ai-sprites.png', { type: 'image/png' });

    fileInfo.name = sampleFile.name;
    fileInfo.size = sampleFile.size;
    fileInfo.formattedSize = formatBytes(sampleFile.size);

    const img = await editorState.loadImage(sampleFile);
    fileInfo.width = img.width;
    fileInfo.height = img.height;
    setupCanvas(img);
    selectedBoxId.value = null;
    selectedBoxIds.value = [];
    panOffset.x = 0;
    panOffset.y = 0;

    await nextTick();
    fitToScreen();

    await nextTick();
    reapplyAutoDetect();
    saveHistory();
    ElMessage.success('Đã nạp ảnh mẫu và phát hiện 6 icon game!');
  };

  const onCanvasPlaceholderClick = () => fileInputRef.value?.click();
  const onFileSelected = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) handleFileChange({ raw: target.files[0] } as UploadFile);
  };
  const onDrop = (e: DragEvent) => {
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) handleFileChange({ raw: e.dataTransfer.files[0] } as UploadFile);
  };

  // --- Resize Listener for Fit Mode ---
  let resizeObserver: ResizeObserver | null = null;
  const handleResize = () => {
    if (isFitMode.value && editorState.sourceImage) {
      fitToScreen();
    }
  };

  // --- Animation Controls & Playback Loop ---
  const togglePlay = () => {
    isPlaying.value = !isPlaying.value;
  };

  const nextFrame = () => {
    isPlaying.value = false;
    const total = animationFrames.value.length;
    if (total > 0) {
      currentFrameIndex.value = (currentFrameIndex.value + 1) % total;
      draw();
    }
  };

  const prevFrame = () => {
    isPlaying.value = false;
    const total = animationFrames.value.length;
    if (total > 0) {
      currentFrameIndex.value = (currentFrameIndex.value - 1 + total) % total;
      draw();
    }
  };

  const resetAnimation = () => {
    currentFrameIndex.value = 0;
    draw();
  };

  const applyGamePresets = () => {
    editorState.applyGamePresets();
  };

  const downloadCurrentFrame = async () => {
    const frame = currentFrame.value;
    if (!frame) return;
    try {
      const box: Box = {
        id: Date.now(),
        x: frame.x,
        y: frame.y,
        w: frame.w,
        h: frame.h,
      };
      const blob = await editorState.exportSingleBox(box, {
        format: exportFormat.value,
        background: exportBackground.value,
        sizePreset: exportSizePreset.value,
        canvasPadding: canvasPadding.value,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = exportFormat.value === 'webp' ? 'webp' : 'png';
      const seqName = animationTargetRow.value === 'all'
        ? 'all'
        : (editorState.rowNames[animationTargetRow.value as number] || `row${(animationTargetRow.value as number) + 1}`);
      a.download = `${exportPrefix.value}-${seqName}-frame${currentFrameIndex.value + 1}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      ElMessage.error(err.message || 'Download failed');
    }
  };

  const renderAnimationFrame = () => {
    const canvas = animationCanvasRef.value;
    if (!canvas || !editorState.sourceImage) return;

    const container = canvas.parentElement;
    if (container && container.clientWidth > 0 && container.clientHeight > 0) {
      if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const frame = currentFrame.value;
    if (!frame || frame.w <= 0 || frame.h <= 0) return;

    ctx.imageSmoothingEnabled = false;

    const pad = 16;
    const availW = canvas.width - pad * 2;
    const availH = canvas.height - pad * 2;
    if (availW <= 0 || availH <= 0) return;

    const scale = Math.min(availW / frame.w, availH / frame.h);
    const drawW = Math.max(1, Math.round(frame.w * scale));
    const drawH = Math.max(1, Math.round(frame.h * scale));
    const drawX = Math.round((canvas.width - drawW) / 2);
    const drawY = Math.round((canvas.height - drawH) / 2);

    const padOffset = canvasPadding.value;
    const sx = frame.x - padOffset;
    const sy = frame.y - padOffset;

    ctx.drawImage(
      editorState.sourceImage,
      sx, sy, frame.w, frame.h,
      drawX, drawY, drawW, drawH
    );
  };

  const animationLoop = (timestamp: number) => {
    if (isPlaying.value && previewMode.value === 'animation') {
      const fps = Math.max(1, Math.min(30, animationFps.value));
      const interval = 1000 / fps;
      if (timestamp - lastFrameTimestamp >= interval) {
        lastFrameTimestamp = timestamp - ((timestamp - lastFrameTimestamp) % interval);
        const total = animationFrames.value.length;
        if (total > 0) {
          currentFrameIndex.value = (currentFrameIndex.value + 1) % total;
          draw();
        }
      }
    }
    renderAnimationFrame();
    animationReqId = requestAnimationFrame(animationLoop);
  };

  // --- Lifecycle Hooks ---
  onMounted(() => {
    const canvas = canvasRef.value;
    if (canvas) ctxRef.value = canvas.getContext('2d');
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('click', closeContextMenu);
    window.addEventListener('resize', handleResize);

    const viewportEl = (canvasRef.value?.closest('.canvas-viewport') || canvasRef.value?.parentElement?.parentElement || canvasRef.value?.parentElement || document.querySelector('.canvas-viewport')) as HTMLElement | null;
    if (viewportEl && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(viewportEl);
    }

    lastFrameTimestamp = performance.now();
    animationReqId = requestAnimationFrame(animationLoop);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('click', closeContextMenu);
    window.removeEventListener('resize', handleResize);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (animationReqId !== null) {
      cancelAnimationFrame(animationReqId);
      animationReqId = null;
    }
  });

  return {
    // Canvas & Element refs
    canvasRef,
    previewCanvasRef,
    animationCanvasRef,
    fileInputRef,
    dropdownRef,

    // Tools & Selection
    activeTool,
    selectedBoxId,
    selectedBoxIds,
    selectedBox,
    selectedBoxIndex,
    selectedBoxCustomName,
    enclosedBoxesCount,

    // UI & Pan/Zoom
    isFitMode,
    cursorStyle,
    slicingMode,
    detectionMode,
    canvasZoom,
    canvasPadding,
    panOffset,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToScreen,

    // Detection State
    autoDetectPadding,
    autoDetectMode,
    clusterTolerance,
    clusterAlpha,

    // Export Options
    exportFormat,
    exportSizePreset,
    exportBackground,
    exportPrefix,
    exportConnector,
    exportScope,
    exportSelectedRow,
    availableRows,
    fileNamePreview,

    // Animation Preview
    previewMode,
    animationTargetRow,
    animationFps,
    isPlaying,
    currentFrameIndex,
    animationFrames,
    currentFrame,
    customRows,
    selectedBoxes,
    leafBoxes,
    togglePlay,
    nextFrame,
    prevFrame,
    resetAnimation,
    applyGamePresets,
    downloadCurrentFrame,
    enableRowGroups: toRef(editorState, 'enableRowGroups'),
    rowNames: toRef(editorState, 'rowNames'),

    // File info & History
    fileInfo,
    canUndo,
    canRedo,
    undo,
    redo,
    resetAll,
    createNewSession,

    // Context menu
    isMenuVisible,
    menuTop,
    menuLeft,

    // Core state
    editorState,
    ...toRefs(editorState),

    // Actions
    handleFileChange,
    onCanvasPlaceholderClick,
    onFileSelected,
    onDrop,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
    onWheel,
    onRightClick,
    handleCommand,
    handleVisibleChange,
    handleClearAll,
    handleAutoDetect,
    handleExport,
    handleExportRow,
    downloadSingleBox,
    deleteSelectedBox,
    adjustBoxPadding,
    renderThumbnail,
    loadSampleImage,
    fitGridToImage: () => editorState.fitGridToImage(canvasPadding.value),
    clearGrid: editorState.clearGrid,
  };
}