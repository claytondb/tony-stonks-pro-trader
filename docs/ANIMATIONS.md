# Tony Stonks Pro Trader
## Animation Specification

---

## 1. Animation System Overview

### Technical Requirements
- **Format:** GLTF with embedded animations
- **Skeleton:** Humanoid rig (Mixamo-compatible)
- **Frame Rate:** 30 FPS for export, interpolated to 60 FPS runtime
- **Blend Trees:** State machine with crossfade blending
- **IK:** Hands to chair armrests, feet to footrest
- **Root Motion:** Disabled (physics-driven movement)

### Animation Layers
| Layer | Weight | Purpose |
|-------|--------|---------|
| Base | 1.0 | Locomotion, core poses |
| Upper Body | Additive | Grabs, arms |
| Face | Override | Expressions |
| Procedural | Additive | Physics reactions |

---

## 2. Core Movement Animations

### Sitting & Rolling

| Animation | Frames | Loop | Notes |
|-----------|--------|------|-------|
| Idle_Sit | 60 | Yes | Subtle breathing, occasional shift |
| Roll_Forward_Slow | 30 | Yes | Gentle lean forward |
| Roll_Forward_Fast | 20 | Yes | More aggressive lean |
| Roll_Backward | 30 | Yes | Leaning back, legs forward |
| Turn_Left | 15 | No | Weight shift, armrest grip |
| Turn_Right | 15 | No | Mirror of left |
| Push_Off | 12 | No | Foot push to gain speed |
| Brake | 15 | No | Feet dragging |

### Jumping & Air

| Animation | Frames | Loop | Notes |
|-----------|--------|------|-------|
| Ollie_Prep | 6 | No | Crouch down |
| Ollie_Launch | 8 | No | Spring up |
| Air_Neutral | 30 | Yes | Floating, slight movements |
| Air_Forward | 30 | Yes | Leaning forward momentum |
| Air_Backward | 30 | Yes | Leaning back |
| Landing_Clean | 12 | No | Absorb impact |
| Landing_Hard | 18 | No | Bigger impact |

### Spinning (Additive)

| Animation | Frames | Loop | Notes |
|-----------|--------|------|-------|
| Spin_Left_180 | 15 | No | Half rotation |
| Spin_Left_360 | 24 | No | Full rotation |
| Spin_Left_540 | 30 | No | 1.5 rotations |
| Spin_Right_180 | 15 | No | Mirror |
| Spin_Right_360 | 24 | No | Mirror |
| Spin_Right_540 | 30 | No | Mirror |

---

## 3. Trick Animations

### Flip Tricks

Each flip trick needs: Windup (4f) → Flip (12-20f) → Catch (4f)

| Trick | Frames | Description |
|-------|--------|-------------|
| Kickflip | 20 | Chair rotates on long axis, feet kick |
| Heelflip | 20 | Opposite rotation of kickflip |
| Pop_Shove | 18 | Chair rotates 180° horizontal |
| 360_Flip | 28 | Kickflip + shove combo |
| Hardflip | 28 | Kickflip + frontside shove |
| Varial_Flip | 24 | Kickflip + backside shove |
| Impossible | 30 | Chair wraps around body |
| Fingerflip | 24 | Hand-assisted flip |

**Chair-Specific Flips:**
| Trick | Frames | Description |
|-------|--------|-------------|
| Swivel_Flip | 24 | Use chair's swivel to spin |
| Caster_Kick | 22 | Kick casters during flip |
| Armrest_Spin | 26 | Spin on armrest axis |
| Seat_Swap | 30 | Jump off and land other side |

### Grab Tricks

Each grab: Reach (6f) → Hold (loop) → Release (6f)

| Trick | Grab Point | Upper Body Pose |
|-------|------------|-----------------|
| Melon | Left armrest | Arm crosses body |
| Indy | Right armrest | Natural reach |
| Nosegrab | Front of seat | Lean forward |
| Tailgrab | Back of seat | Reach behind |
| Benihana | Seat + leg out | One leg extended |
| Madonna | Seat + kick | Both legs to one side |
| Airwalk | Armrests | Legs split in air |
| Christ_Air | Armrests wide | T-pose in air |

