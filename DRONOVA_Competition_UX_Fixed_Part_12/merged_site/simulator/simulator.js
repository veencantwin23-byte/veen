(function(){
"use strict";

/* ============================================================
   ERROR STATE (Phase 6)
   Two realistic failure points: the Three.js library failing to
   load (network issue) or WebGL being unavailable/blocked in this
   browser. Both are handled the same way — a friendly message
   instead of a blank canvas or a console error the user never sees.
============================================================ */
function showSimulatorError(){
  var loader = document.getElementById('simLoader');
  if(loader) loader.style.display = 'none';
  var el = document.getElementById('simErrorState');
  if(el){ el.style.display = 'flex'; return; }
  el = document.createElement('div');
  el.id = 'simErrorState';
  el.setAttribute('role', 'alert');
  el.style.cssText = 'position:absolute;inset:0;z-index:300;background:#07131F;display:flex;'+
    'flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;font-family:Inter,sans-serif;color:#fff;';
  el.innerHTML = '<div style="font-size:2.4rem;margin-bottom:10px;">⚠️</div>'+
    '<div style="font-family:\'Chakra Petch\',sans-serif;font-size:1.15rem;font-weight:600;margin-bottom:8px;">Unable to start the flight simulator.</div>'+
    '<div style="font-size:0.86rem;color:#B8C7D9;max-width:380px;margin-bottom:18px;line-height:1.5;">This usually means 3D graphics (WebGL) aren\'t available in this browser, or a required script failed to load.</div>'+
    '<button id="simErrorRetryBtn" style="background:rgba(0,229,255,0.14);border:1px solid rgba(0,229,255,0.4);color:#00E5FF;'+
    'padding:10px 20px;border-radius:999px;font-family:\'Chakra Petch\',sans-serif;font-weight:600;cursor:pointer;">↻ Retry</button>'+
    '<a href="../index.html" style="margin-top:12px;color:#B8C7D9;font-size:0.82rem;">← Back to Dronova</a>';
  document.getElementById('simRoot').appendChild(el);
  document.getElementById('simErrorRetryBtn').addEventListener('click', function(){ window.location.reload(); });
}
if(typeof THREE === 'undefined'){
  showSimulatorError();
  return;
}

/* ============================================================
   GEOMETRY LOADING — reuses the real Dronova drone model.
   73 static parts pre-merged into one "airframe" mesh (perf),
   the 4 real propeller-blade meshes kept separate so they can
   spin on their own motor axes. Same source data as the 3D Lab.
============================================================ */
function b64ToBuf(b64){
  var bin = atob(b64), len = bin.length, buf = new Uint8Array(len);
  for (var i=0;i<len;i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
var MANIFEST = window.SIM_DRONE_MANIFEST;
var RAW = b64ToBuf(window.SIM_DRONE_BLOB_B64);
window.SIM_DRONE_BLOB_B64 = null;
var modelCenter = new THREE.Vector3(MANIFEST.modelCenter[0], MANIFEST.modelCenter[1], MANIFEST.modelCenter[2]);
var modelSize = new THREE.Vector3(MANIFEST.modelSize[0], MANIFEST.modelSize[1], MANIFEST.modelSize[2]);
var droneScale = Math.max(modelSize.x, modelSize.y, modelSize.z); // ~0.25m real-world scale

function buildGeometry(p){
  var pos = new Float32Array(RAW, p.posOff, p.v*3);
  var nrm = new Float32Array(RAW, p.nrmOff, p.v*3);
  var idx = new Uint16Array(RAW, p.idxOff, p.t*3);
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.slice(), 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm.slice(), 3));
  geo.setIndex(new THREE.Uint16BufferAttribute(idx.slice(), 1));
  return geo;
}

/* ============================================================
   RENDERER / SCENE / CAMERA
============================================================ */
var canvas = document.getElementById('simCanvas');
var renderer;
try{
  renderer = new THREE.WebGLRenderer({canvas:canvas, antialias:true, powerPreference:'high-performance'});
}catch(err){
  showSimulatorError();
  return;
}
if(!renderer){ showSimulatorError(); return; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c2032);
// Phase 8.2: fog range extended slightly (was 34–140) so it starts just
// beyond the farthest active mission marker (forwardMarker at z=-36) rather
// than right at it — training visibility takes priority over atmosphere.
scene.fog = new THREE.Fog(0x0c2032, 42, 170);

var camera = new THREE.PerspectiveCamera(58, 1, 0.05, 400);
var skyDomeMat = null; // Phase 9.3E: set inside buildSkyDome() below
var hemiLight = null; // Phase 9.3E: set below, so time-of-day presets can control it

/* ============================================================
   LIGHTING & ATMOSPHERE (Phase 7.6, refined in Phase 8.2)
   Still exactly 3 lights (1 hemisphere + 2 directional) — no new
   lights added. Phase 8.2 adds: a scoped, lightweight shadow pass
   from the sun light only (small map, ~10 casters total, ground +
   major buildings + the drone — never the many small instanced
   fence/tree/pole objects), a refined sky gradient with a subtle
   sun-glow highlight, and a slightly warmer/better-balanced light
   mix for object definition.
============================================================ */
scene.add(hemiLight = new THREE.HemisphereLight(0x8fd6ff, 0x16222c, 0.9)); // Phase 8.2: warmer ground bounce (was 0x0d1a26) so undersides aren't too dark; Phase 9.3E: now kept as a reference for time-of-day control
var sunLight = new THREE.DirectionalLight(0xfff2d6, 1.75); // Phase 8.2: slightly warmer, marginally brighter for definition
sunLight.position.set(38, 46, 20); // Phase 8.2: adjusted angle for clearer building/drone shading
scene.add(sunLight);
var fill = new THREE.DirectionalLight(0x4fd8ff, 0.35);
fill.position.set(-22, 12, -26);
scene.add(fill);

// Phase 8.2: scoped shadow pass. BasicShadowMap is the cheapest available
// shadow type (hard-edged, no PCF filtering) — appropriate for a clean,
// stylized look and the lightest option performance-wise. Only sunLight
// casts; fill and hemisphere never do (Three.js lights don't cast shadows
// unless explicitly enabled, so this alone keeps the cost to one light).
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024); // small enough to stay cheap, large enough not to look blocky over the ~60m play area
sunLight.shadow.camera.left = -50; sunLight.shadow.camera.right = 50;
sunLight.shadow.camera.top = 50; sunLight.shadow.camera.bottom = -50;
sunLight.shadow.camera.near = 5; sunLight.shadow.camera.far = 130;
sunLight.shadow.bias = -0.0015;

(function buildSkyDome(){
  var canvas = document.createElement('canvas');
  canvas.width = 4; canvas.height = 256;
  var ctx = canvas.getContext('2d');
  // Phase 8.2: refined gradient — cleaner daylight-blue zenith, softer
  // horizon transition, still 4 stops, same single small texture.
  var grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#0c3f66');
  grad.addColorStop(0.4, '#1d76a0');
  grad.addColorStop(0.72, '#68c3d4');
  grad.addColorStop(1.0, '#d9f0e8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  // Phase 8.2: a soft sun-glow highlight baked into the same texture near
  // the horizon band, roughly matching the sun's elevation — cheap (still
  // one texture, one draw call), adds a believable light-source cue.
  var glow = ctx.createRadialGradient(2, 205, 0, 2, 205, 90);
  glow.addColorStop(0, 'rgba(255,244,214,0.55)');
  glow.addColorStop(1, 'rgba(255,244,214,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 130, 4, 256);
  var tex = new THREE.CanvasTexture(canvas);
  var geo = new THREE.SphereGeometry(180, 16, 16);
  var mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog:false });
  var dome = new THREE.Mesh(geo, mat);
  scene.add(dome);
  skyDomeMat = mat; // Phase 9.3E: exposed to the outer scope so time-of-day presets can tint it, without regenerating the texture
})();

/* ============================================================
   TIME OF DAY SYSTEM (Phase 9.3E)
   A small, central config object (Part 12) plus one function that
   changes it — setEnvironmentTime(name). Presets are NOT a real-
   time cycle (explicitly out of scope): selecting one starts a
   short, cheap linear interpolation of existing scene properties
   (sky tint, background, fog, light colours/intensities/position,
   tone exposure, and an emissive-material multiplier captured
   once from the already-built environment — see the scan near the
   end of the environment-setup code). No new lights, no new
   geometry, no texture regeneration. The environment itself is
   never recreated — only these existing properties are mutated.
============================================================ */
var ENVIRONMENT_PRESETS = {
  morning: { skyTint:0xffe0c2, background:0x274a5c, fogColor:0x2c4f60, fogNear:40, fogFar:165,
    hemiSky:0xa8d8ff, hemiGround:0x2a3428, hemiIntensity:0.95,
    sunColor:0xffd9a8, sunIntensity:1.55, sunPos:[20,30,35],
    fillColor:0x6fc8e8, fillIntensity:0.30, toneExposure:1.15, emissiveMultiplier:1.1 },
  day:     { skyTint:0xffffff, background:0x0c2032, fogColor:0x0c2032, fogNear:42, fogFar:170,
    hemiSky:0x8fd6ff, hemiGround:0x16222c, hemiIntensity:0.9,
    sunColor:0xfff2d6, sunIntensity:1.75, sunPos:[38,46,20],
    fillColor:0x4fd8ff, fillIntensity:0.35, toneExposure:1.1, emissiveMultiplier:1.0 },
  evening: { skyTint:0xffb27a, background:0x3a2a30, fogColor:0x4a3228, fogNear:35, fogFar:150,
    hemiSky:0xff9a6a, hemiGround:0x201820, hemiIntensity:0.65,
    sunColor:0xff8a4a, sunIntensity:1.05, sunPos:[50,12,-10],
    fillColor:0x8a5cff, fillIntensity:0.32, toneExposure:1.0, emissiveMultiplier:1.8 },
  night:   { skyTint:0x2a3a5c, background:0x0a1220, fogColor:0x0a1220, fogNear:30, fogFar:130, // deliberately not pure black, per Part 6
    hemiSky:0x1c3a5c, hemiGround:0x0c1018, hemiIntensity:0.4,
    sunColor:0x6f8fc0, sunIntensity:0.32, sunPos:[-30,40,-15], // dim, cool "moonlight" rather than the sun switching off entirely
    fillColor:0x2a4a7c, fillIntensity:0.24, toneExposure:0.88, emissiveMultiplier:2.8 }
};
var currentEnvTime = 'day';
var envEmissiveMaterials = []; // populated once, after the environment finishes building — see the scan below
var envTransition = null; // {from:{...}, to:{...}, t:0, duration} while active; null once settled — no per-frame cost when idle

function snapshotEnvState(){
  return {
    skyTint: skyDomeMat.color.getHex(), background: scene.background.getHex(),
    fogColor: scene.fog.color.getHex(), fogNear: scene.fog.near, fogFar: scene.fog.far,
    hemiIntensity: hemiLight.intensity,
    sunColor: sunLight.color.getHex(), sunIntensity: sunLight.intensity, sunPos: [sunLight.position.x, sunLight.position.y, sunLight.position.z],
    fillColor: fill.color.getHex(), fillIntensity: fill.intensity,
    toneExposure: renderer.toneMappingExposure,
    emissiveMultiplier: currentEmissiveMultiplier
  };
}
var currentEmissiveMultiplier = 1.0;
function applyEnvState(s){
  skyDomeMat.color.setHex(s.skyTint);
  scene.background.setHex(s.background);
  scene.fog.color.setHex(s.fogColor); scene.fog.near = s.fogNear; scene.fog.far = s.fogFar;
  hemiLight.intensity = s.hemiIntensity;
  sunLight.color.setHex(s.sunColor); sunLight.intensity = s.sunIntensity;
  sunLight.position.set(s.sunPos[0], s.sunPos[1], s.sunPos[2]);
  fill.color.setHex(s.fillColor); fill.intensity = s.fillIntensity;
  renderer.toneMappingExposure = s.toneExposure;
  currentEmissiveMultiplier = s.emissiveMultiplier;
  envEmissiveMaterials.forEach(function(rec){ rec.mat.emissiveIntensity = rec.baseIntensity * s.emissiveMultiplier; });
}
function lerpHex(a, b, t){
  var ar=(a>>16)&255, ag=(a>>8)&255, ab=a&255, br=(b>>16)&255, bg=(b>>8)&255, bb=b&255;
  var r=Math.round(ar+(br-ar)*t), g=Math.round(ag+(bg-ag)*t), bl=Math.round(ab+(bb-ab)*t);
  return (r<<16)|(g<<8)|bl;
}
function updateEnvTransition(dt){
  if(!envTransition) return; // no cost at all once a transition finishes — not a continuous per-frame calculation
  envTransition.t += dt;
  var t = Math.min(1, envTransition.t / envTransition.duration);
  var f = envTransition.from, o = envTransition.to;
  applyEnvState({
    skyTint: lerpHex(f.skyTint, o.skyTint, t), background: lerpHex(f.background, o.background, t),
    fogColor: lerpHex(f.fogColor, o.fogColor, t), fogNear: f.fogNear+(o.fogNear-f.fogNear)*t, fogFar: f.fogFar+(o.fogFar-f.fogFar)*t,
    hemiIntensity: f.hemiIntensity+(o.hemiIntensity-f.hemiIntensity)*t,
    sunColor: lerpHex(f.sunColor, o.sunColor, t), sunIntensity: f.sunIntensity+(o.sunIntensity-f.sunIntensity)*t,
    sunPos: [f.sunPos[0]+(o.sunPos[0]-f.sunPos[0])*t, f.sunPos[1]+(o.sunPos[1]-f.sunPos[1])*t, f.sunPos[2]+(o.sunPos[2]-f.sunPos[2])*t],
    fillColor: lerpHex(f.fillColor, o.fillColor, t), fillIntensity: f.fillIntensity+(o.fillIntensity-f.fillIntensity)*t,
    toneExposure: f.toneExposure+(o.toneExposure-f.toneExposure)*t,
    emissiveMultiplier: f.emissiveMultiplier+(o.emissiveMultiplier-f.emissiveMultiplier)*t
  });
  if(t >= 1) envTransition = null;
}
function setEnvironmentTime(name){
  var preset = ENVIRONMENT_PRESETS[name];
  if(!preset || !skyDomeMat) return; // guard: called before the sky dome exists shouldn't be possible, but stay safe
  currentEnvTime = name;
  envTransition = { from: snapshotEnvState(), to: preset, t: 0, duration: 1.6 };
  ['envMorningBtn','envDayBtn','envEveningBtn','envNightBtn'].forEach(function(id){
    var el = document.getElementById(id);
    var active = el.dataset.env === name;
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', String(active));
  });
}
document.getElementById('envMorningBtn').addEventListener('click', function(){ setEnvironmentTime('morning'); });
document.getElementById('envDayBtn').addEventListener('click', function(){ setEnvironmentTime('day'); });
document.getElementById('envEveningBtn').addEventListener('click', function(){ setEnvironmentTime('evening'); });
document.getElementById('envNightBtn').addEventListener('click', function(){ setEnvironmentTime('night'); });

/* ============================================================
   ENVIRONMENT — ground, grid, landing pad, boundary, obstacles
============================================================ */
var GROUND_RADIUS = 60;

(function buildGround(){
  var groundGeo = new THREE.CircleGeometry(GROUND_RADIUS, 64);
  var groundMat = new THREE.MeshStandardMaterial({color:0x18242c, roughness:0.92, metalness:0.08});
  var ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true; // Phase 8.2: the only receiver that matters visually at this scale
  scene.add(ground);

  var grid = new THREE.GridHelper(GROUND_RADIUS*2, 40, 0x1f6f8a, 0x123044);
  grid.material.transparent = true; grid.material.opacity = 0.5;
  grid.position.y = 0.01;
  scene.add(grid);

  // soft boundary ring
  var boundaryGeo = new THREE.RingGeometry(GROUND_RADIUS-0.3, GROUND_RADIUS, 64);
  var boundaryMat = new THREE.MeshBasicMaterial({color:0x00e5ff, transparent:true, opacity:0.35, side:THREE.DoubleSide});
  var boundary = new THREE.Mesh(boundaryGeo, boundaryMat);
  boundary.rotation.x = -Math.PI/2; boundary.position.y = 0.02;
  scene.add(boundary);
})();

// Perimeter fence posts — one InstancedMesh, one draw call regardless of post
// count (real GPU instancing, not just repeated meshes), running the fence
// just inside the flight boundary as a purely visual/orientation aid.
(function buildPerimeterFence(){
  var count = 48;
  var postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6);
  var postMat = new THREE.MeshStandardMaterial({ color:0x2c4658, roughness:0.8 });
  var fence = new THREE.InstancedMesh(postGeo, postMat, count);
  var dummy = new THREE.Object3D();
  var r = GROUND_RADIUS - 3;
  for(var i=0;i<count;i++){
    var a = (i/count) * Math.PI * 2;
    dummy.position.set(Math.cos(a)*r, 0.55, Math.sin(a)*r);
    dummy.updateMatrix();
    fence.setMatrixAt(i, dummy.matrix);
  }
  fence.instanceMatrix.needsUpdate = true; // required — GPU won't see per-instance transforms without this
  scene.add(fence);
})();
// Phase 8.3: a sparser ring of lighting poles just inside the plain fence —
// visual infrastructure only, no real THREE.Light per pole (the "lamp" is
// just an emissive-material cap, lit by the existing scene lights).
(function buildBoundaryLightingPoles(){
  var r = GROUND_RADIUS - 6;
  var positions = [];
  for(var i=0;i<6;i++){
    var a = (i/6) * Math.PI * 2;
    positions.push([Math.cos(a)*r, Math.sin(a)*r]);
  }
  makeLightingPoles(positions);
})();

/* ============================================================
   COLLISION SYSTEM (Phase 7.1 — foundation only)
   Lightweight, registered-obstacle-list based. No raycasting,
   no per-mesh checks, no external physics library. Visual
   geometry and collision geometry are kept fully separate —
   an obstacle's collider does not need to match its mesh shape.

   HOW TO REGISTER A NEW OBSTACLE:
     registerBoxCollider(position, halfSize, idString)
     registerSphereCollider(position, radius, idString)
   Call either once, after creating the obstacle's visual mesh.
   Nothing else needs to change — the drone-vs-obstacle check
   below automatically includes every registered collider.
   Defined here, before any environment/zone code, so every
   helper below can safely register colliders as it builds.
============================================================ */
var COLLIDABLES = []; // { type:'box'|'sphere', position:Vector3, halfSize?:Vector3, radius?:number, id:string }

function registerBoxCollider(position, halfSize, id){
  COLLIDABLES.push({ type:'box', position: position.clone(), halfSize: halfSize.clone(), id: id || null });
}
function registerSphereCollider(position, radius, id){
  COLLIDABLES.push({ type:'sphere', position: position.clone(), radius: radius, id: id || null });
}

// The drone itself is represented by a single bounding sphere for collision
// purposes — deliberately not checked mesh-by-mesh (77 parts) for performance.
var DRONE_COLLISION_RADIUS = droneScale * 0.62;

// Checks a candidate position against every registered collider and, if any
// overlap, returns a resolved (pushed-out) position. O(number of obstacles)
// per frame — cheap by construction, since only registered obstacles are
// checked, never scene meshes or raycasts.
function resolveDroneCollisions(candidatePos){
  var resolved = candidatePos.clone(); // one allocation per call — the function's return value, kept as-is
  var hit = false;
  // Phase 7.9 optimization: the loop below previously allocated ~3 new
  // THREE.Vector3 objects per collider, every single frame (this function
  // runs unconditionally in updatePhysics regardless of mode) — with 15
  // registered colliders that was ~45 allocations/frame, ~2700/second at
  // 60fps, pure GC churn. Rewritten to use plain numbers for the per-axis
  // min/max/closest/diff math instead — identical collision behaviour,
  // zero per-collider allocations.
  for(var i=0;i<COLLIDABLES.length;i++){
    var c = COLLIDABLES[i];
    if(c.type === 'sphere'){
      var dx = resolved.x - c.position.x, dy = resolved.y - c.position.y, dz = resolved.z - c.position.z;
      var dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      var minDist = c.radius + DRONE_COLLISION_RADIUS;
      if(dist < minDist){
        hit = true;
        if(dist < 1e-4){ dx=1; dy=0; dz=0; dist=1e-4; }
        var s = minDist/dist;
        resolved.x = c.position.x + dx*s;
        resolved.y = c.position.y + dy*s;
        resolved.z = c.position.z + dz*s;
      }
    } else if(c.type === 'box'){
      var minX = c.position.x - c.halfSize.x, minY = c.position.y - c.halfSize.y, minZ = c.position.z - c.halfSize.z;
      var maxX = c.position.x + c.halfSize.x, maxY = c.position.y + c.halfSize.y, maxZ = c.position.z + c.halfSize.z;
      var closestX = Math.max(minX, Math.min(resolved.x, maxX));
      var closestY = Math.max(minY, Math.min(resolved.y, maxY));
      var closestZ = Math.max(minZ, Math.min(resolved.z, maxZ));
      var bdx = resolved.x - closestX, bdy = resolved.y - closestY, bdz = resolved.z - closestZ;
      var bdist = Math.sqrt(bdx*bdx + bdy*bdy + bdz*bdz);
      if(bdist < DRONE_COLLISION_RADIUS){
        hit = true;
        if(bdist < 1e-4){
          // drone center already inside the box — push out along the
          // shallowest penetration axis rather than an arbitrary direction.
          var penX = Math.min(resolved.x-minX, maxX-resolved.x);
          var penY = Math.min(resolved.y-minY, maxY-resolved.y);
          var penZ = Math.min(resolved.z-minZ, maxZ-resolved.z);
          if(penX<=penY && penX<=penZ) resolved.x += (resolved.x >= c.position.x ? 1 : -1) * (penX + DRONE_COLLISION_RADIUS + 0.01);
          else if(penY<=penX && penY<=penZ) resolved.y += (resolved.y >= c.position.y ? 1 : -1) * (penY + DRONE_COLLISION_RADIUS + 0.01);
          else resolved.z += (resolved.z >= c.position.z ? 1 : -1) * (penZ + DRONE_COLLISION_RADIUS + 0.01);
        } else {
          var bs = DRONE_COLLISION_RADIUS/bdist;
          resolved.x = closestX + bdx*bs;
          resolved.y = closestY + bdy*bs;
          resolved.z = closestZ + bdz*bs;
        }
      }
    }
  }
  return { hit: hit, position: resolved };
}

// Debounced feedback so contact doesn't spam a toast every single frame
// while the drone is resting against an obstacle.
var lastCollisionToastAt = -999;
function notifyCollision(now){
  if(now - lastCollisionToastAt > 1.6){
    lastCollisionToastAt = now;
    showToast('⚠ OBSTACLE CONTACT', '', '⚠️');
  }
  // Phase 9.4F: purely observational — increments the (already-scaffolded,
  // since Phase 9.1) mission safety counter whenever a rescue mission is
  // active. Every line above is completely unchanged; this does not affect
  // the toast, the debounce, or any collision physics.
  if(RESCUE_STATE.active) RESCUE_STATE.collisionCount++;
}

/* ============================================================
   TRAINING CAMP — shared helpers (Phase 7.2)
   Canvas-texture sprites for signage (cheap: no font files, no
   geometry — one small texture + a billboard sprite per sign).
   Flat MeshBasicMaterial for all ground markings (unlit, cheapest
   possible shading, correct for painted-line look anyway).
============================================================ */
function makeSignSprite(text, accentColor){
  var canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 72;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(7,19,31,0.88)';
  ctx.fillRect(0,0,320,72);
  ctx.strokeStyle = accentColor || '#00e5ff';
  ctx.lineWidth = 5;
  ctx.strokeRect(3,3,314,66);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 160, 37);
  var tex = new THREE.CanvasTexture(canvas);
  var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  var sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.2, 0.95, 1);
  return sprite;
}
function makeSignPost(x, z, text, accentColor){
  var g = new THREE.Group();
  var poleGeo = new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6);
  var poleMat = new THREE.MeshStandardMaterial({ color:0x2a3a4a, roughness:0.75 });
  var pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 1.2;
  g.add(pole);
  var sign = makeSignSprite(text, accentColor);
  sign.position.y = 2.5;
  g.add(sign);
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}
function makeGroundRing(x, z, rInner, rOuter, color, opacity){
  var geo = new THREE.RingGeometry(rInner, rOuter, 48);
  var mat = new THREE.MeshBasicMaterial({ color:color, transparent:true, opacity:opacity, side:THREE.DoubleSide });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI/2; mesh.position.set(x, 0.02, z);
  scene.add(mesh);
  return mesh;
}
function makeGroundStripe(x, z, w, l, rotY, color, opacity){
  var geo = new THREE.PlaneGeometry(w, l);
  var mat = new THREE.MeshBasicMaterial({ color:color, transparent:true, opacity:(opacity!==undefined?opacity:0.8), side:THREE.DoubleSide });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI/2; mesh.rotation.z = rotY || 0;
  mesh.position.set(x, 0.015, z);
  scene.add(mesh);
  return mesh;
}
// Training gate: two vertical posts + a top bar the drone flies under/through.
// Only the two posts are collidable — the open passage between them is not,
// matching the real meaning of a "gate" (fly through, don't hit the frame).
function makeGate(x, z, rotY, width, height, color, id){
  var g = new THREE.Group();
  var postGeo = new THREE.CylinderGeometry(0.08, 0.08, height, 8);
  var postMat = new THREE.MeshStandardMaterial({ color:0xe8e8e8, emissive:color, emissiveIntensity:0.25, roughness:0.5 });
  var postL = new THREE.Mesh(postGeo, postMat); postL.position.set(-width/2, height/2, 0);
  var postR = new THREE.Mesh(postGeo, postMat); postR.position.set(width/2, height/2, 0);
  g.add(postL, postR);
  var barGeo = new THREE.BoxGeometry(width+0.2, 0.08, 0.08);
  var bar = new THREE.Mesh(barGeo, postMat); bar.position.y = height;
  g.add(bar);
  g.position.set(x, 0, z); g.rotation.y = rotY || 0;
  scene.add(g);
  // Register each post at its true world position (rotation-aware).
  var cos = Math.cos(rotY||0), sin = Math.sin(rotY||0);
  var lx = x + (-width/2)*cos, lz = z - (-width/2)*sin;
  var rx = x + (width/2)*cos, rz = z - (width/2)*sin;
  registerBoxCollider(new THREE.Vector3(lx, height/2, lz), new THREE.Vector3(0.15, height/2, 0.15), id+'_L');
  registerBoxCollider(new THREE.Vector3(rx, height/2, rz), new THREE.Vector3(0.15, height/2, 0.15), id+'_R');
  return g;
}
// Low wide barrier — a simple "training barrier" obstacle.
function makeBarrier(x, z, rotY, id){
  var geo = new THREE.BoxGeometry(2.4, 0.9, 0.35);
  var mat = new THREE.MeshStandardMaterial({ color:0xffb200, roughness:0.6 });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.45, z); mesh.rotation.y = rotY || 0;
  scene.add(mesh);
  registerBoxCollider(mesh.position, new THREE.Vector3(1.25, 0.45, 0.2), id);
  // Phase 7.6: aviation hazard-stripe bands — thin overlays riding on the
  // same mesh position/rotation, the collider above is untouched.
  var stripeMat = new THREE.MeshStandardMaterial({ color:0x141414, roughness:0.7 });
  var stripeGeo = new THREE.BoxGeometry(0.32, 0.94, 0.37); // Phase 9.3F-5: hoisted out of the loop, shared across all 3 stripes (and both barriers)
  [-0.75, 0, 0.75].forEach(function(off){
    var stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(x + off*Math.cos(rotY||0), 0.45, z - off*Math.sin(rotY||0));
    stripe.rotation.y = rotY || 0;
    scene.add(stripe);
  });
  return mesh;
}
// Simple procedural "quonset hut" style hangar — box base + half-cylinder roof.
// Two primitives total; no imported model, no large textures.
function makeHangar(x, z, rotY, id){
  var g = new THREE.Group();
  var baseMat = new THREE.MeshStandardMaterial({ color:0x223142, roughness:0.7, metalness:0.15 });
  var base = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 8), baseMat);
  base.position.y = 1.3;
  base.castShadow = true; base.receiveShadow = true; // Phase 8.2: only the two largest hangar pieces cast/receive
  g.add(base);
  var roofMat = new THREE.MeshStandardMaterial({ color:0x33495e, roughness:0.55, metalness:0.2, side:THREE.DoubleSide });
  var roof = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 8, 20, 1, false, 0, Math.PI), roofMat);
  roof.rotation.z = Math.PI/2; roof.position.y = 2.6;
  roof.castShadow = true; roof.receiveShadow = true; // Phase 8.2
  g.add(roof);
  // Door frame trim (Phase 7.6) — reads as "large hangar doors" against the glow.
  var frameMat = new THREE.MeshStandardMaterial({ color:0x141e28, roughness:0.6, metalness:0.3 });
  var frame = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.6, 0.12), frameMat);
  frame.position.set(0, 1.3, 4.0);
  g.add(frame);
  var doorMat = new THREE.MeshBasicMaterial({ color:0x00e5ff, transparent:true, opacity:0.35 });
  var door = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), doorMat);
  door.position.set(0, 1.1, 4.07);
  g.add(door);
  // Corner support pillars (Phase 7.6) — modular, reuses baseMat.
  var pillarGeo = new THREE.BoxGeometry(0.3, 2.6, 0.3); // Phase 9.3F-5: hoisted out of the loop, shared across all 4 pillars (and every hangar instance)
  [[-3.1,-3.9],[3.1,-3.9],[-3.1,3.9],[3.1,3.9]].forEach(function(p){
    var pillar = new THREE.Mesh(pillarGeo, baseMat);
    pillar.position.set(p[0], 1.3, p[1]);
    g.add(pillar);
  });
  g.position.set(x, 0, z); g.rotation.y = rotY || 0;
  scene.add(g);
  // Collider height covers the box body plus most of the rounded roof —
  // simple box for a visually detailed structure, as intended.
  registerBoxCollider(new THREE.Vector3(x, 2.4, z), new THREE.Vector3(3.2, 2.4, 4.2), id || 'hangar'); // Phase 9.3C: id now overridable so reused instances stay distinguishable
  return g;
}

/* ---------- Additional Phase 7.6 visual helpers ---------- */

// Ground-level colour tint identifying a training zone at a glance — one
// flat unlit circle per zone, cheapest possible way to add "visual contrast
// between areas" without new materials per obstacle or any texture assets.
function makeZoneTint(x, z, radius, color, opacity){
  var geo = new THREE.CircleGeometry(radius, 36);
  var mat = new THREE.MeshBasicMaterial({ color:color, transparent:true, opacity:opacity, side:THREE.DoubleSide, depthWrite:false });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI/2; mesh.position.set(x, 0.008, z);
  scene.add(mesh);
  return mesh;
}

// Flat directional arrow (a squashed cone lying on the ground) guiding the
// student along the flight course — purely decorative, not collidable.
function makeDirectionArrow(x, z, rotY, color){
  var geo = new THREE.ConeGeometry(0.55, 1.6, 3);
  var mat = new THREE.MeshBasicMaterial({ color:color, transparent:true, opacity:0.75 });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI/2; mesh.rotation.z = rotY || 0;
  mesh.position.set(x, 0.05, z);
  scene.add(mesh);
  return mesh;
}

// A cluster of simple low-poly trees built from ONE shared trunk geometry
// and ONE shared canopy geometry, rendered via InstancedMesh — any number
// of trees costs exactly 2 draw calls total, not 2-per-tree.
function makeTreeCluster(positions){
  var trunkGeo = new THREE.CylinderGeometry(0.09, 0.13, 1.1, 6);
  var trunkMat = new THREE.MeshStandardMaterial({ color:0x4a3524, roughness:0.9 });
  var canopyGeo = new THREE.ConeGeometry(0.75, 1.7, 7);
  var canopyMat = new THREE.MeshStandardMaterial({ color:0x1f5c3a, roughness:0.85 });
  var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
  var canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, positions.length);
  var dummy = new THREE.Object3D();
  positions.forEach(function(p, i){
    dummy.position.set(p[0], 0.55, p[1]); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p[0], 1.55, p[1]); dummy.updateMatrix(); canopies.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  scene.add(trunks); scene.add(canopies);
}

// A short instanced fence line — reused around the Obstacle Training Area
// for a "professional training-course" boundary without adding collision
// (the poles/barriers already registered remain the only obstacles).
function makeFenceLine(x, z, length, rotY, count){
  var postGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.7, 5);
  var postMat = new THREE.MeshStandardMaterial({ color:0xffb200, roughness:0.7 });
  var fence = new THREE.InstancedMesh(postGeo, postMat, count);
  var dummy = new THREE.Object3D();
  var cos = Math.cos(rotY||0), sin = Math.sin(rotY||0);
  for(var i=0;i<count;i++){
    var t = (i/(count-1) - 0.5) * length;
    dummy.position.set(x + t*cos, 0.35, z + t*sin);
    dummy.updateMatrix();
    fence.setMatrixAt(i, dummy.matrix);
  }
  fence.instanceMatrix.needsUpdate = true;
  scene.add(fence);
}

