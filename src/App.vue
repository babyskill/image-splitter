<template>
  <el-config-provider :locale="currentLocale">
    <div class="workbench-app" :class="{ 'is-dark': isDarkMode }">
      <!-- 1. TOPBAR HEADER -->
      <header class="workbench-header">
        <div class="header-left">
          <div class="brand-group">
            <div class="brand-icon">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="url(#brandGrad)" />
                <path d="M9 9H15V15H9V9Z" fill="white" fill-opacity="0.9" rx="2" />
                <path d="M17 9H23V15H17V9Z" fill="white" fill-opacity="0.9" rx="2" />
                <path d="M9 17H15V23H9V17Z" fill="white" fill-opacity="0.9" rx="2" />
                <path d="M17 17H23V23H17V17Z" fill="white" fill-opacity="0.4" rx="2" />
                <circle cx="20" cy="20" r="2.5" fill="#10b981" />
                <defs>
                  <linearGradient id="brandGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#6366f1" />
                    <stop offset="1" stop-color="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div class="brand-text">
              <span class="brand-title">{{ $t('header.title') }}</span>
              <span class="brand-version">v{{ version }}</span>
            </div>
          </div>

          <!-- New Session Button (Header Left) -->
          <el-tooltip :content="`${$t('header.newSession')} (Alt+N)`" placement="bottom">
            <button class="new-session-header-btn" @click="createNewSession()">
              <el-icon class="new-session-icon"><Plus /></el-icon>
              <span class="btn-text">{{ $t('header.newSession') }}</span>
            </button>
          </el-tooltip>

          <!-- File Info Badges (When image loaded) -->
          <div v-if="sourceImage" class="file-info-pills">
            <span class="file-pill file-name" :title="fileInfo.name">
              <el-icon><Picture /></el-icon>
              <span class="pill-text">{{ fileInfo.name }}</span>
            </span>
            <span class="file-pill file-dimensions">
              {{ fileInfo.width }} × {{ fileInfo.height }}px
            </span>
            <span v-if="fileInfo.formattedSize" class="file-pill file-size">
              {{ fileInfo.formattedSize }}
            </span>
            <span class="file-pill file-assets-count">
              {{ editorState.boxes.length }} {{ $t('header.assets') }}
            </span>
          </div>
        </div>

        <div class="header-right">
          <!-- Processed locally Emerald Badge -->
          <div class="shield-badge">
            <svg class="shield-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM14.707 7.707a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <span>{{ $t('header.badgeLocal') }}</span>
          </div>

          <div class="header-divider"></div>

          <!-- Undo / Redo / Reset Actions -->
          <div class="history-controls">
            <el-tooltip :content="`${$t('header.newSession')} (Alt+N)`" placement="bottom">
              <button class="icon-btn new-session-history-btn" @click="createNewSession()">
                <el-icon><Plus /></el-icon>
              </button>
            </el-tooltip>

            <el-tooltip :content="$t('header.undo')" placement="bottom">
              <button class="icon-btn" :disabled="!canUndo" @click="undo">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                  <path d="M3 10h10a5 5 0 0 1 5 5v2" />
                  <path d="M7 6L3 10l4 4" />
                </svg>
              </button>
            </el-tooltip>

            <el-tooltip :content="$t('header.redo')" placement="bottom">
              <button class="icon-btn" :disabled="!canRedo" @click="redo">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                  <path d="M21 10H11a5 5 0 0 0-5 5v2" />
                  <path d="M17 6l4 4-4 4" />
                </svg>
              </button>
            </el-tooltip>

            <el-tooltip :content="$t('header.reset')" placement="bottom">
              <button class="icon-btn" :disabled="!sourceImage" @click="resetAll">
                <el-icon><Refresh /></el-icon>
              </button>
            </el-tooltip>
          </div>

          <div class="header-divider"></div>

          <!-- Language Selector -->
          <el-dropdown @command="handleLanguageChange" trigger="click">
            <button class="icon-btn lang-btn">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" />
              </svg>
              <span class="current-lang-code">{{ currentLangLabel }}</span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="vi" :disabled="locale === 'vi'">Tiếng Việt (VI)</el-dropdown-item>
                <el-dropdown-item command="en" :disabled="locale === 'en'">English (EN)</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- Dark/Light Theme Toggle -->
          <el-switch
            v-model="isDarkMode"
            inline-prompt
            :active-icon="Moon"
            :inactive-icon="Sunny"
            style="--el-switch-on-color: #312e81; --el-switch-off-color: #e2e8f0;"
          />

          <!-- Help & About Dialogs -->
          <el-tooltip :content="$t('header.help')" placement="bottom">
            <button class="icon-btn" @click="helpDialogVisible = true">
              <el-icon><QuestionFilled /></el-icon>
            </button>
          </el-tooltip>

          <el-tooltip :content="$t('header.about')" placement="bottom">
            <button class="icon-btn" @click="aboutDialogVisible = true">
              <el-icon><InfoFilled /></el-icon>
            </button>
          </el-tooltip>
        </div>
      </header>

      <!-- 2. MAIN WORKBENCH BODY (Ribbon + Canvas + Inspector) -->
      <div class="workbench-body">
        <!-- LEFT VERTICAL TOOL RIBBON -->
        <aside class="tool-ribbon">
          <div class="ribbon-tools-group">
            <el-tooltip :content="`${$t('header.newSession')} (Alt+N)`" placement="right">
              <button
                class="ribbon-btn ribbon-btn-new"
                @click="createNewSession()"
              >
                <el-icon :size="18"><Plus /></el-icon>
                <span class="ribbon-key">Alt+N</span>
              </button>
            </el-tooltip>

            <div class="ribbon-separator"></div>

            <el-tooltip :content="$t('tools.select')" placement="right">
              <button
                class="ribbon-btn"
                :class="{ active: activeTool === 'select' }"
                @click="activeTool = 'select'"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M4 3l12 12-5.5.5 3.5 7-2.5 1-3.5-7L4 20V3z" />
                </svg>
                <span class="ribbon-key">V</span>
              </button>
            </el-tooltip>

            <el-tooltip :content="$t('tools.multiselect')" placement="right">
              <button
                class="ribbon-btn"
                :class="{ active: activeTool === 'multiselect' }"
                @click="activeTool = 'multiselect'"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="11" height="11" rx="2" stroke-dasharray="2 2" />
                  <rect x="9" y="9" width="12" height="12" rx="2" />
                </svg>
                <span class="ribbon-key">M</span>
              </button>
            </el-tooltip>

            <el-tooltip :content="$t('tools.draw')" placement="right">
              <button
                class="ribbon-btn"
                :class="{ active: activeTool === 'draw' }"
                @click="activeTool = 'draw'"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <span class="ribbon-key">B</span>
              </button>
            </el-tooltip>

            <el-tooltip :content="$t('tools.hand')" placement="right">
              <button
                class="ribbon-btn"
                :class="{ active: activeTool === 'hand' }"
                @click="activeTool = 'hand'"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v7M10 10.5V6a2 2 0 0 0-4 0v8M6 14a6 6 0 0 0 12 0v-3a2 2 0 0 0-4 0" />
                </svg>
                <span class="ribbon-key">H</span>
              </button>
            </el-tooltip>

            <div class="ribbon-separator"></div>

            <el-tooltip :content="$t('tools.delete')" placement="right">
              <button
                class="ribbon-btn ribbon-btn-danger"
                :class="{ active: activeTool === 'delete' }"
                :disabled="!selectedBox"
                @click="deleteSelectedBox"
              >
                <el-icon :size="18"><Delete /></el-icon>
                <span class="ribbon-key">Del</span>
              </button>
            </el-tooltip>

            <el-tooltip :content="$t('tools.clearAll')" placement="right">
              <button
                class="ribbon-btn ribbon-btn-danger"
                :disabled="editorState.boxes.length === 0 && !editorState.gridArea"
                @click="handleClearAll"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="9" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              </button>
            </el-tooltip>
          </div>
        </aside>

        <!-- CENTER CANVAS VIEWPORT -->
        <main class="canvas-viewport" ref="viewportRef">
          <!-- FLOATING ZOOM WIDGET (Top-Right) -->
          <div v-if="sourceImage" class="floating-zoom-widget">
            <button class="zoom-btn" :title="$t('viewport.zoomOut')" @click="zoomOut">
              <el-icon><ZoomOut /></el-icon>
            </button>
            <span class="zoom-level">{{ canvasZoom }}%</span>
            <button class="zoom-btn" :title="$t('viewport.zoomIn')" @click="zoomIn">
              <el-icon><ZoomIn /></el-icon>
            </button>
            <div class="zoom-divider"></div>
            <button
              class="zoom-btn text-btn"
              :class="{ 'is-active': isFitMode }"
              :title="$t('viewport.fitScreen')"
              @click="fitToScreen()"
            >
              {{ $t('viewport.fitScreen') }}
            </button>
            <button class="zoom-btn text-btn" :title="$t('viewport.resetZoom')" @click="resetZoom">
              1:1
            </button>
          </div>

          <!-- CANVAS STAGE (When image is loaded) -->
          <div
            v-if="sourceImage"
            class="canvas-stage"
            :style="{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              cursor: cursorStyle,
            }"
            @mousedown="onMouseDown"
            @mousemove="onMouseMove"
            @mouseup="onMouseUp"
            @mouseleave="onMouseLeave"
            @wheel="onWheel"
            @contextmenu.prevent="onRightClick"
          >
            <canvas ref="canvasRef" class="editor-canvas checkerboard-bg"></canvas>
          </div>

          <!-- Context Menu Dropdown for Box -->
          <div
            v-if="isMenuVisible"
            :style="{ top: menuTop + 'px', left: menuLeft + 'px', position: 'fixed', zIndex: 9999 }"
          >
            <el-dropdown ref="dropdownRef" @command="handleCommand" @visible-change="handleVisibleChange">
              <span class="el-dropdown-link"></span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :command="'sendToBack'">{{ $t('contextMenu.sendToBack') }}</el-dropdown-item>
                  <el-dropdown-item :command="'deleteBox'" divided class="context-menu-item-danger">
                    {{ $t('contextMenu.deleteBox') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <!-- 6. EMPTY STATE / DROPZONE (When no image is loaded) -->
          <div v-if="!sourceImage" class="empty-dropzone-container">
            <el-upload
              class="workbench-dropzone"
              drag
              action="#"
              :show-file-list="false"
              :auto-upload="false"
              @change="handleFileChange"
              @drop.prevent="onDrop"
              @dragover.prevent
            >
              <div class="dropzone-inner">
                <div class="dropzone-icon-glow">
                  <div class="icon-circle">
                    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                </div>
                <h2 class="dropzone-title">{{ $t('dropzone.title') }}</h2>
                <p class="dropzone-subtitle">{{ $t('dropzone.subtitle') }}</p>

                <div class="dropzone-actions" @click.stop>
                  <button type="button" class="sample-image-btn" @click="loadSampleImage">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span>{{ $t('dropzone.sampleBtn') }}</span>
                  </button>
                </div>

                <div class="dropzone-security">
                  <svg class="security-shield" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM14.707 7.707a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                  <span>{{ $t('dropzone.security') }}</span>
                </div>
              </div>
            </el-upload>
          </div>
        </main>

        <!-- 4. RIGHT INSPECTOR PANEL (3 Tabs: Region, Detect, Export) -->
        <aside class="inspector-panel">
          <div v-if="sourceImage" class="inspector-top-bar">
            <span class="inspector-top-hint">{{ $t('inspector.tabs.region') }}</span>
            <button class="inspector-new-btn" @click="createNewSession()" :title="`${$t('header.newSession')} (Alt+N)`">
              <el-icon><Plus /></el-icon>
              <span>{{ $t('header.newSession') }}</span>
            </button>
          </div>
          <el-tabs v-model="inspectorTab" class="inspector-tabs">
            <!-- TAB 1: REGION -->
            <el-tab-pane name="region">
              <template #label>
                <span class="tab-label">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>{{ $t('inspector.tabs.region') }}</span>
                </span>
              </template>

              <div class="tab-content">
                <div v-if="selectedBox" class="region-card">
                  <div class="region-header">
                    <span class="region-badge">Asset #{{ selectedBoxIndex + 1 }}</span>
                    <span class="region-aspect-ratio">
                      {{ (selectedBox.w / (selectedBox.h || 1)).toFixed(2) }}:1
                    </span>
                  </div>

                  <div class="coords-grid">
                    <div class="coord-field">
                      <label>X</label>
                      <el-input-number v-model="selectedBox.x" size="small" :min="0" :controls="false" />
                    </div>
                    <div class="coord-field">
                      <label>Y</label>
                      <el-input-number v-model="selectedBox.y" size="small" :min="0" :controls="false" />
                    </div>
                    <div class="coord-field">
                      <label>W</label>
                      <el-input-number v-model="selectedBox.w" size="small" :min="1" :controls="false" />
                    </div>
                    <div class="coord-field">
                      <label>H</label>
                      <el-input-number v-model="selectedBox.h" size="small" :min="1" :controls="false" />
                    </div>
                  </div>

                  <div class="section-title">{{ $t('inspector.region.padding') }}</div>
                  <div class="padding-actions">
                    <button class="pill-action-btn" @click="adjustBoxPadding(2)">
                      {{ $t('inspector.region.expand2') }}
                    </button>
                    <button class="pill-action-btn" @click="adjustBoxPadding(5)">
                      {{ $t('inspector.region.expand5') }}
                    </button>
                    <button class="pill-action-btn" @click="adjustBoxPadding(-2)">
                      {{ $t('inspector.region.shrink2') }}
                    </button>
                  </div>

                  <!-- Live Preview Canvas of Selected Box -->
                  <div class="preview-card-wrap">
                    <div class="preview-box checkerboard-bg">
                      <canvas ref="previewCanvasRef"></canvas>
                    </div>
                  </div>

                  <!-- Custom Asset Name Field -->
                  <div class="inspector-form-item" style="margin-top: 12px; margin-bottom: 8px;">
                    <label class="form-label">{{ $t('inspector.region.assetName') }}</label>
                    <el-input
                      v-model="selectedBoxCustomName"
                      size="small"
                      :placeholder="$t('inspector.region.namePlaceholder')"
                      clearable
                    />
                  </div>

                  <!-- Badge if selection encloses multiple sub-items -->
                  <div v-if="enclosedBoxesCount > 1" class="sub-items-info-badge" style="margin-bottom: 10px; padding: 6px 10px; background: rgba(99, 102, 241, 0.08); border: 1px dashed rgba(99, 102, 241, 0.3); border-radius: 6px; font-size: 12px; color: #4338ca; display: flex; align-items: center; gap: 6px;">
                    <el-icon><InfoFilled /></el-icon>
                    <span>{{ $t('inspector.region.containsSubItems', { count: enclosedBoxesCount }) }}</span>
                  </div>

                  <div class="region-footer-actions">
                    <template v-if="enclosedBoxesCount > 1">
                      <el-button
                        type="primary"
                        class="download-single-btn"
                        @click="downloadSingleBox(selectedBox, selectedBoxIndex, false)"
                      >
                        <el-icon><Download /></el-icon>
                        {{ $t('inspector.region.downloadItemsZip', { count: enclosedBoxesCount }) }}
                      </el-button>
                      <el-button
                        link
                        type="info"
                        size="small"
                        style="width: 100%; margin-left: 0; margin-top: 4px; font-size: 11px;"
                        @click="downloadSingleBox(selectedBox, selectedBoxIndex, true)"
                      >
                        {{ $t('inspector.region.downloadCombined') }}
                      </el-button>
                    </template>
                    <template v-else>
                      <el-button
                        type="primary"
                        class="download-single-btn"
                        @click="downloadSingleBox(selectedBox, selectedBoxIndex)"
                      >
                        <el-icon><Download /></el-icon>
                        {{ $t('inspector.region.downloadSingle') }}
                      </el-button>
                    </template>

                    <el-button
                      type="danger"
                      plain
                      class="delete-box-btn"
                      @click="deleteSelectedBox"
                    >
                      <el-icon><Delete /></el-icon>
                      {{ $t('inspector.region.deleteBox') }}
                    </el-button>
                  </div>
                </div>

                <div v-else class="empty-selection-placeholder">
                  <div class="placeholder-icon">
                    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="3 3" />
                      <path d="M12 9v6M9 12h6" />
                    </svg>
                  </div>
                  <h3>{{ $t('inspector.region.noSelection') }}</h3>
                  <p>{{ $t('inspector.region.noSelectionTip') }}</p>
                </div>
              </div>
            </el-tab-pane>

            <!-- TAB 2: DETECT -->
            <el-tab-pane name="detect">
              <template #label>
                <span class="tab-label">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                  <span>{{ $t('inspector.tabs.detect') }}</span>
                </span>
              </template>

              <div class="tab-content">
                <div class="inspector-form-item">
                  <label class="form-label">{{ $t('inspector.detect.mode') }}</label>
                  <el-radio-group v-model="slicingMode" size="small" class="mode-segmented-group">
                    <el-radio-button label="custom">{{ $t('inspector.detect.cluster') }}</el-radio-button>
                    <el-radio-button label="grid">{{ $t('inspector.detect.grid') }}</el-radio-button>
                  </el-radio-group>
                </div>

                <!-- Cluster Mode Controls -->
                <div v-if="slicingMode === 'custom'" class="cluster-controls">
                  <div class="inspector-form-item">
                    <label class="form-label">
                      <span>{{ $t('inspector.detect.tolerance') }}</span>
                      <span class="param-val">{{ clusterTolerance }}</span>
                    </label>
                    <el-slider v-model="clusterTolerance" :min="5" :max="120" size="small" />
                  </div>

                  <div class="inspector-form-item">
                    <label class="form-label">
                      <span>{{ $t('inspector.detect.boxPadding') }}</span>
                      <span class="param-val">{{ autoDetectPadding }}px</span>
                    </label>
                    <el-slider v-model="autoDetectPadding" :min="0" :max="30" size="small" />
                  </div>

                  <div class="inspector-form-item">
                    <label class="form-label">{{ $t('inspector.detect.fixedSize') }}</label>
                    <el-radio-group v-model="autoDetectMode" size="small" class="mode-segmented-group">
                      <el-radio-button label="padding">{{ $t('sidebar.recognitionModes.padding') }}</el-radio-button>
                      <el-radio-button label="fixedSize">{{ $t('sidebar.recognitionModes.fixedSize') }}</el-radio-button>
                    </el-radio-group>
                  </div>

                  <div v-if="autoDetectMode === 'fixedSize'" class="coords-grid">
                    <div class="coord-field">
                      <label>{{ $t('inspector.detect.width') }}</label>
                      <el-input-number v-model="editorState.selectionWidth" :min="1" :max="2000" size="small" :controls="false" />
                    </div>
                    <div class="coord-field">
                      <label>{{ $t('inspector.detect.height') }}</label>
                      <el-input-number v-model="editorState.selectionHeight" :min="1" :max="2000" size="small" :controls="false" />
                    </div>
                  </div>

                  <el-button
                    type="primary"
                    class="detect-btn-large"
                    :disabled="!sourceImage"
                    @click="handleAutoDetect"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    {{ $t('inspector.detect.redetect') }}
                  </el-button>
                </div>

                <!-- Grid Mode Controls -->
                <div v-if="slicingMode === 'grid'" class="grid-controls">
                  <div class="coords-grid">
                    <div class="coord-field">
                      <label>{{ $t('inspector.detect.rows') }}</label>
                      <el-input-number v-model="editorState.gridRows" :min="1" :max="100" size="small" />
                    </div>
                    <div class="coord-field">
                      <label>{{ $t('inspector.detect.cols') }}</label>
                      <el-input-number v-model="editorState.gridCols" :min="1" :max="100" size="small" />
                    </div>
                  </div>

                  <div class="grid-action-buttons">
                    <el-button type="primary" style="width: 100%;" @click="fitGridToImage">
                      {{ $t('inspector.detect.generateGrid') }}
                    </el-button>
                    <el-button type="danger" plain style="width: 100%; margin-left: 0; margin-top: 8px;" @click="clearGrid">
                      {{ $t('inspector.detect.clearGrid') }}
                    </el-button>
                  </div>

                  <!-- Row Grouping Section -->
                  <div class="row-groups-section">
                    <div class="row-groups-header">
                      <div class="switch-label-group">
                        <label class="form-label" style="margin-bottom: 0;">{{ $t('groupByRows') }}</label>
                        <el-tooltip :content="$t('rowGroupsTooltip')" placement="top">
                          <el-icon class="info-icon"><InfoFilled /></el-icon>
                        </el-tooltip>
                      </div>
                      <el-switch v-model="editorState.enableRowGroups" size="small" />
                    </div>

                    <transition name="el-zoom-in-top">
                      <div v-if="editorState.enableRowGroups" class="row-names-container">
                        <div class="row-names-header">
                          <span class="sub-label">{{ $t('rowNames') }}</span>
                          <el-button
                            link
                            type="primary"
                            size="small"
                            class="presets-btn"
                            @click="applyGamePresets"
                          >
                            ⚡ {{ $t('applyGamePresets') }}
                          </el-button>
                        </div>

                        <div class="row-inputs-list">
                          <div
                            v-for="(name, idx) in editorState.rowNames"
                            :key="idx"
                            class="row-input-item"
                          >
                            <span class="row-idx-badge">R{{ idx + 1 }}</span>
                            <el-input
                              v-model="editorState.rowNames[idx]"
                              size="small"
                              :placeholder="$t('rowPlaceholder')"
                            />
                          </div>
                        </div>
                      </div>
                    </transition>
                  </div>
                </div>
              </div>
            </el-tab-pane>

            <!-- TAB: ANIMATION -->
            <el-tab-pane name="animation">
              <template #label>
                <span class="tab-label">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>{{ $t('inspector.tabs.animation') }}</span>
                </span>
              </template>

              <div class="tab-content animation-tab-content">
                <!-- Mode toggle: Loop vs Static -->
                <div class="inspector-form-item">
                  <label class="form-label">{{ $t('animation.previewModes') }}</label>
                  <el-radio-group v-model="previewMode" size="small" class="mode-segmented-group">
                    <el-radio-button label="animation">🎞️ {{ $t('animation.loop') }}</el-radio-button>
                    <el-radio-button label="static">🖼️ {{ $t('animation.static') }}</el-radio-button>
                  </el-radio-group>
                </div>

                <!-- Sequence selector dropdown -->
                <div class="inspector-form-item">
                  <label class="form-label">{{ $t('animation.targetSequence') }}</label>
                  <el-select v-model="animationTargetRow" size="small" style="width: 100%">
                    <template v-if="slicingMode === 'grid'">
                      <el-option
                        v-for="(name, idx) in editorState.rowNames"
                        :key="idx"
                        :label="`Row ${idx + 1}: ${name || 'unnamed'}`"
                        :value="idx"
                      />
                      <el-option :label="`🌐 ${$t('animation.allFrames')}`" value="all" />
                    </template>
                    <template v-else>
                      <el-option
                        v-if="selectedBoxes.length > 0"
                        :label="`🎯 ${$t('animation.selectedBoxes')} (${selectedBoxes.length} frames)`"
                        value="selected"
                      />
                      <el-option
                        v-for="row in customRows"
                        :key="row.rowIndex"
                        :label="row.name"
                        :value="row.rowIndex"
                      />
                      <el-option
                        :label="`🌐 ${$t('animation.allFrames')} (${leafBoxes.length} frames)`"
                        value="all"
                      />
                    </template>
                  </el-select>
                </div>

                <!-- Animation Player Card -->
                <div class="animation-player-card">
                  <div class="animation-stage checkerboard-bg">
                    <canvas ref="animationCanvasRef" class="animation-preview-canvas"></canvas>

                    <div v-if="animationFrames.length === 0" class="no-frames-overlay">
                      <span>{{ $t('animation.noFrames') }}</span>
                    </div>

                    <!-- Frame counter badge -->
                    <div v-if="animationFrames.length > 0" class="frame-counter-badge">
                      {{ $t('animation.frameCounter', { current: currentFrameIndex + 1, total: animationFrames.length }) }}
                    </div>
                  </div>

                  <!-- Playback Controls -->
                  <div class="playback-controls-bar">
                    <el-button-group size="small">
                      <el-button @click="prevFrame" :disabled="animationFrames.length <= 1" :title="$t('animation.prev')">
                        ⏮️
                      </el-button>
                      <el-button
                        type="primary"
                        @click="togglePlay"
                        :disabled="animationFrames.length <= 1 || previewMode === 'static'"
                      >
                        {{ isPlaying && previewMode === 'animation' ? '⏸️ ' + $t('animation.pause') : '▶️ ' + $t('animation.play') }}
                      </el-button>
                      <el-button @click="nextFrame" :disabled="animationFrames.length <= 1" :title="$t('animation.next')">
                        ⏭️
                      </el-button>
                    </el-button-group>
                  </div>
                </div>

                <!-- Speed Slider (FPS) -->
                <div v-if="previewMode === 'animation'" class="inspector-form-item" style="margin-top: 14px;">
                  <label class="form-label">
                    <span>{{ $t('animation.fps') }}</span>
                    <span class="param-val">{{ animationFps }} FPS ({{ Math.round(1000 / animationFps) }}ms)</span>
                  </label>
                  <el-slider v-model="animationFps" :min="1" :max="30" :step="1" size="small" />
                </div>

                <!-- Static Frame Details & Download -->
                <div v-if="previewMode === 'static'" class="static-inspection-card">
                  <div class="static-info-row" v-if="currentFrame">
                    <span class="info-label">{{ $t('animation.staticDimensions') }}</span>
                    <span class="info-val">{{ Math.round(currentFrame.w) }} × {{ Math.round(currentFrame.h) }} px</span>
                  </div>
                  <el-button
                    type="primary"
                    size="small"
                    class="download-frame-btn"
                    :disabled="!currentFrame"
                    @click="downloadCurrentFrame"
                  >
                    <el-icon><Download /></el-icon>
                    {{ $t('animation.downloadFrame') }}
                  </el-button>
                </div>
              </div>
            </el-tab-pane>

            <!-- TAB 3: EXPORT -->
            <el-tab-pane name="export">
              <template #label>
                <span class="tab-label">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>{{ $t('inspector.tabs.export') }}</span>
                </span>
              </template>

              <div class="tab-content">
                <div class="inspector-form-item">
                  <label class="form-label">{{ $t('inspector.export.format') }}</label>
                  <el-radio-group v-model="exportFormat" size="small" class="mode-segmented-group">
                    <el-radio-button label="png">PNG (Lossless)</el-radio-button>
                    <el-radio-button label="webp">WebP</el-radio-button>
                  </el-radio-group>
                </div>

                <div class="inspector-form-item">
                  <label class="form-label">{{ $t('inspector.export.sizePreset') }}</label>
                  <el-select v-model="exportSizePreset" size="small" style="width: 100%">
                    <el-option label="Game sprite crop (Original)" value="original" />
                    <el-option label="Sticker 512px max" value="sticker512" />
                    <el-option label="Icon 256px max" value="icon256" />
                  </el-select>
                </div>

                <div class="inspector-form-item">
                  <label class="form-label">{{ $t('inspector.export.background') }}</label>
                  <el-radio-group v-model="exportBackground" size="small" class="mode-segmented-group">
                    <el-radio-button label="transparent">{{ $t('inspector.export.bgTransparent') }}</el-radio-button>
                    <el-radio-button label="white">{{ $t('inspector.export.bgWhite') }}</el-radio-button>
                  </el-radio-group>
                </div>

                <div class="coords-grid">
                  <div class="coord-field" style="grid-column: span 2;">
                    <label>{{ $t('inspector.export.prefix') }}</label>
                    <el-input v-model="exportPrefix" size="small" />
                  </div>
                  <div class="coord-field">
                    <label>{{ $t('inspector.export.connector') }}</label>
                    <el-input v-model="exportConnector" size="small" />
                  </div>
                </div>

                <div class="filename-preview-text">
                  <span class="preview-label">{{ $t('inspector.export.preview') }}</span>
                  <code class="preview-code">{{ fileNamePreview }}</code>
                </div>

                <button class="gradient-download-btn full-width" :disabled="!sourceImage" @click="handleExport">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>{{ $t('inspector.export.exportBtn') }}</span>
                </button>
              </div>
            </el-tab-pane>
          </el-tabs>
        </aside>
      </div>

      <!-- 5. BOTTOM ASSET TRAY -->
      <footer v-if="sourceImage" class="workbench-asset-tray">
        <div class="tray-header">
          <div class="tray-title-group">
            <span class="tray-title">{{ $t('tray.title', { count: editorState.boxes.length }) }}</span>
            <span class="tray-subtitle">{{ $t('tray.subtitle') }}</span>
          </div>

          <button class="gradient-download-btn" @click="handleExport">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{{ $t('tray.downloadZip') }}</span>
          </button>
        </div>

        <div class="tray-thumbnails-scroll">
          <div
            v-for="(box, idx) in editorState.boxes"
            :key="box.id"
            class="tray-thumb-card"
            :class="{ active: box.id === selectedBoxId }"
            @click="selectBoxFromTray(box.id)"
            @dblclick="downloadSingleBox(box, idx)"
            :title="`Double-click to download asset #${idx + 1}`"
          >
            <div class="thumb-canvas-wrap checkerboard-bg">
              <canvas
                :ref="(el) => renderThumbnail(el as HTMLCanvasElement, box)"
                width="64"
                height="64"
                class="tray-thumb-canvas"
              ></canvas>
              <!-- Emerald Tick Badge -->
              <span class="thumb-check-badge">
                <svg viewBox="0 0 20 20" fill="currentColor" width="10" height="10">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </span>
            </div>
            <span class="thumb-name">asset-{{ idx + 1 }}.{{ exportFormat }}</span>
          </div>

          <div v-if="editorState.boxes.length === 0" class="tray-empty-text">
            {{ $t('tray.empty') }}
          </div>
        </div>
      </footer>

      <!-- Help Dialog -->
      <el-dialog v-model="helpDialogVisible" :title="$t('helpDialog.title')" width="600px">
        <div class="help-dialog-content">
          <ul>
            <li v-for="(feature, index) in helpFeatures" :key="index">
              <span v-html="feature.title"></span>
              <ul v-if="feature.items">
                <li v-for="(item, itemIndex) in feature.items" :key="itemIndex" v-html="item"></li>
              </ul>
            </li>
          </ul>
        </div>
      </el-dialog>

      <!-- About Dialog -->
      <el-dialog v-model="aboutDialogVisible" :title="$t('aboutDialog.title')" width="420px">
        <div class="about-dialog-content">
          <p class="about-desc">{{ $t('aboutDialog.description') }}</p>
          <p>{{ $t('aboutDialog.purpose') }}</p>
          <el-divider />
          <p class="about-motto">{{ $t('aboutDialog.motto') }}</p>
        </div>
      </el-dialog>
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElNotification, ElMessageBox } from 'element-plus';
import {
  Picture,
  Refresh,
  Delete,
  Sunny,
  Moon,
  QuestionFilled,
  InfoFilled,
  Download,
  ZoomIn,
  ZoomOut,
  Plus,
} from '@element-plus/icons-vue';
import enLocale from 'element-plus/dist/locale/en.mjs';
import viLocale from 'element-plus/dist/locale/vi.mjs';
import pkg from '../package.json';
import { useImageEditor } from './composables/useImageEditor';
import { useTheme } from './composables/useTheme';

const { t, locale, tm } = useI18n();

const version = pkg.version;
const { isDarkMode } = useTheme();

const helpDialogVisible = ref(false);
const aboutDialogVisible = ref(false);
const inspectorTab = ref('region');

const helpFeatures = computed(() => tm('helpDialog.content.featuresList') as Array<{ title: string; items?: string[] }>);

const currentLocale = computed(() => {
  if (locale.value === 'vi') return viLocale;
  return enLocale;
});

const currentLangLabel = computed(() => {
  if (locale.value === 'vi') return 'VI';
  return 'EN';
});

const handleLanguageChange = (lang: string) => {
  if (lang) {
    locale.value = lang;
    localStorage.setItem('lang', lang);
    window.ipcApi?.sendLanguageChange(lang);
  }
};

const {
  canvasRef,
  previewCanvasRef,
  animationCanvasRef,
  sourceImage,
  cursorStyle,
  slicingMode,
  canvasZoom,
  panOffset,
  isFitMode,
  activeTool,
  selectedBoxId,
  selectedBox,
  selectedBoxIndex,
  selectedBoxCustomName,
  enclosedBoxesCount,
  clusterTolerance,
  autoDetectPadding,
  autoDetectMode,
  exportFormat,
  exportSizePreset,
  exportBackground,
  exportPrefix,
  exportConnector,
  fileNamePreview,
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
  enableRowGroups,
  rowNames,
  fileInfo,
  canUndo,
  canRedo,
  undo,
  redo,
  resetAll,
  createNewSession,
  zoomIn,
  zoomOut,
  resetZoom,
  fitToScreen,
  isMenuVisible,
  menuTop,
  menuLeft,
  dropdownRef,
  handleFileChange,
  onDrop,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onWheel,
  onRightClick,
  handleCommand,
  handleVisibleChange,
  fitGridToImage,
  clearGrid,
  handleAutoDetect,
  handleClearAll,
  handleExport,
  downloadSingleBox,
  deleteSelectedBox,
  adjustBoxPadding,
  renderThumbnail,
  loadSampleImage,
  editorState,
} = useImageEditor(t);

const selectBoxFromTray = (boxId: number) => {
  selectedBoxId.value = boxId;
  inspectorTab.value = 'region';
};

onMounted(() => {
  window.ipcApi?.onUpdateNotAvailable(() => {
    ElNotification({
      title: t('updater.checkUpdate'),
      message: t('updater.updateNotAvailable'),
      type: 'info',
    });
  });

  window.ipcApi?.onUpdateDownloaded(() => {
    ElMessageBox.confirm(
      t('updater.downloadedMsg'),
      t('updater.downloadedTitle'),
      {
        confirmButtonText: t('updater.updateNow'),
        cancelButtonText: t('updater.later'),
        type: 'success',
      }
    ).then(() => {});
  });

  window.ipcApi?.onUpdateError(() => {
    ElNotification({
      title: t('updater.errorTitle'),
      message: t('updater.errorMsg'),
      type: 'error',
    });
  });

  window.ipcApi?.onShowHelpDialog(() => {
    helpDialogVisible.value = true;
  });

  window.ipcApi?.onShowAboutDialog(() => {
    aboutDialogVisible.value = true;
  });

  window.ipcApi?.onSetLanguage((lang) => {
    handleLanguageChange(lang);
  });

  window.ipcApi?.sendLanguageChange(locale.value);
});
</script>

<style>
/* Reset & Base Layout */
html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.workbench-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background-color: #f8fafc;
  color: #0f172a;
  transition: background-color 0.2s, color 0.2s;
  overflow: hidden;
}

