import * as THREE from 'three';
import { morrisThorneEmbeddingZ } from '../physics/engine';
import { ProceduralTextureBundle } from './textures';

export interface EscortShipRig {
  group: THREE.Group;
  hullMat: THREE.MeshStandardMaterial;
  wingMat: THREE.MeshStandardMaterial;
  spacePullerCone: THREE.Mesh;
  isolationBubble: THREE.Mesh;
  hexShieldMesh: THREE.Mesh;
  hexShieldMat: THREE.MeshBasicMaterial;
}

export interface MothershipTurret {
  pivot: THREE.Group;
  cooldown: number;
}

export interface MothershipRig {
  group: THREE.Group;
  turrets: MothershipTurret[];
}

export interface WormholePortalRig {
  group: THREE.Group;
  innerCasimirRing: THREE.Mesh;
  wormholeFunnelMesh: THREE.Mesh;
}

export function buildEscortShip(textures: ProceduralTextureBundle): EscortShipRig {
  const group = new THREE.Group();

  // Varied roughness/metalness across hull, wings, canopy, nacelles, and coils
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.hullMap,
    bumpMap: textures.hullBump,
    bumpScale: 0.08,
    metalness: 0.85,
    roughness: 0.45,
    emissive: 0x051525,
    transparent: true,
    opacity: 1.0,
  });

  const noseMat = new THREE.MeshStandardMaterial({
    color: 0xcbe7ff,
    metalness: 0.92,
    roughness: 0.18,
    emissive: 0x041220,
    transparent: true,
    opacity: 1.0,
  });

  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x6ce5ff,
    map: textures.hullMap,
    emissive: 0x002d4a,
    metalness: 0.78,
    roughness: 0.35,
    transparent: true,
    opacity: 1.0,
  });

  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x00f3ff,
    emissive: 0x006688,
    metalness: 0.2,
    roughness: 0.1,
    clearcoat: 1.0,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0x78350f,
    metalness: 0.7,
    roughness: 0.25,
  });

  // 1. Primary Fuselage Spine
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 10.2, 8).rotateX(Math.PI / 2), hullMat);
  fuselage.position.set(0, 0, 1.2);
  group.add(fuselage);

  // 2. Forward Nose Cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.45, 5.2, 8).rotateX(-Math.PI / 2), noseMat);
  nose.position.set(0, 0, -6.5);
  group.add(nose);

  // 3. Cockpit Canopy
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 4.2), canopyMat);
  canopy.position.set(0, 1.25, -1.6);
  group.add(canopy);

  // 4. Swept Main Wings
  const wings = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.28, 3.6), wingMat);
  wings.position.set(0, 0, 1.6);
  group.add(wings);

  // 5-6. Twin Dorsal Wingtip Nacelles
  const nacelleGeo = new THREE.CylinderGeometry(0.65, 0.85, 5.2, 10).rotateX(Math.PI / 2);
  const leftNacelle = new THREE.Mesh(nacelleGeo, hullMat);
  leftNacelle.position.set(-5.6, 0.35, 2.0);
  const rightNacelle = new THREE.Mesh(nacelleGeo, hullMat);
  rightNacelle.position.set(5.6, 0.35, 2.0);
  group.add(leftNacelle, rightNacelle);

  // 7-8. Glowing Thruster Exhaust Rings
  const exhaustGeo = new THREE.TorusGeometry(0.68, 0.16, 8, 18);
  const leftExhaust = new THREE.Mesh(exhaustGeo, accentMat);
  leftExhaust.position.set(-5.6, 0.35, 4.65);
  const rightExhaust = new THREE.Mesh(exhaustGeo, accentMat);
  rightExhaust.position.set(5.6, 0.35, 4.65);
  group.add(leftExhaust, rightExhaust);

  // 9. Dorsal Higgs Field Emitter Ring
  const higgsRing = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.14, 8, 24), accentMat);
  higgsRing.rotation.x = Math.PI / 2;
  higgsRing.position.set(0, 0.8, 1.5);
  group.add(higgsRing);

  // 10. Space Puller ADM Cone (toggled by Shift)
  const spacePullerCone = new THREE.Mesh(
    new THREE.ConeGeometry(4.2, 16.5, 20, 2, true).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true, transparent: true, opacity: 0 })
  );
  spacePullerCone.position.set(0, 0, -14);
  group.add(spacePullerCone);

  // 11. 0/0 Higgs Isolation Bubble
  const isolationBubble = new THREE.Mesh(
    new THREE.SphereGeometry(7.8, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0 })
  );
  group.add(isolationBubble);

  // 12. Tier-2 Hexagonal Redirect Shield
  const hexShieldMat = new THREE.MeshBasicMaterial({
    map: textures.hexMap,
    color: 0xffaa00,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const hexShieldMesh = new THREE.Mesh(new THREE.SphereGeometry(8.5, 24, 24), hexShieldMat);
  group.add(hexShieldMesh);

  return {
    group,
    hullMat,
    wingMat,
    spacePullerCone,
    isolationBubble,
    hexShieldMesh,
    hexShieldMat,
  };
}

export function buildMothership(textures: ProceduralTextureBundle): MothershipRig {
  const group = new THREE.Group();

  const msMat = new THREE.MeshStandardMaterial({
    color: 0xd0e3ff,
    map: textures.hullMap,
    bumpMap: textures.hullBump,
    bumpScale: 0.18,
    metalness: 0.82,
    roughness: 0.55,
    emissive: 0x061020,
  });

  const superMat = new THREE.MeshStandardMaterial({
    color: 0x8fb5db,
    metalness: 0.88,
    roughness: 0.24,
    emissive: 0x081a30,
  });

  // 1. Main Carrier Spine
  const mainHull = new THREE.Mesh(new THREE.BoxGeometry(92, 20, 325), msMat);
  group.add(mainHull);

  // 2. Forward Armored Prow
  const prow = new THREE.Mesh(new THREE.ConeGeometry(42, 85, 4).rotateY(Math.PI / 4).rotateX(-Math.PI / 2), superMat);
  prow.scale.set(1.2, 0.35, 1.0);
  prow.position.set(0, 0, -200);
  group.add(prow);

  // 3. Elevated Command Bridge
  const msBridge = new THREE.Mesh(new THREE.BoxGeometry(38, 18, 110), superMat);
  msBridge.position.set(0, 19, 45);
  group.add(msBridge);

  // 4. Outrigger Flight Decks
  const deckGeo = new THREE.BoxGeometry(26, 8, 210);
  const leftDeck = new THREE.Mesh(deckGeo, superMat);
  leftDeck.position.set(-58, -2, 10);
  const rightDeck = new THREE.Mesh(deckGeo, superMat);
  rightDeck.position.set(58, -2, 10);
  group.add(leftDeck, rightDeck);

  // 5. 12 Glowing Higgs/Casimir Cores
  const coreGeo = new THREE.SphereGeometry(4.8, 12, 12);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
  for (let i = 0; i < 12; i++) {
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(i % 2 === 0 ? -49 : 49, 0, -125 + Math.floor(i / 2) * 50);
    group.add(core);
  }

  // 6. 4 Articulated 360-degree Turrets
  const turrets: MothershipTurret[] = [];
  const turretBaseGeo = new THREE.SphereGeometry(4, 10, 10);
  const barrelGeo = new THREE.CylinderGeometry(0.9, 0.9, 16, 8).rotateX(Math.PI / 2);
  const barrelMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });

  [
    new THREE.Vector3(-32, 12, -90),
    new THREE.Vector3(32, 12, -90),
    new THREE.Vector3(-32, 12, 10),
    new THREE.Vector3(32, 12, 10),
  ].forEach((off) => {
    const tPivot = new THREE.Group();
    tPivot.position.copy(off);
    tPivot.add(new THREE.Mesh(turretBaseGeo, superMat));
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(0, 1, -8);
    tPivot.add(barrel);
    group.add(tPivot);
    turrets.push({ pivot: tPivot, cooldown: Math.random() * 1.2 });
  });

  return { group, turrets };
}

