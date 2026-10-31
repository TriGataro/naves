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
const storageNotice = document.querySelector("#storage-notice");

const STORAGE_KEY = "galaga-best-score";
const touchState = { left: false, right: false, fire: false };
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
  }

  // Crea las texturas, el jugador, la primera oleada y las colisiones del juego.
  create() {
    this.createTextures();
    this.createStars();
    this.player = this.physics.add.image(400, 535, "player-ship");
    this.player.setCollideWorldBounds(true);
    this.player.body.setAllowGravity(false);
    this.player.setDepth(2);
    this.bullets = this.physics.add.group({ allowGravity: false });
    this.enemyBullets = this.physics.add.group({ allowGravity: false });
    this.enemies = this.physics.add.group({ allowGravity: false, immovable: true });
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("A,D,SPACE,P");
    this.physics.world.setBounds(0, 0, 800, 600);
    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.isPlaying = false;
    this.lastShotAt = 0;
    this.invulnerableUntil = 0;
    this.formationOffset = 0;
    this.formationDirection = 1;
    this.awaitingNextWave = false;
    this.isPausedGame = false;
    this.nextEnemyShotAt = this.time.now + this.getEnemyFireDelay();
    this.createWave();

    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy, undefined, this);
    this.physics.add.overlap(this.enemyBullets, this.player, this.hitPlayer, undefined, this);
    this.physics.add.overlap(this.enemies, this.player, this.hitPlayer, undefined, this);
  }

  // Dibuja las naves y los proyectiles como texturas para no depender de imágenes externas.
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

    // Crea tres siluetas de invasores con blindaje y luces de distintos colores.
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
    graphics.destroy();
  }

  // Distribuye estrellas en el fondo para dar profundidad y movimiento al espacio.
  createStars() {
    this.stars = [];
    for (let index = 0; index < 85; index += 1) {
      const size = Math.random() > 0.9 ? 2 : 1;
      const star = this.add.circle(
        Phaser.Math.Between(0, 800),
        Phaser.Math.Between(0, 600),
        size,
        index % 4 === 0 ? 0x8c9aff : 0xffffff,
        Phaser.Math.FloatBetween(0.25, 0.8)
      );
      star.setData("speed", Phaser.Math.FloatBetween(12, 42));
      this.stars.push(star);
    }
  }

  // Genera una formación de enemigos con una velocidad que aumenta en cada oleada.
  createWave() {
    this.formationOffset = 0;
    this.formationDirection = 1;
    if (this.wave % 4 === 0) {
      const boss = this.enemies.create(400, 120, "enemy-boss");
      boss.setDepth(2);
      boss.setScale(1.65);
      boss.body.setAllowGravity(false);
      boss.setData("isBoss", true);
      boss.setData("health", 12 + (this.wave / 4 - 1) * 4);
      boss.setData("maxHealth", boss.getData("health"));
      this.bossHealthBar = this.add.graphics().setDepth(3);
      this.bossLabel = this.add.text(400, 24, "JEFE DE SECTOR", {
        color: "#ffc4f4",
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        letterSpacing: 2
      }).setOrigin(0.5).setDepth(3);
      return;
    }

    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const texture = row === 0 ? "enemy-elite" : row === 1 ? "enemy-guardian" : "enemy-scout";
        const enemy = this.enemies.create(160 + column * 68, 80 + row * 53, texture);
        enemy.setDepth(1);
        enemy.body.setAllowGravity(false);
        enemy.setData("baseX", enemy.x);
      }
    }
  }

  // Lee teclado y controles táctiles, mueve la nave y dispara mientras la partida esté activa.
  update(_time, delta) {
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
      if (star.y > 600) {
        star.y = 0;
        star.x = Phaser.Math.Between(0, 800);
      }
    });

    [this.bullets, this.enemyBullets].forEach((group) => {
      group.getChildren().forEach((bullet) => {
        if (bullet && bullet.active && (bullet.y < -20 || bullet.y > 620)) {
          bullet.destroy();
        }
      });
    });

    if (!this.isPlaying || !this.player.active) {
      return;
    }

    const movingLeft = this.cursors.left.isDown || this.keys.A.isDown || touchState.left;
    const movingRight = this.cursors.right.isDown || this.keys.D.isDown || touchState.right;
    const direction = Number(movingRight) - Number(movingLeft);
    this.player.setVelocityX(direction * 390);

    if (this.cursors.space.isDown || this.keys.SPACE.isDown || touchState.fire) {
      this.shoot();
    }

    if (this.time.now >= this.nextEnemyShotAt) {
      this.enemyFire();
    }

    const boss = this.enemies.getChildren().find((enemy) => enemy.active && enemy.getData("isBoss"));
    if (boss) {
      boss.x = 400 + Math.sin(this.time.now / 650) * 245;
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

  // Lanza un proyectil desde la nave y limita la cadencia para mantener el control del juego.
  shoot() {
    if (this.time.now - this.lastShotAt < 230) {
      return;
    }
    this.lastShotAt = this.time.now;
    const bullet = this.bullets.create(this.player.x, this.player.y - 22, "player-bullet");
    bullet.setDepth(1);
    bullet.body.setAllowGravity(false);
    bullet.setVelocityY(-540);
    bullet.setCollideWorldBounds(false);
    bullet.setData("expiresAt", this.time.now + 1500);
  }

  // Escoge un invasor vivo y dispara hacia la zona de la nave del jugador.
  enemyFire() {
    if (!this.isPlaying || this.enemies.countActive() === 0) {
      return;
    }
    const livingEnemies = this.enemies.getChildren().filter((enemy) => enemy.active);
    const shooter = Phaser.Utils.Array.GetRandom(livingEnemies);
    const speed = this.getEnemyBulletSpeed();
    const isBoss = shooter.getData("isBoss");
    const spread = isBoss ? [-0.22, 0, 0.22] : [0];
    spread.forEach((angle) => {
      const bullet = this.enemyBullets.create(shooter.x, shooter.y + 30, "enemy-bullet");
      bullet.body.setAllowGravity(false);
      bullet.setVelocity(angle * speed, speed);
      bullet.setData("expiresAt", this.time.now + 3000);
    });
    this.nextEnemyShotAt = this.time.now + this.getEnemyFireDelay();
  }

  // Dibuja la barra de vida del jefe encima de su nave.
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

  // Elimina la interfaz de salud del jefe cuando termina su combate.
  clearBossDisplay() {
    this.bossHealthBar?.destroy();
    this.bossLabel?.destroy();
    this.bossHealthBar = null;
    this.bossLabel = null;
  }

  // Aumenta la velocidad de la formación con cada oleada y evita una aceleración ilimitada.
  getFormationSpeed() {
    return Math.min(14 + (this.wave - 1) * 9, 86);
  }

  // Hace que los proyectiles enemigos también se aceleren gradualmente entre oleadas.
  getEnemyBulletSpeed() {
    return Math.min(120 + (this.wave - 1) * 18, 340);
  }

  // Reduce gradualmente el tiempo entre disparos enemigos conforme avanzan las oleadas.
  getEnemyFireDelay() {
    return Math.max(650, 1550 - (this.wave - 1) * 120);
  }

  // Aplica daño a los enemigos, actualiza puntos y completa el nivel al vaciar la formación.
  hitEnemy(bullet, enemy) {
    bullet.destroy();
    if (enemy.getData("isBoss")) {
      const health = enemy.getData("health") - 1;
      enemy.setData("health", health);
      this.addScore(100);
      if (health <= 0) {
        enemy.destroy();
        this.clearBossDisplay();
        this.addScore(1500);
        this.finishWave(true);
      }
      return;
    }

    enemy.destroy();
    this.addScore(100);
    if (this.enemies.countActive() === 0) {
      this.finishWave(false);
    }
  }

  // Suma puntos, actualiza el récord y lo guarda localmente cuando cambia.
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

  // Muestra el resultado del nivel y espera a que el jugador inicie la siguiente oleada.
  finishWave(defeatedBoss) {
    this.wave += 1;
    waveValue.textContent = String(this.wave).padStart(2, "0");
    this.awaitingNextWave = true;
    this.isPlaying = false;
    this.player.setVelocity(0, 0);
    pauseButton.hidden = true;
    overlay.classList.remove("is-hidden");
    overlayEyebrow.textContent = defeatedBoss ? "JEFE DERROTADO" : "SECTOR DESPEJADO";
    overlayTitle.textContent = defeatedBoss ? "¡Jefe derrotado!" : "¡Nivel superado!";
    overlayMessage.textContent = `Oleada ${this.wave - 1} completada. Prepárate para defender el siguiente sector.`;
    startButton.innerHTML = '<i class="bi bi-arrow-right-circle me-2" aria-hidden="true"></i>Siguiente nivel';
  }

  // Resta una vida al recibir un impacto y termina la partida cuando ya no quedan vidas.
  hitPlayer(first, second) {
    if (!this.isPlaying || this.time.now < this.invulnerableUntil) {
      return;
    }
    const collidedObject = first === this.player ? second : first;
    if (collidedObject !== this.player) {
      collidedObject.destroy();
    }
    this.invulnerableUntil = this.time.now + 650;
    this.lives -= 1;
    livesValue.textContent = `${"♥ ".repeat(this.lives)}${"♡ ".repeat(3 - this.lives)}`.trim();
    livesValue.setAttribute("aria-label", `${this.lives} vidas`);
    this.player.setTint(0xff6eae);
    this.time.delayedCall(180, () => {
      if (this.player.active) {
        this.player.clearTint();
      }
    });
    if (this.lives <= 0) {
      this.finishGame();
    }
  }

  // Detiene la partida y muestra el resultado con una opción para volver a jugar.
  finishGame() {
    if (!this.isPlaying) {
      return;
    }
    this.isPlaying = false;
    this.awaitingNextWave = false;
    this.isPausedGame = false;
    this.player.setVelocity(0, 0);
    pauseButton.hidden = true;
    overlay.classList.remove("is-hidden");
    overlayEyebrow.textContent = "FIN DE LA PARTIDA";
    overlayTitle.textContent = "¡Buen combate, piloto!";
    overlayMessage.textContent = `Puntuación: ${this.score.toLocaleString("es-ES")} puntos. ¿Intentamos superar ese récord?`;
    startButton.innerHTML = '<i class="bi bi-arrow-clockwise me-2" aria-hidden="true"></i>Jugar de nuevo';
  }

  // Inicia la siguiente oleada después de mostrar el mensaje de nivel superado.
  continueWave() {
    this.awaitingNextWave = false;
    this.createWave();
    this.nextEnemyShotAt = this.time.now + this.getEnemyFireDelay();
    overlay.classList.add("is-hidden");
    this.isPlaying = true;
    pauseButton.hidden = false;
  }

  // Pausa el mundo y abre el panel de pausa, o reanuda si ya estaba detenido.
  togglePause() {
    if (this.isPausedGame) {
      this.resumeGame();
      return;
    }
    if (!this.isPlaying) {
      return;
    }
    this.isPausedGame = true;
    this.physics.world.pause();
    overlay.classList.remove("is-hidden");
    overlayEyebrow.textContent = "PARTIDA EN PAUSA";
    overlayTitle.textContent = "Tómate un respiro";
    overlayMessage.textContent = "La galaxia espera. Pulsa P o continúa cuando estés listo.";
    startButton.innerHTML = '<i class="bi bi-play-fill me-2" aria-hidden="true"></i>Continuar';
    pauseButton.innerHTML = '<i class="bi bi-play-fill" aria-hidden="true"></i><span>Continuar</span>';
    pauseButton.setAttribute("aria-label", "Reanudar juego");
  }

  // Cierra el panel de pausa y reactiva la física y los controles.
  resumeGame() {
    this.isPausedGame = false;
    this.physics.world.resume();
    this.isPlaying = true;
    overlay.classList.add("is-hidden");
    pauseButton.innerHTML = '<i class="bi bi-pause-fill" aria-hidden="true"></i><span>Pausar</span>';
    pauseButton.setAttribute("aria-label", "Pausar juego");
  }

  // Reinicia la escena con el marcador y las vidas iniciales.
  startGame() {
    scoreValue.textContent = "00000";
    waveValue.textContent = "01";
    livesValue.textContent = "♥ ♥ ♥";
    livesValue.setAttribute("aria-label", "3 vidas");
    touchState.left = false;
    touchState.right = false;
    touchState.fire = false;
    pauseButton.hidden = true;
    overlay.classList.add("is-hidden");
    overlayEyebrow.textContent = "PILOTO, TE NECESITAMOS";
    overlayTitle.textContent = "¿Listo para despegar?";
    overlayMessage.textContent = "Muévete, dispara y protege la galaxia de la invasión.";
    startButton.innerHTML = '<i class="bi bi-play-fill me-2" aria-hidden="true"></i>Iniciar partida';
    this.scene.restart();
    this.events.once("create", () => {
      this.isPlaying = true;
      this.nextEnemyShotAt = this.time.now + this.getEnemyFireDelay();
      this.physics.world.resume();
      pauseButton.hidden = false;
    });
  }
}

// Configura el lienzo escalable de Phaser y vincula los botones de la página.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
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

startButton.addEventListener("click", () => {
  const scene = game.scene.getScene("galaga");
  if (scene.isPausedGame) {
    scene.resumeGame();
  } else if (scene.awaitingNextWave) {
    scene.continueWave();
  } else {
    scene.startGame();
  }
});

// Permite pausar o reanudar con el botón visible en el marcador.
pauseButton.addEventListener("click", () => {
  game.scene.getScene("galaga").togglePause();
});

// Mantiene los controles táctiles activos hasta que se suelta el dedo o el botón pierde el foco.
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

// Comparte el enlace con el menú del dispositivo o lo copia si la API nativa no está disponible.
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
