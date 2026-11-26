import * as THREE from 'three';
import { SPECIES } from '../data/FishProfiles.js';

// BỘ DỰNG MÔ HÌNH CÁ 3D CHÂN THỰC CAO CẤP (VẢY XẾP NGÓI BUMP 3D • NẮP MANG • ĐƯỜNG BÊN • TIA VÂY • MẮT KÍNH GIÁC MẠC • KHUYÊN VÀNG)
// Hỗ trợ 5 loài đặc trưng: Cá Chép, Cá Chép Củ, Cá Trắm Đen, Cá Trắm Cỏ, Cá Rô Phi
// Quy ước: Mũi cá hướng +Z, Đuôi hướng -Z, Lưng hướng +Y.

const speciesTexCache = {};
const finTexCache = {};

function getSpeciesTextures(speciesKey) {
    if (speciesTexCache[speciesKey]) return speciesTexCache[speciesKey];

    const W = 512;
    const H = 512;

    // 1. Color + Scale Sheen Map (U = vòng quanh thân 0..1, V = từ mũi 0 -> đuôi 1)
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');

    // 2. Bump Map tạo độ nổi từng hàng vảy cá dưới nắng mặt hồ
    const bc = document.createElement('canvas');
    bc.width = 256;
    bc.height = 256;
    const bctx = bc.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, 256, 256);

    // Sọc vằn dọc bên sườn đặc trưng cho Cá Rô Phi Cụ
    if (speciesKey === 'TILAPIA') {
        for (let b = 0; b < 8; b++) {
            const vy = H * (0.23 + b * 0.088);
            const grad = ctx.createLinearGradient(0, vy - 14, 0, vy + 14);
            grad.addColorStop(0, 'rgba(30,42,48,0)');
            grad.addColorStop(0.5, 'rgba(26,38,46,0.34)');
            grad.addColorStop(1, 'rgba(30,42,48,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, vy - 14, W, 28);
        }
    }

    // Ánh cam đỏ ấm áp ở phần cuống đuôi dưới của Cá Chép & Chép Củ
    if (speciesKey === 'CARP' || speciesKey === 'OLD_CARP') {
        const tailGlow = ctx.createLinearGradient(0, H * 0.62, 0, H);
        tailGlow.addColorStop(0, 'rgba(217,119,6,0)');
        tailGlow.addColorStop(1, 'rgba(194,65,12,0.22)');
        ctx.fillStyle = tailGlow;
        ctx.fillRect(0, H * 0.62, W, H * 0.38);
    }

    // Vùng đầu cá (V < 0.19) da trơn bóng không có vảy, chỉ từ sau nắp mang (V >= 0.19) mới xếp vảy lợp ngói!
    const headEndV = 0.185;
    const rows = speciesKey === 'OLD_CARP' ? 22 : (speciesKey === 'BLACK_CARP' ? 24 : (speciesKey === 'TILAPIA' ? 20 : 26));
    const cols = speciesKey === 'OLD_CARP' ? 14 : (speciesKey === 'TILAPIA' ? 14 : 16);

    const rimAlpha = speciesKey === 'GRASS_CARP' ? 0.48 : (speciesKey === 'BLACK_CARP' ? 0.52 : (speciesKey === 'OLD_CARP' ? 0.44 : 0.36));
    const rimRgb = speciesKey === 'BLACK_CARP'
        ? '10,16,24'
        : (speciesKey === 'GRASS_CARP' ? '42,52,20' : (speciesKey === 'TILAPIA' ? '38,48,54' : '68,42,12'));

    const colStep = W / cols;
    const rowStartPx = H * headEndV;
    const rowStep = (H * (0.965 - headEndV)) / rows;
    const radius = colStep * 0.56;

    for (let r = 0; r < rows; r++) {
        const cy = rowStartPx + r * rowStep;
        const offset = (r % 2) * (colStep * 0.5);

        for (let col = -1; col <= cols; col++) {
            const cx = col * colStep + offset;

            // Ánh xà cừ / ánh đồng bên trong từng chiếc vảy
            const g = ctx.createRadialGradient(cx, cy - radius * 0.15, radius * 0.1, cx, cy, radius);
            g.addColorStop(0, 'rgba(255,255,255,0.24)');
            g.addColorStop(0.68, 'rgba(245,240,225,0.04)');
            g.addColorStop(1, `rgba(${rimRgb},${rimAlpha})`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0.08 * Math.PI, 0.92 * Math.PI);
            ctx.fill();

            ctx.strokeStyle = `rgba(${rimRgb},${rimAlpha + 0.12})`;
            ctx.lineWidth = speciesKey === 'OLD_CARP' ? 2.4 : 1.8;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0.12 * Math.PI, 0.88 * Math.PI);
            ctx.stroke();

            // Vẽ tương ứng lên Bump Map (256x256)
            const bx = cx * 0.5;
            const by = cy * 0.5;
            const br = radius * 0.5;
            const bg = bctx.createRadialGradient(bx, by - br * 0.1, br * 0.1, bx, by, br);
            bg.addColorStop(0, '#d8d8d8');
            bg.addColorStop(0.75, '#969696');
            bg.addColorStop(1, '#383838');
            bctx.fillStyle = bg;
            bctx.beginPath();
            bctx.arc(bx, by, br, 0.08 * Math.PI, 0.92 * Math.PI);
            bctx.fill();
        }
    }

    // Đường bên (Lateral Line) — hàng lỗ cảm biến nước chạy dọc hai bên sườn cá (u ≈ 0.0 & u ≈ 0.5)
    [0.0, 0.5, 1.0].forEach((uLine) => {
        const lx = uLine * W;
        ctx.strokeStyle = `rgba(${rimRgb},0.48)`;
        ctx.lineWidth = 2.0;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(lx, H * 0.20);
        ctx.lineTo(lx, H * 0.94);
        ctx.stroke();
        ctx.setLineDash([]);
    });

    const map = new THREE.CanvasTexture(c);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.needsUpdate = true;

    const bumpMap = new THREE.CanvasTexture(bc);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.ClampToEdgeWrapping;
    bumpMap.needsUpdate = true;

    speciesTexCache[speciesKey] = { map, bumpMap };
    return speciesTexCache[speciesKey];
}

