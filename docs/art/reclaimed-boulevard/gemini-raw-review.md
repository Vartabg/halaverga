# Independent Rendering-Code & Art Spec Review

**Scope:** `docs/art/reclaimed-boulevard/README.md`, `src/world/*`, `scripts/environment/leaf_lod.py`, `src/game/CameraRig.tsx`.
**Target Environment:** Three.js 0.183.2, React Three Fiber 9.7.0, React 19.2.8, Next.js 16.3.5, WebGL2.
**Review Status:** Code & specification analysis only. No runtime execution, image inspection, or benchmark profiler access was utilized.

---

## 1. Verified Source Findings

### A. Critical Engine & Gameplay Bugs

#### 1. Rapier Shape Cast Argument Misalignment Breaks Camera Obstacle Avoidance
* **File & Line:** `src/game/CameraRig.tsx#L28-L29`
* **Evidence:**
  ```ts
  28: const hit = world.castShape(head, identity, dir, probe, .04, length, false, undefined, undefined, undefined, undefined, col => col.parent()?.isFixed() ?? true);
  29: if (hit) boom.current.setLength(Math.max(0, hit.time_of_impact - .08));
  ```
* **Consequence:** In `@dimforge/rapier3d-compat` / `@react-three/rapier`, the signature for `castShape` is:
  `castShape(shapePos, shapeRot, shapeVel, shape, maxToi, stopAtPenetration, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate)`
  Passing `.04` in the 5th argument binds `maxToi = 0.04` (4 centimeters), while `length` is passed into `stopAtPenetration` (coerced to `true`), and the predicate callback is passed as argument 12 (exceeding Rapier’s 11-argument parameter list, causing it to be silently ignored). The camera obstacle probe never tests beyond 4 cm behind the player’s head. As a result, the camera clips directly through building facades, bridge decks, and tree trunks during flight and landing.
* **Remediation:** Pass `length` as `maxToi` and align arguments:
  ```ts
  const hit = world.castShape(head, identity, dir, probe, length, true, undefined, undefined, undefined, undefined, col => col.parent()?.isFixed() ?? true);
  ```

---

#### 2. Frame Stagnation Under Demand Frameloop
* **File & Line:** `src/world/Scene.tsx#L29`, `src/game/CameraRig.tsx#L44-L52`, `src/world/Atmosphere.tsx#L30-L36`
* **Evidence:**
  `Scene.tsx` sets `frameloop="demand"`. In `CameraRig.tsx`:
  ```ts
  44: if (state.started && !state.paused) {
  ...
  51:   invalidate();
  52: }
  ```
* **Consequence:** Prior to `state.started` becoming `true` (e.g., when the player is on the arrival terrace viewing the flooded boulevard) or while paused, `invalidate()` is never called. Neither `Water` nor Rapier physics step independently without an invalidated frame in R3F. Consequently, the initial arrival scene freezes on the first frame—water shaders and camera orientation cease updating until flight is started.
* **Remediation:** Ensure `CameraRig` (or `Scene`) calls `invalidate()` whenever user input or active presentation changes occur, or maintain continuous invalidation when animated shaders (like `Water`) are running.

---

#### 3. One-Frame Camera Pose Lag via Priority Misalignment
* **File & Line:** `src/world/Scene.tsx#L41-L42`, `src/game/CameraRig.tsx#L53`
* **Evidence:**
  `Physics` runs at `updatePriority={-50}`. `CameraRig` sets `useFrame(..., -10)`. `FlightPresentation` and `Player` run at default priority `0`.
* **Consequence:** `CameraRig` executes at priority `-10` and reads `presentation` (`pose`) before `FlightPresentation` updates it at priority `0` for the current frame. The camera is continuously tracking one frame behind the actual player presentation pose, resulting in sub-frame visual jitter and micro-stutter at high velocities.
* **Remediation:** Move `CameraRig` to execute after `FlightPresentation` (e.g., `useFrame(..., 10)`), preserving `CameraRig` as the sole authoritative camera writer while consuming current-frame pose data.

---

### B. Lifecycle & Memory Leak Problems

#### 4. React 19 / StrictMode Geometry & Material Disposals on Unmount
* **File & Line:**
  - `src/world/City.tsx#L7-L9`
  - `src/world/Reclamation.tsx#L34-L36`
  - `src/world/IvyCards.tsx#L38-L39`
* **Evidence:**
  In `City.tsx`:
  ```ts
  7: const city = useMemo(makeCity, []);
  8: const materials = useCityMaterials();
  9: useEffect(() => () => { city.geometry.dispose(); materials.forEach(m => m.dispose()); }, [city, materials]);
  ```
  In `Reclamation.tsx`:
  ```ts
  34: useEffect(() => () => meshes.forEach(mesh => {
  35:   mesh.geometry.dispose(); (mesh.material as MeshStandardMaterial).dispose(); mesh.dispose();
  36: }), [meshes]);
  ```
  In `IvyCards.tsx`:
  ```ts
  39: useEffect(() => () => { mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }, [mesh]);
  ```
