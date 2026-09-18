import Phaser from "phaser";
import "./styles.css";
import {
  CHARACTER_TEXTURES,
  PROJECTILE_TEXTURES,
  getSceneForHour,
  preloadGameAssets,
  prepareGameSprites,
  type SceneConfig,
} from "./officeDemoAssets";
import toiletIdleUrl from "../assets/pause/toilet-idle.png?url";
import toiletCaughtUrl from "../assets/pause/toilet-caught.png?url";
import phoneIdleUrl from "../assets/pause/phone-idle.png?url";
import phoneCaughtUrl from "../assets/pause/phone-caught.png?url";
import femaleToiletIdleUrl from "../assets/pause/toilet-idle-female.png?url";
import femaleToiletCaughtUrl from "../assets/pause/toilet-caught-female.png?url";
import femalePhoneIdleUrl from "../assets/pause/phone-idle-female.png?url";
import femalePhoneCaughtUrl from "../assets/pause/phone-caught-female.png?url";

type Gender = "male" | "female";
type Phase = "intro" | "title" | "playing" | "paused" | "roundEnd" | "result";
type Direction = "left" | "right";
type EnemyKind = "coworker" | "boss" | "client";
type ProjectileKind = "pot" | "pancake";
type PauseMode = "toilet" | "phone";
type AchievementRank = "S" | "A" | "B" | "C";

interface Achievement {
  id: string;
  name: string;
  description: string;
  condition: string;
  rank: AchievementRank;
}

interface RoundStats {
  peakPots: number;
  pancakes: number;
  rageBursts: number;
  successfulBlocks: number;
  maxTaskPopups: number;
  pauseSeconds: number;
}

interface RunState {
  phase: Phase;
  gender: Gender | null;
  nickname: string;
  startedAt: string;
  round: number;
  gameHour: number;
  timeLeft: number;
  pots: number;
  pancakes: number;
  rage: number;
  achievements: Achievement[];
  achievementIds: Set<string>;
  stats: RoundStats;
  endedBySuddenDeath: boolean;
  fixedAchievement?: Achievement;
}

interface Enemy {
  id: number;
  kind: EnemyKind;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  bornAt: number;
  attacked: boolean;
  attackKind: ProjectileKind | null;
  line: string;
  spoke: boolean;
  velocity: Phaser.Math.Vector2;
}

interface Projectile {
  kind: ProjectileKind;
  shape: Phaser.GameObjects.Image;
  velocity: Phaser.Math.Vector2;
  size: number;
}

interface Laser {
  rect: Phaser.GameObjects.Rectangle;
  warning: Phaser.GameObjects.Rectangle;
  lockMarker: Phaser.GameObjects.Arc;
  sourceSide: Direction;
  lockedY: number;
  bornAt: number;
  activeAt: number;
  deadAt: number;
  fired: boolean;
  hit: boolean;
}

