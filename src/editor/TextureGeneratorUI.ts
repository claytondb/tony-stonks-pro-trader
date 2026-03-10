/**
 * Texture Generator UI
 * Modal interface for AI texture generation in the level editor
 */

import * as THREE from 'three';
import { textureGenerator, GeneratedTexture, TextureGeneratorConfig } from './TextureGenerator';
import { EditorObject } from './LevelEditor';

export interface TextureGeneratorUICallbacks {
  onTextureApplied?: (object: EditorObject, textureUrl: string) => void;
  onSkyboxApplied?: (skyboxUrl: string) => void;
  onSkyboxRemoved?: () => void;
  onGroundTextureApplied?: (textureUrl: string) => void;
}

export class TextureGeneratorUI {
  private container: HTMLElement;
  private modal: HTMLElement | null = null;
  private callbacks: TextureGeneratorUICallbacks;
  private selectedObject: EditorObject | null = null;
  private textureLoader: THREE.TextureLoader;
  private isGenerating: boolean = false;
  private groundMode: boolean = false;

  constructor(container: HTMLElement, callbacks: TextureGeneratorUICallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.textureLoader = new THREE.TextureLoader();
    this.injectStyles();
  }

  private injectStyles(): void {
    if (document.getElementById('texture-gen-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'texture-gen-styles';
    style.textContent = `
      .texture-gen-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
        font-family: 'Kanit', sans-serif;
      }
      
      .texture-gen-content {
        width: 700px;
        max-width: 95vw;
        max-height: 90vh;
        background: #1a1a2e;
        border: 2px solid #4a4a7e;
        border-radius: 12px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      
      .texture-gen-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 15px 20px;
        background: #2a2a4e;
        border-bottom: 1px solid #3a3a6e;
      }
      
      .texture-gen-header h2 {
        margin: 0;
        font-size: 18px;
        color: #fff;
      }
      
      .texture-gen-close {
        background: transparent;
        border: none;
        color: #888;
        font-size: 24px;
        cursor: pointer;
        padding: 0 5px;
      }
      
      .texture-gen-close:hover {
        color: #fff;
      }
      
      .texture-gen-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }
      
      .texture-gen-section {
        margin-bottom: 20px;
      }
      
      .texture-gen-section h3 {
        font-size: 14px;
        color: #888;
        margin: 0 0 10px 0;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      
      .texture-gen-input {
        width: 100%;
        padding: 12px 15px;
        font-size: 14px;
        font-family: inherit;
        color: #fff;
        background: #22223a;
        border: 1px solid #3a3a6e;
        border-radius: 6px;
        box-sizing: border-box;
        resize: none;
      }
      
      .texture-gen-input:focus {
        outline: none;
        border-color: #5a9a5a;
      }
      
      .texture-gen-options {
        display: flex;
        gap: 15px;
        flex-wrap: wrap;
      }
      
      .texture-gen-option {
        flex: 1;
        min-width: 120px;
      }
      
      .texture-gen-option label {
        display: block;
        font-size: 12px;
        color: #888;
        margin-bottom: 5px;
      }
      
      .texture-gen-option select,
      .texture-gen-option input {
        width: 100%;
        padding: 8px 10px;
        font-size: 13px;
        font-family: inherit;
        color: #fff;
        background: #22223a;
        border: 1px solid #3a3a6e;
        border-radius: 4px;
      }
      
      .texture-gen-btn {
        padding: 12px 24px;
        font-size: 14px;
        font-family: inherit;
        font-weight: 600;
        color: #fff;
        background: linear-gradient(135deg, #4a7a4a, #3a5a3a);
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .texture-gen-btn:hover {
        background: linear-gradient(135deg, #5a9a5a, #4a7a4a);
        transform: translateY(-1px);
      }
      
      .texture-gen-btn:disabled {
        background: #3a3a5e;
        cursor: not-allowed;
        transform: none;
      }
      
      .texture-gen-btn.secondary {
        background: #3a3a5e;
      }
      
      .texture-gen-btn.secondary:hover {
        background: #4a4a7e;
      }
      
      .texture-gen-preview {
        display: flex;
        gap: 20px;
        margin-top: 15px;
      }
      
      .texture-gen-preview-box {
        width: 200px;
        height: 200px;
        background: #22223a;
        border: 2px dashed #3a3a6e;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #666;
        font-size: 13px;
        overflow: hidden;
      }
      
      .texture-gen-preview-box img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      
      .texture-gen-preview-actions {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      
      .texture-gen-history {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        gap: 10px;
        max-height: 200px;
        overflow-y: auto;
        padding: 5px;
      }
      
      .texture-gen-history-item {
        aspect-ratio: 1;
        border-radius: 6px;
        overflow: hidden;
        cursor: pointer;
        border: 2px solid transparent;
        transition: all 0.15s;
      }
      
      .texture-gen-history-item:hover {
        border-color: #5a9a5a;
        transform: scale(1.05);
      }
      
      .texture-gen-history-item img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      
      .texture-gen-history-item .delete-btn {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 20px;
        height: 20px;
        background: rgba(200, 50, 50, 0.9);
        border: none;
        border-radius: 50%;
        color: white;
        font-size: 12px;
        cursor: pointer;
        display: none;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
      
      .texture-gen-history-item:hover .delete-btn {
        display: flex;
      }
      
      .texture-gen-history-item {
        position: relative;
      }
      
      .texture-gen-loading {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 15px;
        background: #2a2a4e;
        border-radius: 6px;
        margin-top: 15px;
      }
      
      .texture-gen-spinner {
        width: 24px;
        height: 24px;
        border: 3px solid #3a3a6e;
        border-top-color: #5a9a5a;
        border-radius: 50%;
        animation: texture-spin 1s linear infinite;
      }
      
      @keyframes texture-spin {
        to { transform: rotate(360deg); }
      }
      
      .texture-gen-config {
        padding: 15px;
        background: #22223a;
        border-radius: 6px;
        margin-bottom: 20px;
      }
      
      .texture-gen-config-row {
        display: flex;
        gap: 10px;
        margin-bottom: 10px;
      }
      
      .texture-gen-config-row:last-child {
        margin-bottom: 0;
      }
      
      .texture-gen-presets {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      
      .texture-gen-preset {
        padding: 6px 12px;
        font-size: 12px;
        background: #2a2a4e;
        border: 1px solid #3a3a6e;
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.15s;
      }
      
      .texture-gen-preset:hover {
        background: #3a3a5e;
        border-color: #5a5a8e;
      }
      
      .texture-gen-error {
        padding: 12px 15px;
        background: #5a3a3a;
        border: 1px solid #7a4a4a;
        border-radius: 6px;
        color: #ff8888;
        margin-top: 10px;
      }

      .texture-gen-tabs {
        display: flex;
        gap: 5px;
        margin-bottom: 15px;
        border-bottom: 1px solid #3a3a6e;
        padding-bottom: 10px;
      }

      .texture-gen-tab {
        padding: 8px 16px;
        font-size: 13px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 4px 4px 0 0;
        color: #888;
        cursor: pointer;
        transition: all 0.15s;
      }

      .texture-gen-tab:hover {
        color: #fff;
      }

      .texture-gen-tab.active {
        background: #2a2a4e;
        border-color: #3a3a6e;
        border-bottom-color: transparent;
        color: #fff;
      }

      .texture-gen-tab-content {
        display: none;
      }

      .texture-gen-tab-content.active {
        display: block;
      }
    `;
    document.head.appendChild(style);
  }

  show(selectedObject: EditorObject | null = null): void {
    this.selectedObject = selectedObject;
    this.groundMode = false; // Reset ground mode
    
    if (this.modal) {
      this.modal.remove();
    }
    
    this.modal = document.createElement('div');
    this.modal.className = 'texture-gen-modal';
    this.modal.innerHTML = this.getModalHTML();
    this.container.appendChild(this.modal);
    
    this.setupEventListeners();
    this.updateHistoryDisplay();
    
    // Check if configured
    if (!textureGenerator.isConfigured()) {
      this.showConfigSection();
    }
  }
  
  /**
   * Set ground mode - changes apply button to apply texture to ground
   */
  setGroundMode(enabled: boolean): void {
    this.groundMode = enabled;
    if (this.modal) {
      const applyBtn = this.modal.querySelector('#apply-btn') as HTMLButtonElement;
      if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.textContent = enabled ? '✓ Apply to Ground' : (this.selectedObject ? '✓ Apply to Selected Object' : '⚠️ No Object Selected');
      }
    }
  }

  hide(): void {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  private getModalHTML(): string {
    const config = textureGenerator.getConfig();
    const hasObject = this.selectedObject !== null;
    
    return `
      <div class="texture-gen-content">
        <div class="texture-gen-header">
          <h2>🎨 AI Texture Generator</h2>
          <button class="texture-gen-close">✕</button>
        </div>
        
        <div class="texture-gen-body">
          <!-- Config Section -->
          <div class="texture-gen-section texture-gen-config" id="config-section" style="display: ${config ? 'none' : 'block'}">
            <h3>⚙️ API Configuration</h3>
            <p style="color: #888; font-size: 13px; margin-bottom: 15px;">
              Configure your AI provider to generate textures. Get an API key from your preferred provider.
            </p>
            <div class="texture-gen-config-row">
              <div class="texture-gen-option" style="flex: 1;">
                <label>Provider</label>
                <select id="config-provider">
                  <option value="replicate" ${config?.provider === 'replicate' ? 'selected' : ''}>Replicate (Stable Diffusion)</option>
                  <option value="openai" ${config?.provider === 'openai' ? 'selected' : ''}>OpenAI (DALL-E 3)</option>
                  <option value="stability" ${config?.provider === 'stability' ? 'selected' : ''}>Stability AI</option>
                </select>
              </div>
            </div>
            <div class="texture-gen-config-row">
              <div class="texture-gen-option" style="flex: 1;">
                <label>API Key</label>
                <input type="password" id="config-api-key" placeholder="Enter your API key..." value="${config?.apiKey || ''}">
              </div>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 15px;">
              <button class="texture-gen-btn" id="save-config-btn">Save Configuration</button>
              ${config ? '<button class="texture-gen-btn secondary" id="cancel-config-btn">Cancel</button>' : ''}
            </div>
          </div>
          
          <!-- Main Generator Section -->
          <div id="generator-section" style="display: ${config ? 'block' : 'none'}">
            <!-- Tabs -->
            <div class="texture-gen-tabs">
              <button class="texture-gen-tab active" data-tab="generate">Generate New</button>
              <button class="texture-gen-tab" data-tab="skybox">🌅 Skybox</button>
              <button class="texture-gen-tab" data-tab="history">History</button>
              <button class="texture-gen-tab" data-tab="settings">Settings</button>
            </div>

            <!-- Generate Tab -->
            <div class="texture-gen-tab-content active" id="tab-generate">
              <div class="texture-gen-section">
                <h3>Describe Your Texture</h3>
                <textarea class="texture-gen-input" id="texture-prompt" rows="3" 
                  placeholder="e.g., rusty metal plates, cracked concrete, wooden planks, grass lawn, brick wall..."></textarea>
                
                <div class="texture-gen-presets">
                  <span style="color: #666; font-size: 12px; margin-right: 5px;">Quick:</span>
                  <button class="texture-gen-preset" data-prompt="concrete with cracks and stains">Concrete</button>
                  <button class="texture-gen-preset" data-prompt="rusty corrugated metal">Rusty Metal</button>
                  <button class="texture-gen-preset" data-prompt="wooden planks with grain">Wood</button>
                  <button class="texture-gen-preset" data-prompt="red brick wall">Brick</button>
                  <button class="texture-gen-preset" data-prompt="green grass lawn">Grass</button>
                  <button class="texture-gen-preset" data-prompt="sandy desert ground">Sand</button>
                  <button class="texture-gen-preset" data-prompt="marble stone floor">Marble</button>
                  <button class="texture-gen-preset" data-prompt="office carpet tiles">Carpet</button>
                  <button class="texture-gen-preset" data-prompt="asphalt road with cracks">Asphalt</button>
                  <button class="texture-gen-preset" data-prompt="graffiti covered wall">Graffiti</button>
                </div>
              </div>
              
              <div class="texture-gen-section">
                <h3>Options</h3>
                <div class="texture-gen-options">
                  <div class="texture-gen-option">
                    <label>Style</label>
                    <select id="texture-style">
                      <option value="realistic">Realistic</option>
                      <option value="stylized">Stylized / Game Art</option>
                      <option value="painterly">Painterly</option>
                      <option value="pixel">Pixel Art</option>
                    </select>
                  </div>
                  <div class="texture-gen-option">
                    <label>Size</label>
                    <select id="texture-size">
                      <option value="512">512 × 512</option>
                      <option value="1024" selected>1024 × 1024</option>
                    </select>
                  </div>
                  <div class="texture-gen-option">
                    <label>Seamless</label>
                    <select id="texture-seamless">
                      <option value="yes" selected>Yes (Tileable)</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div class="texture-gen-section">
                <button class="texture-gen-btn" id="generate-btn" style="width: 100%;">
                  ✨ Generate Texture
                </button>
                
                <div id="loading-indicator" style="display: none;" class="texture-gen-loading">
                  <div class="texture-gen-spinner"></div>
                  <span>Generating texture... This may take 10-30 seconds</span>
                </div>
                
                <div id="error-display" class="texture-gen-error" style="display: none;"></div>
              </div>
              
              <div class="texture-gen-section" id="preview-section" style="display: none;">
                <h3>Preview</h3>
                <div class="texture-gen-preview">
                  <div class="texture-gen-preview-box" id="preview-box">
                    <span>No texture generated</span>
                  </div>
                  <div class="texture-gen-preview-actions">
                    <button class="texture-gen-btn" id="apply-btn" ${!hasObject ? 'disabled title="Select an object first"' : ''}>
                      ${hasObject ? '✓ Apply to Selected Object' : '⚠️ No Object Selected'}
                    </button>
                    <button class="texture-gen-btn secondary" id="download-btn">⬇️ Download</button>
                    <button class="texture-gen-btn secondary" id="regenerate-btn">🔄 Regenerate</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Skybox Tab -->
            <div class="texture-gen-tab-content" id="tab-skybox">
              <div class="texture-gen-section">
                <h3>🌅 Generate Skybox</h3>
                <p style="font-size: 12px; color: #888; margin-bottom: 15px;">
                  Generate a panoramic sky image to use as the scene background.
                </p>
                <textarea class="texture-gen-input" id="skybox-prompt" rows="2" 
                  placeholder="e.g., sunset over city skyline, night sky with stars, cloudy daytime sky..."></textarea>
                
                <div class="texture-gen-presets" style="margin-top: 10px;">
                  <span style="color: #666; font-size: 12px; margin-right: 5px;">Quick:</span>
                  <button class="texture-gen-preset skybox-preset" data-prompt="blue sky with fluffy white clouds, sunny day">Sunny Day</button>
                  <button class="texture-gen-preset skybox-preset" data-prompt="dramatic sunset with orange and purple clouds over city">Sunset</button>
                  <button class="texture-gen-preset skybox-preset" data-prompt="night sky with stars and moon, dark blue">Night</button>
                  <button class="texture-gen-preset skybox-preset" data-prompt="overcast gray cloudy sky, moody">Overcast</button>
                  <button class="texture-gen-preset skybox-preset" data-prompt="golden hour warm light, dramatic clouds">Golden Hour</button>
                  <button class="texture-gen-preset skybox-preset" data-prompt="pink and purple vaporwave sunset, aesthetic">Vaporwave</button>
                </div>
              </div>
              
              <div class="texture-gen-section">
                <button class="texture-gen-btn" id="generate-skybox-btn" style="width: 100%;">
                  ✨ Generate Skybox
                </button>
                
                <div id="skybox-loading" style="display: none;" class="texture-gen-loading">
                  <div class="texture-gen-spinner"></div>
                  <span>Generating skybox...</span>
                </div>
                
                <div id="skybox-error" class="texture-gen-error" style="display: none;"></div>
              </div>
              
              <div class="texture-gen-section" id="skybox-preview-section" style="display: none;">
                <h3>Preview</h3>
                <div class="texture-gen-preview">
                  <div class="texture-gen-preview-box" id="skybox-preview-box" style="width: 300px;">
                    <span>No skybox generated</span>
                  </div>
                  <div class="texture-gen-preview-actions">
                    <button class="texture-gen-btn" id="apply-skybox-btn">✓ Apply to Scene</button>
                    <button class="texture-gen-btn secondary" id="download-skybox-btn">⬇️ Download</button>
                  </div>
                </div>
              </div>
              
              <div class="texture-gen-section">
                <h3>Current Skybox</h3>
                <div style="display: flex; gap: 10px;">
                  <button class="texture-gen-btn secondary" id="remove-skybox-btn">🗑️ Remove Skybox</button>
                </div>
              </div>
            </div>

            <!-- History Tab -->
            <div class="texture-gen-tab-content" id="tab-history">
              <div class="texture-gen-section">
                <h3>Recent Textures</h3>
                <div class="texture-gen-history" id="history-grid">
                  <span style="color: #666;">No textures generated yet</span>
                </div>
              </div>
              <div class="texture-gen-section">
                <h3>Texture Packs</h3>
                <p style="font-size: 12px; color: #888; margin-bottom: 10px;">
                  Export all your textures as a pack to share or backup, or import packs from other projects.
                </p>
                <div style="display: flex; gap: 10px;">
                  <button class="texture-gen-btn secondary" id="export-pack-btn">📤 Export Pack</button>
                  <button class="texture-gen-btn secondary" id="import-pack-btn">📥 Import Pack</button>
                </div>
                <input type="file" id="pack-import-input" accept=".json" style="display: none;">
              </div>
            </div>

            <!-- Settings Tab -->
            <div class="texture-gen-tab-content" id="tab-settings">
              <div class="texture-gen-section">
                <h3>API Settings</h3>
                <button class="texture-gen-btn secondary" id="show-config-btn">Change API Configuration</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    if (!this.modal) return;

    // Close button
    this.modal.querySelector('.texture-gen-close')?.addEventListener('click', () => this.hide());
    
    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });

    // Tabs
    this.modal.querySelectorAll('.texture-gen-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab')!;
        this.switchTab(tabName);
      });
    });

    // Preset buttons
    this.modal.querySelectorAll('.texture-gen-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-prompt')!;
        const input = this.modal!.querySelector('#texture-prompt') as HTMLTextAreaElement;
        input.value = prompt;
      });
    });

    // Generate button
    this.modal.querySelector('#generate-btn')?.addEventListener('click', () => this.generate());

    // Regenerate button
    this.modal.querySelector('#regenerate-btn')?.addEventListener('click', () => this.generate());

    // Apply button
    this.modal.querySelector('#apply-btn')?.addEventListener('click', () => this.applyTexture());

    // Download button
    this.modal.querySelector('#download-btn')?.addEventListener('click', () => this.downloadCurrentTexture());

    // Config save
    this.modal.querySelector('#save-config-btn')?.addEventListener('click', () => this.saveConfig());
    
    // Config cancel
    this.modal.querySelector('#cancel-config-btn')?.addEventListener('click', () => this.hideConfigSection());

    // Show config
    this.modal.querySelector('#show-config-btn')?.addEventListener('click', () => this.showConfigSection());

    // Texture pack export/import
    this.modal.querySelector('#export-pack-btn')?.addEventListener('click', () => {
      textureGenerator.exportTexturePack('my-textures');
    });

    const packImportInput = this.modal.querySelector('#pack-import-input') as HTMLInputElement;
    this.modal.querySelector('#import-pack-btn')?.addEventListener('click', () => {
      packImportInput?.click();
    });

    packImportInput?.addEventListener('change', async () => {
      const file = packImportInput.files?.[0];
      if (file) {
        try {
          const count = await textureGenerator.importTexturePack(file);
          this.updateHistoryDisplay();
          alert(`Imported ${count} new textures!`);
        } catch (e: any) {
          alert('Failed to import: ' + e.message);
        }
        packImportInput.value = '';
      }
    });

    // Skybox preset buttons
    this.modal.querySelectorAll('.skybox-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-prompt')!;
        const input = this.modal!.querySelector('#skybox-prompt') as HTMLTextAreaElement;
        input.value = prompt;
      });
    });

    // Skybox generate button
    this.modal.querySelector('#generate-skybox-btn')?.addEventListener('click', () => this.generateSkybox());

    // Skybox apply button
    this.modal.querySelector('#apply-skybox-btn')?.addEventListener('click', () => this.applySkybox());

    // Skybox download button
    this.modal.querySelector('#download-skybox-btn')?.addEventListener('click', () => this.downloadCurrentSkybox());

    // Skybox remove button
    this.modal.querySelector('#remove-skybox-btn')?.addEventListener('click', () => {
      this.callbacks.onSkyboxRemoved?.();
      this.hide();
    });
  }

  private switchTab(tabName: string): void {
    if (!this.modal) return;

    // Update tab buttons
    this.modal.querySelectorAll('.texture-gen-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
    });

    // Update tab content
    this.modal.querySelectorAll('.texture-gen-tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
  }

  private showConfigSection(): void {
    if (!this.modal) return;
    const configSection = this.modal.querySelector('#config-section') as HTMLElement;
    const generatorSection = this.modal.querySelector('#generator-section') as HTMLElement;
    if (configSection) configSection.style.display = 'block';
    if (generatorSection) generatorSection.style.display = 'none';
  }

  private hideConfigSection(): void {
    if (!this.modal) return;
    const configSection = this.modal.querySelector('#config-section') as HTMLElement;
    const generatorSection = this.modal.querySelector('#generator-section') as HTMLElement;
    if (configSection) configSection.style.display = 'none';
    if (generatorSection) generatorSection.style.display = 'block';
  }

  private saveConfig(): void {
    if (!this.modal) return;

    const provider = (this.modal.querySelector('#config-provider') as HTMLSelectElement).value as TextureGeneratorConfig['provider'];
    const apiKey = (this.modal.querySelector('#config-api-key') as HTMLInputElement).value;

    if (!apiKey.trim()) {
      this.showError('Please enter an API key');
      return;
    }

    textureGenerator.saveConfig({ provider, apiKey });
    this.hideConfigSection();
  }

  private currentTexture: GeneratedTexture | null = null;
  private currentSkybox: GeneratedTexture | null = null;

  private async generate(): Promise<void> {
    if (!this.modal || this.isGenerating) return;

    const prompt = (this.modal.querySelector('#texture-prompt') as HTMLTextAreaElement).value.trim();
    if (!prompt) {
      this.showError('Please enter a texture description');
      return;
    }

    const style = (this.modal.querySelector('#texture-style') as HTMLSelectElement).value as any;
    const size = parseInt((this.modal.querySelector('#texture-size') as HTMLSelectElement).value);
    const seamless = (this.modal.querySelector('#texture-seamless') as HTMLSelectElement).value === 'yes';

    this.isGenerating = true;
    this.showLoading(true);
    this.hideError();

    try {
      const texture = await textureGenerator.generate({
        prompt,
        width: size,
        height: size,
        seamless,
        style
      });

      this.currentTexture = texture;
      this.showPreview(texture);
      this.updateHistoryDisplay();
    } catch (error: any) {
      this.showError(error.message || 'Failed to generate texture');
    } finally {
      this.isGenerating = false;
      this.showLoading(false);
    }
  }

  private showLoading(show: boolean): void {
    if (!this.modal) return;
    const indicator = this.modal.querySelector('#loading-indicator') as HTMLElement;
    const generateBtn = this.modal.querySelector('#generate-btn') as HTMLButtonElement;
    
    if (indicator) indicator.style.display = show ? 'flex' : 'none';
    if (generateBtn) generateBtn.disabled = show;
  }

  private showError(message: string): void {
    if (!this.modal) return;
    const errorDisplay = this.modal.querySelector('#error-display') as HTMLElement;
    if (errorDisplay) {
      errorDisplay.textContent = message;
      errorDisplay.style.display = 'block';
    }
  }

  private hideError(): void {
    if (!this.modal) return;
    const errorDisplay = this.modal.querySelector('#error-display') as HTMLElement;
    if (errorDisplay) errorDisplay.style.display = 'none';
  }

  private showPreview(texture: GeneratedTexture): void {
    if (!this.modal) return;
    
    const previewSection = this.modal.querySelector('#preview-section') as HTMLElement;
    const previewBox = this.modal.querySelector('#preview-box') as HTMLElement;
    
    if (previewSection) previewSection.style.display = 'block';
    if (previewBox) {
      previewBox.innerHTML = `<img src="${texture.url}" alt="Generated texture">`;
    }
  }

  private async applyTexture(): Promise<void> {
    if (!this.currentTexture) return;
    
    // Handle ground mode
    if (this.groundMode) {
      try {
        const dataUrl = await textureGenerator.urlToDataUrl(this.currentTexture.url);
        this.callbacks.onGroundTextureApplied?.(dataUrl);
        this.hide();
      } catch (error: any) {
        this.showError('Failed to apply ground texture: ' + error.message);
      }
      return;
    }
    
    // Normal object mode
    if (!this.selectedObject) return;

    try {
      // Convert URL to data URL for persistence
      const dataUrl = await textureGenerator.urlToDataUrl(this.currentTexture.url);
      
      // Load texture with Three.js
      this.textureLoader.load(
        dataUrl,
        // onLoad
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(2, 2);
          texture.colorSpace = THREE.SRGBColorSpace;
          
          // Apply to object
          this.selectedObject!.mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const material = child.material as THREE.MeshStandardMaterial;
              if (material.map) {
                material.map.dispose();
              }
              material.map = texture;
              // Set color to white so texture shows at full brightness
              material.color.setHex(0xffffff);
              material.needsUpdate = true;
            }
          });

          // Store texture URL in object data for persistence
          if (!this.selectedObject!.data.params) {
            this.selectedObject!.data.params = {};
          }
          this.selectedObject!.data.params.textureUrl = dataUrl;

          this.callbacks.onTextureApplied?.(this.selectedObject!, dataUrl);
          
          this.hide();
        },
        undefined,
        // onError
        (err) => {
          console.error('Texture load error:', err);
          this.showError('Failed to load texture');
        }
      );
    } catch (error: any) {
      this.showError('Failed to apply texture: ' + error.message);
    }
  }

  private async downloadCurrentTexture(): Promise<void> {
    if (!this.currentTexture) return;
    await textureGenerator.downloadTexture(this.currentTexture);
  }

  private updateHistoryDisplay(): void {
    if (!this.modal) return;
    
    const historyGrid = this.modal.querySelector('#history-grid') as HTMLElement;
    const history = textureGenerator.getHistory();
    
    if (history.length === 0) {
      historyGrid.innerHTML = '<span style="color: #666;">No textures generated yet</span>';
      return;
    }

    historyGrid.innerHTML = history.map((tex, i) => `
      <div class="texture-gen-history-item" data-index="${i}" title="${tex.prompt}">
        <img src="${tex.url}" alt="${tex.prompt}">
        <button class="delete-btn" data-delete-index="${i}" title="Delete">×</button>
      </div>
    `).join('');

    // Click handlers for history items
    historyGrid.querySelectorAll('.texture-gen-history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Ignore if clicking delete button
        if ((e.target as HTMLElement).classList.contains('delete-btn')) return;
        
        const index = parseInt(item.getAttribute('data-index')!);
        const texture = history[index];
        this.currentTexture = texture;
        this.showPreview(texture);
        this.switchTab('generate');
      });
    });
    
    // Delete button handlers
    historyGrid.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.getAttribute('data-delete-index')!);
        textureGenerator.deleteFromHistory(index);
        this.updateHistoryDisplay();
      });
    });
  }

  setSelectedObject(obj: EditorObject | null): void {
    this.selectedObject = obj;
    
    if (this.modal) {
      const applyBtn = this.modal.querySelector('#apply-btn') as HTMLButtonElement;
      if (applyBtn) {
        applyBtn.disabled = !obj;
        applyBtn.textContent = obj ? '✓ Apply to Selected Object' : '⚠️ No Object Selected';
      }
    }
  }

  private async generateSkybox(): Promise<void> {
    if (!this.modal || this.isGenerating) return;

    const prompt = (this.modal.querySelector('#skybox-prompt') as HTMLTextAreaElement).value.trim();
    if (!prompt) {
      this.showSkyboxError('Please enter a skybox description');
      return;
    }

    this.isGenerating = true;
    this.showSkyboxLoading(true);
    this.hideSkyboxError();

    try {
      // Generate a panoramic/equirectangular style image for skybox
      const skyboxPrompt = `${prompt}, panoramic sky background, equirectangular projection, 360 degree view, seamless horizon`;
      
      const texture = await textureGenerator.generate({
        prompt: skyboxPrompt,
        width: 1024,
        height: 512, // 2:1 aspect for equirectangular
        seamless: true,
        style: 'realistic'
      });

      this.currentSkybox = texture;
      this.showSkyboxPreview(texture);
    } catch (error: any) {
      this.showSkyboxError(error.message || 'Failed to generate skybox');
    } finally {
      this.isGenerating = false;
      this.showSkyboxLoading(false);
    }
  }

  private showSkyboxLoading(show: boolean): void {
    if (!this.modal) return;
    const indicator = this.modal.querySelector('#skybox-loading') as HTMLElement;
    const generateBtn = this.modal.querySelector('#generate-skybox-btn') as HTMLButtonElement;
    
    if (indicator) indicator.style.display = show ? 'flex' : 'none';
    if (generateBtn) generateBtn.disabled = show;
  }

  private showSkyboxError(message: string): void {
    if (!this.modal) return;
    const errorDisplay = this.modal.querySelector('#skybox-error') as HTMLElement;
    if (errorDisplay) {
      errorDisplay.textContent = message;
      errorDisplay.style.display = 'block';
    }
  }

  private hideSkyboxError(): void {
    if (!this.modal) return;
    const errorDisplay = this.modal.querySelector('#skybox-error') as HTMLElement;
    if (errorDisplay) errorDisplay.style.display = 'none';
  }

  private showSkyboxPreview(texture: GeneratedTexture): void {
    if (!this.modal) return;
    
    const previewSection = this.modal.querySelector('#skybox-preview-section') as HTMLElement;
    const previewBox = this.modal.querySelector('#skybox-preview-box') as HTMLElement;
    
    if (previewSection) previewSection.style.display = 'block';
    if (previewBox) {
      previewBox.innerHTML = `<img src="${texture.url}" alt="Generated skybox" style="object-fit: contain;">`;
    }
  }

  private async applySkybox(): Promise<void> {
    if (!this.currentSkybox) return;

    try {
      const dataUrl = await textureGenerator.urlToDataUrl(this.currentSkybox.url);
      this.callbacks.onSkyboxApplied?.(dataUrl);
      this.hide();
    } catch (error: any) {
      this.showSkyboxError('Failed to apply skybox: ' + error.message);
    }
  }

  private async downloadCurrentSkybox(): Promise<void> {
    if (!this.currentSkybox) return;
    await textureGenerator.downloadTexture(this.currentSkybox, 'skybox.png');
  }
}
