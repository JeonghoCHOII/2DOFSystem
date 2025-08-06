import { computeAccelerate, RK4step } from './PhysicsEngine.js';
import { drawLine, drawParticle, drawOscillator, drawPendulum, drawLayer14 } from './Renderer.js';
import * as THREE from 'three;'
/******3D객체 전용********/
let scene, camera, renderer;
let surfaceMesh, particleMesh;
const GRID_MIN = -2, GRID_MAX = 2, GRID_SEG = 100;

function initializeThree(container) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, container.clientWidth/container.clientHeight, 0.1, 100);
    camera.position.set(0,5,5);
    camera.lookAt(0,0,0);

    renderer = new THREE.WebGLRenderer({antalias: true});
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff,0.8);
    light.position.set(1,2,1);
    scene.add(light);

    const geometry = new THREE.PlaneBufferGeometry(
        GRID_MAX - GRID_MIN, GRID_MAX - GRID_MIN, GRID_SEG, GRID_SEG
    );
    const posAttr = geometry.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
        const q1 = GRID_MIN + (i % (GRID_SEG+1)) * (GRID_MAX-GRID_MIN)/GRID_SEG;
        const q2 = GRID_MIN + Math.floor(i/(GRID_SEG+1)) * (GRID_MAX-GRID_MIN)/GRID_SEG;
        const z  = potential(q1, q2);  // V(q₁,q₂) 
        posAttr.setZ(i, z);
    }
    geometry.computeVertexNormals();
    surfaceMesh = new THREE.Mesh(
        geometry,
        new THREE.MeshLambertMaterial({color: 0x88aacc, side: THREE.DoubleSide})
    );
    surfaceMesh.rotation.x = -Math.PI/2;  // XY-plane → XZ-plane
    scene.add(surfaceMesh);

    // 3) 입자 메쉬 생성
    const sphereGeo = new THREE.SphereBufferGeometry(0.05, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({color: 0xff0000});
    particleMesh = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(particleMesh);

    // 4) 시뮬레이션 초기 상태
    x = [ parseFloat(document.getElementById('inputQ1').value),
          parseFloat(document.getElementById('inputQ2').value) ];
    v = [ parseFloat(document.getElementById('inputV1').value),
          parseFloat(document.getElementById('inputV2').value) ];

    animate();
}

function animate() {
  requestAnimationFrame(animate);

  // 수치적분으로 (x,v) 업데이트
  ({ x, v } = RK4step(x, v, dt, MASS, metric, potential, constraint, Q));  // 

  // 입자 위치 갱신: Three.js 좌표계에 맞춰 (x₁, V, x₂)
  particleMesh.position.set(x[0], potential(x[0], x[1]), x[1]);

  renderer.render(scene, camera);
}
/**********************/

const canvas1 = document.getElementById("layer1");
const layer1 = canvas1.getContext("2d");
const WIDTH = canvas1.width;
const HEIGHT = canvas1.height;

const canvas2 = document.getElementById("layer2");
const layer2 = canvas2.getContext("2d");

const canvas3 = document.getElementById("layer3");
const layer3 = canvas3.getContext("2d");

const canvas4 = document.getElementById("layer4");
const layer4 = canvas4.getContext("2d");

const oscillator = document.getElementById("cvs2");
const otx = oscillator.getContext("2d");
const oWIDTH = oscillator.width;
const oHEIGHT = oscillator.height;

const pendulum = document.getElementById("cvs3");
const ptx = pendulum.getContext("2d");
const pWIDTH = pendulum.width;
const pHEIGHT = pendulum.height;

let id = null;

//시간기록
let now = null;

let startRealTime = null;
let lastLogRealTime = null;
let logIntervalMs = 1000;

let E = 0;

let G_SCALE = 100;
const K_SCALE = 50;
const P_SCALE = 100;

const MASS = 1;
const mu = 1;

const [l1, l2] = [1, 1];
const [k1, k2] = [8, 5];
const gravity = 9.8;
const rs = 0.4;
let k = -0.5 * rs;

