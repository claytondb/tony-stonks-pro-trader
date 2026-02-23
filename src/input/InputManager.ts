/**
 * Input Manager
 * THPS-style controls: W=forward, S=brake, A/D=turn, Arrows=tricks
 */

export interface InputState {
  // Movement (WASD)
  forward: boolean;     // W - push forward
  brake: boolean;       // S - slow down
  turnLeft: boolean;    // A - turn left
  turnRight: boolean;   // D - turn right
  
  // Jump
  jump: boolean;        // Space - just pressed
  jumpHeld: boolean;    // Space - held
  
  // Trick buttons (Arrow keys)
  flip: boolean;        // Left Arrow - flip tricks
  grab: boolean;        // Right Arrow - grab tricks
  grind: boolean;       // Up Arrow - grind/lip tricks
  
  // Trick modifiers (WASD held during trick)
  trickUp: boolean;     // W during trick
  trickDown: boolean;   // S during trick
  trickLeft: boolean;   // A during trick
  trickRight: boolean;  // D during trick
  
  // Special
  spinLeft: boolean;    // Q - spin left in air
  spinRight: boolean;   // E - spin right in air
  revert: boolean;      // Ctrl - revert/switch
  
  // System
  pause: boolean;       // Escape
}

export class InputManager {
  private keys: Set<string> = new Set();
  private justPressedKeys: Set<string> = new Set();
  private gamepad: Gamepad | null = null;
  
  constructor() {
    this.initKeyboard();
    this.initGamepad();
  }
  
  private initKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      // Prevent default for game keys
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight'].includes(e.code)) {
        e.preventDefault();
      }
      // Track just-pressed keys (not already held)
      if (!this.keys.has(e.code)) {
        this.justPressedKeys.add(e.code);
      }
      this.keys.add(e.code);
    });
    
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    
    // Clear keys when window loses focus
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.justPressedKeys.clear();
    });
  }
  
  private initGamepad(): void {
    window.addEventListener('gamepadconnected', (e) => {
      console.log('Gamepad connected:', e.gamepad.id);
      this.gamepad = e.gamepad;
    });
    
    window.addEventListener('gamepaddisconnected', () => {
      console.log('Gamepad disconnected');
      this.gamepad = null;
    });
  }
  
  update(): void {
    // Refresh gamepad state
    const gamepads = navigator.getGamepads();
    if (gamepads[0]) {
      this.gamepad = gamepads[0];
    }
  }
  
  // Call this AFTER processing input each frame
  clearJustPressed(): void {
    this.justPressedKeys.clear();
  }
  
  private justPressed(code: string): boolean {
    return this.justPressedKeys.has(code);
  }
  
  private isHeld(code: string): boolean {
    return this.keys.has(code);
  }
  
  getState(): InputState {
    const state: InputState = {
      // Movement
      forward: this.isHeld('KeyW'),
      brake: this.isHeld('KeyS'),
      turnLeft: this.isHeld('KeyA'),
      turnRight: this.isHeld('KeyD'),
      
      // Jump
      jump: this.justPressed('Space'),
      jumpHeld: this.isHeld('Space'),
      
      // Trick buttons
      flip: this.isHeld('ArrowLeft'),
      grab: this.isHeld('ArrowRight'),
      grind: this.isHeld('ArrowUp'),
      
      // Trick modifiers (WASD held during trick)
      trickUp: this.isHeld('KeyW'),
      trickDown: this.isHeld('KeyS'),
      trickLeft: this.isHeld('KeyA'),
      trickRight: this.isHeld('KeyD'),
      
      // Special
      spinLeft: this.isHeld('KeyQ'),
      spinRight: this.isHeld('KeyE'),
      revert: this.justPressed('ControlLeft') || this.justPressed('ControlRight'),
      
      // System
      pause: this.justPressed('Escape'),
    };
    
    // Merge with gamepad if available
    if (this.gamepad) {
      return this.mergeGamepad(state, this.gamepad);
    }
    
    return state;
  }
  
  private mergeGamepad(state: InputState, gp: Gamepad): InputState {
    // Axes: 0=LeftX, 1=LeftY
    const leftX = gp.axes[0] || 0;
    const leftY = gp.axes[1] || 0;
    
    // Deadzone (increased to prevent stick drift issues)
    const deadzone = 0.25;
    
    // Buttons (Xbox layout)
    // 0=A, 1=B, 2=X, 3=Y, 4=LB, 5=RB, 6=LT, 7=RT
    // 12=DpadUp, 13=DpadDown, 14=DpadLeft, 15=DpadRight
    const pressed = (i: number) => gp.buttons[i]?.pressed ?? false;
    
    return {
      // Movement - left stick
      forward: state.forward || leftY < -deadzone,
      brake: state.brake || leftY > deadzone,
      turnLeft: state.turnLeft || leftX < -deadzone,
      turnRight: state.turnRight || leftX > deadzone,
      
      // Jump - A button
      jump: state.jump || pressed(0),
      jumpHeld: state.jumpHeld || pressed(0),
      
      // Trick buttons - face buttons
      flip: state.flip || pressed(2), // X
      grab: state.grab || pressed(1), // B
      grind: state.grind || pressed(3), // Y
      
      // Trick modifiers - D-pad
      trickUp: state.trickUp || pressed(12),
      trickDown: state.trickDown || pressed(13),
      trickLeft: state.trickLeft || pressed(14),
      trickRight: state.trickRight || pressed(15),
      
      // Special
      spinLeft: state.spinLeft || pressed(4), // LB
      spinRight: state.spinRight || pressed(5), // RB
      revert: state.revert || pressed(6) || pressed(7), // LT or RT
      
      // System
      pause: state.pause || pressed(9), // Start
    };
  }
}
