// Guarda los elementos de la interfaz para actualizar el marcador y los estados de la partida.
const scoreValue = document.querySelector("#score-value");
const bestValue = document.querySelector("#best-value");
const waveValue = document.querySelector("#wave-value");
const livesValue = document.querySelector("#lives-value");
const overlay = document.querySelector("#game-overlay");
const overlayEyebrow = document.querySelector("#overlay-eyebrow");
const overlayTitle = document.querySelector("#overlay-title");
const overlayMessage = document.querySelector("#overlay-message");
const startButton = document.querySelector("#start-button");
const pauseButton = document.querySelector("#pause-button");
const restartButton = document.querySelector("#restart-button");
const overlayRestartButton = document.querySelector("#overlay-restart-button");
const bombButton = document.querySelector("#bomb-button");
const touchBombButton = document.querySelector("#touch-bomb-button");
const bombValue = document.querySelector("#bomb-value");
const touchBombValue = document.querySelector("#touch-bomb-value");
const weaponValue = document.querySelector("#weapon-value");
const storageNotice = document.querySelector("#storage-notice");
const virtualJoystick = document.querySelector("#virtual-joystick");

const STORAGE_KEY = "galaga-best-score";
const GAME_HEIGHT = 600;
const MOBILE_GAME_WIDTH = 800;
const DESKTOP_GAME_WIDTH = 900;
const BACKGROUND_PALETTES = ["#0b1024", "#101827", "#171329", "#0b1c25", "#1c1725"];
const desktopLayout = window.matchMedia("(min-width: 576px)");
const getGameWidth = () => desktopLayout.matches ? DESKTOP_GAME_WIDTH : MOBILE_GAME_WIDTH;
const touchState = { horizontal: 0, vertical: 0, fire: false };
let bestScore = 0;

// Recupera el récord guardado y avisa si el navegador bloquea el almacenamiento local.
try {
  bestScore = Number(window.localStorage.getItem(STORAGE_KEY)) || 0;
} catch (error) {
  storageNotice.textContent = "No se pudo acceder al almacenamiento local; el récord solo se conservará durante esta visita.";
}
bestValue.textContent = String(bestScore).padStart(5, "0");

class GalagaScene extends Phaser.Scene {
  constructor() {
    super("galaga");
    this.audioContext = null;
    this.bossSpeedBonus = 0;
  }

  // Mantiene sincronizado el color de fondo de la cámara y el lienzo del juego.
  setArenaBackground(color) {
    this.cameras.main.setBackgroundColor(color);
    this.game.config.backgroundColor = color;
    this.game.canvas.style.backgroundColor = color;
    const parsedColor = Phaser.Display.Color.HexStringToColor(color);
    this.game.renderer.config.backgroundColor.setTo(parsedColor.red, parsedColor.green, parsedColor.blue, 255);
  }

