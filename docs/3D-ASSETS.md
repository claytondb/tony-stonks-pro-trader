# Tony Stonks Pro Trader
## 3D Asset Specification & Sourcing Guide

---

## 1. Technical Standards

### Polygon Budgets
| Category | Hero (Close) | Medium | Background |
|----------|-------------|--------|------------|
| Characters | 15,000 | 8,000 | 3,000 |
| Chairs | 5,000 | 2,500 | 1,000 |
| Props (Large) | 3,000 | 1,500 | 500 |
| Props (Small) | 1,000 | 500 | 200 |
| Environment | - | 50,000 total | 20,000 total |

### Texture Standards
| Type | Resolution | Format |
|------|------------|--------|
| Characters | 2048×2048 | PNG (albedo), JPEG (others) |
| Props | 1024×1024 | PNG/JPEG |
| Environment | 2048×2048 (tiled) | JPEG |
| UI Elements | 512×512 | PNG with alpha |

### Material Channels
- Albedo/Diffuse
- Normal Map
- Roughness/Metallic (combined)
- Ambient Occlusion (baked into albedo for mobile)
- Emissive (where needed)

### LOD Requirements
- LOD0: Full detail (0-10m)
- LOD1: 50% reduction (10-25m)
- LOD2: 25% original (25m+)
- Billboard: Characters only (50m+)

---

## 2. Characters

### Tony Stonks (Protagonist)

**Base Mesh:** Male office worker, mid-30s
- Poly count: 12,000-15,000 (rigged)
- Height: 1.8 units (standard human scale)
- Rig: Humanoid with extra bones for clothing physics

**Variants/Outfits:**
| Outfit | Description | Texture Set |
|--------|-------------|-------------|
| Business Casual | Khakis, polo | Default |
| Full Suit | Navy suit, tie | Swap |
| Hawaiian Friday | Loud shirt, shorts | Swap |
| Warehouse Worker | Coveralls | Swap |
| Security Disguise | Guard uniform | Swap |
| CEO Power Suit | Expensive, pinstripe | Swap |
| Pajamas | Plaid, slippers | Swap (secret) |

**Free Sources:**
- Mixamo characters (modify): https://www.mixamo.com/
- ReadyPlayerMe base: https://readyplayer.me/
- Sketchfab free characters: Search "business man"

**Meshy Fallback Prompt:**
```
Professional office worker male, mid-30s, wearing business casual khaki pants 
and blue polo shirt, neutral pose, clean topology for game use, 
low-poly stylized, full body
```

---

### Agent Wallace

**Description:** Female FBI agent, professional, stern
- Poly count: 10,000
- Attire: Dark suit, sunglasses, badge

**Free Sources:**
- Sketchfab: "FBI agent female" / "business woman suit"
- Modify Mixamo base + texture swap

---

### Derek Margin

**Description:** Slimy executive, expensive suit, slicked hair
- Poly count: 10,000
- Attire: Designer suit, gold watch, smug expression

**Free Sources:**
- Modify existing business man models
- Sketchfab: "CEO character" / "businessman villain"

---

### Wheels McGee

**Description:** Older janitor, wise mentor vibes
- Poly count: 8,000
- Attire: Maintenance coveralls, mop (separate prop)

**Free Sources:**
- Sketchfab: "janitor character" / "maintenance worker"
- Modify older male bases

---

### Generic NPCs

| Type | Count | Poly Budget | Notes |
|------|-------|-------------|-------|
| Office Workers | 5-8 variants | 5,000 each | Mix of genders |
| Security Guards | 2 variants | 5,000 each | Uniform color swap |
| Police | 2 variants | 5,000 each | Patrol + SWAT |
| Pedestrians | 10 variants | 3,000 each | Background |

**Free Sources:**
- Quaternius low-poly characters: https://quaternius.com/
- Kenney character pack: https://kenney.nl/
- Sketchfab: "low poly human pack"

---

## 3. Office Chairs (Skateable Vehicles)

### Standard Office Chair (Starter)
**Description:** Basic black mesh office chair
- Poly count: 2,000
- Features: 5 casters, armrests, swivel
- Physics: 5 wheel colliders, seat collider

**Free Sources:**
- Sketchfab: "office chair" (many free options)
- CGTrader free section
- TurboSquid free

**Recommended:**
- https://sketchfab.com/3d-models/office-chair-free (multiple options)

---

### Executive Leather Throne
**Description:** High-back leather executive chair
- Poly count: 3,000
- Features: Leather texture, wood armrests, premium casters

---

