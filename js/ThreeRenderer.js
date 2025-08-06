// ThreeRenderer.js

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.142.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.142.0/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let particle, trajectoryLine;
let surfaceMesh;
let trajectoryIndex = 0;
const MAX_TRAJECTORY_POINTS = 30000; // Max points for the trajectory line

/**
 * Maps a numerical value to an HSL color, similar to the original 2D renderer.
 * @param {number} value The value to map.
 * @param {number} minV The minimum value in the range.
 * @param {number} maxV The maximum value in the range.
 * @returns {THREE.Color} A Three.js color object.
 */
function getColorForValue(value, minV, maxV) {
    const t = Math.max(0, Math.min(1, (value - minV) / (maxV - minV)));
    const hue = 30 + t * 20; // h: 30 (orange/yellow) -> 50 (green/yellow)
    const light = 40 + t * 50; // l: 40% -> 90%
    return new THREE.Color(`hsl(${hue}, 100%, ${light}%)`);
}

/**
 * Creates the 3D potential energy surface mesh.
 * @param {Function} potentialFunc The potential function V(x).
 * @param {number} q1min Minimum q1 value.
 * @param {number} q1max Maximum q1 value.
 * @param {number} q2min Minimum q2 value.
 * @param {number} q2max Maximum q2 value.
 * @param {number} segments The resolution of the mesh.
 */
function createPotentialSurface(potentialFunc, q1min, q1max, q2min, q2max, segments = 100) {
    const q1range = q1max - q1min;
    const q2range = q2max - q2min;
    const geometry = new THREE.PlaneGeometry(q1range, q2range, segments, segments);
    const vertices = geometry.attributes.position.array;
    const colors = [];

    // Find min/max potential for accurate coloring
    let minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < vertices.length / 3; i++) {
        const q1 = vertices[i * 3] + (q1max + q1min) / 2;
        const q2 = vertices[i * 3 + 1] + (q2max + q2min) / 2;
        const v = potentialFunc([q1, q2]);
        if (isFinite(v)) {
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
        }
    }
    if (!isFinite(minV)) minV = -10;
    if (!isFinite(maxV)) maxV = 10;
    if (minV === maxV) { minV -= 1; maxV += 1; }

    // Set the z-coordinate of each vertex to the potential value and assign a color
    for (let i = 0; i < vertices.length / 3; i++) {
        const q1 = vertices[i * 3] + (q1max + q1min) / 2;
        const q2 = vertices[i * 3 + 1] + (q2max + q2min) / 2;
        const v = potentialFunc([q1, q2]);
        
        // Clamp infinite values to keep the geometry sane
        const z = isFinite(v) ? v : (v > 0 ? maxV + 0.1 * Math.abs(maxV) : minV - 0.1 * Math.abs(minV));
        vertices[i * 3 + 2] = z;

        const color = getColorForValue(z, minV, maxV);
        colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        metalness: 0.2,
        roughness: 0.8,
    });

    surfaceMesh = new THREE.Mesh(geometry, material);
    // Scale the potential axis for better visualization
    surfaceMesh.scale.set(1, 1, 0.3); 
}


/**
 * Initializes the 3D scene, camera, renderer, and objects.
 * @param {string} containerId The ID of the DOM element to host the canvas.
 * @param {Function} potentialFunc The potential function for building the surface.
 * @param {number} G_SCALE The global graph scale from the main script.
 */
export function init(containerId, potentialFunc, G_SCALE) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error("Container element not found!");
        return;
    }
    const WIDTH = container.clientWidth;
    const HEIGHT = container.clientHeight;

    // --- Scene Setup ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdddddd);
    camera = new THREE.PerspectiveCamera(60, WIDTH / HEIGHT, 0.1, 2000);
    camera.position.set(0, -6, 4); // Position camera to look at the surface
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(WIDTH, HEIGHT);
    
    container.innerHTML = ''; // Clear previous canvas (if any)
    container.appendChild(renderer.domElement);
    
    // --- Controls ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.update();

    // --- Lighting ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    // --- Axes Helper ---
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    // --- Potential Surface ---
    const q_range = (WIDTH / (2 * G_SCALE));
    createPotentialSurface(potentialFunc, -q_range, q_range, -q_range, q_range);
    scene.add(surfaceMesh);

    // --- Particle (Sphere) ---
    const particleGeometry = new THREE.SphereGeometry(0.15, 32, 16);
    const particleMaterial = new THREE.MeshStandardMaterial({ color: 0x4B0082, roughness: 0.1, metalness: 0.5 });
    particle = new THREE.Mesh(particleGeometry, particleMaterial);
    scene.add(particle);

    // --- Trajectory Line ---
    const trajectoryMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const trajectoryGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_TRAJECTORY_POINTS * 3);
    trajectoryGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    trajectoryLine = new THREE.Line(trajectoryGeometry, trajectoryMaterial);
    trajectoryLine.frustumCulled = false;
    scene.add(trajectoryLine);
    resetTrajectory();
    
    // --- Resize Listener ---
    window.addEventListener('resize', () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });
}

/**
 * Resets the trajectory line to be empty.
 */
export function resetTrajectory() {
    trajectoryIndex = 0;
    if (trajectoryLine) {
        trajectoryLine.geometry.setDrawRange(0, 0);
    }
}

/**
 * Updates the particle's position and trajectory in the animation loop.
 * @param {number[]} x The current position vector [q1, q2].
 * @param {Function} potentialFunc The potential function V(x).
 */
export function update(x, potentialFunc) {
    if (!particle || !trajectoryLine || !surfaceMesh) return;

    // 1. Update Particle Position
    const potentialValue = potentialFunc(x);
    const z_scale = surfaceMesh.scale.z;
    // The particle's 3D position is (q1, q2, V(q1, q2))
    particle.position.set(x[0], x[1], potentialValue * z_scale);

    // 2. Update Trajectory Line
    const positions = trajectoryLine.geometry.attributes.position.array;
    if (trajectoryIndex < MAX_TRAJECTORY_POINTS) {
        positions[trajectoryIndex * 3] = x[0];
        positions[trajectoryIndex * 3 + 1] = x[1];
        positions[trajectoryIndex * 3 + 2] = potentialValue * z_scale;
        
        trajectoryLine.geometry.setDrawRange(0, trajectoryIndex + 1);
        trajectoryLine.geometry.attributes.position.needsUpdate = true;
        trajectoryIndex++;
    }

    // 3. Render the scene
    controls.update();
    renderer.render(scene, camera);
}