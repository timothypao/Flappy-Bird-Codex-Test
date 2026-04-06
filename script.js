(function () {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const GAME_WIDTH = canvas.width;
  const GAME_HEIGHT = canvas.height;
  const GROUND_HEIGHT = 110;
  const PIPE_WIDTH = 86;
  const PIPE_GAP = 170;
  const BASE_PIPE_SPEED = 205;
  const MAX_PIPE_SPEED = 320;
  const BASE_PIPE_INTERVAL = 1.45;
  const MIN_PIPE_INTERVAL = 0.95;
  const PIPE_INTERVAL_DECAY = 0.017;
  const GRAVITY = 1600;
  const FLAP_VELOCITY = -440;
  const MAX_FALL_SPEED = 900;
  const BIRD_X = 140;
  const BIRD_RADIUS = 18;
  const HIGH_SCORE_KEY = "flappy-bird-codex-high-score";

  const state = {
    mode: "start",
    birdY: GAME_HEIGHT * 0.42,
    birdVelocity: 0,
    pipes: [],
    score: 0,
    highScore: getHighScore(),
    timeSincePipe: 0,
    elapsed: 0,
    lastFrame: 0,
    backgroundOffset: 0,
    cloudsOffset: 0,
    audioReady: false,
    audioCtx: null
  };

  function getHighScore() {
    try {
      const saved = window.localStorage.getItem(HIGH_SCORE_KEY);
      return saved ? Number(saved) || 0 : 0;
    } catch (error) {
      return 0;
    }
  }

  function saveHighScore() {
    try {
      window.localStorage.setItem(HIGH_SCORE_KEY, String(state.highScore));
    } catch (error) {
      // Storage may be unavailable in privacy-restricted contexts.
    }
  }

  function resetGame(mode) {
    state.mode = mode;
    state.birdY = GAME_HEIGHT * 0.42;
    state.birdVelocity = 0;
    state.pipes = [];
    state.score = 0;
    state.timeSincePipe = 0;
    state.elapsed = 0;
    state.backgroundOffset = 0;
    state.cloudsOffset = 0;
  }

  function currentPipeSpeed() {
    return Math.min(MAX_PIPE_SPEED, BASE_PIPE_SPEED + state.elapsed * 4.5);
  }

  function currentPipeInterval() {
    return Math.max(MIN_PIPE_INTERVAL, BASE_PIPE_INTERVAL - state.elapsed * PIPE_INTERVAL_DECAY);
  }

  function spawnPipe() {
    const marginTop = 110;
    const marginBottom = GROUND_HEIGHT + 120;
    const minTopHeight = marginTop;
    const maxTopHeight = GAME_HEIGHT - marginBottom - PIPE_GAP;
    const topHeight = randomBetween(minTopHeight, maxTopHeight);

    state.pipes.push({
      x: GAME_WIDTH + PIPE_WIDTH,
      topHeight,
      bottomY: topHeight + PIPE_GAP,
      scored: false
    });
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function startGame() {
    resetGame("playing");
    flap();
  }

  function flap() {
    if (state.mode === "gameover") {
      startGame();
      return;
    }

    if (state.mode === "start") {
      startGame();
      return;
    }

    state.birdVelocity = FLAP_VELOCITY;
    playTone(880, 0.05, "square", 0.03);
  }

  function update(deltaTime) {
    const dt = Math.min(deltaTime, 0.032);

    if (state.mode === "start") {
      state.cloudsOffset = (state.cloudsOffset + dt * 10) % GAME_WIDTH;
      state.backgroundOffset = (state.backgroundOffset + dt * 20) % GAME_WIDTH;
      state.birdY = GAME_HEIGHT * 0.42 + Math.sin(performance.now() * 0.005) * 10;
      return;
    }

    if (state.mode !== "playing") {
      state.cloudsOffset = (state.cloudsOffset + dt * 8) % GAME_WIDTH;
      state.backgroundOffset = (state.backgroundOffset + dt * 16) % GAME_WIDTH;
      return;
    }

    state.elapsed += dt;
    state.timeSincePipe += dt;
    state.birdVelocity = Math.min(MAX_FALL_SPEED, state.birdVelocity + GRAVITY * dt);
    state.birdY += state.birdVelocity * dt;

    const pipeSpeed = currentPipeSpeed();
    state.backgroundOffset = (state.backgroundOffset + dt * (pipeSpeed * 0.22)) % GAME_WIDTH;
    state.cloudsOffset = (state.cloudsOffset + dt * (pipeSpeed * 0.1)) % GAME_WIDTH;

    if (state.timeSincePipe >= currentPipeInterval()) {
      spawnPipe();
      state.timeSincePipe = 0;
    }

    state.pipes.forEach((pipe) => {
      pipe.x -= pipeSpeed * dt;

      if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X) {
        pipe.scored = true;
        state.score += 1;
        if (state.score > state.highScore) {
          state.highScore = state.score;
          saveHighScore();
        }
        playTone(1260, 0.06, "triangle", 0.035);
      }
    });

    state.pipes = state.pipes.filter((pipe) => pipe.x + PIPE_WIDTH > -40);

    if (isCollision()) {
      endGame();
    }
  }

  function isCollision() {
    const birdTop = state.birdY - BIRD_RADIUS;
    const birdBottom = state.birdY + BIRD_RADIUS;
    const birdLeft = BIRD_X - BIRD_RADIUS;
    const birdRight = BIRD_X + BIRD_RADIUS;

    if (birdBottom >= GAME_HEIGHT - GROUND_HEIGHT || birdTop <= 0) {
      return true;
    }

    return state.pipes.some((pipe) => {
      const overlapsHorizontally = birdRight > pipe.x && birdLeft < pipe.x + PIPE_WIDTH;
      const hitsTopPipe = birdTop < pipe.topHeight;
      const hitsBottomPipe = birdBottom > pipe.bottomY;
      return overlapsHorizontally && (hitsTopPipe || hitsBottomPipe);
    });
  }

  function endGame() {
    if (state.mode !== "playing") {
      return;
    }

    state.mode = "gameover";
    if (state.score > state.highScore) {
      state.highScore = state.score;
      saveHighScore();
    }
    playTone(220, 0.16, "sawtooth", 0.04);
    setTimeout(() => playTone(140, 0.2, "sawtooth", 0.03), 70);
  }

  function render() {
    drawSky();
    drawSun();
    drawClouds();
    drawHills();
    drawPipes();
    drawGround();
    drawBird();
    drawScoreboard();

    if (state.mode === "start") {
      drawOverlay("Press Space to Start", "Click or press Space to flap through the pipes");
    } else if (state.mode === "gameover") {
      drawOverlay("Game Over", "Press Space or click to restart");
    }
  }

  function drawSky() {
    const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    gradient.addColorStop(0, "#7fd6ff");
    gradient.addColorStop(0.65, "#b8eeff");
    gradient.addColorStop(1, "#dff7ff");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  function drawSun() {
    ctx.save();
    ctx.fillStyle = "rgba(255, 231, 159, 0.95)";
    ctx.beginPath();
    ctx.arc(GAME_WIDTH - 88, 92, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawClouds() {
    const cloudSets = [
      { y: 110, size: 1.1, speedOffset: state.cloudsOffset },
      { y: 190, size: 0.8, speedOffset: state.cloudsOffset * 1.3 }
    ];

    cloudSets.forEach((cloudRow) => {
      for (let i = -1; i < 4; i += 1) {
        const x = i * 180 - (cloudRow.speedOffset % 180);
        drawCloud(x, cloudRow.y, cloudRow.size);
      }
    });
  }

  function drawCloud(x, y, scale) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
    ctx.beginPath();
    ctx.arc(x + 36 * scale, y, 24 * scale, 0, Math.PI * 2);
    ctx.arc(x + 58 * scale, y - 12 * scale, 28 * scale, 0, Math.PI * 2);
    ctx.arc(x + 88 * scale, y, 22 * scale, 0, Math.PI * 2);
    ctx.arc(x + 62 * scale, y + 12 * scale, 26 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHills() {
    const offset = state.backgroundOffset;

    ctx.save();
    ctx.fillStyle = "#96da72";
    for (let i = -1; i < 3; i += 1) {
      const x = i * 240 - offset;
      drawHill(x, GAME_HEIGHT - GROUND_HEIGHT + 20, 170, 90);
    }

    ctx.fillStyle = "#72c45b";
    for (let i = -1; i < 3; i += 1) {
      const x = i * 220 - (offset * 1.3 % 220);
      drawHill(x + 70, GAME_HEIGHT - GROUND_HEIGHT + 35, 150, 80);
    }
    ctx.restore();
  }

  function drawHill(x, y, width, height) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + width * 0.35, y - height, x + width * 0.5, y - height);
    ctx.quadraticCurveTo(x + width * 0.7, y - height, x + width, y);
    ctx.closePath();
    ctx.fill();
  }

  function drawPipes() {
    state.pipes.forEach((pipe) => {
      drawPipe(pipe.x, 0, PIPE_WIDTH, pipe.topHeight, true);
      drawPipe(pipe.x, pipe.bottomY, PIPE_WIDTH, GAME_HEIGHT - pipe.bottomY - GROUND_HEIGHT, false);
    });
  }

  function drawPipe(x, y, width, height, topPipe) {
    ctx.save();

    const pipeGradient = ctx.createLinearGradient(x, 0, x + width, 0);
    pipeGradient.addColorStop(0, "#2f993d");
    pipeGradient.addColorStop(0.5, "#5fd164");
    pipeGradient.addColorStop(1, "#2f993d");

    ctx.fillStyle = pipeGradient;
    ctx.fillRect(x, y, width, height);

    const capHeight = 22;
    const capY = topPipe ? height - capHeight : y;
    ctx.fillStyle = "#2c8a39";
    ctx.fillRect(x - 6, capY, width + 12, capHeight);

    ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    ctx.restore();
  }

  function drawGround() {
    const groundY = GAME_HEIGHT - GROUND_HEIGHT;

    ctx.save();
    ctx.fillStyle = "#ded895";
    ctx.fillRect(0, groundY, GAME_WIDTH, 18);

    ctx.fillStyle = "#cfb96d";
    ctx.fillRect(0, groundY + 18, GAME_WIDTH, GROUND_HEIGHT - 18);

    ctx.fillStyle = "#9ccf5d";
    ctx.fillRect(0, groundY, GAME_WIDTH, 10);

    const stripeOffset = state.backgroundOffset * 2.1;
    ctx.fillStyle = "rgba(140, 101, 45, 0.18)";
    for (let i = -1; i < 16; i += 1) {
      ctx.fillRect(i * 36 - (stripeOffset % 36), groundY + 24, 18, GROUND_HEIGHT - 34);
    }
    ctx.restore();
  }

  function drawBird() {
    const rotation = Math.max(-0.55, Math.min(1.1, state.birdVelocity / 620));

    ctx.save();
    ctx.translate(BIRD_X, state.birdY);
    ctx.rotate(rotation);

    ctx.fillStyle = "#ffd447";
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffb01f";
    ctx.beginPath();
    ctx.ellipse(-2, 4, 11, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(7, -6, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1c2430";
    ctx.beginPath();
    ctx.arc(9, -6, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff8c36";
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(30, 4);
    ctx.lineTo(14, 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#f6a623";
    ctx.beginPath();
    ctx.ellipse(-6, 2, 10, 6, -0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawScoreboard() {
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    roundedRectPath(18, 18, 170, 70, 16);
    ctx.fill();

    ctx.fillStyle = "#17314b";
    ctx.font = "bold 28px Trebuchet MS";
    ctx.fillText(`Score: ${state.score}`, 32, 50);

    ctx.font = "bold 18px Trebuchet MS";
    ctx.fillText(`Best: ${state.highScore}`, 32, 76);
    ctx.restore();
  }

  function drawOverlay(title, subtitle) {
    ctx.save();
    ctx.fillStyle = "rgba(15, 35, 54, 0.28)";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    roundedRectPath(45, 220, GAME_WIDTH - 90, 200, 24);
    ctx.fill();

    ctx.fillStyle = "#17314b";
    ctx.textAlign = "center";
    ctx.font = "bold 38px Trebuchet MS";
    ctx.fillText(title, GAME_WIDTH / 2, 290);

    ctx.font = "20px Trebuchet MS";
    ctx.fillText(subtitle, GAME_WIDTH / 2, 330);

    if (state.mode === "gameover") {
      ctx.font = "bold 24px Trebuchet MS";
      ctx.fillText(`Final Score: ${state.score}`, GAME_WIDTH / 2, 372);
    }

    ctx.textAlign = "start";
    ctx.restore();
  }

  function roundedRectPath(x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();
  }

  function loop(timestamp) {
    if (!state.lastFrame) {
      state.lastFrame = timestamp;
    }

    const deltaTime = (timestamp - state.lastFrame) / 1000;
    state.lastFrame = timestamp;

    update(deltaTime);
    render();
    window.requestAnimationFrame(loop);
  }

  function ensureAudio() {
    if (state.audioReady) {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    state.audioCtx = new AudioContextClass();
    state.audioReady = true;
  }

  function playTone(frequency, duration, type, volume) {
    if (!state.audioCtx) {
      return;
    }

    if (state.audioCtx.state === "suspended") {
      state.audioCtx.resume().catch(() => {});
    }

    const oscillator = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    const startTime = state.audioCtx.currentTime;
    const endTime = startTime + duration;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    oscillator.connect(gain);
    gain.connect(state.audioCtx.destination);

    oscillator.start(startTime);
    oscillator.stop(endTime);
  }

  function handleAction(event) {
    if (event.type === "keydown" && event.code !== "Space") {
      return;
    }

    if (event.type === "keydown") {
      event.preventDefault();
    }

    ensureAudio();
    flap();
  }

  window.addEventListener("keydown", handleAction);
  canvas.addEventListener("pointerdown", handleAction);

  resetGame("start");
  window.requestAnimationFrame(loop);
})();
