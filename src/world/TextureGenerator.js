// Canvas Procedural Textures, Alpha Foliage Maps & Normal Maps cho đồ họa 3D chân thực
import * as THREE from 'three';

// 1. Tạo Water Normal Map động cho sóng nước lượn lăn tăn phản chiếu ánh sáng
export function createWaterNormalTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const imgData = ctx.createImageData(512, 512);
    const data = imgData.data;

    for (let y = 0; y < 512; y++) {
        for (let x = 0; x < 512; x++) {
            const nx = x / 512;
            const ny = y / 512;
            const wave1 = Math.sin(nx * 28 + ny * 22) * 0.45;
            const wave2 = Math.cos(nx * 54 - ny * 46) * 0.30;
            const wave3 = Math.sin((nx + ny) * 84) * 0.15;
            const wave4 = Math.cos((nx - ny) * 120) * 0.10;
            const height = wave1 + wave2 + wave3 + wave4;

            const r = Math.floor((Math.sin(height * Math.PI) * 0.5 + 0.5) * 255);
            const g = Math.floor((Math.cos(height * Math.PI) * 0.5 + 0.5) * 255);
            const b = 242;

            const idx = (y * 512 + x) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imgData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(12, 12);
    return texture;
}

// 2. Tạo Texture Vỏ Cây Cổ Thụ Rêu Phong (Tree Bark Texture)
export function createTreeBarkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3b281e';
    ctx.fillRect(0, 0, 256, 512);

    // Các rãnh vỏ cây nứt dọc tự nhiên
    for (let i = 0; i < 180; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 512;
        const w = 2 + Math.random() * 6;
        const h = 30 + Math.random() * 90;
        const shade = Math.floor((Math.random() - 0.5) * 35);
        ctx.fillStyle = `rgb(${55 + shade}, ${38 + shade}, ${26 + shade})`;
        ctx.fillRect(x, y, w, h);
    }

    // Đốm rêu xanh bám trên thân cây cổ thụ
    for (let m = 0; m < 45; m++) {
        ctx.fillStyle = 'rgba(45, 90, 39, 0.35)';
        ctx.beginPath();
        ctx.arc(Math.random() * 256, Math.random() * 512, 8 + Math.random() * 18, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
}

// 3. Tạo Texture Chùm Lá Cây Chi Tiết Có Alpha (Individual Leaf Cluster Texture)
export function createFoliageClusterTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 512, 512);

    // Vẽ cành cây nhỏ bên trong tán lá
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 5;
    for (let b = 0; b < 8; b++) {
        const angle = (b / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(256, 256);
        ctx.lineTo(256 + Math.cos(angle) * 190, 256 + Math.sin(angle) * 190);
        ctx.stroke();
    }

    // Vẽ hàng trăm chiếc lá hình bầu dục nhọn hai đầu xếp lớp có chiều sâu sáng-tối
    const leafPalette = [
        '#14532d', '#166534', '#15803d', '#16a34a',
        '#22c55e', '#4d7c0f', '#3f6212', '#65a30d'
    ];

    for (let i = 0; i < 480; i++) {
        const r = Math.pow(Math.random(), 0.65) * 225;
        const theta = Math.random() * Math.PI * 2;
        const lx = 256 + Math.cos(theta) * r;
        const ly = 256 + Math.sin(theta) * r;

        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(theta + (Math.random() - 0.5) * 1.2);

        const leafW = 14 + Math.random() * 16;
        const leafH = 7 + Math.random() * 8;
        ctx.fillStyle = leafPalette[Math.floor(Math.random() * leafPalette.length)];

        ctx.beginPath();
        ctx.ellipse(0, 0, leafW, leafH, 0, 0, Math.PI * 2);
        ctx.fill();

        // Gân lá sáng
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-leafW * 0.8, 0);
        ctx.lineTo(leafW * 0.8, 0);
        ctx.stroke();

        ctx.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

// 4. Tạo Texture Dải Lá Liễu Rủ Mảnh Đung Đưa (Weeping Willow Fronds RGBA)
export function createWillowFrondTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 512);

    const strands = 7;
    for (let s = 0; s < strands; s++) {
        const baseX = 28 + s * 33;
        ctx.strokeStyle = '#3f6212';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(baseX, 0);
        ctx.quadraticCurveTo(baseX + (s % 2 === 0 ? 14 : -14), 256, baseX, 495);
        ctx.stroke();

        // Từng chiếc lá liễu thon dài mọc đối xứng dọc theo cành rủ
        for (let y = 16; y < 485; y += 14) {
            const curveX = baseX + Math.sin((y / 512) * Math.PI) * (s % 2 === 0 ? 7 : -7);
            for (let side of [-1, 1]) {
                ctx.save();
                ctx.translate(curveX + side * 8, y + (side === 1 ? 4 : 0));
                ctx.rotate(side * 0.45);
                ctx.fillStyle = (y + s) % 3 === 0 ? '#65a30d' : '#4d7c0f';
                ctx.beginPath();
                ctx.ellipse(0, 0, 11, 3.2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

// 5. Tạo Texture Bụi Cỏ Dại & Bông Lau Ven Hồ (Grass & Reed Billboards RGBA)
export function createGrassReedTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 256);

    const greens = ['#14532d', '#166534', '#15803d', '#3f6212', '#4d7c0f'];
    for (let i = 0; i < 65; i++) {
        const startX = 20 + Math.random() * 216;
        const bendX = startX + (Math.random() - 0.5) * 70;
        const topY = 18 + Math.random() * 110;

        ctx.strokeStyle = greens[i % greens.length];
        ctx.lineWidth = 3 + Math.random() * 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(startX, 256);
        ctx.quadraticCurveTo((startX + bendX) * 0.5, (256 + topY) * 0.5, bendX, topY);
        ctx.stroke();

        // Bông cỏ lau trắng ngà ở ngọn
        if (i % 7 === 0 && topY < 75) {
            ctx.fillStyle = '#fef3c7';
            ctx.beginPath();
            ctx.ellipse(bendX, topY, 4, 14, (bendX - startX) * 0.01, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

// 6. Tạo Texture ván gỗ sàn câu đài (Weathered Wood Planks)
export function createWoodDeckTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#4a3321';
    ctx.fillRect(0, 0, 512, 512);

    const plankCount = 8;
    const plankH = 512 / plankCount;

    for (let i = 0; i < plankCount; i++) {
        const y = i * plankH;
        const shade = Math.floor((Math.random() - 0.5) * 18);
        ctx.fillStyle = `rgb(${76 + shade}, ${52 + shade}, ${34 + shade})`;
        ctx.fillRect(0, y + 2, 512, plankH - 4);

        ctx.strokeStyle = 'rgba(25, 14, 6, 0.25)';
        ctx.lineWidth = 1.5;
        for (let g = 0; g < 14; g++) {
            ctx.beginPath();
            const gy = y + 6 + Math.random() * (plankH - 12);
            ctx.moveTo(0, gy);
            ctx.bezierCurveTo(170, gy + (Math.random() - 0.5) * 8, 340, gy + (Math.random() - 0.5) * 8, 512, gy);
            ctx.stroke();
        }

        ctx.fillStyle = '#1c1108';
        ctx.fillRect(0, y, 512, 3);
        ctx.fillStyle = '#27272a';
        [24, 248, 488].forEach(nx => {
            ctx.beginPath();
            ctx.arc(nx, y + 12, 2.5, 0, Math.PI * 2);
            ctx.arc(nx, y + plankH - 12, 2.5, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 3);
    return texture;
}

// 7. Tạo Texture Kè Đá Hộc / Bê Tông Bờ Hồ Dịch Vụ
export function createStoneWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, 512, 256);

    const rows = 4;
    const rowH = 256 / rows;
    for (let r = 0; r < rows; r++) {
        const y = r * rowH;
        const offset = (r % 2) * 40;
        for (let x = -40; x < 512; x += 84) {
            const tone = 85 + Math.floor(Math.random() * 40);
            ctx.fillStyle = `rgb(${tone}, ${tone + 4}, ${tone + 8})`;
            ctx.fillRect(x + offset + 3, y + 3, 78, rowH - 6);

            if (r >= 2) {
                ctx.fillStyle = 'rgba(34, 84, 45, 0.45)';
                ctx.fillRect(x + offset + 3, y + rowH * 0.4, 78, rowH * 0.6);
            }
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(24, 1);
    return texture;
}

// 8. Tạo Texture Thảm Cỏ Tự Nhiên Quanh Hồ
export function createGrassGroundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#264a22';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 6500; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const g = 60 + Math.floor(Math.random() * 52);
        const r = 28 + Math.floor(Math.random() * 26);
        ctx.fillStyle = `rgb(${r}, ${g}, 24)`;
        ctx.fillRect(x, y, 2, 6);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(22, 22);
    return texture;
}

// 9. Tạo Texture Vân Carbon Xoắn Chéo X-Toray 46T Sắc Nét (Nền sáng trung tính để nhân chuẩn màu Sơn Lóng VertexColors)
export function createCarbonWeaveTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#bcc6d4';
    ctx.fillRect(0, 0, 256, 256);

    // Đan sợi carbon Twill 2x2 có chiều sâu ánh kim 3D
    const cell = 8;
    for (let y = 0; y < 256; y += cell) {
        for (let x = 0; x < 256; x += cell) {
            const phase = ((x / cell) + (y / cell)) % 4;
            const g = ctx.createLinearGradient(x, y, x + cell, y + cell);
            if (phase < 2) {
                g.addColorStop(0, '#eef2f6');
                g.addColorStop(0.5, '#cbd5e1');
                g.addColorStop(1, '#94a3b8');
            } else {
                g.addColorStop(0, '#94a3b8');
                g.addColorStop(0.5, '#aeb9c7');
                g.addColorStop(1, '#7c8798');
            }
            ctx.fillStyle = g;
            ctx.fillRect(x, y, cell - 0.5, cell - 0.5);
        }
    }

    // Dải gân xoắn X-Power gia cường chịu lực quanh thân lóng cần
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 3.5;
    for (let i = -256; i < 512; i += 48) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(256, i + 128);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i + 128);
        ctx.lineTo(256, i);
        ctx.stroke();
    }

    // Vệt bóng sơn tĩnh điện chạy dọc ống cần
    const gloss = ctx.createLinearGradient(0, 0, 256, 0);
    gloss.addColorStop(0.0, 'rgba(255,255,255,0.0)');
    gloss.addColorStop(0.32, 'rgba(255,255,255,0.22)');
    gloss.addColorStop(0.50, 'rgba(255,255,255,0.0)');
    gloss.addColorStop(0.82, 'rgba(15,23,42,0.16)');
    gloss.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(0, 0, 256, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 16);
    return texture;
}

// 10. Tạo Texture Cuốn Cán Cần Đài Chỉ Dù Xoắn & Màng Co Nhiệt Chống Trượt Cao Cấp
export function createRodGripTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, 256, 512);

    // Các vòng dây mây / chỉ dù quấn khít ở phần tay cầm cổ truyền kết hợp rãnh xoắn EVA chống trượt
    for (let y = 0; y < 512; y += 6) {
        const shade = (y % 12 === 0) ? '#27272a' : '#141417';
        ctx.fillStyle = shade;
        ctx.fillRect(0, y, 256, 4.5);
    }

    // Rãnh xoắn chéo kim cương (X-Shrink Tube)
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.24)';
    ctx.lineWidth = 2.5;
    for (let i = -256; i < 768; i += 36) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(256, i + 120);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i + 120);
        ctx.lineTo(256, i);
        ctx.stroke();
    }

    // Hạt nhám cao su chống trơn khi tay ướt nước mồi
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    for (let y = 4; y < 512; y += 8) {
        for (let x = 4; x < 256; x += 8) {
            ctx.beginPath();
            ctx.arc(x, y, 1.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 3);
    return texture;
}

export function createFarShorePanoramaTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

// 11. Tạo Texture Sơn Mài Bóng Piano Cho Thân Bầu Phao Đài (Hỗ trợ 5 chất liệu thật: Nano / Sa Phạm / Cỏ Sậy / Lông Công / Carbon LED)
export function createFloatBodyTexture(shape = 'DIAMOND') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Bảng màu & chất liệu theo từng dòng phao câu đài thực tế ngoài tiệm đồ câu VN
    const palettes = {
        DIAMOND: {
            shoulderTop: '#ff3b1f', shoulderMid: '#ea580c',
            bellyTop: '#ffffff', bellyMid: '#f1f5f9', bellyBot: '#cbd5e1',
            footTop: '#1e293b', footBot: '#09090b',
            bandMain: '#dc2626', bandGold: '#facc15',
            brand: 'KIM LONG • NANO', spec: 'QUẢ TRÁM • 2.6G', textCol: '#0f172a', fiber: 'NANO'
        },
        TEARDROP: {
            shoulderTop: '#f97316', shoulderMid: '#0284c7',
            bellyTop: '#e0f2fe', bellyMid: '#38bdf8', bellyBot: '#0369a1',
            footTop: '#0c4a6e', footBot: '#09090b',
            bandMain: '#facc15', bandGold: '#fef08a',
            brand: 'SA PHẠM • PRO', spec: 'GIỌT NƯỚC • 3.2G', textCol: '#082f49', fiber: 'NANO'
        },
        SLIM_REED: {
            shoulderTop: '#dc2626', shoulderMid: '#b45309',
            bellyTop: '#fef3c7', bellyMid: '#e7c98a', bellyBot: '#c29b57',
            footTop: '#78350f', footBot: '#1c1917',
            bandMain: '#991b1b', bandGold: '#f59e0b',
            brand: 'LÃO QUỶ • MỘC', spec: 'CỎ SẬY TỰ NHIÊN • 1.8G', textCol: '#451a03', fiber: 'REED'
        },
        PEACOCK_LONG: {
            shoulderTop: '#ef4444', shoulderMid: '#059669',
            bellyTop: '#ecfdf5', bellyMid: '#10b981', bellyBot: '#065f46',
            footTop: '#064e3b', footBot: '#09090b',
            bandMain: '#fde047', bandGold: '#facc15',
            brand: 'KHỔNG TƯỚC VƯƠNG', spec: 'LÔNG CÔNG ĐẤU GIẢI • 3.8G', textCol: '#022c22', fiber: 'PEACOCK'
        },
        SHORT_HEAVY: {
            shoulderTop: '#00ffaa', shoulderMid: '#0284c7',
            bellyTop: '#312e81', bellyMid: '#1e1b4b', bellyBot: '#0f172a',
            footTop: '#09090b', footBot: '#020617',
            bandMain: '#38bdf8', bandGold: '#facc15',
            brand: 'HỐ ĐẤU • SMART LED', spec: 'CẢM BIẾN ĐỔI MÀU • 5.5G', textCol: '#e0f2fe', fiber: 'CARBON'
        }
    };
    const p = palettes[shape] || palettes.DIAMOND;

    // 1. Nền sơn mài đa tầng từ vai bầu phao (y=0) xuống đáy thuôn chân phao (y=1024)
    const grad = ctx.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0.00, p.shoulderTop);
    grad.addColorStop(0.14, p.shoulderMid);
    grad.addColorStop(0.18, p.bandGold);
    grad.addColorStop(0.21, p.bellyTop);
    grad.addColorStop(0.52, p.bellyMid);
    grad.addColorStop(0.76, p.bellyBot);
    grad.addColorStop(0.82, p.footTop);
    grad.addColorStop(1.00, p.footBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 1024);

    // 2. Họa tiết vân chất liệu thật (Thớ cỏ sậy tự nhiên / Sợi ống lông công / Lưới carbon 3K / Bọt Nano mịn)
    if (p.fiber === 'REED') {
        for (let x = 0; x < 512; x += 3) {
            ctx.strokeStyle = (x % 9 === 0) ? 'rgba(120, 53, 15, 0.24)' : 'rgba(254, 243, 199, 0.28)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(x, 190);
            ctx.lineTo(x + (Math.random() - 0.5) * 4, 800);
            ctx.stroke();
        }
        // Đốt sậy tự nhiên nhẹ
        ctx.fillStyle = 'rgba(120, 53, 15, 0.22)';
        ctx.fillRect(0, 490, 512, 8);
    } else if (p.fiber === 'PEACOCK') {
        for (let x = 0; x < 512; x += 5) {
            ctx.strokeStyle = (x % 10 === 0) ? 'rgba(6, 78, 59, 0.28)' : 'rgba(255, 255, 255, 0.30)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 185);
            ctx.lineTo(x, 790);
            ctx.stroke();
        }
    } else if (p.fiber === 'CARBON') {
        for (let y = 200; y < 800; y += 12) {
            for (let x = 0; x < 512; x += 12) {
                ctx.fillStyle = ((x / 12 + y / 12) % 2 === 0) ? 'rgba(56, 189, 248, 0.14)' : 'rgba(15, 23, 42, 0.32)';
                ctx.fillRect(x, y, 10, 10);
            }
        }
    } else {
        for (let x = 0; x < 512; x += 8) {
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(x, 190);
            ctx.lineTo(x, 780);
            ctx.stroke();
        }
    }

    // 3. Các vòng chỉ kim tuyến quấn cổ phao & chân bầu phao sắc sảo (Thay cho vòng Torus thô bị lệch bán kính!)
    const drawBand = (y, h, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, y, 512, h);
    };
    // Đai cổ vai bầu phao (báo sát mực nước cân phao)
    drawBand(176, 8, p.bandGold);
    drawBand(184, 5, '#09090b');
    drawBand(189, 12, p.bandMain);
    drawBand(201, 5, '#09090b');
    drawBand(206, 7, p.bandGold);

    // Đai mảnh trang trí bụng bầu
    drawBand(480, 4, p.bandGold);
    drawBand(484, 9, p.bandMain);
    drawBand(493, 4, p.bandGold);

    // Đai chỉ dù quấn gia cố đáy bầu xuống chân carbon
    drawBand(778, 7, p.bandGold);
    drawBand(785, 10, p.bandMain);
    drawBand(795, 7, p.bandGold);

    // 4. Vệt phản quang dọc như lớp phủ bóng sơn mài 8 lớp
    const specGrad = ctx.createLinearGradient(0, 0, 512, 0);
    specGrad.addColorStop(0.0, 'rgba(255,255,255,0.0)');
    specGrad.addColorStop(0.22, 'rgba(255,255,255,0.34)');
    specGrad.addColorStop(0.30, 'rgba(255,255,255,0.05)');
    specGrad.addColorStop(0.75, 'rgba(0,0,0,0.14)');
    specGrad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = specGrad;
    ctx.fillRect(0, 0, 512, 1024);

    // 5. Tem chữ khắc nhũ tinh tế trên bầu phao
    ctx.fillStyle = p.textCol;
    ctx.font = 'bold 28px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.brand, 256, 385);
    ctx.fillStyle = p.bandMain === '#fde047' ? '#fde047' : (p.fiber === 'CARBON' ? '#38bdf8' : '#b91c1c');
    ctx.font = 'bold 24px "Segoe UI", sans-serif';
    ctx.fillText(p.spec, 256, 428);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