.workbench-app.is-dark {
  background-color: #0b0f17;
  color: #f1f5f9;
}

/* 1. TOPBAR HEADER */
.workbench-header {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background-color: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  z-index: 50;
  flex-shrink: 0;
}

.is-dark .workbench-header {
  background-color: #0f172a;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.brand-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-text {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.brand-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.is-dark .brand-title {
  background: linear-gradient(135deg, #818cf8 0%, #c084fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-version {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

/* New Session Button in Header */
.new-session-header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #4f46e5;
  background-color: #f5f3ff;
  border: 1px solid #ddd6fe;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.new-session-header-btn:hover {
  background-color: #ede9fe;
  border-color: #c4b5fd;
  color: #4338ca;
  box-shadow: 0 2px 6px -1px rgba(99, 102, 241, 0.2);
  transform: translateY(-1px);
}

.new-session-header-btn:active {
  transform: translateY(0);
}

.new-session-icon {
  font-size: 14px;
}

.is-dark .new-session-header-btn {
  background-color: rgba(99, 102, 241, 0.15);
  border-color: rgba(139, 92, 246, 0.35);
  color: #c4b5fd;
}

.is-dark .new-session-header-btn:hover {
  background-color: rgba(99, 102, 241, 0.25);
  border-color: rgba(139, 92, 246, 0.55);
  color: #ede9fe;
  box-shadow: 0 2px 8px -1px rgba(99, 102, 241, 0.4);
}

/* File Info Pills */
.file-info-pills {
  display: flex;
  align-items: center;
  gap: 6px;
}

.file-pill {
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 9999px;
  background-color: #f1f5f9;
  color: #475569;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #e2e8f0;
  white-space: nowrap;
}

.is-dark .file-pill {
  background-color: rgba(255, 255, 255, 0.05);
  color: #cbd5e1;
  border-color: rgba(255, 255, 255, 0.08);
}

.file-pill.file-name {
  max-width: 180px;
}

.file-pill.file-name .pill-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-pill.file-assets-count {
  background-color: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  border-color: rgba(99, 102, 241, 0.2);
  font-weight: 600;
}

.is-dark .file-pill.file-assets-count {
  background-color: rgba(129, 140, 248, 0.15);
  color: #a5b4fc;
  border-color: rgba(129, 140, 248, 0.3);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Emerald Shield Badge */
.shield-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  color: #065f46;
  background-color: #ecfdf5;
  border: 1px solid #a7f3d0;
}

.is-dark .shield-badge {
  color: #34d399;
  background-color: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.28);
}

