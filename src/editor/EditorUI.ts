/**
 * Editor UI
 * Full HTML/CSS interface for the level editor
 */

import { LevelEditor, EditorObject } from './LevelEditor';
import { EditorStorage, EditorLevelData, OBJECT_CATEGORIES } from './EditorStorage';

export interface EditorUICallbacks {
  onExit?: () => void;
  onPlayTest?: (level: EditorLevelData) => void;
}

export class EditorUI {
  private editor: LevelEditor;
  private callbacks: EditorUICallbacks;
  
  private uiRoot: HTMLElement;
  private palettePanel: HTMLElement;
  private toolbar: HTMLElement;
  private statusBar: HTMLElement;
  
  private selectedCategory: number = 0;
  
  constructor(container: HTMLElement, callbacks: EditorUICallbacks = {}) {
    this.callbacks = callbacks;
    
    // Create main layout
    this.uiRoot = document.createElement('div');
    this.uiRoot.id = 'editor-ui';
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
      onLevelChanged: () => this.onLevelChanged()
    });
    
    // Setup UI interactions
    this.setupToolbar();
    this.setupPalette();
    this.updatePropertiesPanel(null);
    this.updateLevelSettings();
    
    // Check for autosave
    const autosave = EditorStorage.loadAutosave();
    if (autosave) {
      if (confirm('Found an autosaved level. Would you like to restore it?')) {
        this.editor.loadLevel(autosave);
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
        </div>
      </div>
      
      <!-- File input (hidden) -->
      <input type="file" id="import-input" accept=".json" style="display: none;">
      
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
        this.setStatus('Level saved!');
      } else {
        this.setStatus('Failed to save level');
      }
    });
    
    // Load
    this.toolbar.querySelector('#btn-load')?.addEventListener('click', () => {
      this.showLoadDialog();
    });
    
    // Export
    this.toolbar.querySelector('#btn-export')?.addEventListener('click', () => {
      this.editor.exportLevel();
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
          this.setStatus('Level imported!');
        } else {
          this.setStatus('Failed to import level');
        }
        importInput.value = '';
      }
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
  }
  
  private onObjectsChanged(): void {
    const level = this.editor.getLevel();
    this.setStatus(`${level.objects.length} objects`);
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
        <div class="prop-label">Sky Color</div>
        <input type="color" class="prop-color" id="level-sky-color" value="${level.skyColor}">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Ground Color</div>
        <input type="color" class="prop-color" id="level-ground-color" value="${level.groundColor}">
      </div>
      
      <div class="prop-group">
        <div class="prop-label">Spawn Point</div>
        <div class="prop-row">
          <div class="prop-group">
            <input type="number" class="prop-input" id="spawn-x" value="${level.spawnPoint.position[0]}" step="1">
          </div>
          <div class="prop-group">
            <input type="number" class="prop-input" id="spawn-z" value="${level.spawnPoint.position[2]}" step="1">
          </div>
          <div class="prop-group">
            <input type="number" class="prop-input" id="spawn-rot" value="${level.spawnPoint.rotation}" step="15" title="Rotation">
          </div>
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
  
  loadLevel(level: EditorLevelData): void {
    this.editor.loadLevel(level);
    this.updatePropertyPanel();
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