// 12. Tạo Texture Đám Mây Bồng Bềnh Tự Nhiên (Volumetric Cumulus Cloud Puff - Viền mờ mềm mại, đỉnh trắng nắng, đáy xám bạc)
export function createSoftCloudPuffTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 256);

    // Các khối bông mây chồng lớp mềm mại (Soft overlapping radial puffs)
    const lobes = [
        { x: 128, y: 120, r: 92, alpha: 0.55 },
        { x: 86, y: 132, r: 72, alpha: 0.48 },
        { x: 170, y: 130, r: 74, alpha: 0.48 },
        { x: 112, y: 92, r: 68, alpha: 0.52 },
        { x: 148, y: 98, r: 64, alpha: 0.50 },
        { x: 64, y: 146, r: 52, alpha: 0.36 },
        { x: 192, y: 146, r: 52, alpha: 0.36 }
    ];

    lobes.forEach(l => {
        const grad = ctx.createRadialGradient(l.x, l.y - l.r * 0.18, l.r * 0.08, l.x, l.y, l.r);
        grad.addColorStop(0.0, `rgba(255, 255, 255, ${l.alpha})`);
        grad.addColorStop(0.45, `rgba(248, 250, 252, ${l.alpha * 0.78})`);
        grad.addColorStop(0.75, `rgba(226, 232, 240, ${l.alpha * 0.35})`);
        grad.addColorStop(1.0, 'rgba(226, 232, 240, 0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
        ctx.fill();
    });

    // Ánh nắng mặt trời chiếu sáng phần đỉnh mây và bóng râm nhẹ phần chân mây
    ctx.globalCompositeOperation = 'source-atop';
    const verticalShade = ctx.createLinearGradient(0, 35, 0, 205);
    verticalShade.addColorStop(0.0, 'rgba(255, 253, 245, 0.35)');
    verticalShade.addColorStop(0.65, 'rgba(241, 245, 249, 0.05)');
    verticalShade.addColorStop(1.0, 'rgba(148, 163, 184, 0.38)');
    ctx.fillStyle = verticalShade;
    ctx.fillRect(0, 0, 256, 256);
    ctx.globalCompositeOperation = 'source-over';

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

// 14. Tạo Texture Nền Bê Tông Xoa Phẳng Đổ Mẻ Có Khe Co Giãn & Vệt Cát Bụi Hồ Câu
export function createConcreteGroundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Nền xám xi măng bê tông chuẩn Việt Nam
    ctx.fillStyle = '#8a929a';
    ctx.fillRect(0, 0, 512, 512);

    // Hạt cát sỏi thô và vệt xoa mẻ bê tông
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
        const noise = (Math.random() - 0.5) * 26;
        d[i] = Math.min(255, Math.max(0, d[i] + noise));
        d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + noise));
        d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // Các đường cắt khe co giãn bê tông ô 256x256
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.stroke();

    // Vệt rêu ẩm & ố nước mưa ven mép bê tông
    for (let r = 0; r < 35; r++) {
        const rx = Math.random() * 512;
        const ry = Math.random() * 512;
        const rad = 15 + Math.random() * 45;
        const grad = ctx.createRadialGradient(rx, ry, 2, rx, ry, rad);
        grad.addColorStop(0, 'rgba(84, 98, 80, 0.22)');
        grad.addColorStop(1, 'rgba(84, 98, 80, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(rx, ry, rad, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 16);
    return texture;
}

// 15. Tạo Texture Mặt Đường Thảm Nhựa Đường Asphalt (Atphan) Màu Xám Đen Nhám Có Vạch Sơn Vàng/Trắng
export function createAsphaltRoadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Nền nhựa đường bitum màu xám than đen
    ctx.fillStyle = '#23272d';
    ctx.fillRect(0, 0, 512, 512);

    // Hạt đá dăm li ti trộn nhựa đường (Aggregate particles)
    for (let i = 0; i < 9000; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const tone = Math.floor(Math.random() * 65);
        ctx.fillStyle = `rgb(${45 + tone}, ${48 + tone}, ${52 + tone})`;
        ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }

    // Các vệt lốp xe mài & bụi đất cát vàng ven đường hồ
    for (let b = 0; b < 18; b++) {
        const by = Math.random() * 512;
        ctx.fillStyle = 'rgba(161, 98, 7, 0.06)';
        ctx.fillRect(0, by, 512, 12 + Math.random() * 24);
    }

    // Đường gân nối thảm nhựa áp-phan
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 2);
    return texture;
}

