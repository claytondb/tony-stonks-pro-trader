/**
 * Dialogue Box
 * Shows story dialogue with typewriter effect
 */

export interface DialogueCallbacks {
  onComplete?: () => void;
  onSkip?: () => void;
}

export class DialogueBox {
  private container: HTMLElement;
  private dialogueElement: HTMLElement | null = null;
  private textElement: HTMLElement | null = null;
  private currentLines: string[] = [];
  private currentIndex = 0;
  private isTyping = false;
  private typeTimeout: number | null = null;
  private callbacks: DialogueCallbacks;
  
  constructor(container: HTMLElement, callbacks: DialogueCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.createElements();
  }
  
  private createElements(): void {
    const style = document.createElement('style');
    style.textContent = `
      .dialogue-box {
        position: absolute;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        width: 90%;
        max-width: 700px;
        background: rgba(0, 0, 0, 0.9);
        border: 3px solid #00FF88;
        border-radius: 10px;
        padding: 20px 30px;
        font-family: 'Kanit', sans-serif;
        z-index: 100;
        display: none;
        pointer-events: auto;
      }
      
      .dialogue-box.visible {
        display: block;
        animation: dialogueSlideIn 0.3s ease-out;
      }
      
      @keyframes dialogueSlideIn {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
      
      .dialogue-text {
        font-size: 20px;
        color: #fff;
        line-height: 1.5;
        margin-bottom: 15px;
        min-height: 60px;
      }
      
      .dialogue-continue {
        font-size: 14px;
        color: #888;
        text-align: right;
        animation: blink 1s infinite;
      }
      
      @keyframes blink {
        0%, 45% { opacity: 1; }
        50%, 100% { opacity: 0.3; }
      }
      
      .dialogue-speaker {
        font-size: 16px;
        color: #FFD700;
        margin-bottom: 10px;
        font-weight: bold;
      }
    `;
    document.head.appendChild(style);
    
    const box = document.createElement('div');
    box.className = 'dialogue-box';
    box.innerHTML = `
      <div class="dialogue-speaker"></div>
      <div class="dialogue-text"></div>
      <div class="dialogue-continue">Press SPACE to continue...</div>
    `;
    
    this.container.appendChild(box);
    this.dialogueElement = box;
    this.textElement = box.querySelector('.dialogue-text');
    
    // Handle input
    window.addEventListener('keydown', this.handleInput.bind(this));
    box.addEventListener('click', () => this.advance());
  }
  
  private handleInput(e: KeyboardEvent): void {
    if (!this.dialogueElement?.classList.contains('visible')) return;
    
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      this.advance();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      this.skip();
    }
  }
  
  /**
   * Show dialogue sequence
   */
  show(lines: string[]): void {
    if (lines.length === 0) {
      this.callbacks.onComplete?.();
      return;
    }
    
    this.currentLines = lines;
    this.currentIndex = 0;
    this.dialogueElement?.classList.add('visible');
    this.showLine(this.currentLines[0]);
  }
  
  /**
   * Hide dialogue
   */
  hide(): void {
    this.dialogueElement?.classList.remove('visible');
    if (this.typeTimeout) {
      clearTimeout(this.typeTimeout);
      this.typeTimeout = null;
    }
    this.isTyping = false;
  }
  
  /**
   * Show a single line with typewriter effect
   */
  private showLine(line: string): void {
    if (!this.textElement) return;
    
    // Parse speaker from line (format: "SPEAKER: text")
    const speakerMatch = line.match(/^([A-Z📰🚁🎉]+(?:\s+[A-Z]+)?):?\s*/);
    const speakerElement = this.dialogueElement?.querySelector('.dialogue-speaker') as HTMLElement;
    
    if (speakerMatch) {
      const speaker = speakerMatch[1];
      const text = line.slice(speakerMatch[0].length);
      
      if (speakerElement) {
        speakerElement.textContent = speaker;
        speakerElement.style.display = 'block';
      }
      
      this.typeText(text);
    } else {
      if (speakerElement) {
        speakerElement.style.display = 'none';
      }
      this.typeText(line);
    }
  }
  
  /**
   * Typewriter effect
   */
  private typeText(text: string): void {
    if (!this.textElement) return;
    
    this.isTyping = true;
    this.textElement.textContent = '';
    
    let charIndex = 0;
    const typeChar = () => {
      if (charIndex < text.length) {
        this.textElement!.textContent += text[charIndex];
        charIndex++;
        this.typeTimeout = window.setTimeout(typeChar, 30);
      } else {
        this.isTyping = false;
      }
    };
    
    typeChar();
  }
  
  /**
   * Advance to next line or complete typing
   */
  private advance(): void {
    // If still typing, complete immediately
    if (this.isTyping) {
      if (this.typeTimeout) {
        clearTimeout(this.typeTimeout);
        this.typeTimeout = null;
      }
      
      // Parse and show full text
      const line = this.currentLines[this.currentIndex];
      const speakerMatch = line.match(/^([A-Z📰🚁🎉]+(?:\s+[A-Z]+)?):?\s*/);
      const text = speakerMatch ? line.slice(speakerMatch[0].length) : line;
      
      if (this.textElement) {
        this.textElement.textContent = text;
      }
      this.isTyping = false;
      return;
    }
    
    // Move to next line
    this.currentIndex++;
    
    if (this.currentIndex >= this.currentLines.length) {
      // All lines shown
      this.hide();
      this.callbacks.onComplete?.();
    } else {
      this.showLine(this.currentLines[this.currentIndex]);
    }
  }
  
  /**
   * Skip all dialogue
   */
  private skip(): void {
    this.hide();
    this.callbacks.onSkip?.();
  }
}