.shield-icon {
  width: 14px;
  height: 14px;
  color: #10b981;
}

.header-divider {
  width: 1px;
  height: 20px;
  background-color: #e2e8f0;
}

.is-dark .header-divider {
  background-color: rgba(255, 255, 255, 0.1);
}

.history-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
}

.is-dark .icon-btn {
  color: #94a3b8;
}

.icon-btn:hover:not(:disabled) {
  background-color: #f1f5f9;
  color: #0f172a;
}

.is-dark .icon-btn:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}

.new-session-history-btn {
  color: #6366f1;
}

.new-session-history-btn:hover:not(:disabled) {
  background-color: #ede9fe;
  color: #4f46e5;
}

.is-dark .new-session-history-btn {
  color: #a5b4fc;
}

.is-dark .new-session-history-btn:hover:not(:disabled) {
  background-color: rgba(99, 102, 241, 0.2);
  color: #c4b5fd;
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.icon-btn.lang-btn {
  width: auto;
  padding: 0 8px;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
}

/* 2. WORKBENCH BODY */
.workbench-body {
  display: flex;
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* LEFT TOOL RIBBON */
.tool-ribbon {
  width: 52px;
  background-color: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  flex-shrink: 0;
  z-index: 20;
}

.is-dark .tool-ribbon {
  background-color: #0f172a;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.ribbon-tools-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.ribbon-btn {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: #64748b;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: all 0.15s;
}

.is-dark .ribbon-btn {
  color: #94a3b8;
}

.ribbon-btn:hover:not(:disabled) {
  background-color: #f1f5f9;
  color: #4f46e5;
}

.is-dark .ribbon-btn:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.06);
  color: #a5b4fc;
}

