/**
 * Input Manager
 * Handles keyboard, gamepad, and touch input
 */

export interface InputState {
  moveX: number;      // -1 to 1
  moveY: number;      // -1 to 1
  jump: boolean;      // Just pressed
  jumpHeld: boolean;  // Currently held
  grab: boolean;
  grabHeld: boolean;
  spinLeft: boolean;
  spinRight: boolean;
  pause: boolean;
  
  // D-pad for tricks
  dpadUp: boolean;
  dpadDown: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
}

export class InputManager {
  private keys: Set<string> = new Set();
  private prevKeys: Set<string> = new Set();
  private gamepad: Gamepad | null = null;
  
  constructor() {
    this.initKeyboard();
    this.initGamepad();
  }
  
  private initKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      // Prevent default for game keys
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);
    });
    
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    
    // Clear keys when window loses focus
    window.addEventListener('blur', () => {
      this.keys.clear();
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
    this.prevKeys = new Set(this.keys);
    
    // Refresh gamepad state
    const gamepads = navigator.getGamepads();
    if (gamepads[0]) {
      this.gamepad = gamepads[0];
    }
  }
  
  private justPressed(code: string): boolean {
    return this.keys.has(code) && !this.prevKeys.has(code);
  }
  
  private isHeld(code: string): boolean {
    return this.keys.has(code);
  }
  
  getState(): InputState {
    // Keyboard input
    let moveX = 0;
    let moveY = 0;
    
    if (this.isHeld('KeyA') || this.isHeld('ArrowLeft')) moveX -= 1;
    if (this.isHeld('KeyD') || this.isHeld('ArrowRight')) moveX += 1;
    if (this.isHeld('KeyW') || this.isHeld('ArrowUp')) moveY += 1;
    if (this.isHeld('KeyS') || this.isHeld('ArrowDown')) moveY -= 1;
    
    const keyboard: InputState = {
      moveX,
      moveY,
      jump: this.justPressed('Space'),
      jumpHeld: this.isHeld('Space'),
      grab: this.justPressed('ShiftLeft') || this.justPressed('ShiftRight'),
      grabHeld: this.isHeld('ShiftLeft') || this.isHeld('ShiftRight'),
      spinLeft: this.isHeld('KeyQ'),
      spinRight: this.isHeld('KeyE'),
      pause: this.justPressed('Escape'),
      dpadUp: this.isHeld('ArrowUp'),
      dpadDown: this.isHeld('ArrowDown'),
      dpadLeft: this.isHeld('ArrowLeft'),
      dpadRight: this.isHeld('ArrowRight'),
    };
    
    // Merge with gamepad if available
    if (this.gamepad) {
      return this.mergeGamepad(keyboard, this.gamepad);
    }
    
    return keyboard;
  }
  
  private mergeGamepad(keyboard: InputState, gp: Gamepad): InputState {
    // Axes: 0=LeftX, 1=LeftY, 2=RightX, 3=RightY
    const leftX = gp.axes[0] || 0;
    const leftY = gp.axes[1] || 0;
    
    // Deadzone
    const deadzone = 0.15;
    const applyDeadzone = (v: number) => Math.abs(v) < deadzone ? 0 : v;
    
    // Buttons (Xbox layout)
    // 0=A, 1=B, 2=X, 3=Y, 4=LB, 5=RB, 6=LT, 7=RT
    // 8=Back, 9=Start, 12=DpadUp, 13=DpadDown, 14=DpadLeft, 15=DpadRight
    const pressed = (i: number) => gp.buttons[i]?.pressed ?? false;
    
    return {
      moveX: keyboard.moveX || applyDeadzone(leftX),
      moveY: keyboard.moveY || -applyDeadzone(leftY), // Invert Y
      jump: keyboard.jump || pressed(0), // A
      jumpHeld: keyboard.jumpHeld || pressed(0),
      grab: keyboard.grab || pressed(1), // B
      grabHeld: keyboard.grabHeld || pressed(1),
      spinLeft: keyboard.spinLeft || pressed(4), // LB
      spinRight: keyboard.spinRight || pressed(5), // RB
      pause: keyboard.pause || pressed(9), // Start
      dpadUp: keyboard.dpadUp || pressed(12),
      dpadDown: keyboard.dpadDown || pressed(13),
      dpadLeft: keyboard.dpadLeft || pressed(14),
      dpadRight: keyboard.dpadRight || pressed(15),
    };
  }
}
