// main.js
import { Simulation } from './physicsCore.js';

// --- Canvas & contexts ---
const canvas1 = document.getElementById("layer1");
const ctx1    = canvas1.getContext("2d");
const WIDTH   = canvas1.width;
const HEIGHT  = canvas1.height;

const canvas2 = document.getElementById("layer2");
const ctx2    = canvas2.getContext("2d");

const canvas3 = document.getElementById("layer3");
const ctx3    = canvas3.getContext("2d");

const canvas4 = document.getElementById("layer4");
const ctx4    = canvas4.getContext("2d");

const oscillator = document.getElementById("cvs2");
const otx        = oscillator.getContext("2d");
const oWIDTH     = oscillator.width;
const oHEIGHT    = oscillator.height;

const pendulum = document.getElementById("cvs3");
const ptx       = pendulum.getContext("2d");
const pWIDTH    = pendulum.width;
const pHEIGHT   = pendulum.height;

// --- Physical constants ---
const l1      = 1;
const l2      = 1;
const gravity = 9.8;
const spring1 = 8;
const spring2 = 5;
const MASS1   = 1;
const mu      = 1;
const rs      = 0.4;

// --- Simulation & loop state ---
let sim;
let id = null;

// Time logging
let startRealTime   = null;
let lastLogRealTime = null;
const logIntervalMs = 1000;

// State arrays (for drawing)
let Q = [];
let Qdot = [];

// Integration parameters
const dt  = 0.01;
const dq  = 0.0001;

// Drawing scales
let G_SCALE = 100;
const P_SCALE = 100;
const K_SCALE = 50;

// --- Helpers to build config & type ---
function readConfig() {
  return {
    MASS: MASS1,
    mu:   mu,
    g:    gravity,
    l1:   l1,
    l2:   l2,
    k1:   spring1,
    k2:   spring2,
    rs:   rs
  };
}

function readType() {
  return {
    potential: document.getElementById("potentialSelect").value,
    metric:    document.getElementById("metricSelect").value
  };
}

function buildConstraintFn() {
  return (q1, q2) => {
    const expr = document.getElementById("constraintInput").value;
    try {
      return new Function("q1", "q2", `return ${expr};`)(q1, q2);
    } catch (e) {
      return 0;
    }
  };
}

// --- Start button handler ---
document.getElementById("startBtn").addEventListener("click", () => {
  // Cancel any running animation
  if (id !== null) {
    cancelAnimationFrame(id);
    id = null;
  }

  // Initialize simulation
  const cfg        = readConfig();
  const type       = readType();
  const constraint = buildConstraintFn();
  sim = new Simulation(cfg, type, constraint);

  // Bind legacy globals for drawing and energy checks
  window.getPotential = () => type.potential;
  window.getMetric    = () => type.metric;
  window.Potential    = (q1, q2) => sim.potential(q1, q2);
  window.localMetric  = (q1, q2) => sim.localMetric(q1, q2);
  window.localInverse = (q1, q2) => sim.localInverse(q1, q2);
  window.Constraint   = constraint;

  window.computeEnergy = (q1, q2, v1, v2) => {
    const g = sim.localMetric(q1, q2);
    const T = 0.5 * (g[0][0]*v1*v1 + 2*g[0][1]*v1*v2 + g[1][1]*v2*v2);
    const V = sim.potential(q1, q2);
    return T + V;
  };

  // Read initial state and scale
  Q    = [parseFloat(document.getElementById("inputQ1").value),
           parseFloat(document.getElementById("inputQ2").value)];
  Qdot = [parseFloat(document.getElementById("inputV1").value),
           parseFloat(document.getElementById("inputV2").value)];
  sim.initState(Q, Qdot);

  G_SCALE         = parseFloat(document.getElementById("inputScale").value);
  lastLogRealTime = null;

  // Record initial energy
  const E0 = computeEnergy(Q[0], Q[1], Qdot[0], Qdot[1]);

  // Clear canvases & draw initial background
  ctx1.clearRect(0, 0, WIDTH, HEIGHT);
  ctx2.clearRect(0, 0, WIDTH, HEIGHT);
  ctx3.clearRect(0, 0, WIDTH, HEIGHT);
  ctx4.clearRect(0, 0, WIDTH, HEIGHT);
  if (getPotential() !== "free") drawLegend(ctx4);
  drawSpace(ctx1);
  addLine(ctx1, WIDTH, HEIGHT);
  axisName(ctx1);

  // Start animation loop
  id = requestAnimationFrame(animate);
});

// --- Stop button handler ---
document.getElementById("stopBtn").addEventListener("click", () => {
  if (id !== null) {
    cancelAnimationFrame(id);
    id = null;
  }
});