### Gaming Chair (RGB)
**Description:** Racing-style gaming chair
- Poly count: 3,500
- Features: LED strips (emissive), bucket seat

**Free Sources:**
- Sketchfab: "gaming chair" - many free options
- https://sketchfab.com/3d-models/gaming-chair-free

---

### Ergonomic Mesh Pro
**Description:** Herman Miller-style ergonomic
- Poly count: 4,000
- Features: Mesh back, lumbar support, adjustable arms

---

### Vintage Wooden Swivel
**Description:** Old-school wooden banker's chair
- Poly count: 2,500
- Features: Wood grain, green leather seat

---

### Bean Bag (Joke)
**Description:** Bean bag chair with casters added
- Poly count: 1,500
- Features: Wobbly physics, low stats

---

### Shopping Cart (Secret)
**Description:** Metal shopping cart
- Poly count: 2,000
- Features: Best speed, worst balance

**Free Sources:**
- Sketchfab: "shopping cart" - many options

---

## 4. Environment Assets

### Office Building (Chapter 1 & 10)

**Modular Kit:**
| Asset | Dimensions | Poly Budget |
|-------|------------|-------------|
| Floor Tile | 2×2 units | 100 |
| Wall Section | 4×3 units | 200 |
| Cubicle Wall | 2×1.5 units | 300 |
| Cubicle Desk | 2×1 units | 500 |
| Window Section | 4×3 units | 300 |
| Door Frame | 1×2.5 units | 200 |
| Ceiling Tile | 2×2 units | 50 |

**Props:**
| Asset | Poly Budget | Grindable |
|-------|-------------|-----------|
| Desk | 800 | Edge: Yes |
| Conference Table | 1,200 | Edge: Yes |
| Filing Cabinet | 400 | Top: Yes |
| Bookshelf | 600 | Top: Yes |
| Water Cooler | 500 | No |
| Coffee Machine | 400 | No |
| Potted Plant | 300 | Pot rim: Yes |
| Office Chair (static) | 500 | No |
| Computer Monitor | 300 | No |
| Keyboard | 100 | No |
| Printer | 600 | Top: Yes |
| Whiteboard | 200 | Frame: Yes |
| Trash Can | 150 | Rim: Yes |

**Free Office Sources:**
- Kenney Furniture Kit: https://kenney.nl/assets/furniture-kit
- Quaternius Office: https://quaternius.com/
- Sketchfab: "office furniture pack"

---

### Parking Garage (Chapter 2)

**Structure:**
| Asset | Poly Budget |
|-------|-------------|
| Concrete Pillar | 200 |
| Parking Barrier | 150 (grindable) |
| Ramp Section | 400 |
| Wall Section | 200 |
| Ceiling w/ Pipes | 500 |
| Parking Lines (decal) | 0 |

**Props:**
| Asset | Poly Budget | Grindable |
|-------|-------------|-----------|
| Car (generic) | 2,000 | Hood/roof |
| Motorcycle | 1,500 | Seat |
| Parking Meter | 300 | No |
| Concrete Planter | 400 | Rim: Yes |
| Exit Sign | 100 | No |
| Security Camera | 150 | No |
| Dumpster | 500 | Lid: Yes |

**Free Sources:**
- Kenney Car Kit: https://kenney.nl/assets/car-kit
- Sketchfab: "parking garage" / "low poly car pack"

---

### Downtown Streets (Chapter 3)

**Structure:**
| Asset | Poly Budget |
|-------|-------------|
| Sidewalk Section | 100 |
| Road Section | 100 |
| Crosswalk | 100 |
| Building Facade (modular) | 500-2000 |
| Street Corner | 300 |

**Props:**
| Asset | Poly Budget | Grindable |
|-------|-------------|-----------|
| Bench | 400 | Seat: Yes |
| Trash Can | 200 | Rim: Yes |
| Fire Hydrant | 250 | Top: Yes |
| Street Light | 300 | No |
| Bus Stop | 600 | Bench + rail |
| Fountain | 2,000 | Rim: Yes |
| Newspaper Stand | 400 | Top: Yes |
| Mailbox | 200 | Top: Yes |
| Hot Dog Cart | 800 | Counter |
| Scaffolding | 1,000 | Rails: Yes |
| Taxi | 2,000 | Hood |
| Police Car | 2,500 | Hood |

**Free Sources:**
- Kenney City Kit: https://kenney.nl/assets/city-kit
- Quaternius Ultimate City: https://quaternius.com/
- Sketchfab: "city street props"

---

### Shopping Mall (Chapter 4)

