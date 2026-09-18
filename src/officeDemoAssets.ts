import Phaser from "phaser";
import officeBackgroundUrl from "../assets/scenes/office-18-expanded.png?url";
import meetingBackgroundUrl from "../assets/scenes/meeting-room-21-expanded.png?url";
import pantryBackgroundUrl from "../assets/scenes/pantry-24-expanded.png?url";
import receptionBackgroundUrl from "../assets/scenes/reception-03-expanded.png?url";
import bossOfficeBackgroundUrl from "../assets/scenes/boss-office-06-expanded.png?url";
import maleSheetUrl from "../assets/character-design/male-office-worker-sheet.png?url";
import femaleSheetUrl from "../assets/character-design/female-office-worker-sheet.png?url";
import coworkerSheetUrl from "../assets/character-design/coworker-enemy-sheet.png?url";
import bossSheetUrl from "../assets/character-design/boss-enemy-sheet.png?url";
import clientSheetUrl from "../assets/character-design/client-enemy-sheet.png?url";
import blackPotUrl from "../assets/projectiles/black-pot.png?url";
import flyingPancakeUrl from "../assets/projectiles/flying-pancake.png?url";

export interface SceneConfig {
  id: string;
  name: string;
  hour: number;
  textureKey: string;
  imageUrl: string;
  playArea: { left: number; right: number; top: number; bottom: number };
}

// All five scenes use the same 1280×720 framing and the same character scale.
// The floor ranges keep complete character silhouettes clear of the furniture.
export const SCENES: SceneConfig[] = [
  { id: "office", name: "办公室", hour: 18, textureKey: "scene-office-18", imageUrl: officeBackgroundUrl,
    playArea: { left: 230, right: 1080, top: 455, bottom: 665 } },
  { id: "meeting", name: "会议室", hour: 21, textureKey: "scene-meeting-21", imageUrl: meetingBackgroundUrl,
    playArea: { left: 150, right: 1130, top: 430, bottom: 670 } },
  { id: "pantry", name: "茶水间", hour: 24, textureKey: "scene-pantry-24", imageUrl: pantryBackgroundUrl,
    playArea: { left: 130, right: 940, top: 445, bottom: 670 } },
  { id: "reception", name: "公司前台", hour: 27, textureKey: "scene-reception-03", imageUrl: receptionBackgroundUrl,
    playArea: { left: 120, right: 1160, top: 390, bottom: 670 } },
  { id: "boss", name: "老板办公室", hour: 30, textureKey: "scene-boss-06", imageUrl: bossOfficeBackgroundUrl,
    playArea: { left: 170, right: 1020, top: 430, bottom: 670 } },
];

export function getSceneForHour(hour: number, previewId?: string): SceneConfig {
  return SCENES.find(({ id }) => id === previewId) ?? SCENES.find((scene) => scene.hour === hour) ?? SCENES[0];
}

export const CHARACTER_SHEETS = {
  male: maleSheetUrl,
  female: femaleSheetUrl,
  coworker: coworkerSheetUrl,
  boss: bossSheetUrl,
  client: clientSheetUrl,
} as const;

export const CHARACTER_TEXTURES = {
  male: "office-worker-male",
  female: "office-worker-female",
  coworker: "enemy-coworker",
  boss: "enemy-boss",
  client: "enemy-client",
} as const;

export const PROJECTILE_TEXTURES = {
  pot: "projectile-black-pot",
  pancake: "projectile-flying-pancake",
} as const;