* **Consequence:** In React 19 (and React StrictMode in development or client-side route re-entry in Next.js 16), components mount, unmount, and remount. Because `useMemo` preserves its cached instances when dependency arrays are empty or unchanged (`[]`, `[city, materials]`, `[gltf, plants]`), the cleanup function destroys the underlying WebGL buffers (`geometry.dispose()` and `material.dispose()`). Upon remount, R3F attempts to bind disposed geometry and material buffers, resulting in black geometry, broken render states, or WebGL context errors.
* **Remediation:** Avoid disposing component-level memoized assets in unmount cleanups if they rely on persistent memoization, or manage disposal lifecycle at the root cache level.

---

#### 5. Missing Instance Color Dirty Flag
* **File & Line:** `src/world/Reclamation.tsx#L26-L28`, `src/world/IvyCards.tsx#L31-L34`
* **Evidence:**
  Both components execute `mesh.setColorAt(...)` and set `mesh.instanceMatrix.needsUpdate = true`, but omit `if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;`.
* **Consequence:** In Three.js, `setColorAt` allocates or updates `instanceColor.array`, but does not automatically flag `instanceColor.needsUpdate = true`. If color allocation occurs after initial buffer binding, or on platforms with strict attribute upload semantics, instance tint variation is ignored, causing vegetation instances to render flat or monochromatic.
* **Remediation:** Add `if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;` alongside `instanceMatrix.needsUpdate`.

---

### C. Collision vs. Art Mismatches

#### 6. Missing Colliders on Elevated Trees & Extreme Trunk Sizing
* **File & Line:** `src/world/cityData.ts#L70-L73`, `src/world/reclamationData.ts#L3-L9`
* **Evidence:**
  ```ts
  70: for (const tree of trees) if (tree.position[1] < 3) {
  71:   const [x, y, z] = tree.position, s = tree.scale[1];
  72:   k.solids.push({ position: [x, y + s, z], size: [.24 * s, s, .24 * s], rotation: [0, 0, 0] });
  73: }
  ```
* **Consequence:**
  1. **Ghost Trees on High Surfaces:** `treeSites` defines 4 major trees anchored to elevated terraces and rooftops: `[-34, 20.65, 28]`, `[32, 16.95, 22]`, `[-41, 31.7, -28]`, and `[33, 46.55, -38]`. The filter `tree.position[1] < 3` strips all collision from these trees. A player flying near or landing on the marked roof or terrace flies right through their trunks.
  2. **Trunk Box Inflation:** `@react-three/rapier` `CuboidCollider` takes half-extents (`args={[hx, hy, hz]}`). Passing `size: [.24 * s, s, .24 * s]` defines a collider of total width $0.48s$ and total height $2s$. For tree scale $s = 5.6$, the resulting collider is $2.69\text{ m} \times 11.2\text{ m} \times 2.69\text{ m}$. This creates invisible 2.7-meter-wide barriers blocking the water corridor and roadway.
* **Remediation:** Include elevated trees in collider generation, and adjust `size` to reflect accurate trunk radius half-extents (e.g., `[.08 * s, s * .5, .08 * s]`).

---

#### 7. Missing Arrival Terrace Railing Colliders
* **File & Line:** `src/world/cityData.ts#L40-L44`
* **Evidence:**
  ```ts
  40: for (const x of [-9, 9]) {
  41:   k.box(x, 21.2, 69, .14, 2.2, 10, colors.steel);
  42:   k.box(x, 22.25, 69, .2, .13, 10, colors.white);
  43:   k.box(x, 20.12, 65, .28, .12, 9, '#ddaa76');
  44: }
  ```
* **Consequence:** Visual steel and painted railings at the arrival terrace boundary ($x = \pm 9$, $y = 20\text{–}22.3$) are constructed with `solid = false` (default). Players moving on foot across the arrival terrace can walk through the railings and fall into the water.
* **Remediation:** Set `solid = true` on the primary steel perimeter barrier (`k.box(x, 21.2, 69, .14, 2.2, 10, colors.steel, true)`).

---

#### 8. Overhead Highway Sign Lacks Collision
* **File & Line:** `src/world/heroRuins.ts#L26-L29`
* **Evidence:**
  ```ts
  26: k.box(-16, 19, -4, .14, 7, .14, colors.steel, false, 0, .1);
  27: k.box(-21, 19, -4, .14, 7, .14, colors.steel, false, 0, .1);
  28: k.box(-18.5, 21.1, -3.9, 6.8, 2.5, .16, '#356b65', false, 0, .1);
  ```
