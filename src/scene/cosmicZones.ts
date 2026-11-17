import * as THREE from 'three';
import { createGlowSprite } from './meshes';
import { ProceduralTextureBundle } from './textures';

export interface CosmicEnvironments {
  oortGroup: THREE.Group;
  oortComets: THREE.Group[];
  interstellarGroup: THREE.Group;
  galaxyGroup: THREE.Group;
  spiralGalaxyMesh: THREE.Points;
  universeGroup: THREE.Group;
  cosmicWebLines: THREE.LineSegments;
  multiverseGroup: THREE.Group;
  bubbleUniverses: THREE.Mesh[];
  setVisibleZone: (idx: number, anchorPos: THREE.Vector3) => void;
  updateZoneMotion: (
    idx: number,
    localSpeedMS: number,
    spacePuller: boolean,
    dt: number
  ) => void;
}

export function buildCosmicEnvironments(
  scene: THREE.Scene,
  textures: ProceduralTextureBundle
): CosmicEnvironments {
  // ZONE 1: Oort Cloud (60 3D Icy Comets with Tails)
  const oortGroup = new THREE.Group();
  scene.add(oortGroup);
  const oortComets: THREE.Group[] = [];
  const cometHeadGeo = new THREE.DodecahedronGeometry(6.5, 1);
  const cometHeadMat = new THREE.MeshStandardMaterial({
    color: 0xaeeeff,
    emissive: 0x114466,
    roughness: 0.35,
    metalness: 0.15,
  });
  const cometTailGeo = new THREE.ConeGeometry(4.5, 36, 8, 1, true).rotateX(-Math.PI / 2);
  const cometTailMat = new THREE.MeshBasicMaterial({
    color: 0x66ddff,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
  });

  for (let i = 0; i < 60; i++) {
    const cg = new THREE.Group();
    cg.add(new THREE.Mesh(cometHeadGeo, cometHeadMat));
    const tail = new THREE.Mesh(cometTailGeo, cometTailMat);
    tail.position.set(0, 0, 19);
    cg.add(tail);
    cg.position.set(
      (Math.random() - 0.5) * 2400,
      (Math.random() - 0.5) * 1200,
      -Math.random() * 2400
    );
    oortGroup.add(cg);
    oortComets.push(cg);
  }

  // ZONE 2: Interstellar Space (28 Volumetric Ionized Nebula Clouds)
  const interstellarGroup = new THREE.Group();
  interstellarGroup.visible = false;
  scene.add(interstellarGroup);
  const nebTextures = [
    textures.glowMagenta,
    textures.glowCyan,
    textures.glowEmerald,
    textures.glowAmber,
  ];
  for (let i = 0; i < 28; i++) {
    const neb = createGlowSprite(nebTextures[i % 4], 400 + Math.random() * 320, 0.32);
    neb.position.set(
      (Math.random() - 0.5) * 3200,
      (Math.random() - 0.5) * 1600,
      -300 - Math.random() * 2800
    );
    interstellarGroup.add(neb);
  }

  // ZONE 3: Spiral Galaxy (6,000-Star 4-Arm 3D Spiral Disk + Galactic Core)
  const galaxyGroup = new THREE.Group();
  galaxyGroup.visible = false;
  galaxyGroup.position.set(0, -160, -1500);
  scene.add(galaxyGroup);
  const galStarCount = 6000;
  const galGeo = new THREE.BufferGeometry();
  const galPos = new Float32Array(galStarCount * 3);
  const galCols = new Float32Array(galStarCount * 3);
  for (let i = 0; i < galStarCount; i++) {
    const arm = i % 4;
    const rad = Math.random() * 1600 + 40;
    const ang = rad * 0.0045 + (arm * Math.PI) / 2;
    const sp = (Math.random() - 0.5) * 140;
    galPos[i * 3] = Math.cos(ang) * rad + sp;
    galPos[i * 3 + 1] = (Math.random() - 0.5) * 80;
    galPos[i * 3 + 2] = Math.sin(ang) * rad + sp;
    const isCore = rad < 380;
    galCols[i * 3] = isCore ? 1.0 : 0.15;
    galCols[i * 3 + 1] = 0.85;
    galCols[i * 3 + 2] = 1.0;
  }
  galGeo.setAttribute('position', new THREE.BufferAttribute(galPos, 3));
  galGeo.setAttribute('color', new THREE.BufferAttribute(galCols, 3));
  const spiralGalaxyMesh = new THREE.Points(
    galGeo,
    new THREE.PointsMaterial({ size: 5.5, vertexColors: true, transparent: true, opacity: 0.9 })
  );
  spiralGalaxyMesh.rotation.x = 0.42;
  galaxyGroup.add(spiralGalaxyMesh);
  galaxyGroup.add(createGlowSprite(textures.glowCore, 680, 0.8));

  // ZONE 4: Observable Universe (Cosmic Web Supercluster Filaments & Quasar Nodes)
  const universeGroup = new THREE.Group();
  universeGroup.visible = false;
  scene.add(universeGroup);
  const webNodes: THREE.Vector3[] = [];
  for (let i = 0; i < 55; i++) {
    const pt = new THREE.Vector3(
      (Math.random() - 0.5) * 3200,
      (Math.random() - 0.5) * 1800,
      -200 - Math.random() * 3000
    );
    webNodes.push(pt);
    const ns = createGlowSprite(i % 2 === 0 ? textures.glowAmber : textures.glowMagenta, 90, 0.75);
    ns.position.copy(pt);
    universeGroup.add(ns);
  }
  const webPts: THREE.Vector3[] = [];
  for (let i = 0; i < webNodes.length; i++) {
    for (let j = i + 1; j < webNodes.length; j++) {
      if (webNodes[i].distanceTo(webNodes[j]) < 920) {
        webPts.push(webNodes[i], webNodes[j]);
      }
    }
  }
  const cosmicWebLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(webPts),
    new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.48 })
  );
  universeGroup.add(cosmicWebLines);

  // ZONE 5: Multiverse Bulk-Space (16 Rotating Parallel Bubble Universes)
  const multiverseGroup = new THREE.Group();
  multiverseGroup.visible = false;
  scene.add(multiverseGroup);
  const bubbleUniverses: THREE.Mesh[] = [];
  const bCols = [0x00f3ff, 0xff0066, 0x00ff88, 0xbc13fe, 0xffcc00];
  for (let i = 0; i < 16; i++) {
    const bs = new THREE.Mesh(
      new THREE.SphereGeometry(130 + (i % 3) * 50, 24, 24),
      new THREE.MeshBasicMaterial({
        map: textures.hexMap,
        color: bCols[i % 5],
        wireframe: i % 2 === 0,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
      })
    );
    bs.position.set(
      (Math.random() - 0.5) * 3000,
      (Math.random() - 0.5) * 1600,
      -300 - Math.random() * 2800
    );
    multiverseGroup.add(bs);
    bubbleUniverses.push(bs);
  }

  return {
    oortGroup,
    oortComets,
    interstellarGroup,
    galaxyGroup,
    spiralGalaxyMesh,
    universeGroup,
    cosmicWebLines,
    multiverseGroup,
    bubbleUniverses,
    setVisibleZone(idx: number, anchorPos: THREE.Vector3) {
      oortGroup.visible = idx === 0;
      interstellarGroup.visible = idx === 1;
      galaxyGroup.visible = idx === 2;
      universeGroup.visible = idx === 3;
      multiverseGroup.visible = idx === 4;

      if (idx === 0) oortGroup.position.copy(anchorPos);
      if (idx === 1) interstellarGroup.position.copy(anchorPos);
      if (idx === 2) galaxyGroup.position.set(anchorPos.x, anchorPos.y - 160, anchorPos.z - 1400);
      if (idx === 3) universeGroup.position.copy(anchorPos);
      if (idx === 4) multiverseGroup.position.copy(anchorPos);
    },
    updateZoneMotion(idx: number, localSpeedMS: number, spacePuller: boolean, dt: number) {
      if (idx === 0) {
        const speed = (localSpeedMS * 0.6 + (spacePuller ? 450 : 25)) * dt;
        for (let i = 0; i < oortComets.length; i++) {
          const c = oortComets[i];
          c.position.z += speed;
          if (c.position.z > 1200) c.position.z -= 2400;
        }
      } else if (idx === 2) {
        spiralGalaxyMesh.rotation.y += 0.18 * dt;
      } else if (idx === 3) {
        cosmicWebLines.rotation.y += 0.06 * dt;
      } else if (idx === 4) {
        for (let i = 0; i < bubbleUniverses.length; i++) {
          bubbleUniverses[i].rotation.y += 0.35 * dt;
        }
      }
    },
  };
}