const dt = 1e-3;
const dq = 1e-4;

let x = [0, 0];
let v = [0, 0];
let a = [0, 0];
const dim = x.length;

const type = { potential: getPotential(), metric: getMetric() };

function getMetric() {
    return document.getElementById("metricSelect").value;
}
function getPotential() {
    return document.getElementById("potentialSelect").value;
}

function metric(x) {
    const [q1, q2] = x;
    let g11; let g12; let g22;
    switch(type.metric) {
        case "pendulum":
            g11 = (1 + mu) *l1*l1;
            g22 = mu * l2*l2;
            g12 = mu*l1*l2*Math.cos(q1-q2);
            return [ [g11, g12], [g12, g22] ];

        case "Schwarzschild":
            const r = Math.hypot(q1,q2);
            const f = 1/(1 - rs/r);
            const factor = 1/(r*r);

            g11 = 1 + factor*(f-1)*q1*q1;
            g22 = 1+factor*(f-1)*q2*q2;
            g12 = (f-1)*q1*q2*factor;

            return [ [g11, g12], [g12, g22] ];

        default:
            return [[1, 0],[0,mu]];
    }
}

function potential(x) {
    const [q1, q2] = x;
    switch(type.potential) {
        case "pendulum":
            return      MASS*(1+mu)*gravity*l1*(1-Math.cos(q1))
                            + MASS*mu*gravity*l2*(1-Math.cos(q2));

        case "smallangle":
            return 0.5*MASS*(1+mu)*gravity*l1*q1*q1 + 0.5*MASS*mu*gravity*l2*q2*q2;

        case "oscillator":
            return 0.5 * k1 * (q1*q1+q2*q2) + 0.5 * k2 *(q1-q2)*(q1-q2);

        case "Central":
            const r = Math.sqrt(q1*q1+q2*q2);
            let V = k/r;
            if ( r <= rs ) {
                V = 0.5*k/rs - 0.5*k*r*r/(rs*rs*rs)+k/rs;
            }
            return V;

        case "nearEarth":
            return MASS*gravity*q2;

        default:
            return 0;
    }
}

function constraint(x) {
    const expr = document.getElementById("constraintInput").value;
    try {
        const f = new Function("q1", "q2", `return ${expr};`);
        return f(x[0], x[1]);
    } catch(e) {
        return 0;
    }
}

function Q(x, v) {
    const b = 0;
    const sgn =[];
    for (let i = 0; i < 2; i++) {
        if (v[i] == 0) {
        sgn[i] = 0;
        } else {
        sgn[i] = v[i]/Math.abs(v[i]);

        }
    }
    const dragForce = v.map((v) => -b*v);

    const B = 0;
    const magneticForce = [v[1]*B, -v[0]*B];

    const timeForce = [0, 0];
    if (type.metric === "Schwarzschild") {

        const g = metric(x);
        const r = Math.hypot(x[0],x[1]);
        const factor = -rs/(r*r*r);
        timeForce[0] = factor * (g[0][0]*x[0]+g[0][1]*x[1]);
        timeForce[1] = factor * (g[1][0]*x[0]+g[1][1]*x[1]);
    }

    return [dragForce[0] + magneticForce[0] + timeForce[0],dragForce[1] + magneticForce[1] + timeForce[1]];
}

function computeEnergy(x, v) {
    const g = metric(x);
    const T = 0.5 * (g[0][0]*v[0]*v[0] + 2*g[0][1]*v[0]*v[1] + g[1][1]*v[1]*v[1]);
    const V = potential(x);
    return T+V;
}

function logError(t, epsilon) {
    const table = document.getElementById("logTable").getElementsByTagName("tbody")[0];
    const row = table.insertRow();
    const cell1 = row.insertCell(0);
    const cell2 = row.insertCell(1);
    cell1.textContent = t.toFixed(2);
    cell2.textContent = Math.log10(epsilon).toFixed(6);
}


