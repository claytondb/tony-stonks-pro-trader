/**
 * Editor UI
 * Full HTML/CSS interface for the level editor
 */

import * as THREE from 'three';
import { LevelEditor, EditorObject } from './LevelEditor';
import { EditorStorage, EditorLevelData, OBJECT_CATEGORIES } from './EditorStorage';
import { SKY_PRESETS } from '../utils/SkyGradient';
import { TextureGeneratorUI } from './TextureGeneratorUI';
import { textureGenerator } from './TextureGenerator';

export interface EditorUICallbacks {
  onExit?: () => void;
  onPlayTest?: (level: EditorLevelData) => void;
}

export interface EditorUIOptions {
  skipAutosaveCheck?: boolean;
}

// Maximum objects allowed per level (for performance)
const MAX_OBJECTS = 500;

export class EditorUI {
  private editor: LevelEditor;
  private callbacks: EditorUICallbacks;
  
  private uiRoot: HTMLElement;
  private palettePanel: HTMLElement;
  private toolbar: HTMLElement;
  private statusBar: HTMLElement;
  private textureGeneratorUI: TextureGeneratorUI;
  private textureLoader: THREE.TextureLoader;
  
  private selectedCategory: number = 0;
  
  constructor(container: HTMLElement, callbacks: EditorUICallbacks = {}, options: EditorUIOptions = {}) {
    this.callbacks = callbacks;
    
    // Create main layout
    this.uiRoot = document.createElement('div');
    this.uiRoot.id = 'editor-ui';
    this.uiRoot.style.cssText = 'position: relative; z-index: 10; width: 100%; height: 100%;';
    this.uiRoot.innerHTML = this.getLayoutHTML();
    container.appendChild(this.uiRoot);
    
    // Apply styles
    this.injectStyles();
    
    // Get panel references
    this.palettePanel = this.uiRoot.querySelector('#palette-panel')!;
    this.toolbar = this.uiRoot.querySelector('#editor-toolbar')!;
    this.statusBar = this.uiRoot.querySelector('#status-bar')!;
    
    // Create editor in the viewport
    const viewport = this.uiRoot.querySelector('#editor-viewport') as HTMLElement;
    this.editor = new LevelEditor(viewport, {
      onObjectSelected: (obj) => this.onObjectSelected(obj),
      onObjectsChanged: () => this.onObjectsChanged(),
      onLevelChanged: () => this.onLevelChanged(),
      canAddObject: () => this.canAddObject()
    });
    
    // Create texture loader and generator UI
    this.textureLoader = new THREE.TextureLoader();
    this.textureGeneratorUI = new TextureGeneratorUI(this.uiRoot, {
      onTextureApplied: (obj, _textureUrl) => {
        this.updatePropertiesPanel(obj);
        this.showToast('Texture Applied!');
      },
      onSkyboxApplied: (skyboxUrl) => {
        this.editor.setSkyboxTexture(skyboxUrl);
        this.showToast('Skybox Applied!');
      },
      onSkyboxRemoved: () => {
        this.editor.removeSkybox();
        this.showToast('Skybox Removed');
      },
      onGroundTextureApplied: (textureUrl) => {
        this.editor.setGroundTexture(textureUrl);
        this.showToast('Ground Texture Applied!');
      }
    });
    
    // Setup UI interactions
    this.setupToolbar();
    this.setupPalette();
    this.updatePropertiesPanel(null);
    this.updateLevelSettings();
    
    // Check for autosave (skip if returning from play test)
    if (!options.skipAutosaveCheck) {
      const autosave = EditorStorage.loadAutosave();
      if (autosave) {
        if (confirm('Found an autosaved level. Would you like to restore it?')) {
          this.editor.loadLevel(autosave);
        }
      }
    }
  }
  
