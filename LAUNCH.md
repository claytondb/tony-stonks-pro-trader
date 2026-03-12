# Tony Stonks Pro Trader — Launch Pack

---

## 🏹 Product Hunt

### Tagline (60 chars max)
```
Escape the SEC on an office chair. Just trust me.
```
*(50 chars)*

**Alternates:**
- `Tony Hawk, but you're fleeing financial regulators` (51 chars)
- `Office chair physics game. The SEC is chasing you.` (51 chars)
- `Tony Hawk Pro Skater × Enron. On an office chair.` (50 chars)

---

### Description (260 chars)
```
Tony Stonks Pro Trader is a Tony Hawk-style skating game where you do sick tricks on an office chair to escape the SEC. Built with Three.js and Rapier physics. Free to play. No sign-up. Just vibes and financial crimes.
```
*(220 chars)*

---

### First Comment (Maker's Comment)

So this started as a dumb thought: "what if Tony Hawk Pro Skater, but the skater was a stock trader escaping regulators on an office chair?"

That thought lived in my head rent-free for way too long. Then one weekend I just... built it.

The gameplay loop is exactly what it sounds like. You're a day trader. The SEC is onto you. Your only escape vehicle is an office chair. You spin, grind, and launch yourself around the environment doing tricks while sirens wail in the background.

Technically it was a fun challenge — Three.js for the 3D rendering and Rapier for the physics engine. Getting the chair to feel satisfying to ride (bouncy, chaotic, vaguely realistic) took longer than I'd like to admit. There's something really specific about the moment when a physics-based character starts feeling *good* to control, and I basically locked in chasing that feeling.

Some things I'm weirdly proud of:
- The chair ragdolls when you slam into things, which never gets old
- The SEC pursuit music that escalates as they close in
- The trick system has actual combos — it's dumb but it's *deep* dumb

This is a free browser game, no account needed. Just click play and start grinding corners on your ergonomic escape vehicle.

Would love to hear what tricks people are landing. And if you see any bugs... the SEC probably planted them.

Play it here: https://claytondb.github.io/tony-stonks-pro-trader/

---

### Topics / Tags
1. **Gaming**
2. **Open Source**
3. **Fun**
4. **Browser Games**
5. **Three.js** (or "WebGL" / "JavaScript")

---

---

## 🤖 Reddit — r/WebGames

**Title:**
> I made a dumb game where you escape the SEC on an office chair (Tony Hawk-style)

**Body:**

Look, I'm not going to oversell this.

It started as a bit. "Tony Hawk Pro Skater but you're a day trader fleeing financial regulators on an office chair." I told my brain to shut up and it said no. So I built it.

It's a 3D browser game built with Three.js + Rapier physics. You do tricks. On an office chair. While the SEC chases you. The chair ragdolls when you crash. There's escalating pursuit music. There are combos.

It is completely free. No sign-up. No ads. Just pure, legally questionable office furniture sports.

**Play it:** https://claytondb.github.io/tony-stonks-pro-trader/

If anyone lands a 900 on the breakroom counter I need to see it. Also if it crashes for you let me know — not all bugs were planted by regulators.

---

---

## 🛠️ Reddit — r/indiegamedev

**Title:**
> Built a Tony Hawk-style browser game with Three.js + Rapier physics — lessons from shipping a dumb idea fast

**Body:**

Hey everyone — I shipped a small 3D browser game called **Tony Stonks Pro Trader** and wanted to share some notes on the tech and process, because I learned a few things that might help others.

**The concept:** Tony Hawk Pro Skater × office chair × SEC pursuit. It's absurd. That was the point.

**Tech stack:**
- **Three.js** for 3D rendering
- **Rapier** (via `@dimforge/rapier3d-compat`) for physics
- **Howler.js** for audio
- **Vite** for bundling + GitHub Pages for hosting

**What went well:**

Rapier was a joy to work with. The WASM build is solid, collision detection is fast, and once I got the rigid body dynamics dialed in, the chair started feeling like a real object in the world. The trick where you tune the friction/restitution values until something just *feels* right is underrated in game dev and Rapier makes that iteration fast.

Three.js is Three.js — powerful but you have to be intentional about scene management or your render loop becomes a mess. I ended up with a pretty clean update cycle by the end.

**What was hard:**

Getting character control to feel satisfying on a physics-based object is genuinely non-trivial. You're fighting physics the whole time — the engine wants to do realistic things, the player wants to do fun things. There's a tuning sweet spot between "floaty and fake" and "frustratingly realistic" and finding it took most of my time.

The ragdoll on crash was a happy accident — I had the wrong constraints set up and the chair went wild. Kept it.

**Shipping:**

GitHub Pages + Vite = zero hosting cost. The whole project from idea to deployed was a couple of weekends. I'm a UX designer, not a programmer by trade, so leaning on well-documented libraries (Three.js, Rapier) was essential.

**Play it:** https://claytondb.github.io/tony-stonks-pro-trader/

Happy to answer questions on any of the tech choices. And yes, I know the premise is unhinged.

---

---

## 🐦 Twitter / X Thread

**Tweet 1:**
> I built a browser game where you escape the SEC on an office chair doing Tony Hawk tricks
>
> It has ragdoll physics. The chair is the vehicle. The SEC is very real.
>
> Play free: https://claytondb.github.io/tony-stonks-pro-trader/
>
> 🧵

**Tweet 2:**
> The idea was "what if Tony Hawk Pro Skater but you're a day trader and the skater is a rolling office chair"
>
> My brain refused to let this go. So I built it over a couple of weekends with Three.js + Rapier physics.
>
> No account. No ads. Just vibes and financial crimes.

**Tweet 3:**
> My favorite part is when you crash and the chair goes full ragdoll
>
> I didn't plan that. Wrong constraints. Kept it.
>
> The SEC pursuit music that escalates as they close in was very much planned though.

**Tweet 4:**
> Anyway it's a free browser game. Takes 30 seconds to load, zero to sign up.
>
> If you land something wild, I want to see it.
>
> 👉 https://claytondb.github.io/tony-stonks-pro-trader/

---

---

## 💻 Hacker News — Show HN

**Title:**
> Show HN: Tony Stonks Pro Trader – escape the SEC on an office chair (Three.js/Rapier)

**Body:**

Hey HN — I built a small browser game as a side project and figured this community might appreciate the tech angle.

**The game:** Tony Hawk-style trick system where your vehicle is an office chair and you're being pursued by the SEC. Absurd premise, real physics.

**Tech:** Three.js for rendering, Rapier (WASM, `@dimforge/rapier3d-compat`) for physics, Howler.js for audio, bundled with Vite and hosted on GitHub Pages. Zero backend, zero cost.

**The interesting part (for HN):** Getting physics-based character control to feel fun rather than frustrating is a tuning problem I underestimated. Rapier gives you great collision and rigid body dynamics, but the gap between "physically accurate" and "feels good to play" is wide. Most of my time went into the friction/restitution/impulse tuning to find that sweet spot.

The ragdoll on crash was a bug that became a feature. Wrong joint constraints. Chair went wild. Left it in.

I'm a UX designer building games as a hobby — not a professional game dev — so feedback on the physics feel especially is welcome.

**Play:** https://claytondb.github.io/tony-stonks-pro-trader/ (browser, no install, ~30s load)

---

*Generated by Nero — update before posting with any new features or changes.*