export function createMorrisThorneFunnelGeometry(): THREE.BufferGeometry {
  const radialSegs = 26;
  const angularSegs = 44;
  const b0 = 32;
  const rMax = 96;
  const positions: number[] = [];
  const indices: number[] = [];

  for (const side of [-1, 1] as const) {
    const baseIdx = positions.length / 3;
    for (let i = 0; i <= radialSegs; i++) {
      const u = i / radialSegs;
      const r = b0 + u * (rMax - b0);
      const z = morrisThorneEmbeddingZ(r, b0, side) * 0.85;
      for (let j = 0; j <= angularSegs; j++) {
        const theta = (j / angularSegs) * Math.PI * 2;
        positions.push(r * Math.cos(theta), r * Math.sin(theta), z);
      }
    }
    for (let i = 0; i < radialSegs; i++) {
      for (let j = 0; j < angularSegs; j++) {
        const a = baseIdx + i * (angularSegs + 1) + j;
        const b = a + angularSegs + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

export function buildWormholePortal(textures: ProceduralTextureBundle): WormholePortalRig {
  const group = new THREE.Group();

  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(105, 7.5, 20, 72),
    new THREE.MeshStandardMaterial({
      color: 0xaad4f5,
      map: textures.hullMap,
      bumpMap: textures.hullBump,
      bumpScale: 0.15,
      metalness: 0.9,
      roughness: 0.25,
      emissive: 0x00263a,
    })
  );
  group.add(outerRing);

  // Stabilizer Pylons around Torus
  const pylonGeo = new THREE.BoxGeometry(10, 22, 16);
  const pylonMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.75,
    roughness: 0.52,
    emissive: 0x062033,
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pylon = new THREE.Mesh(pylonGeo, pylonMat);
    pylon.position.set(Math.cos(a) * 112, Math.sin(a) * 112, 0);
    pylon.rotation.z = a + Math.PI / 2;
    group.add(pylon);
  }

  const innerCasimirRing = new THREE.Mesh(
    new THREE.TorusGeometry(97, 2.8, 12, 48),
    new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true })
  );
  group.add(innerCasimirRing);

  const wormholeFunnelMesh = new THREE.Mesh(
    createMorrisThorneFunnelGeometry(),
    new THREE.MeshBasicMaterial({ color: 0x00e1ff, wireframe: true, transparent: true, opacity: 0.45 })
  );
  group.add(wormholeFunnelMesh);

  return { group, innerCasimirRing, wormholeFunnelMesh };
}