  private getLayoutHTML(): string {
    return `
      <div id="editor-layout">
        <!-- Toolbar -->
        <div id="editor-toolbar">
          <div class="toolbar-group">
            <button id="btn-new" title="New Level (Ctrl+N)">📄 New</button>
            <button id="btn-save" title="Save (Ctrl+S)">💾 Save</button>
            <button id="btn-load" title="Load">📂 Load</button>
          </div>
          <div class="toolbar-divider"></div>
          <div class="toolbar-group">
            <button id="btn-export" title="Export to File">📤 Export</button>
            <button id="btn-import" title="Import from File">📥 Import</button>
          </div>
          <div class="toolbar-divider"></div>
          <div class="toolbar-group">
            <button id="btn-texture-gen" title="AI Texture Generator">🎨 AI Textures</button>
          </div>
          <div class="toolbar-divider"></div>
          <div class="toolbar-group">
            <button id="btn-play" title="Test Level">▶️ Play Test</button>
          </div>
          <div class="toolbar-spacer"></div>
          <div class="toolbar-group">
            <button id="btn-exit" title="Exit Editor">❌ Exit</button>
          </div>
        </div>
        
        <!-- Main content area -->
        <div id="editor-content">
          <!-- Left: Object Palette -->
          <div id="palette-panel">
            <div class="panel-header">Objects</div>
            <div id="category-tabs"></div>
            <div id="object-list"></div>
          </div>
          
          <!-- Center: 3D Viewport -->
          <div id="editor-viewport"></div>
          
          <!-- Right: Properties -->
          <div id="properties-panel">
            <div class="panel-header">Properties</div>
            <div id="object-properties"></div>
            <div class="panel-header" style="margin-top: 20px;">Level Settings</div>
            <div id="level-settings"></div>
          </div>
        </div>
        
        <!-- Status bar -->
        <div id="status-bar">
          <span id="status-text">Ready</span>
          <span id="status-position"></span>
          <span id="status-grid">Grid: 1</span>
          <span id="object-count-container" style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
            <span id="object-count-label">Objects: 0/500</span>
            <div id="object-count-bar" style="width: 100px; height: 8px; background: #333; border-radius: 4px; overflow: hidden;">
              <div id="object-count-fill" style="width: 0%; height: 100%; background: #00ff88; transition: width 0.2s, background 0.2s;"></div>
            </div>
          </span>
        </div>
      </div>
      
      <!-- File input (hidden) -->
      <input type="file" id="import-input" accept=".json" style="display: none;">
      
      <!-- Toast notification -->
      <div id="editor-toast" class="editor-toast">
        <span class="toast-icon">✓</span>
        <span class="toast-message">Level Saved!</span>
      </div>
      
      <!-- Object limit dialog (hidden) -->
      <div id="limit-dialog" class="dialog-overlay" style="display: none;">
        <div class="dialog-content" style="max-width: 400px;">
          <div class="dialog-header">
            <h3>⚠️ Object Limit Reached</h3>
            <button class="dialog-close">✕</button>
          </div>
          <p style="padding: 20px; color: #ccc; line-height: 1.5;">
            You've reached the maximum number of objects (500) allowed in a level. 
            This limit ensures good performance during gameplay.
          </p>
          <p style="padding: 0 20px 20px; color: #888;">
            Delete some objects to free up space for new ones.
          </p>
          <div class="dialog-footer">
            <button id="btn-close-limit">OK</button>
          </div>
        </div>
      </div>
      
      <!-- Load dialog (hidden) -->
      <div id="load-dialog" class="dialog-overlay" style="display: none;">
        <div class="dialog-content">
          <div class="dialog-header">
            <h3>Load Level</h3>
            <button class="dialog-close">✕</button>
          </div>
          <div id="saved-levels-list"></div>
          <div class="dialog-footer">
            <button id="btn-cancel-load">Cancel</button>
          </div>
        </div>
      </div>
    `;
  }
  
  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #editor-ui {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        font-family: 'Kanit', sans-serif;
        color: #fff;
        background: #1a1a2e;
      }
      
      #editor-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      
      /* Toolbar */
      #editor-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: #2a2a4e;
        border-bottom: 1px solid #3a3a6e;
      }
      
      #editor-toolbar button {
        padding: 8px 12px;
        font-size: 13px;
        font-family: inherit;
        color: #fff;
        background: #3a3a5e;
        border: 1px solid #4a4a7e;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s;
      }
      
      #editor-toolbar button:hover {
        background: #4a4a7e;
        border-color: #6a6a9e;
      }
      
      .toolbar-group {
        display: flex;
        gap: 4px;
      }
      
      .toolbar-divider {
        width: 1px;
        height: 24px;
        background: #4a4a7e;
        margin: 0 8px;
      }
      
      .toolbar-spacer {
        flex: 1;
      }
      
      /* Main content */
      #editor-content {
        display: flex;
        flex: 1;
        overflow: hidden;
      }
      
      /* Panels */
      #palette-panel, #properties-panel {
        width: 260px;
        background: #22223a;
        border: 1px solid #3a3a6e;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      .panel-header {
        padding: 12px 15px;
        font-weight: 600;
        font-size: 14px;
        color: #aaa;
        text-transform: uppercase;
        letter-spacing: 1px;
        border-bottom: 1px solid #3a3a6e;
      }
      
      /* Category tabs */
      #category-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 8px;
        border-bottom: 1px solid #3a3a6e;
      }
      
      .category-tab {
        padding: 6px 10px;
        font-size: 18px;
        background: #2a2a4e;
        border: 1px solid #3a3a6e;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s;
      }
      
      .category-tab:hover {
        background: #3a3a5e;
      }
      
      .category-tab.active {
        background: #4a7a4a;
        border-color: #5a9a5a;
      }
      
      /* Object list */
      #object-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }
      
      .object-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        background: #2a2a4e;
        border: 1px solid #3a3a6e;
        border-radius: 6px;
        margin-bottom: 6px;
        cursor: pointer;
        transition: all 0.15s;
      }
      
      .object-item:hover {
        background: #3a3a5e;
        border-color: #5a5a8e;
      }
      
      .object-item.selected {
        background: #4a7a4a;
        border-color: #5a9a5a;
      }
      
      .object-icon {
        font-size: 24px;
        width: 32px;
        text-align: center;
      }
      
      .object-info {
        flex: 1;
      }
      
      .object-name {
        font-weight: 600;
        font-size: 13px;
      }
      
      .object-desc {
        font-size: 11px;
        color: #888;
        margin-top: 2px;
      }
      
      /* Properties */
      #object-properties, #level-settings {
        padding: 12px;
        overflow-y: auto;
      }
      
      .prop-group {
        margin-bottom: 15px;
      }
      
      .prop-label {
        font-size: 11px;
        color: #888;
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      
      .prop-input {
        width: 100%;
        padding: 8px 10px;
        font-size: 13px;
        font-family: inherit;
        color: #fff;
        background: #1a1a2e;
        border: 1px solid #3a3a6e;
        border-radius: 4px;
        box-sizing: border-box;
      }
      
      .prop-input:focus {
        outline: none;
        border-color: #5a9a5a;
      }
      
      .prop-row {
        display: flex;
        gap: 8px;
      }
      
      .prop-row .prop-group {
        flex: 1;
      }
      
      .prop-color {
        width: 100%;
        height: 36px;
        padding: 2px;
        border: 1px solid #3a3a6e;
        border-radius: 4px;
        cursor: pointer;
      }
      
      .prop-btn {
        padding: 6px 12px;
        background: #3a3a6e;
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        font-size: 16px;
      }
      
      .prop-btn:hover {
        background: #4a4a8e;
      }
      
      /* Viewport */
      #editor-viewport {
        flex: 1;
        position: relative;
        background: #111;
      }
      
      #editor-viewport canvas {
        width: 100% !important;
        height: 100% !important;
      }
      
      /* Status bar */
      #status-bar {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 6px 12px;
        font-size: 12px;
        color: #888;
        background: #2a2a4e;
        border-top: 1px solid #3a3a6e;
      }
      
      #status-bar span {
        padding: 2px 8px;
        background: #1a1a2e;
        border-radius: 3px;
      }
      
      /* Dialog */
      .dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      
      .dialog-content {
        width: 500px;
        max-height: 80vh;
        background: #22223a;
        border: 1px solid #4a4a7e;
        border-radius: 8px;
        overflow: hidden;
      }
      
      .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 15px 20px;
        background: #2a2a4e;
        border-bottom: 1px solid #3a3a6e;
      }
      
      .dialog-header h3 {
        margin: 0;
        font-size: 16px;
      }
      
      .dialog-close {
        padding: 4px 8px;
        font-size: 16px;
        background: transparent;
        border: none;
        color: #888;
        cursor: pointer;
      }
      
      .dialog-close:hover {
        color: #fff;
      }
      
      #saved-levels-list {
        padding: 15px;
        max-height: 400px;
        overflow-y: auto;
      }
      
      .saved-level-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 15px;
        background: #2a2a4e;
        border: 1px solid #3a3a6e;
        border-radius: 6px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.15s;
      }
      
      .saved-level-item:hover {
        background: #3a3a5e;
        border-color: #5a5a8e;
      }
      
      .saved-level-info {
        flex: 1;
      }
      
      .saved-level-name {
        font-weight: 600;
      }
      
      .saved-level-meta {
        font-size: 11px;
        color: #888;
        margin-top: 4px;
      }
      
      .saved-level-actions {
        display: flex;
        gap: 8px;
      }
      
      .saved-level-actions button {
        padding: 6px 12px;
        font-size: 12px;
        background: #3a3a5e;
        border: 1px solid #4a4a7e;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
      }
      
      .saved-level-actions button:hover {
        background: #4a4a7e;
      }
      
      .saved-level-actions button.delete {
        background: #5a3a3a;
        border-color: #7a4a4a;
      }
      
      .saved-level-actions button.delete:hover {
        background: #7a4a4a;
      }
      
      .dialog-footer {
        padding: 15px 20px;
        border-top: 1px solid #3a3a6e;
        text-align: right;
      }
      
      .dialog-footer button {
        padding: 8px 20px;
        font-size: 13px;
        font-family: inherit;
        background: #3a3a5e;
        border: 1px solid #4a4a7e;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
      }
      
      .no-levels {
        text-align: center;
        color: #666;
        padding: 30px;
      }
      
      /* Toast notifications */
      .editor-toast {
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        padding: 12px 24px;
        background: linear-gradient(135deg, #2d5a2d, #1a3a1a);
        border: 2px solid #4a9a4a;
        border-radius: 8px;
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        z-index: 3000;
        opacity: 0;
        transition: all 0.3s ease;
        pointer-events: none;
      }
      
      .editor-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      
      .editor-toast.error {
        background: linear-gradient(135deg, #5a2d2d, #3a1a1a);
        border-color: #9a4a4a;
      }
      
      .editor-toast .toast-icon {
        margin-right: 8px;
      }
      
      /* Keyboard hints */
      .keyboard-hints {
        padding: 12px;
        font-size: 11px;
        color: #666;
        border-top: 1px solid #3a3a6e;
      }
      
      .keyboard-hints div {
        margin-bottom: 4px;
      }
      
      .keyboard-hints kbd {
        display: inline-block;
        padding: 2px 5px;
        font-family: 'Kanit', sans-serif;
        background: #2a2a4e;
        border: 1px solid #3a3a6e;
        border-radius: 3px;
        font-size: 10px;
      }
    `;
    document.head.appendChild(style);
  }
  
  private setupToolbar(): void {
    // New
    this.toolbar.querySelector('#btn-new')?.addEventListener('click', () => {
      if (confirm('Create a new level? Unsaved changes will be lost.')) {
        this.editor.newLevel();
        this.updateLevelSettings();
        this.setStatus('New level created');
      }
    });
    
    // Save
    this.toolbar.querySelector('#btn-save')?.addEventListener('click', () => {
      if (this.editor.save()) {
        this.showToast('Level Saved!');
        this.setStatus('Level saved');
      } else {
        this.showToast('Failed to save level', true);
        this.setStatus('Save failed');
      }
    });
    
    // Load
    this.toolbar.querySelector('#btn-load')?.addEventListener('click', () => {
      this.showLoadDialog();
    });
    
    // Export
    this.toolbar.querySelector('#btn-export')?.addEventListener('click', () => {
      this.editor.exportLevel();
      this.showToast('Level Exported!');
      this.setStatus('Level exported');
    });
    
    // Import
    const importInput = this.uiRoot.querySelector('#import-input') as HTMLInputElement;
    this.toolbar.querySelector('#btn-import')?.addEventListener('click', () => {
      importInput.click();
    });
    
    importInput.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (file) {
        if (await this.editor.importLevel(file)) {
          this.updateLevelSettings();
          this.showToast('Level Imported!');
          this.setStatus('Level imported');
        } else {
          this.showToast('Failed to import level', true);
          this.setStatus('Import failed');
        }
        importInput.value = '';
      }
    });
    
    // AI Texture Generator
    this.toolbar.querySelector('#btn-texture-gen')?.addEventListener('click', () => {
      const selectedObj = this.editor.getSelectedObject();
      this.textureGeneratorUI.show(selectedObj);
    });
    
    // Play test
    this.toolbar.querySelector('#btn-play')?.addEventListener('click', () => {
      this.callbacks.onPlayTest?.(this.editor.getLevel());
    });
    
    // Exit
    this.toolbar.querySelector('#btn-exit')?.addEventListener('click', () => {
      if (confirm('Exit editor? Make sure you have saved your level.')) {
        this.callbacks.onExit?.();
      }
    });
    
    // Dialog handlers
    const loadDialog = this.uiRoot.querySelector('#load-dialog') as HTMLElement;
    loadDialog.querySelector('.dialog-close')?.addEventListener('click', () => {
      loadDialog.style.display = 'none';
    });
    loadDialog.querySelector('#btn-cancel-load')?.addEventListener('click', () => {
      loadDialog.style.display = 'none';
    });
    
    // Limit dialog handlers
    const limitDialog = this.uiRoot.querySelector('#limit-dialog') as HTMLElement;
    limitDialog?.querySelector('.dialog-close')?.addEventListener('click', () => {
      limitDialog.style.display = 'none';
    });
    limitDialog?.querySelector('#btn-close-limit')?.addEventListener('click', () => {
      limitDialog.style.display = 'none';
    });
  }
  
  private setupPalette(): void {
    const tabsContainer = this.uiRoot.querySelector('#category-tabs')!;
    
    // Create category tabs
    tabsContainer.innerHTML = OBJECT_CATEGORIES.map((cat, i) => `
      <div class="category-tab ${i === 0 ? 'active' : ''}" data-index="${i}" title="${cat.name}">
        ${cat.icon}
      </div>
    `).join('');
    
    // Tab click handlers
    tabsContainer.querySelectorAll('.category-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const index = parseInt(tab.getAttribute('data-index')!);
        this.selectCategory(index);
      });
    });
    
    // Initial render
    this.renderObjectList();
    
    // Add keyboard hints at bottom
    const hints = document.createElement('div');
    hints.className = 'keyboard-hints';
    hints.innerHTML = `
      <div><kbd>T</kbd> Translate mode</div>
      <div><kbd>R</kbd> Rotate mode</div>
      <div><kbd>[ ]</kbd> Rotate 15°</div>
      <div><kbd>Del</kbd> Delete object</div>
      <div><kbd>G</kbd> Toggle grid snap</div>
      <div><kbd>Esc</kbd> Cancel/Deselect</div>
      <div><kbd>Ctrl+D</kbd> Duplicate</div>
    `;
    this.palettePanel.appendChild(hints);
  }
  
  private selectCategory(index: number): void {
    this.selectedCategory = index;
    
    // Update tabs
    this.uiRoot.querySelectorAll('.category-tab').forEach((tab, i) => {
      tab.classList.toggle('active', i === index);
    });
    
    this.renderObjectList();
  }
  
  private renderObjectList(): void {
    const listContainer = this.uiRoot.querySelector('#object-list')!;
    const category = OBJECT_CATEGORIES[this.selectedCategory];
    
    listContainer.innerHTML = category.items.map(item => `
      <div class="object-item" data-type="${item.type}">
        <div class="object-icon">${item.icon}</div>
        <div class="object-info">
          <div class="object-name">${item.name}</div>
          <div class="object-desc">${item.description}</div>
        </div>
      </div>
    `).join('');
    
    // Click handlers
    listContainer.querySelectorAll('.object-item').forEach(el => {
      el.addEventListener('click', () => {
        const type = el.getAttribute('data-type')!;
        const item = category.items.find(i => i.type === type);
        if (item) {
          // Toggle selection
          const wasSelected = el.classList.contains('selected');
          listContainer.querySelectorAll('.object-item').forEach(i => i.classList.remove('selected'));
          
          if (wasSelected) {
            this.editor.cancelPlacement();
          } else {
            el.classList.add('selected');
            this.editor.startPlacement(item);
            this.setStatus(`Click to place ${item.name}`);
          }
        }
      });
    });
  }
  
  private onObjectSelected(obj: EditorObject | null): void {
    // Clear palette selection when selecting placed object
    this.uiRoot.querySelectorAll('.object-item').forEach(i => i.classList.remove('selected'));
    this.updatePropertiesPanel(obj);
    
    // Update texture generator with selected object
    this.textureGeneratorUI.setSelectedObject(obj);
  }
  
  private onObjectsChanged(): void {
    const level = this.editor.getLevel();
    this.setStatus(`${level.objects.length} objects`);
    this.updateObjectCount();
  }
  
  private updateObjectCount(): void {
    const level = this.editor.getLevel();
    const count = level.objects.length;
    const percent = (count / MAX_OBJECTS) * 100;
    
    const label = this.statusBar.querySelector('#object-count-label');
    const fill = this.statusBar.querySelector('#object-count-fill') as HTMLElement;
    
    if (label) label.textContent = `Objects: ${count}/${MAX_OBJECTS}`;
    if (fill) {
      fill.style.width = `${Math.min(percent, 100)}%`;
      
      // Color coding: green -> orange -> red
      if (percent >= 90) {
        fill.style.background = '#ff4444';
      } else if (percent >= 75) {
        fill.style.background = '#ffaa00';
      } else {
        fill.style.background = '#00ff88';
      }
    }
  }
  
  canAddObject(): boolean {
    const level = this.editor.getLevel();
    if (level.objects.length >= MAX_OBJECTS) {
      this.showLimitDialog();
      return false;
    }
    return true;
  }
  
  private showLimitDialog(): void {
    const dialog = this.uiRoot.querySelector('#limit-dialog') as HTMLElement;
    if (dialog) dialog.style.display = 'flex';
  }
  
  private onLevelChanged(): void {
    this.updateLevelSettings();
  }
  
  private updatePropertiesPanel(obj: EditorObject | null): void {
    const container = this.uiRoot.querySelector('#object-properties')!;
    
    if (!obj) {
      container.innerHTML = `
        <div style="color: #666; text-align: center; padding: 20px;">
          Select an object to edit its properties
        </div>
      `;
      return;
    }
    
    const pos = obj.data.position;
    const rot = obj.data.rotation || [0, 0, 0];
    
    container.innerHTML = `
      <div class="prop-group">
        <div class="prop-label">Type</div>
        <div style="color: #fff; font-weight: 600;">${obj.data.type}</div>
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Position</div>
        <div class="prop-row">
          <div class="prop-group">
            <input type="number" class="prop-input" id="prop-pos-x" value="${pos[0].toFixed(1)}" step="0.5">
          </div>
          <div class="prop-group">
            <input type="number" class="prop-input" id="prop-pos-y" value="${pos[1].toFixed(1)}" step="0.5">
          </div>
          <div class="prop-group">
            <input type="number" class="prop-input" id="prop-pos-z" value="${pos[2].toFixed(1)}" step="0.5">
          </div>
        </div>
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Rotation (Y)</div>
        <input type="number" class="prop-input" id="prop-rot-y" value="${rot[1].toFixed(0)}" step="15">
      </div>
      
      ${this.renderTextureSelector(obj)}
      
      ${this.renderMaterialPartsEditor(obj)}
      
      ${this.renderParamsInputs(obj)}
      
      <div class="prop-group" style="margin-top: 20px;">
        <button id="btn-delete-object" style="
          width: 100%;
          padding: 10px;
          background: #5a3a3a;
          border: 1px solid #7a4a4a;
          border-radius: 4px;
          color: #fff;
          cursor: pointer;
          font-family: inherit;
        ">🗑️ Delete Object</button>
      </div>
    `;
    
    // Bind inputs
    const posX = container.querySelector('#prop-pos-x') as HTMLInputElement;
    const posY = container.querySelector('#prop-pos-y') as HTMLInputElement;
    const posZ = container.querySelector('#prop-pos-z') as HTMLInputElement;
    const rotY = container.querySelector('#prop-rot-y') as HTMLInputElement;
    
    const updatePos = () => {
      obj.data.position = [parseFloat(posX.value), parseFloat(posY.value), parseFloat(posZ.value)];
      obj.mesh.position.set(obj.data.position[0], obj.data.position[1], obj.data.position[2]);
    };
    
    const updateRot = () => {
      obj.data.rotation = [0, parseFloat(rotY.value), 0];
      obj.mesh.rotation.y = obj.data.rotation[1] * Math.PI / 180;
    };
    
    posX.addEventListener('change', updatePos);
    posY.addEventListener('change', updatePos);
    posZ.addEventListener('change', updatePos);
    rotY.addEventListener('change', updateRot);
    
    container.querySelector('#btn-delete-object')?.addEventListener('click', () => {
      this.editor.deleteSelectedObject();
    });
    
    // Texture selector handler
    const textureSelect = container.querySelector('#prop-texture') as HTMLSelectElement;
    textureSelect?.addEventListener('change', () => {
      const index = parseInt(textureSelect.value);
      const history = textureGenerator.getHistory();
      const textureUrl = index >= 0 && index < history.length ? history[index].url : '';
      this.applyTextureToObjectType(obj, textureUrl);
    });
    
    // Clear texture history button
    container.querySelector('#clear-texture-history')?.addEventListener('click', () => {
      if (confirm('Clear all generated textures from history?')) {
        textureGenerator.clearHistory();
        // Refresh the properties panel
        this.updatePropertiesPanel(obj);
      }
    });
    
    // Per-part material controls
    this.setupPartMaterialListeners(obj, container as HTMLElement);
  }
  
  private renderTextureSelector(obj: EditorObject): string {
    const history = textureGenerator.getHistory();
    const currentTexture = obj.data.params?.textureUrl || '';
    
    // Find index of current texture in history
    let currentIndex = -1;
    history.forEach((tex, i) => {
      if (tex.url === currentTexture) currentIndex = i;
    });
    
    let html = `
      <div class="prop-group">
        <div class="prop-label">Texture</div>
        <select class="prop-input" id="prop-texture" data-texture-count="${history.length}">
          <option value="-1" ${currentIndex === -1 ? 'selected' : ''}>Default (None)</option>
    `;
    
    history.forEach((tex, i) => {
      const selected = i === currentIndex ? 'selected' : '';
      const label = tex.prompt.length > 25 ? tex.prompt.substring(0, 25) + '...' : tex.prompt;
      html += `<option value="${i}" ${selected}>${i + 1}. ${label}</option>`;
    });
    
    html += `
        </select>
        <div style="font-size: 10px; color: #666; margin-top: 4px;">
          Applies to all ${obj.data.type} objects
        </div>
        ${history.length > 0 ? `<button id="clear-texture-history" style="margin-top: 6px; padding: 4px 8px; font-size: 10px; cursor: pointer;">Clear History</button>` : ''}
      </div>
    `;
    
    return html;
  }
  
  /**
   * Get unique named parts from an object's mesh
   */
  private getObjectParts(mesh: THREE.Object3D): { name: string; meshes: THREE.Mesh[] }[] {
    const partsMap = new Map<string, THREE.Mesh[]>();
    
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name) {
        const existing = partsMap.get(child.name) || [];
        existing.push(child);
        partsMap.set(child.name, existing);
      }
    });
    
    // Also add unnamed meshes as "Main"
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && !child.name) {
        const existing = partsMap.get('Main') || [];
        existing.push(child);
        partsMap.set('Main', existing);
      }
    });
    
    return Array.from(partsMap.entries()).map(([name, meshes]) => ({ name, meshes }));
  }
  
  /**
   * Render the per-part material editor
   */
  private renderMaterialPartsEditor(obj: EditorObject): string {
    const parts = this.getObjectParts(obj.mesh);
    
    // Only show if there are multiple named parts
    if (parts.length <= 1) {
      return '';
    }
    
    const history = textureGenerator.getHistory();
    const partMaterials = obj.data.params?.partMaterials as Record<string, { color?: string; textureIndex?: number; textureOpacity?: number }> || {};
    
    let html = `
      <div class="prop-group" style="border-top: 1px solid #3a3a6e; padding-top: 15px; margin-top: 15px;">
        <div class="prop-label" style="font-size: 13px; color: #888;">🎨 Per-Part Materials</div>
        <div style="font-size: 10px; color: #666; margin-bottom: 10px;">
          Edit colors and textures for each part of this object.
        </div>
    `;
    
    parts.forEach((part) => {
      const partData = partMaterials[part.name] || {};
      const firstMesh = part.meshes[0];
      const mat = firstMesh.material as THREE.MeshStandardMaterial;
      const currentColor = partData.color || '#' + mat.color.getHexString();
      const currentTextureIndex = partData.textureIndex ?? -1;
      const currentOpacity = partData.textureOpacity ?? 1;
      
      html += `
        <div class="part-material-row" style="background: #22223a; border-radius: 6px; padding: 10px; margin-bottom: 8px;">
          <div style="font-weight: 600; color: #fff; margin-bottom: 8px;">${part.name}</div>
          
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
            <label style="font-size: 11px; color: #888; width: 50px;">Color</label>
            <input type="color" class="part-color" data-part="${part.name}" value="${currentColor}" 
              style="width: 40px; height: 24px; border: none; cursor: pointer;">
          </div>
          
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
            <label style="font-size: 11px; color: #888; width: 50px;">Texture</label>
            <select class="part-texture" data-part="${part.name}" style="flex: 1; padding: 4px; font-size: 11px; background: #1a1a2e; border: 1px solid #3a3a6e; color: #fff; border-radius: 3px;">
              <option value="-1" ${currentTextureIndex === -1 ? 'selected' : ''}>None</option>
              ${history.map((tex, i) => `
                <option value="${i}" ${i === currentTextureIndex ? 'selected' : ''}>
                  ${tex.prompt.length > 20 ? tex.prompt.substring(0, 20) + '...' : tex.prompt}
                </option>
              `).join('')}
            </select>
          </div>
          
          <div style="display: flex; gap: 8px; align-items: center;">
            <label style="font-size: 11px; color: #888; width: 50px;">Opacity</label>
            <input type="range" class="part-opacity" data-part="${part.name}" min="0" max="1" step="0.1" value="${currentOpacity}"
              style="flex: 1;">
            <span class="part-opacity-value" style="font-size: 10px; color: #888; width: 30px;">${Math.round(currentOpacity * 100)}%</span>
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
    
    return html;
  }
  
  /**
   * Setup event listeners for per-part material controls
   */
  private setupPartMaterialListeners(obj: EditorObject, container: HTMLElement): void {
    const parts = this.getObjectParts(obj.mesh);
    const history = textureGenerator.getHistory();
    
    // Initialize partMaterials if needed
    if (!obj.data.params) obj.data.params = {};
    if (!obj.data.params.partMaterials) obj.data.params.partMaterials = {};
    const partMaterials = obj.data.params.partMaterials as Record<string, { color?: string; textureIndex?: number; textureOpacity?: number }>;
    
    // Color change handlers
    container.querySelectorAll('.part-color').forEach((input) => {
      const colorInput = input as HTMLInputElement;
      const partName = colorInput.dataset.part!;
      
      colorInput.addEventListener('input', () => {
        const part = parts.find(p => p.name === partName);
        if (!part) return;
        
        if (!partMaterials[partName]) partMaterials[partName] = {};
        partMaterials[partName].color = colorInput.value;
        
        // Apply to all meshes of this part
        part.meshes.forEach(mesh => {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.color.setStyle(colorInput.value);
          mat.needsUpdate = true;
        });
      });
    });
    
    // Texture change handlers
    container.querySelectorAll('.part-texture').forEach((select) => {
      const textureSelect = select as HTMLSelectElement;
      const partName = textureSelect.dataset.part!;
      
      textureSelect.addEventListener('change', () => {
        const part = parts.find(p => p.name === partName);
        if (!part) return;
        
        const index = parseInt(textureSelect.value);
        if (!partMaterials[partName]) partMaterials[partName] = {};
        partMaterials[partName].textureIndex = index;
        
        const textureUrl = index >= 0 && index < history.length ? history[index].url : '';
        
        // Apply texture to all meshes of this part
        part.meshes.forEach(mesh => {
          this.applyTextureToSingleMesh(mesh, textureUrl, partMaterials[partName].textureOpacity ?? 1);
        });
      });
    });
    
    // Opacity change handlers
    container.querySelectorAll('.part-opacity').forEach((input) => {
      const opacityInput = input as HTMLInputElement;
      const partName = opacityInput.dataset.part!;
      const valueSpan = container.querySelector(`.part-opacity-value[data-part="${partName}"]`) || 
                        opacityInput.nextElementSibling as HTMLElement;
      
      opacityInput.addEventListener('input', () => {
        const part = parts.find(p => p.name === partName);
        if (!part) return;
        
        const opacity = parseFloat(opacityInput.value);
        if (!partMaterials[partName]) partMaterials[partName] = {};
        partMaterials[partName].textureOpacity = opacity;
        
        if (valueSpan) {
          valueSpan.textContent = Math.round(opacity * 100) + '%';
        }
        
        // Apply opacity - this blends texture with base color
        part.meshes.forEach(mesh => {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat.map) {
            // Adjust how much the base color shows through
            // At opacity 1: texture fully visible, color white
            // At opacity 0: no texture visible, color is base color
            const baseColor = partMaterials[partName].color || '#' + mat.color.getHexString();
            const blendedColor = this.blendColorWithWhite(baseColor, opacity);
            mat.color.setStyle(blendedColor);
            mat.needsUpdate = true;
          }
        });
      });
    });
  }
  
  /**
   * Blend a color with white based on opacity (1 = fully white, 0 = original color)
   */
  private blendColorWithWhite(hexColor: string, t: number): string {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    
    const blendR = Math.round(r + (255 - r) * t);
    const blendG = Math.round(g + (255 - g) * t);
    const blendB = Math.round(b + (255 - b) * t);
    
    return `#${blendR.toString(16).padStart(2, '0')}${blendG.toString(16).padStart(2, '0')}${blendB.toString(16).padStart(2, '0')}`;
  }
  
  /**
   * Apply texture to a single mesh with opacity support
   */
  private applyTextureToSingleMesh(mesh: THREE.Mesh, textureUrl: string, opacity: number = 1): void {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    
    if (!textureUrl) {
      // Remove texture
      if (mat.map) {
        mat.map.dispose();
        mat.map = null;
      }
      mat.needsUpdate = true;
      return;
    }
    
    this.textureLoader.load(textureUrl, (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      texture.colorSpace = THREE.SRGBColorSpace;
      
      if (mat.map) mat.map.dispose();
      mat.map = texture;
      
      // Blend color based on opacity
      mat.color.setStyle(this.blendColorWithWhite('#888888', opacity));
      mat.needsUpdate = true;
    });
  }
  
  private applyTextureToObjectType(obj: EditorObject, textureUrl: string): void {
    const objectType = obj.data.type;
    const level = this.editor.getLevel();
    
    // Apply to all objects of this type
    level.objects.forEach(levelObj => {
      if (levelObj.type === objectType) {
        if (!levelObj.params) levelObj.params = {};
        levelObj.params.textureUrl = textureUrl || undefined;
      }
    });
    
    // Update the 3D meshes
    const allEditorObjects = (this.editor as any).objects as EditorObject[];
    allEditorObjects.forEach(editorObj => {
      if (editorObj.data.type === objectType) {
        this.applyTextureToMesh(editorObj.mesh, textureUrl);
      }
    });
    
    this.showToast(`Texture applied to all ${objectType} objects!`);
  }
  
  private applyTextureToMesh(mesh: THREE.Object3D, textureUrl: string): void {
    if (!textureUrl) {
      // Remove texture, restore default material color
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.map) {
            mat.map.dispose();
            mat.map = null;
          }
          // Restore a neutral color
          mat.color.setHex(0x888888);
          mat.needsUpdate = true;
        }
      });
      return;
    }
    
    // Debug: log the URL being loaded
    console.log('Loading texture, URL type:', textureUrl.substring(0, 50) + '...');
    console.log('URL length:', textureUrl.length);
    console.log('Starts with data:', textureUrl.startsWith('data:'));
    
    // Load and apply texture
    this.textureLoader.load(
      textureUrl,
      // onLoad
      (loadedTexture) => {
        console.log('Texture loaded successfully!');
        loadedTexture.wrapS = THREE.RepeatWrapping;
        loadedTexture.wrapT = THREE.RepeatWrapping;
        loadedTexture.repeat.set(2, 2);
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const mat = child.material as THREE.MeshStandardMaterial;
            if (mat.map) mat.map.dispose();
            mat.map = loadedTexture.clone();
            // Set color to white so texture shows at full brightness
            mat.color.setHex(0xffffff);
            mat.needsUpdate = true;
          }
        });
      },
      undefined,
      // onError
      (err) => {
        console.error('Failed to load texture:', err);
        console.error('URL was:', textureUrl.substring(0, 100) + '...');
      }
    );
  }
  
  private renderParamsInputs(obj: EditorObject): string {
    if (!obj.data.params) return '';
    
    const params = obj.data.params;
    let html = '<div class="prop-group"><div class="prop-label">Parameters</div>';
    
    for (const [key, value] of Object.entries(params)) {
      html += `
        <div style="margin-top: 8px;">
          <div style="font-size: 11px; color: #666; margin-bottom: 4px;">${key}</div>
          <input type="number" class="prop-input param-input" data-key="${key}" value="${value}" step="0.5">
        </div>
      `;
    }
    
    html += '</div>';
    return html;
  }
  
  private updateLevelSettings(): void {
    const container = this.uiRoot.querySelector('#level-settings')!;
    const level = this.editor.getLevel();
    
    container.innerHTML = `
      <div class="prop-group">
        <div class="prop-label">Level Name</div>
        <input type="text" class="prop-input" id="level-name" value="${level.name}">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Description</div>
        <input type="text" class="prop-input" id="level-desc" value="${level.description}">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Ground Size</div>
        <input type="number" class="prop-input" id="level-ground-size" value="${level.groundSize}" step="10" min="20" max="500">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Sky Preset</div>
        <select class="prop-input" id="sky-preset">
          <option value="">Custom</option>
          ${Object.entries(SKY_PRESETS).map(([key, preset]) => 
            `<option value="${key}">${preset.icon} ${preset.name}</option>`
          ).join('')}
        </select>
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Sky Top</div>
        <input type="color" class="prop-color" id="level-sky-top" value="${level.skyColorTop || '#1e90ff'}">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Sky Bottom</div>
        <input type="color" class="prop-color" id="level-sky-bottom" value="${level.skyColorBottom || '#87ceeb'}">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Ground Preset</div>
        <select class="prop-input" id="ground-preset">
          <option value="">Custom</option>
          <option value="#555555">⬛ Asphalt</option>
          <option value="#3d5c3d">🌿 Grass</option>
          <option value="#c2b280">🏖️ Sand</option>
          <option value="#4a4a5e">🏢 Office Floor</option>
          <option value="#2d2d2d">🌑 Dark Concrete</option>
          <option value="#8B4513">🪵 Wood</option>
          <option value="#87ceeb">💧 Water</option>
        </select>
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Ground Color</div>
        <input type="color" class="prop-color" id="level-ground-color" value="${level.groundColor}">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Ground Texture</div>
        <div style="display: flex; gap: 5px;">
          <button id="set-ground-texture-btn" class="prop-btn" style="flex: 1;">
            ${level.groundTextureUrl ? '🎨 Change Texture' : '🎨 Add Texture'}
          </button>
          ${level.groundTextureUrl ? '<button id="remove-ground-texture-btn" class="prop-btn" title="Remove texture">✕</button>' : ''}
        </div>
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Spawn Point</div>
        <div class="prop-row" style="align-items: center;">
          <div class="prop-group" style="flex: 1;">
            <input type="number" class="prop-input" id="spawn-x" value="${level.spawnPoint.position[0]}" step="1" placeholder="X">
          </div>
          <div class="prop-group" style="flex: 1;">
            <input type="number" class="prop-input" id="spawn-z" value="${level.spawnPoint.position[2]}" step="1" placeholder="Z">
          </div>
          <div class="prop-group" style="flex: 1;">
            <input type="number" class="prop-input" id="spawn-rot" value="${level.spawnPoint.rotation}" step="15" title="Rotation" placeholder="Rot">
          </div>
          <button id="place-spawn-btn" class="prop-btn" title="Click to place spawn point">📍</button>
        </div>
      </div>
    `;
    
    // Bind inputs
    const bindInput = (id: string, key: keyof EditorLevelData) => {
      const input = container.querySelector(`#${id}`) as HTMLInputElement;
      input?.addEventListener('change', () => {
        let value: string | number = input.value;
        if (input.type === 'number') value = parseFloat(value);
        this.editor.setLevelProperty(key, value as any);
      });
    };
    
    bindInput('level-name', 'name');
    bindInput('level-desc', 'description');
    bindInput('level-ground-size', 'groundSize');
    bindInput('level-sky-color', 'skyColor');
    bindInput('level-ground-color', 'groundColor');
    
    // Spawn point
    const spawnX = container.querySelector('#spawn-x') as HTMLInputElement;
    const spawnZ = container.querySelector('#spawn-z') as HTMLInputElement;
    const spawnRot = container.querySelector('#spawn-rot') as HTMLInputElement;
    
    const updateSpawn = () => {
      this.editor.setSpawnPoint(
        parseFloat(spawnX.value),
        parseFloat(spawnZ.value),
        parseFloat(spawnRot.value)
      );
    };
    
    spawnX?.addEventListener('change', updateSpawn);
    spawnZ?.addEventListener('change', updateSpawn);
    spawnRot?.addEventListener('change', updateSpawn);
    
    // Place spawn button
    const placeSpawnBtn = container.querySelector('#place-spawn-btn');
    placeSpawnBtn?.addEventListener('click', () => {
      this.editor.startSpawnPlacement((x, z) => {
        spawnX.value = x.toFixed(0);
        spawnZ.value = z.toFixed(0);
        updateSpawn();
      });
      this.setStatus('Click to place spawn point...');
    });
    
    // Sky colors
    const skyTopColor = container.querySelector('#level-sky-top') as HTMLInputElement;
    const skyBottomColor = container.querySelector('#level-sky-bottom') as HTMLInputElement;
    
    skyTopColor?.addEventListener('change', () => {
      this.editor.setLevelProperty('skyColorTop', skyTopColor.value);
    });
    
    skyBottomColor?.addEventListener('change', () => {
      this.editor.setLevelProperty('skyColorBottom', skyBottomColor.value);
    });
    
    // Sky preset
    const skyPreset = container.querySelector('#sky-preset') as HTMLSelectElement;
    skyPreset?.addEventListener('change', () => {
      if (skyPreset.value && SKY_PRESETS[skyPreset.value]) {
        const preset = SKY_PRESETS[skyPreset.value];
        skyTopColor.value = preset.top;
        skyBottomColor.value = preset.bottom;
        this.editor.setLevelProperty('skyColorTop', preset.top);
        this.editor.setLevelProperty('skyColorBottom', preset.bottom);
      }
    });
    
    // Ground preset
    const groundPreset = container.querySelector('#ground-preset') as HTMLSelectElement;
    const groundColor = container.querySelector('#level-ground-color') as HTMLInputElement;
    groundPreset?.addEventListener('change', () => {
      if (groundPreset.value) {
        groundColor.value = groundPreset.value;
        this.editor.setLevelProperty('groundColor', groundPreset.value);
      }
    });
    
    // Ground texture buttons
    container.querySelector('#set-ground-texture-btn')?.addEventListener('click', () => {
      // Open texture generator and switch to a mode that applies to ground
      this.textureGeneratorUI.show(null);
      this.textureGeneratorUI.setGroundMode(true);
    });
    
    container.querySelector('#remove-ground-texture-btn')?.addEventListener('click', () => {
      this.editor.removeGroundTexture();
      this.updateLevelSettings();
    });
  }
  
  private showLoadDialog(): void {
    const dialog = this.uiRoot.querySelector('#load-dialog') as HTMLElement;
    const listContainer = dialog.querySelector('#saved-levels-list')!;
    
    const levels = EditorStorage.getSavedLevels();
    
    if (levels.length === 0) {
      listContainer.innerHTML = '<div class="no-levels">No saved levels found</div>';
    } else {
      listContainer.innerHTML = levels.map(level => `
        <div class="saved-level-item" data-id="${level.id}">
          <div class="saved-level-info">
            <div class="saved-level-name">${level.name}</div>
            <div class="saved-level-meta">
              ${level.objects.length} objects · Updated ${this.formatDate(level.updatedAt)}
            </div>
          </div>
          <div class="saved-level-actions">
            <button class="load-btn">Load</button>
            <button class="delete delete-btn">Delete</button>
          </div>
        </div>
      `).join('');
      
      // Load handlers
      listContainer.querySelectorAll('.load-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = (btn.closest('.saved-level-item') as HTMLElement).dataset.id!;
          const level = levels.find(l => l.id === id);
          if (level) {
            this.editor.loadLevel(level);
            this.updateLevelSettings();
            dialog.style.display = 'none';
            this.setStatus(`Loaded: ${level.name}`);
          }
        });
      });
      
      // Delete handlers
      listContainer.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = (btn.closest('.saved-level-item') as HTMLElement).dataset.id!;
          const level = levels.find(l => l.id === id);
          if (level && confirm(`Delete "${level.name}"?`)) {
            EditorStorage.deleteLevel(id);
            this.showLoadDialog(); // Refresh
          }
        });
      });
    }
    
    dialog.style.display = 'flex';
  }
  
  private formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  private setStatus(text: string): void {
    const statusText = this.statusBar.querySelector('#status-text');
    if (statusText) statusText.textContent = text;
  }
  
  private showToast(message: string, isError: boolean = false): void {
    const toast = this.uiRoot.querySelector('#editor-toast') as HTMLElement;
    if (!toast) return;
    
    const icon = toast.querySelector('.toast-icon') as HTMLElement;
    const messageEl = toast.querySelector('.toast-message') as HTMLElement;
    
    if (icon) icon.textContent = isError ? '✗' : '✓';
    if (messageEl) messageEl.textContent = message;
    
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    
    // Hide after 2 seconds
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }
  
  loadLevel(level: EditorLevelData): void {
    this.editor.loadLevel(level);
    this.updatePropertiesPanel(null);
    this.updateObjectCount();
    this.setStatus(`Loaded: ${level.name}`);
  }
  
  dispose(): void {
    this.editor.dispose();
    this.uiRoot.remove();
  }
  
  getEditor(): LevelEditor {
    return this.editor;
  }
}