// --- Animation loop ---
function animate(timestamp) {
  // Clear trail layer
  ctx3.clearRect(0, 0, WIDTH, HEIGHT);

  if (lastLogRealTime === null) {
    lastLogRealTime   = timestamp;
    startRealTime     = performance.now();
  }

  // Store previous position for trail
  const prevQ = [...sim.getState().Q];

  // Two substeps per frame
  for (let i = 0; i < 2; i++) {
    sim.rk4Step(dt, dq);
    const state = sim.getState();
    Q    = state.Q;
    Qdot = state.Qdot;

    const nowPerf = performance.now();
    if (nowPerf - lastLogRealTime >= logIntervalMs) {
      const epsilon = Math.abs(computeEnergy(Q[0], Q[1], Qdot[0], Qdot[1]) - E0)/E0;
      logError((nowPerf - startRealTime) / 1000, epsilon);
      lastLogRealTime = nowPerf;
    }
  }

  // Draw
  drawLine(prevQ[0], prevQ[1], ctx2);
  drawParticle(ctx3);
  drawOscillator(otx);
  drawPendulum(ptx);

  id = requestAnimationFrame(animate);
}

// --- UI event hooks (unchanged) ---
document.querySelectorAll('input[name="attraction"]').forEach(radio => {
  radio.addEventListener('change', e => {
    const v = e.target.value;
    window.k = (v === "repulsion") ? Math.abs(rs/2) : -Math.abs(rs/2);
    drawSpace(ctx1);
    addLine(ctx1, WIDTH, HEIGHT);
    axisName(ctx1);
  });
});

document.getElementById("potentialSelect").addEventListener("change", () => {
  const pot = getPotential();
  document.getElementById("attractionWrapper").style.display = (pot === "Central") ? "inline-block" : "none";
  drawSpace(ctx1);
  addLine(ctx1, WIDTH, HEIGHT);
  axisName(ctx1);
  ctx4.clearRect(0, 0, WIDTH, HEIGHT);
  if (pot !== "free") drawLegend(ctx4);
});

document.getElementById("metricSelect").addEventListener("change", () => {
  const pot = getPotential();
  document.getElementById("attractionWrapper").style.display = (pot === "Central") ? "inline-block" : "none";
  drawSpace(ctx1);
  addLine(ctx1, WIDTH, HEIGHT);
  axisName(ctx1);
  ctx4.clearRect(0, 0, WIDTH, HEIGHT);
  if (pot !== "free") drawLegend(ctx4);
});

function logError(t, epsilon) {
  const table = document.getElementById("logTable").getElementsByTagName("tbody")[0];
  const row   = table.insertRow();
  const c1    = row.insertCell(0);
  const c2    = row.insertCell(1);
  c1.textContent = t.toFixed(2);
  c2.textContent = Math.log10(epsilon).toFixed(6);
}

// Image capture (unchanged)
document.getElementById("captureBtn").addEventListener("click", () => {
  const link     = document.createElement('a');
  link.download  = "canvas_capture.png";
  link.href      = canvas2.toDataURL("image/png");
  link.click();
});

// --- Drawing functions: 원본에서 가져온 그리기 유틸리티들 ---

function addLine(ctx, WIDTH, HEIGHT) {
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0.5 * WIDTH, 0);
  ctx.lineTo(0.5 * WIDTH, HEIGHT);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0.5 * HEIGHT);
  ctx.lineTo(WIDTH, 0.5 * HEIGHT);
  ctx.stroke();
}

function drawSpace(ctx) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const isFree = getPotential() === "free";
  if (!isFree) {
    const q1min = -WIDTH / (2 * G_SCALE), q1max = WIDTH / (2 * G_SCALE);
    const q2min = -HEIGHT / (2 * G_SCALE), q2max = HEIGHT / (2 * G_SCALE);
    const grid = getGrid(600, 600, q1min, q2min, q1max, q2max);
    MapAndContour(grid, ctx);
  }
}

function axisName(ctx) {
  ctx.font = "20px Arial";
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("q1", WIDTH - 30, 0.5 * HEIGHT + 20);
  ctx.save();
  ctx.translate(0.5 * WIDTH - 20, 30);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("q2", 0, 0);
  ctx.restore();
}

function drawLine(prevQ1, prevQ2, ctx) {
  ctx.beginPath();
  ctx.strokeStyle = '#4B0082';
  ctx.lineWidth = 3 * Math.log10(G_SCALE) / 2;
  ctx.moveTo(G_SCALE * prevQ1 + WIDTH / 2, HEIGHT / 2 - G_SCALE * prevQ2);
  ctx.lineTo(G_SCALE * Q[0] + WIDTH / 2, HEIGHT / 2 - G_SCALE * Q[1]);
  ctx.stroke();
}