export function buildBossDreadnought(textures: ProceduralTextureBundle): THREE.Group {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xc22a4e,
    map: textures.hullMap,
    bumpMap: textures.hullBump,
    bumpScale: 0.15,
    emissive: 0x330011,
    metalness: 0.85,
    roughness: 0.48,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xff6b35,
    emissive: 0x551100,
    metalness: 0.9,
    roughness: 0.2,
  });

  // Main dreadnought hull
  group.add(new THREE.Mesh(new THREE.BoxGeometry(46, 16, 145), hullMat));
  // Armored prow blade
  const prow = new THREE.Mesh(new THREE.ConeGeometry(24, 48, 4).rotateY(Math.PI / 4).rotateX(-Math.PI / 2), trimMat);
  prow.position.set(0, 0, -96);
  group.add(prow);
  // Twin flanking citadel sponsons
  const sponsonGeo = new THREE.BoxGeometry(16, 12, 95);
  const leftSponson = new THREE.Mesh(sponsonGeo, hullMat);
  leftSponson.position.set(-30, 4, 12);
  const rightSponson = new THREE.Mesh(sponsonGeo, hullMat);
  rightSponson.position.set(30, 4, 12);
  group.add(leftSponson, rightSponson);
  // Core reactor spine
  const reactor = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7, 65, 12).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff2244 })
  );
  reactor.position.set(0, 12, 0);
  group.add(reactor);

  return group;
}

export function createGlowSprite(tex: THREE.CanvasTexture, scale: number, opacity = 0.85): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: tex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}
