/**
 * Upgrade Shop UI
 * Between-level shop for purchasing upgrades and cosmetics
 */

import { 
  storyProgress, 
  COSMETIC_COSTS,
  PlayerUpgrades,
  PlayerCosmetics
} from './StoryProgress';

// Upgrade display info
const UPGRADE_INFO: Record<keyof PlayerUpgrades, { name: string; icon: string; description: string }> = {
  speed: {
    name: 'Top Speed',
    icon: '🏎️',
    description: 'Increases maximum rolling speed'
  },
  jumpHeight: {
    name: 'Jump Height',
    icon: '🦘',
    description: 'Jump higher for bigger air'
  },
  spinSpeed: {
    name: 'Spin Speed',
    icon: '🌀',
    description: 'Rotate faster in the air'
  },
  grindBalance: {
    name: 'Grind Balance',
    icon: '⚖️',
    description: 'Easier to stay balanced while grinding'
  },
  manualBalance: {
    name: 'Manual Balance',
    icon: '🎯',
    description: 'Easier to stay balanced while manualing'
  }
};

// Cosmetic options
const TIE_COLORS = [
  { id: '#ff0000', name: 'Power Red' },
  { id: '#0000ff', name: 'Corporate Blue' },
  { id: '#00ff00', name: 'Money Green' },
  { id: '#ffd700', name: 'Golden Stonks' },
  { id: '#ff69b4', name: 'Hot Pink' },
  { id: '#800080', name: 'Royal Purple' },
  { id: '#000000', name: 'Stealth Black' },
  { id: '#ffffff', name: 'Clean White' }
];

const TIE_PATTERNS = [
  { id: 'solid', name: 'Solid' },
  { id: 'striped', name: 'Striped' },
  { id: 'dots', name: 'Polka Dots' },
  { id: 'diamond', name: 'Diamond' }
];

const SHIRT_COLORS = [
  { id: '#ffffff', name: 'Classic White' },
  { id: '#add8e6', name: 'Business Blue' },
  { id: '#fffacd', name: 'Cream' },
  { id: '#ffb6c1', name: 'Pink' },
  { id: '#90ee90', name: 'Light Green' },
  { id: '#d3d3d3', name: 'Gray' }
];

const PANTS_COLORS = [
  { id: '#2a2a2a', name: 'Charcoal' },
  { id: '#000080', name: 'Navy' },
  { id: '#8b4513', name: 'Brown' },
  { id: '#696969', name: 'Gray' },
  { id: '#2f4f4f', name: 'Dark Slate' },
  { id: '#000000', name: 'Black' }
];

const CHAIR_COLORS = [
  { id: '#1a1a2e', name: 'Office Blue' },
  { id: '#2e1a1a', name: 'Executive Red' },
  { id: '#1a2e1a', name: 'Money Green' },
  { id: '#2e2e1a', name: 'Golden' },
  { id: '#1a1a1a', name: 'Stealth Black' },
  { id: '#4a1a4a', name: 'Purple Reign' }
];

export type ShopTab = 'upgrades' | 'cosmetics';

export interface ShopCallbacks {
  onClose: () => void;
  onPurchase?: (type: string, item: string) => void;
}

export class UpgradeShop {
  private container: HTMLElement;
  private callbacks: ShopCallbacks;
  private currentTab: ShopTab = 'upgrades';
  
  constructor(container: HTMLElement, callbacks: ShopCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }
  
  /**
   * Show the shop
   */
  show(): void {
    this.render();
  }
  
  /**
   * Hide the shop
   */
  hide(): void {
    this.container.innerHTML = '';
  }
  