**Structure:**
| Asset | Poly Budget |
|-------|-------------|
| Floor (polished) | 100 |
| Escalator | 2,000 (animated) |
| Elevator | 1,500 |
| Railing (grindable) | 200/section |
| Storefront | 800 |
| Kiosk | 600 |

**Props:**
| Asset | Poly Budget | Grindable |
|-------|-------------|-----------|
| Mall Bench | 400 | Yes |
| Planter Box | 500 | Rim |
| Food Court Table | 300 | No |
| Food Court Chair | 150 | No |
| Vending Machine | 500 | No |
| Directory Sign | 400 | No |
| Shopping Cart | 2,000 | Handlebar |
| Mannequin | 1,500 | No |

**Free Sources:**
- Sketchfab: "shopping mall" / "escalator" / "mall interior"

---

### Warehouse (Chapter 5)

**Structure:**
| Asset | Poly Budget |
|-------|-------------|
| Metal Shelving | 400/unit |
| Concrete Floor | 50 |
| Metal Wall | 150 |
| Loading Dock | 800 |
| Industrial Door | 600 |

**Props:**
| Asset | Poly Budget | Grindable |
|-------|-------------|-----------|
| Shipping Container | 500 | Top edges |
| Pallet | 100 | No |
| Forklift | 2,000 | Rails |
| Barrel | 200 | Rim |
| Crate Stack | 300 | Edges |
| Conveyor Belt | 600 | Rails |
| Industrial Pipe | 100/section | Yes |
| Catwalk | 400 | Rails: Yes |

**Free Sources:**
- Sketchfab: "warehouse" / "industrial props" / "shipping container"
- Kenney: Various industrial assets

---

### Rooftops (Chapter 6)

**Structure:**
| Asset | Poly Budget |
|-------|-------------|
| Rooftop Surface | 100 |
| Ledge/Parapet | 150 |
| AC Unit | 600 |
| Water Tower | 1,500 |
| Antenna Array | 400 |
| Vent Pipe | 100 |

**Props:**
| Asset | Poly Budget | Grindable |
|-------|-------------|-----------|
| AC Unit Rail | 200 | Yes |
| Satellite Dish | 400 | Rim |
| Skylight | 300 | Frame |
| Rooftop Garden Planter | 400 | Rim |
| Access Stairs | 600 | Rails |
| Helicopter Pad | 400 | No |

**Free Sources:**
- Sketchfab: "rooftop" / "rooftop props"

---

### Subway (Chapter 7)

**Structure:**
| Asset | Poly Budget |
|-------|-------------|
| Platform | 200 |
| Track Section | 300 |
| Tunnel | 400 |
| Pillar | 200 |
| Ticket Gate | 500 |

**Props:**
| Asset | Poly Budget | Grindable |
|-------|-------------|-----------|
| Subway Car | 4,000 | Top/window frame |
| Bench | 400 | Yes |
| Ticket Machine | 500 | No |
| Map Sign | 200 | Frame |
| Platform Edge (yellow) | - | Warning zone |
| Train Rails | - | YES (main grind) |
| Third Rail (electric) | - | Hazard |

**Free Sources:**
- Sketchfab: "subway station" / "metro train"

---

### Financial District (Chapter 8)

**Structure:**
| Asset | Poly Budget |
|-------|-------------|
| Skyscraper (distant) | 500 |
| Bank Facade | 2,000 |
| Stock Exchange | 3,000 |
| Plaza Tiles | 100 |

**Props:**
| Asset | Poly Budget | Grindable |
|-------|-------------|-----------|
| Bull Statue | 3,000 | Horns, back |
| Flagpole | 200 | No |
| Modern Sculpture | 1,500 | Abstract grinds |
| ATM | 400 | No |
| Premium Bench | 500 | Yes |

**Free Sources:**
- Sketchfab: "wall street" / "bull statue" / "stock exchange"

---

### Docks (Chapter 9)

**Structure:**
| Asset | Poly Budget |
|-------|-------------|
| Wooden Dock | 300 |
| Concrete Pier | 200 |
| Warehouse External | 1,500 |
| Crane | 2,500 |
| Ship (background) | 2,000 |

**Props:**
| Asset | Poly Budget | Grindable |
|-------|-------------|-----------|
| Cargo Net | 400 | No |
| Wooden Crate | 200 | Edges |
| Anchor | 500 | No |
| Rope Coil | 200 | No |
| Life Preserver | 150 | No |
| Boat (small) | 1,000 | Edges |

**Free Sources:**
- Sketchfab: "dock" / "harbor" / "shipping port"

---

## 5. Grindable Object Specifications

