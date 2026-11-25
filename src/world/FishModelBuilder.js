import * as THREE from 'three';
import { SPECIES } from '../data/FishProfiles.js';

// BỘ DỰNG MÔ HÌNH CÁ 3D CHÂN THỰC: Chép (lưng gù, 2 đôi râu), Chép củ, Trắm đen (thân thuôn tối màu),
// Trắm cỏ (thân tròn dài xanh ô-liu), Rô phi (thân dẹt cao, vây lưng dài có gai)
// Quy ước: mũi cá hướng +Z, đuôi hướng -Z, lưng hướng +Y.

let cachedScaleTex = null;
function getScaleTexture() {
    if (cachedScaleTex) return cachedScaleTex;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(60,45,20,0.28)';
    ctx.lineWidth = 2;
    const r = 16;
    for (let row = 0; row < 9; row++) {
        for (let col = -1; col < 9; col++) {
            const cx = col * r * 1.0 * 1.0 + (row % 2 ? r / 2 : 0);
            const cy = row * r * 0.55;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.62, 0.15 * Math.PI, 0.85 * Math.PI);
            ctx.stroke();
        }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 5);
    cachedScaleTex = tex;
    return tex;
}

function envelope(t, shape) {
    // t: 0 (mũi) -> 1 (cuống đuôi). Trả về hệ số 0..1 của tiết diện
    const noseBlunt = shape === 'carp' ? 0.78 : shape === 'tilapia' ? 0.72 : 0.85;
    const s = Math.sin(Math.PI * Math.pow(t, noseBlunt));
    let e = Math.pow(Math.max(0, s), 0.82);
    if (t > 0.78) {
        const peduncle = shape === 'tilapia' ? 0.2 : 0.17;
        e = Math.max(e, peduncle * (1.0 - (t - 0.78) / 0.30) + 0.06);
    }
    return e;
}

function profile(t, shape) {
    const e = envelope(t, shape);
    if (shape === 'carp') {
        const hump = Math.exp(-Math.pow((t - 0.32) / 0.17, 2));
        return { top: 0.185 * e * (1 + 0.38 * hump), bot: 0.145 * e, half: 0.092 * e };
    }
    if (shape === 'tilapia') {
        return { top: 0.17 * e * (1 + 0.1 * Math.exp(-Math.pow((t - 0.3) / 0.2, 2))), bot: 0.16 * e, half: 0.058 * e };
    }
    if (shape === 'black') {
        return { top: 0.118 * e, bot: 0.108 * e, half: 0.095 * e };
    }
    // grass
    return { top: 0.125 * e, bot: 0.112 * e, half: 0.102 * e };
}