/*function animate() {
    layer3.clearRect(0,0,WIDTH,HEIGHT);
    if (lastLogRealTime === null) {
        lastLogRealTime = 1000;
        startRealTime = performance.now();
    }

    const prevx = x;

    for (let i = 0; i < 32; i++) {
        ({x, v, a} = RK4step(x, v, dt, MASS, metric, potential, constraint, Q, dq));
        now = performance.now();
        if (now - lastLogRealTime >= logIntervalMs-2) {
            const epsilon = Math.abs(computeEnergy(x, v)-E)/E;
            logError((now - startRealTime) / 1000, epsilon);
            lastLogRealTime = now;
        }
    }
    drawLine(layer2, prevx, x, G_SCALE, WIDTH, HEIGHT);
    drawParticle(layer3, x, a, G_SCALE, WIDTH, HEIGHT);
    drawOscillator(otx, x, K_SCALE, oWIDTH, oHEIGHT);
    drawPendulum(ptx, x, l1, l2, P_SCALE , pWIDTH, pHEIGHT);

    id = requestAnimationFrame(animate);
}*/

function start() {
    lastLogRealTime = null;
        const table = document.getElementById("logTable");
    if (table) {
        const tbody = table.getElementsByTagName("tbody")[0];
        tbody.innerHTML = "";
    }
    x[0] = parseFloat(document.getElementById("inputQ1").value);
    x[1] = parseFloat(document.getElementById("inputQ2").value);
    v[0] = parseFloat(document.getElementById("inputV1").value);
    v[1] = parseFloat(document.getElementById("inputV2").value);

    G_SCALE = parseFloat(document.getElementById("inputScale").value);
    E = computeEnergy(x,v);

    layer1.clearRect(0,0,WIDTH,HEIGHT);
    layer2.clearRect(0,0,WIDTH,HEIGHT);
    layer3.clearRect(0,0,WIDTH,HEIGHT);
    layer4.clearRect(0,0,WIDTH,HEIGHT);

    //const V0 = potential(x);
    drawLayer14(layer1, layer4, x, potential, G_SCALE, WIDTH, HEIGHT, type.potential !== "free");
    
    //initializeWorker();

    cancelAnimationFrame(id);
    setTimeout(() => {animate();}, 100);
}

function breaking() {
    if (id !== null) {
        cancelAnimationFrame(id);
        id = null;
    }
}

document.querySelectorAll('input[name="attraction"]').forEach(radio => {
    radio.addEventListener('change', e => {
        const v = e.target.value;
        k = (v === "repulsion") ? Math.abs(k) : -Math.abs(k);
        layer1.clearRect(0,0,WIDTH,HEIGHT);
        layer4.clearRect(0,0,WIDTH,HEIGHT);
        drawLayer14(layer1, layer4, x, potential, G_SCALE, WIDTH, HEIGHT, type.potential !== "free");
    });
});

document.getElementById("potentialSelect").addEventListener("change", () => {
    type.potential = getPotential();
    const attract = document.getElementById("attractionWrapper");
    attract.style.display = (type.potential === "Central") ? "inline-block" : "none";

    layer1.clearRect(0,0,WIDTH,HEIGHT);
    layer4.clearRect(0,0,WIDTH,HEIGHT);
    drawLayer14(layer1, layer4, x, potential, G_SCALE, WIDTH, HEIGHT, type.potential !== "free");
});

document.getElementById("metricSelect").addEventListener("change", () => {
    type.metric = getMetric();

});

document.getElementById("constraintInput").addEventListener("change", () => {

});



// 버튼 누르면 이미지 저장
document.getElementById("captureBtn").addEventListener("click", function () {
    const imageURL = canvas2.toDataURL("image/png");

    // 다운로드 링크 만들기
    const link = document.createElement('a');
    link.download = "canvas_capture.png";
    link.href = imageURL;
    link.click();
});

window.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn  = document.getElementById('stopBtn');

  // start 클릭 시
  startBtn.addEventListener('click', () => {
    start();
  });

  // stop 클릭 시
  stopBtn.addEventListener('click', () => {
    breaking();
  });
});

const container = document.getElementById('three-container');
initThree(container);