**Grind Detection Requirements:**
- Objects need a "grindable" child collider along grind path
- Collider: Capsule or box following rail line
- Tagged: "Grindable"
- Properties: grindType (rail/edge/lip), grindLength, difficulty

**Standard Rail Profile:**
```
Width: 0.1 units
Height from ground: 0.8-1.2 units (knee-waist height)
Minimum length: 2 units
```

**Edge Grind Profile:**
```
Width: 0.05-0.15 units
Height: variable (desks, planters, etc.)
Must have flat-ish top surface
```

---

## 6. Lighting Specifications

### Office Interior
- **Key:** Overhead fluorescent (slightly green tint)
- **Fill:** Window bounce (blue/white)
- **Ambient:** Low, cubicle shadows
- **Emissive:** Computer screens, exit signs

### Parking Garage
- **Key:** Harsh overhead sodium (orange)
- **Fill:** Minimal
- **Ambient:** Dark, moody
- **Emissive:** Exit signs, car headlights

### Downtown (Day)
- **Key:** Sun (warm white)
- **Fill:** Sky (blue)
- **Ambient:** Medium, urban shadows
- **Emissive:** Traffic lights, signs

### Downtown (Night)
- **Key:** Street lights (orange pools)
- **Fill:** Ambient city glow
- **Ambient:** Low
- **Emissive:** Neon signs, windows, cars

### Mall Interior
- **Key:** Bright retail lighting
- **Fill:** High ambient
- **Ambient:** Cheerful, few shadows
- **Emissive:** Store signs, displays

### Warehouse
- **Key:** Industrial hanging lights
- **Fill:** Minimal
- **Ambient:** Dark corners, dusty shafts
- **Emissive:** Emergency lights, fire

### Subway
- **Key:** Fluorescent strips
- **Fill:** Train headlights
- **Ambient:** Low, tiled reflections
- **Emissive:** Signs, train interiors

---

## 7. Skyboxes & Backgrounds

| Environment | Type | Notes |
|-------------|------|-------|
| Office | None | Interior only |
| Parking | None/Minimal | Glimpse of night sky |
| Downtown Day | HDR Skybox | Blue sky, clouds |
| Downtown Night | HDR Skybox | City night, stars |
| Mall | None | Interior |
| Warehouse | Dusk/Orange | Industrial atmosphere |
| Rooftops | HDR Skybox | Golden hour/sunset |
| Subway | None | Underground |
| Financial | HDR Skybox | Clear day, imposing |
| Docks | HDR Skybox | Overcast, moody |

**Free Skyboxes:**
- HDRI Haven: https://hdri-haven.com/
- Poly Haven: https://polyhaven.com/hdris

---

## 8. Asset Creation Pipeline

### For Free Assets
1. Find on Sketchfab/TurboSquid/Quaternius
2. Download (GLTF preferred)
3. Import to Blender for cleanup
4. Optimize poly count if needed
5. Re-export as GLTF/GLB
6. Test in Three.js

### For Meshy Generation
1. Write detailed prompt (see examples)
2. Generate 3-4 variations
3. Select best result
4. Download and clean in Blender
5. Retopologize if needed
6. Texture in Substance or Blender

### Meshy Prompt Template
```
[Object type], [style: low-poly/realistic/stylized], [key features],
game-ready, clean topology, [poly budget estimate], [material notes]
```

**Example Prompts:**
```
Modern office desk with computer monitor and keyboard, low-poly stylized,
clean geometric shapes, game-ready prop, approximately 800 polygons,
wood and plastic materials

Rolling office chair with mesh back and 5 caster wheels, low-poly game asset,
black mesh and chrome metal, clean topology, approximately 2000 polygons

Concrete parking garage pillar with oil stains, realistic industrial style,
game-ready environment piece, 200 polygons, concrete PBR material
```

---

## 9. Priority Asset List

### P0 - MVP (Week 1-2)
- [ ] Tony Stonks (1 outfit)
- [ ] Standard Office Chair
- [ ] Basic office modular kit
- [ ] Parking garage modular kit
- [ ] Essential office props (desk, chair, cubicle)
- [ ] Parking props (car, barrier)

### P1 - Alpha (Week 3-6)
- [ ] Remaining chairs
- [ ] All character outfits
- [ ] Downtown environment
- [ ] Mall environment
- [ ] All Chapter 1-4 props

### P2 - Beta (Week 7-10)
- [ ] All NPCs
- [ ] Remaining environments
- [ ] All props
- [ ] LOD variants
- [ ] Polish pass

---

*This document will be updated as assets are sourced and created.*