**Chair-Specific Grabs:**
| Trick | Description |
|-------|-------------|
| Coffee_Mug_Grab | Grab imaginary mug, pinky out |
| Keyboard_Clutch | Two-hand typing pose |
| Monitor_Hug | Arms wrapped like hugging screen |
| Stapler_Snatch | Reach and grab like grabbing stapler |
| Phone_Hold | One hand to ear pose |

### Grind Tricks

Grind animations are primarily balance poses held during grind

| Trick | Pose | Balance Type |
|-------|------|--------------|
| 50-50 | Centered, both armrest sides | Center |
| Nosegrind | Weight forward, front casters | Forward lean |
| Tailslide | Weight back, back casters | Backward lean |
| Smith | Front wheel, back hangs | Diagonal |
| Feeble | Back wheel, front hangs | Diagonal opposite |
| Crooked | Angled nosegrind | Forward + twist |
| Bluntslide | Tail first, sliding | Heavy back |
| Boardslide | Chair perpendicular | Side balance |
| Lipslide | 180 into boardslide | Side balance |

**Grind Entry/Exit:**
| Animation | Frames | Notes |
|-----------|--------|-------|
| Grind_Land | 8 | Snap to rail |
| Grind_Balance_L | 15 | Wobble left correction |
| Grind_Balance_R | 15 | Wobble right correction |
| Grind_Exit | 10 | Pop off rail |
| Grind_Bail | 20 | Fall off rail |

### Manual Tricks

| Animation | Frames | Loop | Notes |
|-----------|--------|------|-------|
| Manual_Enter | 8 | No | Pop onto back wheels |
| Manual_Hold | 30 | Yes | Balance on back casters |
| Manual_Wobble_L | 12 | No | Correction left |
| Manual_Wobble_R | 12 | No | Correction right |
| Manual_Exit | 8 | No | Drop to all wheels |
| Nose_Manual_Enter | 8 | No | Pop to front wheels |
| Nose_Manual_Hold | 30 | Yes | Balance on front casters |

---

## 4. Special/Signature Tricks

Tony's unlockable signature moves:

| Trick | Frames | Description | Unlock |
|-------|--------|-------------|--------|
| Quarterly_Report | 60 | 900 spin throwing papers | Chapter 3 |
| Golden_Parachute | 45 | Superman pose, slow descent | Chapter 5 |
| Hostile_Takeover | 50 | Flip to grind with grab | Chapter 7 |
| Spreadsheet_Flip | 35 | Double flip + spin | Chapter 4 |
| Corner_Office | 40 | Wall bounce trick | Chapter 9 |
| Pink_Slip | 30 | Fast combo starter | Chapter 2 |

---

## 5. Bail Animations

| Animation | Frames | Trigger |
|-----------|--------|---------|
| Bail_Forward | 30 | Faceplant |
| Bail_Backward | 30 | Fall back |
| Bail_Side_L | 25 | Tip over left |
| Bail_Side_R | 25 | Tip over right |
| Bail_Grind | 35 | Miss grind landing |
| Bail_Manual | 25 | Lose balance |
| Bail_Ragdoll_Start | 10 | Enter ragdoll physics |
| GetUp_Normal | 45 | Stand up from ground |
| GetUp_Slow | 60 | Bad bail recovery |

---

## 6. Cutscene Animations

### Chapter 1 (Office Escape)
| Animation | Duration | Notes |
|-----------|----------|-------|
| Desk_Work_Idle | Loop | Typing, looking bored |
| Look_At_Email | 3s | Reads screen, panics |
| Stand_Up_Panic | 2s | Pushes back from desk |
| Grab_Chair | 1s | Grabs chair armrests |
| Kick_Off | 1.5s | Initial escape push |

### Meeting Scenes
| Animation | Duration | Notes |
|-----------|----------|-------|
| Conference_Enter | 2s | Walk into room |
| Sit_Down | 1.5s | Take seat |
| Look_Around_Nervous | 3s | Scanning room |
| React_Shock | 1s | See something bad |

### Victory/Ending
| Animation | Duration | Notes |
|-----------|----------|-------|
| Victory_Spin | 4s | Celebration spin |
| Victory_Pose_A | Loop | Arms up |
| Victory_Pose_B | Loop | Chair wheelie |
| Credits_Roll | Loop | Slow cruise |

