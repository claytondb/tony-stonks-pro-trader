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

    const texture: GeneratedTexture = {
      url: imageUrl,
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
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }

    const result = await response.json();
    return result.data[0].url;
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
   * Download texture as image file
   */
  async downloadTexture(texture: GeneratedTexture, filename?: string): Promise<void> {
    const name = filename || `texture_${texture.timestamp}.png`;
    
    // If it's a URL, fetch and convert to blob
    const response = await fetch(texture.url);
    const blob = await response.blob();
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Convert URL to data URL for storage/caching
   */
  async urlToDataUrl(url: string): Promise<string> {
    const response = await fetch(url);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

// Singleton instance
export const textureGenerator = new TextureGenerator();
