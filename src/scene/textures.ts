import * as THREE from 'three';

export interface ProceduralTextureBundle {
  hullMap: THREE.CanvasTexture;
  hullBump: THREE.CanvasTexture;
  hexMap: THREE.CanvasTexture;
  glowCyan: THREE.CanvasTexture;
  glowAmber: THREE.CanvasTexture;
  glowMagenta: THREE.CanvasTexture;
  glowEmerald: THREE.CanvasTexture;
  glowCore: THREE.CanvasTexture;
  dispose: () => void;
}

function createHullAlbedoTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#132238';
  ctx.fillRect(0, 0, 256, 256);

  // Armor plating panels
  ctx.strokeStyle = '#253f63';
  ctx.lineWidth = 2;
  for (let i = 0; i < 256; i += 32) {
    ctx.strokeRect(i, 0, 32, 256);
    ctx.strokeRect(0, i, 256, 32);
  }

  // Subtle metallic wear streaks
  ctx.fillStyle = 'rgba(180, 220, 255, 0.05)';
  for (let y = 8; y < 256; y += 32) {
    ctx.fillRect(0, y, 256, 4);
  }

  // Precision conduit seams
  ctx.strokeStyle = 'rgba(0, 243, 255, 0.42)';
  ctx.lineWidth = 1;
  for (let i = 16; i < 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

function createHullBumpTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#303030';
  ctx.lineWidth = 3;
  for (let i = 0; i < 256; i += 32) {
    ctx.strokeRect(i, 0, 32, 256);
    ctx.strokeRect(0, i, 256, 32);
  }

  ctx.fillStyle = '#b4b4b4';
  for (let y = 6; y < 256; y += 64) {
    for (let x = 6; x < 256; x += 64) {
      ctx.fillRect(x, y, 3, 3);
      ctx.fillRect(x + 20, y, 3, 3);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

function createHexLatticeTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#ffbb33';
  ctx.lineWidth = 2;
  const r = 24;
  for (let y = 0; y < 280; y += r * 1.5) {
    for (let x = 0; x < 280; x += r * Math.sqrt(3)) {
      const cx = x + (Math.round(y / (r * 1.5)) % 2) * ((r * Math.sqrt(3)) / 2);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const px = cx + r * Math.cos(a);
        const py = y + r * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = maxAniso;
  return tex;
}

function createRadialGlowTexture(colorHex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, colorHex);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createProceduralTextures(renderer: THREE.WebGLRenderer): ProceduralTextureBundle {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);
  const hullMap = createHullAlbedoTexture(maxAniso);
  const hullBump = createHullBumpTexture(maxAniso);
  const hexMap = createHexLatticeTexture(maxAniso);
  const glowCyan = createRadialGlowTexture('#00f3ff');
  const glowAmber = createRadialGlowTexture('#ffaa00');
  const glowMagenta = createRadialGlowTexture('#ff2277');
  const glowEmerald = createRadialGlowTexture('#00ffaa');
  const glowCore = createRadialGlowTexture('#ffdd77');

  return {
    hullMap,
    hullBump,
    hexMap,
    glowCyan,
    glowAmber,
    glowMagenta,
    glowEmerald,
    glowCore,
    dispose: () => {
      hullMap.dispose();
      hullBump.dispose();
      hexMap.dispose();
      glowCyan.dispose();
      glowAmber.dispose();
      glowMagenta.dispose();
      glowEmerald.dispose();
      glowCore.dispose();
    },
  };
}