---

## 7. NPC Animations

### Office Workers
| Animation | Frames | Notes |
|-----------|--------|-------|
| Typing | Loop | At desk |
| Phone_Call | Loop | On phone |
| Walking | Loop | Hallway |
| React_Dodge | 20 | Jump out of way |
| React_Point | 15 | Point at player |
| React_Shock | 20 | See player trick |

### Security/Police
| Animation | Frames | Notes |
|-----------|--------|-------|
| Patrol_Walk | Loop | Walking beat |
| Chase_Run | Loop | Running after player |
| Radio_Call | 2s | Calling for backup |
| Stop_Gesture | 1s | Hold hand up |

### Wheels McGee (Mentor)
| Animation | Frames | Notes |
|-----------|--------|-------|
| Mop_Idle | Loop | Mopping |
| Wise_Nod | 1.5s | Approving |
| Demo_Trick | 3s | Shows example |
| Give_Item | 2s | Hands over chair |

---

## 8. Animation State Machine

### Player State Graph
```
                    ┌─────────────┐
                    │   IDLE      │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌─────────┐  ┌─────────┐  ┌─────────┐
        │ ROLLING │  │ JUMPING │  │ BAILING │
        └────┬────┘  └────┬────┘  └────┬────┘
             │            │            │
             │      ┌─────┴─────┐      │
             │      │           │      │
             │      ▼           ▼      │
             │ ┌────────┐ ┌────────┐   │
             │ │TRICKING│ │GRINDING│   │
             │ └────────┘ └────────┘   │
             │      │           │      │
             │      └─────┬─────┘      │
             │            │            │
             │      ┌─────┴─────┐      │
             │      │           │      │
             │      ▼           ▼      │
             │ ┌────────┐ ┌────────┐   │
             └─│LANDING │ │ MANUAL │───┘
               └────────┘ └────────┘
```

### Blend Tree: Rolling
```
                    Speed
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
  Slow              Medium            Fast
 (0-30%)           (30-70%)         (70-100%)
```

### Blend Tree: Air
```
              Lean X (Left/Right)
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
 Air_Left        Air_Neutral       Air_Right
    │                 │                 │
    └─────────────────┼─────────────────┘
                      │
              Lean Y (Fwd/Back)
```

---

## 9. IK & Procedural Animation

### Hand IK
- Left hand: IK target on left armrest
- Right hand: IK target on right armrest
- Override during grabs (hand to grab point)
- Procedural grip tightening during tricks

### Foot IK
- Ground contact when pushing
- Lift during jumps
- Extend during tricks
- Ragdoll on bail

### Physics Integration
- Cloth sim on loose clothing
- Hair physics
- Chair wheel procedural rotation
- Dust/debris particles on land

---

## 10. Free Animation Resources

### Mixamo (Primary Source)
URL: https://www.mixamo.com/

**Adaptable Animations:**
- Sitting Idle → Modify for chair
- Jumping → Adapt timing for chair physics
- Falling → Bail base
- Cheering → Victory poses

### Other Sources
- CGTrader Free Animations
- TurboSquid Free Mocap
- Sketchfab animated models
- Unity Asset Store free packs (convert)

### What Needs Custom Animation
- All trick animations (unique to chair)
- Chair-specific movements
- Grind poses
- Special tricks

---

## 11. Animation Priority List

### P0 - MVP
- [ ] Idle, Roll Forward, Roll Backward
- [ ] Ollie, Air Neutral, Landing
- [ ] 3 basic flip tricks (Kickflip, Heelflip, Pop Shove)
- [ ] 3 basic grabs (Melon, Indy, Nosegrab)
- [ ] 50-50 grind
- [ ] Manual
- [ ] Basic bail

### P1 - Alpha
- [ ] All flip tricks
- [ ] All grab tricks
- [ ] All grind poses
- [ ] Spin animations
- [ ] All bail variants
- [ ] GetUp animations

### P2 - Beta
- [ ] Special tricks
- [ ] Cutscene animations
- [ ] NPC animations
- [ ] Polish pass (blend smoothing)
- [ ] Procedural additions

---

*Animation specs will be refined during development based on gameplay feel.*