.ribbon-btn.active {
  background-color: rgba(99, 102, 241, 0.12);
  color: #6366f1;
  border-color: rgba(99, 102, 241, 0.3);
}

.is-dark .ribbon-btn.active {
  background-color: rgba(129, 140, 248, 0.18);
  color: #818cf8;
  border-color: rgba(129, 140, 248, 0.4);
}

.ribbon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.ribbon-btn-danger:hover:not(:disabled) {
  color: #ef4444;
  background-color: rgba(239, 68, 68, 0.1);
}

.ribbon-btn-new {
  color: #4f46e5;
}

.ribbon-btn-new:hover:not(:disabled) {
  background-color: #f5f3ff;
  color: #4338ca;
  border-color: #c4b5fd;
}

.is-dark .ribbon-btn-new {
  color: #a5b4fc;
}

.is-dark .ribbon-btn-new:hover:not(:disabled) {
  background-color: rgba(99, 102, 241, 0.18);
  color: #c7d2fe;
  border-color: rgba(139, 92, 246, 0.4);
}

.ribbon-key {
  position: absolute;
  bottom: 2px;
  right: 3px;
  font-size: 8px;
  font-weight: 700;
  opacity: 0.7;
  line-height: 1;
}

.ribbon-separator {
  width: 24px;
  height: 1px;
  background-color: #e2e8f0;
  margin: 4px 0;
}