  // Prepara el audio después de una interacción del jugador para respetar las políticas del navegador.
  initializeAudio() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      storageNotice.textContent = "Este navegador no admite efectos de sonido.";
      return;
    }

    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContextConstructor();
      }
      if (this.audioContext.state === "suspended") {
        this.audioContext.resume().catch(() => {
          storageNotice.textContent = "No se pudieron activar los efectos de sonido.";
        });
      }
    } catch (error) {
      storageNotice.textContent = "No se pudieron activar los efectos de sonido.";
    }
  }

  // Genera un efecto breve con un oscilador para no depender de archivos de audio externos.
  playSound(frequency, endFrequency, duration, type = "square", volume = 0.04, delay = 0) {
    if (!this.audioContext || this.audioContext.state !== "running") {
      return;
    }

    const startAt = this.audioContext.currentTime + delay;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startAt + duration);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration);
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
  }

  // Crea las texturas, el jugador, la primera oleada, los asteroides y las colisiones del juego.
  create() {
    this.createTextures();
    this.createStars();
    this.player = this.physics.add.image(this.scale.width / 2, GAME_HEIGHT - 65, "player-ship");
    this.player.setCollideWorldBounds(true);
    this.player.body.setAllowGravity(false);
    this.player.setDepth(2);
    this.bullets = this.physics.add.group({ allowGravity: false });
    this.enemyBullets = this.physics.add.group({ allowGravity: false });
    this.bombs = this.physics.add.group({ allowGravity: false });
    this.enemies = this.physics.add.group({ allowGravity: false, immovable: true });
    this.asteroids = this.physics.add.group({ allowGravity: false });
    this.rewards = this.physics.add.group({ allowGravity: false });
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D,SPACE,P,R,B");
    this.physics.world.setBounds(0, 0, this.scale.width, GAME_HEIGHT);
    this.score = 0;
    this.lives = 3;
    this.weaponLevel = 1;
    this.bombCount = 0;
    this.backgroundPaletteIndex = 0;
    this.setArenaBackground(BACKGROUND_PALETTES[this.backgroundPaletteIndex]);
    this.wave = 1;
    this.isPlaying = false;
    this.lastShotAt = 0;
    this.invulnerableUntil = 0;
    this.formationOffset = 0;
    this.formationDirection = 1;
    this.awaitingNextWave = false;
    this.isPausedGame = false;
    this.nextEnemyShotAt = this.time.now + this.getEnemyFireDelay();
    this.nextAsteroidSpawnAt = this.time.now + 4000;
    this.createWave();

    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy, undefined, this);
    this.physics.add.overlap(this.bullets, this.asteroids, this.hitAsteroidWithBullet, undefined, this);
    this.physics.add.overlap(this.bombs, this.enemies, this.hitBombEnemy, undefined, this);
    this.physics.add.overlap(this.bombs, this.asteroids, this.hitBombAsteroid, undefined, this);
    this.physics.add.overlap(this.enemyBullets, this.player, this.hitPlayer, undefined, this);
    this.physics.add.overlap(this.enemies, this.player, this.hitPlayer, undefined, this);
    this.physics.add.overlap(this.asteroids, this.player, this.hitPlayer, undefined, this);
    this.physics.add.overlap(this.rewards, this.player, this.collectReward, undefined, this);
    this.updatePowerupHud();
    this.updateLivesHud();
  }

  // Dibuja las naves, asteroides y proyectiles como texturas.
  createTextures() {
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    graphics.fillStyle(0x176caa, 1);
    graphics.fillPoints([
      { x: 32, y: 2 }, { x: 39, y: 20 }, { x: 61, y: 43 }, { x: 57, y: 51 },
      { x: 40, y: 46 }, { x: 32, y: 62 }, { x: 24, y: 46 }, { x: 7, y: 51 },
      { x: 3, y: 43 }, { x: 25, y: 20 }
    ], true);
    graphics.fillStyle(0x62eaff, 1);
    graphics.fillPoints([
      { x: 32, y: 5 }, { x: 37, y: 22 }, { x: 55, y: 42 }, { x: 39, y: 39 },
      { x: 32, y: 54 }, { x: 25, y: 39 }, { x: 9, y: 42 }, { x: 27, y: 22 }
    ], true);
    graphics.fillStyle(0x16355f, 1);
    graphics.fillPoints([
      { x: 32, y: 12 }, { x: 37, y: 28 }, { x: 32, y: 49 }, { x: 27, y: 28 }
    ], true);
    graphics.fillStyle(0xc9fbff, 1);
    graphics.fillPoints([
      { x: 32, y: 15 }, { x: 35, y: 27 }, { x: 32, y: 34 }, { x: 29, y: 27 }
    ], true);
    graphics.fillStyle(0x203d70, 1);
    graphics.fillPoints([{ x: 11, y: 44 }, { x: 23, y: 41 }, { x: 20, y: 46 }, { x: 10, y: 48 }], true);
    graphics.fillPoints([{ x: 53, y: 44 }, { x: 41, y: 41 }, { x: 44, y: 46 }, { x: 54, y: 48 }], true);
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillRoundedRect(16, 43, 4, 7, 2);
    graphics.fillRoundedRect(44, 43, 4, 7, 2);
    graphics.fillStyle(0x9d8aff, 1);
    graphics.fillPoints([{ x: 28, y: 51 }, { x: 36, y: 51 }, { x: 32, y: 60 }], true);
    graphics.generateTexture("player-ship", 64, 64);
    graphics.clear();

    const drawEnemyTexture = (name, primaryColor, armorColor, lightColor) => {
      graphics.fillStyle(primaryColor, 1);
      graphics.fillPoints([
        { x: 27, y: 44 }, { x: 20, y: 35 }, { x: 7, y: 39 }, { x: 2, y: 31 },
        { x: 7, y: 16 }, { x: 17, y: 8 }, { x: 27, y: 13 }, { x: 37, y: 8 },
        { x: 47, y: 16 }, { x: 52, y: 31 }, { x: 47, y: 39 }, { x: 34, y: 35 }
      ], true);
      graphics.fillStyle(armorColor, 1);
      graphics.fillPoints([
        { x: 27, y: 39 }, { x: 21, y: 30 }, { x: 10, y: 33 }, { x: 8, y: 23 },
        { x: 17, y: 14 }, { x: 27, y: 19 }, { x: 37, y: 14 }, { x: 46, y: 23 },
        { x: 44, y: 33 }, { x: 33, y: 30 }
      ], true);
      graphics.fillStyle(0x241d42, 1);
      graphics.fillPoints([{ x: 27, y: 18 }, { x: 34, y: 28 }, { x: 27, y: 39 }, { x: 20, y: 28 }], true);
      graphics.fillStyle(lightColor, 1);
      graphics.fillCircle(19, 23, 3);
      graphics.fillCircle(35, 23, 3);
      graphics.fillStyle(0xffffff, 0.95);
      graphics.fillCircle(19, 23, 1);
      graphics.fillCircle(35, 23, 1);
      graphics.fillStyle(0x371e46, 1);
      graphics.fillPoints([{ x: 8, y: 35 }, { x: 20, y: 33 }, { x: 17, y: 37 }, { x: 9, y: 38 }], true);
      graphics.fillPoints([{ x: 46, y: 35 }, { x: 34, y: 33 }, { x: 37, y: 37 }, { x: 45, y: 38 }], true);
      graphics.fillStyle(lightColor, 1);
      graphics.fillPoints([{ x: 24, y: 40 }, { x: 30, y: 40 }, { x: 27, y: 47 }], true);
      graphics.generateTexture(name, 54, 48);
      graphics.clear();
    };

    drawEnemyTexture("enemy-elite", 0xf0a34a, 0xffd166, 0xfff0a3);
    drawEnemyTexture("enemy-guardian", 0xff6eae, 0xffa0d0, 0xffffff);
    drawEnemyTexture("enemy-scout", 0x866dff, 0xb9a7ff, 0xeff4ff);

    graphics.fillStyle(0x32134e, 1);
    graphics.fillPoints([
      { x: 64, y: 7 }, { x: 80, y: 22 }, { x: 119, y: 10 }, { x: 105, y: 42 },
      { x: 126, y: 60 }, { x: 100, y: 68 }, { x: 96, y: 91 }, { x: 75, y: 82 },
      { x: 64, y: 99 }, { x: 53, y: 82 }, { x: 32, y: 91 }, { x: 28, y: 68 },
      { x: 2, y: 60 }, { x: 23, y: 42 }, { x: 9, y: 10 }, { x: 48, y: 22 }
    ], true);
    graphics.fillStyle(0xc03cff, 1);
    graphics.fillPoints([
      { x: 64, y: 13 }, { x: 76, y: 29 }, { x: 108, y: 19 }, { x: 96, y: 45 },
      { x: 116, y: 58 }, { x: 91, y: 65 }, { x: 88, y: 81 }, { x: 70, y: 74 },
      { x: 64, y: 88 }, { x: 58, y: 74 }, { x: 40, y: 81 }, { x: 37, y: 65 },
      { x: 12, y: 58 }, { x: 32, y: 45 }, { x: 20, y: 19 }, { x: 52, y: 29 }
    ], true);
    graphics.fillStyle(0x5c217f, 1);
    graphics.fillPoints([
      { x: 64, y: 23 }, { x: 82, y: 43 }, { x: 75, y: 70 },
      { x: 64, y: 82 }, { x: 53, y: 70 }, { x: 46, y: 43 }
    ], true);
    graphics.fillStyle(0xff567f, 1);
    graphics.fillRoundedRect(2, 48, 21, 12, 4);
    graphics.fillRoundedRect(105, 48, 21, 12, 4);
    graphics.fillStyle(0xffd0e5, 1);
    graphics.fillCircle(63, 47, 13);
    graphics.fillStyle(0xff426f, 1);
    graphics.fillCircle(63, 47, 8);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(63, 47, 3);
    graphics.fillStyle(0x72efff, 1);
    graphics.fillPoints([{ x: 56, y: 80 }, { x: 71, y: 80 }, { x: 64, y: 101 }], true);
    graphics.generateTexture("enemy-boss", 128, 104);
    graphics.clear();

    // Textura de asteroide rocoso
    graphics.fillStyle(0x5c5666, 1);
    graphics.fillPoints([
      { x: 24, y: 4 }, { x: 42, y: 8 }, { x: 56, y: 22 }, { x: 50, y: 44 },
      { x: 38, y: 56 }, { x: 18, y: 52 }, { x: 6, y: 38 }, { x: 8, y: 16 }
    ], true);
    graphics.fillStyle(0x3a3542, 1);
    graphics.fillCircle(20, 20, 8);
    graphics.fillCircle(40, 36, 6);
    graphics.generateTexture("asteroid", 60, 60);
    graphics.clear();

    graphics.fillStyle(0x3e9bff, 0.55);
    graphics.fillRoundedRect(0, 0, 10, 25, 5);
    graphics.fillStyle(0xc9fbff, 1);
    graphics.fillRoundedRect(3, 1, 4, 22, 2);
    graphics.generateTexture("player-bullet", 10, 25);
    graphics.clear();

    graphics.fillStyle(0xf47742, 0.65);
    graphics.fillRoundedRect(0, 0, 10, 21, 5);
    graphics.fillStyle(0xffe1a3, 1);
    graphics.fillRoundedRect(3, 2, 4, 16, 2);
    graphics.generateTexture("enemy-bullet", 10, 21);
    graphics.clear();

    graphics.fillStyle(0x15213a, 0.96);
    graphics.fillCircle(20, 20, 19);
    graphics.lineStyle(2, 0x62eaff, 0.9);
    graphics.strokeCircle(20, 20, 18);
    graphics.fillStyle(0xb9f8ff, 1);
    graphics.fillRoundedRect(11, 9, 6, 20, 3);
    graphics.fillRoundedRect(23, 9, 6, 20, 3);
    graphics.generateTexture("reward-weapon", 40, 40);
    graphics.clear();

    graphics.fillStyle(0x15213a, 0.96);
    graphics.fillCircle(20, 20, 19);
    graphics.lineStyle(2, 0xffc46e, 0.9);
    graphics.strokeCircle(20, 20, 18);
    graphics.fillStyle(0xff9a52, 1);
    graphics.fillCircle(19, 23, 9);
    graphics.lineStyle(3, 0xffe4a3, 1);
    graphics.lineBetween(23, 14, 29, 8);
    graphics.fillStyle(0xffe4a3, 1);
    graphics.fillCircle(30, 7, 3);
    graphics.generateTexture("reward-bomb", 40, 40);
    graphics.clear();

    graphics.fillStyle(0x3a1c2a, 1);
    graphics.fillCircle(12, 12, 11);
    graphics.lineStyle(2, 0xffbd69, 1);
    graphics.strokeCircle(12, 12, 10);
    graphics.fillStyle(0xff8e43, 1);
    graphics.fillCircle(11, 14, 5);
    graphics.lineStyle(2, 0xffedb5, 1);
    graphics.lineBetween(14, 9, 18, 5);
    graphics.fillStyle(0xffedb5, 1);
    graphics.fillCircle(19, 4, 2);
    graphics.generateTexture("player-bomb", 24, 24);
    graphics.clear();

    graphics.fillStyle(0x15213a, 0.96);
    graphics.fillCircle(20, 20, 19);
    graphics.lineStyle(2, 0xff6eae, 0.9);
    graphics.strokeCircle(20, 20, 18);
    graphics.fillStyle(0xff6eae, 1);
    graphics.fillPoints([
      { x: 20, y: 31 }, { x: 7, y: 20 }, { x: 7, y: 14 }, { x: 11, y: 10 },
      { x: 16, y: 10 }, { x: 20, y: 15 }, { x: 24, y: 10 }, { x: 29, y: 10 },
      { x: 33, y: 14 }, { x: 33, y: 20 }
    ], true);
    graphics.generateTexture("reward-life", 40, 40);
    graphics.destroy();
  }

  // Distribuye estrellas en el fondo.
  createStars() {
    this.stars = [];
    for (let index = 0; index < 85; index += 1) {
      const size = Math.random() > 0.9 ? 2 : 1;
      const star = this.add.circle(
        Phaser.Math.Between(0, this.scale.width),
        Phaser.Math.Between(0, GAME_HEIGHT),
        size,
        index % 4 === 0 ? 0x8c9aff : 0xffffff,
        Phaser.Math.FloatBetween(0.25, 0.8)
      );
      star.setData("speed", Phaser.Math.FloatBetween(12, 42));
      this.stars.push(star);
    }
  }

  // Genera formaciones de enemigos dinámicas que cambian según la oleada (Nivel).
  createWave() {
    this.formationOffset = 0;
    this.formationDirection = 1;
    
    // Cada 4 niveles aparece el Jefe de Sector
    if (this.wave % 4 === 0) {
      const boss = this.enemies.create(this.scale.width / 2, 120, "enemy-boss");
      this.maybeHideReward(boss);
      boss.setDepth(2);
      boss.setScale(1.65);
      boss.body.setAllowGravity(false);
      boss.setData("isBoss", true);
      boss.setData("health", 12 + (this.wave / 4 - 1) * 4);
      boss.setData("maxHealth", boss.getData("health"));
      this.bossHealthBar = this.add.graphics().setDepth(3);
      this.bossLabel = this.add.text(this.scale.width / 2, 24, "JEFE DE SECTOR", {
        color: "#ffc4f4",
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        letterSpacing: 2
      }).setOrigin(0.5).setDepth(3);
      return;
    }

    // Patrones dinámicos según el número de oleada
    const patternType = (this.wave - 1) % 3; 
    const formationOffset = (this.scale.width - MOBILE_GAME_WIDTH) / 2;

    if (patternType === 0) {
      // Patrón Rectangular Clásico (4 filas x 8 columnas)
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 8; column += 1) {
          const texture = row === 0 ? "enemy-elite" : row === 1 ? "enemy-guardian" : "enemy-scout";
          const enemy = this.enemies.create(160 + formationOffset + column * 68, 80 + row * 53, texture);
          enemy.setDepth(1);
          enemy.body.setAllowGravity(false);
          enemy.setData("baseX", enemy.x);
          this.maybeHideReward(enemy);
        }
      }
    } else if (patternType === 1) {
      // Patrón en V / Diamante
      for (let row = 0; row < 4; row += 1) {
        const countInRow = 5 + row * 2;
        const startX = (this.scale.width - (countInRow * 56)) / 2;
        for (let column = 0; column < countInRow; column += 1) {
          const texture = row === 0 ? "enemy-elite" : "enemy-guardian";
          const enemy = this.enemies.create(startX + column * 56, 70 + row * 52, texture);
          enemy.setDepth(1);
          enemy.body.setAllowGravity(false);
          enemy.setData("baseX", enemy.x);
          this.maybeHideReward(enemy);
        }
      }
    } else {
      // Patrón en Arcos / Doble Ola
      for (let row = 0; row < 5; row += 1) {
        for (let column = 0; column < 7; column += 1) {
          const texture = row % 2 === 0 ? "enemy-elite" : "enemy-scout";
          const arcOffset = Math.sin(column * 0.8) * 35;
          const enemy = this.enemies.create(200 + formationOffset + column * 80, 60 + row * 45 + arcOffset, texture);
          enemy.setDepth(1);
          enemy.body.setAllowGravity(false);
          enemy.setData("baseX", enemy.x);
          this.maybeHideReward(enemy);
        }
      }
    }
  }

  // Genera asteroides cruzando la pantalla de forma aleatoria.
  spawnAsteroid() {
    if (!this.isPlaying) return;
    const startFromLeft = Math.random() < 0.5;
    const startX = startFromLeft ? -50 : this.scale.width + 50;
    const startY = Phaser.Math.Between(80, GAME_HEIGHT - 150);
    const targetX = startFromLeft ? this.scale.width + 100 : -100;
    const targetY = Phaser.Math.Between(100, GAME_HEIGHT - 100);
    
    const asteroid = this.asteroids.create(startX, startY, "asteroid");
    asteroid.setDepth(2);
    asteroid.body.setAllowGravity(false);
    const speed = Phaser.Math.FloatBetween(90, 180 + this.wave * 10);
    const angle = Math.atan2(targetY - startY, targetX - startX);
    asteroid.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    asteroid.setData("expiresAt", this.time.now + 12000);
  }

  // Bucle principal de actualización de juego, asteroides y físicas.
  update(_time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.restartGame();
      return;
    }

    if (this.isPausedGame) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.P)) {
        this.resumeGame();
      }
      return;
    }
    if (this.isPlaying && Phaser.Input.Keyboard.JustDown(this.keys.P)) {
      this.togglePause();
      return;
    }

    this.stars.forEach((star) => {
      star.y += star.getData("speed") * delta / 1000;
      if (star.y > GAME_HEIGHT) {
        star.y = 0;
        star.x = Phaser.Math.Between(0, this.scale.width);
      }
    });

    [this.bullets, this.enemyBullets, this.bombs, this.asteroids].forEach((group) => {
      group.getChildren().forEach((bullet) => {
        if (bullet && bullet.active && (bullet.y < -50 || bullet.y > GAME_HEIGHT + 50 || bullet.x < -100 || bullet.x > this.scale.width + 100)) {
          bullet.destroy();
        }
      });
    });

    this.rewards.getChildren().forEach((reward) => {
      if (reward && reward.active && (reward.y > GAME_HEIGHT + 24 || this.time.now > reward.getData("expiresAt"))) {
        reward.destroy();
      }
    });

    if (!this.isPlaying || !this.player.active) {
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.B)) {
      this.launchBomb();
    }

    // Generador periódico de asteroides cruzando la pantalla
    if (this.time.now >= this.nextAsteroidSpawnAt) {
      this.spawnAsteroid();
      this.nextAsteroidSpawnAt = this.time.now + Math.max(2500, 7000 - (this.wave * 400));
    }

    const horizontalDirection = Phaser.Math.Clamp(
      Number(this.cursors.right.isDown || this.keys.D.isDown)
        - Number(this.cursors.left.isDown || this.keys.A.isDown)
        + touchState.horizontal,
      -1,
      1
    );
    const verticalDirection = Phaser.Math.Clamp(
      Number(this.cursors.down.isDown || this.keys.S.isDown)
        - Number(this.cursors.up.isDown || this.keys.W.isDown)
        + touchState.vertical,
      -1,
      1
    );
    const directionLength = Math.hypot(horizontalDirection, verticalDirection) || 1;
    this.player.setVelocity(
      horizontalDirection / directionLength * 390,
      verticalDirection / directionLength * 390
    );

    if (this.cursors.space.isDown || this.keys.SPACE.isDown || touchState.fire) {
      this.shoot();
    }

    if (this.time.now >= this.nextEnemyShotAt) {
      this.enemyFire();
    }

    const boss = this.enemies.getChildren().find((enemy) => enemy.active && enemy.getData("isBoss"));
    if (boss) {
      boss.x = this.scale.width / 2 + Math.sin(this.time.now / 650) * this.scale.width * 0.31;
      boss.y = 125 + Math.sin(this.time.now / 380) * 14;
      this.drawBossHealth(boss);
      return;
    }

    const formationSpeed = this.getFormationSpeed();
    this.formationOffset += this.formationDirection * formationSpeed * delta / 1000;
    if (Math.abs(this.formationOffset) >= 55) {
      this.formationDirection *= -1;
      this.enemies.getChildren().forEach((enemy) => {
        if (enemy && enemy.active) {
          enemy.y += 15;
        }
      });
    }
    this.enemies.getChildren().forEach((enemy) => {
      if (enemy && enemy.active) {
        enemy.x = enemy.getData("baseX") + this.formationOffset;
        if (enemy.y > 510) {
          this.finishGame();
        }
      }
    });
  }

  // Disparo del jugador
  shoot() {
    if (this.time.now - this.lastShotAt < 230) {
      return;
    }
    this.lastShotAt = this.time.now;
    this.playSound(720, 260, 0.09, "square", 0.025);
    const offsets = this.weaponLevel > 1 ? [-13, 13] : [0];
    offsets.forEach((offset) => {
      const bullet = this.bullets.create(this.player.x + offset, this.player.y - 22, "player-bullet");
      bullet.setDepth(1);
      bullet.body.setAllowGravity(false);
      bullet.setVelocityY(-540);
      bullet.setCollideWorldBounds(false);
      bullet.setData("expiresAt", this.time.now + 1500);
    });
  }

  // Disparos enemigos
  enemyFire() {
    if (!this.isPlaying || this.enemies.countActive() === 0) {
      return;
    }
    const livingEnemies = this.enemies.getChildren().filter((enemy) => enemy.active);
    const shooter = Phaser.Utils.Array.GetRandom(livingEnemies);
    const speed = this.getEnemyBulletSpeed();
    const isBoss = shooter.getData("isBoss");
    this.playSound(isBoss ? 190 : 260, 110, 0.16, "sawtooth", 0.025);
    const spread = isBoss ? [-0.22, 0, 0.22] : [0];
    spread.forEach((angle) => {
      const bullet = this.enemyBullets.create(shooter.x, shooter.y + 30, "enemy-bullet");
      bullet.body.setAllowGravity(false);
      bullet.setVelocity(angle * speed, speed);
      bullet.setData("expiresAt", this.time.now + 3000);
    });
    this.nextEnemyShotAt = this.time.now + this.getEnemyFireDelay();
  }

  maybeHideReward(enemy) {
    if (Math.random() < 0.05) {
      const rewards = ["weapon", "bomb", "life"];
      enemy.setData("rewardType", Phaser.Utils.Array.GetRandom(rewards));
    }
  }

  dropReward(enemy) {
    const rewardType = enemy.getData("rewardType");
    if (!rewardType) {
      return;
    }

    const reward = this.rewards.create(enemy.x, enemy.y, `reward-${rewardType}`);
    reward.setDepth(3);
    reward.body.setAllowGravity(false);
    reward.setVelocityY(58);
    reward.setData("rewardType", rewardType);
    reward.setData("expiresAt", this.time.now + 10000);
  }

  createExplosion(x, y, color = 0xff9a52, radius = 30) {
    const explosion = this.add.graphics().setPosition(x, y).setDepth(5);
    explosion.fillStyle(0xffe6a3, 0.95);
    explosion.fillCircle(0, 0, radius * 0.2);
    explosion.fillStyle(color, 0.85);
    explosion.fillCircle(0, 0, radius * 0.55);
    explosion.lineStyle(3, 0xfff4d6, 0.9);
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = (Math.PI * 2 * ray) / 8;
      explosion.lineBetween(
        Math.cos(angle) * radius * 0.55,
        Math.sin(angle) * radius * 0.55,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius
      );
    }
    this.tweens.add({
      targets: explosion,
      scaleX: 1.65,
      scaleY: 1.65,
      alpha: 0,
      duration: 300,
      ease: "Cubic.easeOut",
      onComplete: () => explosion.destroy()
    });
  }

  destroyEnemy(enemy, completeWave = true) {
    if (!enemy.active || enemy.getData("isBoss")) {
      return;
    }
    this.dropReward(enemy);
    this.createExplosion(enemy.x, enemy.y, 0xffa34f, 20);
    enemy.destroy();
    this.addScore(100);
    if (completeWave && this.enemies.countActive() === 0) {
      this.finishWave(false);
    }
  }

  updatePowerupHud() {
    weaponValue.textContent = this.weaponLevel > 1 ? "×2" : "×1";
    weaponValue.setAttribute("aria-label", this.weaponLevel > 1 ? "Disparo doble" : "Disparo simple");
    bombValue.textContent = `Bomba ×${this.bombCount}`;
    touchBombValue.textContent = `×${this.bombCount}`;
    bombButton.setAttribute("aria-label", `Usar bomba; ${this.bombCount} disponibles`);
    touchBombButton.setAttribute("aria-label", `Usar bomba; ${this.bombCount} disponibles`);
    bombButton.disabled = this.bombCount === 0;
    touchBombButton.disabled = this.bombCount === 0;
  }

  updateLivesHud() {
    livesValue.textContent = Array.from({ length: this.lives }, () => "♥").join(" ");
    livesValue.setAttribute("aria-label", `${this.lives} vidas`);
  }

  collectReward(first, second) {
    const reward = [first, second].find((object) => ["weapon", "bomb", "life"].includes(object.getData("rewardType")));
    if (!reward || !reward.active || !this.isPlaying) {
      return;
    }
    const rewardType = reward.getData("rewardType");
    reward.destroy();
    if (rewardType === "weapon") {
      this.weaponLevel = 2;
      storageNotice.textContent = "¡Disparo doble activado!";
      this.playSound(760, 1120, 0.2, "triangle", 0.045);
    } else if (rewardType === "bomb") {
      this.bombCount += 1;
      storageNotice.textContent = "¡Bomba recogida! Pulsa B o el botón de bomba para lanzarla.";
      this.playSound(300, 720, 0.24, "sawtooth", 0.04);
    } else if (rewardType === "life") {
      this.lives += 1;
      this.updateLivesHud();
      storageNotice.textContent = "¡Vida extra!";
      this.playSound(520, 1040, 0.26, "sine", 0.045);
    }
    this.updatePowerupHud();
    if (this.rewardMessageTimer) {
      this.time.removeEvent(this.rewardMessageTimer);
    }
    this.rewardMessageTimer = this.time.delayedCall(3000, () => {
      if (storageNotice.textContent.includes("activado") || 
          storageNotice.textContent.includes("Bomba recogida") || 
          storageNotice.textContent.includes("Vida extra")) {
        storageNotice.textContent = "";
      }
    });
  }

  launchBomb() {
    if (!this.isPlaying || this.bombCount === 0) {
      return;
    }

    this.bombCount -= 1;
    this.updatePowerupHud();
    this.playSound(320, 80, 0.48, "sawtooth", 0.07);
    const bomb = this.bombs.create(this.player.x, this.player.y - 36, "player-bomb");
    bomb.setDepth(4);
    bomb.body.setAllowGravity(false);
    bomb.setVelocityY(-300);
    bomb.setCollideWorldBounds(false);
    bomb.setData("expiresAt", this.time.now + 2500);
  }

  hitAsteroidWithBullet(bullet, asteroid) {
    bullet.destroy();
    this.createExplosion(asteroid.x, asteroid.y, 0x888888, 15);
    asteroid.destroy();
    this.addScore(25);
  }

  hitBombAsteroid(bomb, asteroid) {
    bomb.destroy();
    this.createBombExplosion(asteroid.x, asteroid.y);
    asteroid.destroy();
    this.addScore(50);
  }

  // Detonación de bomba: hace daño al Jefe o destruye enemigos cercanos.
  hitBombEnemy(bomb, enemy) {
    if (!bomb.active || !enemy.active) {
      return;
    }

    const impactX = enemy.x;
    const impactY = enemy.y;
    bomb.destroy();
    this.createBombExplosion(impactX, impactY);
    this.playSound(320, 80, 0.48, "sawtooth", 0.07);

    if (enemy.getData("isBoss")) {
      enemy.setData("health", enemy.getData("health") - 3);
      this.addScore(300);
      this.createExplosion(enemy.x, enemy.y, 0xc03cff, 54);
      if (enemy.getData("health") <= 0) {
        this.defeatBoss(enemy);
      } else {
        this.drawBossHealth(enemy);
      }
      return;
    }

    const targets = this.enemies.getChildren()
      .filter((target) => target.active && !target.getData("isBoss"))
      .sort((first, second) => {
        const firstDistance = Math.hypot(first.x - impactX, first.y - impactY);
        const secondDistance = Math.hypot(second.x - impactX, second.y - impactY);
        return firstDistance - secondDistance;
      });
    const targetCount = Math.min(Phaser.Math.Between(3, 4), targets.length);
    targets.slice(0, targetCount).forEach((target) => this.destroyEnemy(target, false));
    if (this.enemies.countActive() === 0) {
      this.finishWave(false);
    }
  }

  createBombExplosion(x, y) {
    const explosion = this.add.graphics().setDepth(4);
    explosion.setPosition(x, y);
    explosion.lineStyle(30, 0x62eaff, 0.3);
    explosion.lineBetween(0, -y, 0, GAME_HEIGHT - y);
    explosion.lineBetween(-x, 0, this.scale.width - x, 0);
    explosion.lineStyle(12, 0xffe6a3, 0.95);
    explosion.lineBetween(0, -y, 0, GAME_HEIGHT - y);
    explosion.lineBetween(-x, 0, this.scale.width - x, 0);
    explosion.fillStyle(0xffffff, 0.95);
    explosion.fillCircle(0, 0, 22);
    this.tweens.add({
      targets: explosion,
      scaleX: 1.08,
      scaleY: 1.08,
      alpha: 0,
      duration: 420,
      ease: "Cubic.easeOut",
      onComplete: () => explosion.destroy()
    });
  }

  drawBossHealth(boss) {
    if (!this.bossHealthBar || !this.bossLabel) {
      return;
    }
    const width = 150;
    const healthRatio = boss.getData("health") / boss.getData("maxHealth");
    const left = boss.x - width / 2;
    const top = boss.y - 96;
    this.bossHealthBar.clear();
    this.bossHealthBar.fillStyle(0x261d39, 1);
    this.bossHealthBar.fillRoundedRect(left, top, width, 9, 4);
    this.bossHealthBar.fillStyle(0xff5d9e, 1);
    this.bossHealthBar.fillRoundedRect(left, top, width * healthRatio, 9, 4);
    this.bossLabel.setPosition(boss.x, top - 10);
  }

  clearBossDisplay() {
    this.bossHealthBar?.destroy();
    this.bossLabel?.destroy();
    this.bossHealthBar = null;
    this.bossLabel = null;
  }

  getFormationSpeed() {
    return Math.min(14 + (this.wave - 1) * 9 + this.bossSpeedBonus, 110);
  }

  getEnemyBulletSpeed() {
    return Math.min(120 + (this.wave - 1) * 18 + this.bossSpeedBonus * 1.5, 380);
  }

  getEnemyFireDelay() {
    return Math.max(550, 1550 - (this.wave - 1) * 120 - this.bossSpeedBonus * 6);
  }

  // Impacto de balas a enemigos (incluyendo daño al jefe)
  hitEnemy(bullet, enemy) {
    bullet.destroy();
    this.playSound(420, 180, 0.11, "triangle", 0.035);
    if (enemy.getData("isBoss")) {
      const health = enemy.getData("health") - 1;
      enemy.setData("health", health);
      this.addScore(100);
      if (health <= 0) {
        this.defeatBoss(enemy);
      } else {
        this.drawBossHealth(enemy);
      }
      return;
    }

    this.destroyEnemy(enemy);
  }

  defeatBoss(boss) {
    this.dropReward(boss);
    this.createExplosion(boss.x, boss.y, 0xc03cff, 64);
    boss.destroy();
    this.clearBossDisplay();
    this.addScore(1500);
    this.bossSpeedBonus += 8;
    this.backgroundPaletteIndex = (this.backgroundPaletteIndex + 1) % BACKGROUND_PALETTES.length;
    this.setArenaBackground(BACKGROUND_PALETTES[this.backgroundPaletteIndex]);
    this.finishWave(true);
  }

  addScore(points) {
    this.score += points;
    scoreValue.textContent = String(this.score).padStart(5, "0");
    if (this.score > bestScore) {
      bestScore = this.score;
      bestValue.textContent = String(bestScore).padStart(5, "0");
      try {
        window.localStorage.setItem(STORAGE_KEY, String(bestScore));
      } catch (error) {
        storageNotice.textContent = "No se pudo guardar el récord en este navegador.";
      }
    }
  }

  finishWave(defeatedBoss) {
    this.playSound(523, 784, 0.16, "triangle", 0.04);
    this.playSound(659, 988, 0.18, "triangle", 0.04, 0.12);
    this.playSound(defeatedBoss ? 1047 : 784, defeatedBoss ? 1318 : 1047, 0.28, "triangle", 0.045, 0.24);
    this.wave += 1;
    waveValue.textContent = String(this.wave).padStart(2, "0");
    this.awaitingNextWave = true;
    this.isPlaying = false;
    this.player.setVelocity(0, 0);
    pauseButton.hidden = true;
    if (overlayRestartButton) {
      overlayRestartButton.hidden = true;
    }
    overlay.classList.remove("is-hidden");
    overlayEyebrow.textContent = defeatedBoss ? "JEFE DERROTADO" : "SECTOR DESPEJADO";
    overlayTitle.textContent = defeatedBoss ? "¡Jefe derrotado!" : "¡Nivel superado!";
    overlayMessage.textContent = `Oleada ${this.wave - 1} completada. Prepárate para defender el siguiente sector.`;
    startButton.innerHTML = '<i class="bi bi-arrow-right-circle me-2" aria-hidden="true"></i>Siguiente nivel';
  }

  // Daño a la nave al chocar con enemigos, jefe, asteroides o balas enemigas.
  hitPlayer(first, second) {
    if (!this.isPlaying || this.time.now < this.invulnerableUntil) {
      return;
    }
    const collidedObject = first === this.player ? second : first;
    if (collidedObject !== this.player && collidedObject.getData("isBoss") !== true) {
      if (collidedObject.texture && collidedObject.texture.key === "asteroid") {
        collidedObject.destroy();
      } else if (typeof collidedObject.getData("baseX") === "number") {
        this.destroyEnemy(collidedObject, false);
      } else {
        collidedObject.destroy();
      }
    }
    this.playSound(180, 70, 0.28, "sawtooth", 0.055);
    this.createExplosion(this.player.x, this.player.y, 0xff6eae, 42);
    this.invulnerableUntil = this.time.now + 650;
    this.lives -= 1;
    this.weaponLevel = 1;
    this.bombCount = 0;
    this.updateLivesHud();
    this.updatePowerupHud();
    this.player.setTint(0xff6eae);
    this.tweens.add({
      targets: this.player,
      alpha: 0.25,
      yoyo: true,
      repeat: 3,
      duration: 85,
      onComplete: () => this.player.setAlpha(1)
    });
    this.time.delayedCall(180, () => {
      if (this.player.active) {
        this.player.clearTint();
      }
    });
    if (this.lives <= 0) {
      this.finishGame();
    } else if (this.isPlaying && this.enemies.countActive() === 0) {
      this.finishWave(false);
    }
  }

  finishGame() {
    if (!this.isPlaying) {
      return;
    }
    this.playSound(330, 165, 0.45, "triangle", 0.045);
    this.isPlaying = false;
    this.awaitingNextWave = false;
    this.isPausedGame = false;
    this.player.setVelocity(0, 0);
    pauseButton.hidden = true;
    if (overlayRestartButton) {
      overlayRestartButton.hidden = true;
    }
    overlay.classList.remove("is-hidden");
    overlayEyebrow.textContent = "FIN DE LA PARTIDA";
    overlayTitle.textContent = "¡Buen combate, piloto!";
    overlayMessage.textContent = `Puntuación: ${this.score.toLocaleString("es-ES")} puntos. ¿Intentamos superar ese récord?`;
    startButton.innerHTML = '<i class="bi bi-arrow-clockwise me-2" aria-hidden="true"></i>Jugar de nuevo';
  }

  continueWave() {
    this.playSound(440, 660, 0.2, "triangle", 0.04);
    this.awaitingNextWave = false;
    this.createWave();
    this.nextEnemyShotAt = this.time.now + this.getEnemyFireDelay();
    overlay.classList.add("is-hidden");
    this.isPlaying = true;
    pauseButton.hidden = false;
  }

  togglePause() {
    if (this.isPausedGame) {
      this.resumeGame();
      return;
    }
    if (!this.isPlaying) {
      return;
    }
    this.playSound(440, 330, 0.12, "sine", 0.035);
    this.isPausedGame = true;
    this.physics.world.pause();
    overlay.classList.remove("is-hidden");
    overlayEyebrow.textContent = "PARTIDA EN PAUSA";
    overlayTitle.textContent = "Tómate un respiro";
    overlayMessage.textContent = "La galaxia espera. Pulsa P para continuar o reinicia cuando quieras.";
    startButton.innerHTML = '<i class="bi bi-play-fill me-2" aria-hidden="true"></i>Continuar';
    if (overlayRestartButton) {
      overlayRestartButton.hidden = false;
    }
    pauseButton.innerHTML = '<i class="bi bi-play-fill" aria-hidden="true"></i><span class="hud-btn-text">Continuar</span>';
    pauseButton.setAttribute("aria-label", "Reanudar juego");
  }

  resumeGame() {
    this.playSound(330, 440, 0.12, "sine", 0.035);
    this.isPausedGame = false;
    this.physics.world.resume();
    this.isPlaying = true;
    overlay.classList.add("is-hidden");
    if (overlayRestartButton) {
      overlayRestartButton.hidden = true;
    }
    pauseButton.innerHTML = '<i class="bi bi-pause-fill" aria-hidden="true"></i><span class="hud-btn-text">Pausar</span>';
    pauseButton.setAttribute("aria-label", "Pausar juego");
  }

  startGame() {
    this.initializeAudio();
    this.playSound(440, 660, 0.2, "triangle", 0.04);
    scoreValue.textContent = "00000";
    waveValue.textContent = "01";
    this.lives = 3;
    this.weaponLevel = 1;
    this.bombCount = 0;
    this.bossSpeedBonus = 0;
    this.backgroundPaletteIndex = 0;
    this.updateLivesHud();
    this.updatePowerupHud();
    touchState.horizontal = 0;
    touchState.vertical = 0;
    touchState.fire = false;
    virtualJoystick.classList.remove("is-left", "is-right", "is-up", "is-down");
    pauseButton.hidden = true;
    pauseButton.innerHTML = '<i class="bi bi-pause-fill" aria-hidden="true"></i><span class="hud-btn-text">Pausar</span>';
    pauseButton.setAttribute("aria-label", "Pausar juego");
    if (overlayRestartButton) {
      overlayRestartButton.hidden = true;
    }
    overlay.classList.add("is-hidden");
    overlayEyebrow.textContent = "PILOTO, TE NECESITAMOS";
    overlayTitle.textContent = "¿Listo para despegar?";
    overlayMessage.textContent = "Muévete, dispara y protege la galaxia de la invasión.";
    startButton.innerHTML = '<i class="bi bi-play-fill me-2" aria-hidden="true"></i>Iniciar partida';
    this.isPausedGame = false;
    this.awaitingNextWave = false;
    this.setArenaBackground(BACKGROUND_PALETTES[this.backgroundPaletteIndex]);
    this.clearBossDisplay();
    this.scene.restart();
    this.events.once("create", () => {
      this.isPlaying = true;
      this.nextEnemyShotAt = this.time.now + this.getEnemyFireDelay();
      this.nextAsteroidSpawnAt = this.time.now + 4000;
      this.physics.world.resume();
      pauseButton.hidden = false;
    });
  }

  restartGame() {
    if (this.isPausedGame) {
      this.physics.world.resume();
      this.isPausedGame = false;
    }
    this.clearBossDisplay();
    this.startGame();
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: getGameWidth(),
  height: GAME_HEIGHT,
  parent: "game-container",
  backgroundColor: "#080b1b",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: "arcade",
    arcade: { debug: false }
  },
  scene: [GalagaScene]
});