// Small control-tower landmark — a second silhouette near the hangar so the
// Academy reads as a real facility, not a single building in a field.
function makeControlTower(x, z, id){
  var g = new THREE.Group();
  var shaftMat = new THREE.MeshStandardMaterial({ color:0x2a3f52, roughness:0.6, metalness:0.2 });
  var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4.5, 10), shaftMat);
  shaft.position.y = 2.25;
  shaft.castShadow = true; // Phase 8.2: just the one main piece, cap/base skipped to keep casters minimal
  g.add(shaft);
  var capMat = new THREE.MeshStandardMaterial({ color:0x00e5ff, emissive:0x00e5ff, emissiveIntensity:0.3, roughness:0.4 });
  var cap = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.9, 10), capMat);
  cap.position.y = 5.0;
  g.add(cap);
  g.position.set(x, 0, z);
  scene.add(g);
  registerBoxCollider(new THREE.Vector3(x, 2.8, z), new THREE.Vector3(0.75, 2.8, 0.75), id || 'tower'); // Phase 9.3C: id now overridable so reused instances stay distinguishable
  return g;
}

// Simple Academy entrance archway — decorative landmark with signage.
function makeAcademyGateway(x, z, rotY){
  var g = new THREE.Group();
  var postGeo = new THREE.CylinderGeometry(0.14, 0.16, 3.4, 8);
  var postMat = new THREE.MeshStandardMaterial({ color:0x2c4658, roughness:0.6, metalness:0.25 });
  var postL = new THREE.Mesh(postGeo, postMat); postL.position.set(-2.4, 1.7, 0);
  var postR = new THREE.Mesh(postGeo, postMat); postR.position.set(2.4, 1.7, 0);
  g.add(postL, postR);
  var barMat = new THREE.MeshStandardMaterial({ color:0x00e5ff, emissive:0x00e5ff, emissiveIntensity:0.25, roughness:0.5 });
  var bar = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 0.16), barMat);
  bar.position.y = 3.4;
  g.add(bar);
  g.position.set(x, 0, z); g.rotation.y = rotY || 0;
  scene.add(g);
  var cos = Math.cos(rotY||0), sin = Math.sin(rotY||0);
  registerBoxCollider(new THREE.Vector3(x-2.4*cos, 1.7, z+2.4*sin), new THREE.Vector3(0.2, 1.7, 0.2), 'gateway_L');
  registerBoxCollider(new THREE.Vector3(x+2.4*cos, 1.7, z-2.4*sin), new THREE.Vector3(0.2, 1.7, 0.2), 'gateway_R');
  return g;
}

/* ---------- Phase 8.1 additional helpers ---------- */

// A distinct "Main Academy Building" — deliberately different silhouette
// from the hangar (flat-roofed, window strips) so the facility reads as
// more than one repeated structure. Modular: body + roof + door + windows.
function makeAcademyBuilding(x, z, rotY){
  var g = new THREE.Group();
  var wallMat = new THREE.MeshStandardMaterial({ color:0x1d2a38, roughness:0.75, metalness:0.1 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 5), wallMat);
  body.position.y = 1.6;
  body.castShadow = true; body.receiveShadow = true; // Phase 8.2: only the two largest pieces cast/receive
  g.add(body);
  var roofMat = new THREE.MeshStandardMaterial({ color:0x2a3f52, roughness:0.6, metalness:0.15 });
  var roof = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.25, 5.4), roofMat);
  roof.position.y = 3.32;
  roof.castShadow = true; roof.receiveShadow = true; // Phase 8.2
  g.add(roof);
  var trimMat = new THREE.MeshStandardMaterial({ color:0x00e5ff, emissive:0x00e5ff, emissiveIntensity:0.2, roughness:0.5 });
  var trim = new THREE.Mesh(new THREE.BoxGeometry(7.42, 0.06, 5.42), trimMat);
  trim.position.y = 3.46;
  g.add(trim);
  var doorMat = new THREE.MeshBasicMaterial({ color:0x0a1420 });
  var door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), doorMat);
  door.position.set(0, 1.1, 2.51);
  g.add(door);
  var winMat = new THREE.MeshBasicMaterial({ color:0x00e5ff, transparent:true, opacity:0.45 });
  var winGeo = new THREE.PlaneGeometry(0.7, 0.9); // Phase 8.5: shared across all 4 windows instead of recreated per-window
  [-2.4, -0.9, 0.9, 2.4].forEach(function(wx){
    var win = new THREE.Mesh(winGeo, winMat);
    win.position.set(wx, 2.1, 2.51);
    g.add(win);
  });
  var plate = makeSignSprite('DRONOVA FLIGHT ACADEMY', '#00e5ff');
  plate.scale.set(3.4, 0.76, 1);
  plate.position.set(0, 2.75, 2.6);
  g.add(plate);
  g.position.set(x, 0, z); g.rotation.y = rotY || 0;
  scene.add(g);
  registerBoxCollider(new THREE.Vector3(x, 1.7, z), new THREE.Vector3(3.7, 1.7, 2.7), 'academy_building');
  return g;
}

// Cheap, non-interactive silhouette shapes near the boundary — reads as "a
/* ---------- Phase 9.3C: Modern Campus & Urban helpers ---------- */

// DRONOVA Operations Center — the campus's main landmark. Taller and more
// distinct than the existing Flight Academy building, with an angled glass
// roof accent so it doesn't read as a repeated structure.
function makeOperationsCenter(x, z, rotY){
  var g = new THREE.Group();
  var wallMat = new THREE.MeshStandardMaterial({ color:0x202c38, roughness:0.6, metalness:0.25 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(8, 6.5, 8), wallMat);
  body.position.y = 3.25;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  var glassMat = new THREE.MeshStandardMaterial({ color:0x0d1a24, roughness:0.25, metalness:0.5, emissive:0x00e5ff, emissiveIntensity:0.12 });
  var glassBand = new THREE.Mesh(new THREE.BoxGeometry(8.05, 1.6, 8.05), glassMat);
  glassBand.position.y = 4.8;
  g.add(glassBand);
  var roofMat = new THREE.MeshStandardMaterial({ color:0x2c3f4e, roughness:0.5, metalness:0.3 });
  var roof = new THREE.Mesh(new THREE.BoxGeometry(9, 0.4, 9), roofMat);
  roof.position.y = 6.7;
  roof.castShadow = true;
  g.add(roof);
  var antennaMat = new THREE.MeshStandardMaterial({ color:0x445566, roughness:0.5 });
  var antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.5, 6), antennaMat);
  antenna.position.y = 8.65;
  g.add(antenna);
  var beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshStandardMaterial({ color:0xff4d5e, emissive:0xff4d5e, emissiveIntensity:0.6 }));
  beacon.position.y = 10.4;
  g.add(beacon);
  var sign = makeSignSprite('DRONOVA OPERATIONS CENTER', '#00e5ff');
  sign.scale.set(3.8, 0.85, 1);
  sign.position.set(0, 2.6, 4.3);
  g.add(sign);
  g.position.set(x, 0, z); g.rotation.y = rotY || 0;
  scene.add(g);
  registerBoxCollider(new THREE.Vector3(x, 3.5, z), new THREE.Vector3(4.5, 3.5, 4.5), 'operations_center');
  return g;
}

// Reusable modern office building — configurable size and roof style so
// several visually-distinct buildings can share one function instead of
// four one-off structures. roofStyle: 'flat' | 'angled' | 'stepped'.
function makeOfficeBuilding(x, z, w, d, h, roofStyle, colorHex, rotY, id){
  var g = new THREE.Group();
  var wallMat = new THREE.MeshStandardMaterial({ color:colorHex, roughness:0.55, metalness:0.2 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  body.position.y = h/2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  var glassMat = new THREE.MeshBasicMaterial({ color:0x00e5ff, transparent:true, opacity:0.22 });
  var glass = new THREE.Mesh(new THREE.PlaneGeometry(w*0.85, h*0.6), glassMat);
  glass.position.set(0, h*0.55, d/2+0.02);
  g.add(glass);
  if(roofStyle === 'angled'){
    var roofMat = new THREE.MeshStandardMaterial({ color:0x2c3f4e, roughness:0.5 });
    var roof = new THREE.Mesh(new THREE.CylinderGeometry(0, Math.max(w,d)*0.7, h*0.28, 4), roofMat);
    roof.rotation.y = Math.PI/4;
    roof.position.y = h + h*0.14;
    g.add(roof);
  } else if(roofStyle === 'stepped'){
    var stepMat = new THREE.MeshStandardMaterial({ color:0x2c3f4e, roughness:0.55 });
    var step = new THREE.Mesh(new THREE.BoxGeometry(w*0.6, h*0.22, d*0.6), stepMat);
    step.position.y = h + h*0.11;
    g.add(step);
  } else { // flat
    var cap = new THREE.Mesh(new THREE.BoxGeometry(w+0.2, 0.2, d+0.2), new THREE.MeshStandardMaterial({ color:0x2c3f4e, roughness:0.55 }));
    cap.position.y = h + 0.1;
    g.add(cap);
  }
  g.position.set(x, 0, z); g.rotation.y = rotY || 0;
  scene.add(g);
  registerBoxCollider(new THREE.Vector3(x, h/2, z), new THREE.Vector3(w/2+0.1, h/2, d/2+0.1), id);
  return g;
}

// Research building — the urban area's distinguishing landmark, topped
// with a dome rather than a flat/angled roof, standing apart visually from
// the office buildings.
function makeResearchDome(x, z, rotY){
  var g = new THREE.Group();
  var wallMat = new THREE.MeshStandardMaterial({ color:0x1c2e2c, roughness:0.5, metalness:0.2 });
  var body = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 4, 16), wallMat);
  body.position.y = 2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  var domeMat = new THREE.MeshStandardMaterial({ color:0x2fd6c4, roughness:0.3, metalness:0.35, emissive:0x2fd6c4, emissiveIntensity:0.08 });
  var dome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 10, 0, Math.PI*2, 0, Math.PI/2), domeMat);
  dome.position.y = 4;
  dome.castShadow = true;
  g.add(dome);
  var sign = makeSignSprite('DRONOVA RESEARCH CENTER', '#2fd6c4');
  sign.scale.set(3.2, 0.72, 1);
  sign.position.set(0, 1.8, 3.9);
  g.add(sign);
  g.position.set(x, 0, z); g.rotation.y = rotY || 0;
  scene.add(g);
  registerBoxCollider(new THREE.Vector3(x, 3, z), new THREE.Vector3(3.6, 3, 3.6), 'research_dome');
  return g;
}

// Small public building — deliberately simple/low, giving the urban area
// scale variety without another large collidable mass.
function makePublicBuilding(x, z, rotY){
  var g = new THREE.Group();
  var wallMat = new THREE.MeshStandardMaterial({ color:0x30454f, roughness:0.65 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 3.6), wallMat);
  body.position.y = 1.1;
  g.add(body);
  var roofMat = new THREE.MeshStandardMaterial({ color:0x445566, roughness:0.5 });
  var roof = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.3, 4), roofMat);
  roof.rotation.y = Math.PI/4; roof.position.y = 2.35;
  g.add(roof);
  g.position.set(x, 0, z); g.rotation.y = rotY || 0;
  scene.add(g);
  return g; // deliberately no collider — small/minor per Part 8's "add collision only where useful"
}

// Clear landing pad with a large "H" marking — reusable landmark for future
// mission use.
function makeLandingPadMarker(x, z){
  var padMat = new THREE.MeshStandardMaterial({ color:0x18242c, roughness:0.6, metalness:0.15 });
  var pad = new THREE.Mesh(new THREE.CircleGeometry(3.5, 36), padMat);
  pad.rotation.x = -Math.PI/2; pad.position.set(x, 0.02, z);
  scene.add(pad);
  var ring = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.5, 36), new THREE.MeshBasicMaterial({ color:0x00e5ff, side:THREE.DoubleSide }));
  ring.rotation.x = -Math.PI/2; ring.position.set(x, 0.03, z);
  scene.add(ring);
  var barMat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.85 });
  [[-1.1,0,0.4,2.6],[1.1,0,0.4,2.6],[0,0,2.6,0.4]].forEach(function(bar){
    var b = new THREE.Mesh(new THREE.PlaneGeometry(bar[2], bar[3]), barMat);
    b.rotation.x = -Math.PI/2; b.position.set(x+bar[0], 0.035, z+bar[1]);
    scene.add(b);
  });
}

/* ---------- Phase 9.3D: environment detail/polish helpers ---------- */

// Simple bench — visual-only prop, reused via instancing.
function makeBenches(positions){
  var seatGeo = new THREE.BoxGeometry(1.1, 0.08, 0.4);
  var legGeo = new THREE.BoxGeometry(0.08, 0.35, 0.35);
  var mat = new THREE.MeshStandardMaterial({ color:0x3a4650, roughness:0.7 });
  var seats = new THREE.InstancedMesh(seatGeo, mat, positions.length);
  var legsL = new THREE.InstancedMesh(legGeo, mat, positions.length);
  var legsR = new THREE.InstancedMesh(legGeo, mat, positions.length);
  var dummy = new THREE.Object3D();
  positions.forEach(function(p, i){
    var rot = p[2] || 0;
    dummy.position.set(p[0], 0.42, p[1]); dummy.rotation.y = rot; dummy.updateMatrix(); seats.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p[0]-0.45*Math.cos(rot), 0.2, p[1]+0.45*Math.sin(rot)); dummy.updateMatrix(); legsL.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p[0]+0.45*Math.cos(rot), 0.2, p[1]-0.45*Math.sin(rot)); dummy.updateMatrix(); legsR.setMatrixAt(i, dummy.matrix);
  });
  seats.instanceMatrix.needsUpdate = true; legsL.instanceMatrix.needsUpdate = true; legsR.instanceMatrix.needsUpdate = true;
  scene.add(seats); scene.add(legsL); scene.add(legsR);
}

// Small rooftop utility box (AC unit / equipment) — purely decorative,
// reused across building roofs.
function makeRooftopUnits(positions){
  var geo = new THREE.BoxGeometry(0.6, 0.4, 0.5);
  var mat = new THREE.MeshStandardMaterial({ color:0x445560, roughness:0.6, metalness:0.2 });
  var mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  var dummy = new THREE.Object3D();
  positions.forEach(function(p, i){
    dummy.position.set(p[0], p[2], p[1]); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

// Small ground-level entrance/plaza platform — flat, cheap, purely visual.
function makeEntrancePlatform(x, z, w, d, color){
  var mat = new THREE.MeshStandardMaterial({ color: color || 0x2c3a44, roughness:0.7 });
  var plat = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), mat);
  plat.position.set(x, 0.03, z);
  scene.add(plat);
}

// Small satellite-style communication dish — a lightweight detail prop for
// the campus, not a new light source.
function makeCommsDish(x, z, rotY){
  var g = new THREE.Group();
  var poleMat = new THREE.MeshStandardMaterial({ color:0x445560, roughness:0.6 });
  var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 6), poleMat);
  pole.position.y = 0.7;
  g.add(pole);
  var dishMat = new THREE.MeshStandardMaterial({ color:0xd8dde2, roughness:0.4, side:THREE.DoubleSide });
  var dish = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), dishMat);
  dish.rotation.x = -Math.PI/3.2; dish.position.set(0, 1.5, 0);
  g.add(dish);
  g.position.set(x, 0, z); g.rotation.y = rotY || 0;
  scene.add(g);
}

// Water tower landmark — Part 5's suggested addition, tall enough to read
// clearly from the air. High-priority collider per Part 11 (a "major tower").
function makeWaterTower(x, z){
  var g = new THREE.Group();
  var legMat = new THREE.MeshStandardMaterial({ color:0x394650, roughness:0.65, metalness:0.15 });
  var legGeo = new THREE.CylinderGeometry(0.12, 0.14, 5, 6); // Phase 9.3F-5: hoisted out of the loop, shared across all 4 legs
  [[-1.1,-1.1],[1.1,-1.1],[-1.1,1.1],[1.1,1.1]].forEach(function(p){
    var leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(p[0], 2.5, p[1]);
    leg.rotation.x = Math.atan2(p[1],5)*0.15; leg.rotation.z = -Math.atan2(p[0],5)*0.15;
    g.add(leg);
  });
  var tankMat = new THREE.MeshStandardMaterial({ color:0xdde3e6, roughness:0.5, metalness:0.15 });
  var tank = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 2.6, 16), tankMat);
  tank.position.y = 6.3;
  tank.castShadow = true;
  g.add(tank);
  var capMat = new THREE.MeshStandardMaterial({ color:0x2c3a44, roughness:0.5 });
  var cap = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.1, 16), capMat);
  cap.position.y = 8.15;
  g.add(cap);
  g.position.set(x, 0, z);
  scene.add(g);
  registerBoxCollider(new THREE.Vector3(x, 4, z), new THREE.Vector3(2.5, 4, 2.5), 'water_tower');
  return g;
}

// Small decorative pond — a flat tinted surface only; the existing ground-
// level clamp already prevents the drone flying below any ground surface,
// so no dedicated collision is needed for a flat water plane.
function makePond(x, z, r){
  var mat = new THREE.MeshStandardMaterial({ color:0x1c4a5c, roughness:0.15, metalness:0.35, transparent:true, opacity:0.85 });
  var pond = new THREE.Mesh(new THREE.CircleGeometry(r, 32), mat);
  pond.rotation.x = -Math.PI/2; pond.position.set(x, 0.015, z);
  scene.add(pond);
  var edge = new THREE.Mesh(new THREE.RingGeometry(r, r+0.4, 32), new THREE.MeshStandardMaterial({ color:0x4a5a4a, roughness:0.85, side:THREE.DoubleSide }));
  edge.rotation.x = -Math.PI/2; edge.position.set(x, 0.012, z);
  scene.add(edge);
}

/* ---------- Phase 9.3F-1: ground layout, pavement & parking helpers ---------- */

// A genuine lit ground surface (not a transparent tint) — MeshStandardMaterial
// so it responds correctly to the Phase 9.3E time-of-day lights, per Part 11.
function makeGroundSurface(x, z, radius, color, segments){
  var mat = new THREE.MeshStandardMaterial({ color:color, roughness:0.9, metalness:0.03 });
  var mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, segments || 32), mat);
  mesh.rotation.x = -Math.PI/2; mesh.position.set(x, 0.006, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// Pavement/sidewalk ring around a structure — lit surface, thin unlit edge
// line for definition. Purely visual, no collision.
function makePavementRing(x, z, innerR, outerR, color){
  var mat = new THREE.MeshStandardMaterial({ color: color || 0x3a4550, roughness:0.85 });
  var ring = new THREE.Mesh(new THREE.RingGeometry(innerR, outerR, 32), mat);
  ring.rotation.x = -Math.PI/2; ring.position.set(x, 0.009, z);
  scene.add(ring);
  var edgeMat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.15, side:THREE.DoubleSide });
  var edge = new THREE.Mesh(new THREE.RingGeometry(outerR-0.06, outerR, 32), edgeMat);
  edge.rotation.x = -Math.PI/2; edge.position.set(x, 0.011, z);
  scene.add(edge);
}

// Marked parking area — a lit asphalt-toned base with painted space lines
// (thin unlit strips, matching the existing lane-marking convention).
function makeParkingArea(x, z, w, d, rows, cols, rotY){
  var baseMat = new THREE.MeshStandardMaterial({ color:0x232a30, roughness:0.9 });
  var base = new THREE.Mesh(new THREE.PlaneGeometry(w, d), baseMat);
  base.rotation.x = -Math.PI/2; base.rotation.z = rotY || 0; base.position.set(x, 0.01, z);
  scene.add(base);
  var lineMat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.4 });
  var spotW = w / cols, spotD = d / rows;
  var lineGeo = new THREE.PlaneGeometry(0.08, d*0.85); // Phase 9.3F-5: hoisted — identical across every line within a given parking lot call
  for(var c=1;c<cols;c++){
    var line = new THREE.Mesh(lineGeo, lineMat);
    var lx = -w/2 + c*spotW, lz = 0;
    line.rotation.x = -Math.PI/2; line.rotation.z = rotY || 0;
    line.position.set(x + lx*Math.cos(rotY||0), 0.014, z - lx*Math.sin(rotY||0));
    scene.add(line);
  }
}

// Small raised platform / gentle terrain step — cheap, subtle, per Part 8.
function makeGentleRise(x, z, r, h){
  var mat = new THREE.MeshStandardMaterial({ color:0x1c3020, roughness:0.92 });
  var rise = new THREE.Mesh(new THREE.CylinderGeometry(r*0.75, r, h, 18), mat);
  rise.position.set(x, h/2, z);
  scene.add(rise);
}

/* ---------- Phase 9.3F-2: modular building detail system ---------- */

// Shared window geometry/materials — reused across every facade this phase
// adds, regardless of how many buildings/windows exist. Two variants: a
// constant tinted-glass look (always visible) and an emissive "lit" variant
// that the EXISTING Phase 9.3E scene.traverse() scan automatically captures
// for night illumination — no changes were needed to that system at all.
var _winGeo = new THREE.PlaneGeometry(0.62, 0.85);
var _winGlassMat = new THREE.MeshStandardMaterial({ color:0x16242e, roughness:0.25, metalness:0.45 });
var _winGlowMat = new THREE.MeshStandardMaterial({ color:0xffe3ad, emissive:0xffe3ad, emissiveIntensity:0.4, roughness:0.4 });

// Adds a grid of windows to a flat facade at world position (x,z), rotated
// by rotY, offset `frontOffset` out from the building's centre along its
// local +Z (front) axis — the same convention the existing building
// helpers already use for their single glass panels. Batched into exactly
// 2 InstancedMesh draw calls per call (glass set + glow set), matching the
// instancing discipline already used throughout this codebase — not one
// mesh per window.
function addFacadeWindowGrid(x, z, rotY, frontOffset, w, rows, cols, baseY){
  var cos = Math.cos(rotY||0), sin = Math.sin(rotY||0);
  var glassPos = [], glowPos = [];
  for(var r=0;r<rows;r++){
    for(var c=0;c<cols;c++){
      var lx = (c - (cols-1)/2) * (w/(cols+0.6));
      var ly = baseY + r*1.15;
      var wx = x + lx*cos + frontOffset*sin;
      var wz = z - lx*sin + frontOffset*cos;
      (Math.random() < 0.32 ? glowPos : glassPos).push([wx, ly, wz]); // ~1/3 of windows read as "lit" once night captures them
    }
  }
  [[glassPos,_winGlassMat],[glowPos,_winGlowMat]].forEach(function(pair){
    var positions = pair[0], mat = pair[1];
    if(!positions.length) return;
    var mesh = new THREE.InstancedMesh(_winGeo, mat, positions.length);
    var dummy = new THREE.Object3D();
    positions.forEach(function(p,i){
      dummy.position.set(p[0],p[1],p[2]); dummy.rotation.y = rotY||0; dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  });
}

// A distinctly taller structure (Part 4/11) — the world's skyline anchor.
// Modular: body + banded floor lines + cap + antenna + beacon + a proper
// window grid via addFacadeWindowGrid above, rather than one plain box.
function makeTallLandmark(x, z, rotY){
  var g = new THREE.Group();
  var h = 15;
  var wallMat = new THREE.MeshStandardMaterial({ color:0x1e2a36, roughness:0.5, metalness:0.3 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(5, h, 5), wallMat);
  body.position.y = h/2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  var bandMat = new THREE.MeshStandardMaterial({ color:0x2c3f4e, roughness:0.5, metalness:0.3 });
  for(var i=1;i<4;i++){
    var band = new THREE.Mesh(new THREE.BoxGeometry(5.15, 0.18, 5.15), bandMat);
    band.position.y = (h/4)*i;
    g.add(band);
  }
  var capMat = new THREE.MeshStandardMaterial({ color:0x0d1a24, roughness:0.3, metalness:0.4 });
  var cap = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1, 3.4), capMat);
  cap.position.y = h + 0.5;
  g.add(cap);
  var antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4, 6), new THREE.MeshStandardMaterial({ color:0x445566, roughness:0.5 }));
  antenna.position.y = h + 3;
  g.add(antenna);
  var beacon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), new THREE.MeshStandardMaterial({ color:0xff4d5e, emissive:0xff4d5e, emissiveIntensity:0.6 }));
  beacon.position.y = h + 5.1;
  g.add(beacon);
  var sign = makeSignSprite('DRONOVA TOWER', '#00e5ff');
  sign.scale.set(2.6, 0.6, 1);
  sign.position.set(0, 2, 2.6);
  g.add(sign);
  g.position.set(x, 0, z); g.rotation.y = rotY || 0;
  scene.add(g);
  registerBoxCollider(new THREE.Vector3(x, h/2, z), new THREE.Vector3(2.7, h/2, 2.7), 'tall_landmark');
  addFacadeWindowGrid(x, z, rotY, 2.52, 5, 5, 3, 1.4);
  return g;
}

/* ---------- Phase 9.3F-3: urban infrastructure helpers ---------- */

// Static traffic-light-style pole at an intersection — three colour discs,
// no actual light-switching logic (explicitly out of scope), no collision
// (small object, matches Part 9's low-priority list).
function makeTrafficLightPole(x, z){
  var poleMat = new THREE.MeshStandardMaterial({ color:0x2c3238, roughness:0.7 });
  var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6), poleMat);
  pole.position.set(x, 1.3, z);
  scene.add(pole);
  var boxMat = new THREE.MeshStandardMaterial({ color:0x1a1e22, roughness:0.6 });
  var box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.18), boxMat);
  box.position.set(x, 2.5, z);
  scene.add(box);
  var colors = [0xff4d5e, 0xffb200, 0x3dffa0];
  var discGeo = new THREE.CircleGeometry(0.06, 10); // Phase 9.3F-5: hoisted — the 3 discs' materials legitimately differ (red/amber/green) but their geometry doesn't
  colors.forEach(function(c, i){
    var disc = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color:c, emissive:c, emissiveIntensity:0.25, roughness:0.4 }));
    disc.position.set(x, 2.5 + 0.18 - i*0.18, z + 0.1);
    scene.add(disc);
  });
}

// Small bollard cluster — visual-only, reused via instancing.
function makeBollards(positions){
  var geo = new THREE.CylinderGeometry(0.06, 0.07, 0.65, 8);
  var mat = new THREE.MeshStandardMaterial({ color:0x2c3a44, roughness:0.6, emissive:0xffb200, emissiveIntensity:0.15 });
  var mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  var dummy = new THREE.Object3D();
  positions.forEach(function(p, i){ dummy.position.set(p[0], 0.33, p[1]); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

// A slim utility pole (distinct from the lighting-pole streetlamp) with a
// small electrical box at its base — believable city detail, visual-only.
function makeUtilityPole(x, z){
  var poleMat = new THREE.MeshStandardMaterial({ color:0x3a4550, roughness:0.75 });
  var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 3.4, 6), poleMat);
  pole.position.set(x, 1.7, z);
  scene.add(pole);
  var armMat = new THREE.MeshStandardMaterial({ color:0x3a4550, roughness:0.75 });
  var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), armMat);
  arm.rotation.z = Math.PI/2; arm.position.set(x+0.4, 3.1, z);
  scene.add(arm);
  var boxMat = new THREE.MeshStandardMaterial({ color:0x2c3238, roughness:0.65, metalness:0.1 });
  var box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.28), boxMat);
  box.position.set(x, 0.28, z+0.35);
  scene.add(box);
}