.is-dark .ribbon-separator {
  background-color: rgba(255, 255, 255, 0.08);
}

/* CENTER CANVAS VIEWPORT */
.canvas-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f1f5f9;
}

.is-dark .canvas-viewport {
  background-color: #070a10;
}

/* FLOATING ZOOM WIDGET */
.floating-zoom-widget {
  position: absolute;
  top: 14px;
  right: 14px;
  display: flex;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  padding: 3px 6px;
  box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.08);
  z-index: 30;
  gap: 4px;
}

.is-dark .floating-zoom-widget {
  background-color: rgba(15, 23, 42, 0.85);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.4);
}

.zoom-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: #475569;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
}

.is-dark .zoom-btn {
  color: #94a3b8;
}

.zoom-btn:hover {
  background-color: #e2e8f0;
  color: #0f172a;
}

.is-dark .zoom-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
}

.zoom-btn.text-btn {
  width: auto;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
}

.zoom-btn.text-btn.is-active {
  background-color: rgba(16, 185, 129, 0.12);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.zoom-btn.text-btn.is-active:hover {
  background-color: rgba(16, 185, 129, 0.18);
  color: #047857;
}

.is-dark .zoom-btn.text-btn.is-active {
  background-color: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.35);
}

.is-dark .zoom-btn.text-btn.is-active:hover {
  background-color: rgba(16, 185, 129, 0.28);
  color: #6ee7b7;
}