  /**
   * Render the shop UI
   */
  private render(): void {
    const state = storyProgress.getState();
    
    this.container.innerHTML = `
      <style>
        .shop-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          font-family: 'Kanit', sans-serif;
        }
        
        .shop-container {
          background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
          border: 3px solid #00FF88;
          border-radius: 15px;
          width: 90%;
          max-width: 900px;
          max-height: 85vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        
        .shop-header {
          background: rgba(0, 255, 136, 0.1);
          padding: 20px 30px;
          border-bottom: 2px solid #00FF88;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .shop-title {
          font-size: 32px;
          font-weight: bold;
          color: #00FF88;
          text-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
        }
        
        .shop-stonks {
          font-size: 24px;
          color: #FFD700;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .shop-tabs {
          display: flex;
          gap: 0;
          border-bottom: 2px solid #333;
        }
        
        .shop-tab {
          flex: 1;
          padding: 15px;
          background: transparent;
          border: none;
          color: #888;
          font-size: 18px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .shop-tab:hover {
          background: rgba(0, 255, 136, 0.1);
          color: #00FF88;
        }
        
        .shop-tab.active {
          background: rgba(0, 255, 136, 0.2);
          color: #00FF88;
          border-bottom: 3px solid #00FF88;
        }
        
        .shop-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }
        
        .upgrade-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 15px;
        }
        
        .upgrade-card {
          background: rgba(0, 0, 0, 0.4);
          border: 2px solid #444;
          border-radius: 10px;
          padding: 20px;
          transition: all 0.2s;
        }
        
        .upgrade-card:hover {
          border-color: #00FF88;
          transform: translateY(-2px);
        }
        
        .upgrade-card.maxed {
          border-color: #FFD700;
          background: rgba(255, 215, 0, 0.1);
        }
        
        .upgrade-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        
        .upgrade-icon {
          font-size: 28px;
        }
        
        .upgrade-name {
          font-size: 18px;
          font-weight: bold;
          color: #fff;
        }
        
        .upgrade-desc {
          color: #888;
          font-size: 14px;
          margin-bottom: 15px;
        }
        
        .upgrade-level {
          display: flex;
          gap: 5px;
          margin-bottom: 15px;
        }
        
        .upgrade-pip {
          width: 30px;
          height: 8px;
          background: #333;
          border-radius: 4px;
        }
        
        .upgrade-pip.filled {
          background: linear-gradient(90deg, #00FF88, #00AA66);
        }
        
        .upgrade-pip.next {
          background: rgba(0, 255, 136, 0.3);
          animation: pulse 1s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        
        .upgrade-btn {
          width: 100%;
          padding: 12px;
          font-size: 16px;
          font-weight: bold;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .upgrade-btn.can-afford {
          background: #00AA66;
          color: #fff;
        }
        
        .upgrade-btn.can-afford:hover {
          background: #00CC77;
        }
        
        .upgrade-btn.cant-afford {
          background: #444;
          color: #888;
          cursor: not-allowed;
        }
        
        .upgrade-btn.maxed {
          background: #FFD700;
          color: #000;
          cursor: default;
        }
        
        .cosmetic-section {
          margin-bottom: 30px;
        }
        
        .cosmetic-title {
          font-size: 18px;
          color: #FFD700;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 1px solid #333;
        }
        
        .cosmetic-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        
        .cosmetic-item {
          width: 50px;
          height: 50px;
          border: 3px solid #444;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: #fff;
        }
        
        .cosmetic-item:hover {
          border-color: #00FF88;
          transform: scale(1.1);
        }
        
        .cosmetic-item.selected {
          border-color: #FFD700;
          box-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
        }
        
        .cosmetic-item.locked {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .shop-footer {
          padding: 20px;
          border-top: 2px solid #333;
          display: flex;
          justify-content: flex-end;
        }
        
        .close-btn {
          padding: 15px 40px;
          font-size: 18px;
          font-weight: bold;
          background: #333;
          border: 2px solid #555;
          color: #fff;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .close-btn:hover {
          background: #00AA66;
          border-color: #00FF88;
        }
      </style>
      
      <div class="shop-overlay">
        <div class="shop-container">
          <div class="shop-header">
            <div class="shop-title">📈 STONKS SHOP</div>
            <div class="shop-stonks">
              💰 ${state.totalStonks.toLocaleString()} Stonks
            </div>
          </div>
          
          <div class="shop-tabs">
            <button class="shop-tab ${this.currentTab === 'upgrades' ? 'active' : ''}" data-tab="upgrades">
              ⬆️ UPGRADES
            </button>
            <button class="shop-tab ${this.currentTab === 'cosmetics' ? 'active' : ''}" data-tab="cosmetics">
              👔 COSMETICS
            </button>
          </div>
          
          <div class="shop-content">
            ${this.currentTab === 'upgrades' ? this.renderUpgrades() : this.renderCosmetics()}
          </div>
          
          <div class="shop-footer">
            <button class="close-btn">CONTINUE</button>
          </div>
        </div>
      </div>
    `;
    
    this.setupEventListeners();
  }
  
  /**
   * Render upgrades tab
   */
  private renderUpgrades(): string {
    const state = storyProgress.getState();
    
    const upgradeCards = (Object.keys(UPGRADE_INFO) as (keyof PlayerUpgrades)[]).map(key => {
      const info = UPGRADE_INFO[key];
      const level = state.upgrades[key];
      const cost = storyProgress.getUpgradeCost(key);
      const isMaxed = cost === null;
      const canAfford = cost !== null && state.totalStonks >= cost;
      
      // Generate level pips
      let pips = '';
      for (let i = 0; i < 5; i++) {
        if (i < level) {
          pips += '<div class="upgrade-pip filled"></div>';
        } else if (i === level && !isMaxed) {
          pips += '<div class="upgrade-pip next"></div>';
        } else {
          pips += '<div class="upgrade-pip"></div>';
        }
      }
      
      let buttonText = isMaxed ? '✓ MAXED' : `BUY - ${cost?.toLocaleString()} 💰`;
      let buttonClass = isMaxed ? 'maxed' : (canAfford ? 'can-afford' : 'cant-afford');
      
      return `
        <div class="upgrade-card ${isMaxed ? 'maxed' : ''}">
          <div class="upgrade-header">
            <span class="upgrade-icon">${info.icon}</span>
            <span class="upgrade-name">${info.name}</span>
          </div>
          <div class="upgrade-desc">${info.description}</div>
          <div class="upgrade-level">${pips}</div>
          <button class="upgrade-btn ${buttonClass}" data-upgrade="${key}" ${!canAfford && !isMaxed ? 'disabled' : ''}>
            ${buttonText}
          </button>
        </div>
      `;
    }).join('');
    
    return `<div class="upgrade-grid">${upgradeCards}</div>`;
  }
  