// larger facility beyond the play area" without expanding the active zone
// or adding any new collision volumes. One InstancedMesh, one draw call.
function makeDistantSilhouettes(positions){
  var geo = new THREE.BoxGeometry(1.4, 2.2, 1.4);
  var mat = new THREE.MeshBasicMaterial({ color:0x0c1a26, transparent:true, opacity:0.6, fog:true });
  var mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  var dummy = new THREE.Object3D();
  positions.forEach(function(p, i){
    dummy.position.set(p[0], 1.1, p[1]); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

/* ---------- Phase 9.3F-5: distant-layer helpers ----------
   Everything below is placed beyond LIMITS.boundary (125), so the
   drone can physically never reach it — collision is impossible
   by construction, not merely omitted (Part 11). Night subtlety
   (Part 8) comes entirely from the EXISTING unchanged fog system
   (fogFar ranges from 130 at night down to 170 at day), so objects
   placed just past the boundary naturally fade at night with zero
   new code. */

// A simple low-detail skyline — one shared unit-box geometry, scaled
// per-instance for height/width variation (Part 1: "different building
// heights", still exactly one draw call regardless of count).
function makeDistantSkyline(specs){
  var geo = new THREE.BoxGeometry(1, 1, 1);
  var mat = new THREE.MeshBasicMaterial({ color:0x0e1c2a, transparent:true, opacity:0.55, fog:true });
  var mesh = new THREE.InstancedMesh(geo, mat, specs.length);
  var dummy = new THREE.Object3D();
  specs.forEach(function(s, i){
    var w = 1.6 + Math.random()*1.3;
    dummy.position.set(s[0], s[2]/2, s[1]);
    dummy.scale.set(w, s[2], w);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

// A low-detail distant tree line — deliberately simpler than the real
// Forest's trees (no variants, no scale jitter beyond a small amount) —
// exactly 2 draw calls (trunk + canopy) for any count.
function makeDistantTreeLine(positions){
  var trunkGeo = new THREE.CylinderGeometry(0.12, 0.15, 1.6, 5);
  var trunkMat = new THREE.MeshBasicMaterial({ color:0x142a1c, transparent:true, opacity:0.6, fog:true });
  var canopyGeo = new THREE.ConeGeometry(1.1, 2.2, 6);
  var canopyMat = new THREE.MeshBasicMaterial({ color:0x0f2418, transparent:true, opacity:0.6, fog:true });
  var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
  var canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, positions.length);
  var dummy = new THREE.Object3D();
  positions.forEach(function(p, i){
    var scale = 0.85 + Math.random()*0.5;
    dummy.position.set(p[0], 0.8*scale, p[1]); dummy.scale.set(scale,scale,scale); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p[0], (1.6+2.2*0.4)*scale, p[1]); dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true; canopies.instanceMatrix.needsUpdate = true;
  scene.add(trunks); scene.add(canopies);
}

// A large, very low, cheap distant landform — softens the boundary in
// directions with no other structures, purely a silhouette.
function makeDistantLandform(x, z, r, h){
  var mat = new THREE.MeshBasicMaterial({ color:0x0e1c16, transparent:true, opacity:0.5, fog:true });
  var mesh = new THREE.Mesh(new THREE.CylinderGeometry(r*0.6, r, h, 12), mat);
  mesh.position.set(x, h/2, z);
  scene.add(mesh);
}

/* ---------- Phase 8.3 environmental prop helpers ---------- */

// Safety cones — visual-only, marks zone edges without adding collision.
// One InstancedMesh (cone) covers any number of cones in one draw call.
function makeSafetyCones(positions){
  var geo = new THREE.ConeGeometry(0.16, 0.42, 10);
  var mat = new THREE.MeshStandardMaterial({ color:0xff7a1a, roughness:0.6, emissive:0xff7a1a, emissiveIntensity:0.15 });
  var mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  var dummy = new THREE.Object3D();
  positions.forEach(function(p, i){ dummy.position.set(p[0], 0.21, p[1]); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

// Low bushes — visual-only vegetation, cheaper/smaller than the tree cluster,
// meant for filling in quieter corners rather than marking a zone.
function makeBushCluster(positions){
  var geo = new THREE.SphereGeometry(0.42, 8, 6);
  var mat = new THREE.MeshStandardMaterial({ color:0x2a6b42, roughness:0.9 });
  var mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  var dummy = new THREE.Object3D();
  positions.forEach(function(p, i){
    dummy.position.set(p[0], 0.3, p[1]);
    dummy.scale.set(1, 0.7, 1); // slightly flattened so it reads as a bush, not a ball
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

// Equipment crates — visual-only facility dressing near the hangar.
function makeCrateCluster(positions){
  var geo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  var mat = new THREE.MeshStandardMaterial({ color:0x3a4a3a, roughness:0.75, metalness:0.1 });
  var mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  var dummy = new THREE.Object3D();
  positions.forEach(function(p, i){
    dummy.position.set(p[0], 0.35, p[1]);
    dummy.rotation.y = (i * 0.7) % 1; dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

// Lighting poles — visual only; per the brief, these do NOT get a real
// THREE.Light each (that would multiply the light count per pole). The
// "lamp" is just an emissive-material cap, lit by the existing scene lights
// like everything else. Two InstancedMeshes (pole + cap) for any pole count.
function makeLightingPoles(positions){
  var poleGeo = new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6);
  var poleMat = new THREE.MeshStandardMaterial({ color:0x2c3f4e, roughness:0.7 });
  var poles = new THREE.InstancedMesh(poleGeo, poleMat, positions.length);
  var capGeo = new THREE.SphereGeometry(0.13, 8, 8);
  var capMat = new THREE.MeshStandardMaterial({ color:0xfff2c8, emissive:0xfff2c8, emissiveIntensity:0.6, roughness:0.4 });
  var caps = new THREE.InstancedMesh(capGeo, capMat, positions.length);
  var dummy = new THREE.Object3D();
  positions.forEach(function(p, i){
    dummy.position.set(p[0], 1.3, p[1]); dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p[0], 2.65, p[1]); dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
  scene.add(poles); scene.add(caps);
}

// A single classic aviation windsock — pole + tapered fabric cone. Static
// (no per-frame animation, per the performance requirement to avoid
// continuous unnecessary calculations).
function makeWindsock(x, z, rotY){
  var g = new THREE.Group();
  var poleMat = new THREE.MeshStandardMaterial({ color:0x2c3f4e, roughness:0.7 });
  var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6), poleMat);
  pole.position.y = 1.1;
  g.add(pole);
  var sockMat = new THREE.MeshStandardMaterial({ color:0xff6a3d, roughness:0.65, side:THREE.DoubleSide });
  var sock = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 10, 1, true), sockMat);
  sock.rotation.z = Math.PI/2;
  sock.position.set(0.35, 2.05, 0);
  g.add(sock);
  var ringMat = new THREE.MeshStandardMaterial({ color:0x445566, roughness:0.6 });
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 12), ringMat);
  ring.rotation.y = Math.PI/2;
  ring.position.set(0, 2.05, 0);
  g.add(ring);
  g.position.set(x, 0, z); g.rotation.y = rotY || 0;
  scene.add(g);
}

/* ============================================================
   ZONE 1 — TAKE-OFF / LANDING ZONE (origin)
   Existing Landing/Complete-Flight missions check distance from
   (0,0), so the launch pad and the precision landing pad are
   combined here rather than split apart — keeping the visual
   layout honest about where those missions actually succeed.
============================================================ */
var landingPad = (function(){
  var g = new THREE.Group();
  var padGeo = new THREE.CircleGeometry(2.2, 40);
  var padMat = new THREE.MeshStandardMaterial({color:0x123244, emissive:0x00e5ff, emissiveIntensity:0.15, roughness:0.6});
  var pad = new THREE.Mesh(padGeo, padMat);
  pad.rotation.x = -Math.PI/2; pad.position.y = 0.02;
  g.add(pad);
  var ringGeo = new THREE.RingGeometry(2.0, 2.2, 40);
  var ringMat = new THREE.MeshBasicMaterial({color:0x00e5ff, side:THREE.DoubleSide});
  var ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.03;
  g.add(ring);
  g.position.set(0,0,0);
  scene.add(g);
  return g;
})();
// Precision accuracy rings (bullseye) for landing training
makeGroundRing(0, 0, 2.6, 2.85, 0xffb200, 0.55);
makeGroundRing(0, 0, 3.3, 3.5, 0xffb200, 0.4);
// Safety boundary ring
makeGroundRing(0, 0, 4.6, 4.75, 0xff4d5e, 0.35);
makeSignPost(3.2, 3.2, 'TAKE-OFF / LANDING ZONE', '#00e5ff');
// Phase 7.6: distinct "PRECISION LANDING" signage — same physical pad as
// take-off (Mission checks distance from this exact origin), but called out
// separately since the brief lists it as its own zone that must read clearly.
makeSignPost(-3.2, -3.2, 'PRECISION LANDING TARGET', '#ffb200');
makeZoneTint(0, 0, 6.5, 0x00e5ff, 0.05); // Phase 7.6: soft zone-identity tint, beneath the existing rings
// Phase 8.1: raised launch-platform base, kept thin and entirely below the
// existing pad/ring geometry (y 0.02–0.03) so it never intersects the drone
// spawn point at y=0.03.
(function(){
  var platMat = new THREE.MeshStandardMaterial({ color:0x0f1c28, roughness:0.8, metalness:0.1 });
  var plat = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.75, 0.05, 40), platMat);
  plat.position.y = -0.025;
  scene.add(plat);
})();
// Phase 8.3: aviation windsock — clear of the safety ring (radius 4.75) and
// the launch platform, doesn't block the take-off flight path.
makeWindsock(6.5, 5, Math.PI*0.15);
// Phase 8.3: safety cones tracing the outer edge of the take-off/landing
// zone — visual-only, no collision, six evenly spaced around the ring.
makeSafetyCones([[5.3,0],[2.65,4.59],[-2.65,4.59],[-5.3,0],[-2.65,-4.59],[2.65,-4.59]]);

/* ============================================================
   ZONE 2 — HOVER TRAINING ZONE
============================================================ */
var HOVER_ZONE = { x: 18, z: 10 };
makeGroundRing(HOVER_ZONE.x, HOVER_ZONE.z, 5.7, 6.0, 0x00e5ff, 0.3);
(function(){
  // altitude training indicator — thin translucent column up to the 10m
  // training altitude used by the existing Hover mission, with a ring
  // marking the target height.
  var colGeo = new THREE.CylinderGeometry(0.03, 0.03, 10, 6, 1, true);
  var colMat = new THREE.MeshBasicMaterial({ color:0x00e5ff, transparent:true, opacity:0.25 });
  var col = new THREE.Mesh(colGeo, colMat);
  col.position.set(HOVER_ZONE.x, 5, HOVER_ZONE.z);
  scene.add(col);
  var targetRing = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.03, 8, 24), new THREE.MeshBasicMaterial({color:0x3dffa0}));
  targetRing.rotation.x = Math.PI/2;
  targetRing.position.set(HOVER_ZONE.x, 10, HOVER_ZONE.z);
  scene.add(targetRing);
})();
makeSignPost(HOVER_ZONE.x - 6.5, HOVER_ZONE.z, 'HOVER TRAINING', '#3dffa0');
makeZoneTint(HOVER_ZONE.x, HOVER_ZONE.z, 7.5, 0x3dffa0, 0.045); // Phase 7.6
// Phase 8.1: ground-level centre indicator, directly beneath the altitude column
makeGroundRing(HOVER_ZONE.x, HOVER_ZONE.z, 0.7, 0.85, 0x3dffa0, 0.7);
(function(){
  var dot = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), new THREE.MeshBasicMaterial({color:0x3dffa0}));
  dot.rotation.x = -Math.PI/2; dot.position.set(HOVER_ZONE.x, 0.012, HOVER_ZONE.z);
  scene.add(dot);
})();

/* ============================================================
   ZONE 3 — FLIGHT TRAINING COURSE
   A corridor of gates south of the take-off zone. forwardMarker
   is reused (not replaced) as the course's final checkpoint —
   the existing Move-Forward and Complete-Flight missions read
   its .position directly, so it must stay the same object.
============================================================ */
function makeMarker(color, x, z, label){
  var g = new THREE.Group();
  var poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 3, 8);
  var poleMat = new THREE.MeshStandardMaterial({color:0x203040, roughness:0.7});
  var pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 1.5;
  g.add(pole);
  var ringGeo = new THREE.RingGeometry(1.2, 1.5, 32);
  var ringMat = new THREE.MeshBasicMaterial({color:color, transparent:true, opacity:0.7, side:THREE.DoubleSide});
  var ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.03;
  g.add(ring);
  var flagGeo = new THREE.ConeGeometry(0.3, 0.6, 4);
  var flagMat = new THREE.MeshStandardMaterial({color:color, emissive:color, emissiveIntensity:0.4});
  var flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.y = 3.2;
  g.add(flag);
  g.position.set(x, 0, z);
  g.userData.label = label;
  scene.add(g);
  return g;
}
makeGate(0, -12, 0, 3.2, 3, 0x00e5ff, 'gate1');
makeGate(0, -24, 0, 3.2, 3, 0x00e5ff, 'gate2');
var forwardMarker = makeMarker(0x00e5ff, 0, -36, 'Forward Target'); // course checkpoint — same object missions already reference
makeGroundStripe(0, -18, 1.2, 30, 0, 0xffffff, 0.25); // runway-style centre line down the course
makeSignPost(-3, -6, 'FLIGHT TRAINING COURSE →', '#00e5ff');
// Phase 7.6: direction arrows along the corridor (decorative only, not collidable)
[-6, -18, -30].forEach(function(zPos){ makeDirectionArrow(0, zPos, 0, 0x00e5ff); });
makeZoneTint(0, -18, 4.5, 0x00e5ff, 0.03);
// Phase 7.6: Emergency Return training area — this zone previously had no
// visual identity even though Mission 6 starts nearby.
makeSignPost(5, -30, 'EMERGENCY RETURN AREA', '#ff4d5e');
// Phase 8.3: lighting poles flanking the gate corridor, well clear of the
// ~3.2m-wide gate channel (posts at x=±1.6) so they never obstruct the path.
makeLightingPoles([[5,-12],[-5,-12],[5,-24],[-5,-24]]);
makeSignPost(3, -9, 'CAUTION — FLIGHT ACTIVITY', '#ffb200');

/* ============================================================
   ZONE 4 — OBSTACLE TRAINING AREA
   The 5 original poles are reused here (repositioned into a
   deliberate slalom layout) rather than discarded, plus two
   training barriers for variety. All collidable via Phase 7.1.
============================================================ */
var OBSTACLE_ZONE_POLES = [[20,-4],[24,-9],[20,-14],[26,-18],[22,-22]];
// Phase 8.5: geometry/materials hoisted outside the loop and shared across
// all 5 poles/stripes — previously each iteration created its own fresh
// geometry+material despite every pole being visually identical.
var _poleGeo = new THREE.CylinderGeometry(0.15, 0.18, 2.2, 8);
var _poleMat = new THREE.MeshStandardMaterial({color:0x1c3a4d, roughness:0.8});
var _stripeGeo = new THREE.TorusGeometry(0.19, 0.045, 6, 12);
var _stripeMat = new THREE.MeshStandardMaterial({ color:0xffb200, emissive:0xffb200, emissiveIntensity:0.35, roughness:0.5 });
OBSTACLE_ZONE_POLES.forEach(function(p, i){
  var pole = new THREE.Mesh(_poleGeo, _poleMat);
  pole.position.set(p[0], 1.1, p[1]);
  scene.add(pole);
  registerBoxCollider(pole.position, new THREE.Vector3(0.35, 1.1, 0.35), 'pole_'+i);
  // Phase 7.6: aviation-style hazard stripe band — purely visual, added at the
  // pole's existing position/height, never altering the collider registered above.
  var stripe = new THREE.Mesh(_stripeGeo, _stripeMat);
  stripe.rotation.x = Math.PI/2;
  stripe.position.set(p[0], 1.75, p[1]);
  scene.add(stripe);
});
makeBarrier(23, -6.5, Math.PI/5, 'barrier_1');
makeBarrier(22, -16, -Math.PI/6, 'barrier_2');
makeSignPost(17, -1, 'OBSTACLE COURSE', '#ffb200');
makeZoneTint(22.5, -13, 10, 0xffb200, 0.04); // Phase 7.6
// Phase 7.6: two short fence lines framing the course entrance/exit —
// decorative only; the poles/barriers above remain the only colliders here.
makeFenceLine(17.5, -1.5, 5, Math.PI*0.4, 6);
makeFenceLine(24, -25, 6, Math.PI*0.15, 6);
// Phase 8.1: ground hazard chevron stripes at the course entrance —
// professional obstacle-course marking, purely decorative.
[[18.5,-2],[19.5,-3]].forEach(function(p){
  makeGroundStripe(p[0], p[1], 0.4, 2.2, Math.PI*0.28, 0xffb200, 0.6);
});
// Phase 8.3: equipment crates and safety cones near the course entrance —
// facility dressing only, clear of the poles/barriers/checkpoints.
makeCrateCluster([[14,-1],[14.6,-0.6]]);
makeSafetyCones([[16,-3],[16.5,-1]]);

/* ============================================================
   ZONE 5 — DRONOVA ACADEMY / HANGAR
============================================================ */
makeHangar(-15, 8, Math.PI*0.15);
makeSignPost(-15, 12.5, 'DRONOVA ACADEMY HANGAR', '#00e5ff');
// Phase 7.6: supporting landmarks around the hangar
makeControlTower(-9, 14);
makeAcademyGateway(-7, 3, Math.PI*0.25);
makeSignPost(-7, 5.6, 'DRONOVA FLIGHT ACADEMY', '#00e5ff');
makeTreeCluster([[-21,15],[-23,18],[-19,20],[-25,6],[-9,20],[-11,23],[-26,12]]);
makeZoneTint(-15, 12, 9, 0x00e5ff, 0.035);
// Phase 8.1: a second, visually distinct structure (flat-roofed, not the
// hangar's rounded quonset shape) placed clear of the hangar/tower/gateway
// collision volumes — verified no AABB overlap before placing.
makeAcademyBuilding(-22, -2, -0.3);
makeSignPost(-22, 3.2, 'DRONE OPERATIONS', '#3dffa0');
// Phase 8.1: a simple connecting path from the take-off zone toward the
// Academy cluster — purely a ground marking, no new colliders.
makeGroundStripe(-9, 3, 1.0, 22, 0.98, 0xb8c7d9, 0.18);
// Phase 8.1: distant low-detail silhouettes on the opposite (east) side of
// the map from the Academy cluster — visual depth only, well clear of every
// mission zone, does not expand the active play area (still inside the
// existing 60m ground radius).
makeDistantSilhouettes([[42,4],[45,10],[40,14],[46,-6],[43,-12]]);

/* ============================================================
   DISTANT WORLD — SKYLINE, TREE LINE & LANDFORMS (Phase 9.3F-5)
   Everything here sits beyond LIMITS.boundary (125), so the drone
   can never physically reach it — collision is impossible by
   construction. Night subtlety comes from the existing unchanged
   fog system alone. Positioned along the arcs matching where the
   real Urban/Campus area and the real Forest already sit, plus a
   few large landforms in the otherwise-empty remaining quadrants
   so the boundary feels softened from every direction, not just
   where structures already exist.
============================================================ */
makeDistantSkyline([[143.0,38.3,8],[144.7,52.7,14],[145.0,67.6,20],[128.2,74.0,21],[126.1,88.3,11],
  [122.6,102.8,12],[104.7,104.7,18],[99.0,118.0,24],[91.8,131.1,9],[74.0,128.2,15],[65.1,139.6,16],[54.7,150.4,22]]);
makeDistantTreeLine([[137.2,-36.8],[140.0,-44.9],[142.3,-53.5],[144.1,-62.4],[127.4,-62.7],[128.6,-71.3],
  [129.2,-80.1],[129.2,-89.2],[112.8,-86.2],[112.3,-94.9],[111.2,-103.7],[109.5,-112.6],[93.9,-106.5],
  [91.7,-114.9],[88.9,-123.3],[85.5,-131.7],[71.4,-122.7],[67.6,-130.5],[63.3,-138.2],[58.3,-145.8],[46.2,-134.3],[41.0,-141.2]]);
[[-24.0,135.9],[-125.1,58.3],[-125.1,-58.3],[-24.0,-135.9]].forEach(function(p, i){
  makeDistantLandform(p[0], p[1], 22 + (i%2)*6, 5 + (i%3)*2);
});

// Phase 8.3: facility dressing near the hangar — verified clear of the
// hangar's collider (x:[-18.2,-11.8], z:[3.8,12.2]).
makeCrateCluster([[-11,3],[-11.6,3.4],[-11,4.5]]);
(function(){ // small utility box, visual only
  var mat = new THREE.MeshStandardMaterial({ color:0x1c2a34, roughness:0.7, metalness:0.15 });
  var box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.35), mat);
  box.position.set(-10.6, 0.3, 5.2);
  scene.add(box);
})();
// Phase 8.3: quiet-corner vegetation, well clear of every structure/collider.
makeBushCluster([[-27,-9],[-29,-11],[-30,-8],[-28,-13]]);
makeSignPost(-4, 0.5, 'AUTHORIZED TRAINING ZONE', '#00e5ff');

/* ============================================================
   FOREST & VEGETATION AREA (Phase 9.3B)
   Genuinely part of the always-active shared world — built once
   here at scene setup like everything else in this file, added
   directly via scene.add(), never wrapped in any mode-toggled
   group. Visible identically in Learning Mode, Missions, Free
   Flight, Flight Academy, and Rescue Academy, satisfying the
   "one shared world" requirement by construction rather than by
   a runtime check.

   LAYOUT: positioned southeast of the existing training cluster,
   clear of the launch area, flight course, obstacle course, and
   hangar cluster. LIMITS.boundary was widened (see above) to
   include it, since nothing existing sits anywhere near the old
   edge.
============================================================ */
var FOREST_CENTER = { x: 65, z: -60 };
var FOREST_OUTER_RADIUS = 55;    // trees are scattered within this radius of FOREST_CENTER
var FOREST_INNER_RADIUS = 32;    // inside this = "interior" (denser); outside = "edge" (sparser)
var FOREST_CLEARINGS = [          // open pockets reserved for future rescue targets/landing sites — no trees inside these
  { x: 65, z: -60, r: 11 },
  { x: 92, z: -78, r: 8 },
  { x: 42, z: -82, r: 8 }
];
function inForestClearing(x, z){
  return FOREST_CLEARINGS.some(function(c){ return Math.hypot(x-c.x, z-c.z) < c.r; });
}

(function buildForest(){
  // --- forest ground (Part 4): its own distinctly-coloured patch, not just
  // trees dropped on the training grid. Deliberately overlaps the edge of
  // the main ground disc slightly rather than leaving a gap, keeping the
  // world visually continuous.
  var forestGroundMat = new THREE.MeshStandardMaterial({ color:0x14261a, roughness:0.95, metalness:0.02 });
  var forestGround = new THREE.Mesh(new THREE.CircleGeometry(FOREST_OUTER_RADIUS+8, 48), forestGroundMat);
  forestGround.rotation.x = -Math.PI/2;
  forestGround.position.set(FOREST_CENTER.x, 0.005, FOREST_CENTER.z);
  forestGround.receiveShadow = true;
  scene.add(forestGround);

  // subtle terrain variation (Part 5) — a few low, cheap rises, never steep
  // enough to cause collision surprises for beginner flight.
  var moundMat = new THREE.MeshStandardMaterial({ color:0x18301f, roughness:0.95 });
  [[FOREST_CENTER.x-25,FOREST_CENTER.z-15,14,1.1],[FOREST_CENTER.x+20,FOREST_CENTER.z-30,17,1.4],[FOREST_CENTER.x-10,FOREST_CENTER.z-40,12,0.9]].forEach(function(m){
    var mound = new THREE.Mesh(new THREE.CylinderGeometry(m[2]*0.7, m[2], m[3], 16), moundMat);
    mound.position.set(m[0], m[3]/2, m[1]);
    scene.add(mound);
  });

  // --- tree variants (Part 2): 4 reusable types, each rendered via exactly
  // 2 InstancedMeshes (trunk + canopy) regardless of instance count — so
  // however many hundred trees exist, this is always 8 draw calls total.
  var TREE_VARIANTS = {
    A: { trunkR:[0.16,0.22], trunkH:2.1, canopyR:1.35, canopyH:3.0, canopyType:'cone', trunkColor:0x4a3524, canopyColor:0x1f5c3a }, // tall broad
    B: { trunkR:[0.11,0.15], trunkH:1.5, canopyR:0.95, canopyH:2.1, canopyType:'cone', trunkColor:0x4a3524, canopyColor:0x255f3f }, // medium
    C: { trunkR:[0.07,0.10], trunkH:1.0, canopyR:0.65, canopyH:1.4, canopyType:'cone', trunkColor:0x4a3524, canopyColor:0x2d6b46 }, // smaller
    D: { trunkR:[0.10,0.13], trunkH:2.4, canopyR:0.8,  canopyH:3.6, canopyType:'spike', trunkColor:0x3e2e1e, canopyColor:0x18432c } // conifer/pine
  };
  var forestTreeInstances = []; // {variant, x, z} — used below for the small selected-collision subset

  function buildTreeVariant(key, cfg, positions){
    if(positions.length === 0) return;
    var trunkGeo = new THREE.CylinderGeometry(cfg.trunkR[0], cfg.trunkR[1], cfg.trunkH, 6);
    var trunkMat = new THREE.MeshStandardMaterial({ color:cfg.trunkColor, roughness:0.9 });
    var canopyGeo = cfg.canopyType === 'spike'
      ? new THREE.ConeGeometry(cfg.canopyR, cfg.canopyH, 7)
      : new THREE.ConeGeometry(cfg.canopyR, cfg.canopyH, 8);
    var canopyMat = new THREE.MeshStandardMaterial({ color:cfg.canopyColor, roughness:0.88 });
    var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
    var canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, positions.length);
    var dummy = new THREE.Object3D();
    positions.forEach(function(p, i){
      var scale = 0.82 + Math.random()*0.36; // Part 2: slight scale variation
      var rotY = Math.random() * Math.PI * 2; // Part 2: slight rotation variation
      dummy.position.set(p.x, cfg.trunkH*0.5*scale, p.z);
      dummy.rotation.y = rotY; dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, (cfg.trunkH + cfg.canopyH*0.42)*scale, p.z);
      dummy.updateMatrix(); canopies.setMatrixAt(i, dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate = true; canopies.instanceMatrix.needsUpdate = true;
    scene.add(trunks); scene.add(canopies);
  }

  // --- procedural scatter (Parts 2/3/8): uniform-disk sampling (not a grid),
  // rejected inside clearings, with density that's higher toward the
  // interior and sparser toward the edge — run once here at setup, not
  // per-frame.
  var variantKeys = Object.keys(TREE_VARIANTS);
  var candidateCount = 320;
  for(var i=0;i<candidateCount;i++){
    var r = FOREST_OUTER_RADIUS * Math.sqrt(Math.random()); // uniform over the disk area, not the radius
    var theta = Math.random() * Math.PI * 2;
    var x = FOREST_CENTER.x + Math.cos(theta)*r;
    var z = FOREST_CENTER.z + Math.sin(theta)*r;
    if(inForestClearing(x, z)) continue;
    var isInterior = r < FOREST_INNER_RADIUS;
    var acceptChance = isInterior ? 0.82 : 0.38; // Part 3: interior denser, edge sparser
    if(Math.random() > acceptChance) continue;
    var variant = variantKeys[Math.floor(Math.random()*variantKeys.length)];
    forestTreeInstances.push({ variant: variant, x: x, z: z });
  }
  variantKeys.forEach(function(key){
    var positions = forestTreeInstances.filter(function(t){ return t.variant === key; });
    buildTreeVariant(key, TREE_VARIANTS[key], positions);
  });

  // --- bush clusters (Part 7), reusing the existing helper, sparingly.
  var bushSpots = [];
  for(var b=0;b<5;b++){
    var br = FOREST_OUTER_RADIUS * 0.5 * Math.sqrt(Math.random());
    var bt = Math.random()*Math.PI*2;
    var bx = FOREST_CENTER.x + Math.cos(bt)*br, bz = FOREST_CENTER.z + Math.sin(bt)*br;
    if(inForestClearing(bx,bz)) continue;
    bushSpots.push([bx,bz],[bx+1.2,bz+0.6],[bx-0.8,bz+1.1]);
  }
  if(bushSpots.length) makeBushCluster(bushSpots);

  // --- selected collision trees (Part 9): a handful of individually-placed
  // "landmark" trees at the forest edge get real collision, using the
  // existing sphere-collider path — the hundreds of instanced trees above
  // are never checked, keeping this exactly as lightweight as required.
  var landmarkPositions = [
    { x: FOREST_CENTER.x - FOREST_INNER_RADIUS + 2, z: FOREST_CENTER.z },
    { x: FOREST_CENTER.x + FOREST_INNER_RADIUS - 2, z: FOREST_CENTER.z - 10 },
    { x: FOREST_CENTER.x, z: FOREST_CENTER.z - FOREST_INNER_RADIUS + 3 }
  ];
  var landmarkTrunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 3.0, 8);
  var landmarkCanopyGeo = new THREE.ConeGeometry(1.7, 3.6, 9);
  var landmarkTrunkMat = new THREE.MeshStandardMaterial({ color:0x4a3524, roughness:0.9 });
  var landmarkCanopyMat = new THREE.MeshStandardMaterial({ color:0x1f5c3a, roughness:0.88 });
  landmarkPositions.forEach(function(p, i){
    var trunk = new THREE.Mesh(landmarkTrunkGeo, landmarkTrunkMat);
    trunk.position.set(p.x, 1.5, p.z);
    scene.add(trunk);
    var canopy = new THREE.Mesh(landmarkCanopyGeo, landmarkCanopyMat);
    canopy.position.set(p.x, 3.5, p.z);
    scene.add(canopy);
    registerSphereCollider(new THREE.Vector3(p.x, 2, p.z), 0.9, 'forest_landmark_'+i);
  });

  // --- edge → interior signage (Part 1), consistent with the rest of the
  // world's honest "this area is reserved for future development" pattern.
  makeSignPost(FOREST_CENTER.x - FOREST_OUTER_RADIUS + 6, FOREST_CENTER.z + 18, 'FOREST EDGE — RESCUE TRAINING AREA', '#2a6b42');
  makeSignPost(FOREST_CENTER.x, FOREST_CENTER.z, 'FOREST INTERIOR — SEARCH ZONE (COMING SOON)', '#1f5c3a');
})();

/* ============================================================
   MODERN CAMPUS & URBAN INFRASTRUCTURE (Phase 9.3C)
   Genuinely part of the always-active shared world, exactly like
   the Forest above — added directly via scene.add()/registered
   helpers at scene setup, never wrapped in any mode-toggled
   group. Positioned north/northeast of the existing hub, well
   clear of the Flight Academy zones, the obstacle course, and
   the Forest's tree-scatter radius (verified: >100m from forest
   center in every case).
============================================================ */
(function buildCampusAndUrban(){
  // --- DRONOVA Campus (Part 1) — a new central hub north of origin ---
  makeOperationsCenter(0, 55, 0);
  makeHangar(18, 52, -0.3, 'campus_hangar'); // reused directly — same efficient structure as the Flight Academy hangar
  makeLandingPadMarker(0, 44);
  makeSignPost(-8, 42, 'DRONOVA CAMPUS', '#00e5ff');
  // Phase 9.3F-2: proper window grid on the Operations Center's front face,
  // layered on top of the existing building without touching makeOperationsCenter
  // itself — verified via the rotation math above that this sits exactly on
  // the building's front surface (frontOffset=3.98, half-depth is 4).
  addFacadeWindowGrid(0, 55, 0, 3.98, 6.4, 3, 4, 1.3);
  // A distinctly taller structure for the skyline (Part 4/11), positioned in
  // genuinely clear space (verified: >15m from every other collider).
  makeTallLandmark(-8, 30, 0);

  // --- Small Urban Area (Part 2) — 3 office buildings with distinct roof
  // styles/heights/colours, 1 research building, 1 small public building ---
  makeOfficeBuilding(28, 38, 5, 5, 6, 'flat', 0x2a3a4a, 0.4, 'office_1');
  makeOfficeBuilding(38, 46, 4, 6, 8, 'angled', 0x24343f, -0.2, 'office_2');
  makeOfficeBuilding(24, 50, 4.5, 4.5, 5, 'stepped', 0x2f3f4a, 0.15, 'office_3');
  makeResearchDome(42, 34, 0.3);
  makePublicBuilding(32, 56, 0);
  makeControlTower(45, 42, 'urban_comm_tower'); // reused as the urban area's communication tower landmark (Part 6)
  makeCrateCluster([[30.5,57.5],[31.1,57.9]]);
  makeSignPost(20, 56, 'URBAN INFRASTRUCTURE AREA', '#ffb200');

  // --- Roads connecting Campus -> existing hub -> Urban -> (forest direction) — Part 4 ---
  makeGroundStripe(0, 40, 3.2, 26, 0, 0x3a4048, 0.85);          // campus down toward the existing central hub
  makeGroundStripe(15, 49, 3.0, 22, -Math.PI/4, 0x3a4048, 0.85); // campus across to the urban cluster
  makeGroundStripe(48, 28, 2.6, 18, Math.PI/3.2, 0x3a4048, 0.7); // urban area, suggestive stub heading toward the forest direction
})();