function drawParticle(ctx) {
  const radius = 10 * Math.log10(G_SCALE) / 2;
  const Q1 = G_SCALE * Q[0] + WIDTH / 2;
  const Q2 = HEIGHT / 2 - G_SCALE * Q[1];
  ctx.beginPath();
  ctx.fillStyle = '#4B0082';
  ctx.arc(Q1, Q2, 1.1 * radius, 0, 2 * Math.PI, false);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = '#FFEE91';
  ctx.arc(Q1, Q2, radius, 0, 2 * Math.PI, false);
  ctx.fill();
  ctx.beginPath();
  ctx.strokeStyle = '#FF0000';
  ctx.lineWidth = 4 * Math.log10(G_SCALE) / 2;
  ctx.moveTo(Q1, Q2);
  ctx.lineTo(Q1 + 50 * ADirection[0], Q2 - 50 * ADirection[1]);
  ctx.stroke();
}

function drawOscillator(otx) {
  otx.clearRect(0, 0, oWIDTH, oHEIGHT);
  otx.beginPath();
  otx.moveTo(0, 0.5 * oHEIGHT);
  otx.lineTo(oWIDTH, 0.5 * oHEIGHT);
  otx.stroke();
  otx.beginPath();
  otx.fillStyle = '#000';
  otx.arc(K_SCALE * Q[0] + 0.333 * oWIDTH, 0.5 * oHEIGHT, 10, 0, 2 * Math.PI, false);
  otx.fill();
  otx.beginPath();
  otx.arc(K_SCALE * Q[1] + 0.667 * oWIDTH, 0.5 * oHEIGHT, 10, 0, 2 * Math.PI, false);
  otx.fill();
}

function drawPendulum(ptx) {
  ptx.clearRect(0, 0, pWIDTH, pHEIGHT);
  addLine(ptx, pWIDTH, pHEIGHT);
  const pivotX = pWIDTH / 2;
  const pivotY = pHEIGHT / 2;
  const theta1 = Q[0], theta2 = Q[1];
  const r1 = l1 * P_SCALE, r2 = l2 * P_SCALE;
  const x1 = pivotX + r1 * Math.sin(theta1);
  const y1 = pivotY + r1 * Math.cos(theta1);
  const x2 = x1 + r2 * Math.sin(theta2);
  const y2 = y1 + r2 * Math.cos(theta2);
  ptx.strokeStyle = '#000'; ptx.lineWidth = 2;
  ptx.beginPath(); ptx.moveTo(pivotX, pivotY);
  ptx.lineTo(x1, y1); ptx.lineTo(x2, y2); ptx.stroke();
  ptx.fillStyle = '#000';
  ptx.beginPath(); ptx.arc(x1, y1, 10, 0, 2 * Math.PI); ptx.fill();
  ptx.beginPath(); ptx.arc(x2, y2, 10, 0, 2 * Math.PI); ptx.fill();
}

// 등고선 그리기 유틸
function getGrid(cols, rows, q1min, q2min, q1max, q2max) {
  const q1Array = Array.from({ length: cols }, (_, i) => q1min + (q1max - q1min) * ((i + 0.5) / cols));
  const q2Array = Array.from({ length: rows }, (_, j) => q2min + (q2max - q2min) * (j / rows));
  const vGrid = Array(cols).fill().map(() => Array(rows));
  let minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const v = Potential(q1Array[i], q2Array[j]);
      vGrid[i][j] = v;
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  }
  return { cols, rows, q1Array, q2Array, vGrid, minV, maxV };
}

function MapAndContour(grid, ctx) {
  const { cols, rows, q1Array, q2Array, vGrid, minV, maxV } = grid;
  const levels = Array.from({ length: 12 }, (_, k) => minV + (maxV - minV) * (k / 12));
  const eps = (maxV - minV) / (12 * 48);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const px = WIDTH / 2 + G_SCALE * q1Array[i];
      const py = HEIGHT / 2 - G_SCALE * q2Array[j];
      const v = vGrid[i][j];
      let isContour = levels.some(lv => Math.abs(v - lv) < eps);
      ctx.fillStyle = isContour ? 'rgb(32,32,32)' : `hsl(${30 + ((v - minV)/(maxV - minV))*20},100%,${40 + ((v - minV)/(maxV - minV))*(90-40)}%)`;
      ctx.fillRect(px - (WIDTH/cols)/2, py - (HEIGHT/rows)/2, WIDTH/cols, HEIGHT/rows);
    }
  }
}

function drawLegend(ctx) {
  const x = WIDTH - 40, y = 20, w = 20, h = 200;
  for (let i = 0; i <= 100; i++) {
    const t = i/100;
    ctx.fillStyle = `hsl(${30+t*20},100%,${40+t*(90-40)}%)`;
    ctx.fillRect(x, y + h - i*(h/100), w, h/100);
  }
  ctx.strokeStyle = '#000'; ctx.strokeRect(x, y, w, h);
}