// 16. Tạo Texture Ruộng Lúa Quê Việt Nam Đa Dạng Các Thời Kỳ (Xanh Mướt, Mạ Non & Chín Vàng)
export function createRicePaddyFieldTexture(stage = 'LUSH_GREEN') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    let baseColor, rowColor, highlightColor;
    if (stage === 'GOLDEN_RIPE') {
        baseColor = '#d97706'; // Vàng rơm hổ phách
        rowColor = '#ca8a04';  // Vàng lúa trĩu bông
        highlightColor = '#fef08a'; // Óng ánh nắng vàng
    } else if (stage === 'YOUNG_GREEN') {
        baseColor = '#65a30d'; // Mạ non xanh nõn chuối
        rowColor = '#84cc16';
        highlightColor = '#bef264';
    } else { // 'LUSH_GREEN'
        baseColor = '#15803d'; // Lúa xanh thì con gái mướt mát
        rowColor = '#166534';
        highlightColor = '#4ade80';
    }

    // Đổ nền đất bùn / gốc rạ
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 512, 512);

    // Kẻ các hàng luống lúa cấy thẳng tắp kiểu nông thôn Việt Nam
    const numRows = 24;
    const rowH = 512 / numRows;
    for (let r = 0; r < numRows; r++) {
        const y = r * rowH;
        // Rãnh lúa hơi tối hơn
        ctx.fillStyle = rowColor;
        ctx.fillRect(0, y + 2, 512, rowH - 4);

        // Hàng khóm lúa nhô lên
        for (let x = 4; x < 512; x += 10 + Math.random() * 4) {
            ctx.fillStyle = highlightColor;
            ctx.beginPath();
            ctx.ellipse(x, y + rowH * 0.5, 3 + Math.random() * 2, 5 + Math.random() * 3, 0.1, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Vệt gió lướt sóng lúa rập rờn
    for (let w = 0; w < 12; w++) {
        const wy = Math.random() * 512;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.beginPath();
        ctx.ellipse(256, wy, 240, 16, Math.PI / 18, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(12, 12);
    return texture;
}



