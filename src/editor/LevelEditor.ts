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
  private container: HTMLElement | null = null;
  
  private level: EditorLevelData;
  private objects: EditorObject[] = [];
  private selectedObject: EditorObject | null = null;
  
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
  
  constructor(container: HTMLElement, callbacks: EditorCallbacks = {}) {
    this.callbacks = callbacks;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Store container reference
    this.container = container;
    
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
    
    // Create invisible ground plane for raycasting
    const groundGeom = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshBasicMaterial({ visible: false });
    this.groundPlane = new THREE.Mesh(groundGeom, groundMat);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.name = 'ground-plane';
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
      this.handleClick(e);
    });
    
    // Mouse move for placement preview
    container.addEventListener('mousemove', (e) => {
      this.handleMouseMove(e, container);
    });
    
    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });
  }
  
  private handleClick(_e: MouseEvent): void {
    if (this.placementMode && this.placementItem) {
      // Place object
      this.placeObject();
    } else {
      // Select object
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
  }
  
  deleteSelectedObject(): void {
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
      default:
        // Default cube for unknown types
        const geom = new THREE.BoxGeometry(1, 1, 1);
        return new THREE.Mesh(geom, this.materials.get('concrete')!);
    }
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
    this.scene.background = new THREE.Color(this.level.skyColor);
    // Update grid size
    this.scene.remove(this.gridHelper);
    this.gridHelper = new THREE.GridHelper(this.level.groundSize, this.level.groundSize, 0x444444, 0x888888);
    this.scene.add(this.gridHelper);
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
    
    if (['skyColor', 'groundSize'].includes(key as string)) {
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
    this.renderer.dispose();
    this.orbitControls.dispose();
    this.transformControls.dispose();
  }
}