interface SpriteFrame {
  source: keyof typeof CHARACTER_SHEETS;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Single standing / side-view poses from the approved concept sheets.
const spriteFrames: Record<keyof typeof CHARACTER_TEXTURES, SpriteFrame> = {
  male: { source: "male", x: 486, y: 42, width: 125, height: 240 },
  female: { source: "female", x: 495, y: 42, width: 140, height: 242 },
  coworker: { source: "coworker", x: 620, y: 52, width: 145, height: 278 },
  boss: { source: "boss", x: 592, y: 52, width: 118, height: 206 },
  client: { source: "client", x: 523, y: 89, width: 166, height: 286 },
};

// Four consecutive side-view run poses per player, cropped from the original
// approved concept sheets. Buff art remains separate so effects can coexist.
const playerRunFrames: Record<"male" | "female", SpriteFrame[]> = {
  male: [
    { source: "male", x: 850, y: 38, width: 155, height: 246 },
    { source: "male", x: 1005, y: 38, width: 165, height: 246 },
    { source: "male", x: 1166, y: 38, width: 164, height: 246 },
    { source: "male", x: 1327, y: 38, width: 185, height: 246 },
  ],
  female: [
    { source: "female", x: 775, y: 38, width: 135, height: 224 },
    { source: "female", x: 915, y: 38, width: 140, height: 224 },
    { source: "female", x: 1060, y: 38, width: 145, height: 224 },
    { source: "female", x: 1210, y: 38, width: 145, height: 224 },
  ],
};

export function preloadGameAssets(scene: Phaser.Scene) {
  for (const { textureKey, imageUrl } of SCENES) scene.load.image(textureKey, imageUrl);
  for (const [key, url] of Object.entries(CHARACTER_SHEETS)) {
    scene.load.image(`concept-${key}`, url);
  }
  scene.load.image("source-black-pot", blackPotUrl);
  scene.load.image("source-flying-pancake", flyingPancakeUrl);
}

// The original design sheets remain untouched. This extracts one pose in memory
// so gameplay can render it without a rectangular concept-sheet background.
export function prepareGameSprites(scene: Phaser.Scene) {
  prepareProjectileSprite(scene, "source-black-pot", PROJECTILE_TEXTURES.pot);
  prepareProjectileSprite(scene, "source-flying-pancake", PROJECTILE_TEXTURES.pancake);
  for (const [key, frame] of Object.entries(spriteFrames) as [keyof typeof CHARACTER_TEXTURES, SpriteFrame][]) {
    addConceptFrame(scene, CHARACTER_TEXTURES[key], frame);
  }
  for (const gender of ["male", "female"] as const) {
    playerRunFrames[gender].forEach((frame, index) => {
      addConceptFrame(scene, `${CHARACTER_TEXTURES[gender]}-run-${index}`, frame, true);
    });
  }
}

function addConceptFrame(scene: Phaser.Scene, textureKey: string, frame: SpriteFrame, isolate = false) {
  if (scene.textures.exists(textureKey)) return;
  const source = scene.textures.get(`concept-${frame.source}`).getSourceImage() as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
  removeConceptSheetBackdrop(context, frame.width, frame.height);
  if (isolate) keepMainFigure(context, frame.width, frame.height);
  scene.textures.addCanvas(textureKey, canvas);
  scene.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function keepMainFigure(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const visited = new Uint8Array(width * height);
  let largest: number[] = [];
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || pixels[start * 4 + 3] < 32) continue;
    const component = [start];
    visited[start] = 1;
    for (let head = 0; head < component.length; head++) {
      const current = component[head];
      const x = current % width;
      const y = Math.floor(current / width);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (visited[next] || pixels[next * 4 + 3] < 32) continue;
          visited[next] = 1;
          component.push(next);
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  const keep = new Uint8Array(width * height);
  for (const index of largest) keep[index] = 1;
  for (let index = 0; index < keep.length; index++) {
    if (!keep[index]) pixels[index * 4 + 3] = 0;
  }
  context.putImageData(image, 0, 0);
}

// Generated sprite PNGs retain generous transparent margins. Trim those margins
// in memory so the visible art, not the source canvas, determines gameplay scale.
function prepareProjectileSprite(scene: Phaser.Scene, sourceKey: string, textureKey: string) {
  if (scene.textures.exists(textureKey)) return;
  const source = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
  const scan = document.createElement("canvas");
  scan.width = source.width;
  scan.height = source.height;
  const scanContext = scan.getContext("2d", { willReadFrequently: true })!;
  scanContext.drawImage(source, 0, 0);
  const pixels = scanContext.getImageData(0, 0, source.width, source.height).data;
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (pixels[(y * source.width + x) * 4 + 3] < 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = maxX < 0 ? source.width : maxX - minX + 1;
  canvas.height = maxY < 0 ? source.height : maxY - minY + 1;
  canvas.getContext("2d")!.drawImage(source, maxX < 0 ? 0 : -minX, maxY < 0 ? 0 : -minY);
  scene.textures.addCanvas(textureKey, canvas);
  scene.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function removeConceptSheetBackdrop(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const leftBackground = new Uint8Array(height * 3);
  const rightBackground = new Uint8Array(height * 3);

  for (let y = 0; y < height; y++) {
    const left = (y * width + 1) * 4;
    const right = (y * width + width - 2) * 4;
    for (let channel = 0; channel < 3; channel++) {
      leftBackground[y * 3 + channel] = pixels[left + channel];
      rightBackground[y * 3 + channel] = pixels[right + channel];
    }
  }

  const isBackground = (index: number) => {
    const y = Math.floor(index / width);
    const pixel = index * 4;
    let leftDistance = 0;
    let rightDistance = 0;
    for (let channel = 0; channel < 3; channel++) {
      leftDistance += Math.abs(pixels[pixel + channel] - leftBackground[y * 3 + channel]);
      rightDistance += Math.abs(pixels[pixel + channel] - rightBackground[y * 3 + channel]);
    }
    return Math.min(leftDistance, rightDistance) < 62;
  };

  let head = 0;
  let tail = 0;
  const enqueue = (index: number) => {
    if (visited[index] || !isBackground(index)) return;
    visited[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index < width * (height - 1)) enqueue(index + width);
  }

  for (let index = 0; index < visited.length; index++) {
    if (visited[index]) pixels[index * 4 + 3] = 0;
  }
  context.putImageData(image, 0, 0);
}