function buildBodyGeometry(len, shape, colors) {
    const segs = 36;
    const radial = 22;
    const positions = [];
    const colorArr = [];
    const uvs = [];
    const indices = [];
    const cDorsal = new THREE.Color(colors.dorsal);
    const cFlank = new THREE.Color(colors.flank);
    const cBelly = new THREE.Color(colors.belly);
    const tmp = new THREE.Color();

    for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const z = len * 0.5 - t * len;
        const p = profile(t, shape);
        for (let j = 0; j <= radial; j++) {
            const a = (j / radial) * Math.PI * 2;
            const sy = Math.sin(a);
            const cx = Math.cos(a);
            const x = cx * p.half;
            const y = sy >= 0 ? sy * p.top : sy * p.bot;
            positions.push(x, y, z);
            uvs.push(j / radial, t);

            // Phối màu: lưng sẫm -> sườn -> bụng sáng
            const k = sy; // 1 = lưng, -1 = bụng
            if (k >= 0.35) {
                tmp.copy(cFlank).lerp(cDorsal, Math.min(1, (k - 0.35) / 0.55));
            } else if (k >= -0.25) {
                tmp.copy(cFlank);
            } else {
                tmp.copy(cFlank).lerp(cBelly, Math.min(1, (-0.25 - k) / 0.45));
            }
            // Ánh bạc dọc sườn
            if (Math.abs(k) < 0.25) tmp.lerp(new THREE.Color(0xffffff), 0.1);
            colorArr.push(tmp.r, tmp.g, tmp.b);
        }
    }
    for (let i = 0; i < segs; i++) {
        for (let j = 0; j < radial; j++) {
            const a = i * (radial + 1) + j;
            const b = (i + 1) * (radial + 1) + j;
            const c = (i + 1) * (radial + 1) + j + 1;
            const d = i * (radial + 1) + j + 1;
            indices.push(a, d, b, b, d, c);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

// Vây phẳng từ danh sách điểm [z, y] (nằm trong mặt phẳng YZ)
function finMesh(points, mat) {
    const shape = new THREE.Shape();
    points.forEach(([z, y], i) => {
        if (i === 0) shape.moveTo(-z, y);
        else shape.lineTo(-z, y);
    });
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateY(Math.PI / 2);
    return new THREE.Mesh(geo, mat);
}

function curvedFin(zFrom, zTo, baseY, height, mat, sweep = 0.4, spikes = 0) {
    const pts = [[zFrom, baseY]];
    const n = 8;
    for (let i = 1; i <= n; i++) {
        const u = i / n;
        const z = zFrom + (zTo - zFrom) * u;
        // Vây cao ở phía trước, thấp dần về sau
        let h = height * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.8) * (1.0 - sweep * u);
        if (spikes) h *= (i % 2 === 0 ? 1.0 : 0.82);
        pts.push([z, baseY + h]);
    }
    pts.push([zTo, baseY]);
    return finMesh(pts, mat);
}

export function buildRealisticFish(speciesKey, weight = 5, opts = {}) {
    const sp = SPECIES[speciesKey] || SPECIES.CARP;
    const v = sp.visual;
    const root = new THREE.Group();
    const scaleF = THREE.MathUtils.clamp(0.7 + weight / 16.0 * 0.55, 0.6, 1.5);
    const len = v.len;
    const shape = v.shape;

    const bodyGeo = buildBodyGeometry(len, shape, v);
    const bodyMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: getScaleTexture(),
        roughness: 0.32,
        metalness: 0.38,
        side: THREE.DoubleSide
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    root.add(body);

    const finMat = new THREE.MeshStandardMaterial({
        color: v.fin,
        roughness: 0.55,
        transparent: true,
        opacity: 0.86,
        side: THREE.DoubleSide
    });

    const topAt = (t) => profile(t, shape).top;
    const zAt = (t) => len * 0.5 - t * len;

    // Vây lưng
    if (shape === 'carp') {
        const d = curvedFin(zAt(0.28), zAt(0.66), topAt(0.40) * 0.93, 0.15, finMat, 0.45);
        root.add(d);
    } else if (shape === 'tilapia') {
        const d = curvedFin(zAt(0.22), zAt(0.80), topAt(0.35) * 0.95, 0.14, finMat, 0.15, 1);
        root.add(d);
    } else if (shape === 'black') {
        root.add(curvedFin(zAt(0.40), zAt(0.56), topAt(0.46) * 0.96, 0.15, finMat, 0.5));
    } else {
        root.add(curvedFin(zAt(0.40), zAt(0.54), topAt(0.46) * 0.96, 0.13, finMat, 0.5));
    }

    // Vây hậu môn + vây bụng
    const botAt = (t) => -profile(t, shape).bot;
    root.add(curvedFin(zAt(0.66), zAt(0.78), botAt(0.70) * 0.9, -0.08, finMat, 0.2));
    // curvedFin với height âm sẽ tạo vây hướng xuống

    // Đuôi chẻ (tail pivot)
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0, zAt(0.97));
    const tailH = shape === 'tilapia' ? 0.16 : 0.2;
    const tailPts = shape === 'tilapia'
        ? [[0, 0.02], [-0.10, tailH], [-0.17, tailH * 0.8], [-0.13, 0], [-0.17, -tailH * 0.8], [-0.10, -tailH], [0, -0.02]]
        : [[0, 0.025], [-0.14, tailH * 1.15], [-0.22, tailH * 0.85], [-0.09, 0], [-0.22, -tailH * 0.85], [-0.14, -tailH * 1.15], [0, -0.025]];
    tailPivot.add(finMesh(tailPts, finMat));
    root.add(tailPivot);

    // Vây ngực (2 bên)
    const mkPectoral = (side) => {
        const pivot = new THREE.Group();
        const pf = finMesh([[0, 0], [-0.10, 0.015], [-0.13, -0.02], [-0.05, -0.05]], finMat);
        pf.rotation.z = side * 1.15;
        pivot.add(pf);
        const t = 0.2;
        pivot.position.set(side * profile(t, shape).half * 0.95, -profile(t, shape).bot * 0.45, zAt(t));
        pivot.rotation.y = side * 0.25;
        return pivot;
    };
    const leftFin = mkPectoral(1);
    const rightFin = mkPectoral(-1);
    root.add(leftFin);
    root.add(rightFin);

    // Mắt
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xf4e7a1, roughness: 0.2, metalness: 0.2 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0b0f14 });
    const eT = 0.075;
    [-1, 1].forEach(side => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0225, 10, 10), eyeMat);
        eye.position.set(side * profile(eT, shape).half * 0.9, profile(eT, shape).top * 0.35, zAt(eT));
        root.add(eye);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 8, 8), pupilMat);
        pupil.position.copy(eye.position);
        pupil.position.x += side * 0.012;
        root.add(pupil);
    });

    // Miệng + râu chép
    const lipMat = new THREE.MeshStandardMaterial({ color: shape === 'tilapia' ? 0x9a7a70 : 0xb98a4a, roughness: 0.5 });
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), lipMat);
    mouth.scale.set(1.3, 0.7, 1.0);
    mouth.position.set(0, -profile(0.03, shape).bot * 0.3, len * 0.5 - 0.005);
    root.add(mouth);

    if (v.barbels) {
        const barbelMat = new THREE.MeshStandardMaterial({ color: 0xc9a766, roughness: 0.6 });
        [-1, 1].forEach(side => {
            [0.045, 0.075].forEach((len2, idx) => {
                const barbel = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.002, len2, 5), barbelMat);
                barbel.position.set(side * (0.03 + idx * 0.012), -0.03, len * 0.5 + 0.006);
                barbel.rotation.z = side * (0.85 + idx * 0.2);
                barbel.rotation.x = 0.6;
                root.add(barbel);
            });
        });
    }

    root.scale.setScalar(opts.noScale ? 1 : scaleF);
    root.userData = {
        tailPivot,
        leftFin,
        rightFin,
        speciesKey: sp.key,
        shadowSilhouette: null,
        shadowMat: null
    };
    return root;
}
