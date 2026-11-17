import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  computeCircularOrbitVelocity,
  computeGravityAccelerationInPlace,
  evaluateHostileImpact,
  stepAdmMetric,
  stepArmadaCountdown,
  stepHiggsMassCoupling,
} from '../physics/engine';
import {
  CAPACITOR_MAX_EJ,
  COSMIC_ZONES,
  ESCORT_RCS_FORCE_N,
  ESCORT_REST_MASS_KG,
  GamePhase,
  GravityWellSpec,
  HudSnapshot,
  MOTHERSHIP_RCS_FORCE_N,
  MOTHERSHIP_REST_MASS_KG,
  PORTAL_COOLDOWN_SEC,
  PORTAL_RELOCATE_DIST_M,
  SimCommandBus,
} from '../physics/types';
import { audioEngine } from './audio';
import { buildCosmicEnvironments } from './cosmicZones';
import {
  buildBossDreadnought,
  buildEscortShip,
  buildMothership,
  buildWormholePortal,
} from './meshes';
import { createProceduralTextures } from './textures';

// Pre-allocated module-scope scratch registers (Zero Heap Allocations in loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _simPos = new THREE.Vector3();
const _simVel = new THREE.Vector3();
const _gAcc = { x: 0, y: 0, z: 0 };
const _worldTurPos = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