.zoom-level {
  font-size: 12px;
  font-weight: 600;
  min-width: 42px;
  text-align: center;
  color: #0f172a;
}

.is-dark .zoom-level {
  color: #f1f5f9;
}

.zoom-divider {
  width: 1px;
  height: 14px;
  background-color: #cbd5e1;
  margin: 0 2px;
}

.is-dark .zoom-divider {
  background-color: rgba(255, 255, 255, 0.15);
}

/* CANVAS STAGE */
.canvas-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  touch-action: none;
  transition: transform 0.05s ease-out;
}

.editor-canvas {
  box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  display: block;
}

/* Checkerboard background */
.checkerboard-bg {
  background-color: #ffffff;
  background-image:
    linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
    linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
    linear-gradient(-45deg, transparent 75%, #e2e8f0 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
}

.is-dark .checkerboard-bg {
  background-color: #1e293b;
  background-image:
    linear-gradient(45deg, #0f172a 25%, transparent 25%),
    linear-gradient(-45deg, #0f172a 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #0f172a 75%),
    linear-gradient(-45deg, transparent 75%, #0f172a 75%);
}

/* EMPTY STATE / DROPZONE */
.empty-dropzone-container {
  width: 100%;
  max-width: 580px;
  padding: 24px;
}

.workbench-dropzone {
  width: 100%;
}

.workbench-dropzone .el-upload {
  width: 100%;
}

.workbench-dropzone .el-upload-dragger {
  width: 100%;
  border-radius: 24px;
  border: 2px dashed #cbd5e1;
  background-color: #ffffff;
  padding: 48px 32px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.is-dark .workbench-dropzone .el-upload-dragger {
  background-color: #0f172a;
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.3);
}

.workbench-dropzone .el-upload-dragger:hover {
  border-color: #6366f1;
  transform: translateY(-2px);
  box-shadow: 0 16px 36px -8px rgba(99, 102, 241, 0.15);
}

.dropzone-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.dropzone-icon-glow {
  margin-bottom: 18px;
}

.icon-circle {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.16) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6366f1;
}

.is-dark .icon-circle {
  color: #a5b4fc;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.25) 100%);
}

.dropzone-title {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 8px 0;
  letter-spacing: -0.01em;
}

.is-dark .dropzone-title {
  color: #f8fafc;
}

.dropzone-subtitle {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 24px 0;
}

.is-dark .dropzone-subtitle {
  color: #94a3b8;
}

.dropzone-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.sample-image-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 9999px;
  border: 1px solid rgba(99, 102, 241, 0.3);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.12) 100%);
  color: #4f46e5;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.is-dark .sample-image-btn {
  color: #c084fc;
  border-color: rgba(168, 85, 247, 0.4);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.2) 100%);
}