/* ============================================================
   ENVIRONMENT DETAILS & WORLD POLISH (Phase 9.3D)
   Purely additive detail on top of the Phase 9.3C campus/urban
   layout — no existing structure, road, or collider is touched.
   Same shared-world construction as everything else (scene.add()
   at setup, no mode-toggled group). No new colliders except the
   one new landmark (water tower), matching Part 11's "small
   decorative props stay visual-only" guidance.
============================================================ */
(function buildEnvironmentDetails(){
  // --- Part 1: road lane markings on the 3 existing 9.3C roads ---
  makeGroundStripe(0, 40, 0.18, 25, 0, 0xffffff, 0.3);
  makeGroundStripe(15, 49, 0.16, 21, -Math.PI/4, 0xffffff, 0.3);
  makeGroundStripe(48, 28, 0.14, 17, Math.PI/3.2, 0xffffff, 0.25);

  // --- Part 2: DRONOVA Campus details ---
  makeGroundStripe(9, 53.5, 2.2, 20, -Math.PI/4.3, 0x4a5860, 0.5); // walkway toward the campus hangar
  makeGroundStripe(0, 49.5, 2.0, 11, 0, 0x4a5860, 0.5);            // walkway toward the landing pad
  makeEntrancePlatform(0, 59.4, 3.2, 2.2, 0x2c3a44);               // Operations Center entrance platform
  makeCommsDish(3.5, 58, 0.4);                                     // small campus comms equipment

  // --- Part 3: Urban area details ---
  makeZoneTint(32, 43, 4.5, 0xb8c7d9, 0.05); // small plaza, clear of every building's collider (verified: nearest is 6.4m away)
  makeBenches([[30,44,0],[34,42,Math.PI/2]]);
  makeLightingPoles([[33,40],[36,51],[20,48],[40,39]]); // street lights, checked clear of every building box
  makeRooftopUnits([[28.7,38.3,6.3],[24.6,50.4,5.5]]);  // only on the flat/stepped-roof buildings — an angled or domed roof wouldn't read correctly with a flat box sitting on it
  makeEntrancePlatform(28, 34.7, 3, 1.4, 0x2c3a44); // office_1 entrance
  makeEntrancePlatform(24, 46.9, 2.6, 1.2, 0x2c3a44); // office_3 entrance

  // --- Part 5: one additional landmark (water tower), per Part 11 treated
  // as high-priority (a "major tower") and given real collision.
  makeWaterTower(52, 50);

  // --- Part 9 (optional): one small pond, positioned along the road stub
  // toward the forest direction, clear of every structure and outside the
  // forest's own tree-scatter radius.
  makePond(58, 10, 3.2);

  // --- Part 4: forest transition — a sparse scatter of small trees between
  // the developed area and the forest edge, softening the jump rather than
  // an abrupt city-to-forest cut. Deliberately its own small geometry/
  // material (not reaching into the Forest section's local variables,
  // which are intentionally scoped to that IIFE) — still just 2 more
  // InstancedMesh draw calls total, not a per-tree cost.
  (function buildTransitionTrees(){
    var trunkGeo = new THREE.CylinderGeometry(0.08, 0.10, 1.0, 6);
    var trunkMat = new THREE.MeshStandardMaterial({ color:0x4a3524, roughness:0.9 });
    var canopyGeo = new THREE.ConeGeometry(0.6, 1.3, 8);
    var canopyMat = new THREE.MeshStandardMaterial({ color:0x2d6b46, roughness:0.88 });
    var spots = [];
    for(var i=0;i<26;i++){
      var t = i/26;
      var x = 50 + t*18 + (Math.random()-0.5)*10;
      var z = 20 - t*35 + (Math.random()-0.5)*10;
      spots.push({x:x, z:z});
    }
    var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    var canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, spots.length);
    var dummy = new THREE.Object3D();
    spots.forEach(function(p, i){
      var scale = 0.8 + Math.random()*0.4;
      dummy.position.set(p.x, 0.5*scale, p.z); dummy.rotation.y = Math.random()*Math.PI*2; dummy.scale.set(scale,scale,scale);
      dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, (1.0+1.3*0.4)*scale, p.z);
      dummy.updateMatrix(); canopies.setMatrixAt(i, dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate = true; canopies.instanceMatrix.needsUpdate = true;
    scene.add(trunks); scene.add(canopies);
  })();

  // --- Part 6: subtle navigation marker along the transition corridor ---
  makeSignPost(58, 4, 'FOREST TRANSITION — REDUCED INFRASTRUCTURE AHEAD', '#2a6b42');
})();

/* ============================================================
   GAME-QUALITY CITY LAYOUT & GROUND UPGRADE (Phase 9.3F-1)
   Pure ground/road/pavement layer added beneath and around the
   existing structures — zero new colliders (Part 10: roads/
   pavements/parking/green space all stay visual-only), zero new
   buildings. Every new surface uses MeshStandardMaterial (not
   the unlit unlit unlit MeshBasicMaterial some earlier zone tints
   use) specifically so it responds correctly to the Phase 9.3E
   time-of-day lighting, per Part 11 — verified every new position
   below against all 27 existing colliders before placing it.
============================================================ */
(function buildCityLayoutGround(){
  // --- Part 1: ground zoning — genuine lit surfaces, not just tints,
  // giving each area a distinct material identity ---
  makeGroundSurface(0, 50, 18, 0x1c2a34, 40);   // DRONOVA Campus
  makeGroundSurface(33, 44, 24, 0x24303a, 40);  // Urban / City area
  makeGroundSurface(60, 25, 12, 0x1c2e28, 32);  // Rescue Operations Area — see note below
  makeGroundSurface(55, 15, 10, 0x1a3322, 32);  // Park / Green area
  makeZoneTint(0, 50, 19, 0x00e5ff, 0.025);
  makeZoneTint(33, 44, 25, 0xffb200, 0.02);
  makeZoneTint(55, 15, 10.5, 0x3dffa0, 0.03);

  // NOTE (Part 1, Rescue Operations Area): the actual functional Rescue
  // Academy base built in Phase 9.3A is a separate, spatially-isolated
  // environment (flagged as an architectural inconsistency in the 9.3B–D
  // reports). This ground zone is an honest placeholder reserving space
  // for a rescue-operations presence within the shared world's layout —
  // it does not relocate or duplicate the real rescue base.
  makeSignPost(60, 20, 'RESCUE OPERATIONS AREA (SHARED-WORLD MARKER)', '#ff4d5e');

  // --- Part 2/3: road network refinement — one intersection marker and
  // one new connector extending the existing Urban→Forest-direction stub
  // through to the new Rescue/Park zones ---
  makeGroundSurface(15, 49, 3.2, 0x2c3840, 24); // campus/urban road junction pad
  makeGroundStripe(48, 20, 2.4, 20, Math.PI/2.6, 0x3a4048, 0.75);
  makeGroundStripe(48, 20, 0.14, 18, Math.PI/2.6, 0xffffff, 0.25);

  // --- Part 4: pavements around major structures, verified clear of
  // every collider they surround (rings sit just outside each box) ---
  makePavementRing(0, 55, 4.6, 6.0, 0x3a4550);   // Operations Center
  makePavementRing(18, 52, 4.4, 5.6, 0x3a4550);  // Campus Hangar
  makePavementRing(28, 38, 2.9, 3.7, 0x3a4550);  // office_1
  makePavementRing(42, 34, 3.9, 4.7, 0x3a4550);  // research_dome

  // --- Part 5: parking + service areas — checked clear of every nearby
  // collider (nearest is campus_hangar, 11.3m away) ---
  makeParkingArea(10, 44, 8, 5, 1, 4, 0);
  makeSignPost(10, 47, 'VISITOR PARKING', '#00e5ff');
  makeEntrancePlatform(30, 46, 3, 2, 0x2c3a44); // service platform, clear of office_2/office_3
  makeCrateCluster([[30.6,47.2],[31.2,47.6]]);
  makeSignPost(30, 44, 'SERVICE AREA', '#ffb200');

  // --- Part 6: green park — grass zone (already tinted above), trees,
  // a bench, connecting toward the existing forest-transition corridor ---
  makeTreeCluster([[53,13],[57,17],[52,18],[58,12],[54,10]]);
  makeBenches([[55,15,0.6],[56,13,2.1]]);

  // --- Part 8: one subtle terrain rise near the park, well short of
  // anything that could surprise a beginner pilot ---
  makeGentleRise(58, 18, 8, 1.0);
})();

/* ============================================================
   URBAN INFRASTRUCTURE & NAVIGATION DETAIL (Phase 9.3F-3)
   Purely additive small-scale detail — zero new colliders (Part
   9: all of this is small/visual-only), zero new lights (Part 1/
   11: streetlights reuse the existing makeLightingPoles emissive-
   cap technique, automatically picked up by the Phase 9.3E scan —
   no changes to that system needed). Every position checked
   against all 28 existing colliders before placing.
============================================================ */
(function buildUrbanInfrastructure(){
  // --- Part 1/2: additional streetlights at logical new spots — the
  // campus/urban junction, and along the route toward the Rescue
  // Operations Area marker. Night integration is automatic (same
  // mechanism as every other emissive material in the world).
  makeLightingPoles([[12,45],[22,44],[63,22],[46,17]]);

  // --- Part 4: static traffic-light pole + stop-line markings at the
  // main campus/urban intersection — no traffic simulation, just
  // stationary infrastructure.
  makeTrafficLightPole(16.5, 50.5);
  makeGroundStripe(15, 46.3, 3.2, 0.3, 0, 0xffffff, 0.5);
  makeGroundStripe(15, 51.7, 3.2, 0.3, 0, 0xffffff, 0.5);

  // --- Part 3/6: navigation signage tying the Campus → Urban → Rescue
  // Operations Area → Forest route together.
  makeSignPost(13, 52.5, 'URBAN AREA → / RESCUE OPS →', '#00e5ff');
  makeDirectionArrow(50, 17, Math.PI/2.6, 0xff4d5e);
  makeSignPost(50, 8, 'FOREST SEARCH AREA →', '#2a6b42');

  // --- Part 7: bollards marking the parking area's edge ---
  makeBollards([[6,42],[6,46],[14,42],[14,46]]);

  // --- Part 8: one utility pole + electrical box near the urban cluster,
  // positioned clear of every nearby building. ---
  makeUtilityPole(20, 40);
})();

/* ============================================================
   PARKS, ENVIRONMENTAL DENSITY & NATURAL WORLD POLISH (Phase 9.3F-4)
   Zone-based vegetation (Part 2), not random scatter — urban trees
   near open urban spaces, campus landscaping buffers near the two
   main campus buildings, and a graduated density bridge from the
   existing Park (built in 9.3F-1) through to the existing forest-
   transition corridor (built in 9.3D), so the world reads as one
   continuous gradient rather than separate zones. Every helper
   here is already proven (makeTreeCluster, makeBushCluster,
   makeGentleRise, makeZoneTint) — zero new geometry systems, zero
   new colliders (Part 11), every position checked against all 28
   existing colliders before placing.
============================================================ */
(function buildParksAndDensity(){
  // --- Part 2: Urban area — small decorative tree groups near open
  // spaces, not lining every road (would look planted/artificial).
  makeTreeCluster([[35,40],[36,39],[34,41]]);
  makeTreeCluster([[20,44],[19,42]]);
  makeBushCluster([[30,41],[37,41]]);

  // --- Part 2/6: Campus area — organised landscaping buffers around
  // the two main campus structures, giving them a "designed" edge
  // rather than sitting directly on bare ground.
  makeTreeCluster([[13,50],[12,48]]);
  makeTreeCluster([[-4,50],[-5,52]]);
  makeBushCluster([[-6,48],[15,49]]);

  // --- Part 6: Park → transition-corridor density bridge. The
  // existing Park (9.3F-1, centred 55,15) and the existing forest-
  // transition corridor (9.3D, running roughly 50→68, 20→-15) sat
  // slightly apart — these trees fill that gap with the SAME
  // graduated approach the Forest itself uses (denser toward the
  // transition corridor, sparser near the open park).
  makeTreeCluster([[52,8],[56,5],[48,10],[53,3]]);
  makeBushCluster([[50,18],[58,20]]);
  makeGentleRise(45, 5, 7, 0.8);

  // --- Part 8: one clearly-marked open clearing within the park —
  // a distinct grass tint (not tree-covered), explicitly reserved
  // for future use rather than left as unexplained empty space.
  makeZoneTint(55, 12, 6, 0x3dffa0, 0.04);
  makeSignPost(59, 12, 'OPEN CLEARING — FUTURE LANDING ZONE', '#3dffa0');
})();

// Phase 9.3E: one-time scan capturing every emissive material already built
// by the environment above (window glow, streetlamp caps, hangar/campus/
// tower accents, hazard stripes, etc.) — this is how "building lights" and
// "streetlights" respond to time-of-day WITHOUT touching a single one of
// the helper functions that created them, and without adding any new
// lights or geometry. Each material's OWN baseline intensity (whatever it
// was authored with) is preserved as the multiplier's reference point, so
// day still looks exactly as it did before this phase — only evening/night
// make these already-present accents read as deliberately "on."
scene.traverse(function(obj){
  if(obj.material && obj.material.emissive && typeof obj.material.emissiveIntensity === 'number' && obj.material.emissiveIntensity > 0){
    envEmissiveMaterials.push({ mat: obj.material, baseIntensity: obj.material.emissiveIntensity });
  }
});

/* ============================================================
   DRONE RIGID BODY
============================================================ */
var droneRoot = new THREE.Group(); // position/rotation of this = flight state
scene.add(droneRoot);
var droneVisual = new THREE.Group(); // offsets so model_center sits at droneRoot origin
droneVisual.position.set(-modelCenter.x, -modelCenter.y, -modelCenter.z);
droneRoot.add(droneVisual);

var bodyMat = new THREE.MeshStandardMaterial({color:0x1a2230, metalness:0.55, roughness:0.4, emissive:0x0d3a44, emissiveIntensity:0.08});
var propMat = new THREE.MeshStandardMaterial({color:0x0c1119, metalness:0.3, roughness:0.5, side:THREE.DoubleSide});

var propSpinGroups = [];
MANIFEST.parts.forEach(function(p){
  var geo = buildGeometry(p);
  if(!p.spin){
    var mesh = new THREE.Mesh(geo, bodyMat);
    mesh.castShadow = true; // Phase 8.2: only 5 meshes total for the whole drone — cheap to cast
    droneVisual.add(mesh);
  } else {
    // pivot at the propeller's own center so it spins on its real motor axis
    var pivot = new THREE.Group();
    pivot.position.set(p.center[0], p.center[1], p.center[2]);
    var mesh = new THREE.Mesh(geo, propMat);
    mesh.position.set(-p.center[0], -p.center[1], -p.center[2]);
    mesh.castShadow = true; // Phase 8.2
    pivot.add(mesh);
    droneVisual.add(pivot);
    propSpinGroups.push(pivot);
  }
});

// small nav lights for readability of orientation at a distance
function navLight(color, x, z){
  var geo = new THREE.SphereGeometry(0.012, 8, 8);
  var mat = new THREE.MeshBasicMaterial({color:color});
  var m = new THREE.Mesh(geo, mat);
  m.position.set(x, 0.02, z);
  droneVisual.add(m);
}
navLight(0xff3355, modelCenter.x - droneScale*0.42, modelCenter.z - droneScale*0.1); // red = left/rear convention
navLight(0x33ff77, modelCenter.x + droneScale*0.42, modelCenter.z - droneScale*0.1); // green = right

/* ============================================================
   INPUT — keyboard + touch dual-stick
============================================================ */
var keys = {};
window.addEventListener('keydown', function(e){ keys[e.code] = true; });
window.addEventListener('keyup', function(e){ keys[e.code] = false; });

// touch virtual sticks: left = throttle(y)/yaw(x), right = pitch(y)/roll(x)
var touchAxes = { throttle:0, yaw:0, pitch:0, roll:0 };
function setupStick(stickEl, knobEl, onMove){
  var active = false, cx=0, cy=0, radius=45;
  function start(e){
    active = true;
    var r = stickEl.getBoundingClientRect();
    cx = r.left + r.width/2; cy = r.top + r.height/2;
  }
  function move(e){
    if(!active) return;
    var t = e.touches ? e.touches[0] : e;
    var dx = t.clientX - cx, dy = t.clientY - cy;
    var dist = Math.min(radius, Math.hypot(dx,dy));
    var ang = Math.atan2(dy,dx);
    var nx = Math.cos(ang)*dist, ny = Math.sin(ang)*dist;
    knobEl.style.left = (60+nx)+'px'; knobEl.style.top = (60+ny)+'px';
    onMove(nx/radius, -ny/radius);
  }
  function end(){
    active = false;
    knobEl.style.left = '50%'; knobEl.style.top = '50%';
    onMove(0,0);
  }
  stickEl.addEventListener('touchstart', function(e){ start(e); move(e); }, {passive:true});
  stickEl.addEventListener('touchmove', move, {passive:true});
  stickEl.addEventListener('touchend', end);
  stickEl.addEventListener('mousedown', function(e){ start(e); move(e);
    function mm(ev){ move(ev); } function mu(){ end(); window.removeEventListener('mousemove',mm); window.removeEventListener('mouseup',mu); }
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
  });
}
setupStick(document.getElementById('stickLeft'), document.getElementById('knobLeft'), function(x,y){ touchAxes.yaw = x; touchAxes.throttle = y; });
setupStick(document.getElementById('stickRight'), document.getElementById('knobRight'), function(x,y){ touchAxes.roll = x; touchAxes.pitch = y; });

if('ontouchstart' in window){
  document.getElementById('touchControls').classList.add('show');
  document.getElementById('keyHint').classList.add('hide');
}

function getAxis(negKey, posKey, touchVal){
  var v = 0;
  if(keys[negKey]) v -= 1;
  if(keys[posKey]) v += 1;
  if(v === 0 && Math.abs(touchVal) > 0.08) v = touchVal;
  return v;
}

/* ============================================================
   COMPETITION UX PART 11 — DYNAMIC DRONE MOTOR AUDIO
   Lightweight procedural Web Audio engine. No external audio file is needed.
   The motor tone follows throttle/control load and flight speed while using
   smooth parameter ramps so manoeuvres never create clicks or abrupt jumps.
============================================================ */
var droneAudio = {
  enabled: true,
  unlocked: false,
  supported: !!(window.AudioContext || window.webkitAudioContext),
  ctx: null,
  master: null,
  motorFilter: null,
  motorOscillators: [],
  harmonicOsc: null,
  harmonicGain: null,
  washSource: null,
  washFilter: null,
  washGain: null
};
var flightControlInput = { throttle:0, pitch:0, roll:0, yaw:0 };

function clamp01(v){ return Math.max(0, Math.min(1, v)); }

function initDroneAudio(){
  if(!droneAudio.supported || droneAudio.ctx) return !!droneAudio.ctx;
  try{
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    var ctx = new AudioCtx();
    droneAudio.ctx = ctx;

    var master = ctx.createGain();
    master.gain.value = 0;
    var compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 14;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.18;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    droneAudio.master = master;

    var motorFilter = ctx.createBiquadFilter();
    motorFilter.type = 'lowpass';
    motorFilter.frequency.value = 1800;
    motorFilter.Q.value = 0.7;
    motorFilter.connect(master);
    droneAudio.motorFilter = motorFilter;

    // Four slightly detuned oscillators mimic four motors/propellers without
    // the CPU cost of four separate sampled audio tracks.
    [-10, -3, 4, 11].forEach(function(detune, i){
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.value = 118;
      osc.detune.value = detune;
      gain.gain.value = i % 2 === 0 ? 0.055 : 0.04;
      osc.connect(gain);
      gain.connect(motorFilter);
      osc.start();
      droneAudio.motorOscillators.push(osc);
    });

    // Quiet second harmonic adds the characteristic electric motor whine.
    var harmonic = ctx.createOscillator();
    var harmonicGain = ctx.createGain();
    harmonic.type = 'sine';
    harmonic.frequency.value = 240;
    harmonicGain.gain.value = 0.045;
    harmonic.connect(harmonicGain);
    harmonicGain.connect(master);
    harmonic.start();
    droneAudio.harmonicOsc = harmonic;
    droneAudio.harmonicGain = harmonicGain;

    // Filtered noise provides a subtle prop-wash texture at speed.
    var noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var noise = noiseBuffer.getChannelData(0);
    for(var n=0; n<noise.length; n++) noise[n] = Math.random()*2-1;
    var washSource = ctx.createBufferSource();
    var washFilter = ctx.createBiquadFilter();
    var washGain = ctx.createGain();
    washSource.buffer = noiseBuffer;
    washSource.loop = true;
    washFilter.type = 'bandpass';
    washFilter.frequency.value = 900;
    washFilter.Q.value = 0.65;
    washGain.gain.value = 0.018;
    washSource.connect(washFilter);
    washFilter.connect(washGain);
    washGain.connect(master);
    washSource.start();
    droneAudio.washSource = washSource;
    droneAudio.washFilter = washFilter;
    droneAudio.washGain = washGain;

    return true;
  }catch(err){
    droneAudio.supported = false;
    return false;
  }
}

function unlockDroneAudio(){
  if(!droneAudio.enabled || droneAudio.unlocked || !droneAudio.supported) return;
  if(!initDroneAudio()) return;
  var ctx = droneAudio.ctx;
  var resumePromise = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
  if(resumePromise && typeof resumePromise.then === 'function'){
    resumePromise.then(function(){ droneAudio.unlocked = true; }).catch(function(){});
  } else {
    droneAudio.unlocked = true;
  }
}

function updateDroneSoundButton(){
  var btn = document.getElementById('toggleDroneSound');
  if(!btn) return;
  if(!droneAudio.supported){
    btn.textContent = '🔇';
    btn.classList.remove('on');
    btn.setAttribute('aria-pressed','false');
    btn.title = 'Drone sound unavailable in this browser';
    return;
  }
  btn.textContent = droneAudio.enabled ? '🔊' : '🔇';
  btn.classList.toggle('on', droneAudio.enabled);
  btn.setAttribute('aria-pressed', String(droneAudio.enabled));
  btn.title = droneAudio.enabled ? 'Drone sound: On' : 'Drone sound: Muted';
}

function setDroneSoundEnabled(enabled){
  droneAudio.enabled = !!enabled;
  updateDroneSoundButton();
  if(droneAudio.enabled){
    unlockDroneAudio();
  } else if(droneAudio.ctx && droneAudio.master){
    droneAudio.master.gain.setTargetAtTime(0, droneAudio.ctx.currentTime, 0.035);
  }
}

function updateDroneAudio(dt){
  if(!droneAudio.enabled || !droneAudio.unlocked || !droneAudio.ctx || !droneAudio.master) return;
  var ctx = droneAudio.ctx;
  if(ctx.state !== 'running') return;

  var speed = flight.vel.length();
  var horizontalSpeed = Math.hypot(flight.vel.x, flight.vel.z);
  var inputLoad = clamp01((Math.abs(flightControlInput.pitch) + Math.abs(flightControlInput.roll))*0.28 +
                          Math.abs(flightControlInput.yaw)*0.16 + Math.abs(flightControlInput.throttle)*0.28);
  var throttleLoad = clamp01(flight.throttle);
  var speedLoad = clamp01(speed / 8);
  var airborne = flight.pos.y > 0.08;
  var motorsActive = airborne || throttleLoad > 0.025 || inputLoad > 0.03 || !!autopilot || autoHoverOn;

  // Throttle is the main RPM cue. Manoeuvre and speed add only a subtle load
  // increase so a hovering drone still sounds like its motors are working.
  var rotorLoad = clamp01(0.16 + throttleLoad*0.58 + inputLoad*0.18 + speedLoad*0.10);
  var baseHz = 105 + rotorLoad*125 + horizontalSpeed*2.4;
  var now = ctx.currentTime;

  droneAudio.motorOscillators.forEach(function(osc, i){
    var motorSpread = (i-1.5) * (2.0 + inputLoad*2.5);
    osc.frequency.setTargetAtTime(baseHz + motorSpread, now, 0.045);
  });
  droneAudio.harmonicOsc.frequency.setTargetAtTime(baseHz*2.04, now, 0.05);
  droneAudio.motorFilter.frequency.setTargetAtTime(1250 + rotorLoad*1500, now, 0.08);
  droneAudio.washFilter.frequency.setTargetAtTime(650 + speedLoad*1050, now, 0.10);
  droneAudio.washGain.gain.setTargetAtTime(0.010 + speedLoad*0.040 + inputLoad*0.012, now, 0.08);

  // Part 12: stronger presentation output so the motor remains clearly audible
  // on typical laptop/phone speakers without changing any flight behaviour.
  var targetGain = motorsActive ? (0.080 + rotorLoad*0.220) : 0;
  droneAudio.master.gain.setTargetAtTime(targetGain, now, motorsActive ? 0.055 : 0.12);
}

// Modern browsers require audio to start from a user gesture. These listeners
// unlock the engine on the first click/tap/key press, then become near-zero cost.
window.addEventListener('pointerdown', unlockDroneAudio, {passive:true});
window.addEventListener('keydown', unlockDroneAudio);
updateDroneSoundButton();

/* ============================================================
   FLIGHT PHYSICS STATE
============================================================ */
var flight = {
  pos: new THREE.Vector3(0, 0.03, 0),
  vel: new THREE.Vector3(0,0,0),
  pitch: 0, roll: 0, yaw: 0,          // current, radians
  throttle: 0,                        // 0..1
  targetThrottle: 0,
};
var assistOn = true;
var autopilot = null; // {targetPos: Vector3} or null
var autoHoverOn = false;
var autoHoverAlt = 0;

var LIMITS = {
  maxAlt: 40, boundary: 125, // Phase 9.3B: widened from GROUND_RADIUS-2 (58) to include the new forest area — safe, since no existing checkpoint/collider sits anywhere near the old edge (max ~48m from origin)

  // Competition UX Part 9 — Unified 6–8 m/s flight envelope.
  // Learning/Assist and advanced modes keep their different stability/tilt feel,
  // but they now share the SAME translational speed limits and yaw authority.
  // At full pitch/roll each profile targets ~7 m/s; climb/descent also targets
  // ~7 m/s; combined 3D velocity is capped at 8 m/s. This keeps the simulator
  // lively without the excessive Part 8 speed, and makes speed consistent in
  // Learning Mode, Free Flight, Missions, Flight Academy and Rescue Academy.
  assist: {
    maxTilt: THREE.Math ? THREE.Math.degToRad(18) : deg(18),
    tiltRate: 3.8, levelRate: 4.5, yawRate: 2.4,
    throttleHoldWhenIdle: true,
    // sin(18°) * 22.65 ≈ 7.0 m/s at full pitch/roll.
    maxSpeed: 22.65, maxLinearSpeed: 7.0,
    maxVerticalSpeed: 7.0, totalSpeedCap: 8.0,
    throttleRate: 1.0, throttleResponse: 3.4
  },

  free: {
    maxTilt: deg(40), tiltRate: 7.0, levelRate: 2.2, yawRate: 2.4,
    throttleHoldWhenIdle: false,
    // sin(40°) * 10.89 ≈ 7.0 m/s at full pitch/roll.
    maxSpeed: 10.89, maxLinearSpeed: 7.0,
    maxVerticalSpeed: 7.0, totalSpeedCap: 8.0,
    throttleRate: 1.0, throttleResponse: 3.4
  }
};
// Phase 9.3A: the flight boundary's reference point, made variable rather
// than implicitly (0,0) so the independent Rescue Environment can have its
// own operational area without touching the boundary math itself — the
// actual clamp logic in updatePhysics() below is unchanged, only what it
// measures distance FROM is now parameterized.
var flightAreaCenter = { x: 0, z: 0 };
var flightAreaRadius = LIMITS.boundary;
function deg(d){ return d*Math.PI/180; }
// normalize LIMITS.assist.maxTilt in case THREE.Math missing (r128 should have it, but be safe)
LIMITS.assist.maxTilt = deg(18);
LIMITS.free.maxTilt = deg(40);

function currentLimits(){ return assistOn ? LIMITS.assist : LIMITS.free; }

var everFlewInput = false;

function updatePhysics(dt){
  dt = Math.min(dt, 0.05);
  var L = currentLimits();

  var throttleAxis = getAxis('ArrowDown','ArrowUp', touchAxes.throttle);
  var pitchAxis = getAxis('KeyS','KeyW', touchAxes.pitch);
  var rollAxis = getAxis('KeyA','KeyD', touchAxes.roll) * -1; // A=left(-), D=right(+)
  var yawAxis = getAxis('KeyQ','KeyE', touchAxes.yaw) * -1;   // Q=left(-), E=right(+)

  // Part 11 audio reads the same control inputs as physics; it never changes them.
  flightControlInput.throttle = throttleAxis;
  flightControlInput.pitch = pitchAxis;
  flightControlInput.roll = rollAxis;
  flightControlInput.yaw = yawAxis;

  var manualInput = Math.abs(throttleAxis)+Math.abs(pitchAxis)+Math.abs(rollAxis)+Math.abs(yawAxis) > 0.02;
  if(manualInput){
    everFlewInput = true;
    if(autopilot) autopilot = null;
    if(autoHoverOn) autoHoverOn = false;
  }
  trackLearningInput(throttleAxis, pitchAxis, rollAxis, yawAxis);

  // --- target orientation ---
  var targetPitch = -pitchAxis * L.maxTilt; // W (forward) tilts nose down => moves forward
  var targetRoll = rollAxis * L.maxTilt;
  flight.pitch += (targetPitch - flight.pitch) * Math.min(1, dt*L.tiltRate);
  flight.roll += (targetRoll - flight.roll) * Math.min(1, dt*L.tiltRate);
  flight.yaw += yawAxis * L.yawRate * dt;

  // --- throttle & vertical ---
  if(!autopilot){
    var throttleRate = L.throttleRate || 0.9;
    flight.targetThrottle = THREE.MathUtils ? THREE.MathUtils.clamp(flight.targetThrottle + throttleAxis*dt*throttleRate, 0, 1)
                                             : Math.max(0, Math.min(1, flight.targetThrottle + throttleAxis*dt*throttleRate));
    if(throttleAxis === 0 && !L.throttleHoldWhenIdle){
      flight.targetThrottle = Math.max(0, flight.targetThrottle - dt*0.12); // gentle natural descent tendency, assist OFF
    }
  }
  var throttleResponse = L.throttleResponse || 3;
  flight.throttle += (flight.targetThrottle - flight.throttle) * Math.min(1, dt*throttleResponse);

  var HOVER_THROTTLE = 0.42;
  var vertTargetSpeed;
  if(typeof L.maxVerticalSpeed === 'number'){
    // Part 9: both Assist and advanced profiles use explicit vertical limits.
    // Normalize above and below hover so full climb and full descent target the
    // same magnitude in every mode.
    if(flight.throttle >= HOVER_THROTTLE){
      vertTargetSpeed = ((flight.throttle - HOVER_THROTTLE) / (1 - HOVER_THROTTLE)) * L.maxVerticalSpeed;
    } else {
      vertTargetSpeed = -((HOVER_THROTTLE - flight.throttle) / HOVER_THROTTLE) * L.maxVerticalSpeed;
    }
  } else {
    // Preserve the original gentle Beginner/Assist behaviour exactly.
    vertTargetSpeed = (flight.throttle - HOVER_THROTTLE) * 6.0;
  }

  // --- horizontal target velocity from tilt (like a real multirotor) ---
  // drone's local forward = -Z (three.js convention); chase camera trails at +Z.
  var fwdSpeed = Math.sin(flight.pitch) * L.maxSpeed;   // W (nose-down/-pitch) => forward (-Z)
  var rightSpeed = -Math.sin(flight.roll) * L.maxSpeed; // D (roll right) => +X, A => -X
  var sinYaw = Math.sin(flight.yaw), cosYaw = Math.cos(flight.yaw);
  var targetVelX = (fwdSpeed * sinYaw) + (rightSpeed * cosYaw);
  var targetVelZ = (fwdSpeed * cosYaw) - (rightSpeed * sinYaw);

  // Part 9: cap combined horizontal pitch+roll velocity so diagonal input
  // remains inside the common ~7 m/s envelope instead of becoming sqrt(2) faster.
  if(typeof L.maxLinearSpeed === 'number'){
    var horizontalTargetSpeed = Math.hypot(targetVelX, targetVelZ);
    if(horizontalTargetSpeed > L.maxLinearSpeed && horizontalTargetSpeed > 0.001){
      var horizontalScale = L.maxLinearSpeed / horizontalTargetSpeed;
      targetVelX *= horizontalScale;
      targetVelZ *= horizontalScale;
    }
  }
  var targetVelY = vertTargetSpeed;

  if(autoHoverOn){
    targetVelX = 0; targetVelZ = 0; targetVelY = (autoHoverAlt - flight.pos.y) * 1.4;
  }
  if(autopilot){
    var toTarget = autopilot.targetPos.clone().sub(flight.pos);
    var dist = toTarget.length();
    var autopilotCap = (typeof L.maxLinearSpeed === 'number') ? L.maxLinearSpeed : L.maxSpeed*0.7;
    var speed = Math.min(autopilotCap, dist*1.2);
    if(dist > 0.001) toTarget.normalize().multiplyScalar(speed);
    targetVelX = toTarget.x; targetVelZ = toTarget.z; targetVelY = toTarget.y;
    if(dist < 0.25){ autopilot = null; }
  }

  // Part 9: keep the full 3D velocity target within 8 m/s even when the
  // learner combines horizontal flight with climb/descent.
  if(typeof L.totalSpeedCap === 'number'){
    var totalTargetSpeed = Math.hypot(targetVelX, targetVelY, targetVelZ);
    if(totalTargetSpeed > L.totalSpeedCap && totalTargetSpeed > 0.001){
      var totalScale = L.totalSpeedCap / totalTargetSpeed;
      targetVelX *= totalScale;
      targetVelY *= totalScale;
      targetVelZ *= totalScale;
    }
  }

  var damping = Math.min(1, dt*2.6);
  flight.vel.x += (targetVelX - flight.vel.x) * damping;
  flight.vel.y += (targetVelY - flight.vel.y) * damping;
  flight.vel.z += (targetVelZ - flight.vel.z) * damping;

  flight.pos.x += flight.vel.x * dt;
  flight.pos.y += flight.vel.y * dt;
  flight.pos.z += flight.vel.z * dt;

  // --- collision (Phase 7.1) ---
  // Runs after integrating the candidate position but before ground/boundary
  // clamping, so those clamps still apply cleanly afterward. Only checks the
  // small registered obstacle list (currently 5 poles) — never scene meshes.
  var collisionResult = resolveDroneCollisions(flight.pos);
  if(collisionResult.hit){
    flight.pos.copy(collisionResult.position);
    // Soft stop rather than a hard zero or a bounce — stable and predictable,
    // avoids the sudden/extreme velocity changes the spec asks to avoid.
    flight.vel.multiplyScalar(0.15);
    notifyCollision(performance.now()/1000);
    // Phase 7.4: Obstacle Course mission counts distinct contact events (rising
    // edge — one count per continuous touch, not spammed every frame) rather
    // than duplicating collision detection itself.
    if(academyMissionActive && academyMissionActive.id === 'ac_obstacle' && !academyMissionActive.contactActive){
      academyMissionActive.contactActive = true;
      academyMissionActive.contacts++;
    }
    // Phase 7.8: Final Assessment Stage 4 reuses this exact same rising-edge
    // contact-counting pattern, kept fully independent of the mission's own
    // contact counter above so retrying one never affects the other.
    if(finalAssessmentActive && !FINAL_ASSESSMENT.navigatingToStageStart && FINAL_ASSESSMENT.stages[FINAL_ASSESSMENT.stageIndex].id === 'fa_obstacle' && !FINAL_ASSESSMENT.contactActive){
      FINAL_ASSESSMENT.contactActive = true;
      FINAL_ASSESSMENT.contacts++;
    }
  } else {
    if(academyMissionActive && academyMissionActive.id === 'ac_obstacle'){
      academyMissionActive.contactActive = false;
    }
    if(finalAssessmentActive && FINAL_ASSESSMENT.stages[FINAL_ASSESSMENT.stageIndex].id === 'fa_obstacle'){
      FINAL_ASSESSMENT.contactActive = false;
    }
  }

  // --- limits ---
  if(flight.pos.y < 0.03){ flight.pos.y = 0.03; if(flight.vel.y<0) flight.vel.y = 0; }
  if(flight.pos.y > LIMITS.maxAlt){ flight.pos.y = LIMITS.maxAlt; flight.vel.y = Math.min(0, flight.vel.y); }
  var horizDist = Math.hypot(flight.pos.x - flightAreaCenter.x, flight.pos.z - flightAreaCenter.z);
  if(horizDist > flightAreaRadius){
    var k = flightAreaRadius / horizDist;
    flight.pos.x = flightAreaCenter.x + (flight.pos.x - flightAreaCenter.x) * k;
    flight.pos.z = flightAreaCenter.z + (flight.pos.z - flightAreaCenter.z) * k;
  }

  // --- apply to scene ---
  droneRoot.position.copy(flight.pos);
  droneRoot.rotation.set(flight.pitch, flight.yaw, flight.roll, 'YXZ');

  // propeller spin — visually scales with throttle
  var spinSpeed = 6 + flight.throttle*46;
  propSpinGroups.forEach(function(pv, i){ pv.rotation.y += spinSpeed*dt*(i%2===0?1:-1); });
}

/* ============================================================
   CHASE CAMERA (Phase 7.7: Follow / Wide / FPV modes)
   The original reliable Follow behaviour is preserved exactly as the
   default — Wide and FPV are additive alternatives, easy to disable by
   simply not switching to them if they ever prove unstable.
============================================================ */
var camOffset = new THREE.Vector3(0, droneScale*2.2, droneScale*5.2);
var camOffsetWide = new THREE.Vector3(0, droneScale*4.2, droneScale*9.5);
var camLookAt = new THREE.Vector3();
var cameraMode = 'follow'; // 'follow' | 'wide' | 'fpv'
var CAM_MIN_Y = 0.25; // simple, cheap clipping reduction — keep the camera above the ground plane

// Phase 7.9 optimization: reusable scratch vectors for updateCamera(), which
// runs every frame — previously allocated up to 6 new THREE.Vector3 objects
// per call. Safe since updateCamera is never reentrant/called concurrently.
var _camScratchA = new THREE.Vector3();
var _camScratchB = new THREE.Vector3();
var _upVector = new THREE.Vector3(0,1,0); // read-only reference used by applyAxisAngle, safe to share across calls
function updateCamera(dt){
  if(cameraMode === 'fpv'){
    droneRoot.updateMatrixWorld();
    _camScratchA.set(0, droneScale*0.25, -droneScale*0.35);
    droneRoot.localToWorld(_camScratchA);
    _camScratchB.set(0, droneScale*0.15, -droneScale*6);
    droneRoot.localToWorld(_camScratchB);
    camera.position.lerp(_camScratchA, Math.min(1, dt*9)); // snappier than chase modes — FPV should feel tight/responsive
    camLookAt.lerp(_camScratchB, Math.min(1, dt*9));
  } else {
    var offset = (cameraMode === 'wide') ? camOffsetWide : camOffset;
    _camScratchA.set(0,0,1).applyAxisAngle(_upVector, flight.yaw).multiplyScalar(offset.z);
    _camScratchB.copy(flight.pos).add(_camScratchA);
    _camScratchB.y += offset.y;
    camera.position.lerp(_camScratchB, Math.min(1, dt*3.2));
    _camScratchA.copy(flight.pos); _camScratchA.y += droneScale*0.4;
    camLookAt.lerp(_camScratchA, Math.min(1, dt*5));
  }
  if(camera.position.y < CAM_MIN_Y) camera.position.y = CAM_MIN_Y; // cheap ground-clipping guard, no raycasting
  camera.lookAt(camLookAt);
}
function setCameraMode(m){
  cameraMode = m;
  ['camFollowBtn','camWideBtn','camFpvBtn'].forEach(function(id){
    var el = document.getElementById(id);
    var active = el.dataset.cam === m;
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', String(active));
  });
}
document.getElementById('camFollowBtn').addEventListener('click', function(){ setCameraMode('follow'); });
document.getElementById('camWideBtn').addEventListener('click', function(){ setCameraMode('wide'); });
document.getElementById('camFpvBtn').addEventListener('click', function(){ setCameraMode('fpv'); });

/* ============================================================
   HUD
============================================================ */
var hudEls = {
  altitude: document.getElementById('hudAltitude'), speed: document.getElementById('hudSpeed'),
  pitch: document.getElementById('hudPitch'), roll: document.getElementById('hudRoll'), yaw: document.getElementById('hudYaw'),
  throttle: document.getElementById('hudThrottle'), throttleFill: document.getElementById('throttleBarFill'),
  modeText: document.getElementById('hudModeText')
};
function updateHUD(){
  hudEls.altitude.textContent = flight.pos.y.toFixed(1)+' m';
  var spd = Math.hypot(flight.vel.x, flight.vel.z, flight.vel.y);
  hudEls.speed.textContent = spd.toFixed(1)+' m/s';
  hudEls.pitch.textContent = Math.round(flight.pitch*180/Math.PI)+'°';
  hudEls.roll.textContent = Math.round(flight.roll*180/Math.PI)+'°';
  hudEls.yaw.textContent = Math.round(((flight.yaw*180/Math.PI)%360+360)%360)+'°';
  var thPct = Math.round(flight.throttle*100);
  hudEls.throttle.textContent = thPct+'%';
  hudEls.throttleFill.style.width = thPct+'%';
  updateStatusBadge();
}
var statusBadgeEl = document.getElementById('hudStatusBadge');
function updateStatusBadge(){
  var recentCollision = (performance.now()/1000 - lastCollisionToastAt) < 1.4;
  var nearBoundary = Math.hypot(flight.pos.x - flightAreaCenter.x, flight.pos.z - flightAreaCenter.z) > flightAreaRadius * 0.85;
  var text, cls;
  if(recentCollision){ text = '⚠ COLLISION'; cls = 'danger'; }
  else if(nearBoundary){ text = '⚠ OPERATIONAL AREA LIMIT'; cls = 'danger'; } // Phase 9.3A
  else if(autoHoverOn){ text = 'AUTO HOVER ACTIVE'; cls = 'info'; }
  else if(academyMissionActive){ text = 'MISSION ACTIVE'; cls = 'info'; }
  else if(flight.pos.y < 3 && flight.vel.y < -0.3){ text = 'LANDING'; cls = 'warn'; }
  else { text = 'NORMAL FLIGHT'; cls = ''; }
  statusBadgeEl.textContent = text;
  statusBadgeEl.className = 'hudStatusBadge' + (cls ? ' '+cls : '');
}

/* ============================================================
   TOAST
============================================================ */
var toastEl = document.getElementById('simToast');
var toastTimer = null;
function showToast(title, sub, icon){
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastSub').textContent = sub||'';
  toastEl.querySelector('.toastIcon').textContent = icon||'✓';
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ toastEl.classList.remove('show'); }, 2600);
}