* **Consequence:** The prominent $6.8\text{ m} \times 2.5\text{ m}$ road sign at $y = 21.1$ spans across the approach corridor but has `solid = false`. Players flying toward the ruined office landmark pass through the sign without collision.
* **Remediation:** Provide an exterior collision volume for the sign board.

---

### D. Browser & Mobile Performance / Rendering Risks

#### 9. Opaque Shadow Pass on Alpha-Cutout Geometry (Ivy Cards & Canopy)
* **File & Line:** `src/world/IvyCards.tsx#L23-L25, L36`, `src/world/Reclamation.tsx#L16-L20, L29`
* **Evidence:**
  `IvyCards` and `Grove` specify `castShadow = true` on `InstancedMesh` with `alphaTest: .45`.
* **Consequence:** In Three.js, depth/shadow passes for `MeshStandardMaterial` use internal depth materials that do not automatically sample custom or instanced alpha maps unless a `customDepthMaterial` (configured for instancing and alpha testing) is supplied. Without this, Three.js renders the full rectangular card geometry into the 2048x2048 shadow map, projecting dense black rectangular slabs onto walls, water, and roads instead of dappled foliage silhouettes.
* **Remediation:** Attach a `MeshDepthMaterial` with `depthPacking = RGBADepthPacking`, `map = texture`, and `alphaTest = .45` to `mesh.customDepthMaterial`.

---

#### 10. Missing Backface Rendering on Tree Foliage
* **File & Line:** `src/world/Reclamation.tsx#L16-L19`
* **Evidence:**
  ```ts
  16: const material = (object.material as MeshStandardMaterial).clone();
  17: material.roughness = .9; material.metalness = 0;
  18: material.transparent = false; material.alphaTest = .45;
  ```
* **Consequence:** `material.side` defaults to `FrontSide` (`DoubleSide` is not set, unlike `IvyCards`). Tree canopy leaves generated from single-layer planes or LOD cards become completely invisible when viewed from the back or underneath during low-altitude flight, resulting in severe canopy thinning and visual popping.
* **Remediation:** Set `material.side = DoubleSide`.

---

#### 11. Anisotropic Wall-Normal Flaw in Foliage Layering
* **File & Line:** `src/world/IvyCards.tsx#L28-L30`
* **Evidence:**
  ```ts
  28: for (let layer = 0; layer < 2; layer++) {
  29:   position.fromArray(plant.position); position.z += layer * .18;
  ```
* **Consequence:** Layer 1 is offset exclusively along world Z (`position.z += layer * .18`), regardless of the wall normal or plant orientation (`yaw`). For vines placed on east/west-facing facades ($X$-axis walls), the second layer slides laterally along the concrete rather than pulling outward. For facades facing $-Z$, the second layer penetrates 18 cm into the solid wall.
* **Remediation:** Transform the layer offset vector using the plant's rotation quaternion ($q$) so offsets project along the wall surface normal.

---

#### 12. FloatType PMREM Generation on Mobile WebGL2
* **File & Line:** `src/world/EnvironmentLight.tsx#L18-L20`
* **Evidence:**
  ```ts
  18: const source = new DataTexture(data, width, height, RGBAFormat, FloatType);
  19: source.mapping = EquirectangularReflectionMapping; source.needsUpdate = true;
  20: const generator = new PMREMGenerator(gl), target = generator.fromEquirectangular(source);
  ```
* **Consequence:** In WebGL2 on iOS Safari and certain mobile GPUs (e.g., ARM Mali), 32-bit floating-point textures (`FloatType`) do not support linear filtering unless `OES_texture_float_linear` is supported and enabled. Passing a 32-bit float texture into `PMREMGenerator` can cause shader compilation errors, incomplete framebuffer status, or visual corruption.
* **Remediation:** Use `HalfFloatType` (`Uint16Array` with half-float encoding) or standard 8-bit RGBA for procedural sky lookup in `EnvironmentLight`.

---

#### 13. Camera Far Plane Clamping Against Atmosphere & Water
* **File & Line:** `src/world/Scene.tsx#L30`, `src/world/Atmosphere.tsx#L9, L37-L38`
* **Evidence:**
  `Scene.tsx`: `camera={{ position: [0, 24, 72], fov: 65, near: .1, far: 650 }}`
  `Atmosphere.tsx`: `Sky` sphere radius is `700`; `Water` plane is $1100 \times 1100$ at position `[0, .1, -40]`.