interface TaskPopup {
  id: number;
  element: HTMLDivElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const WIDTH = 1280;
const HEIGHT = 720;
const ROUND_SECONDS = 180;
const BASE_SPEED = 260;
const POT_SLOW = 0.08;
const MAX_SLOW = 0.5;
const MAX_ENEMIES = 3;
const ENEMY_SPAWN_MS = 2800;
const ENEMY_LIFE_MS = 4500;
const ENEMY_ATTACK_MS = 1500;
const TASK_INTERVAL_MS = 15000;
const PAUSE_IMAGES: Record<Gender, Record<PauseMode, { idle: string; caught: string }>> = {
  male: {
    toilet: { idle: toiletIdleUrl, caught: toiletCaughtUrl },
    phone: { idle: phoneIdleUrl, caught: phoneCaughtUrl },
  },
  female: {
    toilet: { idle: femaleToiletIdleUrl, caught: femaleToiletCaughtUrl },
    phone: { idle: femalePhoneIdleUrl, caught: femalePhoneCaughtUrl },
  },
};
// The optional query parameter makes each scene easy to inspect without waiting three minutes.
const SCENE_PREVIEW_ID = new URLSearchParams(window.location.search).get("scene") ?? undefined;

const achievements: Record<string, Achievement> = {
  offAt18: { id: "offAt18", name: "18:00准点下班", description: "下班这件事，讲究一个胆识。", condition: "在第 1 局选择下班", rank: "C" },
  offAt21: { id: "offAt21", name: "996福报人", description: "你看，福报这不就来了吗。", condition: "进入第 2 局后选择下班", rank: "B" },
  king: { id: "king", name: "卷王", description: "别人下班，你开始发光。", condition: "进入第 3 局后选择下班", rank: "A" },
  king2: { id: "king2", name: "卷王之王", description: "办公室最后的灯，是你。", condition: "进入第 4 局后选择下班", rank: "S" },
  sudden: { id: "sudden", name: "加班猝死", description: "太阳照常升起，但你已经下不了班了。", condition: "完成第 5 局，进入最终结局", rank: "S" },
  potKing: { id: "potKing", name: "锅王之王", description: "同时背着 23 口锅。", condition: "同一局同时背着 23 口锅", rank: "S" },
  bornWorker: { id: "bornWorker", name: "天生牛马", description: "连续吃掉 18 个飞饼。", condition: "同一局连续吃掉 18 个飞饼", rank: "S" },
  rage: { id: "rage", name: "红温了", description: "怒气达到 3/3。", condition: "怒气达到 3/3", rank: "B" },
  passPot: { id: "passPot", name: "甩锅成功", description: "用背后的锅挡住甲方激光。", condition: "背锅时用背部挡住甲方激光", rank: "A" },
  light: { id: "light", name: "身轻如燕", description: "背锅超过 10 口后成功清空负面状态。", condition: "背锅超过 10 口后格挡激光并清空状态", rank: "S" },
  numb: { id: "numb", name: "腿麻了", description: "时间暂停了，腿也暂停了。", condition: "带薪拉屎暂停持续 60 秒", rank: "C" },
  caught: { id: "caught", name: "摸鱼被抓扣工资", description: "摸鱼有风险，暂停需谨慎。", condition: "刷手机摸鱼暂停持续 60 秒", rank: "C" },
  early: { id: "early", name: "早退", description: "才干了几分钟就想走，你是真不想装了。", condition: "第 1 局暂停时选择下班", rank: "C" },
  slipped: { id: "slipped", name: "溜了溜了", description: "活是干不完的，人先走一步。", condition: "第 2 局及以后暂停时选择下班", rank: "B" },
  tooManyTasks: {
    id: "tooManyTasks",
    name: "干不完，根本干不完",
    description: "这么点活都干不完，是不是该反思一下自己的工作效率？",
    condition: "同屏出现 5 个工作任务弹窗",
    rank: "B",
  },
};

const rankOrder: Record<AchievementRank, number> = { S: 0, A: 1, B: 2, C: 3 };
const rankColors: Record<AchievementRank, string> = { S: "#ff6575", A: "#f4d35e", B: "#39f0ff", C: "#a8b7c9" };

function byDifficulty(items: Achievement[]) {
  return [...items].sort((first, second) => rankOrder[first.rank] - rankOrder[second.rank]);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

type AchievementTone = "gold" | "cyan" | "red" | "pink";

const achievementVisuals: Record<string, { mark: string; category: string; tone: AchievementTone }> = {
  offAt18: { mark: "18", category: "下班成就", tone: "gold" },
  offAt21: { mark: "21", category: "下班成就", tone: "gold" },
  king: { mark: "卷", category: "下班成就", tone: "gold" },
  king2: { mark: "冠", category: "下班成就", tone: "gold" },
  sudden: { mark: "终", category: "最终成就", tone: "red" },
  potKing: { mark: "锅", category: "状态成就", tone: "cyan" },
  bornWorker: { mark: "饼", category: "状态成就", tone: "cyan" },
  rage: { mark: "怒", category: "状态成就", tone: "red" },
  passPot: { mark: "挡", category: "状态成就", tone: "cyan" },
  light: { mark: "轻", category: "状态成就", tone: "cyan" },
  numb: { mark: "麻", category: "暂停成就", tone: "pink" },
  caught: { mark: "抓", category: "暂停成就", tone: "pink" },
  early: { mark: "早", category: "暂停成就", tone: "pink" },
  slipped: { mark: "溜", category: "暂停成就", tone: "pink" },
  tooManyTasks: { mark: "忙", category: "干扰成就", tone: "red" },
};

function renderAchievementCard(achievement: Achievement, featured = false) {
  const visual = achievementVisuals[achievement.id];
  return `
    <article class="achievement-card achievement-card--${visual.tone} ${featured ? "achievement-card--featured" : ""}">
      <div class="achievement-medal" aria-hidden="true">${visual.mark}</div>
      <div class="achievement-copy">
        <span class="achievement-category">${visual.category}</span>
        <strong>${achievement.name}</strong>
        <p>达成条件：${achievement.condition}</p>
      </div>
      <span class="achievement-rank achievement-rank--${achievement.rank}" aria-label="${achievement.rank} 级成就">${achievement.rank}</span>
    </article>
  `;
}

const coworkerLines = ["这不是我负责的", "我只是协助", "我以为你已经做了", "这个一直是你在跟", "我没收到通知", "可能沟通有误会"];
const bossPancakeLines = ["这是一次成长机会", "做好了明年升职", "公司不会亏待你", "我很看好你", "年底一定有惊喜"];
const bossPotLines = ["你来牵头一下", "这个事情你最熟", "辛苦你多承担一点"];
const clientLines = ["这里改一下", "很简单，就微调一下", "感觉不够高级", "再大气一点", "我说不清，就是感觉不对", "明天上午要"];

function freshRoundStats(): RoundStats {
  return {
    peakPots: 0,
    pancakes: 0,
    rageBursts: 0,
    successfulBlocks: 0,
    maxTaskPopups: 0,
    pauseSeconds: 0,
  };
}

function freshRunState(): RunState {
  return {
    phase: "intro",
    gender: null,
    nickname: "匿名牛马",
    startedAt: "",
    round: 1,
    gameHour: 18,
    timeLeft: ROUND_SECONDS,
    pots: 0,
    pancakes: 0,
    rage: 0,
    achievements: [],
    achievementIds: new Set(),
    stats: freshRoundStats(),
    endedBySuddenDeath: false,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatClock(hour: number) {
  if (hour === 24) return "24:00";
  if (hour > 24) return `凌晨 ${hour - 24}:00`;
  return `${hour}:00`;
}

function formatTimer(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatEntryTime(date: Date) {
  return date.toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

type SoundCue = "start" | "step" | "potThrow" | "pancakeThrow" | "pot" | "pancake" | "laser" | "laserHit" | "rage" | "block" | "pause" | "resume" | "roundEnd" | "overtime" | "leave";

class SoundBoard {
  muted = false;
  context?: AudioContext;

  unlock() {
    if (this.muted) return;
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
  }

  play(cue: SoundCue) {
    if (this.muted || !this.context) return;
    const notes: Record<SoundCue, number[]> = {
      start: [392, 523, 784],
      step: [92],
      potThrow: [480, 240],
      pancakeThrow: [620, 420],
      pot: [220, 110],
      pancake: [480, 300],
      laser: [920, 620],
      laserHit: [390, 180],
      rage: [280, 340, 420],
      block: [740, 990, 1318],
      pause: [523, 392],
      resume: [392, 523],
      roundEnd: [392, 294, 196],
      overtime: [180, 146],
      leave: [523, 659, 784],
    };
    const now = this.context.currentTime;
    notes[cue].forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      const start = now + index * 0.065;
      oscillator.type = cue === "step" || cue === "pancakeThrow" ? "triangle" : cue === "pot" || cue === "potThrow" || cue === "overtime" ? "sawtooth" : "square";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * 0.75), start + 0.11);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(cue === "step" ? 0.006 : 0.018, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      oscillator.connect(gain).connect(this.context!.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.13);
    });
  }
}

class AppController {
  state = freshRunState();
  sound = new SoundBoard();
  gameScene?: GameScene;
  overlay = document.querySelector<HTMLDivElement>("#overlay")!;
  hud = document.querySelector<HTMLDivElement>("#hud")!;
  lastHudHtml = "";
  toast = document.querySelector<HTMLDivElement>("#toast")!;
  sceneTag = document.querySelector<HTMLDivElement>("#scene-tag")!;
  rageOverlay = document.querySelector<HTMLDivElement>("#rage-overlay")!;
  toastTimer?: number;
  sceneTagTimer?: number;
  taskLayer = document.querySelector<HTMLDivElement>("#task-layer")!;
  mobileControls = document.querySelector<HTMLDivElement>("#mobile-controls")!;
  taskPopups: TaskPopup[] = [];
  taskTimer = 0;
  taskId = 1;
  lastTaskFrame = performance.now();
  selectedGender: Gender | null = null;
  pauseMode: PauseMode = "toilet";
  pauseStarted = 0;
  pauseAchievementQueued = false;
  pauseAccounted = false;
  introDeadline = 0;

  constructor() {
    this.bindGlobalInput();
    this.bindMobileControls();
    for (const url of Object.values(PAUSE_IMAGES).flatMap((modes) =>
      Object.values(modes).flatMap(({ idle, caught }) => [idle, caught]))) {
      const image = new Image();
      image.src = url;
    }
    this.hud.addEventListener("click", (event) => {
      if (!(event.target instanceof Element) || !event.target.closest("#sound-toggle")) return;
      this.sound.muted = !this.sound.muted;
      if (!this.sound.muted) this.sound.unlock();
      this.updateHud();
    });
    requestAnimationFrame((time) => this.taskLoop(time));
  }

  setScene(scene: GameScene) {
    this.gameScene = scene;
  }

  startIntro() {
    document.body.classList.remove("result-mode");
    this.hideAchievementToast();
    this.hideSceneTag();
    this.state = freshRunState();
    this.selectedGender = null;
    this.clearTasks();
    this.state.phase = "intro";
    this.introDeadline = performance.now() + 10000;
    this.mobileControls.classList.add("hidden");
    this.updateRageOverlay();
    this.gameScene?.resetWorld();
    this.renderIntro();
    this.tickIntro();
  }

  tickIntro() {
    if (this.state.phase !== "intro") return;
    const left = Math.max(0, Math.ceil((this.introDeadline - performance.now()) / 1000));
    const timer = document.querySelector("[data-intro-timer]");
    if (timer) timer.textContent = String(left);
    if (left <= 0) this.showTitle();
    else window.setTimeout(() => this.tickIntro(), 250);
  }

  showTitle() {
    this.state.phase = "title";
    this.hud.classList.add("hidden");
    this.clearTasks();
    this.mobileControls.classList.add("hidden");
    this.overlay.classList.remove("hidden");
    this.overlay.innerHTML = `
      <section class="panel compact">
        <h1 class="brand">牛马奋斗录</h1>
        <p class="subtitle">The Working Beast Chronicles</p>
        <p class="copy">选择你的打工人形象，坚持三分钟，决定今天到底能不能下班。</p>
        <div class="choice-grid">
          <button class="character-card" data-gender="male">
            <div class="avatar avatar-male" style="background-image: url('${this.avatarDataUrl("male")}')"></div>
            <strong>男打工人</strong>
            <p>衬衫、工牌、黑眼圈，精神状态稳定地不稳定。</p>
          </button>
          <button class="character-card" data-gender="female">
            <div class="avatar avatar-female" style="background-image: url('${this.avatarDataUrl("female")}')"></div>
            <strong>女打工人</strong>
            <p>电脑包、咖啡因、最后一口气，都是生产资料。</p>
          </button>
        </div>
        <label class="nickname-field" for="nickname-input">
          <span>员工昵称 <small>选填 · 最多 12 字</small></span>
          <input id="nickname-input" type="text" maxlength="12" placeholder="匿名牛马" autocomplete="nickname" />
        </label>
        <div class="actions">
          <button id="start-game" class="btn" disabled>开始游戏</button>
        </div>
      </section>
    `;
    this.overlay.querySelectorAll<HTMLButtonElement>("[data-gender]").forEach((button) => {
      button.addEventListener("click", () => {
        this.selectedGender = button.dataset.gender as Gender;
        this.overlay.querySelectorAll(".character-card").forEach((node) => node.classList.remove("selected"));
        button.classList.add("selected");
        this.overlay.querySelector<HTMLButtonElement>("#start-game")!.disabled = false;
      });
    });
    this.overlay.querySelector<HTMLButtonElement>("#start-game")!.addEventListener("click", () => this.startGame());
  }

  avatarDataUrl(gender: Gender) {
    const source = this.gameScene?.textures.get(CHARACTER_TEXTURES[gender]).getSourceImage();
    return source instanceof HTMLCanvasElement ? source.toDataURL("image/png") : "";
  }

  renderIntro() {
    this.overlay.classList.remove("hidden");
    this.overlay.innerHTML = `
      <section class="panel">
        <h1 class="brand">牛马奋斗录</h1>
        <p class="subtitle">入职培训还有 <span data-intro-timer>10</span> 秒</p>
        <div class="copy">
          <p>移动：A/D/W/S 或方向键。移动端可用左下角方向键。</p>
          <p>躲开黑锅和飞饼。被黑锅砸中会背锅减速，被飞饼砸中会变胖。</p>
          <p>背着锅时，把背部转向甲方激光，可以自动格挡并清空所有负面状态。</p>
          <p>Space 或 ESC 暂停。首次说明页可按 ESC 或 Enter 跳过。</p>
        </div>
      </section>
    `;
  }

  startGame() {
    document.body.classList.remove("result-mode");
    const nickname = this.overlay.querySelector<HTMLInputElement>("#nickname-input")?.value.trim().slice(0, 12) || "匿名牛马";
    this.sound.unlock();
    this.sound.play("start");
    this.hideAchievementToast();
    this.state = freshRunState();
    this.state.phase = "playing";
    this.state.gender = this.selectedGender ?? "male";
    this.state.nickname = nickname;
    this.state.startedAt = formatEntryTime(new Date());
    this.overlay.classList.add("hidden");
    this.hud.classList.remove("hidden");
    this.mobileControls.classList.remove("hidden");
    this.taskTimer = 0;
    this.clearTasks();
    this.gameScene?.startRound(this.state);
    this.showSceneTag();
    this.updateHud();
  }

  nextRound() {
    this.sound.play("overtime");
    this.hideAchievementToast();
    this.state.phase = "playing";
    this.state.round += 1;
    this.state.gameHour += 3;
    this.state.timeLeft = ROUND_SECONDS;
    this.state.pots = 0;
    this.state.pancakes = 0;
    this.state.rage = 0;
    this.state.achievements = [];
    this.state.achievementIds = new Set();
    this.state.stats = freshRoundStats();
    this.state.fixedAchievement = undefined;
    this.overlay.classList.add("hidden");
    this.hud.classList.remove("hidden");
    this.taskTimer = 0;
    this.clearTasks();
    this.gameScene?.startRound(this.state);
    this.updateRageOverlay();
    this.showSceneTag();
    this.updateHud();
  }

  endRound() {
    this.sound.play("roundEnd");
    this.hideAchievementToast();
    this.hideSceneTag();
    this.clearTasks();
    this.gameScene?.setPaused(true);
    if (this.state.round >= 5) {
      this.state.endedBySuddenDeath = true;
      this.state.fixedAchievement = achievements.sudden;
      this.showResult(true);
      return;
    }
    this.state.phase = "roundEnd";
    this.updateRageOverlay();
    this.hud.classList.add("hidden");
    this.overlay.classList.remove("hidden");
    this.overlay.innerHTML = `
      <section class="panel compact">
        <h1 class="brand">今天要下班吗？</h1>
        <p class="subtitle">当前时间：${formatClock(this.state.gameHour)}</p>
        <p class="copy">屏幕黑了，工位还亮着。命运给了你两个按钮。</p>
        <div class="actions">
          <button id="overtime" class="btn danger">继续加班</button>
          <button id="leave" class="btn secondary">下班</button>
        </div>
      </section>
    `;
    this.overlay.querySelector<HTMLButtonElement>("#overtime")!.addEventListener("click", () => this.nextRound());
    this.overlay.querySelector<HTMLButtonElement>("#leave")!.addEventListener("click", () => this.leaveWork());
  }

  leaveWork(extraAchievement?: Achievement) {
    this.sound.play("leave");
    if (extraAchievement) this.unlock(extraAchievement);
    const fixed = [achievements.offAt18, achievements.offAt21, achievements.king, achievements.king2][this.state.round - 1] ?? achievements.king2;
    this.state.fixedAchievement = fixed;
    this.unlock(fixed);
    this.showResult(false);
  }

  showResult(suddenDeath: boolean) {
    document.body.classList.add("result-mode");
    this.hideAchievementToast();
    this.hideSceneTag();
    this.state.phase = "result";
    this.updateRageOverlay();
    this.state.endedBySuddenDeath = suddenDeath;
    this.hud.classList.add("hidden");
    this.mobileControls.classList.add("hidden");
    this.clearTasks();
    this.gameScene?.setPaused(true);
    const shareCanvas = this.createShareCanvas(suddenDeath);
    const stats = this.state.stats;
    const fixedAchievement = suddenDeath ? achievements.sudden : this.state.fixedAchievement!;
    const processAchievements = suddenDeath
      ? []
      : byDifficulty(this.state.achievements.filter((item) => item.id !== fixedAchievement.id));
    const avatar = this.avatarDataUrl(this.state.gender ?? "male");
    this.overlay.classList.remove("hidden");
    this.overlay.innerHTML = `
      <section class="panel result-panel">
        <h1 class="brand">${suddenDeath ? "加班猝死" : "下班成功"}</h1>
        <p class="subtitle">${suddenDeath ? "太阳照常升起，但你已经下不了班了。" : `下班时间：${formatClock(this.state.gameHour)}`}</p>
        <section class="result-profile" aria-label="员工工牌">
          <div class="result-profile-top"><span>员工工牌 / STAFF ID</span><span>NO. ${String(this.state.round).padStart(2, "0")}</span></div>
          <div class="result-profile-body">
            <div class="result-avatar" style="background-image: url('${avatar}')" aria-label="${this.state.gender === "female" ? "女" : "男"}角色头像"></div>
            <div class="result-profile-copy">
              <small>昵称 / NICKNAME</small>
              <strong>${escapeHtml(this.state.nickname)}</strong>
              <span>${this.state.gender === "female" ? "女" : "男"}打工人 · 入职时间 ${escapeHtml(this.state.startedAt)}</span>
              <span>第 ${this.state.round} 局 · ${this.gameScene?.activeScene.name ?? "办公室"} · ${suddenDeath ? "终局 06:00" : `下班 ${formatClock(this.state.gameHour)}`}</span>
            </div>
          </div>
        </section>
        <section class="achievement-section" aria-label="成就结算">
          <div class="achievement-section-heading">
            <h2>${suddenDeath ? "最终成就" : "成就档案"}</h2>
            <span>${suddenDeath ? "终局记录" : `主成就 · ${fixedAchievement.rank} 级`}</span>
          </div>
          ${renderAchievementCard(fixedAchievement, true)}
          ${suddenDeath ? "" : `
            <div class="achievement-section-heading achievement-section-heading--process">
              <h2>本轮过程成就</h2>
              <span>已解锁 ${processAchievements.length} 项 · S → A → B → C</span>
            </div>
            <div class="achievement-list">
              ${processAchievements.length
                ? processAchievements.map((item) => renderAchievementCard(item)).join("")
                : `<p class="achievement-empty">本轮没有解锁过程成就。下班本身，已经算一次胜利。</p>`}
            </div>
          `}
        </section>
        ${suddenDeath ? "" : `
          <section class="result-attributes" aria-label="牛马属性">
            <h2>牛马属性</h2>
            <div id="radar-host" class="radar-host"></div>
            <div class="result-grid">
              <div class="stat-card"><strong>背锅峰值</strong>${stats.peakPots}</div>
              <div class="stat-card"><strong>吃饼数量</strong>${stats.pancakes}</div>
              <div class="stat-card"><strong>红温次数</strong>${stats.rageBursts}</div>
              <div class="stat-card"><strong>甩锅成功</strong>${stats.successfulBlocks}</div>
            </div>
          </section>
        `}
        <h2 class="share-heading">结算长图预览</h2>
        <div id="share-host"></div>
        <div class="actions">
          <button id="download-share" class="btn secondary">下载图片</button>
          <button id="restart" class="btn danger">再来一局</button>
        </div>
      </section>
    `;
    shareCanvas.className = "share-preview";
    this.overlay.querySelector<HTMLDivElement>("#share-host")!.appendChild(shareCanvas);
    if (!suddenDeath) {
      const radarCanvas = document.createElement("canvas");
      radarCanvas.width = 520;
      radarCanvas.height = 420;
      radarCanvas.className = "radar-preview";
      this.drawRadar(radarCanvas.getContext("2d")!, 260, 210, 140, 18);
      this.overlay.querySelector<HTMLDivElement>("#radar-host")!.appendChild(radarCanvas);
    }
    this.overlay.querySelector<HTMLButtonElement>("#download-share")!.addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = suddenDeath ? "牛马奋斗录_加班猝死.png" : "牛马奋斗录_下班结算.png";
      link.href = shareCanvas.toDataURL("image/png");
      link.click();
    });
    this.overlay.querySelector<HTMLButtonElement>("#restart")!.addEventListener("click", () => {
      if (window.confirm("是否已经保存结算截图？重新开始后，本轮结算将无法找回。")) {
        this.startIntro();
      }
    });
  }

  togglePause() {
    if (this.state.phase === "playing") this.pause();
    else if (this.state.phase === "paused") this.resume();
  }

  pause() {
    this.hideAchievementToast();
    this.sound.play("pause");
    this.state.phase = "paused";
    this.pauseMode = Math.random() < 0.5 ? "toilet" : "phone";
    this.pauseStarted = performance.now();
    this.pauseAchievementQueued = false;
    this.pauseAccounted = false;
    this.gameScene?.setPaused(true);
    this.updateRageOverlay();
    this.renderPause(false);
    this.pauseTick();
  }

  pauseTick() {
    if (this.state.phase !== "paused") return;
    const seconds = Math.floor((performance.now() - this.pauseStarted) / 1000);
    const timer = document.querySelector("[data-pause-timer]");
    if (timer) timer.textContent = String(seconds);
    if (seconds >= 60 && !this.pauseAchievementQueued) {
      this.pauseAchievementQueued = true;
      this.unlock(this.pauseMode === "toilet" ? achievements.numb : achievements.caught);
      this.renderPause(true);
    }
    window.setTimeout(() => this.pauseTick(), 500);
  }

  renderPause(flipped: boolean) {
    const toilet = this.pauseMode === "toilet";
    const pauseImage = PAUSE_IMAGES[this.state.gender ?? "male"][this.pauseMode][flipped ? "caught" : "idle"];
    const pauseSeconds = Math.floor((performance.now() - this.pauseStarted) / 1000);
    const title = flipped
      ? toilet
        ? "蹲坑蹲的腿麻了"
        : "摸鱼被老板逮住了"
      : toilet
        ? "带薪拉屎"
        : "刷手机摸鱼";
    const body = flipped
      ? toilet
        ? "时间暂停了，腿也暂停了。"
        : "老板的脚步声，比 Deadline 更近。"
      : toilet
        ? "工牌挂在门把手上，手机正在播放毫无营养的快乐。"
        : "左手假装敲键盘，右手在桌下刷新短视频。";
    this.overlay.classList.remove("hidden");
    this.overlay.innerHTML = `
      <section class="panel compact pause-panel">
        <h1 class="brand">暂停中</h1>
        <div class="pause-art pause-art--${this.pauseMode}${flipped ? " pause-art--flipped" : ""}">
          <img class="pause-art-image" src="${pauseImage}" alt="" />
          <div class="pause-art-copy">
            <h2>${title}</h2>
            <p class="copy">${body}</p>
            <p class="subtitle">已暂停 <span data-pause-timer>${pauseSeconds}</span> 秒</p>
          </div>
        </div>
        <div class="actions">
          <button id="resume" class="btn secondary">继续游戏</button>
          <button id="leave-now" class="btn danger">下班</button>
        </div>
      </section>
    `;
    this.overlay.querySelector<HTMLButtonElement>("#resume")!.addEventListener("click", () => this.resume());
    this.overlay.querySelector<HTMLButtonElement>("#leave-now")!.addEventListener("click", () => {
      this.accountPauseSeconds();
      const early = this.state.round === 1 ? achievements.early : achievements.slipped;
      this.leaveWork(early);
    });
  }

  resume() {
    this.accountPauseSeconds();
    this.sound.play("resume");
    this.state.phase = "playing";
    this.overlay.classList.add("hidden");
    this.gameScene?.setPaused(false);
    this.updateRageOverlay();
  }

  accountPauseSeconds() {
    if (this.pauseAccounted || !this.pauseStarted) return;
    this.pauseAccounted = true;
    this.state.stats.pauseSeconds += Math.floor((performance.now() - this.pauseStarted) / 1000);
  }

  unlock(achievement: Achievement) {
    if (this.state.endedBySuddenDeath && achievement.id !== "sudden") return;
    if (this.state.achievementIds.has(achievement.id)) return;
    this.state.achievementIds.add(achievement.id);
    this.state.achievements.push(achievement);
    if (this.state.phase === "playing" || this.state.phase === "paused") {
      this.updateHud();
      if (this.state.phase === "playing") this.showAchievementToast(achievement);
    }
  }

  showAchievementToast(achievement: Achievement) {
    this.hideAchievementToast();
    const visual = achievementVisuals[achievement.id];
    this.toast.className = `toast toast--${visual.tone}`;
    this.toast.innerHTML = `
      <span class="toast-medal" aria-hidden="true">${visual.mark}</span>
      <span class="toast-copy">
        <small>${achievement.rank} 级成就解锁 · ${visual.category}</small>
        <strong>${achievement.name}</strong>
        <span>${achievement.description}</span>
      </span>
    `;
    this.toastTimer = window.setTimeout(() => this.hideAchievementToast(), 2600);
  }

  hideAchievementToast() {
    if (this.toastTimer !== undefined) window.clearTimeout(this.toastTimer);
    this.toastTimer = undefined;
    this.toast.classList.add("hidden");
  }

  updateHud() {
    const rageDots = Array.from({ length: 3 }, (_, index) => `<span class="rage-dot ${index < this.state.rage ? "filled" : ""}"></span>`).join("");
    const html = `
      <div class="hud-row"><strong>第 ${this.state.round} 局 · ${this.gameScene?.activeScene.name ?? "办公室"}</strong><span>当前时间：${formatClock(this.state.gameHour)}</span><button id="sound-toggle" class="sound-toggle" type="button" aria-label="${this.sound.muted ? "开启音效" : "关闭音效"}" aria-pressed="${!this.sound.muted}">${this.sound.muted ? "♪×" : "♪"}</button></div>
      <div class="hud-row"><span>剩余时间</span><strong>${formatTimer(this.state.timeLeft)}</strong></div>
      <div class="hud-row"><span>背锅</span><strong>${this.state.pots}</strong></div>
      <div class="hud-row"><span>吃饼</span><strong>${this.state.pancakes}</strong></div>
      <div class="hud-row"><span>怒气</span><span class="rage-bar">${rageDots}</span></div>
      <div class="hud-row hud-achievement-row"><span>本轮成就</span><strong class="achievement-count">${this.state.achievements.length}</strong></div>
    `;
    if (this.lastHudHtml !== html) {
      this.hud.innerHTML = html;
      this.lastHudHtml = html;
    }
  }

  addPot() {
    this.sound.play("pot");
    this.state.pots += 1;
    this.state.stats.peakPots = Math.max(this.state.stats.peakPots, this.state.pots);
    if (this.state.pots >= 23) this.unlock(achievements.potKing);
    this.updateHud();
  }

  addPancake() {
    this.sound.play("pancake");
    this.state.pancakes += 1;
    this.state.stats.pancakes += 1;
    if (this.state.pancakes >= 18) this.unlock(achievements.bornWorker);
    this.updateHud();
  }

  addRage() {
    this.sound.play("laserHit");
    const wasMaxed = this.state.rage >= 3;
    this.state.rage = Math.min(3, this.state.rage + 1);
    if (this.state.rage >= 3 && !wasMaxed) {
      this.sound.play("rage");
      this.state.stats.rageBursts += 1;
      this.unlock(achievements.rage);
    }
    this.updateRageOverlay();
    this.updateHud();
  }

  clearNegativeStates() {
    this.sound.play("block");
    const potsBefore = this.state.pots;
    this.state.pots = 0;
    this.state.pancakes = 0;
    this.state.rage = 0;
    this.updateRageOverlay();
    this.state.stats.successfulBlocks += 1;
    this.unlock(achievements.passPot);
    if (potsBefore > 10) this.unlock(achievements.light);
    this.updateHud();
  }

  tryTaskSpawn(deltaMs: number) {
    if (this.state.phase !== "playing") return;
    this.taskTimer += deltaMs;
    if (this.taskTimer < TASK_INTERVAL_MS) return;
    this.taskTimer = 0;
    if (Math.random() <= 0.5 && this.taskPopups.length < 5) {
      this.spawnTaskPopup();
    }
  }

  spawnTaskPopup() {
    const banner = document.createElement("div");
    banner.className = "task-banner";
    banner.textContent = "来活了！";
    document.body.appendChild(banner);
    window.setTimeout(() => banner.remove(), 900);

    const element = document.createElement("div");
    element.className = "task-popup";
    element.innerHTML = `
      <div class="task-title">
        <span>工作任务_${String(this.taskId).padStart(3, "0")}</span>
        <button class="task-close" aria-label="关闭任务">X</button>
      </div>
      <div class="task-body">需求很简单，明天上午要。先做一个大气、高级、有感觉的版本。</div>
    `;
    const width = Math.min(260, window.innerWidth * 0.34);
    const height = 104;
    const popup: TaskPopup = {
      id: this.taskId++,
      element,
      x: Math.random() * Math.max(20, window.innerWidth - width),
      y: 90 + Math.random() * Math.max(20, window.innerHeight - 190),
      vx: (Math.random() < 0.5 ? -1 : 1) * 45,
      vy: (Math.random() < 0.5 ? -1 : 1) * 38,
    };
    element.querySelector<HTMLButtonElement>(".task-close")!.addEventListener("click", () => {
      this.taskPopups = this.taskPopups.filter((item) => item.id !== popup.id);
      element.remove();
    });
    this.taskLayer.appendChild(element);
    this.taskPopups.push(popup);
    popup.element.style.left = `${popup.x}px`;
    popup.element.style.top = `${popup.y}px`;
    this.state.stats.maxTaskPopups = Math.max(this.state.stats.maxTaskPopups, this.taskPopups.length);
    if (this.taskPopups.length >= 5) this.unlock(achievements.tooManyTasks);
  }

  taskLoop(now: number) {
    const delta = Math.min(50, now - this.lastTaskFrame);
    this.lastTaskFrame = now;
    if (this.state.phase === "playing") {
      this.tryTaskSpawn(delta);
      for (const popup of this.taskPopups) {
        const rect = popup.element.getBoundingClientRect();
        popup.x += popup.vx * (delta / 1000);
        popup.y += popup.vy * (delta / 1000);
        if (popup.x < 0 || popup.x + rect.width > window.innerWidth) popup.vx *= -1;
        if (popup.y < 80 || popup.y + rect.height > window.innerHeight) popup.vy *= -1;
        popup.x = clamp(popup.x, 0, Math.max(0, window.innerWidth - rect.width));
        popup.y = clamp(popup.y, 80, Math.max(80, window.innerHeight - rect.height));
        popup.element.style.left = `${popup.x}px`;
        popup.element.style.top = `${popup.y}px`;
      }
    }
    requestAnimationFrame((time) => this.taskLoop(time));
  }

  clearTasks() {
    for (const popup of this.taskPopups) popup.element.remove();
    this.taskPopups = [];
  }

  updateRageOverlay() {
    this.rageOverlay.classList.toggle("active", this.state.phase === "playing" && this.state.rage >= 3);
  }

  showSceneTag() {
    this.hideSceneTag();
    const scene = this.gameScene?.activeScene;
    if (!scene) return;
    this.sceneTag.innerHTML = `<small>第 ${this.state.round} 局 · ${formatClock(this.state.gameHour)}</small><strong>${scene.name}</strong>`;
    this.sceneTag.classList.remove("hidden");
    this.sceneTagTimer = window.setTimeout(() => this.hideSceneTag(), 2400);
  }

  hideSceneTag() {
    if (this.sceneTagTimer !== undefined) window.clearTimeout(this.sceneTagTimer);
    this.sceneTagTimer = undefined;
    this.sceneTag.classList.add("hidden");
  }

  createShareCanvas(suddenDeath: boolean) {
    const fixed = suddenDeath ? achievements.sudden : this.state.fixedAchievement ?? achievements.offAt18;
    const processAchievements = suddenDeath
      ? []
      : byDifficulty(this.state.achievements.filter((item) => item.id !== fixed.id));
    const unlocked = [fixed, ...processAchievements];
    const achievementsY = 476;
    const rowHeight = 126;
    const rowGap = 16;
    const panelHeight = 104 + unlocked.length * rowHeight + (unlocked.length - 1) * rowGap + (processAchievements.length === 0 && !suddenDeath ? 80 : 0) + 34;
    const panelBottom = achievementsY + panelHeight;
    const radarY = panelBottom + 30;
    const radarHeight = 700;
    const height = suddenDeath ? panelBottom + 230 : radarY + radarHeight + 90;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0d1220";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255,255,255,0.035)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y <= height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.fillStyle = suddenDeath ? "#ff6575" : "#f4f15a";
    ctx.fillRect(0, 0, 1080, 14);
    ctx.fillStyle = "#39f0ff";
    ctx.fillRect(0, 14, 1080, 7);
    ctx.fillStyle = "#fff7b0";
    ctx.font = "900 61px sans-serif";
    ctx.fillText("牛马奋斗录", 64, 105);
    ctx.fillStyle = "#39f0ff";
    ctx.font = "700 24px sans-serif";
    ctx.fillText("The Working Beast Chronicles", 66, 141);
    ctx.textAlign = "right";
    ctx.fillStyle = "#a8b7c9";
    ctx.font = "700 22px monospace";
    ctx.fillText(`PERFORMANCE FILE / ${String(this.state.round).padStart(2, "0")}`, 1016, 96);
    ctx.textAlign = "left";

    drawSharePanel(ctx, 64, 180, 952, 270, "#171e2d", "#39f0ff");
    ctx.fillStyle = "#39f0ff";
    ctx.font = "900 21px sans-serif";
    ctx.fillText("员工工牌  /  STAFF ID", 91, 218);
    ctx.textAlign = "right";
    ctx.fillText(`NO. ${String(this.state.round).padStart(2, "0")}`, 988, 218);
    ctx.textAlign = "left";
    ctx.strokeStyle = "rgba(57,240,255,0.35)";
    ctx.beginPath(); ctx.moveTo(90, 232); ctx.lineTo(990, 232); ctx.stroke();

    const avatarX = 177;
    const avatarY = 332;
    const avatarRadius = 77;
    ctx.save();
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "#293b52";
    ctx.fillRect(avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    const avatarSource = this.gameScene?.textures.get(CHARACTER_TEXTURES[this.state.gender ?? "male"]).getSourceImage();
    if (avatarSource instanceof HTMLCanvasElement) {
      // Crop the standing sprite through the circular mask as a head-and-shoulders ID photo.
      const avatarHeight = 320;
      const avatarWidth = avatarSource.width * avatarHeight / avatarSource.height;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(avatarSource, avatarX - avatarWidth / 2, avatarY - avatarRadius - 14, avatarWidth, avatarHeight);
    }
    ctx.restore();
    ctx.strokeStyle = "#f4f15a";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = "#39f0ff";
    ctx.font = "900 22px sans-serif";
    ctx.fillText("昵称 / NICKNAME", 286, 273);
    drawFittedText(ctx, this.state.nickname, 286, 327, 640, 49, 30, 900, "#fff7b0");
    ctx.fillStyle = "#d3d8df";
    ctx.font = "600 24px sans-serif";
    ctx.fillText(`${this.state.gender === "female" ? "女" : "男"}打工人  ·  入职时间 ${this.state.startedAt}`, 286, 368);
    ctx.fillStyle = suddenDeath ? "#ff6575" : "#f4f15a";
    ctx.font = "800 22px sans-serif";
    ctx.fillText(`第 ${this.state.round} 局  ·  ${this.gameScene?.activeScene.name ?? "办公室"}  ·  ${suddenDeath ? "终局 06:00" : `下班 ${formatClock(this.state.gameHour)}`}`, 286, 408);

    if (!suddenDeath) {
      drawSharePanel(ctx, 64, radarY, 952, radarHeight, "#151d2b", "#39f0ff");
      ctx.fillStyle = "#fff7b0";
      ctx.font = "900 35px sans-serif";
      ctx.fillText("牛马属性", 90, radarY + 51);
      ctx.fillStyle = "#39f0ff";
      ctx.font = "700 21px sans-serif";
      ctx.fillText("WORKER ATTRIBUTES", 284, radarY + 48);
      ctx.fillStyle = "#a8b7c9";
      ctx.font = "600 21px sans-serif";
      ctx.fillText("这一局的职场生存形状", 90, radarY + 83);
      this.drawRadar(ctx, 540, radarY + 310, 184, 24);
      const stats = this.state.stats;
      const summaries = [
        ["背锅峰值", stats.peakPots], ["吃饼数量", stats.pancakes],
        ["红温次数", stats.rageBursts], ["甩锅成功", stats.successfulBlocks],
      ] as const;
      summaries.forEach(([label, value], index) => {
        const x = 89 + index * 226;
        drawSharePanel(ctx, x, radarY + 612, 210, 57, "#202d3d", "rgba(57,240,255,0.38)");
        ctx.fillStyle = "#a8b7c9";
        ctx.font = "700 17px sans-serif";
        ctx.fillText(label, x + 15, radarY + 635);
        ctx.fillStyle = "#fff7b0";
        ctx.font = "900 26px monospace";
        ctx.textAlign = "right";
        ctx.fillText(String(value), x + 193, radarY + 648);
        ctx.textAlign = "left";
      });
    }

    drawSharePanel(ctx, 64, achievementsY, 952, panelHeight, "#171b29", suddenDeath ? "#ff6575" : "#f4d35e");
    ctx.fillStyle = suddenDeath ? "#ff6575" : "#fff7b0";
    ctx.font = "900 35px sans-serif";
    ctx.fillText(suddenDeath ? "最终成就" : "成就框", 90, achievementsY + 49);
    ctx.fillStyle = suddenDeath ? "#ff6575" : "#f4d35e";
    ctx.font = "700 20px sans-serif";
    ctx.fillText(suddenDeath ? "FINAL RECORD" : "ACHIEVEMENT RECORD", suddenDeath ? 275 : 235, achievementsY + 46);
    ctx.textAlign = "right";
    ctx.fillStyle = "#a8b7c9";
    ctx.font = "700 21px sans-serif";
    ctx.fillText(suddenDeath ? "仅此一项" : `本轮解锁 ${unlocked.length} 项  ·  S > A > B > C`, 990, achievementsY + 50);
    ctx.textAlign = "left";
    ctx.strokeStyle = "rgba(255,255,255,0.17)";
    ctx.beginPath(); ctx.moveTo(90, achievementsY + 70); ctx.lineTo(990, achievementsY + 70); ctx.stroke();
    unlocked.forEach((item, index) => {
      const x = 88;
      const y = achievementsY + 95 + index * (rowHeight + rowGap);
      const visual = achievementVisuals[item.id];
      const rankColor = rankColors[item.rank];
      drawSharePanel(ctx, x, y, 904, rowHeight, index === 0 ? "#252820" : "#1b2635", rankColor);
      ctx.fillStyle = rankColor;
      ctx.fillRect(x + 18, y + 18, 88, 88);
      ctx.fillStyle = "#0d1220";
      ctx.font = "900 61px monospace";
      ctx.textAlign = "center";
      ctx.fillText(item.rank, x + 62, y + 83);
      ctx.textAlign = "left";
      ctx.fillStyle = rankColor;
      ctx.font = "900 19px sans-serif";
      ctx.fillText(`${index === 0 ? suddenDeath ? "最终成就" : "固定下班成就" : "过程成就"}  ·  ${visual.category}`, x + 129, y + 34);
      drawFittedText(ctx, item.name, x + 129, y + 78, 650, 35, 25, 900, "#fff7b0");
      drawFittedText(ctx, `达成条件：${item.condition}`, x + 129, y + 106, 710, 22, 18, 600, "#d3d8df");
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.font = "900 31px sans-serif";
      ctx.fillText(visual.mark, x + 867, y + 48);
      ctx.textAlign = "left";
    });
    if (processAchievements.length === 0 && !suddenDeath) {
      ctx.fillStyle = "#a8b7c9";
      ctx.font = "600 22px sans-serif";
      ctx.fillText("本轮没有其他过程成就。下班本身，已经算一次胜利。", 108, panelBottom - 52);
    }

    if (suddenDeath) {
      ctx.fillStyle = "#ff6575";
      ctx.font = "900 31px sans-serif";
      ctx.fillText("太阳照常升起，但你已经下不了班了。", 88, panelBottom + 75);
      ctx.fillStyle = "#d3d8df";
      ctx.font = "500 25px sans-serif";
      wrapText(ctx, "这里没有统计，也没有奖励。只有一盏没关的灯，和一份没人再催的文件。", 88, panelBottom + 117, 850, 37);
    }
    ctx.fillStyle = suddenDeath ? "#ff6575" : "#39f0ff";
    ctx.font = "700 24px sans-serif";
    ctx.fillText(suddenDeath ? "下班这件事，明天再说。" : "今天也辛苦你多承担一点。", 70, height - 44);
    return canvas;
  }

  drawRadar(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius = 210, labelSize = 25) {
    const labels = ["背锅", "吃饼", "红温", "加班", "摸鱼", "甩锅"];
    const values = [
      clamp(this.state.stats.peakPots / 23, 0, 1),
      clamp(this.state.stats.pancakes / 18, 0, 1),
      clamp(this.state.stats.rageBursts / 5, 0, 1),
      clamp(this.state.round / 5, 0, 1),
      clamp(this.state.stats.pauseSeconds / 60, 0, 1),
      clamp(this.state.stats.successfulBlocks / 5, 0, 1),
    ];
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    for (let ring = 1; ring <= 4; ring++) {
      drawPoly(ctx, cx, cy, labels.length, (radius * ring) / 4, false);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    labels.forEach((_, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / labels.length;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius); ctx.stroke();
    });
    ctx.fillStyle = "rgba(57,240,255,0.26)";
    ctx.strokeStyle = "#39f0ff";
    ctx.beginPath();
    values.forEach((value, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / labels.length;
      const x = cx + Math.cos(angle) * radius * value;
      const y = cy + Math.sin(angle) * radius * value;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f8f4e8";
    ctx.font = `700 ${labelSize}px sans-serif`;
    ctx.textAlign = "center";
    labels.forEach((label, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / labels.length;
      const x = cx + Math.cos(angle) * (radius + labelSize * 2.1);
      const y = cy + Math.sin(angle) * (radius + labelSize * 2.1);
      ctx.fillText(label, x, y + labelSize * 0.3);
    });
    ctx.textAlign = "left";
  }

  bindGlobalInput() {
    window.addEventListener("keydown", (event) => {
      if (this.state.phase === "playing" && !event.repeat) this.gameScene?.recordDirectionPress(event.code);
      if (this.state.phase === "intro" && (event.key === "Escape" || event.key === "Enter")) {
        event.preventDefault();
        this.showTitle();
        return;
      }
      if (event.key === "Escape" || event.code === "Space") {
        if (this.state.phase === "playing" || this.state.phase === "paused") {
          event.preventDefault();
          this.togglePause();
        }
      }
    });
  }

  bindMobileControls() {
    this.mobileControls.querySelector<HTMLButtonElement>("#mobile-pause")!.addEventListener("click", () => this.togglePause());
    this.mobileControls.querySelectorAll<HTMLButtonElement>("[data-dir]").forEach((button) => {
      const dir = button.dataset.dir!;
      const down = () => this.gameScene?.setVirtualDirection(dir, true);
      const up = () => this.gameScene?.setVirtualDirection(dir, false);
      button.addEventListener("pointerdown", down);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);
      button.addEventListener("pointerleave", up);
    });
  }
}

class GameScene extends Phaser.Scene {
  app!: AppController;
  activeScene: SceneConfig = getSceneForHour(18);
  player!: Phaser.GameObjects.Container;
  playerSprite!: Phaser.GameObjects.Image;
  playerBaseScale = 1;
  playerHeight = 132;
  playerIdleTexture: string = CHARACTER_TEXTURES.male;
  playerFootOffset = 0;
  playerMoving = false;
  walkFrameIndex = 0;
  walkFrameMs = 0;
  potVisuals: Phaser.GameObjects.Image[] = [];
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  facing: Direction = "right";
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  lasers: Laser[] = [];
  nextEnemyId = 1;
  spawnTimer = 0;
  elapsedMs = 0;
  lastSteamAt = 0;
  pausedByApp = true;
  virtual = { left: false, right: false, up: false, down: false };
  directionOrder = { left: 0, right: 0, up: 0, down: 0 };
  inputSequence = 0;

  constructor() {
    super("GameScene");
  }

  preload() {
    preloadGameAssets(this);
  }

  create() {
    prepareGameSprites(this);
    this.app = app;
    this.app.setScene(this);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    this.drawScene(18);
    this.createPlayer("male");
    this.app.startIntro();
  }

  resetWorld() {
    this.clearWorldObjects();
    this.drawScene(18);
    this.createPlayer("male");
    this.setPaused(true);
  }

  startRound(state: RunState) {
    this.clearWorldObjects();
    this.drawScene(state.gameHour);
    this.createPlayer(state.gender ?? "male");
    this.spawnTimer = 0;
    this.elapsedMs = 0;
    this.lastSteamAt = 0;
    this.facing = "right";
    this.walkFrameIndex = 0;
    this.walkFrameMs = 0;
    Object.keys(this.virtual).forEach((key) => { this.virtual[key as keyof typeof this.virtual] = false; });
    Object.keys(this.directionOrder).forEach((key) => { this.directionOrder[key as keyof typeof this.directionOrder] = 0; });
    this.inputSequence = 0;
    this.setPaused(false);
  }

  setPaused(value: boolean) {
    this.pausedByApp = value;
    if (value) this.tweens.pauseAll();
    else this.tweens.resumeAll();
  }

  setVirtualDirection(dir: string, value: boolean) {
    if (!(dir in this.virtual)) return;
    const direction = dir as keyof typeof this.virtual;
    if (value && !this.virtual[direction]) this.directionOrder[direction] = ++this.inputSequence;
    this.virtual[direction] = value;
  }

  recordDirectionPress(code: string) {
    const direction = ({
      KeyA: "left", ArrowLeft: "left",
      KeyD: "right", ArrowRight: "right",
      KeyW: "up", ArrowUp: "up",
      KeyS: "down", ArrowDown: "down",
    } as Record<string, keyof typeof this.directionOrder>)[code];
    if (direction) this.directionOrder[direction] = ++this.inputSequence;
  }

  update(_time: number, deltaMs: number) {
    if (!this.app || this.pausedByApp || this.app.state.phase !== "playing") return;
    this.elapsedMs += deltaMs;
    const delta = deltaMs / 1000;
    this.app.state.timeLeft -= delta;
    if (this.app.state.timeLeft <= 0) {
      this.app.state.timeLeft = 0;
      this.app.updateHud();
      this.app.endRound();
      return;
    }
    this.updatePlayer(delta);
    this.updateEnemies(deltaMs, delta);
    this.updateProjectiles(delta);
    this.updateLasers(deltaMs);
    this.updatePlayerVisuals();
    this.app.updateHud();
  }

  updatePlayer(delta: number) {
    const left = this.keys.A.isDown || this.cursors.left.isDown || this.virtual.left;
    const right = this.keys.D.isDown || this.cursors.right.isDown || this.virtual.right;
    const up = this.keys.W.isDown || this.cursors.up.isDown || this.virtual.up;
    const down = this.keys.S.isDown || this.cursors.down.isDown || this.virtual.down;
    const speed = BASE_SPEED * Math.max(MAX_SLOW, 1 - this.app.state.pots * POT_SLOW);
    const vx = left && right
      ? this.directionOrder.left > this.directionOrder.right ? -1 : 1
      : left ? -1 : right ? 1 : 0;
    const vy = up && down
      ? this.directionOrder.up > this.directionOrder.down ? -1 : 1
      : up ? -1 : down ? 1 : 0;
    if (vx !== 0) this.facing = vx < 0 ? "left" : "right";
    const vector = new Phaser.Math.Vector2(vx, vy);
    this.playerMoving = vector.lengthSq() > 0;
    if (this.playerMoving) {
      this.walkFrameMs += delta * 1000 * (speed / BASE_SPEED);
      while (this.walkFrameMs >= 105) {
        this.walkFrameMs -= 105;
        this.walkFrameIndex = (this.walkFrameIndex + 1) % 4;
        if (this.walkFrameIndex % 2 === 0) this.app.sound.play("step");
      }
    } else {
      this.walkFrameMs = 0;
      this.walkFrameIndex = 0;
    }
    if (vector.lengthSq() > 0) vector.normalize().scale(speed * delta);
    const sizeMargin = (Math.min(1.9, 1 + this.app.state.pancakes * 0.05) - 1) * 30;
    const area = this.activeScene.playArea;
    this.player.x = clamp(this.player.x + vector.x, area.left + sizeMargin, area.right - sizeMargin);
    this.player.y = clamp(this.player.y + vector.y, area.top + sizeMargin, area.bottom);
    this.player.setDepth(4 + this.player.y / 1000);
  }

  updateEnemies(deltaMs: number, delta: number) {
    this.spawnTimer += deltaMs;
    if (this.spawnTimer >= ENEMY_SPAWN_MS) {
      this.spawnTimer = 0;
      if (this.enemies.length < MAX_ENEMIES) this.spawnEnemy();
    }
    const now = this.elapsedMs;
    const area = this.activeScene.playArea;
    for (const enemy of [...this.enemies]) {
      enemy.container.x += enemy.velocity.x * delta;
      enemy.container.y += enemy.velocity.y * delta;
      if (enemy.container.x < area.left || enemy.container.x > area.right) enemy.velocity.x *= -1;
      if (enemy.container.y < area.top || enemy.container.y > area.bottom - 30) enemy.velocity.y *= -1;
      enemy.container.x = clamp(enemy.container.x, area.left, area.right);
      enemy.container.y = clamp(enemy.container.y, area.top, area.bottom - 30);
      enemy.container.setDepth(4 + enemy.container.y / 1000);
      if (!enemy.spoke && now - enemy.bornAt >= 1000) {
        enemy.label.setText(enemy.line);
        enemy.label.setVisible(true);
        enemy.spoke = true;
      }
      if (!enemy.attacked && now - enemy.bornAt >= ENEMY_ATTACK_MS) {
        enemy.attacked = true;
        this.enemyAttack(enemy);
      }
      if (now - enemy.bornAt >= ENEMY_LIFE_MS) this.removeEnemy(enemy);
    }
    this.resolveEnemyOverlap();
  }

  resolveEnemyOverlap() {
    const area = this.activeScene.playArea;
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const first = this.enemies[i].container;
        const second = this.enemies[j].container;
        const difference = new Phaser.Math.Vector2(second.x - first.x, second.y - first.y);
        const distance = difference.length();
        if (distance >= 76) continue;
        if (distance < 0.01) difference.set(1, 0);
        else difference.scale(1 / distance);
        const push = (76 - distance) / 2;
        first.x = clamp(first.x - difference.x * push, area.left, area.right);
        first.y = clamp(first.y - difference.y * push, area.top, area.bottom - 30);
        second.x = clamp(second.x + difference.x * push, area.left, area.right);
        second.y = clamp(second.y + difference.y * push, area.top, area.bottom - 30);
      }
    }
  }

  updateProjectiles(delta: number) {
    for (const projectile of [...this.projectiles]) {
      projectile.shape.x += projectile.velocity.x * delta;
      projectile.shape.y += projectile.velocity.y * delta;
      projectile.shape.rotation += projectile.kind === "pancake" ? 9 * delta : 3 * delta;
      const rect = projectile.shape.getBounds();
      if (rect.right < 0 || rect.left > WIDTH || rect.bottom < 0 || rect.top > HEIGHT) {
        this.removeProjectile(projectile);
        continue;
      }
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, this.getPlayerRect())) {
        if (projectile.kind === "pot") this.app.addPot();
        else this.app.addPancake();
        this.flashAt(this.player.x, this.player.y, projectile.kind === "pot" ? 0x111111 : 0xffd45a);
        this.removeProjectile(projectile);
      }
    }
  }

  updateLasers(_deltaMs: number) {
    const now = this.elapsedMs;
    for (const laser of [...this.lasers]) {
      if (now < laser.activeAt) {
        const pulse = 0.72 + Math.sin((now - laser.bornAt) * 0.035) * 0.18;
        laser.warning.setAlpha(pulse);
        laser.lockMarker.setAlpha(Math.min(1, pulse + 0.12));
      } else {
        if (!laser.fired) {
          laser.fired = true;
          this.app.sound.play("laser");
        }
        laser.warning.setAlpha(0);
        laser.lockMarker.setVisible(false);
        laser.rect.setAlpha(0.74);
        if (!laser.hit && Phaser.Geom.Intersects.RectangleToRectangle(laser.rect.getBounds(), this.getPlayerRect())) {
          laser.hit = true;
          if (this.canBlockLaser(laser)) {
            this.shatterPots();
            this.app.clearNegativeStates();
          } else {
            this.app.addRage();
            this.flashAt(this.player.x, this.player.y, 0xff334f);
          }
        }
      }
      if (now >= laser.deadAt) {
        laser.rect.destroy();
        laser.warning.destroy();
        laser.lockMarker.destroy();
        this.lasers = this.lasers.filter((item) => item !== laser);
      }
    }
  }

  canBlockLaser(laser: Laser) {
    if (this.app.state.pots < 1) return false;
    if (laser.sourceSide === "left" && this.facing !== "right") return false;
    if (laser.sourceSide === "right" && this.facing !== "left") return false;
    const potRect = this.getBackPotRect();
    return Phaser.Geom.Intersects.RectangleToRectangle(laser.rect.getBounds(), potRect);
  }

  spawnEnemy() {
    const roll = Math.random();
    const kind: EnemyKind = roll < 0.5 ? "coworker" : roll < 0.7 ? "boss" : "client";
    const side: Direction = Math.random() < 0.5 ? "left" : "right";
    const area = this.activeScene.playArea;
    const x = side === "left" ? area.left : area.right;
    let y = area.top;
    for (let attempt = 0; attempt < 16; attempt++) {
      y = Phaser.Math.Between(area.top, area.bottom - 30);
      if (this.enemies.every((enemy) => Phaser.Math.Distance.Between(x, y, enemy.container.x, enemy.container.y) >= 80)) break;
      if (attempt === 15) return;
    }
    const container = this.add.container(x, y).setDepth(4 + y / 1000);
    const attackKind: ProjectileKind | null = kind === "client" ? null : kind === "coworker" ? "pot" : Math.random() < 0.62 ? "pancake" : "pot";
    const shadow = this.add.ellipse(0, -2, 58, 15, 0x080c15, 0.48);
    const sprite = this.add.image(0, 0, CHARACTER_TEXTURES[kind]).setOrigin(0.5, 1);
    const spriteHeight = kind === "boss" ? 132 : 128;
    sprite.setDisplaySize(sprite.width * (spriteHeight / sprite.height), spriteHeight);
    sprite.setFlipX(side === "right");
    const label = this.add.text(-80, kind === "boss" ? -152 : -spriteHeight - 22, "", {
      fontFamily: "sans-serif",
      fontSize: "16px",
      color: "#11131a",
      backgroundColor: "#fff7b0",
      padding: { x: 8, y: 5 },
      wordWrap: { width: 190 },
    }).setVisible(false);
    container.add([shadow, sprite, label]);
    const enemy: Enemy = {
      id: this.nextEnemyId++,
      kind,
      container,
      sprite,
      label,
      bornAt: this.elapsedMs,
      attacked: false,
      attackKind,
      line: this.pickLine(kind, attackKind),
      spoke: false,
      velocity: new Phaser.Math.Vector2(side === "left" ? 28 : -28, Phaser.Math.Between(-30, 30)),
    };
    this.enemies.push(enemy);
  }

  enemyAttack(enemy: Enemy) {
    if (enemy.kind === "client") {
      this.spawnLaser(enemy);
      return;
    }
    this.spawnProjectile(enemy, enemy.attackKind ?? "pot");
  }

  spawnProjectile(enemy: Enemy, kind: ProjectileKind) {
    this.app.sound.play(kind === "pot" ? "potThrow" : "pancakeThrow");
    const from = new Phaser.Math.Vector2(enemy.container.x, enemy.container.y - 20);
    const to = new Phaser.Math.Vector2(this.player.x, this.player.y - 10);
    const speed = kind === "pot" ? 360 : 300;
    const velocity = to.subtract(from).normalize().scale(speed);
    const shape = this.add.image(from.x, from.y, PROJECTILE_TEXTURES[kind]).setDepth(5);
    shape.setDisplaySize(kind === "pot" ? 54 : 40, kind === "pot" ? 30 : 40);
    this.projectiles.push({ kind, shape, velocity, size: kind === "pot" ? 44 : 40 });
  }

  spawnLaser(enemy: Enemy) {
    const sourceSide: Direction = enemy.container.x < this.player.x ? "left" : "right";
    // Capture the player's position before the tell begins. The warning and
    // eventual beam share this immutable lane, so a dodge during the tell works.
    const lockedY = this.getPlayerRect().centerY;
    const x = WIDTH / 2;
    const warning = this.add.rectangle(x, lockedY, WIDTH, 8, 0xffdf68, 1).setAlpha(0.72).setDepth(5);
    const lockMarker = this.add.circle(this.player.x, lockedY, 22, 0xfff7b0, 0.1)
      .setStrokeStyle(4, 0xfff7b0).setDepth(7);
    const rect = this.add.rectangle(x, lockedY, WIDTH, 18, 0xff334f, 1).setAlpha(0).setDepth(6);
    this.lasers.push({
      rect,
      warning,
      lockMarker,
      sourceSide,
      lockedY,
      bornAt: this.elapsedMs,
      activeAt: this.elapsedMs + 500,
      deadAt: this.elapsedMs + 1500,
      fired: false,
      hit: false,
    });
  }

  pickLine(kind: EnemyKind, attackKind: ProjectileKind | null) {
    const list =
      kind === "coworker"
        ? coworkerLines
        : kind === "client"
          ? clientLines
          : attackKind === "pancake"
            ? bossPancakeLines
            : bossPotLines;
    return Phaser.Utils.Array.GetRandom(list);
  }

  createPlayer(gender: Gender) {
    const y = HEIGHT - 145;
    this.player = this.add.container(WIDTH / 2, y).setDepth(4 + y / 1000);
    const shadow = this.add.ellipse(0, -2, 68, 17, 0x080c15, 0.5);
    this.playerIdleTexture = CHARACTER_TEXTURES[gender];
    this.playerSprite = this.add.image(0, 0, this.playerIdleTexture).setOrigin(0.5, 1);
    // The female concept-sheet crop has more transparent space below the shoes.
    this.playerHeight = gender === "female" ? 144 : 132;
    this.playerBaseScale = this.playerHeight / this.playerSprite.height;
    this.playerFootOffset = gender === "female" ? 14 : 0;
    this.playerSprite.setScale(this.playerBaseScale);
    this.player.add([shadow, this.playerSprite]);
  }

  updatePlayerVisuals() {
    const scale = Math.min(1.9, 1 + this.app.state.pancakes * 0.05);
    const texture = this.playerMoving ? `${this.playerIdleTexture}-run-${this.walkFrameIndex}` : this.playerIdleTexture;
    if (this.playerSprite.texture.key !== texture) this.playerSprite.setTexture(texture);
    this.playerSprite.setScale((this.playerHeight / this.playerSprite.height) * scale);
    this.playerSprite.y = this.playerFootOffset;
    this.player.scaleX = this.facing === "right" ? 1 : -1;
    const rageTints = [0xffffff, 0xffd7d7, 0xffa7b2, 0xff6575];
    this.playerSprite.setTint(rageTints[this.app.state.rage] ?? rageTints[3]);
    if (this.app.state.rage >= 3 && this.elapsedMs - this.lastSteamAt >= 180) {
      this.lastSteamAt = this.elapsedMs;
      const steam = this.add.circle(this.player.x + Phaser.Math.Between(-15, 15), this.player.y - this.playerSprite.displayHeight + 6, 5, 0xf1f4ec, 0.72).setDepth(8);
      this.tweens.add({
        targets: steam,
        x: steam.x + Phaser.Math.Between(-18, 18),
        y: steam.y - 44,
        scale: 1.8,
        alpha: 0,
        duration: 620,
        onComplete: () => steam.destroy(),
      });
    }
    while (this.potVisuals.length < this.app.state.pots) {
      const pot = this.add.image(0, 0, PROJECTILE_TEXTURES.pot).setDisplaySize(43, 25);
      this.player.addAt(pot, 1);
      this.potVisuals.push(pot);
    }
    while (this.potVisuals.length > this.app.state.pots) {
      this.potVisuals.pop()?.destroy();
    }
    this.potVisuals.forEach((pot, index) => {
      // A decorative, unbounded tower: every collected pot stays visible in the
      // stack, but none enlarges the fixed first-pot laser block hitbox.
      pot.x = -31 * scale - (index % 3) * 3;
      pot.y = -47 * scale - index * 13;
      pot.rotation = (index % 2 === 0 ? -1 : 1) * 0.11;
    });
  }

  getPlayerRect() {
    const scale = Math.min(1.9, 1 + this.app.state.pancakes * 0.05);
    return new Phaser.Geom.Rectangle(this.player.x - 25 * scale, this.player.y - 86 * scale, 50 * scale, 86 * scale);
  }

  getBackPotRect() {
    const x = this.facing === "right" ? this.player.x - 54 : this.player.x + 18;
    return new Phaser.Geom.Rectangle(x, this.player.y - 58, 36, 54);
  }

  drawScene(hour: number) {
    this.activeScene = getSceneForHour(hour, SCENE_PREVIEW_ID);
    this.add.image(WIDTH / 2, HEIGHT / 2, this.activeScene.textureKey).setDisplaySize(WIDTH, HEIGHT).setDepth(0);
  }

  clearWorldObjects() {
    this.tweens.killAll();
    this.children.removeAll(true);
    this.enemies = [];
    this.projectiles = [];
    this.lasers = [];
    this.potVisuals = [];
  }

  removeEnemy(enemy: Enemy) {
    enemy.container.destroy();
    this.enemies = this.enemies.filter((item) => item !== enemy);
  }

  removeProjectile(projectile: Projectile) {
    projectile.shape.destroy();
    this.projectiles = this.projectiles.filter((item) => item !== projectile);
  }

  flashAt(x: number, y: number, color: number) {
    const flash = this.add.circle(x, y, 8, color, 0.8).setDepth(12);
    this.tweens.add({
      targets: flash,
      scale: 5,
      alpha: 0,
      duration: 260,
      onComplete: () => flash.destroy(),
    });
  }

  shatterPots() {
    for (let i = 0; i < 18; i++) {
      const shard = this.add.rectangle(this.player.x - 30, this.player.y - 20, 10, 6, 0xa8a8a8).setDepth(12);
      this.tweens.add({
        targets: shard,
        x: shard.x + Phaser.Math.Between(-140, 140),
        y: shard.y + Phaser.Math.Between(-110, 80),
        angle: Phaser.Math.Between(-180, 180),
        alpha: 0,
        duration: 560,
        onComplete: () => shard.destroy(),
      });
    }
  }
}

function drawPoly(ctx: CanvasRenderingContext2D, cx: number, cy: number, sides: number, radius: number, fill: boolean) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / sides;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (fill) ctx.fill();
  else ctx.stroke();
}

function drawSharePanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fill: string, stroke: string) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 10);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
}

function drawFittedText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth: number, size: number, minSize: number, weight: number, color: string) {
  let fontSize = size;
  ctx.font = `${weight} ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  while (fontSize > minSize && ctx.measureText(value).width > maxWidth) {
    fontSize -= 1;
    ctx.font = `${weight} ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  }
  ctx.fillStyle = color;
  ctx.fillText(value, x, y, maxWidth);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  let line = "";
  for (const char of text) {
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = char;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

const app = new AppController();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-root",
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: "#11131a",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
});