/* ============================================================
   MODE SWITCHING (Learning Mode / Missions / Free Flight / Flight Academy)
============================================================ */
var mode = 'learning';
var learnPanel = document.getElementById('learnPanel');
var challengePanel = document.getElementById('challengePanel');
var btnChallenges = document.getElementById('btnChallenges');
var academyPanel = document.getElementById('academyPanel');
var academyMissionHud = document.getElementById('academyMissionHud');
var rescuePanel = document.getElementById('rescuePanel');

function setMode(m){
  // Academy and Rescue Academy both reuse free-flight physics/controls, same
  // as Missions does — no new movement system, per the preservation requirements.
  mode = (m === 'missions' || m === 'academy' || m === 'rescue') ? 'free' : m;

  // Competition UX Part 9: Learning Mode keeps the stabilised Assist profile,
  // while the other modes use the advanced handling profile. Both profiles now
  // share the same 6–8 m/s speed envelope, so changing mode no longer changes
  // the simulator's maximum movement speed.
  assistOn = (m === 'learning');
  var assistControl = document.getElementById('toggleAssist');
  if(assistControl){
    assistControl.classList.toggle('on', assistOn);
    assistControl.setAttribute('aria-pressed', String(assistOn));
  }
  document.getElementById('modeLearningBtn').classList.toggle('active', m==='learning');
  document.getElementById('modeLearningBtn').setAttribute('aria-pressed', String(m==='learning'));
  document.getElementById('modeMissionsBtn').classList.toggle('active', m==='missions');
  document.getElementById('modeMissionsBtn').setAttribute('aria-pressed', String(m==='missions'));
  document.getElementById('modeFreeBtn').classList.toggle('active', m==='free');
  document.getElementById('modeFreeBtn').setAttribute('aria-pressed', String(m==='free'));
  document.getElementById('modeAcademyBtn').classList.toggle('active', m==='academy');
  document.getElementById('modeAcademyBtn').setAttribute('aria-pressed', String(m==='academy'));
  document.getElementById('modeRescueBtn').classList.toggle('active', m==='rescue');
  document.getElementById('modeRescueBtn').setAttribute('aria-pressed', String(m==='rescue'));
  hudEls.modeText.textContent = m==='learning' ? 'LEARNING MODE' : m==='missions' ? 'MISSION MODE' : m==='academy' ? 'FLIGHT ACADEMY' : m==='rescue' ? 'RESCUE ACADEMY' : 'FREE FLIGHT';

  learnPanel.classList.add('hidden');
  challengePanel.classList.remove('show');
  btnChallenges.style.display = '';
  academyPanel.classList.remove('show');
  rescuePanel.classList.remove('show');
  document.getElementById('rescueBriefingOverlay').classList.remove('show'); // Phase 9.2: never leave a rescue overlay open when switching modes
  document.getElementById('rescuePrepOverlay').classList.remove('show');
  // Competition UX Part 3: leaving Flight Academy must also end any active
  // Final Assessment navigation phase so its temporary beacon/HUD cannot leak
  // into Free Flight, Missions, Learning, or Rescue Academy.
  if(m !== 'academy' && typeof finalAssessmentActive !== 'undefined' && finalAssessmentActive){
    finalAssessmentActive = false;
    if(typeof hideFinalAssessmentStartGuide === 'function') hideFinalAssessmentStartGuide();
  }
  if(m !== 'academy') exitAcademyMission(true); // leaving Academy pauses any active mission, no completion side-effects
  if(m !== 'rescue') exitRescueEnvironment(); // Phase 9.3A: leaving Rescue Academy hides its environment and restores the normal flight boundary
  if(m !== 'rescue') exitRescueMission(); // Phase 9.4A: leaving Rescue Academy safely ends any active mission stage and removes its temporary marker; exitRescueMission() itself hides the HUD, so no separate unconditional hide is needed here (that would incorrectly hide it if the user re-clicks the Rescue nav button while a mission is still running)

  if(m==='learning'){
    learnPanel.classList.remove('hidden');
    btnChallenges.style.display = 'none';
  } else if(m==='missions'){
    challengePanel.classList.add('show');
  } else if(m==='academy'){
    if(!academyMissionActive) academyPanel.classList.add('show');
  } else if(m==='rescue'){
    if(!RESCUE_STATE.active) rescuePanel.classList.add('show'); // Phase 9.4A: matches the existing Academy guard — don't cover an active mission's HUD with the mission list
  }
}
document.getElementById('modeLearningBtn').addEventListener('click', function(){ setMode('learning'); });
document.getElementById('modeMissionsBtn').addEventListener('click', function(){ setMode('missions'); });
document.getElementById('modeFreeBtn').addEventListener('click', function(){ setMode('free'); });
document.getElementById('modeAcademyBtn').addEventListener('click', function(){ setMode('academy'); });
document.getElementById('modeRescueBtn').addEventListener('click', function(){ setMode('rescue'); });
btnChallenges.addEventListener('click', function(){
  challengePanel.classList.toggle('show');
});
/* Accessibility: keyboard activation for the div-based mode/icon toggles */
document.querySelectorAll('[role="button"]').forEach(function(el){
  el.addEventListener('keydown', function(e){
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); el.click(); }
  });
});

/* ============================================================
   LEARNING MODE — 5 guided steps
============================================================ */
var LEARN_STEPS = [
  { key:'throttle', title:'Throttle', icon:'⬆️',
    body:'Throttle controls the vertical movement of the drone. Increasing throttle causes the drone to gain altitude, while decreasing throttle causes it to descend.',
    hint:'Try it: hold ↑ to rise, ↓ to descend.' },
  { key:'pitch', title:'Pitch', icon:'⬍',
    body:'Pitch tilts the drone forward or backward and controls forward/backward movement.',
    hint:'Try it: hold W to move forward, S to move backward.' },
  { key:'roll', title:'Roll', icon:'⬌',
    body:'Roll tilts the drone left or right and controls lateral movement.',
    hint:'Try it: hold A to move left, D to move right.' },
  { key:'yaw', title:'Yaw', icon:'🔄',
    body:'Yaw rotates the drone around its vertical axis, changing which way it faces.',
    hint:'Try it: hold Q to rotate left, E to rotate right.' },
  { key:'hover', title:'Hover', icon:'🎯',
    body:'Hovering means holding a stable position in the air. Balance throttle so the drone neither climbs nor descends, and keep pitch/roll near level.',
    hint:'Try it: hold a steady altitude and stay still for 3 seconds.' }
];
var learnStepIndex = 0;
var hoverHoldTimer = 0;
var learningComplete = false;

function trackLearningInput(t,p,r,y){
  if(mode !== 'learning' || learningComplete) return;
  var step = LEARN_STEPS[learnStepIndex];
  if(!step) return;
  if(step.key==='throttle' && Math.abs(t) > 0.15) markStepTried();
  if(step.key==='pitch' && Math.abs(p) > 0.15) markStepTried();
  if(step.key==='roll' && Math.abs(r) > 0.15) markStepTried();
  if(step.key==='yaw' && Math.abs(y) > 0.15) markStepTried();
}
var stepTriedFlag = false;
function markStepTried(){
  if(stepTriedFlag) return;
  stepTriedFlag = true;
  document.getElementById('lpNextBtn').style.display = '';
  document.getElementById('lpStatus').textContent = '✓ Nice work! Ready for the next step.';
}
function checkHoverStep(dt){
  if(mode!=='learning' || learningComplete) return;
  var step = LEARN_STEPS[learnStepIndex];
  if(!step || step.key!=='hover') return;
  var spd = Math.hypot(flight.vel.x, flight.vel.z, flight.vel.y);
  var airborne = flight.pos.y > 1.0;
  if(airborne && spd < 0.6){
    hoverHoldTimer += dt;
    document.getElementById('lpStatus').textContent = 'Holding… '+hoverHoldTimer.toFixed(1)+' / 3.0s';
    if(hoverHoldTimer >= 3){ markStepTried(); document.getElementById('lpStatus').textContent = '✓ Great hover control!'; }
  } else {
    hoverHoldTimer = Math.max(0, hoverHoldTimer - dt*1.5);
  }
}
function renderLearnStep(){
  var step = LEARN_STEPS[learnStepIndex];
  document.getElementById('lpStepLabel').textContent = 'STEP '+(learnStepIndex+1)+' / '+LEARN_STEPS.length;
  document.getElementById('lpTitle').textContent = step.title;
  document.getElementById('lpDiagram').textContent = step.icon;
  document.getElementById('lpBody').textContent = step.body;
  document.getElementById('lpStatus').textContent = step.hint;
  document.getElementById('lpNextBtn').style.display = 'none';
  stepTriedFlag = false;
  hoverHoldTimer = 0;
  var prog = document.getElementById('lpProgress');
  prog.innerHTML = '';
  LEARN_STEPS.forEach(function(s,i){
    var span = document.createElement('span');
    if(i < learnStepIndex) span.className = 'done';
    else if(i === learnStepIndex) span.className = 'current';
    prog.appendChild(span);
  });
}
document.getElementById('lpNextBtn').addEventListener('click', function(){
  if(learnStepIndex < LEARN_STEPS.length-1){
    learnStepIndex++;
    renderLearnStep();
  } else {
    learningComplete = true;
    saveSimProgress();
    window.DronovaProgress && window.DronovaProgress.checkAndNotify && window.DronovaProgress.checkAndNotify();
    showToast('Basic Flight Controls Completed', 'Try Free Flight or take on the Flight Challenges.', '🏆');
    document.getElementById('lpTitle').textContent = 'All Steps Complete!';
    document.getElementById('lpDiagram').textContent = '🏆';
    document.getElementById('lpBody').textContent = "You've learned throttle, pitch, roll, yaw, and hover. You can now switch to Free Flight or try the Flight Challenges.";
    document.getElementById('lpStatus').textContent = 'Basic Flight Controls Completed';
    document.getElementById('lpNextBtn').textContent = 'Go to Free Flight →';
    document.getElementById('lpNextBtn').style.display = '';
    document.getElementById('lpNextBtn').onclick = function(){ setMode('free'); };
  }
});
renderLearnStep();

/* ============================================================
   FLIGHT CHALLENGES
============================================================ */
var CHALLENGES = [
  { id:'takeoff', title:'Take Off', desc:'Take the drone to 10 metres altitude.', status:'active',
    check: function(){ return flight.pos.y >= 10; }, successMsg:'Take-off completed!' },
  { id:'hover', title:'Hover', desc:'Maintain the drone at approximately 10 metres altitude for 5 seconds.', status:'locked',
    timer:0, check: function(dt){
      var band = Math.abs(flight.pos.y-10) < 1.5;
      var slow = Math.hypot(flight.vel.x,flight.vel.z,flight.vel.y) < 1.0;
      this.timer = (band && slow) ? this.timer+dt : Math.max(0, this.timer-dt*1.2);
      this.progress = Math.min(1, this.timer/5);
      return this.timer >= 5;
    }, successMsg:'Hover challenge complete!' },
  { id:'move', title:'Move Forward', desc:'Fly forward to the marked target area.', status:'locked',
    check: function(){ return Math.hypot(flight.pos.x-forwardMarker.position.x, flight.pos.z-forwardMarker.position.z) < 3; },
    successMsg:'Target reached!' },
  { id:'rotate', title:'Rotation', desc:'Perform a controlled 180° yaw rotation while holding altitude.', status:'locked',
    startYaw:null, check: function(){
      if(this.startYaw===null) this.startYaw = flight.yaw;
      var delta = Math.abs(flight.yaw - this.startYaw) % (Math.PI*2);
      var airborne = flight.pos.y > 2;
      this.progress = Math.min(1, delta/Math.PI);
      return airborne && delta >= Math.PI;
    }, successMsg:'Rotation mission complete!' },
  { id:'land', title:'Landing', desc:'Return to the landing zone and land safely.', status:'locked',
    check: function(){
      var nearPad = Math.hypot(flight.pos.x, flight.pos.z) < 3;
      return nearPad && flight.pos.y <= 0.25 && Math.abs(flight.vel.y) < 1.2;
    }, successMsg:'Landed safely!' },
  { id:'combo', title:'Complete Flight', desc:'Combine take-off, hover, movement, rotation, return, and landing.', status:'locked',
    sub:0, subLabels:['Take off (≥5m)','Hold position (2s)','Fly to target','Rotate 90°','Return near pad','Land safely'],
    startYaw:null, holdTimer:0,
    check: function(dt){
      var s = this.sub;
      if(s===0){ if(flight.pos.y>=5){ this.sub=1; this.startYaw=flight.yaw; } }
      else if(s===1){
        var slow = Math.hypot(flight.vel.x,flight.vel.z,flight.vel.y) < 1.0;
        this.holdTimer = slow ? this.holdTimer+dt : Math.max(0,this.holdTimer-dt);
        if(this.holdTimer>=2){ this.sub=2; }
      }
      else if(s===2){ if(Math.hypot(flight.pos.x-forwardMarker.position.x, flight.pos.z-forwardMarker.position.z) < 4) this.sub=3; }
      else if(s===3){ if(Math.abs(flight.yaw-this.startYaw) > Math.PI/2) this.sub=4; }
      else if(s===4){ if(Math.hypot(flight.pos.x,flight.pos.z) < 4) this.sub=5; }
      else if(s===5){ if(flight.pos.y<=0.25){ this.sub=6; return true; } }
      this.progress = this.sub/6;
      return false;
    }, successMsg:'Basic Flight sequence complete!' }
];
function unlockNextChallenge(idx){
  if(CHALLENGES[idx+1]) CHALLENGES[idx+1].status = 'active';
}

/* ============================================================
   SIMULATOR PROGRESS PERSISTENCE (Phase 5)
   The simulator previously tracked challenge/learning-mode
   completion only in memory — it reset on every page load. This
   is the minimal addition needed so the centralized Progress
   Dashboard (and revisiting the simulator later) can see what
   was already completed. No challenge logic above was changed.
============================================================ */
var SIM_PROGRESS_KEY = 'dronova_sim_progress_v1';
function loadSimProgress(){
  // Guards against a valid-JSON-but-wrong-shape value (e.g. the literal
  // string "null", which is truthy but parses to the actual null value) —
  // without this check, `raw` passing the truthy test would return null
  // instead of the safe default, and every later `.completed`/etc access
  // would throw.
  try{ var raw = localStorage.getItem(SIM_PROGRESS_KEY); if(raw){ var p = JSON.parse(raw); if(p && typeof p==='object') return p; } }catch(e){}
  return { challengesCompleted: [], learningModeComplete: false, academyCompleted: [], finalAssessmentCompleted: false,
    rescueMissionsCompleted: [], rescueBestScore: 0, rescueBestGrade: '', rescueLatestScore: 0, rescueXP: 0 }; // Phase 9.4F additions
}
function saveSimProgress(){
  var completedIds = CHALLENGES.filter(function(c){ return c.status==='done'; }).map(function(c){ return c.id; });
  // ACADEMY_MISSIONS/FINAL_ASSESSMENT are defined further down this file but, since
  // this function is only ever called later (never during initial script execution),
  // both are always available by call time — same reasoning already relied on
  // elsewhere in this file for ACADEMY_MISSIONS.
  var academyIds = (typeof ACADEMY_MISSIONS !== 'undefined')
    ? ACADEMY_MISSIONS.filter(function(m){ return m.status==='done'; }).map(function(m){ return m.id; })
    : (loadSimProgress().academyCompleted || []);
  var assessmentDone = (typeof FINAL_ASSESSMENT !== 'undefined')
    ? (FINAL_ASSESSMENT.status === 'done')
    : (loadSimProgress().finalAssessmentCompleted || false);
  try{
    localStorage.setItem(SIM_PROGRESS_KEY, JSON.stringify({
      challengesCompleted: completedIds, learningModeComplete: learningComplete,
      academyCompleted: academyIds, finalAssessmentCompleted: assessmentDone,
      // Phase 9.4F: preserves whatever rescue fields already exist — this
      // function's own callers never touch them, only saveRescueResult()
      // (below) does, so a plain re-save from elsewhere in the file can't
      // accidentally wipe rescue progress.
      rescueMissionsCompleted: loadSimProgress().rescueMissionsCompleted || [],
      rescueBestScore: loadSimProgress().rescueBestScore || 0,
      rescueBestGrade: loadSimProgress().rescueBestGrade || '',
      rescueLatestScore: loadSimProgress().rescueLatestScore || 0,
      rescueXP: loadSimProgress().rescueXP || 0
    }));
  }catch(e){}
}

// Phase 9.4F, Part 18/19: the ONE place that writes rescue-specific fields,
// keeping every other field exactly as already stored — reads-then-merges
// rather than overwriting the whole object, so this can never clobber
// challenge/academy/assessment progress saved elsewhere. Returns the XP
// actually awarded this run (Part 15: base XP once per mission ever
// completed; the performance bonus only on a genuine new best, so
// replaying with a lower score can never inflate XP — Part 20).
function saveRescueResult(missionId, score, grade){
  var xpAwarded = 0;
  try{
    var p = loadSimProgress();
    if(!p.rescueMissionsCompleted) p.rescueMissionsCompleted = [];
    var isFirstCompletion = p.rescueMissionsCompleted.indexOf(missionId) === -1;
    if(isFirstCompletion){ p.rescueMissionsCompleted.push(missionId); xpAwarded += 100; }
    var isNewBest = score > (p.rescueBestScore || 0);
    if(isNewBest){ p.rescueBestScore = score; p.rescueBestGrade = grade; xpAwarded += Math.round(score * 0.3); }
    p.rescueLatestScore = score;
    p.rescueXP = (p.rescueXP || 0) + xpAwarded;
    localStorage.setItem(SIM_PROGRESS_KEY, JSON.stringify(p));
  }catch(e){}
  return xpAwarded;
}
(function restoreSimProgress(){
  var saved = loadSimProgress();
  if(saved.challengesCompleted && saved.challengesCompleted.length){
    CHALLENGES.forEach(function(c, i){
      if(saved.challengesCompleted.indexOf(c.id) > -1){
        c.status = 'done';
        unlockNextChallenge(i);
      }
    });
  }
  if(saved.learningModeComplete) learningComplete = true;
})();

function updateChallenges(dt){
  CHALLENGES.forEach(function(c, i){
    if(c.status !== 'active') return;
    var done = c.check(dt);
    if(done){
      c.status = 'done';
      showToast(c.successMsg, '', '🏁');
      unlockNextChallenge(i);
      saveSimProgress();
      window.DronovaProgress && window.DronovaProgress.checkAndNotify && window.DronovaProgress.checkAndNotify();
    }
  });
  renderChallenges();
}
function renderChallenges(){
  var el = document.getElementById('challengeList');
  el.innerHTML = '';
  CHALLENGES.forEach(function(c, i){
    var div = document.createElement('div');
    div.className = 'challengeItem ' + c.status;
    var statusLabel = c.status==='done' ? 'DONE' : c.status==='active' ? 'ACTIVE' : 'LOCKED';
    var desc = c.desc;
    if(c.id==='combo' && c.status==='active') desc = c.subLabels[Math.min(c.sub,5)];
    var pct = c.progress ? Math.round(c.progress*100) : (c.status==='done'?100:0);
    div.innerHTML = '<div class="ciTitle"><span>'+(i+1)+'. '+c.title+'</span><span class="ciStatus">'+statusLabel+'</span></div>'+
      '<div class="ciDesc">'+desc+'</div>'+
      '<div class="ciBarTrack"><div class="ciBarFill" style="width:'+pct+'%"></div></div>';
    el.appendChild(div);
  });
}
renderChallenges();

/* ============================================================
   FLIGHT ACADEMY (Phase 7.3)
   Reuses the Training Camp zones from Phase 7.2 (HOVER_ZONE,
   the gate corridor + forwardMarker, and the origin take-off/
   landing pad) and the same sequential-unlock pattern already
   used by CHALLENGES above. Runs on the existing free-flight
   physics — no new movement system.
============================================================ */
var academyMissionActive = null; // one of ACADEMY_MISSIONS, or null
var ACADEMY_MISSIONS = [
  { id:'ac_takeoff', title:'Basic Take-Off', status:'available',
    objective:'Climb to 8 metres, then hold steady for 3 seconds.',
    briefing:'Hold ↑ to increase throttle smoothly. Once you reach 8 metres, ease off and keep the drone level and still.',
    startPos: {x:0, y:0.03, z:0},
    reset: function(){ this.phase = 0; this.holdTimer = 0; this.progress = 0; },
    check: function(dt){
      if(this.phase === 0){
        this.progress = Math.min(0.5, (flight.pos.y/8)*0.5);
        if(flight.pos.y >= 8) this.phase = 1;
        return false;
      }
      var band = flight.pos.y >= 7 && flight.pos.y <= 9;
      var slow = Math.hypot(flight.vel.x,flight.vel.z,flight.vel.y) < 1.2;
      this.holdTimer = (band && slow) ? this.holdTimer+dt : Math.max(0, this.holdTimer-dt*1.2);
      this.progress = 0.5 + Math.min(0.5, (this.holdTimer/3)*0.5);
      return this.holdTimer >= 3;
    },
    hudText: function(){
      return this.phase===0 ? 'Climb to 8m — currently '+flight.pos.y.toFixed(1)+'m'
                             : 'Hold steady: '+this.holdTimer.toFixed(1)+'s / 3.0s';
    }
  },
  { id:'ac_hover', title:'Hover Training', status:'locked',
    objective:'Fly into the Hover Training Zone and hold position for 10 seconds.',
    briefing:'Navigate to the marked Hover Training Zone, then balance throttle so the drone neither climbs nor descends. Small, gentle corrections work best.',
    // Competition UX Part 2: begin just outside the training zone, already at a safe hover altitude.
    startPos: {x:9, y:8, z:10},
    startThrottle: 0.42, // neutral hover throttle so the mission begins stable rather than immediately descending
    navTarget: function(){ return {x:HOVER_ZONE.x, z:HOVER_ZONE.z, label:'HOVER ZONE'}; },
    reset: function(){ this.timer = 0; this.progress = 0; this.inZone = false; },
    check: function(dt){
      var inZone = Math.hypot(flight.pos.x-HOVER_ZONE.x, flight.pos.z-HOVER_ZONE.z) < 6 && flight.pos.y > 5 && flight.pos.y < 15;
      var slow = Math.hypot(flight.vel.x,flight.vel.z,flight.vel.y) < 1.0;
      this.inZone = inZone;
      this.timer = (inZone && slow) ? this.timer+dt : Math.max(0, this.timer-dt*1.2);
      this.progress = Math.min(1, this.timer/10);
      return this.timer >= 10;
    },
    hudText: function(){
      return this.inZone ? 'TARGET ACQUIRED — HOLD POSITION — TIME REMAINING: '+Math.max(0,Math.ceil(10-this.timer))
                          : 'Fly into the Hover Training Zone';
    }
  },
  { id:'ac_forward', title:'Forward Flight', status:'locked',
    objective:'Pass through both training gates in order, then reach the Forward Target.',
    briefing:'Use pitch (W/S) for forward motion and roll (A/D) for fine left-right corrections. Fly through Gate 1, then Gate 2, then reach the final marker — in that order.',
    // Competition UX Part 2: start on the course centreline, before Gate 1, at a usable flight height.
    startPos: {x:0, y:1.5, z:-5},
    startThrottle: 0.42,
    navTarget: function(){
      if(this.sub === 0) return {x:0, z:-12, label:'GATE 1'};
      if(this.sub === 1) return {x:0, z:-24, label:'GATE 2'};
      if(this.sub === 2) return {x:forwardMarker.position.x, z:forwardMarker.position.z, label:'FORWARD TARGET'};
      return null;
    },
    reset: function(){ this.sub = 0; this.progress = 0; },
    check: function(){
      if(this.sub===0 && Math.hypot(flight.pos.x-0, flight.pos.z-(-12)) < 3){ this.sub=1; }
      else if(this.sub===1 && Math.hypot(flight.pos.x-0, flight.pos.z-(-24)) < 3){ this.sub=2; }
      else if(this.sub===2 && Math.hypot(flight.pos.x-forwardMarker.position.x, flight.pos.z-forwardMarker.position.z) < 3){ this.sub=3; }
      this.progress = this.sub/3;
      return this.sub >= 3;
    },
    hudText: function(){ return 'CHECKPOINT '+Math.min(this.sub+1,3)+' / 3'; }
  },
  { id:'ac_landing', title:'Precision Landing', status:'locked',
    objective:'Descend and land inside the marked landing target.',
    briefing:'You will be lifted to a safe altitude automatically. Ease throttle down smoothly and aim for the centre of the accuracy rings on the landing pad.',
    startPos: {x:0, y:0.03, z:0},
    onStart: function(){ autoHoverOn = false; autopilot = { targetPos: new THREE.Vector3(0, 10, 0) }; },
    reset: function(){ this.progress = 0; this.accuracy = null; },
    check: function(){
      this.progress = Math.max(0, Math.min(1, 1 - (flight.pos.y/10)));
      var nearPad = Math.hypot(flight.pos.x, flight.pos.z) < 4.75;
      var landed = flight.pos.y <= 0.25 && Math.abs(flight.vel.y) < 1.2;
      if(landed && nearPad){
        var dist = Math.hypot(flight.pos.x, flight.pos.z);
        this.accuracy = dist < 2.6 ? 'EXCELLENT' : dist < 3.5 ? 'GOOD' : 'ACCEPTABLE';
        return true;
      }
      return false;
    },
    hudText: function(){ return 'Descend to the landing pad — altitude '+flight.pos.y.toFixed(1)+'m'; }
  },
  { id:'ac_obstacle', title:'Obstacle Course', status:'locked',
    objective:'Navigate through 4 checkpoints in the Obstacle Training Area. Avoid contact with obstacles — max 3 contacts allowed.',
    briefing:'Use careful pitch and roll control to weave between the poles and barriers. Watch your altitude — this course rewards controlled, deliberate flying over speed.',
    // Competition UX Part 2: spawn at the marked course entrance rather than the central landing pad.
    startPos: {x:15, y:1.5, z:3},
    startThrottle: 0.42,
    // Threads between the Phase 7.2 poles/barriers rather than redesigning the area.
    checkpoints: [ {x:18,z:-1}, {x:22,z:-10}, {x:24,z:-17}, {x:20,z:-25} ],
    navTarget: function(){
      var target = this.checkpoints[this.cp];
      return target ? {x:target.x, z:target.z, label:'CHECKPOINT '+(this.cp+1)} : null;
    },
    reset: function(){ this.cp = 0; this.contacts = 0; this.contactActive = false; this.failed = false; this.progress = 0; },
    check: function(){
      if(this.failed) return false;
      if(this.contacts > 3){ this.failed = true; this.failReason = 'TOO MANY OBSTACLE CONTACTS'; return false; }
      var target = this.checkpoints[this.cp];
      if(target && Math.hypot(flight.pos.x-target.x, flight.pos.z-target.z) < 3){ this.cp++; }
      this.progress = this.cp/this.checkpoints.length;
      return this.cp >= this.checkpoints.length;
    },
    hudText: function(){ return 'CHECKPOINT: '+Math.min(this.cp+1,this.checkpoints.length)+' / '+this.checkpoints.length+'   |   OBSTACLE CONTACTS: '+this.contacts+' / 3'; }
  },
  { id:'ac_emergency', title:'Emergency Return', status:'locked',
    objective:'Fly normally until a simulated low-battery warning appears, then return to the landing zone and land safely before the battery depletes.',
    briefing:'Fly normally at first. When the LOW BATTERY warning appears, head straight back to the Take-Off / Landing Zone and land before the simulated battery reaches 0%.',
    startPos: {x:0, y:5, z:-30},
    // Simulated in-game value only — never touches the real device/browser battery API.
    onStart: function(){ this.battery = 100; this.warned = false; this.failed = false; this.landed = false; this.progress = 0; },
    reset: function(){ this.battery = 100; this.warned = false; this.failed = false; this.landed = false; this.progress = 0; },
    check: function(dt){
      if(this.failed || this.landed) return false;
      // Drains over ~100s of mission time — a low-battery warning at 30% still
      // leaves roughly 27s to fly back, comfortably enough time to return.
      this.battery = Math.max(0, this.battery - dt*(100/100));
      if(!this.warned && this.battery <= 30) this.warned = true;
      if(this.battery <= 0){ this.failed = true; this.failReason = 'BATTERY DEPLETED'; return false; }
      this.progress = this.warned ? Math.max(0, Math.min(1, 1 - Math.hypot(flight.pos.x,flight.pos.z)/40)) : 0.15;
      var nearPad = Math.hypot(flight.pos.x, flight.pos.z) < 4.75;
      var landed = flight.pos.y <= 0.25 && Math.abs(flight.vel.y) < 1.2;
      if(this.warned && nearPad && landed){ this.landed = true; return true; }
      return false;
    },
    hudText: function(){
      return this.warned
        ? '⚠ RETURN TO BASE   |   SIMULATED BATTERY: '+Math.round(this.battery)+'%'
        : 'Normal flight   |   SIMULATED BATTERY: '+Math.round(this.battery)+'%';
    }
  }

];
// Competition UX Part 2 -------------------------------------------------------
// Mission navigation helpers. These alter only the Academy mission START pose
// and HUD guidance; they do not change flight physics, checkpoint detection,
// scoring, collision logic, or mission completion rules.
function academyYawToward(fromPos, target){
  if(!target) return 0;
  var dx = target.x - fromPos.x;
  var dz = target.z - fromPos.z;
  if(Math.hypot(dx,dz) < 0.001) return 0;
  // DRONOVA local forward is -Z, so this yaw makes the nose face the target.
  return Math.atan2(-dx, -dz);
}
function snapAcademyCameraToDrone(){
  // Competition starts should feel intentional rather than showing a long
  // chase-camera glide from the previous location. Follow mode is the safest,
  // clearest default for a training mission.
  setCameraMode('follow');
  droneRoot.position.copy(flight.pos);
  droneRoot.rotation.set(flight.pitch, flight.yaw, flight.roll, 'YXZ');
  _camScratchA.set(0,0,1).applyAxisAngle(_upVector, flight.yaw).multiplyScalar(camOffset.z);
  camera.position.copy(flight.pos).add(_camScratchA);
  camera.position.y += camOffset.y;
  camLookAt.copy(flight.pos);
  camLookAt.y += droneScale*0.4;
  if(camera.position.y < CAM_MIN_Y) camera.position.y = CAM_MIN_Y;
  camera.lookAt(camLookAt);
}
function prepareAcademyMissionStart(m, showResetToast){
  var target = (m.navTarget && m.navTarget()) || null;
  flight.pos.set(m.startPos.x, m.startPos.y, m.startPos.z);
  flight.vel.set(0,0,0);
  flight.pitch = 0;
  flight.roll = 0;
  flight.yaw = target ? academyYawToward(m.startPos, target) : 0;
  var initialThrottle = (typeof m.startThrottle === 'number') ? m.startThrottle : 0;
  flight.throttle = initialThrottle;
  flight.targetThrottle = initialThrottle;
  autopilot = null;
  autoHoverOn = false;
  document.getElementById('btnHover').classList.remove('on');
  if(m.onStart) m.onStart();
  snapAcademyCameraToDrone();
  if(showResetToast) showToast('MISSION RESET', 'Returned to the mission starting position.', '↺');
}
function academyNavigationArrow(target){
  var dx = target.x - flight.pos.x;
  var dz = target.z - flight.pos.z;
  var targetYaw = Math.atan2(-dx, -dz);
  var delta = targetYaw - flight.yaw;
  while(delta > Math.PI) delta -= Math.PI*2;
  while(delta < -Math.PI) delta += Math.PI*2;
  var a = Math.abs(delta);
  if(a <= Math.PI/8) return '↑';
  if(a >= Math.PI*7/8) return '↓';
  if(delta < 0){
    if(a <= Math.PI*3/8) return '↗';
    if(a <= Math.PI*5/8) return '→';
    return '↘';
  }
  if(a <= Math.PI*3/8) return '↖';
  if(a <= Math.PI*5/8) return '←';
  return '↙';
}
function updateAcademyNavigationGuide(){
  var box = document.getElementById('amhNavGuide');
  var value = document.getElementById('amhNavValue');
  if(!box || !value || !academyMissionActive || !academyMissionActive.navTarget){
    if(box) box.style.display = 'none';
    return;
  }
  var target = academyMissionActive.navTarget();
  if(!target){
    box.style.display = 'none';
    return;
  }
  var distance = Math.hypot(flight.pos.x-target.x, flight.pos.z-target.z);
  value.textContent = academyNavigationArrow(target)+'  '+target.label+'  •  '+distance.toFixed(1)+' m';
  box.style.display = '';
}
function academyUnlockNext(idx){
  if(ACADEMY_MISSIONS[idx+1] && ACADEMY_MISSIONS[idx+1].status === 'locked') ACADEMY_MISSIONS[idx+1].status = 'available';
}
function academyCompletedCount(){ return ACADEMY_MISSIONS.filter(function(m){ return m.status==='done'; }).length; }