* **Consequence:** The water plane extends to $z = -590$ (distance from camera $> 660\text{ m}$). Water vertices beyond $650\text{ m}$ are clipped by the hardware depth plane. Furthermore, the `Sky` sphere is positioned at `[0, 0, 0]` and does not track camera translation; as the player flies toward the distant ruined office ($z = -160$ to $-210$), camera-to-sky vertex distances exceed $860\text{ m}$, leading to clipping if the projection vertex override does not hold across all GPU drivers.
* **Remediation:** Center the Sky mesh on camera position in `useFrame`, or extend camera `far` to $1200\text{ m}$ with adjusted logarithmic/depth precision.

---

### E. Offline Asset Pipeline Tooling Bugs

#### 14. LOD Script Assigns Bark Material to Foliage & Corrupts UV Seams
* **File & Line:** `scripts/environment/leaf_lod.py#L27-L29, L48, L53-L54`
* **Evidence:**
  ```python
  28: for loop in mesh.loops:
  29:     uvs[loop.vertex_index] = tuple(uv_source[loop.index].uv)
  ...
  48: material = mesh.materials[mesh.polygons[0].material_index]
  ...
  53: for loop in result.loops:
  54:     layer.data[loop.index].uv = texcoords[loop.vertex_index]
  ```
* **Consequence:**
  1. **Material Index Mismatch:** Line 48 samples `mesh.polygons[0].material_index`. In standard tree models (such as `island_tree_01`), polygon 0 belongs to the trunk/bark material slot. The output canopy LOD mesh is assigned the trunk texture instead of the leaf diffuse atlas.
  2. **UV Seam Collapsing:** Storing UVs keyed by `vertex_index` (`uvs[loop.vertex_index]`) assumes 1:1 vertex-to-UV mapping. Across UV seams and mirrored leaf textures, vertices have multiple loops with distinct UVs; line 29 randomly overwrites them with the last loop visited, skewing leaf texture coordinates.
* **Remediation:** Query leaf polygons specifically to resolve the correct foliage material index, and preserve loop-based UV mapping during decimation.

---

## 2. Assumptions & Checks Unavailable

1. **Physical iOS Safari / Touch Latency:**
   * *Status:* Check Unavailable.
   * *Detail:* `README.md` lines 54–55 mandates physical iPhone Safari verification. Real-world thermal throttling under 2048x2048 shadow maps and high DPR (1.5) cannot be measured in code review.
2. **GLTF Asset Node Structure:**
   * *Status:* Assumption.
   * *Detail:* `Grove` assumes `/models/environment/island_tree_01.glb` contains valid meshes with `MeshStandardMaterial`. If the asset contains multi-primitives or untextured child nodes, `material.clone()` casting assumptions may fail at runtime.
3. **Texture Loading Concurrency & Asset Size:**
   * *Status:* Check Unavailable.
   * *Detail:* We cannot inspect the disk sizes of `/textures/environment/*` or `/models/environment/*`. Compliance with the 10 MB total added asset budget cannot be verified without file system inspection.
4. **Rapier Broadphase Performance Under Fixed Compound Colliders:**
   * *Status:* Assumption based on code structure.
   * *Detail:* All 60+ building, car, tree, and terrain colliders are placed inside a single root `<RigidBody type="fixed" colliders={false}>`. While architecturally valid in Rapier, moving or updating any child collider forces a rebuild of the compound shape.

---

## 3. Actionable Priority Summary

| Priority | Issue | Location | Primary Consequence |
|---|---|---|---|
| **P0** | Inverted Rapier `castShape` parameters | `CameraRig.tsx#L28` | Complete failure of camera collision avoidance |
| **P0** | React 19 / StrictMode buffer disposal | `City.tsx#L9`, `Reclamation.tsx#L34` | Broken rendering / crash on remount |
| **P1** | `frameloop="demand"` stall before start | `Scene.tsx#L29`, `CameraRig.tsx#L51` | Scene freezes on arrival terrace |
| **P1** | 1-frame camera tracking lag | `CameraRig.tsx#L53` | Jitter / desync during flight navigation |
| **P1** | Missing elevated tree colliders & oversized ground tree boxes | `cityData.ts#L70-L73` | Flight clipping through roof trees; oversized invisible water obstacles |
| **P2** | Opaque shadow pass on leaf cards | `IvyCards.tsx#L36`, `Reclamation.tsx#L29` | Black rectangular shadows on roads/walls |
| **P2** | Missing foliage backfaces (`side = FrontSide`) | `Reclamation.tsx#L16-L19` | Disappearing canopy leaves from beneath/rear |
| **P2** | `FloatType` in `EnvironmentLight` | `EnvironmentLight.tsx#L18` | Potential PMREM failure on mobile WebGL2 |
| **P3** | LOD script bark material assignment | `leaf_lod.py#L48` | Foliage rendered with bark textures in generated LODs |
