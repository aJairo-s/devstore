// DevStore · Hero 3D
// Procesador futurista construido solo con geometrías y materiales de Three.js
// (sin modelos externos). Solo presentación: no toca la lógica de la tienda.
import * as THREE from 'three';

const stage = document.getElementById('heroStage');
const canvas = document.getElementById('hero3d');
const hero = document.getElementById('heroX');

if (stage && canvas && hero) {
  try { boot(); } catch (err) { stage.classList.add('no-webgl'); console.warn('[hero3d] WebGL no disponible', err); }
}

function boot() {
  const EMERALD = 0x10b981, EMERALD_HI = 0x34d399, TEAL = 0x2dd4bf;
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = innerWidth < 700;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 4.3, 11.6);
  camera.lookAt(0, -0.2, 0);

  /* ---------- Entorno (reflejos) generado proceduralmente ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x05080a);
  const soft = (color, w, h, x, y, z, i = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(i), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m);
  };
  soft(0xffffff, 8, 3, -6, 7, 4, 3);
  soft(EMERALD, 10, 4, 7, 2, 2, 4);
  soft(TEAL, 8, 2, -7, -1, -4, 3);
  soft(0xbfffe6, 14, 1.2, 0, 8, -6, 2.5);
  soft(0x1a2b26, 20, 8, 0, -6, 0, 1);
  scene.environment = pmrem.fromScene(envScene, 0.035).texture;
  scene.environmentIntensity = 0.95;
  pmrem.dispose();

  /* ---------- Luces ---------- */
  scene.add(new THREE.HemisphereLight(0xb8fff0, 0x06120e, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-4, 7, 5); scene.add(key);
  const glowA = new THREE.PointLight(EMERALD, 55, 14, 1.6); glowA.position.set(3.2, 1.6, 2.2); scene.add(glowA);
  const glowB = new THREE.PointLight(TEAL, 28, 12, 1.6); glowB.position.set(-3.6, 0.6, -2.6); scene.add(glowB);
  const under = new THREE.PointLight(EMERALD, 30, 9, 1.8); under.position.set(0, -1.5, 0); scene.add(under);

  /* ---------- Utilidades ---------- */
  const disposables = [];
  const track = o => (disposables.push(o), o);

  function roundedRect(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  }
  function slab(w, h, depth, radius, bevel) {
    const g = new THREE.ExtrudeGeometry(roundedRect(w, h, radius), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
    g.rotateX(-Math.PI / 2); g.translate(0, 0, 0); // plano XZ, cara superior hacia +Y
    return track(g);
  }
  function glowTexture(inner = 'rgba(52,211,153,.9)', mid = 'rgba(16,185,129,.25)') {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner); g.addColorStop(.4, mid); g.addColorStop(1, 'rgba(16,185,129,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return track(t);
  }

  /* Textura de la tapa del procesador (color + emisiva) dibujada en canvas */
  function dieTextures() {
    const N = 1024, mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
    const colorC = mk(), emitC = mk(), cx = colorC.getContext('2d'), ex = emitC.getContext('2d');
    // base metálica oscura con cepillado
    const g = cx.createLinearGradient(0, 0, N, N); g.addColorStop(0, '#2a3531'); g.addColorStop(.5, '#16201d'); g.addColorStop(1, '#27322e');
    cx.fillStyle = g; cx.fillRect(0, 0, N, N);
    cx.globalAlpha = .06; for (let i = 0; i < 420; i++) { cx.fillStyle = i % 2 ? '#fff' : '#000'; cx.fillRect(0, Math.random() * N, N, 1); } cx.globalAlpha = 1;
    ex.fillStyle = '#000'; ex.fillRect(0, 0, N, N);

    // semilla fija para trazados estables
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const trace = (ctx, col, w) => {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const cxm = N / 2, margin = 70, ring = 175;
      for (let side = 0; side < 4; side++) {
        for (let k = 0; k < 9; k++) {
          const t = margin + 30 + k * ((N - 2 * margin - 60) / 8);
          const len = 70 + rnd() * 150, jog = (rnd() - .5) * 90;
          ctx.save(); ctx.translate(cxm, cxm); ctx.rotate(side * Math.PI / 2); ctx.translate(-cxm, -cxm);
          ctx.beginPath(); ctx.moveTo(t, margin); ctx.lineTo(t, margin + len * .55); ctx.lineTo(t + jog, margin + len * .55 + Math.abs(jog)); ctx.lineTo(t + jog, margin + len);
          ctx.stroke();
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(t + jog, margin + len, 6, 0, 6.3); ctx.fill();
          ctx.restore();
        }
      }
      ctx.strokeRect(margin, margin, N - 2 * margin, N - 2 * margin);
      ctx.strokeRect(cxm - ring, cxm - ring, ring * 2, ring * 2);
    };
    trace(cx, 'rgba(16,185,129,.38)', 3); trace(ex, 'rgba(52,211,153,1)', 3.5);

    // núcleo central: marca </>
    const core = (ctx, fill, stroke, text) => {
      ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(N / 2 - 135, N / 2 - 135, 270, 270, 26); ctx.fill(); ctx.stroke();
      ctx.fillStyle = text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 120px ui-monospace, Menlo, Consolas, monospace'; ctx.fillText('</>', N / 2, N / 2 - 6);
      ctx.font = '700 30px Inter, system-ui, sans-serif'; ctx.fillText('DEVSTORE', N / 2, N / 2 + 86);
    };
    core(cx, '#0a1411', 'rgba(52,211,153,.8)', '#34d399'); core(ex, 'rgba(0,0,0,0)', '#34d399', '#34d399');
    cx.fillStyle = 'rgba(255,255,255,.4)'; cx.font = '600 26px Inter, system-ui, sans-serif'; cx.textAlign = 'left';
    cx.fillText('DS-9 · 5nm · EMERALD', 100, N - 96);
    ex.fillStyle = 'rgba(52,211,153,.7)'; ex.font = '600 26px Inter, system-ui, sans-serif'; ex.textAlign = 'left'; ex.fillText('DS-9 · 5nm · EMERALD', 100, N - 96);

    const map = track(new THREE.CanvasTexture(colorC)), em = track(new THREE.CanvasTexture(emitC));
    map.colorSpace = em.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = em.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return { map, em };
  }

  /* ---------- Procesador ---------- */
  const rig = new THREE.Group();      // sigue al cursor
  const spin = new THREE.Group();     // rotación lenta
  rig.add(spin); scene.add(rig);

  const pcbMat = track(new THREE.MeshPhysicalMaterial({ color: 0x0b1a16, metalness: .55, roughness: .42, clearcoat: .6, clearcoatRoughness: .35 }));
  const pcb = new THREE.Mesh(slab(4.5, 4.5, .16, .28, .03), pcbMat); pcb.position.y = -.1; spin.add(pcb);

  const sinkMat = track(new THREE.MeshPhysicalMaterial({ color: 0x9aa8a3, metalness: 1, roughness: .22, clearcoat: .5, clearcoatRoughness: .2 }));
  const spreader = new THREE.Mesh(slab(2.9, 2.9, .2, .22, .035), sinkMat); spreader.position.y = .09; spin.add(spreader);

  const { map, em } = dieTextures();
  const faceMat = track(new THREE.MeshStandardMaterial({ map, emissive: new THREE.Color(EMERALD_HI), emissiveMap: em, emissiveIntensity: 1.5, metalness: .85, roughness: .38 }));
  const face = new THREE.Mesh(track(new THREE.PlaneGeometry(2.72, 2.72)), faceMat);
  face.rotation.x = -Math.PI / 2; face.position.y = .335; spin.add(face);

  // línea de escaneo luminosa
  const scanMat = track(new THREE.MeshBasicMaterial({ map: glowTexture('rgba(167,255,224,.95)', 'rgba(52,211,153,.35)'), transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }));
  const scan = new THREE.Mesh(track(new THREE.PlaneGeometry(2.72, .5)), scanMat);
  scan.rotation.x = -Math.PI / 2; scan.position.y = .345; spin.add(scan);

  // marco luminoso del PCB
  const rimMat = track(new THREE.MeshBasicMaterial({ color: EMERALD_HI }));
  const rimGeoH = track(new THREE.BoxGeometry(4.1, .02, .035)), rimGeoV = track(new THREE.BoxGeometry(.035, .02, 4.1));
  [[0, 2.05, rimGeoH], [0, -2.05, rimGeoH], [2.05, 0, rimGeoV], [-2.05, 0, rimGeoV]].forEach(([x, z, g]) => {
    const m = new THREE.Mesh(g, rimMat); m.position.set(x, .1, z); spin.add(m);
  });

  // contactos dorados en los bordes
  const padGeo = track(new THREE.BoxGeometry(.13, .035, .26));
  const padMat = track(new THREE.MeshStandardMaterial({ color: 0xd6b25e, metalness: 1, roughness: .28, emissive: 0x3b2a08, emissiveIntensity: .5 }));
  const PADS = 22, pads = new THREE.InstancedMesh(padGeo, padMat, PADS * 4);
  const dm = new THREE.Object3D(); let pi = 0;
  for (let s = 0; s < 4; s++) for (let k = 0; k < PADS; k++) {
    const t = -1.85 + k * (3.7 / (PADS - 1));
    dm.position.set(0, .105, 0); dm.rotation.set(0, s * Math.PI / 2, 0);
    dm.position.set(t, .105, 2.12); dm.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), s * Math.PI / 2);
    dm.updateMatrix(); pads.setMatrixAt(pi++, dm.matrix);
  }
  pads.instanceMatrix.needsUpdate = true; spin.add(pads);

  // condensadores SMD en las esquinas
  const capGeo = track(new THREE.BoxGeometry(.22, .1, .12));
  const capMat = track(new THREE.MeshStandardMaterial({ color: 0x1b2420, metalness: .6, roughness: .35 }));
  const caps = new THREE.InstancedMesh(capGeo, capMat, 28); let ci = 0;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    for (let k = 0; k < 7; k++) {
      dm.rotation.set(0, (k % 2) * Math.PI / 2, 0);
      dm.position.set(sx * (1.72 + (k % 3) * .14), .13, sz * (1.72 + Math.floor(k / 3) * .14 + (k > 5 ? .14 : 0)));
      dm.updateMatrix(); caps.setMatrixAt(ci++, dm.matrix);
    }
  });
  caps.instanceMatrix.needsUpdate = true; spin.add(caps);

  // brillo difuso bajo el chip
  const halo = new THREE.Mesh(track(new THREE.PlaneGeometry(9, 9)), new THREE.MeshBasicMaterial({ map: glowTexture('rgba(16,185,129,.75)', 'rgba(16,185,129,.2)'), transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = -.55; rig.add(halo);

  /* ---------- Anillos holográficos ---------- */
  const rings = new THREE.Group(); rig.add(rings);
  const ringDefs = [
    { r: 3.3, tube: .012, color: EMERALD_HI, tilt: [Math.PI / 2 - .12, 0, 0], speed: .12, op: .75 },
    { r: 3.7, tube: .008, color: TEAL, tilt: [Math.PI / 2 + .45, .2, 0], speed: -.08, op: .5 },
    { r: 2.85, tube: .008, color: EMERALD, tilt: [Math.PI / 2 - .7, -.3, 0], speed: .16, op: .45 }
  ];
  const ringMeshes = ringDefs.map(d => {
    const mat = track(new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: d.op, blending: THREE.AdditiveBlending, depthWrite: false }));
    const m = new THREE.Mesh(track(new THREE.TorusGeometry(d.r, d.tube, 8, 160)), mat);
    m.rotation.set(...d.tilt); m.userData = d; rings.add(m);
    // nodo de datos que orbita
    const node = new THREE.Mesh(track(new THREE.SphereGeometry(.07, 16, 16)), new THREE.MeshBasicMaterial({ color: 0xd1fae5 }));
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .9 }));
    sprite.scale.setScalar(.7); node.add(sprite); m.add(node); m.userData.node = node;
    return m;
  });
  // anillo segmentado (tipo lectura de datos)
  const segGeo = track(new THREE.BoxGeometry(.22, .012, .05));
  const segMat = track(new THREE.MeshBasicMaterial({ color: EMERALD_HI, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false }));
  const SEG = 48, segs = new THREE.InstancedMesh(segGeo, segMat, SEG);
  for (let i = 0; i < SEG; i++) {
    const a = i / SEG * Math.PI * 2; dm.position.set(Math.cos(a) * 3.05, -.45, Math.sin(a) * 3.05); dm.rotation.set(0, -a, 0); dm.scale.setScalar(i % 4 === 0 ? 1.6 : 1); dm.updateMatrix(); segs.setMatrixAt(i, dm.matrix);
  }
  dm.scale.setScalar(1); segs.instanceMatrix.needsUpdate = true; rings.add(segs);

  /* ---------- Componentes flotantes ---------- */
  const floaters = [];
  const edgeMat = track(new THREE.LineBasicMaterial({ color: EMERALD_HI, transparent: true, opacity: .85 }));
  const solidMat = track(new THREE.MeshPhysicalMaterial({ color: 0x0f1d19, metalness: .8, roughness: .25, clearcoat: 1, transparent: true, opacity: .92 }));
  const defs = [
    { g: new THREE.BoxGeometry(.7, .14, .4), p: [-2.9, 1.4, 1.2], s: .9 },     // módulo RAM
    { g: new THREE.BoxGeometry(.38, .38, .38), p: [3.0, 1.7, -1], s: 1.1 },    // cubo de datos
    { g: new THREE.OctahedronGeometry(.3), p: [2.4, -.6, 2.3], s: .8 },
    { g: new THREE.CylinderGeometry(.16, .16, .45, 6), p: [-2.5, -.2, -2.5], s: 1 }, // condensador
    { g: new THREE.BoxGeometry(.55, .1, .55), p: [.4, 2.3, -2.2], s: .7 }
  ];
  defs.forEach((d, i) => {
    track(d.g);
    const grp = new THREE.Group(), body = new THREE.Mesh(d.g, solidMat);
    const edges = new THREE.LineSegments(track(new THREE.EdgesGeometry(d.g)), edgeMat);
    edges.scale.setScalar(1.04); grp.add(body, edges); grp.position.set(...d.p); grp.userData = { base: grp.position.y, ph: i * 1.7, sp: d.s };
    rig.add(grp); floaters.push(grp);
  });

  /* ---------- Partículas ---------- */
  const COUNT = small || coarse ? 90 : 220, pos = new Float32Array(COUNT * 3), seed2 = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const r = 3 + Math.random() * 5, a = Math.random() * 6.283;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = (Math.random() - .5) * 6; pos[i * 3 + 2] = Math.sin(a) * r - 1; seed2[i] = Math.random() * 6.283;
  }
  const pGeo = track(new THREE.BufferGeometry()); pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pGeo, track(new THREE.PointsMaterial({ map: glowTexture('rgba(209,250,229,1)', 'rgba(52,211,153,.35)'), size: .22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .85, sizeAttenuation: true })));
  scene.add(pts);

  /* ---------- Entrada, tamaño y ciclo de vida ---------- */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const setPointer = e => {
    const r = hero.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width - .5) * 2; pointer.ty = ((e.clientY - r.top) / r.height - .5) * 2;
    hero.style.setProperty('--mx', (e.clientX - r.left) + 'px'); hero.style.setProperty('--my', (e.clientY - r.top) + 'px');
  };
  if (!coarse) {
    hero.addEventListener('pointermove', e => { if (!reduceMQ.matches) setPointer(e); }, { passive: true });
    hero.addEventListener('pointerleave', () => { pointer.tx = 0; pointer.ty = 0; });
  }

  let w = 0, h = 0;
  function resize() {
    const r = stage.getBoundingClientRect(); if (!r.width || !r.height) return;
    w = r.width; h = r.height;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // encuadre: más distancia en formatos estrechos para que el modelo no se recorte
    camera.position.z = camera.aspect < 1.1 ? 11.6 + (1.1 - camera.aspect) * 6 : 11.6;
    camera.updateProjectionMatrix();
    renderOnce();
  }

  const clock = new THREE.Clock(); let t = 0, raf = 0, visible = false, running = false;

  function frame(dt) {
    t += dt; const still = reduceMQ.matches;
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3.2); pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3.2);

    spin.rotation.y = still ? .55 : t * .16;
    rig.rotation.y = pointer.x * .32; rig.rotation.x = pointer.y * .16 + .05;
    rig.position.y = still ? 0 : Math.sin(t * .8) * .09;
    camera.position.x = pointer.x * .35; camera.lookAt(0, -.2, 0);

    const pulse = still ? 1 : .8 + Math.sin(t * 1.7) * .25;
    faceMat.emissiveIntensity = 1.35 * pulse + .2;
    glowA.intensity = 50 + (still ? 0 : Math.sin(t * 1.3) * 8);
    scan.position.z = still ? 0 : Math.sin(t * .9) * 1.2; scanMat.opacity = still ? .35 : .35 + (1 - Math.abs(Math.sin(t * .9))) * .45;

    rings.rotation.y = still ? 0 : t * .05;
    ringMeshes.forEach((m, i) => {
      const d = m.userData; if (!still) m.rotation.z += dt * d.speed;
      const a = t * (.7 + i * .25) + i * 2; d.node.position.set(Math.cos(a) * d.r, Math.sin(a) * d.r, 0);
    });
    segs.rotation.y = still ? 0 : -t * .12;

    floaters.forEach(f => {
      const u = f.userData; if (still) return;
      f.position.y = u.base + Math.sin(t * .9 * u.sp + u.ph) * .18; f.rotation.x = t * .3 * u.sp + u.ph; f.rotation.y = t * .4 * u.sp;
    });
    if (!still) pts.rotation.y = t * .02;
    renderer.render(scene, camera);
  }
  function renderOnce() { if (w) frame(0); }

  function loop() { if (!running) return; frame(Math.min(clock.getDelta(), .05)); raf = requestAnimationFrame(loop); }
  function start() { if (running || reduceMQ.matches || !visible || document.hidden) return; running = true; clock.getDelta(); raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  const sync = () => (visible && !document.hidden && !reduceMQ.matches ? start() : (stop(), renderOnce()));

  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) resize(); sync(); }, { threshold: 0 }).observe(stage);
  new ResizeObserver(resize).observe(stage);
  document.addEventListener('visibilitychange', sync);
  reduceMQ.addEventListener?.('change', sync);

  // Tema claro/oscuro: ajusta exposición del modelo (el hero conserva su fondo oscuro en ambos temas)
  new MutationObserver(() => { renderer.toneMappingExposure = document.documentElement.dataset.theme === 'light' ? 1.05 : 1.15; renderOnce(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); stage.classList.add('no-webgl'); });
  canvas.addEventListener('webglcontextrestored', () => { stage.classList.remove('no-webgl'); sync(); });
  addEventListener('pagehide', () => { stop(); disposables.forEach(d => d.dispose?.()); renderer.dispose(); });

  stage.classList.add('is-ready');
  resize(); sync();
}