function getFinRayTexture(speciesKey) {
    if (finTexCache[speciesKey]) return finTexCache[speciesKey];

    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');

    // Nền màng vây đậm ở gốc và mảnh mờ dần ra mép
    const grad = ctx.createLinearGradient(0, 256, 0, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.96)');
    grad.addColorStop(0.72, 'rgba(240,240,240,0.84)');
    if (speciesKey === 'TILAPIA') {
        grad.addColorStop(0.92, 'rgba(239,68,68,0.85)'); // Viền hồng đỏ đặc trưng trên vây Rô Phi Cụ
        grad.addColorStop(1, 'rgba(220,38,38,0.65)');
    } else if (speciesKey === 'CARP' || speciesKey === 'OLD_CARP') {
        grad.addColorStop(0.9, 'rgba(217,119,6,0.82)');
        grad.addColorStop(1, 'rgba(120,53,15,0.68)');
    } else {
        grad.addColorStop(1, 'rgba(180,180,180,0.62)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Các tia xương vây (Fin Rays) chạy dọc sắc nét
    for (let i = 0; i < 36; i++) {
        const x = (i / 35) * 256;
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(30,25,20,0.46)' : 'rgba(255,255,255,0.32)';
        ctx.lineWidth = i % 3 === 0 ? 2.2 : 1.2;
        ctx.beginPath();
        ctx.moveTo(x, 256);
        ctx.lineTo(x + (x - 128) * 0.14, 0);
        ctx.stroke();
    }

    // Đốm vằn đặc trưng trên vây đuôi & vây lưng Rô Phi
    if (speciesKey === 'TILAPIA') {
        ctx.fillStyle = 'rgba(25,30,38,0.28)';
        for (let r = 0; r < 5; r++) {
            for (let k = 0; k < 10; k++) {
                ctx.beginPath();
                ctx.arc(16 + k * 25 + (r % 2) * 10, 45 + r * 36, 4.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    finTexCache[speciesKey] = tex;
    return tex;
}

function envelope(t, shape) {
    // t: 0 (mũi) -> 1 (cuống đuôi). Trả về hệ số 0..1 của tiết diện cơ thể
    const noseBlunt = shape === 'carp' ? 0.74 : shape === 'tilapia' ? 0.68 : (shape === 'grass' ? 0.78 : 0.84);
    const s = Math.sin(Math.PI * Math.pow(t, noseBlunt));
    let e = Math.pow(Math.max(0, s), 0.80);
    if (t > 0.76) {
        const peduncle = shape === 'tilapia' ? 0.22 : (shape === 'carp' ? 0.19 : 0.165);
        e = Math.max(e, peduncle * (1.0 - (t - 0.76) / 0.30) + 0.065);
    }
    return e;
}

function profile(t, shape, isOldCarp = false) {
    const e = envelope(t, shape);
    if (shape === 'carp') {
        // Trán hơi lõm gãy nhẹ ở gáy (t ~ 0.14) rồi vồng cao lưng gù cơ bắp ở t ~ 0.32, bụng phệ tròn đầy
        const neckDip = -0.08 * Math.exp(-Math.pow((t - 0.12) / 0.055, 2));
        const humpAmp = isOldCarp ? 0.48 : 0.38;
        const hump = Math.exp(-Math.pow((t - 0.31) / 0.175, 2));
        const bellySag = 1.0 + (isOldCarp ? 0.24 : 0.16) * Math.exp(-Math.pow((t - 0.42) / 0.22, 2));
        return {
            top: 0.186 * e * (1 + humpAmp * hump + neckDip),
            bot: 0.148 * e * bellySag,
            half: (isOldCarp ? 0.102 : 0.094) * e
        };
    }
    if (shape === 'tilapia') {
        // Thân dẹt cao hình thoi bầu dục
        const arch = Math.exp(-Math.pow((t - 0.34) / 0.24, 2));
        return {
            top: 0.182 * e * (1 + 0.16 * arch),
            bot: 0.166 * e * (1 + 0.10 * arch),
            half: 0.058 * e
        };
    }
    if (shape === 'black') {
        // Trắm Đen: Thân thoi săn chắc như ngư lôi
        const muscle = Math.exp(-Math.pow((t - 0.35) / 0.25, 2));
        return {
            top: 0.122 * e * (1 + 0.08 * muscle),
            bot: 0.112 * e * (1 + 0.06 * muscle),
            half: 0.098 * e
        };
    }
    // Trắm Cỏ: Đầu hơi bẹt rộng, lưng thuôn thẳng dài
    const headWide = 1.0 + 0.12 * Math.exp(-Math.pow((t - 0.15) / 0.12, 2));
    return {
        top: 0.126 * e,
        bot: 0.116 * e,
        half: 0.104 * e * headWide
    };
}

function buildBodyGeometry(len, shape, colors, isOldCarp = false) {
    const segs = 44;
    const radial = 28;
    const positions = [];
    const colorArr = [];
    const uvs = [];
    const indices = [];

    const cDorsal = new THREE.Color(colors.dorsal);
    const cFlank = new THREE.Color(colors.flank);
    const cBelly = new THREE.Color(colors.belly);
    const cSilver = new THREE.Color(0xfffbeb);
    const tmp = new THREE.Color();

    for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const z = len * 0.5 - t * len;
        const p = profile(t, shape, isOldCarp);

        for (let j = 0; j <= radial; j++) {
            const u = j / radial;
            const a = u * Math.PI * 2;
            const sy = Math.sin(a);
            const cx = Math.cos(a);

            // Làm phẳng nhẹ mặt dưới bụng và bo nhẹ hốc mắt ở phần đầu
            let x = cx * p.half;
            let y = sy >= 0 ? sy * p.top : sy * p.bot;
            if (t < 0.16 && sy > 0.2) {
                x *= 0.94;
            }

            positions.push(x, y, z);
            uvs.push(u, t);

            // Phối màu chuyển sắc sinh học mượt mà: Lưng sẫm -> Sườn ánh kim -> Bụng kem sáng
            const k = sy;
            if (k >= 0.28) {
                tmp.copy(cFlank).lerp(cDorsal, Math.min(1, Math.pow((k - 0.28) / 0.68, 0.85)));
            } else if (k >= -0.22) {
                tmp.copy(cFlank);
            } else {
                tmp.copy(cFlank).lerp(cBelly, Math.min(1, Math.pow((-0.22 - k) / 0.58, 0.85)));
            }

            // Ánh xà cừ lấp lánh dọc đường bên giữa sườn
            if (Math.abs(k) < 0.26 && t > 0.16) {
                tmp.lerp(cSilver, shape === 'black' ? 0.08 : 0.15);
            }
            // Má cá hơi ánh đồng hồng nhẹ
            if (t >= 0.09 && t <= 0.21 && Math.abs(k) < 0.45) {
                tmp.lerp(new THREE.Color(0xd97706), shape === 'black' ? 0.04 : 0.12);
            }

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

// Dựng vây phẳng có UV chuẩn xác (gốc vây v=0 -> ngọn vây v=1) để hiển thị rõ từng tia xương vây!
function finMeshWithUV(points, mat) {
    const shape = new THREE.Shape();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(([z, y], i) => {
        const sx = -z;
        const sy = y;
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
        if (i === 0) shape.moveTo(sx, sy);
        else shape.lineTo(sx, sy);
    });
    shape.closePath();

    const geo = new THREE.ShapeGeometry(shape);
    const pos = geo.attributes.position;
    const uvs = new Float32Array(pos.count * 2);
    const spanX = Math.max(0.001, maxX - minX);
    const spanY = Math.max(0.001, maxY - minY);
    const baseY = points[0][1];

    for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        uvs[i * 2] = (px - minX) / spanX;
        uvs[i * 2 + 1] = Math.min(1, Math.abs(py - baseY) / spanY);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.rotateY(Math.PI / 2);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
}

function curvedFin(zFrom, zTo, baseY, height, mat, sweep = 0.4, spikes = 0, concaveCarp = false) {
    const pts = [[zFrom, baseY]];
    const n = 14;
    for (let i = 1; i <= n; i++) {
        const u = i / n;
        const z = zFrom + (zTo - zFrom) * u;
        let h;
        if (concaveCarp) {
            // Vây lưng Cá Chép: Tia gai đầu tiên dựng cao vút rồi lõm cong mềm dạng cờ về phía sau
            const peak = u < 0.14 ? Math.sin((u / 0.14) * Math.PI * 0.5) : (0.52 + 0.48 * Math.exp(-Math.pow((u - 0.14) / 0.22, 1.4)));
            h = height * peak * (1.0 - 0.18 * u);
        } else {
            h = height * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.68)), 0.78) * (1.0 - sweep * u);
        }
        if (spikes && u < 0.68) {
            h *= (i % 2 === 0 ? 1.04 : 0.80);
        } else if (spikes && u >= 0.68) {
            // Thùy vây lưng sau của Rô Phi Cụ vươn cao tròn rộng
            h *= 1.18;
        }
        pts.push([z, baseY + h]);
    }
    pts.push([zTo, baseY]);
    return finMeshWithUV(pts, mat);
}

export function buildRealisticFish(speciesKey, weight = 5, opts = {}) {
    const sp = SPECIES[speciesKey] || SPECIES.CARP;
    const isOldCarp = sp.key === 'OLD_CARP';
    const v = sp.visual;
    const root = new THREE.Group();
    const scaleF = THREE.MathUtils.clamp(0.7 + (weight / 16.0) * 0.55, 0.6, 1.55);
    const len = v.len;
    const shape = v.shape;

    const { map: scaleMap, bumpMap: scaleBumpMap } = getSpeciesTextures(sp.key);
    const finRayMap = getFinRayTexture(sp.key);

    // 1. THÂN CÁ 3D CÓ LỚP NHỚT BÓNG NƯỚC (CLEARCOAT) & VẢY NỔI BUMP MAP
    const bodyGeo = buildBodyGeometry(len, shape, v, isOldCarp);
    const bodyMat = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        map: scaleMap,
        bumpMap: scaleBumpMap,
        bumpScale: isOldCarp ? 0.011 : 0.0075,
        roughness: shape === 'black' ? 0.20 : 0.26,
        metalness: shape === 'black' ? 0.42 : 0.34,
        clearcoat: 0.75,
        clearcoatRoughness: 0.15,
        side: THREE.DoubleSide
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    root.add(body);

    const topAt = (t) => profile(t, shape, isOldCarp).top;
    const botAt = (t) => -profile(t, shape, isOldCarp).bot;
    const halfAt = (t) => profile(t, shape, isOldCarp).half;
    const zAt = (t) => len * 0.5 - t * len;

    // 2. NẮP MANG 3D KHẮC NỔI (OPERCULUM) & VIỀN KHE MANG ĐỎ SẪM HAI BÊN MÁ CÁ
    const gillPlateMat = new THREE.MeshPhysicalMaterial({
        color: shape === 'black' ? 0x27303a : (shape === 'tilapia' ? 0x738588 : (isOldCarp ? 0xa37427 : 0xc49538)),
        metalness: 0.55,
        roughness: 0.22,
        clearcoat: 0.8
    });
    const gillSlitMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.6 });

    [-1, 1].forEach((side) => {
        const gT = 0.165;
        const plate = new THREE.Mesh(
            new THREE.SphereGeometry(len * 0.068, 14, 12, 0, Math.PI, 0.15 * Math.PI, 0.7 * Math.PI),
            gillPlateMat
        );
        plate.scale.set(0.24, 1.18, 0.95);
        plate.position.set(side * halfAt(gT) * 0.86, -topAt(gT) * 0.06, zAt(gT));
        plate.rotation.y = side * (Math.PI * 0.5 - 0.14);
        root.add(plate);

        const slit = new THREE.Mesh(
            new THREE.TorusGeometry(len * 0.056, 0.0028, 6, 14, Math.PI * 0.72),
            gillSlitMat
        );
        slit.position.set(side * halfAt(0.195) * 0.94, -topAt(0.195) * 0.08, zAt(0.195));
        slit.rotation.y = Math.PI * 0.5;
        slit.rotation.z = -Math.PI * 0.36;
        root.add(slit);
    });

    // 3. HỆ THỐNG 5 NHÓM VÂY CÓ TIA XƯƠNG VÂY BÁN TRONG SUỐT
    const finMat = new THREE.MeshStandardMaterial({
        color: v.fin,
        map: finRayMap,
        roughness: 0.42,
        metalness: 0.12,
        transparent: true,
        opacity: 0.90,
        side: THREE.DoubleSide
    });

    const lowerFinColor = (shape === 'carp') ? 0xb45309 : v.fin;
    const lowerFinMat = new THREE.MeshStandardMaterial({
        color: lowerFinColor,
        map: finRayMap,
        roughness: 0.42,
        metalness: 0.12,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide
    });

    // 3A. Vây Lưng (Dorsal Fin) + Tia Gai Răng Cưa Cứng Đầu Vây
    if (shape === 'carp') {
        const dH = isOldCarp ? 0.175 : 0.155;
        const d = curvedFin(zAt(0.26), zAt(0.68), topAt(0.38) * 0.90, dH, finMat, 0.35, 0, true);
        root.add(d);

        // Tia gai cứng đầu vây lưng cá chép
        const leadSpine = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0022, 0.0055, dH * 1.05, 6),
            new THREE.MeshStandardMaterial({ color: isOldCarp ? 0x78350f : 0x92400e, roughness: 0.35 })
        );
        leadSpine.position.set(0, topAt(0.27) * 0.92 + dH * 0.46, zAt(0.275));
        leadSpine.rotation.x = -0.26;
        root.add(leadSpine);
    } else if (shape === 'tilapia') {
        const d = curvedFin(zAt(0.20), zAt(0.82), topAt(0.35) * 0.92, 0.145, finMat, 0.10, 1, false);
        root.add(d);
    } else if (shape === 'black') {
        root.add(curvedFin(zAt(0.38), zAt(0.56), topAt(0.46) * 0.93, 0.165, finMat, 0.45));
    } else {
        root.add(curvedFin(zAt(0.38), zAt(0.55), topAt(0.46) * 0.93, 0.145, finMat, 0.45));
    }

    // 3B. KHUYÊN VÀNG 3D CHỦ HỒ ĐEO Ở VÂY LƯNG (Khi cá là Cá Đeo Khuyên Thưởng Nóng!)
    if (opts.isTaggedPrize) {
        const goldMat = new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            emissive: 0xca8a04,
            emissiveIntensity: 0.35,
            metalness: 0.96,
            roughness: 0.12
        });
        const tagGroup = new THREE.Group();
        const goldRing = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0048, 10, 20), goldMat);
        goldRing.rotation.y = Math.PI * 0.35;
        tagGroup.add(goldRing);

        const goldMedal = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.004, 14), goldMat);
        goldMedal.rotation.z = Math.PI * 0.5;
        goldMedal.position.set(0.022, 0.012, -0.01);
        tagGroup.add(goldMedal);

        const tagT = shape === 'carp' ? 0.27 : (shape === 'tilapia' ? 0.22 : 0.39);
        tagGroup.position.set(0, topAt(tagT) + 0.032, zAt(tagT));
        root.add(tagGroup);
    }

    // 3C. Vây Hậu Môn (Anal Fin)
    root.add(curvedFin(zAt(0.66), zAt(0.80), botAt(0.71) * 0.88, -0.095, lowerFinMat, 0.22));

    // 3D. Đôi Vây Bụng (Pelvic Fins — xòe cân đối dưới bụng cá)
    [-1, 1].forEach((side) => {
        const pv = finMeshWithUV(
            [[0, 0], [-0.04, -0.085], [-0.10, -0.075], [-0.07, -0.01]],
            lowerFinMat
        );
        const pT = 0.45;
        pv.position.set(side * halfAt(pT) * 0.38, botAt(pT) * 0.90, zAt(pT));
        pv.rotation.z = side * 0.42;
        pv.rotation.y = side * 0.12;
        root.add(pv);
    });

    // 3E. Đôi Vây Ngực Có Khớp Vẫy (Pectoral Fins)
    const mkPectoral = (side) => {
        const pivot = new THREE.Group();
        const pf = finMeshWithUV(
            [[0, 0], [-0.05, 0.018], [-0.145, -0.015], [-0.12, -0.058], [-0.04, -0.052]],
            lowerFinMat
        );
        pf.rotation.z = side * 1.12;
        pivot.add(pf);
        const t = 0.21;
        pivot.position.set(side * halfAt(t) * 0.92, botAt(t) * 0.46, zAt(t));
        pivot.rotation.y = side * 0.26;
        return pivot;
    };
    const leftFin = mkPectoral(1);
    const rightFin = mkPectoral(-1);
    root.add(leftFin);
    root.add(rightFin);

    // 3F. Vây Đuôi Chẻ Sâu / Đuôi Quạt Uốn Lượn (Caudal Fin trên Tail Pivot)
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0, zAt(0.965));
    const tailH = shape === 'tilapia' ? 0.165 : (isOldCarp ? 0.235 : 0.21);
    const tailPts = shape === 'tilapia'
        ? [
            [0, 0.026],
            [-0.08, tailH * 0.85],
            [-0.16, tailH],
            [-0.19, tailH * 0.55],
            [-0.195, 0],
            [-0.19, -tailH * 0.55],
            [-0.16, -tailH],
            [-0.08, -tailH * 0.85],
            [0, -0.026]
        ]
        : [
            [0, 0.032],
            [-0.09, tailH * 0.86],
            [-0.18, tailH * 1.18],
            [-0.245, tailH * 0.96],
            [-0.19, tailH * 0.42],
            [-0.095, 0],
            [-0.19, -tailH * 0.42],
            [-0.245, -tailH * 0.96],
            [-0.18, -tailH * 1.18],
            [-0.09, -tailH * 0.86],
            [0, -0.032]
        ];
    tailPivot.add(finMeshWithUV(tailPts, finMat));
    root.add(tailPivot);

    // 4. MẮT CÁ 3D 3 LỚP (MỐNG MẮT VÀNG ĐỒNG + CON NGƯƠI ĐEN + GIÁC MẠC KÍNH CẦU BÓNG NƯỚC)
    const irisColor = shape === 'black' ? 0xd4af37 : (shape === 'tilapia' ? 0xf59e0b : 0xfacc15);
    const irisMat = new THREE.MeshStandardMaterial({ color: irisColor, roughness: 0.18, metalness: 0.65 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x05070a });
    const corneaMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.36,
        roughness: 0.04,
        metalness: 0.05,
        clearcoat: 1.0
    });

    const eT = shape === 'tilapia' ? 0.082 : 0.076;
    const eyeR = shape === 'tilapia' ? 0.022 : (len * 0.024);
    [-1, 1].forEach((side) => {
        const ex = side * halfAt(eT) * 0.88;
        const ey = topAt(eT) * 0.34;
        const ez = zAt(eT);

        const iris = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 12, 12), irisMat);
        iris.scale.set(0.55, 1.0, 1.0);
        iris.position.set(ex, ey, ez);
        root.add(iris);

        const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.62, 10, 10), pupilMat);
        pupil.scale.set(0.55, 1.0, 1.0);
        pupil.position.set(ex + side * eyeR * 0.28, ey, ez + eyeR * 0.06);
        root.add(pupil);

        const cornea = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.08, 12, 12), corneaMat);
        cornea.scale.set(0.65, 1.02, 1.02);
        cornea.position.set(ex + side * eyeR * 0.12, ey, ez);
        root.add(cornea);
    });

    // 5. VÀNH MÔI DÀY HỌ CÁ CHÉP & 2 ĐÔI RÂU MÉP UỐN CONG MỀM MẠI
    const lipColor = shape === 'black' ? 0x334155 : (shape === 'tilapia' ? 0x8c6d62 : (isOldCarp ? 0xa16207 : 0xc28e42));
    const lipMat = new THREE.MeshPhysicalMaterial({
        color: lipColor,
        roughness: 0.38,
        clearcoat: 0.65
    });

    const mouthRing = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0085, 8, 16), lipMat);
    mouthRing.scale.set(1.22, 0.78, 1.15);
    mouthRing.position.set(0, -profile(0.025, shape, isOldCarp).bot * 0.26, len * 0.5 - 0.004);
    mouthRing.rotation.x = 0.22;
    root.add(mouthRing);

    if (v.barbels) {
        const barbelMat = new THREE.MeshStandardMaterial({
            color: isOldCarp ? 0xb45309 : 0xd4a359,
            roughness: 0.45
        });
        [-1, 1].forEach((side) => {
            // Đôi râu ngắn phía trên mép
            const shortB = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0012, 0.042, 6), barbelMat);
            shortB.position.set(side * 0.026, -0.018, len * 0.5 - 0.004);
            shortB.rotation.z = side * 0.75;
            shortB.rotation.x = 0.45;
            root.add(shortB);

            // Đôi râu dài khóe miệng uốn 2 đốt tự nhiên
            const longRoot = new THREE.Group();
            longRoot.position.set(side * 0.032, -0.028, len * 0.5 - 0.012);
            const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0024, 0.048, 6), barbelMat);
            seg1.position.set(side * 0.016, -0.016, 0.006);
            seg1.rotation.z = side * 0.82;
            seg1.rotation.x = 0.35;
            longRoot.add(seg1);

            const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0009, 0.046, 6), barbelMat);
            seg2.position.set(side * 0.036, -0.038, -0.004);
            seg2.rotation.z = side * 0.42;
            seg2.rotation.x = -0.25;
            longRoot.add(seg2);

            root.add(longRoot);
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