.sample-image-btn:hover {
  transform: scale(1.03);
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.2);
}

.dropzone-security {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #059669;
}

.is-dark .dropzone-security {
  color: #34d399;
}

.security-shield {
  width: 14px;
  height: 14px;
}

/* 4. RIGHT INSPECTOR PANEL */
.inspector-panel {
  width: 320px;
  background-color: #ffffff;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 20;
  min-height: 0;
  overflow: hidden;
}

.is-dark .inspector-panel {
  background-color: #0f172a;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

/* Inspector Top Bar */
.inspector-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.is-dark .inspector-top-bar {
  background-color: rgba(255, 255, 255, 0.02);
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.inspector-top-hint {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.inspector-new-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background-color: #eef2ff;
  color: #4f46e5;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
}

.inspector-new-btn:hover {
  background-color: #e0e7ff;
  border-color: #a5b4fc;
  color: #4338ca;
}

.is-dark .inspector-new-btn {
  background-color: rgba(99, 102, 241, 0.15);
  border-color: rgba(129, 140, 248, 0.3);
  color: #a5b4fc;
}

.is-dark .inspector-new-btn:hover {
  background-color: rgba(99, 102, 241, 0.25);
  border-color: rgba(129, 140, 248, 0.5);
  color: #c7d2fe;
}

.inspector-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.inspector-tabs .el-tabs__header {
  margin: 0;
  padding: 0 8px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.is-dark .inspector-tabs .el-tabs__header {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.inspector-tabs .el-tabs__nav-wrap::after {
  display: none;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.inspector-tabs .el-tabs__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 16px 28px;
}

.inspector-tabs .el-tab-pane {
  min-height: 100%;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Region Card */
.region-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.region-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.region-badge {
  font-size: 13px;
  font-weight: 700;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
  padding: 3px 8px;
  border-radius: 6px;
}

.is-dark .region-badge {
  color: #818cf8;
  background: rgba(129, 140, 248, 0.18);
}

.region-aspect-ratio {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.coords-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.coord-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.coord-field label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  margin-top: 4px;
}

.is-dark .section-title {
  color: #94a3b8;
}

.padding-actions {
  display: flex;
  gap: 6px;
}

.pill-action-btn {
  flex: 1;
  padding: 6px 0;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background-color: #f8fafc;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.is-dark .pill-action-btn {
  background-color: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
}

.pill-action-btn:hover {
  background-color: #6366f1;
  border-color: #6366f1;
  color: #ffffff;
}

.preview-card-wrap {
  width: 100%;
  height: 110px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.is-dark .preview-card-wrap {
  border-color: rgba(255, 255, 255, 0.08);
}

.preview-box {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.region-footer-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding-bottom: 12px;
}

.download-single-btn {
  width: 100%;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  border: none;
  font-weight: 600;
}

.delete-box-btn {
  width: 100%;
  margin-left: 0 !important;
}

/* Empty selection placeholder */
.empty-selection-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 16px;
  color: #64748b;
}

.placeholder-icon {
  margin-bottom: 12px;
  color: #94a3b8;
}

.empty-selection-placeholder h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 6px 0;
  color: #0f172a;
}

.is-dark .empty-selection-placeholder h3 {
  color: #f1f5f9;
}

.empty-selection-placeholder p {
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
}

/* Inspector Form Items */
.inspector-form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.is-dark .form-label {
  color: #cbd5e1;
}

.param-val {
  color: #6366f1;
  font-size: 11px;
}

.mode-segmented-group {
  width: 100%;
  display: flex;
}

.mode-segmented-group .el-radio-button {
  flex: 1;
}

.mode-segmented-group .el-radio-button__inner {
  width: 100%;
  padding: 7px 0;
  font-size: 12px;
}

.detect-btn-large {
  width: 100%;
  margin-top: 8px;
  height: 38px;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  gap: 6px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
}

.detect-btn-large:hover {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
}

.filename-preview-text {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  margin-top: -4px;
}

.preview-code {
  font-family: monospace;
  background-color: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  color: #6366f1;
  font-weight: 600;
}

.is-dark .preview-code {
  background-color: rgba(255, 255, 255, 0.08);
  color: #a5b4fc;
}

/* Gradient Download Buttons */
.gradient-download-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 18px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.25);
  transition: all 0.2s;
  white-space: nowrap;
}

.gradient-download-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(99, 102, 241, 0.35);
}

.gradient-download-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.gradient-download-btn.full-width {
  width: 100%;
  margin-top: 6px;
  height: 40px;
}

/* 5. BOTTOM ASSET TRAY */
.workbench-asset-tray {
  height: 124px;
  background-color: #ffffff;
  border-top: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  padding: 8px 16px;
  flex-shrink: 0;
  z-index: 30;
}

.is-dark .workbench-asset-tray {
  background-color: #0f172a;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.tray-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.tray-title-group {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.tray-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.is-dark .tray-title {
  color: #f8fafc;
}

.tray-subtitle {
  font-size: 11px;
  color: #64748b;
}

.is-dark .tray-subtitle {
  color: #94a3b8;
}

.tray-thumbnails-scroll {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}

.tray-thumb-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 8px;
  padding: 4px;
  transition: all 0.15s;
}

