/**
 * AI Texture Generator
 * Generates seamless textures using AI APIs
 */

export interface TextureGeneratorConfig {
  provider: 'replicate' | 'openai' | 'stability';
  apiKey: string;
}

export interface GenerateOptions {
  prompt: string;
  width?: number;
  height?: number;
  seamless?: boolean;
  style?: 'realistic' | 'stylized' | 'pixel' | 'painterly';
}

export interface GeneratedTexture {
  url: string;
  prompt: string;
  timestamp: number;
  width: number;
  height: number;
}

// Storage key for generated textures
const TEXTURE_STORAGE_KEY = 'tony-stonks-generated-textures';
const CONFIG_STORAGE_KEY = 'tony-stonks-texture-gen-config';

export class TextureGenerator {
  private config: TextureGeneratorConfig | null = null;

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (saved) {
        this.config = JSON.parse(saved);
      }
    } catch {
      console.warn('Failed to load texture generator config');
    }
  }

  saveConfig(config: TextureGeneratorConfig): void {
    this.config = config;
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }

  getConfig(): TextureGeneratorConfig | null {
    return this.config;
  }

  isConfigured(): boolean {
    return this.config !== null && this.config.apiKey.length > 0;
  }

  /**
   * Generate a texture using the configured AI provider
   */
  async generate(options: GenerateOptions): Promise<GeneratedTexture> {
    if (!this.config) {
      throw new Error('Texture generator not configured. Please set up API key.');
    }

    const width = options.width || 512;
    const height = options.height || 512;
    
    // Build the prompt with texture-specific additions
    let fullPrompt = options.prompt;
    
    // Add seamless modifier if requested
    if (options.seamless !== false) {
      fullPrompt = `seamless tileable texture of ${fullPrompt}, repeating pattern, no borders`;
    }
    
    // Add style modifier
    switch (options.style) {
      case 'realistic':
        fullPrompt += ', photorealistic, high detail, 4k texture';
        break;
      case 'stylized':
        fullPrompt += ', stylized, game art style, vibrant colors';
        break;
      case 'pixel':
        fullPrompt += ', pixel art, retro game style, 16-bit';
        break;
      case 'painterly':
        fullPrompt += ', hand-painted, artistic, brush strokes';
        break;
    }

    let imageUrl: string;

    switch (this.config.provider) {
      case 'replicate':
        imageUrl = await this.generateWithReplicate(fullPrompt, width, height);
        break;
      case 'openai':
        imageUrl = await this.generateWithOpenAI(fullPrompt, width, height);
        break;
      case 'stability':
        imageUrl = await this.generateWithStability(fullPrompt, width, height);
        break;
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }

    // Convert to data URL if it's not already (to avoid CORS issues later)
    let finalUrl = imageUrl;
    if (!imageUrl.startsWith('data:')) {
      try {
        finalUrl = await this.urlToDataUrl(imageUrl);
      } catch (e) {
        console.warn('Could not convert to data URL, using original:', e);
        // Keep original URL as fallback
      }
    }

    const texture: GeneratedTexture = {
      url: finalUrl,
      prompt: options.prompt,
      timestamp: Date.now(),
      width,
      height
    };

    // Save to history
    this.saveToHistory(texture);

    return texture;
  }

  private async generateWithReplicate(prompt: string, width: number, height: number): Promise<string> {
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.config!.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // SDXL model for high quality textures
        version: 'ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4',
        input: {
          prompt,
          width,
          height,
          num_outputs: 1,
          scheduler: 'K_EULER',
          num_inference_steps: 25,
          guidance_scale: 7.5,
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Replicate API error');
    }

    const prediction = await response.json();
    
    // Poll for completion
    const result = await this.pollReplicate(prediction.id);
    
    if (result.status === 'failed') {
      throw new Error(result.error || 'Generation failed');
    }

    return result.output[0];
  }

  private async pollReplicate(id: string): Promise<any> {
    const maxAttempts = 60;
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: {
          'Authorization': `Token ${this.config!.apiKey}`,
        }
      });
      
      const result = await response.json();
      
      if (result.status === 'succeeded' || result.status === 'failed') {
        return result;
      }
    }
    
    throw new Error('Generation timed out');
  }

  private async generateWithOpenAI(prompt: string, width: number, height: number): Promise<string> {
    // DALL-E 3 supports 1024x1024, 1024x1792, 1792x1024
    const size = width === height ? '1024x1024' : '1024x1024';
    
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config!.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
        quality: 'standard',
        response_format: 'b64_json',  // Get base64 directly to avoid CORS
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }

    const result = await response.json();
    // Return as data URL
    return `data:image/png;base64,${result.data[0].b64_json}`;
  }

  private async generateWithStability(prompt: string, width: number, height: number): Promise<string> {
    const response = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config!.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text_prompts: [{ text: prompt, weight: 1 }],
        cfg_scale: 7,
        width,
        height,
        steps: 30,
        samples: 1,
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Stability API error');
    }

    const result = await response.json();
    const base64 = result.artifacts[0].base64;
    return `data:image/png;base64,${base64}`;
  }

  /**
   * Save generated texture to history
   */
  private saveToHistory(texture: GeneratedTexture): void {
    try {
      const history = this.getHistory();
      history.unshift(texture);
      // Keep last 50 textures
      const trimmed = history.slice(0, 50);
      localStorage.setItem(TEXTURE_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('Failed to save texture to history:', e);
    }
  }

  /**
   * Get texture generation history
   */
  getHistory(): GeneratedTexture[] {
    try {
      const saved = localStorage.getItem(TEXTURE_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  /**
   * Clear all texture history
   */
  clearHistory(): void {
    localStorage.removeItem(TEXTURE_STORAGE_KEY);
  }

  /**
   * Delete a single texture from history by index
   */
  deleteFromHistory(index: number): void {
    const history = this.getHistory();
    if (index >= 0 && index < history.length) {
      history.splice(index, 1);
      localStorage.setItem(TEXTURE_STORAGE_KEY, JSON.stringify(history));
    }
  }

  /**
   * Download texture as image file
   */
  async downloadTexture(texture: GeneratedTexture, filename?: string): Promise<void> {
    const name = filename || `texture_${texture.timestamp}.png`;
    
    try {
      let blobUrl: string;
      
      if (texture.url.startsWith('data:')) {
        // Data URL - convert to blob directly
        const response = await fetch(texture.url);
        const blob = await response.blob();
        blobUrl = URL.createObjectURL(blob);
      } else {
        // External URL - try to fetch, but may fail due to CORS
        try {
          const response = await fetch(texture.url);
          const blob = await response.blob();
          blobUrl = URL.createObjectURL(blob);
        } catch {
          // CORS blocked - open in new tab instead
          window.open(texture.url, '_blank');
          return;
        }
      }
      
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error('Download failed:', e);
      // Fallback: open in new tab
      window.open(texture.url, '_blank');
    }
  }

  /**
   * Convert URL to data URL for storage/caching
   */
  async urlToDataUrl(url: string): Promise<string> {
    // Already a data URL
    if (url.startsWith('data:')) {
      return url;
    }
    
    const response = await fetch(url);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Export all textures as a texture pack JSON file
   */
  exportTexturePack(name: string = 'texture-pack'): void {
    const history = this.getHistory();
    const pack = {
      name,
      version: 1,
      exportedAt: Date.now(),
      textures: history
    };
    
    const json = JSON.stringify(pack, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.textures.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Import a texture pack from JSON file
   */
  async importTexturePack(file: File): Promise<number> {
    const text = await file.text();
    const pack = JSON.parse(text);
    
    if (!pack.textures || !Array.isArray(pack.textures)) {
      throw new Error('Invalid texture pack format');
    }
    
    // Merge with existing history (avoid duplicates by timestamp)
    const existing = this.getHistory();
    const existingTimestamps = new Set(existing.map(t => t.timestamp));
    
    let imported = 0;
    for (const texture of pack.textures) {
      if (!existingTimestamps.has(texture.timestamp)) {
        existing.push(texture);
        imported++;
      }
    }
    
    // Sort by timestamp (newest first) and save
    existing.sort((a, b) => b.timestamp - a.timestamp);
    localStorage.setItem(TEXTURE_STORAGE_KEY, JSON.stringify(existing.slice(0, 100)));
    
    return imported;
  }

  /**
   * Get textures used in a level's objects
   */
  getLevelTextures(objects: Array<{ params?: { textureUrl?: string } }>): GeneratedTexture[] {
    const textureUrls = new Set<string>();
    const textures: GeneratedTexture[] = [];
    
    objects.forEach(obj => {
      if (obj.params?.textureUrl && !textureUrls.has(obj.params.textureUrl)) {
        textureUrls.add(obj.params.textureUrl);
        // Try to find in history for metadata
        const history = this.getHistory();
        const found = history.find(t => t.url === obj.params!.textureUrl);
        if (found) {
          textures.push(found);
        } else {
          // Create a minimal texture entry
          textures.push({
            url: obj.params.textureUrl,
            prompt: 'Unknown',
            timestamp: Date.now(),
            width: 512,
            height: 512
          });
        }
      }
    });
    
    return textures;
  }
}

// Singleton instance
export const textureGenerator = new TextureGenerator();
