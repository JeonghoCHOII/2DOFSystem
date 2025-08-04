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
  cancelAnimationFrame(id);

  // Initialize simulation
  const cfg        = readConfig();
  const type       = readType();
  const constraint = buildConstraintFn();
  sim = new Simulation(cfg, type, constraint);

  // Override legacy globals for drawing/energy computation
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
  Q    = [
    parseFloat(document.getElementById("inputQ1").value),
    parseFloat(document.getElementById("inputQ2").value)
  ];
  Qdot = [
    parseFloat(document.getElementById("inputV1").value),
    parseFloat(document.getElementById("inputV2").value)
  ];
  sim.initState(Q, Qdot);

  G_SCALE         = parseFloat(document.getElementById("inputScale").value);
  lastLogRealTime = null;

  // Record initial energy
  const E0 = computeEnergy(Q[0], Q[1], Qdot[0], Qdot[1]);

  // Clear canvases & draw background
  ctx1.clearRect(0, 0, WIDTH, HEIGHT);
  ctx2.clearRect(0, 0, WIDTH, HEIGHT);
  ctx3.clearRect(0, 0, WIDTH, HEIGHT);
  ctx4.clearRect(0, 0, WIDTH, HEIGHT);
  if (getPotential() !== "free") drawLegend(ctx4);
  drawSpace(ctx1);
  addLine(ctx1, WIDTH, HEIGHT);
  axisName(ctx1);

  // Start animation
  id = requestAnimationFrame(animate);
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
    // legacy global k adjustment
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