desktopLayout.addEventListener("change", (event) => {
  const width = event.matches ? DESKTOP_GAME_WIDTH : MOBILE_GAME_WIDTH;
  const scene = game.scene.getScene("galaga");
  const widthRatio = width / scene.scale.width;
  game.scale.setGameSize(width, GAME_HEIGHT);
  scene.physics.world.setBounds(0, 0, width, GAME_HEIGHT);
  if (scene.player?.active) {
    scene.player.x = Phaser.Math.Clamp(scene.player.x * widthRatio, 32, width - 32);
  }
  scene.stars?.forEach((star) => { star.x *= widthRatio; });
  [scene.bullets, scene.enemyBullets, scene.bombs, scene.enemies, scene.asteroids, scene.rewards].forEach((group) => {
    group?.getChildren().forEach((entity) => {
      entity.x *= widthRatio;
      const baseX = entity.getData("baseX");
      if (typeof baseX === "number") {
        entity.setData("baseX", baseX * widthRatio);
      }
    });
  });
});

startButton.addEventListener("click", () => {
  startButton.blur();
  const scene = game.scene.getScene("galaga");
  if (scene.isPausedGame) {
    scene.resumeGame();
  } else if (scene.awaitingNextWave) {
    scene.continueWave();
  } else {
    scene.startGame();
  }
});