interface SimulationCanvasProps {
  onSnapshot: (snap: HudSnapshot) => void;
  commandBusRef: React.MutableRefObject<SimCommandBus | null>;
  radarCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  warpOverlayRef: React.RefObject<HTMLDivElement | null>;
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({
  onSnapshot,
  commandBusRef,
  radarCanvasRef,
  warpOverlayRef,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const params = new URLSearchParams(window.location.search);
    const initialPhase: GamePhase = params.get('autostart') === '1' ? 'playing' : 'title';
    document.body.dataset.state = initialPhase;

    let lastFrameMs = performance.now();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030711);
    scene.fog = new THREE.FogExp2(COSMIC_ZONES[0].fogColor, 0.00015);

    const camera = new THREE.PerspectiveCamera(
      65,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      35000
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.domElement.id = 'game-canvas';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    // Studio Environment Map for metallic hull reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Warm/Cool Studio Space Lighting
    const hemiLight = new THREE.HemisphereLight(0x66aaff, 0x081020, 1.15);
    scene.add(hemiLight);
    const sunLight = new THREE.DirectionalLight(0xffddb0, 2.0);
    sunLight.position.set(500, 800, 400);
    scene.add(sunLight);
    const rimLight = new THREE.DirectionalLight(0x00e5ff, 0.9);
    rimLight.position.set(-450, -300, -500);
    scene.add(rimLight);

    const textures = createProceduralTextures(renderer);
    const cosmicEnvs = buildCosmicEnvironments(scene, textures);

    // Gravitational Bodies
    const solarStarGroup = new THREE.Group();
    solarStarGroup.position.set(-420, 0, -680);
    scene.add(solarStarGroup);
    solarStarGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(85, 28, 28),
        new THREE.MeshBasicMaterial({ color: 0xffaa00 })
      )
    );
    solarStarGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(102, 20, 20),
        new THREE.MeshBasicMaterial({
          color: 0xff5500,
          wireframe: true,
          transparent: true,
          opacity: 0.35,
        })
      )
    );

    const planetGroup = new THREE.Group();
    planetGroup.position.set(580, -40, -950);
    scene.add(planetGroup);
    planetGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(65, 24, 24),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: textures.hullMap,
          roughness: 0.72,
          metalness: 0.25,
        })
      )
    );
    const pRing = new THREE.Mesh(
      new THREE.RingGeometry(85, 135, 36),
      new THREE.MeshBasicMaterial({
        color: 0x66ccff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
      })
    );
    pRing.rotation.x = Math.PI / 2.2;
    planetGroup.add(pRing);

    const gravityWells: GravityWellSpec[] = [
      { id: 'star', name: 'Solar Star', position: solarStarGroup.position, gm: 1450000, minR: 110 },
      { id: 'planet', name: 'Gas Giant', position: planetGroup.position, gm: 520000, minR: 85 },
    ];

    // Orbital Trajectory Line
    const orbitSteps = 120;
    const orbitPositions = new Float32Array(orbitSteps * 3);
    const orbitGeo = new THREE.BufferGeometry();
    orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPositions, 3));
    const orbitLine = new THREE.Line(
      orbitGeo,
      new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.75 })
    );
    scene.add(orbitLine);

    // Spacetime Metric Tensor Grid
    const gridSegs = 32;
    const metricGridGeo = new THREE.PlaneGeometry(700, 700, gridSegs, gridSegs);
    metricGridGeo.rotateX(-Math.PI / 2);
    const metricGridBasePos = metricGridGeo.attributes.position.array.slice();
    const metricGridMesh = new THREE.Mesh(
      metricGridGeo,
      new THREE.MeshBasicMaterial({
        color: 0x00aaff,
        wireframe: true,
        transparent: true,
        opacity: 0.28,
      })
    );
    scene.add(metricGridMesh);

    // Hero Craft, Mothership, Portal, Dreadnought
    const escortRig = buildEscortShip(textures);
    scene.add(escortRig.group);

    const mothershipRig = buildMothership(textures);
    mothershipRig.group.position.set(-220, 45, -520);
    scene.add(mothershipRig.group);

    const portalRig = buildWormholePortal(textures);
    portalRig.group.position.set(160, 20, -950);
    scene.add(portalRig.group);

    const bossGroup = buildBossDreadnought(textures);
    bossGroup.position.set(280, 60, -850);
    scene.add(bossGroup);

    const tetherMat = new THREE.LineBasicMaterial({
      color: 0xffea00,
      transparent: true,
      opacity: 0,
    });
    const goldenTether = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      tetherMat
    );
    scene.add(goldenTether);

    // Pooled Projectiles (Zero-Alloc)
    const MAX_PROJECTILES = 140;
    const sharedBeamGeo = new THREE.CylinderGeometry(0.45, 0.45, 38, 6).rotateX(Math.PI / 2);
    const projectilePool: {
      mesh: THREE.Mesh;
      vel: THREE.Vector3;
      life: number;
      isHostile: boolean;
      isPlasma: boolean;
    }[] = [];

    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
      const mesh = new THREE.Mesh(sharedBeamGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      projectilePool.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        isHostile: false,
        isPlasma: false,
      });
    }

    function spawnPooledProjectile(
      originPos: THREE.Vector3,
      dirVec: THREE.Vector3,
      speed: number,
      colorHex: number,
      isHostile = false,
      isPlasma = false
    ) {
      let slot: (typeof projectilePool)[number] | null = null;
      for (let i = 0; i < MAX_PROJECTILES; i++) {
        if (projectilePool[i].life <= 0) {
          slot = projectilePool[i];
          break;
        }
      }
      if (!slot) return;
      slot.mesh.position.copy(originPos);
      _v4.copy(originPos).add(dirVec);
      slot.mesh.lookAt(_v4);
      slot.mesh.scale.set(isPlasma ? 3.5 : 1, isPlasma ? 3.5 : 1, isPlasma ? 0.5 : 1);
      (slot.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
      slot.mesh.visible = true;
      slot.vel.copy(dirVec).normalize().multiplyScalar(speed);
      slot.life = 2.4;
      slot.isHostile = isHostile;
      slot.isPlasma = isPlasma;
    }

    // Pooled GPU Particle Ring Buffer (Zero-Alloc)
    const MAX_PARTICLES = 1000;
    const partPositions = new Float32Array(MAX_PARTICLES * 3);
    const partColors = new Float32Array(MAX_PARTICLES * 3);
    const partVelocities: THREE.Vector3[] = new Array(MAX_PARTICLES);
    const partLifetimes = new Float32Array(MAX_PARTICLES);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      partPositions[i * 3 + 1] = -99999;
      partVelocities[i] = new THREE.Vector3();
      partLifetimes[i] = 0;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(partPositions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(partColors, 3));
    const particleSystem = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({
        size: 3.2,
        map: textures.glowCyan,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    particleSystem.frustumCulled = false;
    scene.add(particleSystem);
    let particleCursor = 0;

    function emitPooledParticles(
      pos: THREE.Vector3,
      rCol: number,
      gCol: number,
      bCol: number,
      count: number,
      speedSpread: number,
      lifeSec: number
    ) {
      for (let c = 0; c < count; c++) {
        const idx = particleCursor;
        particleCursor = (particleCursor + 1) % MAX_PARTICLES;
        partPositions[idx * 3] = pos.x;
        partPositions[idx * 3 + 1] = pos.y;
        partPositions[idx * 3 + 2] = pos.z;
        partColors[idx * 3] = rCol;
        partColors[idx * 3 + 1] = gCol;
        partColors[idx * 3 + 2] = bCol;
        partVelocities[idx].set(
          (Math.random() - 0.5) * speedSpread,
          (Math.random() - 0.5) * speedSpread,
          (Math.random() - 0.5) * speedSpread
        );
        partLifetimes[idx] = lifeSec;
      }
    }

    // Wingmen & Enemy Squadron
    const wingmen: { mesh: THREE.Mesh; angle: number; cooldown: number }[] = [];
    const sharedWingGeo = new THREE.ConeGeometry(1.6, 7.5, 5).rotateX(Math.PI / 2);
    const sharedWingMat = new THREE.MeshBasicMaterial({ color: 0xbc13fe, wireframe: true });
    for (let i = 0; i < 8; i++) {
      const w = new THREE.Mesh(sharedWingGeo, sharedWingMat);
      scene.add(w);
      wingmen.push({ mesh: w, angle: (i / 8) * Math.PI * 2, cooldown: Math.random() });
    }

    type EnemyPolicy = 'APPROACH' | 'ORBIT_STRAFE' | 'EVADE';
    const enemies: {
      mesh: THREE.Mesh;
      vel: THREE.Vector3;
      aiState: EnemyPolicy;
      strafeDir: number;
      fireCooldown: number;
    }[] = [];
    const sharedEnemyGeo = new THREE.OctahedronGeometry(8.5, 1);
    const sharedEnemyMat = new THREE.MeshStandardMaterial({
      color: 0xff2255,
      map: textures.hullMap,
      emissive: 0x660022,
      metalness: 0.8,
      roughness: 0.35,
    });
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(sharedEnemyGeo, sharedEnemyMat);
      scene.add(mesh);
      enemies.push({
        mesh,
        vel: new THREE.Vector3(),
        aiState: 'APPROACH',
        strafeDir: i % 2 === 0 ? 1 : -1,
        fireCooldown: 2.0 + Math.random() * 2.5,
      });
    }

    // Background Starfield
    const starCount = 3600;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPos[i] = (Math.random() - 0.5) * 8000;
      starPos[i + 1] = (Math.random() - 0.5) * 8000;
      starPos[i + 2] = (Math.random() - 0.5) * 8000;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starFieldPoints = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 2.1 })
    );
    starFieldPoints.frustumCulled = false;
    scene.add(starFieldPoints);

    // Simulation Mutable State
    const sim = {
      phase: initialPhase as GamePhase,
      restMassKg: ESCORT_REST_MASS_KG,
      higgsSuppression: 0.0,
      effectiveMassKg: ESCORT_REST_MASS_KG,
      dispMassKg: ESCORT_REST_MASS_KG,
      maxAccelMS2: ESCORT_RCS_FORCE_N / ESCORT_REST_MASS_KG,
      rcsForceN: ESCORT_RCS_FORCE_N,
      bubbleActive: false,
      inertialDampers: true,
      spacePuller: false,
      admContractionFactor: 1.0,
      metricSpeedC: 0.0,
      phaseShift: false,
      tunneledCount: 0,
      shearGrazeCount: 0,
      nanoHealTimerSec: 0.0,
      nanoStatus: 'Solid · 0.05s Nano Ready',
      portalJumpCooldownSec: 0.0,
      portalTransits: 0,
      mothershipControl: false,
      wingmenActive: true,
      showMetricGrid: true,
      mouseSteer: false,
      mouseX: 0,
      mouseY: 0,
      armadaSyncing: false,
      armadaCountdownSec: 120.0,
      armadaStageLabel: '',
      fastCountdown: false,
      stageTriggered: { s120: false, s60: false, s30: false, s5: false },
      linearVel: new THREE.Vector3(0, 0, -28),
      angularVel: new THREE.Vector3(0, 0, 0),
      gLoad: 1.0,
      capacitorEJ: 188,
      totalHarvestedEJ: 0,
      conduitIntegrity: 100,
      hullIntegrity: 100,
      bossHull: 100,
      schStability: 20,
      enemiesDestroyed: 0,
      bossesDestroyed: 0,
      systemIdx: 0,
      shakeTrauma: 0,
      hitstopSec: 0,
      bossCooldownSec: 3.0,
      alertMessage:
        '6-DOF READY: W/S Surge · A/D Strafe · R/F Heave · Q/E Roll · [B] 0/0 Bubble',
      alertTone: 'info' as HudSnapshot['alertTone'],
      endReason: null as HudSnapshot['endReason'],
      keys: {} as Record<string, boolean>,
      joyLeft: { x: 0, y: 0 },
      joyRight: { x: 0, y: 0 },
    };

    function getActiveCraft(): THREE.Group {
      return sim.mothershipControl ? mothershipRig.group : escortRig.group;
    }

    function respawnEnemy(enObj: (typeof enemies)[number]) {
      const activeObj = getActiveCraft();
      enObj.mesh.position.set(
        activeObj.position.x + (Math.random() - 0.5) * 1600,
        activeObj.position.y + (Math.random() - 0.5) * 600,
        activeObj.position.z - 550 - Math.random() * 1200
      );
      enObj.aiState = 'APPROACH';
    }
    enemies.forEach((en) => respawnEnemy(en));

    function setAlert(msg: string, tone: HudSnapshot['alertTone'] = 'info') {
      sim.alertMessage = msg;
      sim.alertTone = tone;
    }

    function pushSnapshot(fps = 60, dtMs = 16.6) {
      onSnapshotRef.current({
        phase: sim.phase,
        dispMassKg: sim.dispMassKg,
        effectiveMassKg: sim.effectiveMassKg,
        maxAccelMS2: sim.maxAccelMS2,
        higgsSuppression: sim.higgsSuppression,
        localSpeedMS: sim.linearVel.length(),
        gLoad: sim.gLoad,
        admContractionFactor: sim.admContractionFactor,
        metricSpeedC: sim.metricSpeedC,
        bubbleActive: sim.bubbleActive,
        inertialDampers: sim.inertialDampers,
        spacePuller: sim.spacePuller,
        phaseShift: sim.phaseShift,
        mothershipControl: sim.mothershipControl,
        wingmenActive: sim.wingmenActive,
        showMetricGrid: sim.showMetricGrid,
        mouseSteer: sim.mouseSteer,
        armadaSyncing: sim.armadaSyncing,
        armadaCountdownSec: sim.armadaCountdownSec,
        armadaStageLabel: sim.armadaStageLabel,
        fastCountdown: sim.fastCountdown,
        portalJumpCooldownSec: sim.portalJumpCooldownSec,
        portalTransits: sim.portalTransits,
        tunneledCount: sim.tunneledCount,
        shearGrazeCount: sim.shearGrazeCount,
        nanoStatus: sim.nanoStatus,
        systemIdx: sim.systemIdx,
        zoneName: COSMIC_ZONES[sim.systemIdx].name,
        capacitorEJ: sim.capacitorEJ,
        conduitIntegrity: sim.conduitIntegrity,
        bossHull: sim.bossHull,
        schStability: sim.schStability,
        hullIntegrity: sim.hullIntegrity,
        totalHarvestedEJ: sim.totalHarvestedEJ,
        enemiesDestroyed: sim.enemiesDestroyed,
        bossesDestroyed: sim.bossesDestroyed,
        fps,
        dtMs,
        alertMessage: sim.alertMessage,
        alertTone: sim.alertTone,
        endReason: sim.endReason,
      });
    }

    function resetSimulationState(nextPhase: GamePhase) {
      sim.phase = nextPhase;
      document.body.dataset.state = nextPhase;
      sim.mothershipControl = false;
      sim.restMassKg = ESCORT_REST_MASS_KG;
      sim.rcsForceN = ESCORT_RCS_FORCE_N;
      sim.higgsSuppression = 0;
      sim.effectiveMassKg = ESCORT_REST_MASS_KG;
      sim.dispMassKg = ESCORT_REST_MASS_KG;
      sim.bubbleActive = false;
      sim.inertialDampers = true;
      sim.spacePuller = false;
      sim.admContractionFactor = 1.0;
      sim.metricSpeedC = 0.0;
      sim.phaseShift = false;
      sim.tunneledCount = 0;
      sim.shearGrazeCount = 0;
      sim.nanoHealTimerSec = 0;
      sim.nanoStatus = 'Solid · 0.05s Nano Ready';
      sim.portalJumpCooldownSec = 0;
      sim.portalTransits = 0;
      sim.wingmenActive = true;
      sim.showMetricGrid = true;
      sim.mouseSteer = false;
      sim.armadaSyncing = false;
      sim.armadaCountdownSec = 120.0;
      sim.armadaStageLabel = '';
      sim.stageTriggered = { s120: false, s60: false, s30: false, s5: false };
      sim.linearVel.set(0, 0, -28);
      sim.angularVel.set(0, 0, 0);
      sim.capacitorEJ = 188;
      sim.totalHarvestedEJ = 0;
      sim.conduitIntegrity = 100;
      sim.hullIntegrity = 100;
      sim.bossHull = 100;
      sim.schStability = 20;
      sim.enemiesDestroyed = 0;
      sim.bossesDestroyed = 0;
      sim.shakeTrauma = 0;
      sim.hitstopSec = 0;
      sim.endReason = null;
      sim.keys = {};
      sim.joyLeft = { x: 0, y: 0 };
      sim.joyRight = { x: 0, y: 0 };

      escortRig.group.position.set(0, 0, 0);
      escortRig.group.quaternion.identity();
      escortRig.hullMat.opacity = 1.0;
      escortRig.wingMat.opacity = 1.0;
      (escortRig.isolationBubble.material as THREE.MeshBasicMaterial).opacity = 0;
      (escortRig.spacePullerCone.material as THREE.MeshBasicMaterial).opacity = 0;
      escortRig.hexShieldMat.opacity = 0;

      mothershipRig.group.position.set(-220, 45, -520);
      mothershipRig.group.quaternion.identity();
      portalRig.group.position.set(160, 20, -950);
      solarStarGroup.position.set(-420, 0, -680);
      planetGroup.position.set(580, -40, -950);
      bossGroup.position.set(280, 60, -850);
      tetherMat.opacity = 0;

      for (let i = 0; i < MAX_PROJECTILES; i++) {
        projectilePool[i].life = 0;
        projectilePool[i].mesh.visible = false;
      }
      wingmen.forEach((w) => {
        w.mesh.visible = true;
      });
      enemies.forEach((en) => respawnEnemy(en));
      commands.setCosmicZone(0);
      if (warpOverlayRef.current) warpOverlayRef.current.style.display = 'none';
      setAlert('6-DOF READY: W/S Surge · A/D Strafe · R/F Heave · Q/E Roll · [B] 0/0 Bubble', 'info');
      pushSnapshot();
    }

    const commands: SimCommandBus = {
      setCosmicZone(idx: number) {
        const clamped = Math.max(0, Math.min(COSMIC_ZONES.length - 1, idx));
        sim.systemIdx = clamped;
        const z = COSMIC_ZONES[clamped];
        scene.fog = new THREE.FogExp2(z.fogColor, 0.00015);
        sunLight.color.setHex(z.lightColor);
        cosmicEnvs.setVisibleZone(clamped, getActiveCraft().position);
        setAlert(`COSMIC ENVIRONMENT LOADED: ${z.name.toUpperCase()}`, 'success');
        pushSnapshot();
      },
      toggleBubble() {
        sim.bubbleActive = !sim.bubbleActive;
        (escortRig.isolationBubble.material as THREE.MeshBasicMaterial).opacity = sim.bubbleActive
          ? 0.36
          : 0;
        audioEngine.playTone(
          sim.bubbleActive ? 240 : 480,
          sim.bubbleActive ? 540 : 180,
          0.2,
          'sine'
        );
        if (!sim.bubbleActive) {
          sim.spacePuller = false;
          (escortRig.spacePullerCone.material as THREE.MeshBasicMaterial).opacity = 0;
          if (warpOverlayRef.current) warpOverlayRef.current.style.display = 'none';
        }
        setAlert(
          sim.bubbleActive
            ? '0/0 BUBBLE ENGAGED: HIGGS SUPPRESSION RAMPING TO 100% (m_eff -> 0.00 kg)'
            : 'HIGGS COUPLING RESTORED: BARYONIC INERTIA & GRAVITY ACTIVE',
          'info'
        );
        pushSnapshot();
      },
      injectStableOrbit() {
        const activeObj = getActiveCraft();
        if (sim.bubbleActive) commands.toggleBubble();
        let nearest = gravityWells[0];
        let minDist = activeObj.position.distanceTo(nearest.position as THREE.Vector3);
        for (let i = 1; i < gravityWells.length; i++) {
          const d = activeObj.position.distanceTo(gravityWells[i].position as THREE.Vector3);
          if (d < minDist) {
            minDist = d;
            nearest = gravityWells[i];
          }
        }
        const orb = computeCircularOrbitVelocity(activeObj.position, nearest);
        sim.linearVel.set(orb.vx, orb.vy, orb.vz);
        _v3.copy(activeObj.position).add(sim.linearVel);
        activeObj.lookAt(_v3);
        audioEngine.playTone(260, 680, 0.28, 'sine');
        setAlert(
          `KEPLERIAN ORBIT INJECTED AROUND ${nearest.name.toUpperCase()} (v_orb = ${orb.speedMS.toFixed(1)} m/s)`,
          'success'
        );
        pushSnapshot();
      },
      toggleDampers() {
        sim.inertialDampers = !sim.inertialDampers;
        setAlert(
          sim.inertialDampers ? 'RCS INERTIAL DAMPERS ONLINE' : 'NEWTONIAN DRIFT MODE (DAMPERS OFF)',
          'info'
        );
        pushSnapshot();
      },
      toggleWarp() {
        if (!sim.bubbleActive) {
          setAlert('ENGAGE [B] 0/0 BUBBLE BEFORE SPACE PULLER!', 'crit');
          pushSnapshot();
          return;
        }
        sim.spacePuller = !sim.spacePuller;
        (escortRig.spacePullerCone.material as THREE.MeshBasicMaterial).opacity = sim.spacePuller
          ? 0.5
          : 0;
        if (warpOverlayRef.current) {
          warpOverlayRef.current.style.display = sim.spacePuller ? 'block' : 'none';
        }
        if (sim.spacePuller) audioEngine.playTone(140, 840, 0.35, 'sine');
        setAlert(
          sim.spacePuller
            ? 'ADM METRIC CONTRACTION ACTIVE: FORWARD SPACETIME STREAMING AT 365,000c'
            : 'SPACE PULLER DISENGAGED: FLAT MINKOWSKI METRIC',
          'info'
        );
        pushSnapshot();
      },
      togglePhase() {
        sim.phaseShift = !sim.phaseShift;
        const opacity = sim.phaseShift ? 0.25 : 1.0;
        escortRig.hullMat.opacity = opacity;
        escortRig.wingMat.opacity = opacity;
        sim.nanoStatus = sim.phaseShift
          ? '98% Phase-Shift Active (6 EJ/s)'
          : 'Solid · 0.05s Nano Ready';
        setAlert(
          sim.phaseShift
            ? '98% QUANTUM PHASE-SHIFT ON (6 EJ/s Drain · 2% Shear Graze Risk)'
            : 'SOLID BARYONIC PHASE RESTORED',
          'info'
        );
        pushSnapshot();
      },
      firePlayerLaser() {
        if (sim.phase !== 'playing') return;
        if (sim.capacitorEJ < 2) {
          setAlert('LOW CAPACITOR! PRESS [G] SHUNT!', 'crit');
          pushSnapshot();
          return;
        }
        sim.capacitorEJ -= 2;
        audioEngine.playTone(880, 120, 0.1, 'sawtooth');
        const shooter = getActiveCraft();
        _v1.set(0, 0, -1).applyQuaternion(shooter.quaternion);
        [-3.5, 3.5].forEach((xOff) => {
          _v2.set(xOff, 0, -4).applyQuaternion(shooter.quaternion).add(shooter.position);
          spawnPooledProjectile(_v2, _v1, 620, 0x00ffcc, false, false);
        });
      },
      firePlayerPlasma() {
        if (sim.phase !== 'playing') return;
        if (sim.capacitorEJ < 10) {
          setAlert('NEED 10 EJ FOR 450 TJ PLASMA CANNON!', 'crit');
          pushSnapshot();
          return;
        }
        sim.capacitorEJ -= 10;
        audioEngine.playTone(220, 55, 0.25, 'sawtooth');
        const shooter = getActiveCraft();
        _v1.set(0, 0, -1).applyQuaternion(shooter.quaternion);
        spawnPooledProjectile(shooter.position, _v1, 420, 0xbc13fe, false, true);
        setAlert('450 TJ VENTRAL PLASMA CANNON FIRED!', 'info');
        pushSnapshot();
      },
      shuntPortalMass() {
        audioEngine.playTone(110, 950, 0.38, 'sine');
        sim.schStability = 12;
        sim.conduitIntegrity = 100;
        sim.capacitorEJ = CAPACITOR_MAX_EJ;
        sim.shakeTrauma = Math.min(1.0, sim.shakeTrauma + 0.55);
        emitPooledParticles(portalRig.group.position, 0.0, 1.0, 0.8, 80, 180, 1.4);
        setAlert(
          'PORTAL SHUNT [G]: 10,000 kg/s BLED -> 899 EXAWATTS! CAPACITOR 250 EJ FULL',
          'success'
        );
        pushSnapshot();
      },
      toggleWingmen() {
        sim.wingmenActive = !sim.wingmenActive;
        wingmen.forEach((w) => {
          w.mesh.visible = sim.wingmenActive;
        });
        pushSnapshot();
      },
      toggleMothershipMode() {
        sim.mothershipControl = !sim.mothershipControl;
        sim.restMassKg = sim.mothershipControl ? MOTHERSHIP_REST_MASS_KG : ESCORT_REST_MASS_KG;
        sim.rcsForceN = sim.mothershipControl ? MOTHERSHIP_RCS_FORCE_N : ESCORT_RCS_FORCE_N;
        setAlert(
          sim.mothershipControl
            ? 'COMMAND TRANSFERRED TO 3.25-KM MOTHERSHIP'
            : 'COMMAND RETURNED TO ESCORT VESSEL',
          'success'
        );
        pushSnapshot();
      },
      toggleMetricGrid() {
        sim.showMetricGrid = !sim.showMetricGrid;
        pushSnapshot();
      },
      triggerArmadaJump() {
        if (!sim.bubbleActive) {
          setAlert('ENGAGE [B] 0/0 BUBBLE BEFORE INITIATING T-120.0s ARMADA COUNTDOWN!', 'crit');
          pushSnapshot();
          return;
        }
        if (sim.armadaSyncing) return;
        sim.armadaSyncing = true;
        sim.armadaCountdownSec = 120.0;
        sim.stageTriggered = { s120: false, s60: false, s30: false, s5: false };
        audioEngine.playTone(180, 880, 0.45, 'sine');
        pushSnapshot();
      },
      toggleCountdownSpeed() {
        sim.fastCountdown = !sim.fastCountdown;
        pushSnapshot();
      },
      toggleMouseSteer() {
        sim.mouseSteer = !sim.mouseSteer;
        pushSnapshot();
      },
      setVirtualKey(key: string, pressed: boolean) {
        sim.keys[key.toLowerCase()] = pressed;
      },
      setJoystick(side: 'left' | 'right', x: number, y: number) {
        if (side === 'left') {
          sim.joyLeft.x = x;
          sim.joyLeft.y = y;
        } else {
          sim.joyRight.x = x;
          sim.joyRight.y = y;
        }
      },
      startGame() {
        if (sim.phase === 'gameover') {
          resetSimulationState('playing');
          return;
        }
        sim.phase = 'playing';
        document.body.dataset.state = 'playing';
        sim.keys = {};
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        audioEngine.playTone(180, 720, 0.35, 'sine');
        audioEngine.speak(
          'Audited six degree of freedom physics engine and five cosmic zone geometries initialized.'
        );
        pushSnapshot();
      },
      togglePause() {
        if (sim.phase === 'playing') {
          sim.phase = 'paused';
          document.body.dataset.state = 'paused';
          sim.keys = {};
          document.exitPointerLock?.();
        } else if (sim.phase === 'paused') {
          sim.phase = 'playing';
          document.body.dataset.state = 'playing';
          sim.keys = {};
        }
        pushSnapshot();
      },
      restartGame() {
        resetSimulationState('playing');
      },
      returnToTitle() {
        resetSimulationState('title');
      },
    };

    commandBusRef.current = commands;

    function completeArmadaJump() {
      if (sim.portalJumpCooldownSec > 0) return;
      sim.portalJumpCooldownSec = PORTAL_COOLDOWN_SEC;
      sim.portalTransits += 1;
      sim.armadaSyncing = false;
      sim.armadaStageLabel = '';
      sim.shakeTrauma = 1.0;
      tetherMat.opacity = 0;

      const activeObj = getActiveCraft();
      _v1.set(0, 0, -1).applyQuaternion(activeObj.quaternion);
      portalRig.group.position.copy(activeObj.position).addScaledVector(_v1, PORTAL_RELOCATE_DIST_M);
      solarStarGroup.position.copy(activeObj.position).add(_v2.set(-420, 40, -900));
      planetGroup.position.copy(activeObj.position).add(_v2.set(580, -40, -1100));
      bossGroup.position.copy(activeObj.position).add(_v2.set(260, 60, -1000));

      commands.setCosmicZone((sim.systemIdx + 1) % COSMIC_ZONES.length);
      sim.capacitorEJ = CAPACITOR_MAX_EJ;
      sim.schStability = 15;
      enemies.forEach((en) => respawnEnemy(en));

      audioEngine.speak('Wormhole transit complete. Portal ring relocated to next sector.');
      setAlert(
        `EINSTEIN-ROSEN TRANSIT COMPLETE! PORTAL RE-ANCHORED ${PORTAL_RELOCATE_DIST_M}m AHEAD`,
        'success'
      );
      pushSnapshot();
    }

    function updateOrbitalTrajectoryLine(startPos: THREE.Vector3, startVel: THREE.Vector3) {
      const posArr = orbitLine.geometry.attributes.position.array as Float32Array;
      _simPos.copy(startPos);
      _simVel.copy(startVel);
      const simDt = 0.25;
      for (let i = 0; i < orbitSteps; i++) {
        posArr[i * 3] = _simPos.x;
        posArr[i * 3 + 1] = _simPos.y;
        posArr[i * 3 + 2] = _simPos.z;
        computeGravityAccelerationInPlace(_simPos, gravityWells, sim.higgsSuppression, _gAcc);
        _simVel.x += _gAcc.x * simDt;
        _simVel.y += _gAcc.y * simDt;
        _simVel.z += _gAcc.z * simDt;
        _simPos.addScaledVector(_simVel, simDt);
      }
      orbitLine.geometry.attributes.position.needsUpdate = true;
      (orbitLine.material as THREE.LineBasicMaterial).color.setHex(
        sim.bubbleActive ? 0x00f3ff : 0x00ff88
      );
    }

    function updateSpacetimeMetricGrid(
      activeObj: THREE.Group,
      forwardVec: THREE.Vector3,
      timeSec: number
    ) {
      if (!sim.showMetricGrid) {
        metricGridMesh.visible = false;
        return;
      }
      metricGridMesh.visible = true;
      metricGridMesh.position.set(
        activeObj.position.x,
        activeObj.position.y - 26,
        activeObj.position.z
      );
      const posAttr = metricGridGeo.attributes.position;
      const arr = posAttr.array as Float32Array;

      for (let i = 0; i < arr.length; i += 3) {
        const bx = metricGridBasePos[i];
        const bz = metricGridBasePos[i + 2];
        const worldVx = metricGridMesh.position.x + bx;
        const worldVz = metricGridMesh.position.z + bz;

        let yDip = 0;
        let xPull = bx;
        let zPull = bz;

        for (let g = 0; g < gravityWells.length; g++) {
          const gw = gravityWells[g];
          const dx = worldVx - gw.position.x;
          const dz = worldVz - gw.position.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          yDip -= Math.min(95, (gw.gm * 0.045) / (d + 90));
        }

        const distFromShip = Math.sqrt(bx * bx + bz * bz);
        if (sim.spacePuller && distFromShip < 280) {
          const proj = (bx * forwardVec.x + bz * forwardVec.z) / (distFromShip + 1);
          if (proj > 0) {
            const contractFactor = Math.exp(-distFromShip / 140) * proj * 0.55;
            xPull -= bx * contractFactor;
            zPull -= bz * contractFactor;
            yDip -= Math.sin(distFromShip * 0.08 - timeSec * 12) * 14 * proj;
          }
        } else if (sim.bubbleActive && distFromShip < 65) {
          yDip *= 1.0 - sim.higgsSuppression * 0.9;
        }

        arr[i] = xPull;
        arr[i + 1] = yDip;
        arr[i + 2] = zPull;
      }
      posAttr.needsUpdate = true;
    }

    function drawTacticalRadar(activeObj: THREE.Group) {
      const radar = radarCanvasRef.current;
      if (!radar) return;
      const rCtx = radar.getContext('2d');
      if (!rCtx) return;

      const w = radar.width;
      const h = radar.height;
      const cx = w / 2;
      const cy = h / 2;
      rCtx.clearRect(0, 0, w, h);
      rCtx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      rCtx.lineWidth = 1;
      [18, 34, 50].forEach((r) => {
        rCtx.beginPath();
        rCtx.arc(cx, cy, r, 0, Math.PI * 2);
        rCtx.stroke();
      });

      const scale = 0.032;
      const plotBlip = (pos: THREE.Vector3, color: string, size = 3) => {
        const dx = (pos.x - activeObj.position.x) * scale;
        const dz = (pos.z - activeObj.position.z) * scale;
        if (dx * dx + dz * dz < 50 * 50) {
          rCtx.fillStyle = color;
          rCtx.beginPath();
          rCtx.arc(cx + dx, cy + dz, size, 0, Math.PI * 2);
          rCtx.fill();
        }
      };

      plotBlip(portalRig.group.position, '#00f3ff', 4.5);
      plotBlip(solarStarGroup.position, '#ffaa00', 4.5);
      plotBlip(mothershipRig.group.position, '#00ff88', 4.5);
      plotBlip(bossGroup.position, '#ff0044', 5);
      for (let i = 0; i < enemies.length; i++) {
        plotBlip(enemies[i].mesh.position, '#ff5500', 2.2);
      }

      rCtx.fillStyle = '#ffffff';
      rCtx.beginPath();
      rCtx.arc(cx, cy, 3, 0, Math.PI * 2);
      rCtx.fill();
    }

    // Window & Input Listeners
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (sim.phase === 'title') {
        if (e.key === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          commands.startGame();
        }
        return;
      }
      if (k === 'p' || e.key === 'Escape') {
        if (sim.phase === 'playing' || sim.phase === 'paused') {
          e.preventDefault();
          commands.togglePause();
        }
        return;
      }
      if (sim.phase !== 'playing') return;

      sim.keys[k] = true;
      if (e.repeat) return;

      if (k === '1') commands.setCosmicZone(0);
      if (k === '2') commands.setCosmicZone(1);
      if (k === '3') commands.setCosmicZone(2);
      if (k === '4') commands.setCosmicZone(3);
      if (k === '5') commands.setCosmicZone(4);
      if (k === 'b') commands.toggleBubble();
      if (k === 'o') commands.injectStableOrbit();
      if (k === 'i') commands.toggleDampers();
      if (e.key === 'Shift') commands.toggleWarp();
      if (k === 'z') commands.togglePhase();
      if (k === 'g') commands.shuntPortalMass();
      if (k === 'y') commands.toggleWingmen();
      if (k === 'c') commands.toggleMothershipMode();
      if (k === 'h') commands.toggleMetricGrid();
      if (k === 'x') commands.toggleCountdownSpeed();
      if (k === 'v') commands.firePlayerPlasma();
      if (e.code === 'Space') {
        e.preventDefault();
        commands.firePlayerLaser();
      }
      if (k === 'm') commands.triggerArmadaJump();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      sim.keys[e.key.toLowerCase()] = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      sim.mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      sim.mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const clearHeldInputs = () => {
      sim.keys = {};
      sim.joyLeft.x = 0;
      sim.joyLeft.y = 0;
      sim.joyRight.x = 0;
      sim.joyRight.y = 0;
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearHeldInputs();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('blur', clearHeldInputs);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    });
    resizeObserver.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Initial snapshot before loop starts
    pushSnapshot();

    // Animation Loop (Hardware rAF vs Software WebGL afterDraw)
    let frameId = 0;
    let disposed = false;
    let frameCount = 0;
    let fpsAccum = 0;
    let currentFps = 60;
    let hudAccum = 0;
    let totalSimTime = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        if (disposed) return;
        const st = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (st === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function stepAndRender() {
      if (disposed) return;

      const nowMs = performance.now();
      const rawDt = Math.max(0.0001, (nowMs - lastFrameMs) / 1000);
      lastFrameMs = nowMs;
      const dt = Math.min(rawDt, 0.05);
      frameCount++;
      fpsAccum += rawDt;
      if (fpsAccum >= 0.5) {
        currentFps = Math.round(frameCount / fpsAccum);
        frameCount = 0;
        fpsAccum = 0;
      }

      const activeObj = getActiveCraft();

      // Title screen: live orbital camera tour framing ship & portal on right side
      if (sim.phase === 'title') {
        totalSimTime += dt;
        const tourAngle = totalSimTime * 0.22;
        camera.position.set(
          -18 + Math.sin(tourAngle) * 14,
          10 + Math.sin(totalSimTime * 0.45) * 3,
          26 + Math.cos(tourAngle) * 6
        );
        camera.lookAt(-6, 2, -160);

        escortRig.isolationBubble.rotation.y += 0.9 * dt;
        portalRig.innerCasimirRing.rotation.z -= 2.0 * dt;
        portalRig.wormholeFunnelMesh.rotation.z += 1.0 * dt;
        cosmicEnvs.updateZoneMotion(sim.systemIdx, 28, false, dt);
        _forward.set(0, 0, -1);
        updateSpacetimeMetricGrid(escortRig.group, _forward, totalSimTime);
        updateOrbitalTrajectoryLine(escortRig.group.position, sim.linearVel);

        renderer.render(scene, camera);
        if (isSoftwareGl) afterDraw(stepAndRender);
        else frameId = requestAnimationFrame(stepAndRender);
        return;
      }

      // Paused or GameOver: keep canvas rendered cleanly without advancing physics
      if (sim.phase === 'paused' || sim.phase === 'gameover') {
        renderer.render(scene, camera);
        if (isSoftwareGl) afterDraw(stepAndRender);
        else frameId = requestAnimationFrame(stepAndRender);
        return;
      }

      // Playing phase
      if (sim.hitstopSec > 0) {
        sim.hitstopSec = Math.max(0, sim.hitstopSec - dt);
      } else {
        totalSimTime += dt;

        if (sim.portalJumpCooldownSec > 0) {
          sim.portalJumpCooldownSec = Math.max(0, sim.portalJumpCooldownSec - dt);
        }

        // Dynamic Higgs Mass Coupling
        const massStep = stepHiggsMassCoupling(
          sim.restMassKg,
          sim.rcsForceN,
          sim.higgsSuppression,
          sim.bubbleActive,
          dt
        );
        sim.higgsSuppression = massStep.higgsSuppression;
        sim.effectiveMassKg = massStep.effectiveMassKg;
        sim.dispMassKg = massStep.dispMassKg;
        sim.maxAccelMS2 = massStep.maxAccelMS2;

        // 6-DOF Rotational Kinematics
        const angAccel = 1.8 * Math.min(3.0, Math.sqrt(massStep.massRatio));
        let pitchInput =
          (sim.keys['arrowup'] ? 1 : 0) - (sim.keys['arrowdown'] ? 1 : 0) + sim.joyRight.y;
        let yawInput =
          (sim.keys['arrowleft'] ? 1 : 0) - (sim.keys['arrowright'] ? 1 : 0) - sim.joyRight.x;
        const rollInput = (sim.keys['q'] ? 1 : 0) - (sim.keys['e'] ? 1 : 0);

        if (sim.mouseSteer) {
          pitchInput += sim.mouseY * 1.3;
          yawInput -= sim.mouseX * 1.3;
        }

        sim.angularVel.x += pitchInput * angAccel * dt;
        sim.angularVel.y += yawInput * angAccel * dt;
        sim.angularVel.z += rollInput * angAccel * 1.4 * dt;

        const rotDamp = Math.exp(-(sim.inertialDampers ? 4.5 : 0.4) * dt);
        sim.angularVel.multiplyScalar(rotDamp);

        activeObj.rotateX(sim.angularVel.x * dt);
        activeObj.rotateY(sim.angularVel.y * dt);
        activeObj.rotateZ(sim.angularVel.z * dt);

        // 6-DOF Translational Axes (Surge W/S, Strafe A/D, Vertical Heave R/F)
        _forward.set(0, 0, -1).applyQuaternion(activeObj.quaternion);
        _right.set(1, 0, 0).applyQuaternion(activeObj.quaternion);
        _up.set(0, 1, 0).applyQuaternion(activeObj.quaternion);

        const surgeInput = (sim.keys['w'] ? 1 : 0) - (sim.keys['s'] ? 0.7 : 0) + sim.joyLeft.y;
        const strafeInput = (sim.keys['d'] ? 1 : 0) - (sim.keys['a'] ? 1 : 0) + sim.joyLeft.x;
        const heaveInput = (sim.keys['r'] ? 1 : 0) - (sim.keys['f'] ? 1 : 0);

        const linAccelMag = massStep.maxAccelMS2;
        _v1.set(0, 0, 0);
        _v1.addScaledVector(_forward, surgeInput * linAccelMag);
        _v1.addScaledVector(_right, strafeInput * linAccelMag * 0.75);
        _v1.addScaledVector(_up, heaveInput * linAccelMag * 0.75);

        computeGravityAccelerationInPlace(
          activeObj.position,
          gravityWells,
          sim.higgsSuppression,
          _gAcc
        );
        _v1.x += _gAcc.x;
        _v1.y += _gAcc.y;
        _v1.z += _gAcc.z;

        sim.gLoad = (1.0 - sim.higgsSuppression) * (_v1.length() / 9.81);
        sim.linearVel.addScaledVector(_v1, dt);
        if (sim.inertialDampers) {
          sim.linearVel.multiplyScalar(Math.exp(-1.15 * dt));
        }

        const localSpeedMS = sim.linearVel.length();
        const adm = stepAdmMetric(
          sim.admContractionFactor,
          localSpeedMS,
          sim.bubbleActive,
          sim.spacePuller,
          dt
        );
        sim.admContractionFactor = adm.admContractionFactor;
        sim.metricSpeedC = adm.metricSpeedC;

        activeObj.position.addScaledVector(sim.linearVel, dt);

        // Starfield streaming during Space Puller ADM contraction
        const starArr = starGeo.attributes.position.array as Float32Array;
        const streamStep = sim.spacePuller ? 1600 * dt : 0;
        if (streamStep > 0) {
          for (let i = 0; i < starCount * 3; i += 3) {
            starArr[i] -= _forward.x * streamStep;
            starArr[i + 1] -= _forward.y * streamStep;
            starArr[i + 2] -= _forward.z * streamStep;
            if (Math.abs(starArr[i + 2] - activeObj.position.z) > 4000) {
              starArr[i + 2] = activeObj.position.z - 3800;
            }
          }
          starGeo.attributes.position.needsUpdate = true;
        }

        cosmicEnvs.updateZoneMotion(sim.systemIdx, localSpeedMS, sim.spacePuller, dt);
        updateOrbitalTrajectoryLine(activeObj.position, sim.linearVel);
        updateSpacetimeMetricGrid(activeObj, _forward, totalSimTime);

        // Engine Thruster Particles
        _v2.set(0, -0.2, 6.5).applyQuaternion(activeObj.quaternion).add(activeObj.position);
        emitPooledParticles(_v2, sim.spacePuller ? 0.8 : 0.0, 0.95, 1.0, 2, 18, 0.35);

        // Phase-Shift Drain & 0.05s Tier-4 Nano-Heal
        if (sim.phaseShift) {
          sim.capacitorEJ = Math.max(0, sim.capacitorEJ - 6.0 * dt);
          if (sim.capacitorEJ <= 0) commands.togglePhase();
        }
        if (sim.nanoHealTimerSec > 0) {
          sim.nanoHealTimerSec -= dt;
          if (sim.nanoHealTimerSec <= 0) {
            sim.hullIntegrity = Math.min(100, sim.hullIntegrity + 8);
            sim.nanoStatus = '0.05s Nanolattice Re-Bonded';
          }
        }

        // 120.00s Armada Countdown
        if (sim.armadaSyncing) {
          const cd = stepArmadaCountdown(
            sim.armadaCountdownSec,
            sim.fastCountdown,
            sim.stageTriggered,
            dt
          );
          sim.armadaCountdownSec = cd.nextSec;
          sim.armadaStageLabel = cd.stageLabel;

          if (cd.triggerWingmen && !sim.wingmenActive) commands.toggleWingmen();
          if (cd.triggerShunt) commands.shuntPortalMass();
          if (cd.triggerTether) tetherMat.opacity = 0.9;
          if (cd.stage === 3) {
            const posArr = goldenTether.geometry.attributes.position.array as Float32Array;
            posArr[0] = mothershipRig.group.position.x;
            posArr[1] = mothershipRig.group.position.y;
            posArr[2] = mothershipRig.group.position.z;
            posArr[3] = portalRig.group.position.x;
            posArr[4] = portalRig.group.position.y;
            posArr[5] = portalRig.group.position.z;
            goldenTether.geometry.attributes.position.needsUpdate = true;
          }
          if (cd.completeJump) {
            completeArmadaJump();
          }
        }

        if (
          sim.portalJumpCooldownSec <= 0 &&
          activeObj.position.distanceTo(portalRig.group.position) < 92
        ) {
          completeArmadaJump();
        }

        // Mothership 360 Turrets
        for (let t = 0; t < mothershipRig.turrets.length; t++) {
          const tur = mothershipRig.turrets[t];
          tur.cooldown -= dt;
          let nearestEn: (typeof enemies)[number] | null = null;
          let minDist = 850;
          for (let e = 0; e < enemies.length; e++) {
            const d = enemies[e].mesh.position.distanceTo(mothershipRig.group.position);
            if (d < minDist) {
              minDist = d;
              nearestEn = enemies[e];
            }
          }
          if (nearestEn) {
            tur.pivot.lookAt(nearestEn.mesh.position);
            if (tur.cooldown <= 0) {
              tur.cooldown = 1.1 + Math.random() * 0.5;
              tur.pivot.getWorldPosition(_worldTurPos);
              _v3.subVectors(nearestEn.mesh.position, _worldTurPos).normalize();
              spawnPooledProjectile(_worldTurPos, _v3, 560, 0xffdd00, false, false);
            }
          }
        }

        // Wingmen Squadron
        if (sim.wingmenActive) {
          for (let i = 0; i < wingmen.length; i++) {
            const w = wingmen[i];
            w.angle += 1.6 * dt;
            const r = 28 + (i % 2) * 12;
            w.mesh.position.set(
              activeObj.position.x + Math.cos(w.angle) * r,
              activeObj.position.y + Math.sin(w.angle * 1.3) * 14,
              activeObj.position.z + Math.sin(w.angle) * r
            );
            w.mesh.quaternion.copy(activeObj.quaternion);
            w.cooldown -= dt;
            if (w.cooldown <= 0) {
              w.cooldown = 0.9 + Math.random() * 0.6;
              for (let e = 0; e < enemies.length; e++) {
                if (enemies[e].mesh.position.distanceTo(w.mesh.position) < 600) {
                  _v3.subVectors(enemies[e].mesh.position, w.mesh.position).normalize();
                  spawnPooledProjectile(w.mesh.position, _v3, 540, 0xbc13fe, false, false);
                  break;
                }
              }
            }
          }
        }

        // Enemy AI Policies (Approach, Orbit Strafe, Evade)
        for (let i = 0; i < enemies.length; i++) {
          const en = enemies[i];
          _v1.subVectors(activeObj.position, en.mesh.position);
          const dist = _v1.length();
          _v2.copy(_v1).normalize();

          if (dist > 360) {
            en.aiState = 'APPROACH';
            _v3.copy(_v2).multiplyScalar(115);
            en.vel.lerp(_v3, 2.5 * dt);
          } else if (dist > 130) {
            en.aiState = 'ORBIT_STRAFE';
            _v3
              .set(-_v2.z * en.strafeDir, 0.15, _v2.x * en.strafeDir)
              .normalize()
              .multiplyScalar(95);
            en.vel.lerp(_v3, 3.0 * dt);
          } else {
            en.aiState = 'EVADE';
            _v3.copy(_v2).negate().multiplyScalar(130);
            en.vel.lerp(_v3, 3.5 * dt);
          }

          en.mesh.position.addScaledVector(en.vel, dt);
          en.mesh.rotation.x += 1.2 * dt;
          en.mesh.rotation.y += 1.5 * dt;

          en.fireCooldown -= dt;
          if (en.fireCooldown <= 0 && dist < 680) {
            en.fireCooldown = 2.4 + Math.random() * 1.5;
            const timeToHit = dist / 380;
            _v3
              .copy(activeObj.position)
              .addScaledVector(sim.linearVel, timeToHit * 0.5)
              .sub(en.mesh.position)
              .normalize();
            spawnPooledProjectile(en.mesh.position, _v3, 380, 0xff0044, true, false);
          }
        }

        // Dreadnought Boss
        bossGroup.lookAt(activeObj.position);
        sim.bossCooldownSec -= dt;
        if (sim.bossCooldownSec <= 0) {
          sim.bossCooldownSec = 2.8;
          if (bossGroup.position.distanceTo(activeObj.position) < 1200) {
            _v3.subVectors(activeObj.position, bossGroup.position).normalize();
            spawnPooledProjectile(bossGroup.position, _v3, 440, 0xff3300, true, true);
          }
        }

        // Projectile Pool & Impact Evaluation
        for (let i = 0; i < MAX_PROJECTILES; i++) {
          const p = projectilePool[i];
          if (p.life <= 0) continue;

          p.mesh.position.addScaledVector(p.vel, dt);
          p.life -= dt;
          if (p.life <= 0) {
            p.mesh.visible = false;
            continue;
          }

          if (p.isHostile) {
            if (p.mesh.position.distanceTo(activeObj.position) < 16) {
              p.life = 0;
              p.mesh.visible = false;
              const outcome = evaluateHostileImpact(sim.phaseShift, p.isPlasma, Math.random());

              if (outcome.type === 'tunneled') {
                sim.tunneledCount++;
                sim.nanoStatus = `98% Phase Tunneled (#${sim.tunneledCount})`;
                setAlert('98% QUANTUM PHASE-SHIFT: HOSTILE SHOT TUNNELED HARMLESSLY', 'info');
              } else if (outcome.type === 'shear-graze') {
                sim.shearGrazeCount++;
                sim.hullIntegrity = Math.max(0, sim.hullIntegrity + outcome.hullDelta);
                sim.nanoHealTimerSec = 0.05;
                sim.shakeTrauma = Math.min(1.0, sim.shakeTrauma + 0.35);
                sim.nanoStatus = '2% Shear Graze · 0.05s Nano-Healing';
                setAlert('2% QUANTUM PHASE-SHEAR GRAZE! TIER-4 NANOLATTICE RE-BONDING IN 0.05s', 'crit');
              } else {
                escortRig.hexShieldMat.opacity = 0.9;
                sim.capacitorEJ = Math.min(CAPACITOR_MAX_EJ, sim.capacitorEJ + outcome.capacitorDelta);
                sim.totalHarvestedEJ += outcome.harvestedEJ;
                sim.hullIntegrity = Math.max(0, sim.hullIntegrity + outcome.hullDelta);
                sim.nanoHealTimerSec = 0.05;
                sim.shakeTrauma = Math.min(1.0, sim.shakeTrauma + 0.22);
                emitPooledParticles(activeObj.position, 1.0, 0.75, 0.1, 16, 70, 0.5);
                setAlert(
                  `TIER-2 HEX COILS REDIRECTED 92% HOSTILE IMPACT (+${outcome.capacitorDelta} EJ)`,
                  'success'
                );
              }

              if (sim.hullIntegrity <= 0) {
                sim.phase = 'gameover';
                sim.endReason = 'defeat';
                document.body.dataset.state = 'gameover';
                sim.keys = {};
                audioEngine.playTone(180, 45, 0.5, 'sawtooth');
                pushSnapshot(currentFps, dt * 1000);
              }
            }
          } else {
            for (let e = 0; e < enemies.length; e++) {
              const en = enemies[e];
              if (p.mesh.position.distanceTo(en.mesh.position) < (p.isPlasma ? 24 : 15)) {
                p.life = 0;
                p.mesh.visible = false;
                emitPooledParticles(en.mesh.position, 1.0, 0.35, 0.0, 30, 110, 0.75);
                respawnEnemy(en);
                sim.enemiesDestroyed += 1;
                sim.capacitorEJ = Math.min(CAPACITOR_MAX_EJ, sim.capacitorEJ + 10);
                sim.totalHarvestedEJ += 10;
                audioEngine.playTone(320, 90, 0.15, 'triangle');
                setAlert('HOSTILE CRUISER VAPORIZED! +10 EJ HARVESTED', 'success');
                break;
              }
            }
            if (p.life > 0 && p.mesh.position.distanceTo(bossGroup.position) < 52) {
              p.life = 0;
              p.mesh.visible = false;
              sim.bossHull = Math.max(0, sim.bossHull - (p.isPlasma ? 16 : 4));
              emitPooledParticles(p.mesh.position, 0.8, 0.1, 1.0, 20, 90, 0.6);
              if (sim.bossHull <= 0) {
                emitPooledParticles(bossGroup.position, 1.0, 0.2, 0.4, 90, 180, 1.2);
                sim.bossesDestroyed += 1;
                sim.hitstopSec = 0.05;
                sim.shakeTrauma = 0.9;
                sim.bossHull = 100;
                bossGroup.position.z -= 900;
                audioEngine.playTone(220, 55, 0.45, 'sawtooth');
                setAlert('HOSTILE CAPITAL DREADNOUGHT DESTROYED!', 'success');
              }
            }
          }
        }

        // Update GPU Particle Buffer
        for (let i = 0; i < MAX_PARTICLES; i++) {
          if (partLifetimes[i] > 0) {
            partLifetimes[i] -= dt;
            if (partLifetimes[i] <= 0) {
              partPositions[i * 3 + 1] = -99999;
            } else {
              partPositions[i * 3] += partVelocities[i].x * dt;
              partPositions[i * 3 + 1] += partVelocities[i].y * dt;
              partPositions[i * 3 + 2] += partVelocities[i].z * dt;
            }
          }
        }
        particleGeo.attributes.position.needsUpdate = true;
        particleGeo.attributes.color.needsUpdate = true;

        if (escortRig.hexShieldMat.opacity > 0) {
          escortRig.hexShieldMat.opacity = Math.max(0, escortRig.hexShieldMat.opacity - 1.8 * dt);
          escortRig.hexShieldMesh.rotation.y += 4.0 * dt;
        }
        escortRig.isolationBubble.rotation.y += 1.4 * dt;
        escortRig.spacePullerCone.rotation.z -= 5.0 * dt;
        portalRig.innerCasimirRing.rotation.z -= 2.2 * dt;
        portalRig.wormholeFunnelMesh.rotation.z += 1.2 * dt;

        sim.capacitorEJ = Math.min(CAPACITOR_MAX_EJ, sim.capacitorEJ + 4.5 * dt);
        sim.schStability = Math.min(100, sim.schStability + 1.8 * dt);
      }

      // Smooth Chase Camera + Trauma Shake + FOV Kick
      _forward.set(0, 0, -1).applyQuaternion(activeObj.quaternion);
      _v1
        .set(0, sim.mothershipControl ? 32 : 8.5, sim.mothershipControl ? 105 : 32)
        .applyQuaternion(activeObj.quaternion)
        .add(activeObj.position);
      camera.position.lerp(_v1, 1 - Math.exp(-8.0 * dt));

      _v2.copy(activeObj.position).addScaledVector(_forward, 95);
      _v2.y += sim.mothershipControl ? 6 : 2.5;
      camera.lookAt(_v2);

      const targetFov = sim.spacePuller ? 78 : sim.bubbleActive ? 69 : 65;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-6.0 * dt));
        camera.updateProjectionMatrix();
      }

      if (sim.shakeTrauma > 0.01) {
        const shakeAmt = sim.shakeTrauma * sim.shakeTrauma * 6.5;
        camera.position.x += (Math.random() - 0.5) * shakeAmt;
        camera.position.y += (Math.random() - 0.5) * shakeAmt;
        sim.shakeTrauma = Math.max(0, sim.shakeTrauma - 1.8 * dt);
      }

      drawTacticalRadar(activeObj);
      renderer.render(scene, camera);

      hudAccum += dt;
      if (hudAccum >= 0.1) {
        hudAccum = 0;
        pushSnapshot(currentFps, dt * 1000);
      }

      if (isSoftwareGl) afterDraw(stepAndRender);
      else frameId = requestAnimationFrame(stepAndRender);
    }

    if (isSoftwareGl) {
      stepAndRender();
    } else {
      frameId = requestAnimationFrame(stepAndRender);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('blur', clearHeldInputs);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      commandBusRef.current = null;

      textures.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [commandBusRef, radarCanvasRef, warpOverlayRef]);

  return (
    <div
      ref={mountRef}
      data-testid="simulation-canvas-mount"
      className="fixed inset-0 w-full h-full cursor-crosshair"
    />
  );
};