/* ============================================================
   ACADEMY PROGRESSION — XP & RANKS (Phase 7.5)
   Deliberately NOT stored as separate fields: both XP and rank
   are pure functions of ACADEMY_MISSIONS[].status, which itself
   derives from the already-persisted academyCompleted array
   (see saveSimProgress). This means XP/rank can never drift out
   of sync with actual mission completion — there is exactly one
   source of truth, not three. No new localStorage field needed.
============================================================ */
var ACADEMY_XP_VALUES = { ac_takeoff:100, ac_hover:150, ac_forward:200, ac_landing:250, ac_obstacle:300, ac_emergency:350 };
var ACADEMY_TOTAL_XP = 1850; // sum of ACADEMY_XP_VALUES (1350) + the 500 XP Final Assessment reward
var ACADEMY_RANKS = [
  { name:'Cadet', minMissions:0 },
  { name:'Trainee Pilot', minMissions:2 },
  { name:'Drone Pilot', minMissions:4 },
  { name:'Advanced Pilot', minMissions:6 }
];
function academyComputeXP(){
  var missionXP = ACADEMY_MISSIONS.filter(function(m){ return m.status==='done'; })
    .reduce(function(sum,m){ return sum + (ACADEMY_XP_VALUES[m.id]||0); }, 0);
  // Phase 7.8: +500 XP once the Final Assessment is passed — same derived-not-
  // stored approach as mission XP above, so it can never drift out of sync.
  var assessmentXP = (typeof FINAL_ASSESSMENT !== 'undefined' && FINAL_ASSESSMENT.status === 'done') ? 500 : 0;
  return missionXP + assessmentXP;
}
function academyComputeRank(){
  var count = academyCompletedCount();
  var rank = ACADEMY_RANKS[0];
  // Sequential unlock (Mission 3 can't complete before Mission 2) means "N
  // missions done" is equivalent to "missions 1..N done", so a simple count
  // threshold is a correct, not just approximate, way to check this.
  ACADEMY_RANKS.forEach(function(r){ if(count >= r.minMissions) rank = r; });
  return rank;
}
function renderAcademyDashboard(){
  var rankEl = document.getElementById('adRankName');
  if(!rankEl) return; // guard: dashboard only exists once the HTML has loaded
  var rank = academyComputeRank();
  var xp = academyComputeXP();
  var count = academyCompletedCount();
  rankEl.textContent = rank.name;
  document.getElementById('adXpValue').textContent = xp+' / '+ACADEMY_TOTAL_XP+' XP';
  document.getElementById('adMissionsValue').textContent = count+' / '+ACADEMY_MISSIONS.length;
  document.getElementById('adBarFill').style.width = Math.round((xp/ACADEMY_TOTAL_XP)*100)+'%';
}

// Restore any previously-completed Academy missions (persisted in the same
// dronova_sim_progress_v1 store the existing Missions system already uses).
// This runs here, after ACADEMY_MISSIONS exists, rather than inside the
// earlier restoreSimProgress() IIFE, which executes before this array does.
(function restoreAcademyProgress(){
  var saved = loadSimProgress();
  if(saved.academyCompleted && saved.academyCompleted.length){
    ACADEMY_MISSIONS.forEach(function(m, i){
      if(saved.academyCompleted.indexOf(m.id) > -1){
        m.status = 'done';
        academyUnlockNext(i);
      }
    });
  }
})();

/* ============================================================
   FINAL FLIGHT ASSESSMENT (Phase 7.8)
   A single continuous 6-stage flight combining the skills from
   Missions 1–6. Reuses the same zones, thresholds, collision
   system, and even the same briefing/debrief/HUD DOM elements
   as the six missions (repurposed dynamically) rather than
   building a second parallel UI. Unlocked only once all six
   Academy missions are complete.
============================================================ */
var finalAssessmentActive = false;
var FINAL_ASSESSMENT = {
  status: 'locked', // locked | available | done
  stageIndex: 0,
  contacts: 0, contactActive: false,
  battery: 100, warned: false,
  landingAccuracy: null,
  // Part 3 navigation is intentionally separate from stage scoring. While
  // true, the learner manually flies to a stage start point and that stage's
  // check() function is paused.
  navigatingToStageStart: false,
  stageStartTarget: null,
  stages: [
    { id:'fa_takeoff', title:'Safe Take-Off', objective:'Perform a controlled take-off from the launch pad and reach a safe altitude.',
      confirmText:'SAFE TAKE-OFF CONFIRMED',
      reset: function(){ this.phase=0; this.holdTimer=0; this.progress=0; },
      check: function(dt){
        if(this.phase===0){
          this.progress = Math.min(0.5, (flight.pos.y/8)*0.5);
          if(flight.pos.y >= 8) this.phase = 1;
          return false;
        }
        var band = flight.pos.y >= 7 && flight.pos.y <= 9;
        var slow = Math.hypot(flight.vel.x,flight.vel.z,flight.vel.y) < 1.2;
        this.holdTimer = (band && slow) ? this.holdTimer+dt : Math.max(0, this.holdTimer-dt*1.2);
        this.progress = 0.5 + Math.min(0.5, (this.holdTimer/3)*0.5);
        return this.holdTimer >= 3;
      },
      hudText: function(){ return this.phase===0 ? 'Climb to 8m — currently '+flight.pos.y.toFixed(1)+'m' : 'Hold steady: '+this.holdTimer.toFixed(1)+'s / 3.0s'; } },

    { id:'fa_hover', title:'Stable Hover', objective:'Navigate into the Hover Training Zone and hold position.',
      confirmText:'FLIGHT STABILITY CONFIRMED',
      // Competition UX Part 3: guide to the SAME start point used by the normal Hover mission, but never teleport.
      startNavMissionId:'ac_hover', startNavLabel:'HOVER TRAINING START', startNavRadius:2.0,
      reset: function(){ this.timer=0; this.inZone=false; this.progress=0; },
      check: function(dt){
        var inZone = Math.hypot(flight.pos.x-HOVER_ZONE.x, flight.pos.z-HOVER_ZONE.z) < 6 && flight.pos.y > 5 && flight.pos.y < 15;
        var slow = Math.hypot(flight.vel.x,flight.vel.z,flight.vel.y) < 1.0;
        this.inZone = inZone;
        this.timer = (inZone && slow) ? this.timer+dt : Math.max(0, this.timer-dt*1.2);
        this.progress = Math.min(1, this.timer/10);
        return this.timer >= 10;
      },
      hudText: function(){ return this.inZone ? 'HOLD POSITION — TIME REMAINING: '+Math.max(0,Math.ceil(10-this.timer)) : 'Fly into the Hover Training Zone'; } },

    { id:'fa_navigation', title:'Navigation Course', objective:'Pass through the training gates in the correct sequence.',
      confirmText:'NAVIGATION SKILLS CONFIRMED',
      startNavMissionId:'ac_forward', startNavLabel:'GATE COURSE START', startNavRadius:2.0,
      reset: function(){ this.sub=0; this.progress=0; },
      check: function(){
        if(this.sub===0 && Math.hypot(flight.pos.x-0, flight.pos.z-(-12)) < 3){ this.sub=1; }
        else if(this.sub===1 && Math.hypot(flight.pos.x-0, flight.pos.z-(-24)) < 3){ this.sub=2; }
        else if(this.sub===2 && Math.hypot(flight.pos.x-forwardMarker.position.x, flight.pos.z-forwardMarker.position.z) < 3){ this.sub=3; }
        this.progress = this.sub/3;
        return this.sub >= 3;
      },
      hudText: function(){ return 'CHECKPOINT '+Math.min(this.sub+1,3)+' / 3'; } },

    { id:'fa_obstacle', title:'Obstacle Avoidance', objective:'Navigate the obstacle checkpoints while avoiding contact.',
      confirmText:'OBSTACLE AVOIDANCE CONFIRMED',
      startNavMissionId:'ac_obstacle', startNavLabel:'OBSTACLE COURSE START', startNavRadius:2.0,
      checkpoints: [ {x:18,z:-1}, {x:22,z:-10}, {x:24,z:-17}, {x:20,z:-25} ],
      reset: function(){ this.cp=0; this.progress=0; FINAL_ASSESSMENT.contacts=0; FINAL_ASSESSMENT.contactActive=false; },
      check: function(){
        if(FINAL_ASSESSMENT.contacts > 3){ FINAL_ASSESSMENT.failed=true; FINAL_ASSESSMENT.failReason='EXCESSIVE OBSTACLE CONTACTS'; return false; }
        var target = this.checkpoints[this.cp];
        if(target && Math.hypot(flight.pos.x-target.x, flight.pos.z-target.z) < 3){ this.cp++; }
        this.progress = this.cp/this.checkpoints.length;
        return this.cp >= this.checkpoints.length;
      },
      hudText: function(){ return 'CHECKPOINT: '+Math.min(this.cp+1,this.checkpoints.length)+' / '+this.checkpoints.length+'   |   OBSTACLE CONTACTS: '+FINAL_ASSESSMENT.contacts+' / 3'; } },

    { id:'fa_battery', title:'Simulated Low Battery Response', objective:'Respond to the low-battery warning and return toward the landing zone.',
      confirmText:'BATTERY RESPONSE CONFIRMED',
      startNavMissionId:'ac_emergency', startNavLabel:'EMERGENCY RESPONSE START', startNavRadius:3.0,
      reset: function(){ FINAL_ASSESSMENT.battery=100; FINAL_ASSESSMENT.warned=false; this.progress=0; },
      check: function(dt){
        FINAL_ASSESSMENT.battery = Math.max(0, FINAL_ASSESSMENT.battery - dt*(100/100));
        if(!FINAL_ASSESSMENT.warned && FINAL_ASSESSMENT.battery <= 30) FINAL_ASSESSMENT.warned = true;
        if(FINAL_ASSESSMENT.battery <= 0){ FINAL_ASSESSMENT.failed=true; FINAL_ASSESSMENT.failReason='BATTERY DEPLETED'; return false; }
        var nearBase = Math.hypot(flight.pos.x, flight.pos.z) < 4.75;
        this.progress = FINAL_ASSESSMENT.warned ? Math.max(0, Math.min(1, 1-Math.hypot(flight.pos.x,flight.pos.z)/40)) : 0.15;
        return FINAL_ASSESSMENT.warned && nearBase;
      },
      hudText: function(){
        return (FINAL_ASSESSMENT.warned ? '⚠ RETURN TO BASE' : 'Normal flight') + '   |   BATTERY: '+Math.round(FINAL_ASSESSMENT.battery)+'%';
      } },

    { id:'fa_landing', title:'Precision Landing', objective:'Reduce altitude safely and land within the Precision Landing Zone.',
      confirmText:'PRECISION LANDING CONFIRMED',
      reset: function(){ this.progress=0; },
      check: function(){
        this.progress = Math.max(0, Math.min(1, 1-(flight.pos.y/10)));
        var nearPad = Math.hypot(flight.pos.x, flight.pos.z) < 4.75;
        var landed = flight.pos.y <= 0.25 && Math.abs(flight.vel.y) < 1.2;
        if(landed && nearPad){
          var dist = Math.hypot(flight.pos.x, flight.pos.z);
          FINAL_ASSESSMENT.landingAccuracy = dist < 2.6 ? 'EXCELLENT' : dist < 3.5 ? 'GOOD' : 'ACCEPTABLE';
          return true;
        }
        return false;
      },
      hudText: function(){ return 'BATTERY: '+Math.round(FINAL_ASSESSMENT.battery)+'%   |   Descend to the landing pad — altitude '+flight.pos.y.toFixed(1)+'m'; } }
  ]
};

// Competition UX Part 3 -------------------------------------------------------
// FINAL ASSESSMENT START-POINT GUIDANCE
// Training Missions 1–6 keep the Part 2 mission-specific spawn positions.
// The Final Assessment is deliberately different: the drone is NEVER
// teleported between stages. Instead, the learner follows a blinking HUD arrow
// and a temporary amber 3D beacon to the same mission start position. Once the
// start area is reached, all assistance disappears and the stage is evaluated
// exactly as before.
var finalAssessmentStartBeaconGroup = null;

function finalAssessmentMissionById(id){
  for(var i=0;i<ACADEMY_MISSIONS.length;i++) if(ACADEMY_MISSIONS[i].id === id) return ACADEMY_MISSIONS[i];
  return null;
}
function finalAssessmentStageStartTarget(stage){
  if(!stage || !stage.startNavMissionId) return null;
  var mission = finalAssessmentMissionById(stage.startNavMissionId);
  if(!mission || !mission.startPos) return null;
  return {
    x: mission.startPos.x,
    z: mission.startPos.z,
    label: stage.startNavLabel || (stage.title.toUpperCase()+' START'),
    radius: stage.startNavRadius || 4.5
  };
}
function ensureFinalAssessmentStartBeacon(){
  if(finalAssessmentStartBeaconGroup) return finalAssessmentStartBeaconGroup;
  var g = new THREE.Group();
  var ringMat = new THREE.MeshBasicMaterial({ color:0xffb200, transparent:true, opacity:0.72, side:THREE.DoubleSide, depthWrite:false });
  var ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.55, 36), ringMat);
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.055;
  g.add(ring);
  var beamMat = new THREE.MeshBasicMaterial({ color:0xffb200, transparent:true, opacity:0.32, depthWrite:false });
  var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.5, 8), beamMat);
  beam.position.y = 3.25;
  g.add(beam);
  var capMat = new THREE.MeshStandardMaterial({ color:0xffb200, emissive:0xffb200, emissiveIntensity:0.75, roughness:0.35 });
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), capMat);
  cap.position.y = 6.5;
  g.add(cap);
  var sign = makeSignSprite('ASSESSMENT START', '#ffb200');
  sign.scale.set(2.5, 0.55, 1); sign.position.set(0, 7.25, 0);
  g.add(sign);
  g.userData.ring = ring; g.userData.beam = beam; g.userData.cap = cap;
  g.visible = false;
  scene.add(g);
  finalAssessmentStartBeaconGroup = g;
  return g;
}
function hideFinalAssessmentStartGuide(){
  FINAL_ASSESSMENT.navigatingToStageStart = false;
  FINAL_ASSESSMENT.stageStartTarget = null;
  var box = document.getElementById('amhNavGuide');
  if(box){ box.style.display='none'; box.classList.remove('finalAssessmentNav'); }
  if(finalAssessmentStartBeaconGroup) finalAssessmentStartBeaconGroup.visible = false;
}
function showFinalAssessmentStartGuide(target){
  if(!target) return hideFinalAssessmentStartGuide();
  FINAL_ASSESSMENT.navigatingToStageStart = true;
  FINAL_ASSESSMENT.stageStartTarget = target;
  var beacon = ensureFinalAssessmentStartBeacon();
  beacon.position.set(target.x, 0, target.z);
  beacon.visible = true;
}
function updateFinalAssessmentStartGuideVisuals(){
  if(!FINAL_ASSESSMENT.navigatingToStageStart || !FINAL_ASSESSMENT.stageStartTarget){
    var hiddenBox = document.getElementById('amhNavGuide');
    if(hiddenBox){ hiddenBox.style.display='none'; hiddenBox.classList.remove('finalAssessmentNav'); }
    if(finalAssessmentStartBeaconGroup) finalAssessmentStartBeaconGroup.visible=false;
    return;
  }
  var target = FINAL_ASSESSMENT.stageStartTarget;
  var box = document.getElementById('amhNavGuide');
  var value = document.getElementById('amhNavValue');
  var distance = Math.hypot(flight.pos.x-target.x, flight.pos.z-target.z);
  if(box && value){
    value.textContent = academyNavigationArrow(target)+'  '+target.label+'  •  '+distance.toFixed(1)+' m';
    box.classList.add('finalAssessmentNav');
    box.style.display='';
  }
  var beacon = ensureFinalAssessmentStartBeacon();
  beacon.position.set(target.x, 0, target.z);
  beacon.visible = true;
  // Cheap visual pulse only while guidance is active; no new per-frame objects.
  var pulse = 1 + Math.sin(performance.now()*0.006)*0.10;
  beacon.userData.ring.scale.set(pulse,pulse,pulse);
  beacon.userData.cap.scale.setScalar(0.92 + (pulse-0.9)*0.9);
  beacon.userData.beam.material.opacity = 0.22 + (pulse-0.9)*0.55;
}
function activateFinalAssessmentStage(index){
  FINAL_ASSESSMENT.stageIndex = index;
  var stage = FINAL_ASSESSMENT.stages[index];
  var target = finalAssessmentStageStartTarget(stage);
  if(target){
    var distance = Math.hypot(flight.pos.x-target.x, flight.pos.z-target.z);
    if(distance > target.radius){
      showFinalAssessmentStartGuide(target);
      showToast('NAVIGATE TO NEXT STAGE', 'Follow the blinking marker to '+target.label+'.', '🧭');
    } else {
      hideFinalAssessmentStartGuide();
    }
  } else {
    hideFinalAssessmentStartGuide();
  }
  updateFinalAssessmentHud();
}
function updateFinalAssessmentStartNavigation(){
  if(!FINAL_ASSESSMENT.navigatingToStageStart || !FINAL_ASSESSMENT.stageStartTarget) return false;
  var target = FINAL_ASSESSMENT.stageStartTarget;
  var distance = Math.hypot(flight.pos.x-target.x, flight.pos.z-target.z);
  updateFinalAssessmentStartGuideVisuals();
  if(distance <= target.radius){
    var stage = FINAL_ASSESSMENT.stages[FINAL_ASSESSMENT.stageIndex];
    hideFinalAssessmentStartGuide();
    showToast('START POINT REACHED', stage.title+' begins now.', '🎯');
    updateFinalAssessmentHud();
    return false;
  }
  return true;
}

function finalAssessmentUnlocked(){ return academyCompletedCount() >= ACADEMY_MISSIONS.length; }
function refreshFinalAssessmentAvailability(){
  if(FINAL_ASSESSMENT.status === 'done') return;
  FINAL_ASSESSMENT.status = finalAssessmentUnlocked() ? 'available' : 'locked';
}
function startFinalAssessment(){
  if(!finalAssessmentUnlocked()) return;
  finalAssessmentActive = true;
  FINAL_ASSESSMENT.stageIndex = 0;
  FINAL_ASSESSMENT.contacts = 0; FINAL_ASSESSMENT.contactActive = false;
  FINAL_ASSESSMENT.battery = 100; FINAL_ASSESSMENT.warned = false;
  FINAL_ASSESSMENT.landingAccuracy = null; FINAL_ASSESSMENT.failed = false; FINAL_ASSESSMENT.failReason = null;
  FINAL_ASSESSMENT.navigatingToStageStart = false; FINAL_ASSESSMENT.stageStartTarget = null;
  FINAL_ASSESSMENT.stages.forEach(function(s){ s.reset(); });
  // Predictable initial launch-pad start remains unchanged. Part 3 only adds
  // manual navigation BETWEEN later assessment stages.
  flight.pos.set(0, 0.03, 0); flight.vel.set(0,0,0);
  flight.pitch=0; flight.roll=0; flight.yaw=0; flight.throttle=0; flight.targetThrottle=0;
  autopilot=null; autoHoverOn=false;

  academyPanel.classList.remove('show');
  academyMissionHud.classList.add('show');
  document.getElementById('amhResetStartBtn').style.display = 'none';
  hideFinalAssessmentStartGuide();
  activateFinalAssessmentStage(0);
}
function updateFinalAssessmentHud(){
  var stage = FINAL_ASSESSMENT.stages[FINAL_ASSESSMENT.stageIndex];
  document.getElementById('amhTitle').textContent = 'FINAL ASSESSMENT — Stage '+(FINAL_ASSESSMENT.stageIndex+1)+' / 6 — '+stage.title;
  if(FINAL_ASSESSMENT.navigatingToStageStart && FINAL_ASSESSMENT.stageStartTarget){
    document.getElementById('amhObjective').textContent = 'Navigate manually to the blinking '+FINAL_ASSESSMENT.stageStartTarget.label+' marker to begin this stage.';
    document.getElementById('amhProgressFill').style.width = '0%';
    document.getElementById('amhProgressText').textContent = 'REACH STAGE START';
    updateFinalAssessmentStartGuideVisuals();
  } else {
    document.getElementById('amhObjective').textContent = stage.objective;
    document.getElementById('amhProgressFill').style.width = Math.round((stage.progress||0)*100)+'%';
    document.getElementById('amhProgressText').textContent = stage.hudText();
    var box = document.getElementById('amhNavGuide');
    if(box){ box.style.display='none'; box.classList.remove('finalAssessmentNav'); }
  }
}
function updateFinalAssessment(dt){
  // Only the currently active stage is evaluated — never all six at once.
  if(!finalAssessmentActive) return;
  // Part 3: navigation TO a stage is part of the assessment flow, but it is
  // not the stage itself. Pause scoring/timers until the start beacon is reached.
  if(updateFinalAssessmentStartNavigation()){ updateFinalAssessmentHud(); return; }
  var stage = FINAL_ASSESSMENT.stages[FINAL_ASSESSMENT.stageIndex];
  var done = stage.check(dt);
  updateFinalAssessmentHud();
  if(FINAL_ASSESSMENT.failed){ failFinalAssessment(); return; }
  if(done){
    showToast('STAGE '+(FINAL_ASSESSMENT.stageIndex+1)+' COMPLETE', stage.confirmText, '✅');
    if(FINAL_ASSESSMENT.stageIndex < FINAL_ASSESSMENT.stages.length-1){
      activateFinalAssessmentStage(FINAL_ASSESSMENT.stageIndex+1);
    } else {
      completeFinalAssessment();
    }
  }
}
function completeFinalAssessment(){
  var wasAlreadyDone = (FINAL_ASSESSMENT.status === 'done'); // replay never re-awards the 500 XP
  finalAssessmentActive = false;
  hideFinalAssessmentStartGuide();
  academyMissionHud.classList.remove('show');
  FINAL_ASSESSMENT.status = 'done';
  saveSimProgress();

  var overlay = document.getElementById('academyCompleteOverlay');
  overlay.querySelector('.acoPanel').classList.remove('failed');
  document.querySelector('#academyCompleteOverlay .acoIcon').textContent = '🎓';
  document.querySelector('#academyCompleteOverlay .acoTitle').textContent = 'ASSESSMENT COMPLETE';
  document.getElementById('acoMissionName').textContent = 'DRONOVA FINAL FLIGHT ASSESSMENT';
  document.getElementById('acoStatusValue').textContent = 'PASSED';
  renderStatsGrid([
    {label:'Stages Completed', value:'6 / 6'},
    {label:'Obstacle Contacts', value:FINAL_ASSESSMENT.contacts+' / 3'},
    {label:'Battery Remaining', value:Math.round(FINAL_ASSESSMENT.battery)+'%'},
    {label:'Landing Accuracy', value:FINAL_ASSESSMENT.landingAccuracy || '—'}
  ]);
  document.getElementById('acoSub').textContent = 'You have completed the Dronova Flight Academy Final Flight Assessment.';
  var xpLine = document.getElementById('acoXpLine');
  if(!wasAlreadyDone){ xpLine.style.display=''; xpLine.textContent = '+ 500 XP'; }
  else { xpLine.style.display='none'; }
  document.getElementById('acoPromoBanner').style.display = 'none';
  document.getElementById('acoNextBtn').style.display = 'none';
  document.getElementById('acoReplayBtn').style.display = '';
  document.getElementById('acoReplayBtn').onclick = function(){ overlay.classList.remove('show'); startFinalAssessment(); };
  document.getElementById('acoBackBtn').textContent = 'Return to Academy';
  document.getElementById('acoBackBtn').onclick = function(){
    overlay.classList.remove('show');
    renderAcademyMissions(); renderAcademyDashboard(); renderFinalAssessmentCard();
    academyPanel.classList.add('show');
  };
  overlay.classList.add('show');
  renderAcademyDashboard(); renderFinalAssessmentCard();
  window.DronovaProgress && window.DronovaProgress.checkAndNotify && window.DronovaProgress.checkAndNotify();
}
function failFinalAssessment(){
  finalAssessmentActive = false;
  hideFinalAssessmentStartGuide();
  academyMissionHud.classList.remove('show');
  // Failure resets ONLY assessment progress — mission completion, XP, and
  // rank (all derived from ACADEMY_MISSIONS, never touched here) are safe.
  var overlay = document.getElementById('academyCompleteOverlay');
  overlay.querySelector('.acoPanel').classList.add('failed');
  document.querySelector('#academyCompleteOverlay .acoIcon').textContent = '⚠️';
  document.querySelector('#academyCompleteOverlay .acoTitle').textContent = 'FINAL ASSESSMENT FAILED';
  document.getElementById('acoMissionName').textContent = 'DRONOVA FINAL FLIGHT ASSESSMENT';
  document.getElementById('acoStatusValue').textContent = FINAL_ASSESSMENT.failReason || 'ASSESSMENT NOT COMPLETED';
  renderStatsGrid([]);
  document.getElementById('acoSub').textContent = 'REASON: ' + (FINAL_ASSESSMENT.failReason || 'Assessment not completed') + '. Your Academy mission progress, XP, and rank are unaffected.';
  document.getElementById('acoXpLine').style.display = 'none';
  document.getElementById('acoPromoBanner').style.display = 'none';
  document.getElementById('acoNextBtn').style.display = '';
  document.getElementById('acoNextBtn').textContent = '↻ Retry Assessment';
  document.getElementById('acoNextBtn').onclick = function(){ overlay.classList.remove('show'); startFinalAssessment(); };
  document.getElementById('acoReplayBtn').style.display = 'none';
  document.getElementById('acoBackBtn').textContent = 'Return to Academy';
  document.getElementById('acoBackBtn').onclick = function(){
    overlay.classList.remove('show');
    renderAcademyMissions(); renderAcademyDashboard(); renderFinalAssessmentCard();
    academyPanel.classList.add('show');
  };
  overlay.classList.add('show');
}

function renderFinalAssessmentCard(){
  var el = document.getElementById('finalAssessmentCard');
  if(!el) return;
  refreshFinalAssessmentAvailability();
  var status = FINAL_ASSESSMENT.status;
  el.className = 'academyMissionCard finalAssessmentCard ' + status;
  var statusLabel = status==='done' ? 'COMPLETED' : status==='available' ? 'AVAILABLE' : 'LOCKED';
  var objective = status==='locked'
    ? 'Complete all Academy training missions to unlock the final assessment.'
    : 'A continuous 6-stage flight combining every skill from Missions 1–6. This is the final practical examination of the Dronova Flight Academy.';
  el.innerHTML = '<div class="amcHead"><span class="amcName">🎓 FINAL ASSESSMENT</span><span class="amcStatus">'+statusLabel+'</span></div>'+
    '<div class="amcObjective">'+objective+'</div>'+
    (status!=='locked' ? '<button class="amcStartBtn" id="finalAssessmentStartBtn">'+(status==='done'?'↻ Retry Assessment':'▶ Start Assessment')+'</button>' : '');
}

// Restore Final Assessment completion, same store/pattern as restoreAcademyProgress above.
(function restoreFinalAssessment(){
  var saved = loadSimProgress();
  if(saved.finalAssessmentCompleted){ FINAL_ASSESSMENT.status = 'done'; }
  else { refreshFinalAssessmentAvailability(); }
})();