pauseButton.addEventListener("click", () => {
  pauseButton.blur();
  game.scene.getScene("galaga").togglePause();
});

bombButton.addEventListener("click", () => {
  game.scene.getScene("galaga").launchBomb();
});
touchBombButton.addEventListener("click", () => {
  game.scene.getScene("galaga").launchBomb();
});

if (restartButton) {
  restartButton.addEventListener("click", () => {
    restartButton.blur();
    game.scene.getScene("galaga").restartGame();
  });
}

if (overlayRestartButton) {
  overlayRestartButton.addEventListener("click", () => {
    overlayRestartButton.blur();
    game.scene.getScene("galaga").restartGame();
  });
}

document.querySelectorAll("[data-control]").forEach((button) => {
  const control = button.dataset.control;
  const release = () => {
    touchState[control] = false;
    button.classList.remove("is-pressed");
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    touchState[control] = true;
    button.classList.add("is-pressed");
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});

let joystickPointerId = null;
const resetJoystick = () => {
  joystickPointerId = null;
  touchState.horizontal = 0;
  touchState.vertical = 0;
  virtualJoystick.classList.remove("is-left", "is-right", "is-up", "is-down");
};
const moveWithJoystick = (event) => {
  const bounds = virtualJoystick.getBoundingClientRect();
  const offsetX = event.clientX - (bounds.left + bounds.width / 2);
  const offsetY = event.clientY - (bounds.top + bounds.height / 2);
  const maxOffset = bounds.width * 0.32;
  const deadZone = 0.18;
  const getAxis = (offset) => {
    const normalized = Phaser.Math.Clamp(offset / maxOffset, -1, 1);
    return Math.abs(normalized) < deadZone
      ? 0
      : Math.sign(normalized) * (Math.abs(normalized) - deadZone) / (1 - deadZone);
  };
  touchState.horizontal = getAxis(offsetX);
  touchState.vertical = getAxis(offsetY);
  virtualJoystick.classList.toggle("is-left", touchState.horizontal < 0);
  virtualJoystick.classList.toggle("is-right", touchState.horizontal > 0);
  virtualJoystick.classList.toggle("is-up", touchState.vertical < 0);
  virtualJoystick.classList.toggle("is-down", touchState.vertical > 0);
};

virtualJoystick.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  joystickPointerId = event.pointerId;
  virtualJoystick.setPointerCapture(event.pointerId);
  moveWithJoystick(event);
});
virtualJoystick.addEventListener("pointermove", (event) => {
  if (event.pointerId === joystickPointerId) {
    moveWithJoystick(event);
  }
});
virtualJoystick.addEventListener("pointerup", resetJoystick);
virtualJoystick.addEventListener("pointercancel", resetJoystick);
virtualJoystick.addEventListener("lostpointercapture", resetJoystick);
window.addEventListener("blur", resetJoystick);

const preventClipboardAction = (event) => event.preventDefault();
["selectstart", "copy", "cut", "paste", "contextmenu"].forEach((eventName) => {
  document.addEventListener(eventName, preventClipboardAction);
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && ["a", "c", "v", "x"].includes(event.key.toLowerCase())) {
    event.preventDefault();
  }
});

document.querySelector("#share-button").addEventListener("click", async () => {
  const shareData = { title: "Galaga — Defensa galáctica", text: "¡Defiende la galaxia en este juego arcade!", url: window.location.href };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareData.url);
      storageNotice.textContent = "¡Enlace del juego copiado para compartir!";
    } else {
      window.prompt("Copia el enlace del juego:", shareData.url);
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      storageNotice.textContent = "No se pudo compartir el enlace en este navegador.";
    }
  }
});
