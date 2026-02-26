/**
 * Level Editor
 * Core editor logic for placing, selecting, and manipulating objects
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { LevelObject, ObjectType } from '../levels/LevelData';
import { EditorLevelData, EditorStorage, ObjectPaletteItem } from './EditorStorage';

export interface EditorCallbacks {
  onObjectSelected?: (object: EditorObject | null) => void;
  onObjectsChanged?: () => void;
  onLevelChanged?: () => void;
  canAddObject?: () => boolean;
}

export interface EditorObject {
  id: string;
  mesh: THREE.Object3D;
  data: LevelObject;
}

export class LevelEditor {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private perspCamera: THREE.PerspectiveCamera;
  private orthoCamera: THREE.OrthographicCamera;
  private isOrthographic: boolean = false;
  private renderer: THREE.WebGLRenderer;
  private orbitControls: OrbitControls;
  private transformControls: TransformControls;
  private viewCubeContainer: HTMLElement | null = null;
  
  private level: EditorLevelData;
  private objects: EditorObject[] = [];
  private selectedObjects: EditorObject[] = [];
  private selectedObject: EditorObject | null = null;  // For backwards compat, points to first selected
  
  // Drag selection
  private isDragSelecting: boolean = false;
  private dragStartPoint: { x: number; y: number } | null = null;
  private selectionBox: HTMLElement | null = null;
  
  private callbacks: EditorCallbacks;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  
  // Grid settings
  private gridHelper: THREE.GridHelper;
  private gridSnap: number = 1;
  private rotationSnap: number = 15; // degrees
  
  // Placement mode
  private placementMode: boolean = false;
  private placementItem: ObjectPaletteItem | null = null;
  private placementPreview: THREE.Object3D | null = null;
  
  // Materials cache
  private materials: Map<string, THREE.Material> = new Map();
  
  // Ground plane for raycasting
  private groundPlane: THREE.Mesh;
  
  // Spawn point marker
  private spawnMarker: THREE.Object3D | null = null;
  
  // Autosave timer
  private autosaveTimer: number | null = null;
  
  // Undo/Redo system
  private undoStack: string[] = [];  // JSON snapshots
  private redoStack: string[] = [];
  private maxUndoSteps: number = 20;
  
  // Tool modes
  private currentTool: 'select' | 'move' | 'rotate' | 'pencil' | 'paint' = 'select';
  private isPainting: boolean = false;
  private lastPaintPosition: THREE.Vector3 | null = null;
  private paintMinDistance: number = 2;  // Min distance between painted objects
  private toolbarContainer: HTMLElement | null = null;
  
  // Spawn placement mode
  private isPlacingSpawn: boolean = false;
  private onSpawnPlaced: ((x: number, z: number) => void) | null = null;
  
  constructor(container: HTMLElement, callbacks: EditorCallbacks = {}) {
    this.callbacks = callbacks;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);
    
    // Create perspective camera
    this.perspCamera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.perspCamera.position.set(30, 30, 30);
    this.perspCamera.lookAt(0, 0, 0);
    
    // Create orthographic camera
    const aspect = container.clientWidth / container.clientHeight;
    const frustumSize = 50;
    this.orthoCamera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      1000
    );
    this.orthoCamera.position.set(30, 30, 30);
    this.orthoCamera.lookAt(0, 0, 0);
    
    // Start with perspective camera
    this.camera = this.perspCamera;
    
    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);
    
    // Create orbit controls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.1;
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
    
    // Create transform controls
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.addEventListener('dragging-changed', (e) => {
      this.orbitControls.enabled = !e.value;
    });
    this.transformControls.addEventListener('objectChange', () => {
      this.updateSelectedObjectData();
    });
    this.scene.add(this.transformControls);
    
    // Create grid
    this.gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x888888);
    this.scene.add(this.gridHelper);
    
    // Create visible ground plane with color
    const groundGeom = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({ 
      color: 0x555555,
      roughness: 0.9,
      metalness: 0.1
    });
    this.groundPlane = new THREE.Mesh(groundGeom, groundMat);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.y = -0.01; // Slightly below grid
    this.groundPlane.name = 'ground-plane';
    this.groundPlane.receiveShadow = true;
    this.scene.add(this.groundPlane);
    
    // Add lights
    this.setupLights();
    
    // Init materials
    this.initMaterials();
    
    // Create default level
    this.level = EditorStorage.createNewLevel();
    
    // Set up event listeners
    this.setupEventListeners(container);
    
    // Handle resize
    window.addEventListener('resize', () => {
      const aspect = container.clientWidth / container.clientHeight;
      
      // Update perspective camera
      this.perspCamera.aspect = aspect;
      this.perspCamera.updateProjectionMatrix();
      
      // Update orthographic camera
      const frustumSize = 50;
      this.orthoCamera.left = -frustumSize * aspect / 2;
      this.orthoCamera.right = frustumSize * aspect / 2;
      this.orthoCamera.top = frustumSize / 2;
      this.orthoCamera.bottom = -frustumSize / 2;
      this.orthoCamera.updateProjectionMatrix();
      
      this.renderer.setSize(container.clientWidth, container.clientHeight);
    });
    
    // Create view cube
    this.createViewCube(container);
    
    // Create toolbar
    this.createToolbar(container);
    
    // Save initial state for undo
    this.saveUndoState();
    
    // Start render loop
    this.animate();
    
    // Setup autosave
    this.startAutosave();
  }
  
  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);
    
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(50, 100, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    this.scene.add(sun);
  }
  
  private initMaterials(): void {
    this.materials.set('rail', new THREE.MeshStandardMaterial({
      color: 0xcccccc, metalness: 0.8, roughness: 0.2
    }));
    this.materials.set('wood', new THREE.MeshStandardMaterial({
      color: 0x8B4513, roughness: 0.7
    }));
    this.materials.set('concrete', new THREE.MeshStandardMaterial({
      color: 0x666666, roughness: 0.9
    }));
    this.materials.set('metal', new THREE.MeshStandardMaterial({
      color: 0x888888, metalness: 0.6, roughness: 0.4
    }));
    this.materials.set('office', new THREE.MeshStandardMaterial({
      color: 0x4a4a5e, roughness: 0.7
    }));
    this.materials.set('preview', new THREE.MeshStandardMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.6
    }));
    this.materials.set('selected', new THREE.MeshStandardMaterial({
      color: 0xffff00, emissive: 0x444400
    }));
  }
  
  private setupEventListeners(container: HTMLElement): void {
    // Click to select or place
    container.addEventListener('click', (e) => {
      this.handleClick(e, false);
    });
    
    // Right-click to delete (in pencil/paint mode)
    container.addEventListener('contextmenu', (e) => {
      if (this.currentTool === 'pencil' || this.currentTool === 'paint') {
        e.preventDefault();
        this.handleClick(e, true);  // true = delete mode
      }
    });
    
    // Mouse down for paint mode and drag selection
    container.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.currentTool === 'paint' && this.placementMode) {
        this.isPainting = true;
        this.lastPaintPosition = null;
      } else if (e.button === 2 && this.currentTool === 'paint') {
        this.isPainting = true;
        this.lastPaintPosition = null;
      } else if (e.button === 0 && this.currentTool === 'select') {
        // Start drag selection
        this.startDragSelection(e, container);
      }
    });
    
    // Mouse up to stop painting and drag selection
    container.addEventListener('mouseup', (e) => {
      if (this.isPainting) {
        this.isPainting = false;
        this.lastPaintPosition = null;
        if (this.currentTool === 'paint') {
          this.saveUndoState();  // Save after paint stroke
        }
      }
      if (this.isDragSelecting) {
        this.endDragSelection(e, container);
      }
    });
    
    // Mouse leave to cancel drag selection
    container.addEventListener('mouseleave', () => {
      if (this.isDragSelecting) {
        this.cancelDragSelection();
      }
    });
    
    // Mouse move for placement preview, painting, and drag selection
    container.addEventListener('mousemove', (e) => {
      this.handleMouseMove(e, container);
      
      // Paint mode continuous placement
      if (this.isPainting && this.currentTool === 'paint' && this.placementMode) {
        this.handlePaintStroke(e.button === 2);
      }
      
      // Update drag selection box
      if (this.isDragSelecting) {
        this.updateDragSelection(e, container);
      }
    });
    
    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });
  }
  
  private handleClick(_e: MouseEvent, deleteMode: boolean = false): void {
    // Check for spawn placement mode first
    if (this.isPlacingSpawn) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObject(this.groundPlane);
      if (intersects.length > 0) {
        const pos = intersects[0].point;
        const x = this.gridSnap > 0 ? Math.round(pos.x / this.gridSnap) * this.gridSnap : pos.x;
        const z = this.gridSnap > 0 ? Math.round(pos.z / this.gridSnap) * this.gridSnap : pos.z;
        this.onSpawnPlaced?.(x, z);
        this.isPlacingSpawn = false;
        this.onSpawnPlaced = null;
      }
      return;
    }
    
    if (this.currentTool === 'select') {
      // Select mode - just select objects
      this.selectObjectAtMouse();
    } else if ((this.currentTool === 'pencil' || this.currentTool === 'paint') && deleteMode) {
      // Delete object under cursor
      this.deleteObjectAtMouse();
    } else if (this.placementMode && this.placementItem && (this.currentTool === 'pencil' || this.currentTool === 'paint')) {
      // Place object
      this.placeObject();
      this.saveUndoState();
    } else if (this.currentTool === 'move' || this.currentTool === 'rotate') {
      // Select object for transform
      this.selectObjectAtMouse();
    }
  }
  
  private handleMouseMove(e: MouseEvent, container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    if (this.placementMode && this.placementPreview) {
      this.updatePlacementPreview();
    }
  }
  
  private handleKeyDown(e: KeyboardEvent): void {
    // Don't handle if typing in input
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    
    switch (e.code) {
      case 'Delete':
      case 'Backspace':
        if (this.selectedObject) {
          this.deleteSelectedObject();
        }
        break;
        
      case 'Escape':
        if (this.placementMode) {
          this.cancelPlacement();
        } else {
          this.deselectObject();
        }
        break;
        
      case 'KeyG':
        // Toggle grid snap
        this.toggleGridSnap();
        break;
        
      case 'KeyR':
        // Rotate mode
        this.transformControls.setMode('rotate');
        break;
        
      case 'KeyT':
        // Translate mode
        this.transformControls.setMode('translate');
        break;
        
      case 'KeyD':
        // Duplicate selected
        if (this.selectedObject && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.duplicateSelectedObject();
        }
        break;
        
      case 'KeyS':
        // Quick save
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.save();
        }
        break;
        
      case 'KeyZ':
        // Undo
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
        }
        break;
        
      case 'KeyY':
        // Redo
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.redo();
        }
        break;
        
      case 'BracketLeft':
        // Rotate left
        if (this.placementPreview) {
          this.placementPreview.rotation.y -= THREE.MathUtils.degToRad(this.rotationSnap);
        } else if (this.selectedObject) {
          this.selectedObject.mesh.rotation.y -= THREE.MathUtils.degToRad(this.rotationSnap);
          this.updateSelectedObjectData();
        }
        break;
        
      case 'BracketRight':
        // Rotate right
        if (this.placementPreview) {
          this.placementPreview.rotation.y += THREE.MathUtils.degToRad(this.rotationSnap);
        } else if (this.selectedObject) {
          this.selectedObject.mesh.rotation.y += THREE.MathUtils.degToRad(this.rotationSnap);
          this.updateSelectedObjectData();
        }
        break;
    }
  }
  
  private selectObjectAtMouse(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const meshes = this.objects.map(o => o.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, true);
    
    if (intersects.length > 0) {
      // Find the EditorObject that owns this mesh
      let found: EditorObject | null = null;
      for (const obj of this.objects) {
        if (this.isDescendant(intersects[0].object, obj.mesh)) {
          found = obj;
          break;
        }
      }
      
      if (found) {
        this.selectObject(found);
      }
    } else {
      this.deselectObject();
    }
  }
  
  private isDescendant(child: THREE.Object3D, parent: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = child;
    while (current) {
      if (current === parent) return true;
      current = current.parent;
    }
    return false;
  }
  
  selectObject(obj: EditorObject): void {
    this.deselectObject();
    this.selectedObject = obj;
    this.transformControls.attach(obj.mesh);
    this.callbacks.onObjectSelected?.(obj);
  }
  
  deselectObject(): void {
    if (this.selectedObject) {
      this.transformControls.detach();
      this.selectedObject = null;
      this.callbacks.onObjectSelected?.(null);
    }
    // Clear multi-selection
    this.selectedObjects.forEach(obj => {
      this.unhighlightObject(obj);
    });
    this.selectedObjects = [];
  }
  
  // =============================================
  // DRAG SELECTION
  // =============================================
  
  private startDragSelection(e: MouseEvent, container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    this.dragStartPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    this.isDragSelecting = true;
    
    // Create selection box element
    this.selectionBox = document.createElement('div');
    this.selectionBox.style.cssText = `
      position: absolute;
      border: 2px dashed #00ff88;
      background: rgba(0, 255, 136, 0.1);
      pointer-events: none;
      z-index: 1000;
    `;
    container.appendChild(this.selectionBox);
    
    // Disable orbit controls during drag
    this.orbitControls.enabled = false;
  }
  
  private updateDragSelection(e: MouseEvent, container: HTMLElement): void {
    if (!this.selectionBox || !this.dragStartPoint) return;
    
    const rect = container.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const left = Math.min(this.dragStartPoint.x, currentX);
    const top = Math.min(this.dragStartPoint.y, currentY);
    const width = Math.abs(currentX - this.dragStartPoint.x);
    const height = Math.abs(currentY - this.dragStartPoint.y);
    
    this.selectionBox.style.left = `${left}px`;
    this.selectionBox.style.top = `${top}px`;
    this.selectionBox.style.width = `${width}px`;
    this.selectionBox.style.height = `${height}px`;
  }
  
  private endDragSelection(e: MouseEvent, container: HTMLElement): void {
    if (!this.dragStartPoint) return;
    
    const rect = container.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    
    // Calculate selection bounds in screen space
    const minX = Math.min(this.dragStartPoint.x, endX);
    const maxX = Math.max(this.dragStartPoint.x, endX);
    const minY = Math.min(this.dragStartPoint.y, endY);
    const maxY = Math.max(this.dragStartPoint.y, endY);
    
    // Only select if drag was significant (not just a click)
    const dragDistance = Math.hypot(endX - this.dragStartPoint.x, endY - this.dragStartPoint.y);
    
    if (dragDistance > 5) {
      // Find objects within selection box
      this.deselectObject();
      
      this.objects.forEach(obj => {
        const screenPos = this.getScreenPosition(obj.mesh, container);
        if (screenPos &&
            screenPos.x >= minX && screenPos.x <= maxX &&
            screenPos.y >= minY && screenPos.y <= maxY) {
          this.selectedObjects.push(obj);
          this.highlightObject(obj);
        }
      });
      
      // Set first selected as the main selectedObject for transform controls
      if (this.selectedObjects.length > 0) {
        this.selectedObject = this.selectedObjects[0];
        this.transformControls.attach(this.selectedObject.mesh);
        this.callbacks.onObjectSelected?.(this.selectedObject);
      }
    } else {
      // It was a click, do normal selection
      this.selectObjectAtMouse();
    }
    
    this.cancelDragSelection();
  }
  
  private cancelDragSelection(): void {
    this.isDragSelecting = false;
    this.dragStartPoint = null;
    if (this.selectionBox) {
      this.selectionBox.remove();
      this.selectionBox = null;
    }
    this.orbitControls.enabled = true;
  }
  
  private getScreenPosition(object: THREE.Object3D, container: HTMLElement): { x: number; y: number } | null {
    const vector = new THREE.Vector3();
    object.getWorldPosition(vector);
    vector.project(this.camera);
    
    // Check if behind camera
    if (vector.z > 1) return null;
    
    const x = (vector.x * 0.5 + 0.5) * container.clientWidth;
    const y = (-vector.y * 0.5 + 0.5) * container.clientHeight;
    
    return { x, y };
  }
  
  private highlightObject(obj: EditorObject): void {
    obj.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        // Store original material
        if (!child.userData.originalMaterial) {
          child.userData.originalMaterial = child.material;
        }
        // Apply highlight
        const highlightMat = (child.material as THREE.MeshStandardMaterial).clone();
        highlightMat.emissive = new THREE.Color(0x004400);
        highlightMat.emissiveIntensity = 0.5;
        child.material = highlightMat;
      }
    });
  }
  
  private unhighlightObject(obj: EditorObject): void {
    obj.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.originalMaterial) {
        child.material = child.userData.originalMaterial;
        delete child.userData.originalMaterial;
      }
    });
  }
  
  deleteSelectedObject(): void {
    // Handle multi-selection delete
    if (this.selectedObjects.length > 0) {
      this.selectedObjects.forEach(obj => {
        this.scene.remove(obj.mesh);
        this.unhighlightObject(obj);
        
        const idx = this.objects.indexOf(obj);
        if (idx >= 0) this.objects.splice(idx, 1);
        
        const dataIdx = this.level.objects.indexOf(obj.data);
        if (dataIdx >= 0) this.level.objects.splice(dataIdx, 1);
      });
      
      this.transformControls.detach();
      this.selectedObjects = [];
      this.selectedObject = null;
      this.callbacks.onObjectSelected?.(null);
      this.callbacks.onObjectsChanged?.();
      this.saveUndoState();
      return;
    }
    
    // Single selection delete
    if (!this.selectedObject) return;
    
    // Remove from scene
    this.scene.remove(this.selectedObject.mesh);
    this.transformControls.detach();
    
    // Remove from objects array
    const idx = this.objects.indexOf(this.selectedObject);
    if (idx >= 0) this.objects.splice(idx, 1);
    
    // Remove from level data
    const dataIdx = this.level.objects.indexOf(this.selectedObject.data);
    if (dataIdx >= 0) this.level.objects.splice(dataIdx, 1);
    
    this.selectedObject = null;
    this.callbacks.onObjectSelected?.(null);
    this.callbacks.onObjectsChanged?.();
    this.saveUndoState();
  }
  
  duplicateSelectedObject(): void {
    if (!this.selectedObject) return;
    
    const original = this.selectedObject.data;
    const newData: LevelObject = JSON.parse(JSON.stringify(original));
    
    // Offset position
    newData.position[0] += 2;
    newData.position[2] += 2;
    
    this.addObject(newData);
  }
  
  private updateSelectedObjectData(): void {
    if (!this.selectedObject) return;
    
    const pos = this.selectedObject.mesh.position;
    const rot = this.selectedObject.mesh.rotation;
    
    // Snap to grid if enabled
    if (this.gridSnap > 0) {
      pos.x = Math.round(pos.x / this.gridSnap) * this.gridSnap;
      pos.z = Math.round(pos.z / this.gridSnap) * this.gridSnap;
      this.selectedObject.mesh.position.copy(pos);
    }
    
    this.selectedObject.data.position = [pos.x, pos.y, pos.z];
    this.selectedObject.data.rotation = [
      THREE.MathUtils.radToDeg(rot.x),
      THREE.MathUtils.radToDeg(rot.y),
      THREE.MathUtils.radToDeg(rot.z)
    ];
    
    this.callbacks.onObjectsChanged?.();
  }
  
  // =============================================
  // PLACEMENT MODE
  // =============================================
  
  startPlacement(item: ObjectPaletteItem): void {
    this.cancelPlacement();
    
    this.placementMode = true;
    this.placementItem = item;
    
    // Create preview mesh
    this.placementPreview = this.createObjectMesh(item.type, item.defaultParams);
    this.placementPreview.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = this.materials.get('preview')!.clone();
      }
    });
    this.scene.add(this.placementPreview);
    
    // Disable orbit controls middle-click drag
    this.orbitControls.enablePan = false;
  }
  
  cancelPlacement(): void {
    if (this.placementPreview) {
      this.scene.remove(this.placementPreview);
      this.placementPreview = null;
    }
    this.placementMode = false;
    this.placementItem = null;
    this.orbitControls.enablePan = true;
  }
  
  private updatePlacementPreview(): void {
    if (!this.placementPreview) return;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.groundPlane);
    
    if (intersects.length > 0) {
      let pos = intersects[0].point;
      
      // Snap to grid
      if (this.gridSnap > 0) {
        pos.x = Math.round(pos.x / this.gridSnap) * this.gridSnap;
        pos.z = Math.round(pos.z / this.gridSnap) * this.gridSnap;
      }
      
      this.placementPreview.position.set(pos.x, 0, pos.z);
    }
  }
  
  private placeObject(): void {
    if (!this.placementItem || !this.placementPreview) return;
    
    // Check if we can add more objects (limit check)
    if (this.callbacks.canAddObject && !this.callbacks.canAddObject()) {
      return;
    }
    
    const pos = this.placementPreview.position;
    const rot = this.placementPreview.rotation;
    
    const data: LevelObject = {
      type: this.placementItem.type,
      position: [pos.x, 0, pos.z],
      rotation: [
        THREE.MathUtils.radToDeg(rot.x),
        THREE.MathUtils.radToDeg(rot.y),
        THREE.MathUtils.radToDeg(rot.z)
      ],
      params: this.placementItem.defaultParams ? { ...this.placementItem.defaultParams } : undefined
    };
    
    this.addObject(data);
    
    // Don't cancel placement - allow multiple placements
    // Reset preview rotation
    this.placementPreview.rotation.set(0, 0, 0);
  }
  
  // =============================================
  // OBJECT CREATION
  // =============================================
  
  addObject(data: LevelObject): EditorObject {
    // Add to level data
    this.level.objects.push(data);
    
    // Create mesh
    const mesh = this.createObjectMesh(data.type, data.params);
    mesh.position.set(data.position[0], data.position[1], data.position[2]);
    
    if (data.rotation) {
      mesh.rotation.set(
        THREE.MathUtils.degToRad(data.rotation[0]),
        THREE.MathUtils.degToRad(data.rotation[1]),
        THREE.MathUtils.degToRad(data.rotation[2])
      );
    }
    
    this.scene.add(mesh);
    
    const editorObj: EditorObject = {
      id: `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      mesh,
      data
    };
    
    this.objects.push(editorObj);
    this.callbacks.onObjectsChanged?.();
    
    return editorObj;
  }
  
  createObjectMesh(type: ObjectType, params?: Record<string, unknown>): THREE.Object3D {
    switch (type) {
      case 'rail':
        return this.createRailMesh(params?.length as number || 10);
      case 'ramp':
        return this.createRampMesh();
      case 'quarter_pipe':
      case 'quarter_pipe_small':
      case 'quarter_pipe_med':
      case 'quarter_pipe_large':
        return this.createQuarterPipeMesh();
      case 'half_pipe':
        return this.createHalfPipeMesh(params);
      case 'fun_box':
        return this.createFunBoxMesh(params);
      case 'stairs':
        return this.createStairsMesh(params?.steps as number || 5);
      case 'cubicle':
        return this.createCubicleMesh(params);
      case 'car':
        return this.createCarMesh();
      case 'bench':
        return this.createBenchMesh();
      case 'planter':
        return this.createPlanterMesh();
      case 'water_cooler':
        return this.createWaterCoolerMesh();
      case 'trash_can':
        return this.createTrashCanMesh();
      case 'cone':
        return this.createConeMesh();
      case 'barrier':
        return this.createBarrierMesh(params?.length as number || 5);
      case 'building_small':
      case 'building_medium':
      case 'building_large':
      case 'building_wide':
        return this.createBuildingMesh(type, params);
      case 'shrub_small':
        return this.createShrubMesh(0.5, 0.6);
      case 'shrub_medium':
        return this.createShrubMesh(0.8, 1.0);
      case 'shrub_large':
        return this.createShrubMesh(1.2, 1.5);
      case 'tree_small':
        return this.createTreeMesh();
      default:
        // Default cube for unknown types
        const geom = new THREE.BoxGeometry(1, 1, 1);
        return new THREE.Mesh(geom, this.materials.get('concrete')!);
    }
  }
  
  private createBuildingMesh(type: string, params?: Record<string, unknown>): THREE.Group {
    const group = new THREE.Group();
    
    // Default sizes based on type
    const defaults: Record<string, { width: number; depth: number; height: number }> = {
      'building_small': { width: 10, depth: 10, height: 15 },
      'building_medium': { width: 15, depth: 15, height: 30 },
      'building_large': { width: 20, depth: 20, height: 50 },
      'building_wide': { width: 30, depth: 15, height: 12 },
    };
    
    const def = defaults[type] || defaults['building_small'];
    const width = (params?.width as number) || def.width;
    const depth = (params?.depth as number) || def.depth;
    const height = (params?.height as number) || def.height;
    
    // Building body
    const buildingMat = new THREE.MeshStandardMaterial({ 
      color: 0x808090,
      roughness: 0.7,
      metalness: 0.1
    });
    const bodyGeom = new THREE.BoxGeometry(width, height, depth);
    const body = new THREE.Mesh(bodyGeom, buildingMat);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    
    // Windows (simple stripes)
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x4488aa,
      roughness: 0.1,
      metalness: 0.8
    });
    
    const windowRows = Math.floor(height / 3);
    const windowCols = Math.floor(width / 3);
    
    for (let row = 0; row < windowRows; row++) {
      for (let col = 0; col < windowCols; col++) {
        const windowGeom = new THREE.BoxGeometry(1.5, 2, 0.1);
        const window = new THREE.Mesh(windowGeom, windowMat);
        window.position.set(
          -width / 2 + 1.5 + col * 3,
          2 + row * 3,
          depth / 2 + 0.05
        );
        group.add(window);
        
        // Back side
        const windowBack = window.clone();
        windowBack.position.z = -depth / 2 - 0.05;
        group.add(windowBack);
      }
    }
    
    return group;
  }
  
  private createShrubMesh(radius: number, height: number): THREE.Group {
    const group = new THREE.Group();
    
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x228833,
      roughness: 0.8
    });
    
    // Create multiple spheres for organic look
    const numBalls = 5;
    for (let i = 0; i < numBalls; i++) {
      const r = radius * (0.6 + Math.random() * 0.4);
      const sphereGeom = new THREE.SphereGeometry(r, 8, 6);
      const sphere = new THREE.Mesh(sphereGeom, leafMat);
      sphere.position.set(
        (Math.random() - 0.5) * radius,
        height * 0.5 + (Math.random() - 0.5) * height * 0.3,
        (Math.random() - 0.5) * radius
      );
      sphere.castShadow = true;
      group.add(sphere);
    }
    
    return group;
  }
  
  private createTreeMesh(): THREE.Group {
    const group = new THREE.Group();
    
    // Trunk
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
    const trunkGeom = new THREE.CylinderGeometry(0.15, 0.2, 2, 8);
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 1;
    trunk.castShadow = true;
    group.add(trunk);
    
    // Foliage
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 });
    const foliageGeom = new THREE.ConeGeometry(1.5, 3, 8);
    const foliage = new THREE.Mesh(foliageGeom, leafMat);
    foliage.position.y = 3.5;
    foliage.castShadow = true;
    group.add(foliage);
    
    return group;
  }
  
  private createRailMesh(length: number): THREE.Group {
    const group = new THREE.Group();
    const railMat = this.materials.get('rail')!;
    const metalMat = this.materials.get('metal')!;
    
    const railGeom = new THREE.BoxGeometry(length, 0.08, 0.08);
    const rail = new THREE.Mesh(railGeom, railMat);
    rail.position.y = 0.8;
    rail.castShadow = true;
    group.add(rail);
    
    const postGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.8);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeom, metalMat);
      post.position.set(side * (length / 2 - 0.2), 0.4, 0);
      post.castShadow = true;
      group.add(post);
    }
    
    return group;
  }
  
  private createRampMesh(): THREE.Group {
    const group = new THREE.Group();
    const mat = this.materials.get('wood')!;
    
    const rampGeom = new THREE.BoxGeometry(4, 0.15, 3);
    const ramp = new THREE.Mesh(rampGeom, mat);
    ramp.position.set(0, 0.6, 0);
    ramp.rotation.x = -Math.PI / 8;
    ramp.castShadow = true;
    group.add(ramp);
    
    const sideGeom = new THREE.BoxGeometry(0.1, 0.8, 3.2);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(sideGeom, mat);
      wall.position.set(side * 2, 0.4, 0);
      group.add(wall);
    }
    
    return group;
  }
  
  private createQuarterPipeMesh(): THREE.Mesh {
    const mat = this.materials.get('concrete')!;
    
    const shape = new THREE.Shape();
    const radius = 4;
    const segments = 16;
    
    shape.moveTo(0, 0);
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI / 2;
      shape.lineTo(radius - Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    shape.lineTo(radius, 0);
    shape.lineTo(0, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: 10,
      bevelEnabled: false
    });
    
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }
  
  private createHalfPipeMesh(params?: Record<string, unknown>): THREE.Group {
    const width = (params?.width as number) || 15;
    const length = (params?.length as number) || 20;
    const mat = this.materials.get('concrete')!;
    const group = new THREE.Group();
    
    const shape = new THREE.Shape();
    const radius = 4;
    const segments = 16;
    
    shape.moveTo(0, 0);
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI / 2;
      shape.lineTo(radius - Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    shape.lineTo(radius, 0);
    shape.lineTo(0, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: length,
      bevelEnabled: false
    });
    
    const left = new THREE.Mesh(geometry, mat);
    left.position.set(-width / 2, 0, -length / 2);
    left.rotation.y = Math.PI / 2;
    group.add(left);
    
    const right = new THREE.Mesh(geometry, mat);
    right.position.set(width / 2, 0, length / 2);
    right.rotation.y = -Math.PI / 2;
    group.add(right);
    
    const bottomGeom = new THREE.BoxGeometry(width - 8, 0.1, length);
    const bottom = new THREE.Mesh(bottomGeom, mat);
    bottom.position.set(0, 0.05, 0);
    group.add(bottom);
    
    return group;
  }
  
  private createFunBoxMesh(params?: Record<string, unknown>): THREE.Group {
    const width = (params?.width as number) || 6;
    const depth = (params?.depth as number) || 4;
    const height = (params?.height as number) || 0.8;
    
    const group = new THREE.Group();
    const mat = this.materials.get('concrete')!;
    const railMat = this.materials.get('rail')!;
    
    const boxGeom = new THREE.BoxGeometry(width, height, depth);
    const box = new THREE.Mesh(boxGeom, mat);
    box.position.y = height / 2;
    box.castShadow = true;
    group.add(box);
    
    const railGeom = new THREE.BoxGeometry(width, 0.06, 0.06);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeom, railMat);
      rail.position.set(0, height + 0.03, side * (depth / 2 - 0.03));
      group.add(rail);
    }
    
    return group;
  }
  
  private createStairsMesh(steps: number): THREE.Group {
    const group = new THREE.Group();
    const mat = this.materials.get('concrete')!;
    
    const stepWidth = 4;
    const stepHeight = 0.2;
    const stepDepth = 0.3;
    
    for (let i = 0; i < steps; i++) {
      const stepGeom = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
      const step = new THREE.Mesh(stepGeom, mat);
      step.position.set(0, stepHeight / 2 + i * stepHeight, i * stepDepth);
      step.castShadow = true;
      group.add(step);
    }
    
    return group;
  }
  
  private createCubicleMesh(params?: Record<string, unknown>): THREE.Group {
    const width = (params?.width as number) || 3;
    const depth = (params?.depth as number) || 3;
    const height = 1.5;
    
    const group = new THREE.Group();
    const wallMat = this.materials.get('office')!;
    const deskMat = this.materials.get('wood')!;
    
    const wallGeom = new THREE.BoxGeometry(width, height, 0.05);
    const backWall = new THREE.Mesh(wallGeom, wallMat);
    backWall.position.set(0, height / 2, depth / 2);
    group.add(backWall);
    
    const sideWallGeom = new THREE.BoxGeometry(0.05, height, depth);
    for (const side of [-1, 1]) {
      const sideWall = new THREE.Mesh(sideWallGeom, wallMat);
      sideWall.position.set(side * width / 2, height / 2, 0);
      group.add(sideWall);
    }
    
    const deskGeom = new THREE.BoxGeometry(width * 0.8, 0.05, depth * 0.4);
    const desk = new THREE.Mesh(deskGeom, deskMat);
    desk.position.set(0, 0.75, depth * 0.2);
    group.add(desk);
    
    return group;
  }
  
  private createCarMesh(): THREE.Group {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, metalness: 0.8, roughness: 0.3 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    
    const bodyGeom = new THREE.BoxGeometry(2, 1, 4);
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);
    
    const topGeom = new THREE.BoxGeometry(1.5, 0.6, 2);
    const top = new THREE.Mesh(topGeom, bodyMat);
    top.position.set(0, 1.6, -0.3);
    group.add(top);
    
    const wheelGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 12);
    const positions = [
      [-0.9, 0.3, 1.3], [0.9, 0.3, 1.3],
      [-0.9, 0.3, -1.3], [0.9, 0.3, -1.3]
    ];
    
    for (const [x, y, z] of positions) {
      const wheel = new THREE.Mesh(wheelGeom, wheelMat);
      wheel.position.set(x, y, z);
      wheel.rotation.z = Math.PI / 2;
      group.add(wheel);
    }
    
    return group;
  }
  
  private createBenchMesh(): THREE.Group {
    const group = new THREE.Group();
    const woodMat = this.materials.get('wood')!;
    const metalMat = this.materials.get('metal')!;
    
    const seatGeom = new THREE.BoxGeometry(2, 0.1, 0.5);
    const seat = new THREE.Mesh(seatGeom, woodMat);
    seat.position.y = 0.5;
    group.add(seat);
    
    const legGeom = new THREE.BoxGeometry(0.1, 0.5, 0.4);
    for (const side of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(legGeom, metalMat);
      leg.position.set(side, 0.25, 0);
      group.add(leg);
    }
    
    return group;
  }
  
  private createPlanterMesh(): THREE.Group {
    const group = new THREE.Group();
    
    const boxGeom = new THREE.BoxGeometry(2, 0.8, 2);
    const boxMat = this.materials.get('concrete')!;
    const box = new THREE.Mesh(boxGeom, boxMat);
    box.position.y = 0.4;
    group.add(box);
    
    const trunkGeom = new THREE.CylinderGeometry(0.1, 0.15, 1);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3020 });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 1.3;
    group.add(trunk);
    
    const foliageGeom = new THREE.SphereGeometry(0.6, 8, 8);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x228b22 });
    const foliage = new THREE.Mesh(foliageGeom, foliageMat);
    foliage.position.y = 2;
    group.add(foliage);
    
    return group;
  }
  
  private createWaterCoolerMesh(): THREE.Group {
    const group = new THREE.Group();
    
    const bodyGeom = new THREE.CylinderGeometry(0.2, 0.25, 1, 12);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6688aa });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.5;
    group.add(body);
    
    const jugGeom = new THREE.CylinderGeometry(0.15, 0.18, 0.4, 12);
    const jugMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6 });
    const jug = new THREE.Mesh(jugGeom, jugMat);
    jug.position.y = 1.2;
    group.add(jug);
    
    return group;
  }
  
  private createTrashCanMesh(): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(0.25, 0.2, 0.6, 12);
    const material = this.materials.get('metal')!;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.3;
    return mesh;
  }
  
  private createConeMesh(): THREE.Mesh {
    const geometry = new THREE.ConeGeometry(0.2, 0.5, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0xff6600 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.25;
    return mesh;
  }
  
  private createBarrierMesh(length: number): THREE.Group {
    const group = new THREE.Group();
    
    const barrierGeom = new THREE.BoxGeometry(length, 0.8, 0.1);
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
    const barrier = new THREE.Mesh(barrierGeom, barrierMat);
    barrier.position.y = 0.5;
    group.add(barrier);
    
    const legGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.8);
    const legMat = this.materials.get('metal')!;
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeom, legMat);
      leg.position.set(side * (length / 2 - 0.1), 0.4, 0);
      group.add(leg);
    }
    
    return group;
  }
  
  // =============================================
  // SPAWN POINT
  // =============================================
  
  updateSpawnMarker(): void {
    if (this.spawnMarker) {
      this.scene.remove(this.spawnMarker);
    }
    
    const group = new THREE.Group();
    
    // Arrow shape pointing forward
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const bodyGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8);
    const body = new THREE.Mesh(bodyGeom, arrowMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);
    
    const headGeom = new THREE.ConeGeometry(0.5, 0.5, 8);
    const head = new THREE.Mesh(headGeom, arrowMat);
    head.rotation.x = -Math.PI / 2;
    head.position.z = 0.5;
    group.add(head);
    
    // Vertical pole
    const poleGeom = new THREE.CylinderGeometry(0.05, 0.05, 2);
    const pole = new THREE.Mesh(poleGeom, arrowMat);
    pole.position.y = 1;
    group.add(pole);
    
    const sp = this.level.spawnPoint;
    group.position.set(sp.position[0], 0.5, sp.position[2]);
    group.rotation.y = THREE.MathUtils.degToRad(sp.rotation);
    
    this.spawnMarker = group;
    this.scene.add(group);
  }
  
  setSpawnPoint(x: number, z: number, rotation: number): void {
    this.level.spawnPoint = {
      position: [x, 0.5, z],
      rotation
    };
    this.updateSpawnMarker();
    this.callbacks.onLevelChanged?.();
  }
  
  /**
   * Start spawn point placement mode - click to place
   */
  startSpawnPlacement(callback: (x: number, z: number) => void): void {
    this.isPlacingSpawn = true;
    this.onSpawnPlaced = callback;
    // Temporarily disable other interactions
    this.cancelPlacement();
    this.deselectObject();
  }
  
  // =============================================
  // LEVEL MANAGEMENT
  // =============================================
  
  newLevel(): void {
    this.clearLevel();
    this.level = EditorStorage.createNewLevel();
    this.updateEnvironment();
    this.updateSpawnMarker();
    this.callbacks.onLevelChanged?.();
  }
  
  loadLevel(level: EditorLevelData): void {
    this.clearLevel();
    this.level = level;
    
    // Create objects
    for (const objData of level.objects) {
      const mesh = this.createObjectMesh(objData.type, objData.params);
      mesh.position.set(objData.position[0], objData.position[1], objData.position[2]);
      
      if (objData.rotation) {
        mesh.rotation.set(
          THREE.MathUtils.degToRad(objData.rotation[0]),
          THREE.MathUtils.degToRad(objData.rotation[1]),
          THREE.MathUtils.degToRad(objData.rotation[2])
        );
      }
      
      this.scene.add(mesh);
      
      this.objects.push({
        id: `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        mesh,
        data: objData
      });
    }
    
    this.updateEnvironment();
    this.updateSpawnMarker();
    this.callbacks.onLevelChanged?.();
  }
  
  clearLevel(): void {
    this.deselectObject();
    this.cancelPlacement();
    
    for (const obj of this.objects) {
      this.scene.remove(obj.mesh);
    }
    this.objects = [];
    
    if (this.spawnMarker) {
      this.scene.remove(this.spawnMarker);
      this.spawnMarker = null;
    }
  }
  
  updateEnvironment(): void {
    // Update sky color
    this.scene.background = new THREE.Color(this.level.skyColor);
    
    // Update grid size
    this.scene.remove(this.gridHelper);
    this.gridHelper = new THREE.GridHelper(this.level.groundSize, this.level.groundSize, 0x444444, 0x888888);
    this.scene.add(this.gridHelper);
    
    // Update ground plane color and size
    const groundMat = this.groundPlane.material as THREE.MeshStandardMaterial;
    groundMat.color.set(this.level.groundColor);
    this.groundPlane.scale.set(this.level.groundSize / 200, this.level.groundSize / 200, 1);
  }
  
  save(): boolean {
    return EditorStorage.saveLevel(this.level);
  }
  
  exportLevel(): void {
    EditorStorage.exportLevel(this.level);
  }
  
  async importLevel(file: File): Promise<boolean> {
    const level = await EditorStorage.importLevel(file);
    if (level) {
      this.loadLevel(level);
      return true;
    }
    return false;
  }
  
  // =============================================
  // GETTERS / SETTERS
  // =============================================
  
  getLevel(): EditorLevelData {
    return this.level;
  }
  
  setLevelProperty<K extends keyof EditorLevelData>(key: K, value: EditorLevelData[K]): void {
    this.level[key] = value;
    
    if (['skyColor', 'groundColor', 'groundSize'].includes(key as string)) {
      this.updateEnvironment();
    }
    
    this.callbacks.onLevelChanged?.();
  }
  
  getSelectedObject(): EditorObject | null {
    return this.selectedObject;
  }
  
  setGridSnap(value: number): void {
    this.gridSnap = value;
  }
  
  toggleGridSnap(): void {
    this.gridSnap = this.gridSnap > 0 ? 0 : 1;
  }
  
  setShowGrid(show: boolean): void {
    this.gridHelper.visible = show;
  }
  
  private startAutosave(): void {
    this.autosaveTimer = window.setInterval(() => {
      EditorStorage.autosave(this.level);
    }, 30000); // Every 30 seconds
  }
  
  // =============================================
  // UNDO/REDO SYSTEM
  // =============================================
  
  private saveUndoState(): void {
    // Save current state as JSON
    const state = JSON.stringify(this.level.objects);
    
    // Don't save if same as last state
    if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === state) {
      return;
    }
    
    this.undoStack.push(state);
    
    // Limit stack size
    if (this.undoStack.length > this.maxUndoSteps) {
      this.undoStack.shift();
    }
    
    // Clear redo stack on new action
    this.redoStack = [];
    
    this.updateUndoRedoButtons();
  }
  
  undo(): void {
    if (this.undoStack.length <= 1) return;  // Keep at least initial state
    
    // Save current state to redo
    const currentState = this.undoStack.pop()!;
    this.redoStack.push(currentState);
    
    // Restore previous state
    const previousState = this.undoStack[this.undoStack.length - 1];
    this.restoreState(previousState);
    
    this.updateUndoRedoButtons();
  }
  
  redo(): void {
    if (this.redoStack.length === 0) return;
    
    // Get redo state
    const redoState = this.redoStack.pop()!;
    this.undoStack.push(redoState);
    
    // Restore it
    this.restoreState(redoState);
    
    this.updateUndoRedoButtons();
  }
  
  private restoreState(stateJson: string): void {
    // Clear current objects
    this.objects.forEach(obj => {
      this.scene.remove(obj.mesh);
    });
    this.objects = [];
    this.deselectObject();
    
    // Restore from JSON
    const objects = JSON.parse(stateJson) as LevelObject[];
    this.level.objects = objects;
    
    // Recreate meshes
    objects.forEach(objData => {
      const mesh = this.createObjectMesh(objData.type, objData.params);
      if (mesh) {
        // Apply position/rotation/scale
        mesh.position.set(...objData.position);
        if (objData.rotation) {
          mesh.rotation.set(
            THREE.MathUtils.degToRad(objData.rotation[0]),
            THREE.MathUtils.degToRad(objData.rotation[1]),
            THREE.MathUtils.degToRad(objData.rotation[2])
          );
        }
        if (objData.scale) {
          mesh.scale.set(...objData.scale);
        }
        
        const editorObj: EditorObject = {
          id: `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          mesh,
          data: objData
        };
        this.objects.push(editorObj);
        this.scene.add(mesh);
      }
    });
    
    this.callbacks.onObjectsChanged?.();
  }
  
  private updateUndoRedoButtons(): void {
    const undoBtn = this.toolbarContainer?.querySelector('#undo-btn') as HTMLButtonElement;
    const redoBtn = this.toolbarContainer?.querySelector('#redo-btn') as HTMLButtonElement;
    
    if (undoBtn) undoBtn.disabled = this.undoStack.length <= 1;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  }
  
  // =============================================
  // TOOLBAR & TOOLS
  // =============================================
  
  private createToolbar(container: HTMLElement): void {
    this.toolbarContainer = document.createElement('div');
    this.toolbarContainer.id = 'editor-toolbar';
    this.toolbarContainer.style.cssText = `
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 5px;
      padding: 8px;
      background: rgba(0,0,0,0.7);
      border-radius: 8px;
      z-index: 100;
      font-family: 'Kanit', sans-serif;
    `;
    
    const tools = [
      { id: 'select', icon: '🖱️', label: 'Select', key: 'V' },
      { id: 'move', icon: '✥', label: 'Move', key: 'G' },
      { id: 'rotate', icon: '↻', label: 'Rotate', key: 'R' },
      { id: 'pencil', icon: '✏️', label: 'Pencil', key: 'P' },
      { id: 'paint', icon: '🖌️', label: 'Paint', key: 'B' },
    ];
    
    // Undo/Redo buttons
    const undoBtn = this.createToolbarButton('undo-btn', '↩️', 'Undo (Ctrl+Z)', () => this.undo());
    const redoBtn = this.createToolbarButton('redo-btn', '↪️', 'Redo (Ctrl+Y)', () => this.redo());
    this.toolbarContainer.appendChild(undoBtn);
    this.toolbarContainer.appendChild(redoBtn);
    
    // Separator
    const sep = document.createElement('div');
    sep.style.cssText = 'width: 2px; background: #555; margin: 0 5px;';
    this.toolbarContainer.appendChild(sep);
    
    // Tool buttons
    tools.forEach(tool => {
      const btn = this.createToolbarButton(
        `tool-${tool.id}`,
        tool.icon,
        `${tool.label} (${tool.key})`,
        () => this.setTool(tool.id as typeof this.currentTool)
      );
      btn.classList.add('tool-btn');
      if (tool.id === this.currentTool) {
        btn.style.background = '#0a0';
        btn.style.borderColor = '#0f0';
      }
      this.toolbarContainer!.appendChild(btn);
    });
    
    container.appendChild(this.toolbarContainer);
    this.updateUndoRedoButtons();
  }
  
  private createToolbarButton(id: string, icon: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = id;
    btn.textContent = icon;
    btn.title = title;
    btn.style.cssText = `
      width: 36px;
      height: 36px;
      font-size: 18px;
      background: #333;
      color: #fff;
      border: 2px solid #555;
      border-radius: 4px;
      cursor: pointer;
    `;
    btn.onclick = onClick;
    btn.onmouseenter = () => { if (!btn.classList.contains('active')) btn.style.background = '#444'; };
    btn.onmouseleave = () => { if (!btn.classList.contains('active')) btn.style.background = '#333'; };
    return btn;
  }
  
  setTool(tool: typeof this.currentTool): void {
    this.currentTool = tool;
    
    // Update button styles
    this.toolbarContainer?.querySelectorAll('.tool-btn').forEach(btn => {
      const isActive = btn.id === `tool-${tool}`;
      (btn as HTMLElement).style.background = isActive ? '#0a0' : '#333';
      (btn as HTMLElement).style.borderColor = isActive ? '#0f0' : '#555';
      btn.classList.toggle('active', isActive);
    });
    
    // Update transform controls mode
    if (tool === 'move') {
      this.transformControls.setMode('translate');
      this.transformControls.enabled = true;
    } else if (tool === 'rotate') {
      this.transformControls.setMode('rotate');
      this.transformControls.enabled = true;
    } else {
      this.transformControls.enabled = tool === 'select';
    }
    
    // Enable orbit controls for select mode, disable for others when clicking
    this.orbitControls.enableRotate = tool === 'select';
    this.orbitControls.enablePan = tool === 'select';
  }
  
  private handlePaintStroke(deleteMode: boolean): void {
    if (!this.placementMode || !this.placementItem) return;
    
    // Get current position
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.groundPlane);
    
    if (intersects.length > 0) {
      const pos = intersects[0].point;
      
      // Check minimum distance from last paint position
      if (this.lastPaintPosition) {
        const dist = pos.distanceTo(this.lastPaintPosition);
        if (dist < this.paintMinDistance) return;
      }
      
      if (deleteMode) {
        this.deleteObjectAtMouse();
      } else {
        this.placeObject();
      }
      
      this.lastPaintPosition = pos.clone();
    }
  }
  
  private deleteObjectAtMouse(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const meshes = this.objects.map(o => o.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, true);
    
    if (intersects.length > 0) {
      // Find the EditorObject for this mesh
      let hitMesh = intersects[0].object;
      while (hitMesh.parent && !this.objects.find(o => o.mesh === hitMesh)) {
        hitMesh = hitMesh.parent as THREE.Object3D;
      }
      
      const obj = this.objects.find(o => o.mesh === hitMesh);
      if (obj) {
        this.scene.remove(obj.mesh);
        this.objects = this.objects.filter(o => o !== obj);
        const dataIdx = this.level.objects.indexOf(obj.data);
        if (dataIdx >= 0) this.level.objects.splice(dataIdx, 1);
        this.callbacks.onObjectsChanged?.();
        this.saveUndoState();
      }
    }
  }
  
  // =============================================
  // CAMERA & VIEW CONTROLS
  // =============================================
  
  /**
   * Toggle between perspective and orthographic camera
   */
  toggleCameraMode(): boolean {
    this.isOrthographic = !this.isOrthographic;
    
    // Copy position and target from current camera
    const position = this.camera.position.clone();
    const target = this.orbitControls.target.clone();
    
    // Switch camera
    this.camera = this.isOrthographic ? this.orthoCamera : this.perspCamera;
    this.camera.position.copy(position);
    this.camera.lookAt(target);
    
    // Update controls
    this.orbitControls.object = this.camera;
    this.transformControls.camera = this.camera;
    
    // Update button state in view cube
    const modeBtn = this.viewCubeContainer?.querySelector('#camera-mode-btn') as HTMLElement;
    if (modeBtn) {
      modeBtn.textContent = this.isOrthographic ? 'ORTHO' : 'PERSP';
    }
    
    return this.isOrthographic;
  }
  
  /**
   * Snap camera to a preset view
   */
  snapToView(view: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'): void {
    const distance = 50;
    const target = this.orbitControls.target.clone();
    
    const positions: Record<string, THREE.Vector3> = {
      'top':    new THREE.Vector3(target.x, target.y + distance, target.z),
      'bottom': new THREE.Vector3(target.x, target.y - distance, target.z),
      'front':  new THREE.Vector3(target.x, target.y, target.z + distance),
      'back':   new THREE.Vector3(target.x, target.y, target.z - distance),
      'left':   new THREE.Vector3(target.x - distance, target.y, target.z),
      'right':  new THREE.Vector3(target.x + distance, target.y, target.z),
    };
    
    const newPos = positions[view];
    if (newPos) {
      // Animate camera position
      const startPos = this.camera.position.clone();
      const duration = 300;
      const startTime = performance.now();
      
      const animateCamera = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // Ease out cubic
        
        this.camera.position.lerpVectors(startPos, newPos, eased);
        this.camera.lookAt(target);
        
        if (t < 1) {
          requestAnimationFrame(animateCamera);
        }
      };
      
      animateCamera();
    }
  }
  
  /**
   * Create the view cube UI in the top-right corner
   */
  private createViewCube(container: HTMLElement): void {
    this.viewCubeContainer = document.createElement('div');
    this.viewCubeContainer.id = 'view-cube';
    this.viewCubeContainer.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      z-index: 100;
      font-family: 'Kanit', sans-serif;
    `;
    
    // Camera mode toggle button
    const modeBtn = document.createElement('button');
    modeBtn.id = 'camera-mode-btn';
    modeBtn.textContent = 'PERSP';
    modeBtn.style.cssText = `
      padding: 8px 12px;
      font-size: 12px;
      font-weight: bold;
      background: #333;
      color: #0f0;
      border: 2px solid #0f0;
      border-radius: 4px;
      cursor: pointer;
    `;
    modeBtn.onclick = () => this.toggleCameraMode();
    this.viewCubeContainer.appendChild(modeBtn);
    
    // View cube (3x3 grid representing a cube)
    const cubeContainer = document.createElement('div');
    cubeContainer.style.cssText = `
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(3, 1fr);
      gap: 2px;
      width: 90px;
      height: 90px;
      background: rgba(0,0,0,0.5);
      padding: 5px;
      border-radius: 4px;
    `;
    
    // View buttons layout:
    // [   ] [TOP] [   ]
    // [LFT] [FRT] [RGT]
    // [   ] [BOT] [   ]
    const views = [
      { label: '', view: null },
      { label: 'T', view: 'top' as const },
      { label: '', view: null },
      { label: 'L', view: 'left' as const },
      { label: 'F', view: 'front' as const },
      { label: 'R', view: 'right' as const },
      { label: 'Bk', view: 'back' as const },
      { label: 'B', view: 'bottom' as const },
      { label: '', view: null },
    ];
    
    views.forEach(({ label, view }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        width: 26px;
        height: 26px;
        font-size: 10px;
        font-weight: bold;
        background: ${view ? '#444' : 'transparent'};
        color: #fff;
        border: ${view ? '1px solid #666' : 'none'};
        border-radius: 3px;
        cursor: ${view ? 'pointer' : 'default'};
      `;
      if (view) {
        btn.onclick = () => this.snapToView(view);
        btn.onmouseenter = () => btn.style.background = '#0a0';
        btn.onmouseleave = () => btn.style.background = '#444';
      }
      cubeContainer.appendChild(btn);
    });
    
    this.viewCubeContainer.appendChild(cubeContainer);
    container.appendChild(this.viewCubeContainer);
  }
  
  // =============================================
  // RENDER LOOP
  // =============================================
  
  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.orbitControls.update();
    this.renderer.render(this.scene, this.camera);
  };
  
  dispose(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
    }
    if (this.viewCubeContainer) {
      this.viewCubeContainer.remove();
    }
    if (this.toolbarContainer) {
      this.toolbarContainer.remove();
    }
    this.renderer.dispose();
    this.orbitControls.dispose();
    this.transformControls.dispose();
  }
}