.tray-thumb-card:hover {
  background-color: #f1f5f9;
}

.is-dark .tray-thumb-card:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.tray-thumb-card.active .thumb-canvas-wrap {
  border-color: #8b5cf6;
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.4);
}

.thumb-canvas-wrap {
  width: 60px;
  height: 60px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.is-dark .thumb-canvas-wrap {
  border-color: rgba(255, 255, 255, 0.12);
}

.tray-thumb-canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.thumb-check-badge {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  background-color: #10b981;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.thumb-name {
  font-size: 10px;
  font-weight: 500;
  color: #64748b;
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.is-dark .thumb-name {
  color: #94a3b8;
}

.tray-empty-text {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
  padding: 12px;
}

/* ROW GROUPS */
.row-groups-section {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
}

.is-dark .row-groups-section {
  border-top-color: rgba(255, 255, 255, 0.08);
}

.row-groups-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.switch-label-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.switch-label-group .info-icon {
  font-size: 14px;
  color: #94a3b8;
  cursor: help;
}

.row-names-container {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row-names-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sub-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.is-dark .sub-label {
  color: #94a3b8;
}

.presets-btn {
  font-size: 11px !important;
  font-weight: 600 !important;
  padding: 0 !important;
  height: auto !important;
}

.row-inputs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
  padding-right: 2px;
}

.row-input-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-idx-badge {
  font-size: 11px;
  font-weight: 700;
  color: #6366f1;
  background-color: rgba(99, 102, 241, 0.1);
  padding: 3px 6px;
  border-radius: 4px;
  min-width: 28px;
  text-align: center;
}

.is-dark .row-idx-badge {
  color: #a5b4fc;
  background-color: rgba(129, 140, 248, 0.16);
}

/* ANIMATION PLAYER */
.animation-tab-content {
  display: flex;
  flex-direction: column;
}

.animation-player-card {
  margin-top: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background-color: #f8fafc;
}

.is-dark .animation-player-card {
  border-color: rgba(255, 255, 255, 0.08);
  background-color: #0f172a;
}

.animation-stage {
  position: relative;
  width: 100%;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.animation-preview-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.no-frames-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
  background-color: rgba(255, 255, 255, 0.8);
}

.is-dark .no-frames-overlay {
  background-color: rgba(15, 23, 42, 0.85);
  color: #64748b;
}

.frame-counter-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background-color: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(4px);
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.playback-controls-bar {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid #e2e8f0;
  background-color: #ffffff;
}

.is-dark .playback-controls-bar {
  border-top-color: rgba(255, 255, 255, 0.08);
  background-color: #1e293b;
}

.static-inspection-card {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.static-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 6px;
  background-color: #f1f5f9;
  font-size: 12px;
}

.is-dark .static-info-row {
  background-color: rgba(255, 255, 255, 0.05);
}

.static-info-row .info-label {
  color: #64748b;
  font-weight: 500;
}

.is-dark .static-info-row .info-label {
  color: #94a3b8;
}

.static-info-row .info-val {
  font-weight: 600;
  color: #334155;
  font-family: monospace;
}

.is-dark .static-info-row .info-val {
  color: #e2e8f0;
}

.download-frame-btn {
  width: 100%;
}

@media (max-width: 900px) {
  .new-session-header-btn .btn-text {
    display: none;
  }
  .new-session-header-btn {
    padding: 0 8px;
    width: 32px;
    justify-content: center;
  }
}
</style>