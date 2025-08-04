// Pure physics + simulation module (no DOM)
export class Simulation {
  constructor(cfg, type, constraintFn) {
    this.cfg = cfg;
    this.type = type;
    this.constraintFn = constraintFn;
    this.flatMetric = true;
    this.Q = [0, 0];
    this.Qdot = [0, 0];
  }

  // Potential energy
  potential(q1, q2) {
    const { MASS, mu, g, l1, l2, k1, k2, rs } = this.cfg;
    switch (this.type.potential) {
      case "pendulum":
        return MASS*(1+mu)*g*l1*(1-Math.cos(q1))
             + MASS*mu*g*l2*(1-Math.cos(q2));
      case "oscillator":
        return 0.5*k1*(q1*q1+q2*q2) + 0.5*k2*(q1-q2)*(q1-q2);
      case "smallangle":
        return 0.5*MASS*(1+mu)*g*l1*q1*q1
             + 0.5*MASS*mu*g*l2*q2*q2;
      case "Central": {
        const r = Math.hypot(q1,q2);
        if (r <= rs) {
          return 0.25 - 0.5*k1*r*r/(rs*rs*rs) + k1/rs;
        }
        return 0.5*rs/r;
      }
      case "nearEarth":
        return MASS*g*q2;
      default:
        return 0;
    }
  }

  // Metric tensor
  localMetric(q1, q2) {
    const { mu, l1, l2, rs } = this.cfg;
    if (this.type.metric === "pendulum") {
      this.flatMetric = false;
      return [
        [(1+mu)*l1*l1, mu*l1*l2*Math.cos(q1-q2)],
        [mu*l1*l2*Math.cos(q1-q2), mu*l2*l2]
      ];
    }
    if (this.type.metric === "Schwarzschild") {
      this.flatMetric = false;
      const r = Math.hypot(q1,q2);
      const f = 1/(1 - rs/r);
      const factor = 1/(r*r);
      return [
        [1 + (f-1)*factor*q1*q1, (f-1)*factor*q1*q2],
        [(f-1)*factor*q1*q2, 1 + (f-1)*factor*q2*q2]
      ];
    }
    this.flatMetric = true;
    return [[1,0],[0,mu]];
  }

  // Inverse metric
  localInverse(q1, q2) {
    const g = this.localMetric(q1, q2);
    const det = g[0][0]*g[1][1] - g[0][1]*g[1][0];
    return [
      [g[1][1]/det, -g[0][1]/det],
      [-g[1][0]/det, g[0][0]/det]
    ];
  }

  // Generalized non-conservative forces
  generalizedForce(Q, Qdot) {
    const B = 0, b = 0;
    const drag = Qdot.map(v => -b*v);
    const mag = [Qdot[1]*B, -Qdot[0]*B];
    const tforce = [0,0];
    if (this.type.metric === "Schwarzschild") {
      const { rs } = this.cfg;
      const r = Math.hypot(Q[0],Q[1]);
      const factor = -rs/(r*r*r);
      const g = this.localMetric(Q[0],Q[1]);
      tforce[0] = factor*(g[0][0]*Q[0] + g[0][1]*Q[1]);
      tforce[1] = factor*(g[1][0]*Q[0] + g[1][1]*Q[1]);
    }
    return [drag[0]+mag[0]+tforce[0], drag[1]+mag[1]+tforce[1]];
  }

  // Gradient via central diff
  gradient(f, q1, q2, dq) {
    const V1 = f(q1+dq, q2), V2 = f(q1-dq, q2);
    const W1 = f(q1, q2+dq), W2 = f(q1, q2-dq);
    return [(V1-V2)/(2*dq), (W1-W2)/(2*dq)];
  }

  // Christoffel symbols
  christoffel(q1, q2, dq) {
    const dg = [[this.gradient((x,y)=>this.localMetric(x,y)[0][0], q1,q2,dq),
                 this.gradient((x,y)=>this.localMetric(x,y)[0][1], q1,q2,dq)],
                [null, this.gradient((x,y)=>this.localMetric(x,y)[1][1], q1,q2,dq)]];
    dg[1][0] = dg[0][1];
    const G = [[[0,0],[0,0]],[[0,0],[0,0]]];
    for(let i=0;i<2;i++)for(let j=0;j<2;j++)for(let k=0;k<2;k++){
      G[i][j][k] = 0.5*(dg[i][j][k] + dg[j][i][k] - dg[j][k][i]);
    }
    return G;
  }

  // Acceleration: geodesic + forces
  computeAccelerate(Q, Qdot, dq) {
    const a_nc = this.generalizedForce(Q,Qdot).map(a=>a/this.cfg.MASS);
    const gradV = this.gradient((x,y)=>this.potential(x,y), Q[0],Q[1],dq)
                     .map(g=>g/this.cfg.MASS);
    let geo = [0,0];
    if (!this.flatMetric) {
      const G = this.christoffel(Q[0],Q[1],dq);
      for (let i=0;i<2;i++) for (let j=0;j<2;j++) for (let k=0;k<2;k++) {
        geo[i] += G[i][j][k] * Qdot[j] * Qdot[k];
      }
    }
    const raw = [a_nc[0]-gradV[0]-geo[0], a_nc[1]-gradV[1]-geo[1]];
    const inv = this.localInverse(Q[0],Q[1]);
    // constraint handling omitted for brevity
    return [inv[0][0]*raw[0] + inv[0][1]*raw[1],
            inv[1][0]*raw[0] + inv[1][1]*raw[1]];
  }

  // Single RK4 step
  rk4Step(dt, dq) {
    const f = Y => {
      const [q1,q2,v1,v2] = Y;
      const [a1,a2] = this.computeAccelerate([q1,q2],[v1,v2],dq);
      return [v1, v2, a1, a2];
    };
    const Y = [...this.Q, ...this.Qdot];
    const k1 = f(Y);
    const k2 = f(Y.map((y,i)=>y + k1[i]*dt/2));
    const k3 = f(Y.map((y,i)=>y + k2[i]*dt/2));
    const k4 = f(Y.map((y,i)=>y + k3[i]*dt));
    const Ynew = Y.map((y,i) => y + dt*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);
    [this.Q[0],this.Q[1],this.Qdot[0],this.Qdot[1]] = Ynew;
  }

  // Initialize state
  initState(Q, Qdot) {
    this.Q = [...Q]; this.Qdot = [...Qdot];
  }

  // Get current state
  getState() {
    return { Q: [...this.Q], Qdot: [...this.Qdot] };
  }
}

// UI integration (example, separate file)
// import { Simulation } from './refactored_simulation_module.js';
// const sim = new Simulation(cfg, type, constraintFn);
// sim.initState([q1,q2],[v1,v2]);
// function animate() { sim.rk4Step(dt,dq); render(sim.getState()); requestAnimationFrame(animate); }