function startAcademyMission(id){
  var m = ACADEMY_MISSIONS.filter(function(x){ return x.id===id; })[0];
  if(!m || m.status === 'locked') return;
  academyMissionActive = m;
  m.reset();
  // Competition UX Part 2: each mission now starts at its intended training
  // area and faces its first objective. Physics and mission checks are unchanged.
  prepareAcademyMissionStart(m, false);
  academyPanel.classList.remove('show');
  academyMissionHud.classList.add('show');
  document.getElementById('amhResetStartBtn').style.display = m.navTarget ? '' : 'none';
  document.getElementById('amhTitle').textContent = m.title;
  document.getElementById('amhObjective').textContent = m.objective;
  updateAcademyHud();
}
function exitAcademyMission(silent){
  academyMissionActive = null;
  academyMissionHud.classList.remove('show');
  document.getElementById('academyCompleteOverlay').classList.remove('show');
  document.getElementById('amhNavGuide').style.display = 'none';
  document.getElementById('amhResetStartBtn').style.display = 'none';
  if(mode==='free' && !silent){ /* no-op placeholder: exit never auto-changes mode */ }
  if(academyPanel){ /* left to caller (setMode) to decide whether to show the list */ }
}
document.getElementById('amhResetStartBtn').addEventListener('click', function(){
  if(!academyMissionActive) return;
  academyMissionActive.reset();
  prepareAcademyMissionStart(academyMissionActive, true);
  updateAcademyHud();
});
function updateAcademyHud(){
  if(!academyMissionActive) return;
  document.getElementById('amhProgressFill').style.width = Math.round(academyMissionActive.progress*100)+'%';
  document.getElementById('amhProgressText').textContent = academyMissionActive.hudText();
  updateAcademyNavigationGuide();
}
function updateAcademyMission(dt){
  // Only the currently active mission's check runs — not all four — per the
  // performance requirement to avoid evaluating inactive mission systems.
  if(!academyMissionActive) return;
  var m = academyMissionActive;
  var done = m.check(dt);
  updateAcademyHud();
  if(m.failed){ failAcademyMission(m); return; }
  if(done) completeAcademyMission();
}
function missionCompletionDetail(m){
  if(m.id === 'ac_landing' && m.accuracy) return 'Landing accuracy: '+m.accuracy+'. Training objectives completed.';
  if(m.id === 'ac_obstacle') return 'Checkpoints completed: '+m.checkpoints.length+' / '+m.checkpoints.length+'.  Obstacle contacts: '+m.contacts+' / 3.';
  if(m.id === 'ac_emergency') return 'Safe landing confirmed. Simulated battery remaining: '+Math.round(m.battery)+'%.';
  return 'Training objectives completed.';
}
function missionStats(m){
  // Only real, already-tracked data — never invented statistics.
  // ac_forward tracks progress via `sub` (0-3), not a checkpoints array —
  // unlike ac_obstacle, which genuinely has one. Fixed after testing caught
  // this reading the wrong property and throwing on Mission 3 completion.
  if(m.id === 'ac_forward') return [{label:'Checkpoints', value:'3 / 3'}];
  if(m.id === 'ac_landing' && m.accuracy) return [{label:'Landing Accuracy', value:m.accuracy}];
  if(m.id === 'ac_obstacle') return [
    {label:'Checkpoints', value:m.checkpoints.length+' / '+m.checkpoints.length},
    {label:'Obstacle Contacts', value:m.contacts+' / 3'}
  ];
  if(m.id === 'ac_emergency') return [{label:'Battery Remaining', value:Math.round(m.battery)+'%'}];
  return [];
}
function renderStatsGrid(stats){
  var grid = document.getElementById('acoStatsGrid');
  grid.innerHTML = '';
  stats.forEach(function(s){
    var div = document.createElement('div');
    div.className = 'acoStat';
    div.innerHTML = '<div class="asLabel">'+s.label+'</div><div class="asValue">'+s.value+'</div>';
    grid.appendChild(div);
  });
}
function completeAcademyMission(){
  var m = academyMissionActive;
  var wasAlreadyDone = (m.status === 'done'); // replaying an already-completed mission awards no new XP
  var rankBefore = academyComputeRank();

  m.status = 'done';
  var idx = ACADEMY_MISSIONS.indexOf(m);
  academyUnlockNext(idx);
  saveSimProgress();
  academyMissionHud.classList.remove('show');
  academyMissionActive = null;

  var rankAfter = academyComputeRank();
  var promoted = !wasAlreadyDone && rankAfter.name !== rankBefore.name;

  var overlay = document.getElementById('academyCompleteOverlay');
  overlay.querySelector('.acoPanel').classList.remove('failed');
  document.querySelector('#academyCompleteOverlay .acoIcon').textContent = '🏆';
  document.querySelector('#academyCompleteOverlay .acoTitle').textContent = 'MISSION COMPLETE';
  document.getElementById('acoMissionName').textContent = m.title;
  document.getElementById('acoStatusValue').textContent = 'SUCCESSFUL';
  renderStatsGrid(missionStats(m));
  document.getElementById('acoSub').textContent = missionCompletionDetail(m);

  var xpLine = document.getElementById('acoXpLine');
  if(!wasAlreadyDone){
    xpLine.style.display = '';
    xpLine.textContent = '+ '+(ACADEMY_XP_VALUES[m.id]||0)+' XP';
  } else {
    xpLine.style.display = 'none';
  }

  var promoBanner = document.getElementById('acoPromoBanner');
  if(promoted){
    promoBanner.style.display = '';
    document.getElementById('acoPromoRank').textContent = rankAfter.name;
    document.getElementById('acoPromoSub').textContent = 'You have completed the required training.';
  } else {
    promoBanner.style.display = 'none';
  }

  // Mission Navigation (Phase 7.7): Next Mission (if unlocked) / Replay / Return to Academy.
  // Navigation never bypasses progression — Next only appears when the next
  // mission is genuinely unlocked, exactly as before.
  var next = ACADEMY_MISSIONS[idx+1];
  var nextBtn = document.getElementById('acoNextBtn');
  if(next && next.status !== 'locked'){
    nextBtn.style.display = '';
    nextBtn.textContent = 'Next Mission →';
    nextBtn.onclick = function(){ overlay.classList.remove('show'); startAcademyMission(next.id); };
  } else {
    nextBtn.style.display = 'none';
  }
  document.getElementById('acoReplayBtn').style.display = '';
  document.getElementById('acoReplayBtn').onclick = function(){ overlay.classList.remove('show'); startAcademyMission(m.id); };
  document.getElementById('acoBackBtn').textContent = 'Return to Academy';
  document.getElementById('acoBackBtn').onclick = function(){
    overlay.classList.remove('show');
    renderAcademyMissions(); renderAcademyDashboard(); renderFinalAssessmentCard();
    academyPanel.classList.add('show');
  };

  overlay.classList.add('show');
  renderAcademyDashboard(); renderFinalAssessmentCard();
  // Reuses the existing shared achievement engine rather than a second one —
  // Academy XP/rank themselves stay local to this file (see comment above),
  // but mission completion should still feed the app-wide progress system.
  window.DronovaProgress && window.DronovaProgress.checkAndNotify && window.DronovaProgress.checkAndNotify();
}
function failAcademyMission(m){
  academyMissionHud.classList.remove('show');
  academyMissionActive = null;
  // Failure never touches persisted status — the mission stays exactly as it
  // was (available/locked), and Academy XP/progress is never reset on failure.
  var overlay = document.getElementById('academyCompleteOverlay');
  overlay.querySelector('.acoPanel').classList.add('failed');
  document.querySelector('#academyCompleteOverlay .acoIcon').textContent = '⚠️';
  document.querySelector('#academyCompleteOverlay .acoTitle').textContent = 'MISSION FAILED';
  document.getElementById('acoMissionName').textContent = m.title;
  document.getElementById('acoStatusValue').textContent = m.failReason || 'TRAINING NOT COMPLETED';
  renderStatsGrid([]);
  document.getElementById('acoSub').textContent = (m.failReason || 'Training not completed') + '. Try again — you can do it!';
  document.getElementById('acoXpLine').style.display = 'none';
  document.getElementById('acoPromoBanner').style.display = 'none';

  var nextBtn = document.getElementById('acoNextBtn');
  nextBtn.style.display = '';
  nextBtn.textContent = '↻ Retry Mission';
  nextBtn.onclick = function(){ overlay.classList.remove('show'); startAcademyMission(m.id); };
  document.getElementById('acoReplayBtn').style.display = 'none'; // Retry above already covers this on failure
  document.getElementById('acoBackBtn').textContent = 'Exit Academy';
  document.getElementById('acoBackBtn').onclick = function(){
    overlay.classList.remove('show');
    setMode('free');
  };
  overlay.classList.add('show');
}
// Phase 7.9: consolidated into a single handler — this button previously had
// two separate addEventListener registrations (one added in Phase 7.8 for
// exiting the Final Assessment, one from Phase 7.3 for exiting a mission),
// both firing on every click. The Phase 7.3 handler already covered both
// cases correctly (exitAcademyMission() safely no-ops when no mission is
// active) and additionally re-rendered the panel, which the other one
// didn't — so this keeps that one and folds in the assessment-exit case.
document.getElementById('amhExitBtn').addEventListener('click', function(){
  if(finalAssessmentActive){ finalAssessmentActive = false; hideFinalAssessmentStartGuide(); }
  exitAcademyMission();
  renderAcademyMissions();
  renderAcademyDashboard();
  renderFinalAssessmentCard();
  academyPanel.classList.add('show');
});

function renderAcademyMissions(){
  var el = document.getElementById('academyMissionList');
  el.innerHTML = '';
  ACADEMY_MISSIONS.forEach(function(m, i){
    var div = document.createElement('div');
    div.className = 'academyMissionCard ' + m.status;
    var statusLabel = m.status==='done' ? 'COMPLETE' : m.status==='available' ? 'AVAILABLE' : 'LOCKED';
    div.innerHTML = '<div class="amcHead"><span class="amcName">'+(i+1)+'. '+m.title+'</span><span class="amcStatus">'+statusLabel+'</span></div>'+
      '<div class="amcObjective">'+m.objective+'</div>'+
      '<button class="amcStartBtn" data-mission="'+m.id+'" '+(m.status==='locked'?'disabled':'')+'>'+
        (m.status==='done' ? '↻ Retry Mission' : '▶ Start Mission')+'</button>';
    el.appendChild(div);
  });
}
document.getElementById('academyMissionList').addEventListener('click', function(e){
  var btn = e.target.closest && e.target.closest('.amcStartBtn');
  if(btn && !btn.disabled) showMissionBriefing(btn.dataset.mission);
});
document.getElementById('finalAssessmentCard').addEventListener('click', function(e){
  var btn = e.target.closest && e.target.closest('#finalAssessmentStartBtn');
  if(btn) showFinalAssessmentBriefing();
});
function showFinalAssessmentBriefing(){
  if(!finalAssessmentUnlocked()) return;
  document.getElementById('abTitle').textContent = 'DRONOVA FINAL FLIGHT ASSESSMENT';
  document.getElementById('abObjective').textContent = 'Complete all six stages — Safe Take-Off, Stable Hover, Navigation Course, Obstacle Avoidance, Low Battery Response, and Precision Landing — in one continuous flight. Between stages, follow the blinking navigation arrow and amber START beacon to the next training area; the drone will not be repositioned automatically.';
  document.getElementById('abInstructions').textContent = 'This is the final practical examination of the Flight Academy, combining every skill from Missions 1–6. Stages must be completed in order. On first successful completion you will be awarded 500 Academy XP.';
  document.getElementById('abStartBtn').onclick = function(){
    document.getElementById('academyBriefingOverlay').classList.remove('show');
    startFinalAssessment();
  };
  academyPanel.classList.remove('show');
  document.getElementById('academyBriefingOverlay').classList.add('show');
}
function showMissionBriefing(id){
  var m = ACADEMY_MISSIONS.filter(function(x){ return x.id===id; })[0];
  if(!m || m.status === 'locked') return;
  document.getElementById('abTitle').textContent = m.title;
  document.getElementById('abObjective').textContent = m.objective;
  document.getElementById('abInstructions').textContent = m.briefing || m.objective;
  document.getElementById('abStartBtn').onclick = function(){
    document.getElementById('academyBriefingOverlay').classList.remove('show');
    startAcademyMission(id);
  };
  academyPanel.classList.remove('show');
  document.getElementById('academyBriefingOverlay').classList.add('show');
}
document.getElementById('abCancelBtn').addEventListener('click', function(){
  document.getElementById('academyBriefingOverlay').classList.remove('show');
  academyPanel.classList.add('show');
});
renderAcademyMissions();
renderAcademyDashboard();
renderFinalAssessmentCard();

/* ============================================================
   RESCUE ACADEMY (foundation in 9.1/9.2; full mission completed through 9.4F)
   The Academy now contains the complete Forest Search & Rescue
   training flow: briefing, preparation, launch, search-sector
   navigation, target detection/identification, coordinate record,
   return to base, landing, scoring and feedback. It continues to
   reuse the simulator's existing free-flight physics and shared
   world rather than maintaining a separate flight model.

   Competition UX Part 4 improves only the information/briefing
   layer so the implemented mission is communicated clearly to the
   learner. Mission mechanics and physics remain unchanged.
============================================================ */
var RESCUE_STATES = { NONE:'none', SELECTED:'selected', BRIEFING:'briefing', PREPARATION:'preparation', READY:'ready',
  ACTIVE_MISSION:'active_mission', MISSION_COMPLETE:'mission_complete' };
var RESCUE_STATE = {
  active: false,            // true while the Rescue mission is actively running
  selectedMission: null,    // id of the chosen mission
  status: RESCUE_STATES.NONE,
  objectives: [],           // populated from the selected mission's data once one is chosen
  stage: 0,                 // sequential stage index, mirroring the Academy/Assessment pattern
  targetStatus: 'unknown',  // Phase 9.4B/9.4C: 'unknown' -> 'searching' -> 'detected' -> 'identified'
  targetLocation: null,     // Phase 9.4C: {x,y,z} recorded at the moment of identification, cleared on reset
  returnStatus: 'not_started', // Phase 9.4D: 'not_started' -> 'returning' -> 'at_base'
  searchZoneStatus: 'unknown', // tracks entry into the implemented forest search sector
  score: 0,                 // Phase 9.4F: final 0-100 score, computed once at mission completion
  timeElapsed: 0,            // Phase 9.4F: seconds from mission start to search-area-reached (detection speed)
  collisionCount: 0,        // Phase 9.4F: now genuinely wired — incremented by the EXISTING notifyCollision(), never altering it
  safeReturn: false,        // Phase 9.4F: true once return-to-base path efficiency has been recorded
  landingComplete: false,   // Phase 9.4F: mirrors mission completion, set alongside RESCUE_STATES.MISSION_COMPLETE
  // Phase 9.4F additions — all purely observational bookkeeping, none of
  // this reads or writes flight physics, only flight.pos for distance math.
  missionStartTime: 0,
  returnDistanceTraveled: 0,
  lastReturnPos: null,
  scoreBreakdown: null,
  grade: '',
  xpAwarded: 0
};

// Mission data structure (Part 6) — kept fully separate from the UI code
// below, so future missions are added here without touching the briefing/
// preparation rendering logic at all.
var RESCUE_MISSIONS = [
  {
    id: 'forest_search_01',
    number: 'MISSION 01',
    name: 'Forest Search & Rescue',
    type: 'Search & Rescue Training',
    location: 'Forest Training Sector',
    flightConditions: 'Morning / Clear',
    difficulty: 'Beginner',
    priority: 'High',
    estimatedDuration: '5–10 Minutes',
    status: 'available', // 'available' | 'locked' | 'coming_soon'
    cardBlurb: 'A person has been reported missing near the DRONOVA training area. Use your drone to search the designated area and locate the target.',
    situation: 'A person has been reported missing within the designated forest training sector. Your task is to operate the DRONOVA training drone and conduct an aerial search of the assigned area. Locate and confirm the target before returning safely to the drone base.',
    objectives: [
      'Launch the drone safely',
      'Navigate to the designated search area',
      'Search the assigned sector',
      'Locate the missing target',
      'Confirm the target location',
      'Return to the drone base',
      'Land safely'
    ],
    flowSteps: [
      { icon:'🚁', title:'Launch', detail:'Take off from Rescue Base' },
      { icon:'🧭', title:'Navigate', detail:'Follow the red SEARCH AREA beacon' },
      { icon:'🔍', title:'Search', detail:'Scan the forest sector manually' },
      { icon:'F', title:'Identify', detail:'Approach the detected target and press F' },
      { icon:'↩', title:'Return', detail:'Follow rescue-base guidance home' },
      { icon:'🛬', title:'Land', detail:'Complete a stable landing at base' }
    ],
    safetyInfo: [
      'Maintain awareness of obstacles',
      'Monitor altitude and flight speed',
      'Avoid restricted areas',
      'Return before flight conditions become unsafe',
      'Land only within the designated area'
    ],
    // Search sector and full mission environment are implemented in the
    // shared world; the preparation checklist reflects that real status.
    environmentImplemented: true
  }
];

function findRescueMission(id){
  return RESCUE_MISSIONS.filter(function(m){ return m.id === id; })[0] || null;
}

function renderRescuePanel(){
  var statusEl = document.getElementById('rescueStatusValue');
  if(!statusEl) return;
  statusEl.textContent = RESCUE_STATE.active ? ('Mission in progress — Stage '+RESCUE_STATE.stage)
    : RESCUE_STATE.status === RESCUE_STATES.READY ? 'Mission ready — search environment available'
    : 'No active mission';
  var list = document.getElementById('rescueMissionList');
  list.innerHTML = '';
  RESCUE_MISSIONS.forEach(function(m){
    var div = document.createElement('div');
    var statusLabel = m.status === 'available' ? 'AVAILABLE' : m.status === 'locked' ? 'LOCKED' : 'COMING SOON';
    div.className = 'rescueMissionCard ' + (m.status === 'available' ? 'available' : 'placeholder');
    div.innerHTML = '<div class="rmcHead"><span class="rmcName">'+m.number+'</span><span class="rmcStatus">'+statusLabel+'</span></div>'+
      '<div class="rmcTitle">'+m.name+'</div>'+
      '<div class="rmcSituation">'+m.cardBlurb+'</div>'+
      '<div class="rmcDifficulty">Difficulty: '+m.difficulty+'</div>'+
      (m.status === 'available' ? '<button class="rmcViewBtn" data-mission="'+m.id+'">🚨 View Mission Briefing</button>' : '');
    list.appendChild(div);
  });
}
document.getElementById('rescueMissionList').addEventListener('click', function(e){
  var btn = e.target.closest && e.target.closest('.rmcViewBtn');
  if(btn) showRescueBriefing(btn.dataset.mission);
});
renderRescuePanel();

/* ---------- Mission Briefing screen ---------- */
function showRescueBriefing(missionId){
  var m = findRescueMission(missionId);
  if(!m) return;
  RESCUE_STATE.selectedMission = m.id;
  RESCUE_STATE.status = RESCUE_STATES.BRIEFING;
  RESCUE_STATE.objectives = m.objectives;

  document.getElementById('rbMissionNumber').textContent = m.number;
  document.getElementById('rbMissionTitle').textContent = m.name;
  document.getElementById('rbSituation').textContent = m.situation;

  var infoGrid = document.getElementById('rbInfoGrid');
  var infoItems = [
    ['MISSION TYPE', m.type], ['LOCATION', m.location],
    ['FLIGHT CONDITIONS', m.flightConditions], ['DIFFICULTY', m.difficulty],
    ['MISSION PRIORITY', m.priority], ['ESTIMATED TIME', m.estimatedDuration]
  ];
  infoGrid.innerHTML = infoItems.map(function(pair){
    return '<div class="rbInfoItem"><div class="rbInfoLabel">'+pair[0]+'</div><div class="rbInfoValue">'+pair[1]+'</div></div>';
  }).join('');

  var flowEl = document.getElementById('rbMissionFlow');
  flowEl.innerHTML = (m.flowSteps || []).map(function(step, index){
    return '<div class="rbFlowStep"><div class="rbFlowNum">0'+(index+1)+'</div>'+
      '<div class="rbFlowIcon">'+step.icon+'</div><div class="rbFlowTitle">'+step.title+'</div>'+
      '<div class="rbFlowText">'+step.detail+'</div></div>';
  }).join('');

  document.getElementById('rbObjectives').innerHTML = m.objectives.map(function(o){ return '<li>'+o+'</li>'; }).join('');
  document.getElementById('rbSafety').innerHTML = m.safetyInfo.map(function(s){ return '<li>'+s+'</li>'; }).join('');

  rescuePanel.classList.remove('show');
  document.getElementById('rescueBriefingOverlay').classList.add('show');
  renderRescuePanel();
}
document.getElementById('rbBackBtn').addEventListener('click', function(){
  document.getElementById('rescueBriefingOverlay').classList.remove('show');
  RESCUE_STATE.status = RESCUE_STATES.SELECTED;
  rescuePanel.classList.add('show');
  renderRescuePanel();
});
document.getElementById('rbPrepareBtn').addEventListener('click', function(){
  document.getElementById('rescueBriefingOverlay').classList.remove('show');
  showRescuePreparation();
});

/* ---------- Mission Preparation screen ---------- */
function showRescuePreparation(){
  var m = findRescueMission(RESCUE_STATE.selectedMission);
  if(!m) return;
  RESCUE_STATE.status = RESCUE_STATES.PREPARATION;
  // Phase 9.4A CORRECTION: this used to call enterRescueEnvironment(), which
  // teleports to the spatially-isolated environment built in Phase 9.3A.
  // Phase 9.3B through 9.3F clarified the real architecture is one shared
  // world, and this phase's own brief (Part 11) explicitly requires the
  // mission to use "THE EXISTING FOREST ENVIRONMENT" — the shared world's
  // Forest (Phase 9.3B, centred at FOREST_CLEARINGS[0]), not the isolated
  // area. Calling enterRescueEnvironment() here would teleport the player
  // away from the world the mission actually needs to run in, so that call
  // has been removed. The isolated-environment functions themselves are
  // left intact and unused rather than deleted, in case a future phase
  // wants to reconcile or repurpose that area deliberately.
  document.getElementById('rpMissionTitle').textContent = m.name;
  var rows = [
    ['Drone System', true], ['Flight Controls', true], ['Mission Objectives', true],
    ['Search Environment', m.environmentImplemented], ['Target Detection', true], ['Return / Landing Guidance', true]
  ];
  document.getElementById('rpChecklist').innerHTML = rows.map(function(r){
    var ready = r[1];
    return '<div class="rpRow"><span class="rpRowLabel">'+r[0]+'</span>'+
      '<span class="rpRowStatus '+(ready?'ready':'pending')+'">'+(ready?'READY':'NOT READY')+'</span></div>';
  }).join('');

  document.getElementById('rescuePrepOverlay').classList.add('show');
}
document.getElementById('rpBackBtn').addEventListener('click', function(){
  document.getElementById('rescuePrepOverlay').classList.remove('show');
  showRescueBriefing(RESCUE_STATE.selectedMission);
});
document.getElementById('rpStartBtn').addEventListener('click', function(){
  startRescueMissionStage1();
});

/* ============================================================
   SEARCH & RESCUE MISSION — STAGE 1 (Phase 9.4A)
   The full 5-stage structure from the brief is scaffolded in the
   RESCUE_STATES/RESCUE_STATE objects above (Phase 9.1), but only
   BRIEFING and this one stage are reachable this phase — the rest
   remain genuinely unreachable, not faked. Uses the ACTUAL shared
   world (the existing drone, the existing flight system, the
   existing Forest's own reserved central clearing) — explicitly
   NOT the spatially-isolated Phase 9.3A environment, correcting
   the architecture per this phase's own Part 11.
============================================================ */
var rescueMissionMarkerGroup = null; // created on mission start, destroyed on exit/reset — genuinely temporary, per Part 6
var rescueTargetGroup = null; // Phase 9.4B: the missing-person target, also created/destroyed with the mission
var rescueTargetHighlightGroup = null; // Phase 9.4B: shown only after detection, per Part 9
var RESCUE_TARGET_POS = { x: 70, z: -64 }; // Part 2: inside the search area (6.4m from centre), not at the entrance, verified clear of every forest landmark
var RESCUE_TARGET_DETECTION_RADIUS = 4.5; // Part 7: close enough to require real navigation, not strict enough to feel unfair

// Phase 9.4D: Search & Rescue base — reuses the existing mission-start
// position (Part 2's own preferred approach) rather than inventing a new
// location or building. The marker sits slightly offset from the exact
// pad centre (verified clear of every existing collider) so it reads as
// its own landmark without overlapping the pad's existing ring/stripes.
var RESCUE_BASE_POS = { x: 0, z: 0 }; // the existing drone spawn / mission-start position
var RESCUE_BASE_MARKER_POS = { x: 4, z: 3 };
var RESCUE_BASE_ARRIVAL_RADIUS = 18; // Part 6's suggested 15-25m range

// Phase 9.4E: landing thresholds. Chosen relative to the existing physics
// scale rather than blindly using the brief's example numbers (Part 5's
// own instruction). Part 9 now gives every mode the same 6–8 m/s
// movement envelope, so these low landing thresholds still keep landing deliberate
// without being unfairly precise for an educational simulator.
var RESCUE_LANDING_RADIUS = 5;       // horizontal distance to the EXISTING landing pad at origin (pad itself is 2.2m, this gives a little margin)
var RESCUE_LANDING_MAX_ALT = 1.0;    // metres — close to the ground clamp (0.03)
var RESCUE_LANDING_MAX_VSPEED = 0.6; // m/s vertical
var RESCUE_LANDING_MAX_HSPEED = 0.8; // m/s horizontal
var RESCUE_LANDING_MAX_TILT = 0.2;   // radians (~11.5°) for both pitch and roll
var rescueBaseMarkerGroup = null; // built once per mission session, destroyed on exit — same lifecycle as the search/target markers

// A simple, deliberately human-scale (not exaggerated) low-poly figure —
// Part 1/3: realistic scale is itself the primary reason this isn't
// obvious from a distance, rather than needing an artificial visibility
// system. Muted colours, not a bright "look at me" marker colour.
function buildMissingPersonTarget(){
  var g = new THREE.Group();
  var clothMat = new THREE.MeshStandardMaterial({ color:0x4a5a48, roughness:0.85 }); // muted olive/khaki, not attention-grabbing
  var skinMat = new THREE.MeshStandardMaterial({ color:0xc9a084, roughness:0.8 });
  var legs = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.9, 8), clothMat);
  legs.position.y = 0.45;
  g.add(legs);
  var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.7, 8), clothMat);
  torso.position.y = 1.25;
  g.add(torso);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), skinMat);
  head.position.y = 1.72;
  g.add(head);
  [-0.22, 0.22].forEach(function(xOff){
    var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), clothMat);
    arm.position.set(xOff, 1.25, 0);
    arm.rotation.z = xOff > 0 ? -0.2 : 0.2;
    g.add(arm);
  });
  g.position.set(RESCUE_TARGET_POS.x, 0, RESCUE_TARGET_POS.z);
  scene.add(g);
  return g;
}

// Subtle post-detection confirmation (Part 9) — a small ground ring, not
// an oversized glowing object.
function showTargetHighlight(){
  if(rescueTargetHighlightGroup) return; // never duplicate
  var g = new THREE.Group();
  var ringMat = new THREE.MeshBasicMaterial({ color:0x3dffa0, transparent:true, opacity:0.7, side:THREE.DoubleSide });
  var ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24), ringMat);
  ring.rotation.x = -Math.PI/2; ring.position.set(RESCUE_TARGET_POS.x, 0.03, RESCUE_TARGET_POS.z);
  g.add(ring);
  var beaconMat = new THREE.MeshStandardMaterial({ color:0x3dffa0, emissive:0x3dffa0, emissiveIntensity:0.5, roughness:0.4 });
  var beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2, 6), beaconMat);
  beacon.position.set(RESCUE_TARGET_POS.x, 1.9, RESCUE_TARGET_POS.z);
  g.add(beacon);
  scene.add(g);
  rescueTargetHighlightGroup = g;
}

// Phase 9.4C, Part 6: subtle visual confirmation once identified — recolours
// the existing highlight (ring is children[0], beacon is children[1], by
// Phase 9.4D: lightweight base marker — same ring+beacon+sign pattern as
// Phase 9.4E: a small mission-gated "LANDING ZONE" label near the EXISTING
// pad at origin — reused directly, not duplicated (Part 2). Created only
// while a mission needs it, destroyed on reset, so Free Flight/other modes
// never see a rescue-specific label near their normal takeoff pad.
var rescueLandingLabelGroup = null;
function buildLandingZoneLabel(){
  var sign = makeSignSprite('LANDING ZONE', '#00e5ff');
  sign.scale.set(2.0, 0.46, 1);
  sign.position.set(0, 3.4, 3.2);
  scene.add(sign);
  return sign;
}

// the search-area/target markers, reused rather than inventing a new
// visual language. No particle effects, no excessive glow (Part 8).
function buildRescueBaseMarker(){
  var g = new THREE.Group();
  var ringMat = new THREE.MeshBasicMaterial({ color:0x00e5ff, transparent:true, opacity:0.55, side:THREE.DoubleSide });
  var ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.7, 32), ringMat);
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.03;
  g.add(ring);
  var beaconMat = new THREE.MeshStandardMaterial({ color:0x00e5ff, emissive:0x00e5ff, emissiveIntensity:0.5, roughness:0.4 });
  var beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 8), beaconMat);
  beacon.position.y = 2;
  g.add(beacon);
  var sign = makeSignSprite('RESCUE BASE', '#00e5ff');
  sign.scale.set(2.0, 0.46, 1);
  sign.position.set(0, 4.6, 0);
  g.add(sign);
  g.position.set(RESCUE_BASE_MARKER_POS.x, 0, RESCUE_BASE_MARKER_POS.z);
  scene.add(g);
  return g;
}

// the creation order above) rather than adding a new glowing effect, plus
// one small text sprite. No new geometry systems, no particle effects.
function markTargetAsIdentified(){
  if(!rescueTargetHighlightGroup) return;
  var ring = rescueTargetHighlightGroup.children[0];
  var beacon = rescueTargetHighlightGroup.children[1];
  ring.material.color.setHex(0x00e5ff);
  beacon.material.color.setHex(0x00e5ff);
  beacon.material.emissive.setHex(0x00e5ff);
  var sign = makeSignSprite('IDENTIFIED', '#00e5ff');
  sign.scale.set(1.6, 0.4, 1);
  sign.position.set(0, 2.6, 0); // local to the group, which is already positioned at the target
  rescueTargetHighlightGroup.add(sign);
}

// Phase 9.4C, Part 5: renders the 4-item mission checklist from the SAME
// state fields the rest of the mission already tracks — no parallel state.
function renderRescueMissionChecklist(){
  var items = [
    ['Search Area Active', RESCUE_STATE.searchZoneStatus !== 'pending'],
    ['Target Detected', RESCUE_STATE.targetStatus === 'detected' || RESCUE_STATE.targetStatus === 'identified'],
    ['Target Identified', RESCUE_STATE.targetStatus === 'identified'],
    ['Location Recorded', RESCUE_STATE.targetLocation !== null]
  ];
  document.getElementById('rmhChecklist').innerHTML = items.map(function(it){
    var done = it[1];
    return '<div class="rmhCheckItem'+(done?' done':'')+'"><span class="rmhCheckMark">'+(done?'✓':'○')+'</span>'+it[0]+'</div>';
  }).join('');
}

// Phase 9.4C, Part 2/7: the actual identify action. Only takes effect when
// the target has been detected AND the drone is currently within range —
// re-checked live here (not just "was ever detected") so flying away and
// pressing the key does nothing, per Part 7's explicit test case.
function identifyTarget(){
  if(RESCUE_STATE.targetStatus !== 'detected') return;
  var dist = Math.hypot(flight.pos.x - RESCUE_TARGET_POS.x, flight.pos.z - RESCUE_TARGET_POS.z);
  if(dist > RESCUE_TARGET_DETECTION_RADIUS) return; // Part 7: too far — silently ineligible, matching the prompt's own visibility rule
  RESCUE_STATE.targetStatus = 'identified';
  RESCUE_STATE.targetLocation = { x: Math.round(RESCUE_TARGET_POS.x), y: 0, z: Math.round(RESCUE_TARGET_POS.z) }; // Part 4: the target's own recorded location, not the drone's
  document.getElementById('rmhIdentifyPrompt').style.display = 'none';
  document.getElementById('rmhObjective').textContent = 'Target identified. Location recorded.';
  document.getElementById('rmhStatus').textContent = 'LOCATION RECORDED';
  document.getElementById('rmhStatus').className = 'reached';
  document.getElementById('rmhLocationCoords').textContent =
    'X: '+RESCUE_STATE.targetLocation.x+'   Y: '+RESCUE_STATE.targetLocation.y+'   Z: '+RESCUE_STATE.targetLocation.z;
  document.getElementById('rmhLocationBlock').style.display = 'block';
  renderRescueMissionChecklist();
  markTargetAsIdentified();
  showToast('TARGET IDENTIFIED', 'Missing person location recorded.', '✅');
  // Phase 9.4D: per the brief's own flow diagram, LOCATION RECORDED flows
  // straight into RETURN TO BASE — the player is not required to press
  // anything further to begin the return leg, only to fly there themselves.
  RESCUE_STATE.returnStatus = 'returning';
  RESCUE_STATE.objectives = ['Return to base'];
  document.getElementById('rmhObjective').textContent = 'Return to base.';
  document.getElementById('rmhStatus').textContent = 'RETURNING TO BASE';
  if(!rescueBaseMarkerGroup) rescueBaseMarkerGroup = buildRescueBaseMarker();
  document.getElementById('rmhBaseNav').style.display = 'block';
  // Explicitly stops after arrival tracking begins (Part 16) — landing and
  // mission completion do not exist yet. Mission stays active at stage 1.
}
// Discrete, edge-triggered action (not a per-frame axis) — 'KeyF' chosen
// deliberately over the brief's suggested 'E', which this simulator already
// binds to yaw-right (see getAxis('KeyQ','KeyE',...) in the flight controls).
// 'F' is free and is the conventional "interact" key in most games.
window.addEventListener('keydown', function(e){
  if(e.code === 'KeyF' && RESCUE_STATE.active && RESCUE_STATE.stage === 1) identifyTarget();
});

var RESCUE_SEARCH_AREA = FOREST_CLEARINGS[0]; // reuses the Forest's own central clearing, reserved since Phase 9.3B specifically for this

function buildRescueMissionMarker(){
  var g = new THREE.Group();
  var ringMat = new THREE.MeshBasicMaterial({ color:0xff4d5e, transparent:true, opacity:0.5, side:THREE.DoubleSide });
  var ring = new THREE.Mesh(new THREE.RingGeometry(RESCUE_SEARCH_AREA.r-0.3, RESCUE_SEARCH_AREA.r, 40), ringMat);
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.03;
  g.add(ring);
  var beaconMat = new THREE.MeshStandardMaterial({ color:0xff4d5e, emissive:0xff4d5e, emissiveIntensity:0.6, roughness:0.4 });
  var beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 10), beaconMat);
  beacon.position.y = 3;
  g.add(beacon);
  var cap = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), beaconMat);
  cap.position.y = 6;
  g.add(cap);
  var sign = makeSignSprite('SEARCH AREA', '#ff4d5e');
  sign.scale.set(2.2, 0.5, 1);
  sign.position.set(0, 7.2, 0);
  g.add(sign);
  g.position.set(RESCUE_SEARCH_AREA.x, 0, RESCUE_SEARCH_AREA.z);
  scene.add(g);
  return g;
}

function startRescueMissionStage1(){
  RESCUE_STATE.active = true; // Part 5: ACTIVE_MISSION, now genuinely reachable
  RESCUE_STATE.status = RESCUE_STATES.ACTIVE_MISSION;
  RESCUE_STATE.stage = 1; // STAGE 1 — Navigate to Search Area
  RESCUE_STATE.searchZoneStatus = 'pending';
  RESCUE_STATE.targetStatus = 'unknown'; // Phase 9.4B: defensive reset, even though the mission list is inaccessible while a mission is already active (so this path is always reached via a clean exit first)
  RESCUE_STATE.targetLocation = null; // Phase 9.4C: clear any previously recorded location
  RESCUE_STATE.returnStatus = 'not_started'; // Phase 9.4D: defensive reset, same reasoning as targetStatus above
  RESCUE_STATE.objectives = ['Launch and navigate to the search area'];
  // Phase 9.4F: reset every scoring-related field so a fresh mission never
  // inherits a previous attempt's collisions/distance/score.
  RESCUE_STATE.collisionCount = 0;
  RESCUE_STATE.missionStartTime = performance.now() / 1000;
  RESCUE_STATE.returnDistanceTraveled = 0;
  RESCUE_STATE.lastReturnPos = null;
  RESCUE_STATE.scoreBreakdown = null;
  RESCUE_STATE.score = 0;
  RESCUE_STATE.grade = '';
  RESCUE_STATE.xpAwarded = 0;
  RESCUE_STATE.landingComplete = false;
  RESCUE_STATE.safeReturn = false;
  RESCUE_STATE.timeElapsed = 0;

  // Predictable start (Part 11: the existing drone/flight system, the
  // existing shared-world launch area) — same reset fields Reset/every
  // mission already uses.
  flight.pos.set(0, 0.03, 0);
  flight.vel.set(0,0,0);
  flight.pitch=0; flight.roll=0; flight.yaw=0; flight.throttle=0; flight.targetThrottle=0;
  autopilot=null; autoHoverOn=false;

  if(!rescueMissionMarkerGroup) rescueMissionMarkerGroup = buildRescueMissionMarker();

  document.getElementById('rescuePrepOverlay').classList.remove('show');
  rescuePanel.classList.remove('show');
  document.getElementById('rmhTitle').textContent = 'Forest Search & Rescue';
  document.getElementById('rmhObjective').textContent = 'Launch and navigate to the search area.';
  document.getElementById('rmhStatus').textContent = 'MISSION ACTIVE';
  document.getElementById('rmhStatus').className = '';
  document.getElementById('rmhIdentifyPrompt').style.display = 'none'; // Phase 9.4C: defensive reset
  document.getElementById('rmhLocationBlock').style.display = 'none'; // Phase 9.4C: defensive reset
  document.getElementById('rmhBaseNav').style.display = 'none'; // Phase 9.4D: defensive reset
  document.getElementById('rmhLandingBlock').style.display = 'none'; // Phase 9.4E: defensive reset
  document.getElementById('rmhCompleteBlock').style.display = 'none'; // Phase 9.4E: defensive reset
  renderRescueMissionChecklist(); // Phase 9.4C: all items unchecked at mission start
  document.getElementById('rescueMissionHud').classList.add('show');
  showToast('MISSION STARTED', 'Navigate toward the search area in the forest.', '🚨');
}