  /**
   * Render cosmetics tab
   */
  private renderCosmetics(): string {
    const state = storyProgress.getState();
    
    // Tie colors
    const tieColorItems = TIE_COLORS.map(color => {
      const selected = state.cosmetics.tieColor === color.id;
      return `
        <div class="cosmetic-item ${selected ? 'selected' : ''}" 
             style="background: ${color.id};"
             data-cosmetic="tieColor"
             data-value="${color.id}"
             title="${color.name}">
        </div>
      `;
    }).join('');
    
    // Tie patterns
    const tiePatternItems = TIE_PATTERNS.map(pattern => {
      const selected = state.cosmetics.tiePattern === pattern.id;
      return `
        <div class="cosmetic-item ${selected ? 'selected' : ''}"
             style="background: #444;"
             data-cosmetic="tiePattern"
             data-value="${pattern.id}"
             title="${pattern.name}">
          ${pattern.name.charAt(0)}
        </div>
      `;
    }).join('');
    
    // Shirt colors
    const shirtColorItems = SHIRT_COLORS.map(color => {
      const selected = state.cosmetics.shirtColor === color.id;
      return `
        <div class="cosmetic-item ${selected ? 'selected' : ''}"
             style="background: ${color.id};"
             data-cosmetic="shirtColor"
             data-value="${color.id}"
             title="${color.name}">
        </div>
      `;
    }).join('');
    
    // Pants colors
    const pantsColorItems = PANTS_COLORS.map(color => {
      const selected = state.cosmetics.pantsColor === color.id;
      return `
        <div class="cosmetic-item ${selected ? 'selected' : ''}"
             style="background: ${color.id};"
             data-cosmetic="pantsColor"
             data-value="${color.id}"
             title="${color.name}">
        </div>
      `;
    }).join('');
    
    // Chair upholstery
    const chairColorItems = CHAIR_COLORS.map(color => {
      const selected = state.cosmetics.chairUpholstery === color.id;
      return `
        <div class="cosmetic-item ${selected ? 'selected' : ''}"
             style="background: ${color.id};"
             data-cosmetic="chairUpholstery"
             data-value="${color.id}"
             title="${color.name}">
        </div>
      `;
    }).join('');
    
    return `
      <div class="cosmetic-section">
        <div class="cosmetic-title">👔 Tie Color (${COSMETIC_COSTS.tieColor} 💰)</div>
        <div class="cosmetic-grid">${tieColorItems}</div>
      </div>
      
      <div class="cosmetic-section">
        <div class="cosmetic-title">🎨 Tie Pattern (${COSMETIC_COSTS.tiePattern} 💰)</div>
        <div class="cosmetic-grid">${tiePatternItems}</div>
      </div>
      
      <div class="cosmetic-section">
        <div class="cosmetic-title">👕 Shirt Color (${COSMETIC_COSTS.shirtColor} 💰)</div>
        <div class="cosmetic-grid">${shirtColorItems}</div>
      </div>
      
      <div class="cosmetic-section">
        <div class="cosmetic-title">👖 Pants Color (${COSMETIC_COSTS.pantsColor} 💰)</div>
        <div class="cosmetic-grid">${pantsColorItems}</div>
      </div>
      
      <div class="cosmetic-section">
        <div class="cosmetic-title">🪑 Chair Upholstery (${COSMETIC_COSTS.chairUpholstery} 💰)</div>
        <div class="cosmetic-grid">${chairColorItems}</div>
      </div>
    `;
  }
  
  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Tab switching
    this.container.querySelectorAll('.shop-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentTab = tab.getAttribute('data-tab') as ShopTab;
        this.render();
      });
    });
    
    // Upgrade buttons
    this.container.querySelectorAll('.upgrade-btn[data-upgrade]').forEach(btn => {
      btn.addEventListener('click', () => {
        const upgrade = btn.getAttribute('data-upgrade') as keyof PlayerUpgrades;
        if (storyProgress.purchaseUpgrade(upgrade)) {
          this.callbacks.onPurchase?.('upgrade', upgrade);
          this.render();
        }
      });
    });
    
    // Cosmetic items
    this.container.querySelectorAll('.cosmetic-item[data-cosmetic]').forEach(item => {
      item.addEventListener('click', () => {
        const key = item.getAttribute('data-cosmetic') as keyof PlayerCosmetics;
        const value = item.getAttribute('data-value') as string;
        
        // Check if already selected (free to switch back)
        const currentValue = storyProgress.getCosmetic(key);
        if (currentValue === value) return;
        
        if (storyProgress.setCosmetic(key, value as never)) {
          this.callbacks.onPurchase?.('cosmetic', `${key}:${value}`);
          this.render();
        }
      });
    });
    
    // Close button
    this.container.querySelector('.close-btn')?.addEventListener('click', () => {
      this.callbacks.onClose();
    });
  }
}
