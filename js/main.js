// main.js

import { RK4step } from './PhysicsEngine.js';
import * as ThreeRenderer from './ThreeRenderer.js';

let id = null;

// Time tracking
let now = null;
let startRealTime = null;
let lastLogRealTime = null;
let logIntervalMs = 1000;

let E = 0; // Energy

let G_SCALE = 100;

const MASS = 1;
const mu = 1;

// Constants for different potentials
const [l1, l2] = [1, 1];
const [k1, k2] = [8, 5];
const gravity = 9.8;
const rs = 0.4;
let k = -1; // k for Central Force

const dt = 1e-3;
const dq = 1e-4;

let x = [0, 0];
let v = [0, 0];
let a = [0, 0];

const type = { potential: getPotential(), metric: getMetric() };

function getMetric() {
    return document.getElementById("metricSelect").value;
}
function getPotential() {
    return document.getElementById("potentialSelect").value;
}

// --- PHYSICS FUNCTIONS (Unchanged) ---
function metric(x) {
    const [q1, q2] = x;
    switch(type.metric) {
        case "pendulum":
            const g11_p = (1 + mu) *l1*l1;
            const g22_p = mu * l2*l2;
            const g12_p = mu*l1*l2*Math.cos(q1-q2);
            return [ [g11_p, g12_p], [g12_p, g22_p] ];
        case "Schwarzschild":
            const r = Math.hypot(q1,q2);
            if (r === 0) return [[1,0],[0,1]]; // Avoid singularity
            const f = 1/(1 - rs/r);
            const factor = 1/(r*r);
            const g11_s = 1 + factor*(f-1)*q1*q1;
            const g22_s = 1 + factor*(f-1)*q2*q2;
            const g12_s = (f-1)*q1*q2*factor;
            return [ [g11_s, g12_s], [g12_s, g22_s] ];
        default: // "flat"
            return [[1, 0],[0,mu]];
    }
}

function potential(x) {
    const [q1, q2] = x;
    switch(type.potential) {
        case "pendulum":
            return MASS*(1+mu)*gravity*l1*(1-Math.cos(q1))
                 + MASS*mu*gravity*l2*(1-Math.cos(q2));
        case "smallangle":
            return 0.5*MASS*(1+mu)*gravity*l1*q1*q1 + 0.5*MASS*mu*gravity*l2*q2*q2;
        case "oscillator":
            return 0.5 * k1 * (q1*q1+q2*q2) + 0.5 * k2 *(q1-q2)*(q1-q2);
        case "Central":
            const r = Math.hypot(q1,q2);
            if (r === 0) return Infinity;
            return k/r;
        case "nearEarth":
            return MASS*gravity*q2;
        default: // "free"
            return 0;
    }
}

function constraint(x) {
    const expr = document.getElementById("constraintInput").value;
    if (!expr || expr === "0") return 0;
    try {
        const f = new Function("q1", "q2", `return ${expr};`);
        return f(x[0], x[1]);
    } catch(e) {
        return 0;
    }
}

function Q(x, v) {
    return [0, 0]; // Simplified for this example
}

function computeEnergy(x, v) {
    const g = metric(x);
    const T = 0.5 * (g[0][0]*v[0]*v[0] + 2*g[0][1]*v[0]*v[1] + g[1][1]*v[1]*v[1]);
    const V = potential(x);
    return T + V;
}

function logError(t, epsilon) {
    const table = document.getElementById("logTable").getElementsByTagName("tbody")[0];
    const row = table.insertRow();
    row.insertCell(0).textContent = t.toFixed(2);
    row.insertCell(1).textContent = Math.log10(Math.abs(epsilon)).toFixed(6);
}

// --- SIMULATION CONTROL ---

function animate() {
    if (lastLogRealTime === null) {
        lastLogRealTime = 1000;
        startRealTime = performance.now();
    }

    // Perform multiple physics steps per frame for stability and speed
    for (let i = 0; i < 32; i++) {
        ({x, v, a} = RK4step(x, v, dt, MASS, metric, potential, constraint, Q, dq));
        now = performance.now();
        if (now - lastLogRealTime >= logIntervalMs-2) {
            const currentE = computeEnergy(x, v);
            const epsilon = (E === 0) ? 0 : (currentE - E) / E;
            logError((now - startRealTime) / 1000, epsilon);
            lastLogRealTime = now;
        }
    }
    
    // Update the 3D visualization
    ThreeRenderer.update(x, potential);

    id = requestAnimationFrame(animate);
}

function start() {
    breaking(); // Stop any previous animation

    // Clear log table
    const table = document.getElementById("logTable");
    if (table) {
        table.getElementsByTagName("tbody")[0].innerHTML = "";
    }

    // Get initial conditions from UI
    x[0] = parseFloat(document.getElementById("inputQ1").value);
    x[1] = parseFloat(document.getElementById("inputQ2").value);
    v[0] = parseFloat(document.getElementById("inputV1").value);
    v[1] = parseFloat(document.getElementById("inputV2").value);
    G_SCALE = parseFloat(document.getElementById("inputScale").value);
    
    // Initial energy
    E = computeEnergy(x,v);
    
    // Initialize the 3D renderer
    ThreeRenderer.init('graph', potential, G_SCALE);

    // Start the animation loop
    lastLogRealTime = null;
    id = requestAnimationFrame(animate);
}

function breaking() {
    if (id !== null) {
        cancelAnimationFrame(id);
        id = null;
    }
}

// --- EVENT LISTENERS ---

document.getElementById("potentialSelect").addEventListener("change", () => {
    type.potential = getPotential();
    const attract = document.getElementById("attractionWrapper");
    attract.style.display = (type.potential === "Central") ? "inline-block" : "none";
    // When potential changes, the surface must be rebuilt, so we restart.
    start();
});

document.getElementById("metricSelect").addEventListener("change", () => {
    type.metric = getMetric();
    start(); // Restart on metric change as well
});

document.querySelectorAll('input[name="attraction"]').forEach(radio => {
    radio.addEventListener('change', e => {
        const v = e.target.value;
        k = (v === "repulsion") ? Math.abs(k) : -Math.abs(k);
        start(); // Restart to rebuild the surface with the new potential
    });
});


window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('startBtn').addEventListener('click', start);
  document.getElementById('stopBtn').addEventListener('click', breaking);
  
  // Set initial state for the Central Force radio buttons
  const attract = document.getElementById("attractionWrapper");
  attract.style.display = (getPotential() === "Central") ? "inline-block" : "none";

  // Perform an initial setup
  start();
});