function updateRescueMission(dt){
  // Only the currently active stage is evaluated — Part 13's performance
  // requirement — and only one lightweight distance check per state, no
  // pathfinding, no per-frame cost while inactive.
  if(!RESCUE_STATE.active || RESCUE_STATE.stage !== 1) return;
  var dist = Math.hypot(flight.pos.x - RESCUE_SEARCH_AREA.x, flight.pos.z - RESCUE_SEARCH_AREA.z);
  if(dist < RESCUE_SEARCH_AREA.r && RESCUE_STATE.searchZoneStatus !== 'reached'){
    RESCUE_STATE.searchZoneStatus = 'reached';
    RESCUE_STATE.targetStatus = 'searching'; // Phase 9.4B: Part 4 — target detection only becomes possible from this point on
    RESCUE_STATE.timeElapsed = (performance.now()/1000) - RESCUE_STATE.missionStartTime; // Phase 9.4F: time-to-reach-search-area, used as a minor efficiency factor, never a dominant one
    document.getElementById('rmhObjective').textContent = 'Search the area and locate the missing person.';
    document.getElementById('rmhStatus').textContent = 'SEARCH ACTIVE';
    document.getElementById('rmhStatus').className = 'reached';
    showToast('SEARCH AREA REACHED', 'Search the area and locate the missing person.', '🚨');
    if(!rescueTargetGroup) rescueTargetGroup = buildMissingPersonTarget();
    renderRescueMissionChecklist();
  }
  // Phase 9.4B: target detection — gated strictly behind reaching the
  // search area first (Part 4). Before that, this branch never runs at all.
  if(RESCUE_STATE.targetStatus === 'searching'){
    var targetDist = Math.hypot(flight.pos.x - RESCUE_TARGET_POS.x, flight.pos.z - RESCUE_TARGET_POS.z);
    if(targetDist < RESCUE_TARGET_DETECTION_RADIUS){
      RESCUE_STATE.targetStatus = 'detected';
      document.getElementById('rmhObjective').textContent = 'Approach the target and identify it.';
      document.getElementById('rmhStatus').textContent = 'TARGET DETECTED';
      document.getElementById('rmhStatus').className = 'reached';
      showToast('🔍 TARGET DETECTED', 'Missing person located. Approach to identify.', '🔍');
      showTargetHighlight();
      renderRescueMissionChecklist();
    }
  }
  // Phase 9.4C, Part 2/7: while detected-but-not-yet-identified, show or
  // hide the "IDENTIFY TARGET" prompt based on the drone's LIVE distance —
  // one cheap check, gated to only this narrow window of the mission.
  if(RESCUE_STATE.targetStatus === 'detected'){
    var idDist = Math.hypot(flight.pos.x - RESCUE_TARGET_POS.x, flight.pos.z - RESCUE_TARGET_POS.z);
    document.getElementById('rmhIdentifyPrompt').style.display = (idDist <= RESCUE_TARGET_DETECTION_RADIUS) ? 'block' : 'none';
  }
  // Phase 9.4D, Part 5/6: return-to-base guidance — gated strictly behind
  // RETURNING_TO_BASE, one cheap distance check per frame, no pathfinding,
  // no auto-navigation (Part 15) — this only ever reads position, never
  // writes to flight.pos/vel/pitch/roll/yaw/throttle.
  if(RESCUE_STATE.returnStatus === 'returning'){
    // Phase 9.4F: lightweight running-total of actual distance flown during
    // the return leg — one hypot() per frame, purely additive, used only
    // to compute a path-efficiency ratio at mission-complete time. Never
    // reads or writes flight.vel/pitch/roll/throttle.
    if(RESCUE_STATE.lastReturnPos){
      RESCUE_STATE.returnDistanceTraveled += Math.hypot(flight.pos.x - RESCUE_STATE.lastReturnPos.x, flight.pos.z - RESCUE_STATE.lastReturnPos.z);
    }
    RESCUE_STATE.lastReturnPos = { x: flight.pos.x, z: flight.pos.z };
    var baseDist = Math.hypot(flight.pos.x - RESCUE_BASE_POS.x, flight.pos.z - RESCUE_BASE_POS.z);
    var distEl = document.getElementById('rmhBaseDistance');
    distEl.textContent = Math.round(baseDist) + ' m';
    distEl.className = baseDist <= RESCUE_BASE_ARRIVAL_RADIUS ? 'close' : '';
    if(baseDist <= RESCUE_BASE_ARRIVAL_RADIUS){
      RESCUE_STATE.returnStatus = 'at_base';
      document.getElementById('rmhObjective').textContent = 'Base reached. Prepare for landing.';
      document.getElementById('rmhStatus').textContent = 'AT BASE';
      document.getElementById('rmhStatus').className = 'reached';
      showToast('BASE REACHED', 'Target location successfully recorded. Prepare for landing.', '🚨');
      // Phase 9.4E: immediately opens the landing requirement — the brief's
      // own state diagram shows these as directly sequential, with no
      // separate player action needed to "start" needing to land.
      RESCUE_STATE.returnStatus = 'landing_required';
      document.getElementById('rmhObjective').textContent = 'Land at the rescue base.';
      document.getElementById('rmhStatus').textContent = 'LANDING REQUIRED';
      if(!rescueLandingLabelGroup) rescueLandingLabelGroup = buildLandingZoneLabel();
      document.getElementById('rmhLandingBlock').style.display = 'block';
    }
  }
  // Phase 9.4E, Part 4-8: manual landing detection. Purely a read of the
  // EXISTING flight state (pos/vel/pitch/roll) — never writes to any of
  // them (Part 12: no physics rewrite, no auto-landing, no teleporting).
  if(RESCUE_STATE.returnStatus === 'landing_required'){
    var hDist = Math.hypot(flight.pos.x - RESCUE_BASE_POS.x, flight.pos.z - RESCUE_BASE_POS.z);
    var hSpeed = Math.hypot(flight.vel.x, flight.vel.z);
    var okPos = hDist <= RESCUE_LANDING_RADIUS;
    var okAlt = flight.pos.y <= RESCUE_LANDING_MAX_ALT;
    var okSpeed = Math.abs(flight.vel.y) <= RESCUE_LANDING_MAX_VSPEED && hSpeed <= RESCUE_LANDING_MAX_HSPEED;
    var okTilt = Math.abs(flight.pitch) <= RESCUE_LANDING_MAX_TILT && Math.abs(flight.roll) <= RESCUE_LANDING_MAX_TILT;

    function setRow(id, ok, badText){
      var el = document.getElementById(id);
      el.textContent = ok ? '✓' : badText;
      el.className = ok ? 'rmhLandGood' : 'rmhLandBad';
    }
    setRow('rmhLandPos', okPos, 'MOVE CLOSER');
    setRow('rmhLandAlt', okAlt, 'DESCEND');
    setRow('rmhLandSpeed', okSpeed, 'SLOW DOWN');
    setRow('rmhLandTilt', okTilt, 'LEVEL DRONE');

    var zoneLabel = document.getElementById('rmhLandingZoneLabel');
    if(!okPos) zoneLabel.textContent = 'LANDING ZONE';
    else if(!(okAlt && okSpeed && okTilt)) zoneLabel.textContent = 'ALIGN WITH LANDING ZONE';
    else zoneLabel.textContent = 'READY TO LAND';

    if(okPos && okAlt && okSpeed && okTilt) completeRescueMission({ hDist:hDist, alt:flight.pos.y, hSpeed:hSpeed, vSpeed:Math.abs(flight.vel.y), tilt:Math.max(Math.abs(flight.pitch), Math.abs(flight.roll)) });
  }
}

// Phase 9.4F, Part 2-9: computes the 6-category breakdown from metrics the
// existing mission ALREADY produces (time-to-detect, path efficiency,
// landing precision margins, collision count) — no new "wrong answer"
// mechanic was added to the mission itself (Part 26 forbids that), so
// Identification and Coordinates are awarded in full once that (already
// only-ever-successful) step completes; this is stated plainly in the
// feedback text rather than implied.
var RESCUE_TARGET_TO_BASE_DIST = Math.hypot(RESCUE_TARGET_POS.x - RESCUE_BASE_POS.x, RESCUE_TARGET_POS.z - RESCUE_BASE_POS.z);
function computeRescueScore(landingMetrics){
  var breakdown = {};

  // Target Detection — 20 pts, based on how long it took to reach the
  // search area at all. Lenient: only drops below full marks past a full
  // minute, and never below 15 (Part 4: don't punish exploration).
  var t = RESCUE_STATE.timeElapsed;
  breakdown.detection = { max:20, points: t <= 60 ? 20 : Math.max(15, 20 - Math.floor((t-60)/12)),
    label:'Target Detection' };

  // Identification / Coordinates — 20 pts each. Honest about what's being
  // measured: the current mission has no incorrect-target or inaccurate-
  // coordinate path (Part 26 forbids adding one), so completing this step
  // — which only ever happens on a correct identification against the
  // real target — earns full marks.
  breakdown.identification = { max:20, points:20, label:'Identification' };
  breakdown.coordinates = { max:20, points:20, label:'Coordinates' };

  // Return to Base — 15 pts, scaled by path directness. Floored at 60% so
  // a wandering-but-successful return still earns a reasonable score.
  var efficiency = RESCUE_STATE.returnDistanceTraveled > 0
    ? Math.min(1, RESCUE_TARGET_TO_BASE_DIST / Math.max(RESCUE_TARGET_TO_BASE_DIST, RESCUE_STATE.returnDistanceTraveled))
    : 1;
  breakdown.returnToBase = { max:15, points: Math.round(15 * Math.max(0.6, efficiency)), label:'Return to Base' };

  // Landing — 15 pts, scaled by how comfortably each threshold was beaten
  // (closer to the centre/slower/level = better), floored at 60% since
  // passing the existing strict thresholds at all already means a safe
  // landing occurred.
  var posQ = 1 - (landingMetrics.hDist / RESCUE_LANDING_RADIUS);
  var altQ = 1 - (landingMetrics.alt / RESCUE_LANDING_MAX_ALT);
  var spdQ = 1 - (Math.max(landingMetrics.hSpeed / RESCUE_LANDING_MAX_HSPEED, landingMetrics.vSpeed / RESCUE_LANDING_MAX_VSPEED));
  var tiltQ = 1 - (landingMetrics.tilt / RESCUE_LANDING_MAX_TILT);
  var landingQuality = Math.max(0, Math.min(1, (posQ + altQ + spdQ + tiltQ) / 4));
  breakdown.landing = { max:15, points: Math.round(15 * (0.6 + 0.4 * landingQuality)), label:'Landing' };

  // Flight Safety — 10 pts, -3 per collision during the mission, floored
  // at 0 (Part 10: never let the total go negative).
  breakdown.safety = { max:10, points: Math.max(0, 10 - RESCUE_STATE.collisionCount * 3), label:'Flight Safety' };

  var total = 0;
  Object.keys(breakdown).forEach(function(k){ total += breakdown[k].points; });
  total = Math.max(0, Math.min(100, total));

  var grade = total >= 90 ? 'EXCELLENT' : total >= 80 ? 'VERY GOOD' : total >= 70 ? 'GOOD' : total >= 60 ? 'SATISFACTORY' : 'NEEDS IMPROVEMENT';

  // Data-driven feedback (Part 13/14) — every line maps directly to an
  // actual sub-score, never generic or randomized.
  var didWell = [], toImprove = [];
  if(breakdown.detection.points >= 18) didWell.push('Efficient search — you reached the area quickly.');
  else toImprove.push('Try to reach the search area more quickly next time.');
  didWell.push('Correctly identified the missing person and recorded their location.');
  if(breakdown.returnToBase.points >= 13) didWell.push('Direct, efficient return to base.');
  else toImprove.push('Fly a more direct path back to base to improve your return score.');
  if(breakdown.landing.points >= 13) didWell.push('Precise, well-controlled landing.');
  else toImprove.push('Slow down, level the drone, and centre more precisely over the pad before landing.');
  if(breakdown.safety.points === 10) didWell.push('No obstacle collisions — excellent flight safety.');
  else toImprove.push('Avoid obstacles more carefully during future flights.');

  var nextStep = total >= 90 ? 'Ready for the next mission when it becomes available.'
    : breakdown.safety.points < 10 ? 'Review Flight Safety before your next attempt.'
    : breakdown.landing.points < 12 ? 'Practice landings in Free Flight to sharpen your approach.'
    : 'Retry this mission to improve your best score.';

  return { breakdown:breakdown, total:total, grade:grade, didWell:didWell, toImprove:toImprove, nextStep:nextStep };
}

// Phase 9.4E, Part 8/9: all four conditions were true simultaneously —
// the drone stays exactly where the player landed it (no teleport, no
// reset). Mission stays RESCUE_STATE.active = true so the player remains
// in control and the exit/restart option stays available (Part 10/11),
// but returnStatus is left at 'landing_required' rather than advanced
// further, so this block cannot fire again on a later frame.
function completeRescueMission(landingMetrics){
  if(RESCUE_STATE.status === RESCUE_STATES.MISSION_COMPLETE) return; // never re-trigger
  RESCUE_STATE.status = RESCUE_STATES.MISSION_COMPLETE;
  RESCUE_STATE.landingComplete = true;
  RESCUE_STATE.safeReturn = true;
  document.getElementById('rmhLandingBlock').style.display = 'none';
  if(rescueLandingLabelGroup){ scene.remove(rescueLandingLabelGroup); rescueLandingLabelGroup = null; }
  document.getElementById('rmhObjective').textContent = 'Rescue operation completed.';
  document.getElementById('rmhStatus').textContent = 'MISSION COMPLETE';
  document.getElementById('rmhStatus').className = 'reached';

  var result = computeRescueScore(landingMetrics);
  RESCUE_STATE.score = result.total;
  RESCUE_STATE.grade = result.grade;
  RESCUE_STATE.scoreBreakdown = result.breakdown;
  var xpAwarded = saveRescueResult(RESCUE_STATE.selectedMission, result.total, result.grade);
  RESCUE_STATE.xpAwarded = xpAwarded;

  document.getElementById('rmhCompleteChecklist').innerHTML = [
    'Target Detected', 'Target Identified', 'Location Recorded', 'Returned to Base', 'Successful Landing'
  ].map(function(t){ return '<div class="rmhCheckItem done"><span class="rmhCheckMark">✓</span>'+t+'</div>'; }).join('');

  document.getElementById('rmhScoreValue').textContent = result.total + ' / 100';
  document.getElementById('rmhGradeValue').textContent = result.grade;
  document.getElementById('rmhGradeValue').className = 'rmhGrade-' + result.grade.replace(/\s+/g,'').toLowerCase();
  document.getElementById('rmhScoreBreakdown').innerHTML = Object.keys(result.breakdown).map(function(k){
    var b = result.breakdown[k];
    return '<div class="rmhScoreRow"><span>'+b.label+'</span><span>'+b.points+' / '+b.max+'</span></div>';
  }).join('');
  document.getElementById('rmhXpEarned').textContent = xpAwarded > 0 ? ('+' + xpAwarded + ' XP') : '+0 XP (no new best this run)';
  document.getElementById('rmhDidWell').innerHTML = result.didWell.map(function(t){ return '<li>'+t+'</li>'; }).join('');
  document.getElementById('rmhToImprove').innerHTML = result.toImprove.length ? result.toImprove.map(function(t){ return '<li>'+t+'</li>'; }).join('') : '<li>No major issues — great work.</li>';
  document.getElementById('rmhNextStep').textContent = result.nextStep;

  document.getElementById('rmhCompleteBlock').style.display = 'block';
  showToast('🚁 MISSION COMPLETE', 'Score: ' + result.total + '/100 — ' + result.grade, '✅');
}

function exitRescueMission(){
  if(!RESCUE_STATE.active) return;
  RESCUE_STATE.active = false;
  RESCUE_STATE.status = RESCUE_STATES.READY;
  RESCUE_STATE.stage = 0;
  RESCUE_STATE.searchZoneStatus = 'unknown';
  RESCUE_STATE.targetStatus = 'unknown'; // Phase 9.4B: Part 14 — detection state must reset
  RESCUE_STATE.targetLocation = null; // Phase 9.4C: recorded location must reset (Part 9)
  RESCUE_STATE.returnStatus = 'not_started'; // Phase 9.4D: Part 17 — return-to-base state must reset
  if(rescueMissionMarkerGroup){ scene.remove(rescueMissionMarkerGroup); rescueMissionMarkerGroup = null; } // genuinely destroyed, per Part 6/10
  if(rescueTargetGroup){ scene.remove(rescueTargetGroup); rescueTargetGroup = null; } // Phase 9.4B: target removed correctly (Part 14)
  if(rescueTargetHighlightGroup){ scene.remove(rescueTargetHighlightGroup); rescueTargetHighlightGroup = null; } // Phase 9.4B: highlight must disappear (Part 14)
  if(rescueBaseMarkerGroup){ scene.remove(rescueBaseMarkerGroup); rescueBaseMarkerGroup = null; } // Phase 9.4D: Part 17 — base marker state must reset
  if(rescueLandingLabelGroup){ scene.remove(rescueLandingLabelGroup); rescueLandingLabelGroup = null; } // Phase 9.4E: Part 11 — landing state must reset
  document.getElementById('rmhIdentifyPrompt').style.display = 'none'; // Phase 9.4C
  document.getElementById('rmhLocationBlock').style.display = 'none'; // Phase 9.4C
  document.getElementById('rmhBaseNav').style.display = 'none'; // Phase 9.4D
  document.getElementById('rmhLandingBlock').style.display = 'none'; // Phase 9.4E
  document.getElementById('rmhCompleteBlock').style.display = 'none'; // Phase 9.4E: Part 11 — completion state must reset
  document.getElementById('rescueMissionHud').classList.remove('show');
}
document.getElementById('rmhExitBtn').addEventListener('click', function(){
  exitRescueMission();
  renderRescuePanel();
  rescuePanel.classList.add('show');
});
document.getElementById('rmhDashboardBtn').addEventListener('click', function(){
  // Same behavior as the existing Exit button (Part 20) — a clean,
  // already-proven exit path, just reachable from the result screen too.
  exitRescueMission();
  renderRescuePanel();
  rescuePanel.classList.add('show');
});
document.getElementById('rmhRetryBtn').addEventListener('click', function(){
  // Part 20: a fast retry loop straight back into the same mission —
  // reuses the exact same clean-reset path as Exit, then immediately
  // restarts, rather than duplicating any reset logic here.
  var missionId = RESCUE_STATE.selectedMission;
  exitRescueMission();
  RESCUE_STATE.selectedMission = missionId;
  startRescueMissionStage1();
});

/* ============================================================
   RESCUE ENVIRONMENT FOUNDATION (Phase 9.3A)
   A genuinely independent environment, spatially separated from
   the Flight Academy area by a large world-space offset (not a
   visibility hack layered on the same coordinates) — this means
   the two environments can never overlap or bleed into each
   other's view even if something were to go wrong with a
   visibility flag. Built lazily (once, on first use — "begins
   preparing for Mission 01"), then reused via a group visibility
   toggle on every later entry/exit, never rebuilt. No new
   collision volumes this phase, per Part 9 — the base area stays
   clear and safe deliberately.
============================================================ */
var RESCUE_ORIGIN = { x: 500, z: 0 }; // far enough that camera.far (400) + fog (170 far) guarantee zero visibility from the Flight Academy area
var RESCUE_GROUND_RADIUS = 90; // moderately larger than the Flight Academy's 60 — Part 2
var rescueEnvGroup = null; // created on first enterRescueEnvironment() call, then reused
var rescueEnvironmentActive = false;

function buildRescueEnvironment(){
  if(rescueEnvGroup) return; // build once, per Part 1 — never rebuilt on later entries
  var g = new THREE.Group();
  var ox = RESCUE_ORIGIN.x, oz = RESCUE_ORIGIN.z;

  // --- terrain foundation (Part 3): flat ground + one subtle rise near the
  // future forest zone, reusing the exact same primitive-based approach as
  // the Flight Academy ground — no heightmaps, no heavy textures.
  var groundMat = new THREE.MeshStandardMaterial({ color:0x172a20, roughness:0.92, metalness:0.05 }); // slightly greener tone than the Flight Academy's grey-blue, hinting at the forest direction without building it yet
  var ground = new THREE.Mesh(new THREE.CircleGeometry(RESCUE_GROUND_RADIUS, 56), groundMat);
  ground.rotation.x = -Math.PI/2; ground.position.set(ox, 0, oz);
  ground.receiveShadow = true;
  g.add(ground);
  var grid = new THREE.GridHelper(RESCUE_GROUND_RADIUS*2, 36, 0x2f6f4a, 0x18301f);
  grid.material.transparent = true; grid.material.opacity = 0.35;
  grid.position.set(ox, 0.01, oz);
  g.add(grid);
  // one subtle, cheap terrain rise near the future forest zone (Part 3: "minor terrain variation where useful")
  var moundMat = new THREE.MeshStandardMaterial({ color:0x1c3524, roughness:0.95 });
  var mound = new THREE.Mesh(new THREE.CylinderGeometry(16, 22, 1.4, 20), moundMat);
  mound.position.set(ox - 40, 0.5, oz + 30);
  g.add(mound);

  // --- Zone A: DRONOVA RESCUE BASE (Part 4) ---
  var padMat = new THREE.MeshStandardMaterial({ color:0x1a2e28, emissive:0xff4d5e, emissiveIntensity:0.1, roughness:0.6 });
  var pad = new THREE.Mesh(new THREE.CircleGeometry(3, 40), padMat);
  pad.rotation.x = -Math.PI/2; pad.position.set(ox, 0.02, oz);
  g.add(pad);
  var padRingGeo = new THREE.RingGeometry(2.8, 3, 40);
  var padRing = new THREE.Mesh(padRingGeo, new THREE.MeshBasicMaterial({ color:0xff4d5e, side:THREE.DoubleSide }));
  padRing.rotation.x = -Math.PI/2; padRing.position.set(ox, 0.03, oz);
  g.add(padRing);
  var baseBoundary = new THREE.Mesh(new THREE.RingGeometry(7.7, 8, 40), new THREE.MeshBasicMaterial({ color:0xff4d5e, transparent:true, opacity:0.4, side:THREE.DoubleSide }));
  baseBoundary.rotation.x = -Math.PI/2; baseBoundary.position.set(ox, 0.02, oz);
  g.add(baseBoundary);
  var baseTintGeo = new THREE.CircleGeometry(8, 36);
  var baseTint = new THREE.Mesh(baseTintGeo, new THREE.MeshBasicMaterial({ color:0xff4d5e, transparent:true, opacity:0.04, side:THREE.DoubleSide }));
  baseTint.rotation.x = -Math.PI/2; baseTint.position.set(ox, 0.008, oz);
  g.add(baseTint);
  // equipment area (reuses the same crate helper built for the Flight Academy hangar)
  var crateGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  var crateMat = new THREE.MeshStandardMaterial({ color:0x2f3a2f, roughness:0.75, metalness:0.1 });
  [[4.5,-4.5],[5.1,-4.1],[4.5,-3.3]].forEach(function(p){
    var crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.set(ox+p[0], 0.35, oz+p[1]);
    g.add(crate);
  });
  var sign = makeSignSprite('DRONOVA RESCUE OPERATIONS BASE', '#ff4d5e');
  sign.position.set(ox + 5, 2.4, oz + 5);
  g.add(sign);

  // --- roads / pathways (Part 5) — main access road + one secondary path + a simple junction ---
  var roadMat = new THREE.MeshBasicMaterial({ color:0x3a4048, transparent:true, opacity:0.85, side:THREE.DoubleSide });
  var mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 24), roadMat);
  mainRoad.rotation.x = -Math.PI/2; mainRoad.rotation.z = Math.PI/2;
  mainRoad.position.set(ox + 18, 0.012, oz);
  g.add(mainRoad);
  var secondaryRoad = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 20), roadMat);
  secondaryRoad.rotation.x = -Math.PI/2; secondaryRoad.rotation.z = Math.PI/4;
  secondaryRoad.position.set(ox + 38, 0.012, oz + 12);
  g.add(secondaryRoad);
  var laneLineMat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.25 });
  var laneLine = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 22), laneLineMat);
  laneLine.rotation.x = -Math.PI/2; laneLine.rotation.z = Math.PI/2;
  laneLine.position.set(ox + 18, 0.015, oz);
  g.add(laneLine);

  // --- Zone B: TRAINING / CAMPUS AREA (placeholder — Part 6) ---
  var zoneBTint = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color:0x00e5ff, transparent:true, opacity:0.035, side:THREE.DoubleSide }));
  zoneBTint.rotation.x = -Math.PI/2; zoneBTint.position.set(ox+30, 0.008, oz);
  g.add(zoneBTint);
  var zoneBSign = makeSignSprite('TRAINING CAMPUS AREA — COMING SOON', '#00e5ff');
  zoneBSign.scale.set(4.4, 1, 1);
  zoneBSign.position.set(ox+30, 2.2, oz);
  g.add(zoneBSign);

  // --- Zone C: CITY / INFRASTRUCTURE AREA (placeholder — Part 6) ---
  var zoneCTint = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ color:0xffb200, transparent:true, opacity:0.035, side:THREE.DoubleSide }));
  zoneCTint.rotation.x = -Math.PI/2; zoneCTint.position.set(ox+55, 0.008, oz+25);
  g.add(zoneCTint);
  var zoneCSign = makeSignSprite('CITY / INFRASTRUCTURE AREA — COMING SOON', '#ffb200');
  zoneCSign.scale.set(4.6, 1, 1);
  zoneCSign.position.set(ox+55, 2.2, oz+25);
  g.add(zoneCSign);

  // --- Zone D: FOREST RESCUE AREA (placeholder — Part 6) ---
  var zoneDTint = new THREE.Mesh(new THREE.CircleGeometry(20, 32), new THREE.MeshBasicMaterial({ color:0x2a6b42, transparent:true, opacity:0.05, side:THREE.DoubleSide }));
  zoneDTint.rotation.x = -Math.PI/2; zoneDTint.position.set(ox-40, 0.008, oz+30);
  g.add(zoneDTint);
  var zoneDSign = makeSignSprite('FOREST RESCUE AREA — COMING SOON', '#2a6b42');
  zoneDSign.scale.set(4.2, 1, 1);
  zoneDSign.position.set(ox-40, 2.2, oz+30);
  g.add(zoneDSign);

  // --- soft boundary markers (Part 7): sparse lighting-pole-style posts,
  // deliberately NOT a glowing ring, around the rescue ground's edge.
  (function(){
    var poleGeo = new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6);
    var poleMat = new THREE.MeshStandardMaterial({ color:0x2c3f4e, roughness:0.75 });
    var capGeo = new THREE.SphereGeometry(0.12, 8, 8);
    var capMat = new THREE.MeshStandardMaterial({ color:0xffb2a0, emissive:0xff6a52, emissiveIntensity:0.4, roughness:0.4 });
    var count = 10;
    var poles = new THREE.InstancedMesh(poleGeo, poleMat, count);
    var caps = new THREE.InstancedMesh(capGeo, capMat, count);
    var dummy = new THREE.Object3D();
    var r = RESCUE_GROUND_RADIUS - 5;
    for(var i=0;i<count;i++){
      var a = (i/count) * Math.PI * 2;
      var px = ox + Math.cos(a)*r, pz = oz + Math.sin(a)*r;
      dummy.position.set(px, 1.1, pz); dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(px, 2.25, pz); dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix);
    }
    poles.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
    g.add(poles); g.add(caps);
  })();

  g.visible = false;
  scene.add(g);
  rescueEnvGroup = g;
}

// Enter: build-if-needed, show, reposition the flight boundary around the
// rescue area, and place the drone at the rescue base launch pad.
function enterRescueEnvironment(){
  buildRescueEnvironment();
  rescueEnvGroup.visible = true;
  rescueEnvironmentActive = true;
  flightAreaCenter.x = RESCUE_ORIGIN.x; flightAreaCenter.z = RESCUE_ORIGIN.z;
  flightAreaRadius = RESCUE_GROUND_RADIUS - 2;
  // Predictable start, same reset fields Reset/every mission already uses.
  flight.pos.set(RESCUE_ORIGIN.x, 0.03, RESCUE_ORIGIN.z);
  flight.vel.set(0,0,0);
  flight.pitch=0; flight.roll=0; flight.yaw=0; flight.throttle=0; flight.targetThrottle=0;
  autopilot=null; autoHoverOn=false;
}
// Exit: hide (Part 1 — never leave rescue objects visible in other modes),
// restore the original flight boundary, return the drone to the Flight
// Academy origin exactly like Reset already does.
function exitRescueEnvironment(){
  if(!rescueEnvironmentActive) return;
  rescueEnvGroup.visible = false;
  rescueEnvironmentActive = false;
  flightAreaCenter.x = 0; flightAreaCenter.z = 0;
  flightAreaRadius = LIMITS.boundary;
  flight.pos.set(0, 0.03, 0);
  flight.vel.set(0,0,0);
  flight.pitch=0; flight.roll=0; flight.yaw=0; flight.throttle=0; flight.targetThrottle=0;
  autopilot=null; autoHoverOn=false;
}

/* ============================================================
   TAKE OFF / LAND / RESET / AUTO HOVER / ASSIST / FULLSCREEN
============================================================ */
document.getElementById('btnTakeoff').addEventListener('click', function(){
  autoHoverOn = false;
  autopilot = { targetPos: new THREE.Vector3(flight.pos.x, 3.0, flight.pos.z) };
});
document.getElementById('btnLand').addEventListener('click', function(){
  autoHoverOn = false;
  autopilot = { targetPos: new THREE.Vector3(0, 0.03, 0) };
});
document.getElementById('btnHover').addEventListener('click', function(e){
  autoHoverOn = !autoHoverOn;
  autopilot = null;
  autoHoverAlt = flight.pos.y;
  e.currentTarget.classList.toggle('on', autoHoverOn);
});
document.getElementById('btnReset').addEventListener('click', function(){
  flight.pos.set(0,0.03,0); flight.vel.set(0,0,0);
  flight.pitch=0; flight.roll=0; flight.yaw=0;
  flight.throttle=0; flight.targetThrottle=0;
  autopilot=null; autoHoverOn=false;
  document.getElementById('btnHover').classList.remove('on');
});
document.getElementById('toggleAssist').addEventListener('click', function(e){
  assistOn = !assistOn;
  e.currentTarget.classList.toggle('on', assistOn);
  e.currentTarget.setAttribute('aria-pressed', String(assistOn));
});
document.getElementById('toggleDroneSound').addEventListener('click', function(){
  setDroneSoundEnabled(!droneAudio.enabled);
  if(droneAudio.enabled) showToast('Drone Sound On', 'Motor audio now reacts to flight load and speed.', '🔊');
  else showToast('Drone Sound Muted', 'Flight audio is muted.', '🔇');
});
document.getElementById('toggleFullscreenSim').addEventListener('click', function(){
  var root = document.getElementById('simRoot');
  if(!document.fullscreenElement) (root.requestFullscreen||root.webkitRequestFullscreen).call(root);
  else (document.exitFullscreen||document.webkitExitFullscreen).call(document);
});

/* ============================================================
   RESIZE / LOADER
============================================================ */
function resize(){
  var w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h,false);
}
window.addEventListener('resize', resize);
resize();
setTimeout(function(){
  document.getElementById('simLoader').style.opacity='0';
  document.getElementById('simLoader').style.transition='opacity .4s ease';
  setTimeout(function(){ document.getElementById('simLoader').style.display='none'; }, 420);
}, 300);

/* ============================================================
   MAIN LOOP
============================================================ */
var lastT = performance.now();
function animate(now){
  requestAnimationFrame(animate);
  var dt = Math.min(0.05, (now-lastT)/1000); lastT = now;

  updatePhysics(dt);
  updateDroneAudio(dt); // Competition UX Part 11: audio only observes flight state; physics is unchanged.
  checkHoverStep(dt);
  if(mode==='free' && challengePanel.classList.contains('show')) updateChallenges(dt);
  if(academyMissionActive) updateAcademyMission(dt); // only the active mission is evaluated, per the performance requirement
  if(finalAssessmentActive) updateFinalAssessment(dt); // only the active stage is evaluated (see FINAL_ASSESSMENT.stages[i].check)
  updateEnvTransition(dt); // Phase 9.3E: no-op (single null check) once a transition finishes, per the "no continuous heavy calculations" requirement
  updateRescueMission(dt); // Phase 9.4A: only runs the one lightweight distance check while a rescue mission stage is actually active
  updateCamera(dt);
  updateHUD();

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

})();
