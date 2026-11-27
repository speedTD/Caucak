// Bộ Render Đồ Họa Mô Hình Đồ Câu • Phao Câu • Bộ Trục Thẻo & Bể Cân Phao Thực Tế (SVG 3D-Shaded Chuẩn Tiệm Đồ Câu VN)

function hexNumToCss(num, fallback = '#38bdf8') {
    if (typeof num === 'string') return num;
    if (typeof num !== 'number' || Number.isNaN(num)) return fallback;
    return '#' + num.toString(16).padStart(6, '0');
}

// 1. VẼ MÔ HÌNH CẦN CÂU ĐÀI KHỚP RÚT 5 LÓNG (Vân Carbon X-Toray / Đốt Trúc + Tay Cầm Chỉ Dù + Đối Trọng Inox + Dây Dù Đỏ Lillian)
export function renderRodModelSVG(rod = {}, width = 180, height = 56) {
    const uid = `rod_${Math.random().toString(36).slice(2, 8)}`;
    const cMain = hexNumToCss(rod.rodColor, '#1e293b');
    const cAcc = hexNumToCss(rod.accentColor, '#facc15');
    const cSec = hexNumToCss(rod.secondaryAccent, '#ef4444');
    const cGrip = hexNumToCss(rod.gripColor, '#0f172a');
    const isBamboo = (rod.id && rod.id.includes('truc')) || (rod.name && rod.name.toLowerCase().includes('trúc'));

    return `
    <svg viewBox="0 0 220 62" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;">
        <defs>
            <linearGradient id="${uid}_blank" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
                <stop offset="28%" stop-color="${cMain}"/>
                <stop offset="72%" stop-color="${cMain}"/>
                <stop offset="100%" stop-color="#020617" stop-opacity="0.85"/>
            </linearGradient>
            <linearGradient id="${uid}_grip" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#475569"/>
                <stop offset="35%" stop-color="${cGrip}"/>
                <stop offset="100%" stop-color="#020617"/>
            </linearGradient>
            <linearGradient id="${uid}_metal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#fef9c3"/>
                <stop offset="45%" stop-color="${cAcc}"/>
                <stop offset="100%" stop-color="#78350f"/>
            </linearGradient>
            <pattern id="${uid}_weave" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                <rect width="8" height="8" fill="none"/>
                <line x1="0" y1="0" x2="8" y2="0" stroke="rgba(255,255,255,0.18)" stroke-width="1.6"/>
                <line x1="0" y1="4" x2="8" y2="4" stroke="rgba(0,0,0,0.25)" stroke-width="1.6"/>
            </pattern>
        </defs>

        <!-- Bóng đổ mềm dưới thân cần -->
        <ellipse cx="110" cy="48" rx="98" ry="4" fill="rgba(0,0,0,0.35)"/>

        <!-- Khuyên D móc dây bảo hiểm ở đít cần -->
        <path d="M 10 27 C 4 27, 4 35, 10 35" fill="none" stroke="#facc15" stroke-width="1.8"/>
        <!-- Đối trọng Inox CNC đít cần -->
        <rect x="10" y="24.5" width="7" height="13" rx="2" fill="#e2e8f0" stroke="#475569" stroke-width="0.8"/>
        <rect x="16.5" y="24.2" width="2.5" height="13.6" fill="url(#${uid}_metal)"/>

        <!-- Tay cầm cuốn chỉ dù / màng co nhiệt gân xoắn -->
        <path d="M 19 24.5 L 66 25.4 L 66 36.6 L 19 37.5 Z" fill="url(#${uid}_grip)" stroke="rgba(255,255,255,0.15)" stroke-width="0.6"/>
        <path d="M 19 24.5 L 66 25.4 L 66 36.6 L 19 37.5 Z" fill="url(#${uid}_weave)"/>
        <!-- Vòng nhẫn silicon chặn cần -->
        <rect x="57" y="23.2" width="4.2" height="15.6" rx="2" fill="${cSec}" stroke="#ffffff" stroke-width="0.5"/>
        <rect x="65.5" y="25.0" width="3" height="12.0" fill="url(#${uid}_metal)"/>

        <!-- Lóng 1 (Lóng gốc sơn thương hiệu) -->
        <path d="M 68.5 25.5 L 106 26.6 L 106 35.4 L 68.5 36.5 Z" fill="url(#${uid}_blank)"/>
        ${!isBamboo ? `<path d="M 68.5 25.5 L 106 26.6 L 106 35.4 L 68.5 36.5 Z" fill="url(#${uid}_weave)"/>` : ''}
        <polygon points="75,25.7 88,26.1 84,35.9 71,36.3" fill="${cAcc}" opacity="0.78"/>
        <polygon points="89,26.1 93,26.2 90,35.8 86,35.9" fill="${cSec}" opacity="0.9"/>
        <!-- Đai kim loại chống nổ lóng 1 -->
        <rect x="104" y="26.3" width="3.2" height="9.4" rx="0.6" fill="url(#${uid}_metal)"/>

        <!-- Lóng 2 -->
        <path d="M 107.2 27.1 L 140 28.0 L 140 34.0 L 107.2 34.9 Z" fill="url(#${uid}_blank)"/>
        <rect x="137.5" y="27.8" width="2.8" height="6.4" rx="0.5" fill="url(#${uid}_metal)"/>

        <!-- Lóng 3 -->
        <path d="M 140.3 28.4 L 169 29.1 L 169 32.9 L 140.3 33.6 Z" fill="url(#${uid}_blank)"/>
        <rect x="166.8" y="28.9" width="2.5" height="4.2" rx="0.4" fill="url(#${uid}_metal)"/>

        <!-- Lóng 4 -->
        <path d="M 169.3 29.5 L 192 30.0 L 192 32.0 L 169.3 32.5 Z" fill="url(#${uid}_blank)"/>
        <rect x="190.2" y="29.8" width="2.0" height="2.4" fill="url(#${uid}_metal)"/>

        <!-- Lóng 5 (Đọt cần đặc mảnh + Đầu xoay 360° + Dây dù đỏ Lillian) -->
        <line x1="192.2" y1="31" x2="207" y2="31" stroke="#cbd5e1" stroke-width="1.5"/>
        <circle cx="207.5" cy="31" r="1.5" fill="#f8fafc" stroke="#475569" stroke-width="0.5"/>
        <path d="M 208.5 31 Q 214 32, 217 37" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="217" cy="37" r="1.4" fill="#dc2626"/>

        <!-- Vệt bóng kính Clearcoat dọc thân cần -->
        <line x1="20" y1="27.2" x2="190" y2="30.2" stroke="rgba(255,255,255,0.42)" stroke-width="0.9"/>

        <!-- Nhãn thông số mini góc phải trên -->
        <text x="214" y="16" text-anchor="end" fill="#cbd5e1" font-size="9.5" font-weight="700">${rod.length ? rod.length + 'm' : ''} ${rod.hardness ? '• ' + rod.hardness : ''}</text>
    </svg>`;
}

// 2. VẼ MÔ HÌNH PHAO CÂU ĐÀI CHÂN THỰC 1:1 (5 Dáng Bầu: Quả Trám / Giọt Nước / Cỏ Sậy / Lông Công / LED Hố Đấu)
export function renderFloatModelSVG(flt = {}, width = 64, height = 128) {
    const uid = `flt_${Math.random().toString(36).slice(2, 8)}`;
    const shape = flt.shape || 'DIAMOND';
    const marks = flt.tipMarks || flt.visibleMarks || 11;
    const isLed = !!flt.ledBiteColor;

    const paletteMap = {
        DIAMOND: { top: '#ff3b1f', mid: '#f8fafc', bot: '#94a3b8', band: '#dc2626' },
        TEARDROP: { top: '#fb923c', mid: '#38bdf8', bot: '#0369a1', band: '#facc15' },
        SLIM_REED: { top: '#dc2626', mid: '#f3d999', bot: '#a16207', band: '#991b1b' },
        PEACOCK_LONG: { top: '#ef4444', mid: '#10b981', bot: '#065f46', band: '#fde047' },
        SHORT_HEAVY: { top: '#00ffaa', mid: '#312e81', bot: '#0f172a', band: '#38bdf8' }
    };
    const pal = paletteMap[shape] || paletteMap.DIAMOND;

    // Biên dạng bầu phao chuẩn từng dáng (tọa độ tâm X = 32, Y từ 54 -> 96)
    let bodyPath = '';
    let bandY1 = 60, bandW1 = 7, bandY2 = 75, bandW2 = 10;
    if (shape === 'DIAMOND') {
        bodyPath = 'M 32 54 C 41 63, 43 76, 32 95 C 21 76, 23 63, 32 54 Z';
        bandY1 = 61; bandW1 = 6.2; bandY2 = 74; bandW2 = 8.4;
    } else if (shape === 'TEARDROP') {
        bodyPath = 'M 32 54 C 45 58, 43 73, 32 96 C 21 73, 19 58, 32 54 Z';
        bandY1 = 60; bandW1 = 8.8; bandY2 = 73; bandW2 = 7.6;
    } else if (shape === 'SLIM_REED') {
        bodyPath = 'M 32 52 C 37.5 60, 37.5 82, 32 98 C 26.5 82, 26.5 60, 32 52 Z';
        bandY1 = 59; bandW1 = 4.2; bandY2 = 75; bandW2 = 4.6;
    } else if (shape === 'PEACOCK_LONG') {
        bodyPath = 'M 32 52 C 40 58, 40 82, 32 97 C 24 82, 24 58, 32 52 Z';
        bandY1 = 59; bandW1 = 6.2; bandY2 = 75; bandW2 = 6.8;
    } else {
        // SHORT_HEAVY
        bodyPath = 'M 32 58 C 46 63, 46 79, 32 90 C 18 79, 18 63, 32 58 Z';
        bandY1 = 64; bandW1 = 9.2; bandY2 = 75; bandW2 = 10.2;
    }

    // Vẽ từng nấc tăm phao quang học từ Y=52 đi lên Y=6
    const tipStartY = 51;
    const tipTotalH = 44;
    const segH = tipTotalH / marks;
    const tipThick = (flt.tipRadius && flt.tipRadius >= 0.006) ? 3.2 : 2.1;
    let tipBarsSvg = '';
    for (let i = 0; i < marks; i++) {
        const yBottom = tipStartY - i * segH;
        const yTop = yBottom - segH * 0.80;
        const isTop = i >= marks - 2;
        const w = isTop ? tipThick * 1.45 : tipThick;
        let col = '#ff2200';
        if (isLed) {
            col = (i % 2 === 0) ? '#00ffaa' : '#38bdf8';
        } else {
            if (i % 3 === 1) col = '#facc15';
            if (i % 3 === 2) col = '#22c55e';
            if (i === marks - 1) col = '#ff2a00';
        }
        tipBarsSvg += `<rect x="${(32 - w / 2).toFixed(2)}" y="${yTop.toFixed(2)}" width="${w.toFixed(2)}" height="${(segH * 0.80).toFixed(2)}" rx="${(w * 0.35).toFixed(2)}" fill="${col}"/>`;
        tipBarsSvg += `<rect x="${(32 - w * 0.42).toFixed(2)}" y="${(yBottom - segH * 0.20).toFixed(2)}" width="${(w * 0.84).toFixed(2)}" height="${(segH * 0.20).toFixed(2)}" fill="#09090b"/>`;
    }

    return `
    <svg viewBox="0 0 64 132" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;">
        <defs>
            <linearGradient id="${uid}_body" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="${pal.top}"/>
                <stop offset="28%" stop-color="${pal.mid}"/>
                <stop offset="72%" stop-color="${pal.mid}"/>
                <stop offset="100%" stop-color="${pal.bot}"/>
            </linearGradient>
            <linearGradient id="${uid}_shine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
                <stop offset="30%" stop-color="#ffffff" stop-opacity="0.55"/>
                <stop offset="52%" stop-color="#ffffff" stop-opacity="0"/>
                <stop offset="100%" stop-color="#000000" stop-opacity="0.28"/>
            </linearGradient>
            ${isLed ? `<filter id="${uid}_glow"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : ''}
        </defs>

        <!-- Chân phao carbon đặc thuôn dài -->
        <line x1="32" y1="92" x2="32" y2="122" stroke="#1e293b" stroke-width="2.1" stroke-linecap="round"/>
        <line x1="31.5" y1="92" x2="31.5" y2="122" stroke="rgba(255,255,255,0.28)" stroke-width="0.6"/>

        <!-- Chân cắm phao silicon đỏ 3 ngấn & khóa link đồng xoay -->
        <rect x="30.0" y="118" width="4.0" height="7.5" rx="1.4" fill="#dc2626" stroke="#fca5a5" stroke-width="0.4"/>
        <line x1="29.6" y1="120.2" x2="34.4" y2="120.2" stroke="#991b1b" stroke-width="0.8"/>
        <line x1="29.6" y1="122.8" x2="34.4" y2="122.8" stroke="#991b1b" stroke-width="0.8"/>
        <circle cx="32" cy="127.8" r="1.9" fill="none" stroke="#facc15" stroke-width="1.2"/>

        <!-- Thân bầu phao sơn mài bóng Piano -->
        <path d="${bodyPath}" fill="url(#${uid}_body)" stroke="rgba(255,255,255,0.32)" stroke-width="0.7"/>
        <!-- Đai chỉ kim tuyến cổ & bụng bầu phao -->
        <line x1="${32 - bandW1}" y1="${bandY1}" x2="${32 + bandW1}" y2="${bandY1}" stroke="#facc15" stroke-width="1.6"/>
        <line x1="${32 - bandW2}" y1="${bandY2}" x2="${32 + bandW2}" y2="${bandY2}" stroke="${pal.band}" stroke-width="2.0"/>
        <line x1="${32 - bandW2}" y1="${bandY2 - 1.5}" x2="${32 + bandW2}" y2="${bandY2 - 1.5}" stroke="#facc15" stroke-width="0.8"/>
        <!-- Phản quang kính sơn mài -->
        <path d="${bodyPath}" fill="url(#${uid}_shine)"/>

        <!-- Cổ keo chỉ dù gia cố chân tăm -->
        <path d="M 29.8 54 L 34.2 54 L 33.3 50.5 L 30.7 50.5 Z" fill="#b91c1c" stroke="#facc15" stroke-width="0.6"/>

        <!-- Tăm phao sợi quang học dạ quang -->
        <g ${isLed ? `filter="url(#${uid}_glow)"` : ''}>
            ${tipBarsSvg}
        </g>
    </svg>`;
}

// 3. VẼ MÔ HÌNH CUỘN TRỤC / HỘP THẺO FLUOROCARBON CAO CẤP
export function renderLineSpoolSVG(tierOrSpec = {}, isLeader = false, width = 76, height = 76) {
    const col = hexNumToCss(tierOrSpec.lineColor, isLeader ? '#38bdf8' : '#facc15');
    const label = tierOrSpec.label ? `${tierOrSpec.label}` : (tierOrSpec.level ? `Lv.${tierOrSpec.level}` : '2.0');
    return `
    <svg viewBox="0 0 84 84" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
        <!-- Vỏ cuộn trục EVA / Nhựa CNC nhiều lớp -->
        <circle cx="42" cy="42" r="36" fill="#0f172a" stroke="#475569" stroke-width="2"/>
        <circle cx="42" cy="42" r="31" fill="none" stroke="${col}" stroke-width="6" stroke-opacity="0.85"/>
        <circle cx="42" cy="42" r="28" fill="none" stroke="#ffffff" stroke-width="0.8" stroke-dasharray="6 4" opacity="0.6"/>
        <circle cx="42" cy="42" r="23" fill="#1e293b" stroke="#94a3b8" stroke-width="1.2"/>
        <!-- Tem thương hiệu ở tâm cuộn cước -->
        <circle cx="42" cy="42" r="16" fill="#020617" stroke="${col}" stroke-width="1"/>
        <text x="42" y="39" text-anchor="middle" fill="#94a3b8" font-size="7.5" font-weight="700">${isLeader ? 'FLUORO' : 'MAIN LINE'}</text>
        <text x="42" y="50" text-anchor="middle" fill="${col}" font-size="11" font-weight="900">${label}</text>
        <!-- Hạt chặn silicon & Chì lá đính kèm trên cuộn trục -->
        ${!isLeader ? `
            <rect x="68" y="18" width="7" height="14" rx="2" fill="#94a3b8" stroke="#e2e8f0" stroke-width="0.8"/>
            <ellipse cx="71.5" cy="38" rx="3" ry="1.8" fill="#ef4444"/>
            <ellipse cx="71.5" cy="43" rx="3" ry="1.8" fill="#ef4444"/>
        ` : `
            <path d="M 69 22 L 69 36 C 69 41, 63 41, 63 36 L 64.5 34" fill="none" stroke="#facc15" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M 75 28 L 75 42 C 75 47, 69 47, 69 42 L 70.5 40" fill="none" stroke="#facc15" stroke-width="1.6" stroke-linecap="round"/>
        `}
    </svg>`;
}

// 4. VẼ MÔ HÌNH 7 HẠNG MỤC TRANG BỊ TRONG XƯỞNG ĐỒ CÂU
export function renderEquipmentPreviewSVG(categoryKey, tier = {}) {
    if (categoryKey === 'rod') {
        return renderRodModelSVG(tier, 176, 54);
    }
    if (categoryKey === 'float') {
        return renderFloatModelSVG(tier, 56, 108);
    }
    if (categoryKey === 'line') {
        return renderLineSpoolSVG(tier, false, 78, 78);
    }
    if (categoryKey === 'rodRest') {
        const boomCol = hexNumToCss(tier.boomColor, '#334155');
        const headCol = hexNumToCss(tier.headColor, '#dc2626');
        const tipCol = hexNumToCss(tier.tipColor, '#facc15');
        return `
        <svg viewBox="0 0 170 64" width="160" height="58" xmlns="http://www.w3.org/2000/svg">
            <!-- Thân gác cần rút carbon -->
            <line x1="14" y1="50" x2="128" y2="30" stroke="${boomCol}" stroke-width="5.5" stroke-linecap="round"/>
            <line x1="14" y1="49" x2="128" y2="29" stroke="rgba(255,255,255,0.35)" stroke-width="1.2"/>
            <rect x="68" y="37" width="7" height="7" transform="rotate(-10 71 40)" fill="#f59e0b"/>
            <!-- Đầu gác sừng hươu chữ V có 2 con lăn silicon -->
            <path d="M 122 12 Q 134 38, 152 14" fill="none" stroke="${headCol}" stroke-width="4.2" stroke-linecap="round"/>
            <circle cx="122" cy="12" r="3.8" fill="${tipCol}"/>
            <circle cx="152" cy="14" r="3.8" fill="${tipCol}"/>
            <ellipse cx="131" cy="24" rx="3.2" ry="5.5" transform="rotate(-24 131 24)" fill="#38bdf8"/>
            <ellipse cx="143" cy="24" rx="3.2" ry="5.5" transform="rotate(24 143 24)" fill="#38bdf8"/>
        </svg>`;
    }
    if (categoryKey === 'baitPad') {
        const rimCol = hexNumToCss(tier.rimColor, '#94a3b8');
        const inCol = hexNumToCss(tier.innerColor, '#0284c7');
        const layers = tier.trayLayers || 1;
        return `
        <svg viewBox="0 0 140 80" width="124" height="70" xmlns="http://www.w3.org/2000/svg">
            <!-- Tay đòn & Trục xoay Inox CNC kẹp thùng -->
            <line x1="18" y1="62" x2="62" y2="56" stroke="#cbd5e1" stroke-width="3.5" stroke-linecap="round"/>
            <rect x="59" y="34" width="6" height="36" rx="2" fill="#e2e8f0"/>
            <rect x="56" y="66" width="12" height="5" rx="2" fill="#0f172a"/>
            <!-- Tầng 2: Khay mồi xả đầy ắp -->
            ${layers >= 2 ? `
                <ellipse cx="98" cy="54" rx="26" ry="11" fill="#0f172a" stroke="${rimCol}" stroke-width="2"/>
                <ellipse cx="98" cy="52" rx="21" ry="8.5" fill="#b45309"/>
                <circle cx="91" cy="51" r="1.8" fill="#fde047"/>
                <circle cx="103" cy="53" r="1.8" fill="#fde047"/>
                <circle cx="97" cy="49" r="1.8" fill="#fde047"/>
            ` : ''}
            <!-- Tầng 3: Khay bột tơ nhện Inox -->
            ${layers >= 3 ? `
                <ellipse cx="32" cy="54" rx="21" ry="9" fill="#cbd5e1" stroke="#f8fafc" stroke-width="1.8"/>
                <ellipse cx="32" cy="53" rx="16" ry="6.5" fill="#fef9c3"/>
            ` : ''}
            <!-- Cốc nước trong suốt chấm tay vê mồi -->
            <ellipse cx="116" cy="28" rx="10" ry="4.5" fill="rgba(56,189,248,0.45)" stroke="#e2e8f0" stroke-width="1.6"/>
            <path d="M 106 28 L 108 40 C 109 43, 123 43, 124 40 L 126 28" fill="rgba(56,189,248,0.35)" stroke="#bae6fd" stroke-width="1.2"/>
            <!-- Đĩa từ tầng 1 + Tâm nam châm + 10 viên mồi vê tròn đồng tâm -->
            <ellipse cx="62" cy="28" rx="37" ry="15.5" fill="${inCol}" stroke="${rimCol}" stroke-width="3"/>
            <ellipse cx="62" cy="28" rx="10" ry="4.2" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1"/>
            <circle cx="42" cy="26" r="3.8" fill="#d97706"/>
            <circle cx="48" cy="33" r="3.8" fill="#ea580c"/>
            <circle cx="58" cy="36" r="3.8" fill="#d97706"/>
            <circle cx="70" cy="35" r="3.8" fill="#eab308"/>
            <circle cx="80" cy="31" r="3.8" fill="#d97706"/>
            <circle cx="82" cy="24" r="3.8" fill="#ea580c"/>
            <circle cx="72" cy="19" r="3.8" fill="#eab308"/>
            <circle cx="58" cy="18" r="3.8" fill="#d97706"/>
            <circle cx="46" cy="20" r="3.8" fill="#eab308"/>
            ${tier.hasCover ? `<path d="M 25 25 A 37 15.5 0 0 1 99 25" fill="none" stroke="#facc15" stroke-width="3.5"/>` : ''}
        </svg>`;
    }
    if (categoryKey === 'box') {
        const boxCol = hexNumToCss(tier.boxColor, '#334155');
        const accCol = hexNumToCss(tier.accentColor, '#38bdf8');
        return `
        <svg viewBox="0 0 120 84" width="106" height="74" xmlns="http://www.w3.org/2000/svg">
            ${tier.hasLegs ? `
                <rect x="22" y="22" width="4" height="54" rx="1.5" fill="#e2e8f0"/>
                <rect x="94" y="22" width="4" height="54" rx="1.5" fill="#e2e8f0"/>
                <ellipse cx="24" cy="76" rx="6" ry="2.2" fill="${accCol}"/>
                <ellipse cx="96" cy="76" rx="6" ry="2.2" fill="${accCol}"/>
            ` : ''}
            <!-- Thân thùng câu 36L + Đệm ngồi EVA 3 múi + Tựa lưng + Khóa Inox -->
            <rect x="34" y="6" width="52" height="10" rx="2.5" fill="${accCol}" opacity="0.9"/>
            <rect x="26" y="26" width="68" height="40" rx="5" fill="${boxCol}" stroke="#94a3b8" stroke-width="1.5"/>
            <rect x="24" y="19" width="72" height="9" rx="3" fill="${accCol}"/>
            <rect x="31" y="14" width="18" height="5" rx="1.5" fill="#0f172a"/>
            <rect x="51" y="14" width="18" height="5" rx="1.5" fill="#0f172a"/>
            <rect x="71" y="14" width="18" height="5" rx="1.5" fill="#0f172a"/>
            <rect x="38" y="34" width="7" height="11" rx="1.5" fill="#e2e8f0"/>
            <rect x="75" y="34" width="7" height="11" rx="1.5" fill="#e2e8f0"/>
        </svg>`;
    }
    // umbrella: Ô câu đài vòm cong Parabol 12 nan + Diềm rủ + Khớp lò xo bẻ nghiêng cổ ô
    const canCol = hexNumToCss(tier.canopyColor, '#0284c7');
    const trimCol = hexNumToCss(tier.trimColor, '#facc15');
    return `
    <svg viewBox="0 0 130 90" width="112" height="78" xmlns="http://www.w3.org/2000/svg">
        <!-- Trục hợp kim + Khớp lò xo nghiêng cổ ô -->
        <line x1="65" y1="38" x2="65" y2="85" stroke="#e2e8f0" stroke-width="3.2" stroke-linecap="round"/>
        <rect x="62" y="54" width="6" height="9" rx="2" fill="#f59e0b"/>
        <!-- Nan chống dưới vòm -->
        <line x1="65" y1="48" x2="36" y2="36" stroke="#94a3b8" stroke-width="1.3"/>
        <line x1="65" y1="48" x2="94" y2="36" stroke="#94a3b8" stroke-width="1.3"/>
        <!-- Vòm ô Parabol + Nan múi + Diềm rủ uốn lượn -->
        <path d="M 12 40 C 26 13, 104 13, 118 40 L 118 46 L 12 46 Z" fill="${canCol}" stroke="${trimCol}" stroke-width="1.8"/>
        <path d="M 65 14 Q 44 24, 34 45" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.1"/>
        <path d="M 65 14 Q 86 24, 96 45" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.1"/>
        <line x1="65" y1="14" x2="65" y2="45" stroke="rgba(255,255,255,0.32)" stroke-width="1.1"/>
        <line x1="12" y1="45" x2="118" y2="45" stroke="${trimCol}" stroke-width="2.4"/>
        ${tier.doubleLayer ? `<path d="M 38 24 C 48 10, 82 10, 92 24 Z" fill="${trimCol}" stroke="#ffffff" stroke-width="1"/>` : ''}
        <!-- Chóp thu lôi trên đỉnh ô -->
        <polygon points="62,14 68,14 65,6" fill="${trimCol}"/>
    </svg>`;
}

// 5. VẼ MÔ HÌNH VẬT PHẨM TRONG TIỆM ĐỒ CÂU (Chai Tinh Mùi • Rượu Thuốc Bắc • Nước Xanh • Bắp Ngô • Rổ Ốc • Bao Cám 1kg)
export function renderShopItemSVG(item = {}) {
    if (item.category === 'rod') {
        const cMap = item.hardness === '8H' ? 0x09090b : (item.hardness === '6H' ? 0x0f5c5c : (item.hardness === '5H' ? 0x1a3a2f : 0x7f1d1d));
        return renderRodModelSVG({ rodColor: cMap, accentColor: 0xfacc15, secondaryAccent: 0xef4444, length: item.length, hardness: item.hardness }, 132, 46);
    }
    if (item.category === 'float') {
        if (item.id === 'float_ho_dau' || item.isHoDauFloat) {
            return `
            <svg viewBox="0 0 56 96" width="50" height="88" xmlns="http://www.w3.org/2000/svg">
                <!-- Tăm rỗng ngắn 4 nấc to bản chuyên Hố Đấu -->
                <rect x="25.2" y="6" width="5.6" height="5.5" rx="2" fill="#ff2a00"/>
                <rect x="25.5" y="12.5" width="5.0" height="5.2" rx="1" fill="#facc15"/>
                <rect x="25.6" y="18.7" width="4.8" height="5.2" rx="1" fill="#00ff66"/>
                <rect x="25.8" y="24.9" width="4.4" height="5.2" rx="1" fill="#ff5500"/>
                <!-- Bầu ngắn mập trọng tâm thấp sơn đỏ đô carbon -->
                <ellipse cx="28" cy="40" rx="8.2" ry="10.5" fill="#991b1b" stroke="#facc15" stroke-width="1.3"/>
                <ellipse cx="26" cy="37" rx="2.4" ry="5.5" fill="rgba(255,255,255,0.28)"/>
                <!-- Chân Carbon siêu dài Hố Đấu + Chân cắm khóa đồng -->
                <line x1="28" y1="50.5" x2="28" y2="86" stroke="#0f172a" stroke-width="2.4" stroke-linecap="round"/>
                <rect x="26.2" y="83" width="3.6" height="5.5" rx="1" fill="#dc2626"/>
                <circle cx="28" cy="90.5" r="2" fill="none" stroke="#facc15" stroke-width="1.2"/>
            </svg>`;
        }
        const sh = item.id && item.id.includes('co') ? 'SLIM_REED' : (item.id && item.id.includes('led') ? 'SHORT_HEAVY' : 'TEARDROP');
        return renderFloatModelSVG({ shape: sh, tipMarks: item.visibleMarks || 11, ledBiteColor: sh === 'SHORT_HEAVY' }, 48, 86);
    }
    if (item.category === 'flavor') {
        // Chai Nước Xanh có vạch đong ml chuyên pha Ngô
        if (item.id === 'hl_nuoc_xanh' || item.flavorType === 'green_nectar') {
            return `
            <svg viewBox="0 0 64 88" width="54" height="74" xmlns="http://www.w3.org/2000/svg">
                <rect x="24" y="6" width="16" height="9" rx="2.5" fill="#10b981" stroke="#a7f3d0" stroke-width="0.9"/>
                <rect x="22" y="15" width="20" height="5" rx="1.5" fill="#065f46"/>
                <path d="M 23 20 L 41 20 L 46 30 L 46 77 C 46 80.5, 43 82.5, 39 82.5 L 25 82.5 C 21 82.5, 18 80.5, 18 77 L 18 30 Z" fill="rgba(209,250,229,0.18)" stroke="#6ee7b7" stroke-width="1.3"/>
                <path d="M 19.5 34 L 44.5 34 L 44.5 76 C 44.5 79, 42 81, 39 81 L 25 81 C 22 81, 19.5 79, 19.5 76 Z" fill="#10b981" opacity="0.88"/>
                <!-- Vạch chia ml -->
                <line x1="40" y1="42" x2="44" y2="42" stroke="#ecfdf5" stroke-width="1"/>
                <line x1="40" y1="52" x2="44" y2="52" stroke="#ecfdf5" stroke-width="1"/>
                <line x1="40" y1="62" x2="44" y2="62" stroke="#ecfdf5" stroke-width="1"/>
                <rect x="21" y="46" width="20" height="22" rx="2" fill="#022c22" stroke="#34d399" stroke-width="0.8"/>
                <text x="31" y="56" text-anchor="middle" fill="#6ee7b7" font-size="5.6" font-weight="800">NƯỚC XANH</text>
                <text x="31" y="64" text-anchor="middle" fill="#fde047" font-size="5.4" font-weight="700">5-10ml/10🌽</text>
                <line x1="22" y1="31" x2="22" y2="75" stroke="rgba(255,255,255,0.55)" stroke-width="1.5" stroke-linecap="round"/>
            </svg>`;
        }
        // Bầu / Chai Rượu Thuốc Bắc ngâm thảo mộc chuyên ủ Ốc
        if (item.id === 'hl_ruou_thuoc_bac' || item.flavorType === 'medicinal_wine') {
            return `
            <svg viewBox="0 0 64 88" width="54" height="74" xmlns="http://www.w3.org/2000/svg">
                <path d="M 24 7 L 40 7 L 38 15 L 26 15 Z" fill="#dc2626"/>
                <rect x="25" y="15" width="14" height="6" rx="1.5" fill="#facc15"/>
                <path d="M 26 21 C 16 28, 15 44, 21 53 C 14 62, 16 80, 26 82 L 38 82 C 48 80, 50 62, 43 53 C 49 44, 48 28, 38 21 Z" fill="#451a03" stroke="#f59e0b" stroke-width="1.3"/>
                <path d="M 22 40 C 17 50, 17 77, 26 80 L 38 80 C 47 77, 47 50, 42 40 Z" fill="#9a3412" opacity="0.9"/>
                <rect x="22" y="48" width="20" height="20" rx="2" transform="rotate(-2 32 58)" fill="#fef3c7" stroke="#b91c1c" stroke-width="1"/>
                <text x="32" y="57" text-anchor="middle" fill="#991b1b" font-size="6.0" font-weight="900">THUỐC BẮC</text>
                <text x="32" y="64" text-anchor="middle" fill="#78350f" font-size="5.3" font-weight="800">5-10ml/1kg</text>
            </svg>`;
        }
        // Chai tinh mùi có vạch chia ml chuyên pha Cám (Mật Khoai, Tương Sữa Thơm, Lục Hương, Sữa Ngô)
        const liquidColors = {
            sweet_corn: '#facc15',
            sweet_potato: '#ea580c',
            milky: '#fef9c3',
            herbal: '#10b981',
            fruity: '#fb7185',
            colostrum: '#fef3c7',
            wine_rice: '#fde047',
            monster_carp: '#ef4444'
        };
        const liq = liquidColors[item.flavorType] || '#f59e0b';
        return `
        <svg viewBox="0 0 64 88" width="54" height="74" xmlns="http://www.w3.org/2000/svg">
            <rect x="24" y="5" width="16" height="11" rx="3" fill="rgba(226,232,240,0.42)" stroke="#94a3b8" stroke-width="0.9"/>
            <rect x="23" y="16" width="18" height="6" rx="1.5" fill="#facc15"/>
            <path d="M 25 22 L 39 22 L 45 32 L 45 76 C 45 80, 42 82, 38 82 L 26 82 C 22 82, 19 80, 19 76 L 19 32 Z" fill="rgba(226,232,240,0.22)" stroke="#cbd5e1" stroke-width="1.4"/>
            <path d="M 20.5 38 L 43.5 38 L 43.5 75 C 43.5 78.5, 41 80.5, 38 80.5 L 26 80.5 C 23 80.5, 20.5 78.5, 20.5 75 Z" fill="${liq}" opacity="0.92"/>
            <!-- Vạch chia ml trên thân chai -->
            <line x1="40" y1="41" x2="44" y2="41" stroke="#f8fafc" stroke-width="1"/>
            <line x1="40" y1="50" x2="44" y2="50" stroke="#f8fafc" stroke-width="1"/>
            <line x1="40" y1="59" x2="44" y2="59" stroke="#f8fafc" stroke-width="1"/>
            <rect x="21" y="47" width="22" height="22" rx="2" fill="#0f172a" stroke="#facc15" stroke-width="0.8"/>
            <text x="32" y="57" text-anchor="middle" fill="#fde047" font-size="5.6" font-weight="800">NẮP ĐONG ML</text>
            <text x="32" y="65" text-anchor="middle" fill="#e2e8f0" font-size="5.6">${item.volume || '150ml'}</text>
            <line x1="23" y1="33" x2="23" y2="75" stroke="rgba(255,255,255,0.55)" stroke-width="1.6" stroke-linecap="round"/>
        </svg>`;
    }

    // Bắp Ngô Ngọt tươi (10k / 1 bắp)
    if (item.subType === 'CORN' || item.id === 'ngo_ngot') {
        return `
        <svg viewBox="0 0 72 88" width="58" height="72" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="36" cy="42" rx="14" ry="27" fill="#facc15" stroke="#ca8a04" stroke-width="1.4"/>
            <!-- Vạch hạt ngô ngọt -->
            <line x1="30" y1="18" x2="30" y2="64" stroke="#eab308" stroke-width="1.1"/>
            <line x1="36" y1="16" x2="36" y2="66" stroke="#eab308" stroke-width="1.1"/>
            <line x1="42" y1="18" x2="42" y2="64" stroke="#eab308" stroke-width="1.1"/>
            <line x1="23" y1="28" x2="49" y2="28" stroke="#ca8a04" stroke-width="1"/>
            <line x1="22" y1="38" x2="50" y2="38" stroke="#ca8a04" stroke-width="1"/>
            <line x1="23" y1="48" x2="49" y2="48" stroke="#ca8a04" stroke-width="1"/>
            <!-- Bẹ lá ngô xanh -->
            <path d="M 36 74 C 18 68, 14 44, 21 26 C 24 44, 28 58, 36 68 Z" fill="#16a34a" stroke="#4ade80" stroke-width="0.9"/>
            <path d="M 36 74 C 54 68, 58 44, 51 26 C 48 44, 44 58, 36 68 Z" fill="#15803d" stroke="#4ade80" stroke-width="0.9"/>
            <rect x="33" y="72" width="6" height="9" rx="2" fill="#166534"/>
            <text x="36" y="12" text-anchor="middle" fill="#fde047" font-size="7.2" font-weight="900">10K / BẮP</text>
        </svg>`;
    }

    // Ốc Vặn / Ốc Bươu tươi (20k / 1kg)
    if (item.subType === 'SNAIL' || (item.id && item.id.startsWith('oc_'))) {
        const isBuou = item.id === 'oc_buou';
        return `
        <svg viewBox="0 0 72 88" width="58" height="72" xmlns="http://www.w3.org/2000/svg">
            <!-- Rổ đựng ốc -->
            <path d="M 10 44 L 62 44 L 56 76 C 55 79, 51 81, 46 81 L 26 81 C 21 81, 17 79, 16 76 Z" fill="#0f766e" stroke="#5eead4" stroke-width="1.3"/>
            <ellipse cx="36" cy="44" rx="26" ry="7" fill="#134e4a" stroke="#5eead4" stroke-width="1.2"/>
            <!-- Những con ốc đầy ắp trong rổ -->
            ${isBuou ? `
                <circle cx="26" cy="41" r="7.5" fill="#44403c" stroke="#a8a29e" stroke-width="1"/>
                <circle cx="38" cy="39" r="8.2" fill="#292524" stroke="#d6d3d1" stroke-width="1"/>
                <circle cx="47" cy="43" r="7.0" fill="#57534e" stroke="#a8a29e" stroke-width="1"/>
                <circle cx="32" cy="45" r="6.8" fill="#1c1917" stroke="#a8a29e" stroke-width="0.9"/>
            ` : `
                <polygon points="24,31 29,45 19,45" fill="#52525b" stroke="#d4d4d8" stroke-width="0.9"/>
                <polygon points="36,28 42,45 30,45" fill="#3f3f46" stroke="#e4e4e7" stroke-width="0.9"/>
                <polygon points="48,32 53,46 43,46" fill="#52525b" stroke="#d4d4d8" stroke-width="0.9"/>
                <polygon points="31,34 36,47 26,47" fill="#27272a" stroke="#a1a1aa" stroke-width="0.8"/>
                <polygon points="42,35 47,47 37,47" fill="#27272a" stroke="#a1a1aa" stroke-width="0.8"/>
            `}
            <text x="36" y="64" text-anchor="middle" fill="#fef08a" font-size="7.4" font-weight="900">${isBuou ? 'ỐC BƯƠU' : 'ỐC VẶN'}</text>
            <text x="36" y="74" text-anchor="middle" fill="#ccfbf1" font-size="6.4" font-weight="700">20K / 1KG</text>
        </svg>`;
    }

    // Bao Cám Nền 1kg (Thơm / Tanh / Thơm Tanh — 35k / 1kg)
    const isTanh = item.id === 'cam_nen_tanh';
    const isThomTanh = item.id === 'cam_nen_thom_tanh';
    const bagCol = isTanh ? '#991b1b' : (isThomTanh ? '#b45309' : '#ca8a04');
    const tagTxt = isTanh ? 'CÁM TANH' : (isThomTanh ? 'THƠM TANH' : 'CÁM THƠM');
    return `
    <svg viewBox="0 0 72 88" width="58" height="72" xmlns="http://www.w3.org/2000/svg">
        <path d="M 14 12 L 58 12 L 62 80 L 10 80 Z" rx="4" fill="${bagCol}" stroke="#fde047" stroke-width="1.4"/>
        <rect x="14" y="17" width="44" height="3" fill="#facc15" opacity="0.85"/>
        <rect x="15" y="27" width="42" height="38" rx="4" fill="#0f172a" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>
        <circle cx="36" cy="40" r="7.5" fill="#f59e0b" opacity="0.92"/>
        <text x="36" y="54" text-anchor="middle" fill="#fef08a" font-size="6.3" font-weight="900">${tagTxt}</text>
        <text x="36" y="62" text-anchor="middle" fill="#7dd3fc" font-size="5.8" font-weight="800">1KG • 35K</text>
        <path d="M 16 14 L 22 78" stroke="rgba(255,255,255,0.22)" stroke-width="3"/>
    </svg>`;
}

// 5B. VẼ CHẬU TRỘN MỒI CÂU ĐÀI 3D TRỰC QUAN (Hiển thị trực tiếp Cám, Ốc, Ngô & Hương Liệu người chơi đã bỏ vào Chậu!)
export function renderMixingBasinSVG(currentMix = {}, analysis = {}) {
    const basin = currentMix.basinItems || {};
    const flavors = currentMix.flavors || {};
    const camKg = (basin.cam_nen_thom || 0) + (basin.cam_nen_tanh || 0) + (basin.cam_nen_thom_tanh || 0);
    const ocVanKg = basin.oc_van || 0;
    const ocBuouKg = basin.oc_buou || 0;
    const snailKg = ocVanKg + ocBuouKg;
    const cornCobs = basin.ngo_ngot || 0;
    const isEmpty = camKg <= 0 && snailKg <= 0 && cornCobs <= 0;

    const isOverdose = !!analysis.isFlavorOverdose;
    const isOptimal = analysis.ratioVerdict === 'OPTIMAL';
    const ruouDrops = flavors.hl_ruou_thuoc_bac || 0;
    const nuocXanhMl = flavors.hl_nuoc_xanh || 0;
    const camDrops = (flavors.hl_mat_khoai || 0) + (flavors.hl_tuong_sua_thom || 0) + (flavors.hl_luc_huong || 0) + (flavors.hl_sua_ngo || 0);

    // Màu lớp nền cám trong chậu
    let pasteFill = '#b45309';
    if ((basin.cam_nen_tanh || 0) > (basin.cam_nen_thom || 0) && (basin.cam_nen_tanh || 0) >= (basin.cam_nen_thom_tanh || 0)) {
        pasteFill = '#7c2d12';
    } else if ((basin.cam_nen_thom || 0) > (basin.cam_nen_thom_tanh || 0)) {
        pasteFill = '#d97706';
    }

    // Sinh các hạt Ngô Ngọt vàng ươm trong chậu
    let cornSvg = '';
    if (cornCobs > 0) {
        const count = Math.min(28, Math.max(8, cornCobs * 2));
        for (let i = 0; i < count; i++) {
            const ang = (i * 2.39996);
            const rad = Math.sqrt((i + 0.5) / count) * 58;
            const cx = (140 + Math.cos(ang) * rad).toFixed(1);
            const cy = (74 + Math.sin(ang) * (rad * 0.34)).toFixed(1);
            cornSvg += `<ellipse cx="${cx}" cy="${cy}" rx="5.2" ry="3.6" transform="rotate(${(i * 37) % 180} ${cx} ${cy})" fill="#facc15" stroke="#ca8a04" stroke-width="0.7"/>`;
        }
    }

    // Sinh các con Ốc Vặn / Ốc Bươu trong chậu
    let snailSvg = '';
    if (snailKg > 0) {
        const count = Math.min(22, Math.max(6, Math.round(snailKg * 9)));
        for (let i = 0; i < count; i++) {
            const ang = (i * 2.39996) + 0.6;
            const rad = Math.sqrt((i + 0.4) / count) * 56;
            const sx = 140 + Math.cos(ang) * rad;
            const sy = 73 + Math.sin(ang) * (rad * 0.34);
            const useBuou = ocBuouKg > 0 && (ocVanKg <= 0 || i % 2 === 0);
            if (useBuou) {
                snailSvg += `<g transform="translate(${sx.toFixed(1)},${sy.toFixed(1)})">
                    <circle cx="0" cy="0" r="6.2" fill="#3f3b37" stroke="#a8a29e" stroke-width="0.9"/>
                    <circle cx="-1.5" cy="-1.5" r="2.3" fill="none" stroke="#d6d3d1" stroke-width="0.7"/>
                </g>`;
            } else {
                snailSvg += `<polygon points="${(sx - 5).toFixed(1)},${(sy + 3).toFixed(1)} ${(sx + 5).toFixed(1)},${(sy + 3).toFixed(1)} ${sx.toFixed(1)},${(sy - 6).toFixed(1)}" fill="#52525b" stroke="#e4e4e7" stroke-width="0.8"/>`;
            }
        }
    }

    // Vệt tinh mùi rưới lên mặt mồi trong chậu
    let glazeSvg = '';
    if (nuocXanhMl > 0) {
        glazeSvg += `<ellipse cx="140" cy="73" rx="56" ry="18" fill="rgba(16, 185, 129, ${isOverdose ? '0.52' : '0.28'})" stroke="#34d399" stroke-dasharray="6 4" stroke-width="1.2"/>`;
    }
    if (ruouDrops > 0) {
        glazeSvg += `<ellipse cx="140" cy="74" rx="52" ry="16" fill="rgba(180, 83, 9, ${isOverdose ? '0.55' : '0.30'})" stroke="#f59e0b" stroke-dasharray="5 4" stroke-width="1.2"/>`;
    }
    if (camDrops > 0) {
        glazeSvg += `<path d="M 96 72 Q 118 62, 140 73 T 186 71" fill="none" stroke="#fef08a" stroke-width="3.2" stroke-linecap="round" opacity="0.78"/>`;
    }

    // Làn hương bay lên (Êm dịu nếu hợp lý, Đỏ gắt nếu quá liều nặng mùi!)
    const aromaColor = isOverdose ? '#ef4444' : (isOptimal ? '#4ade80' : '#7dd3fc');
    const aromaSvg = !isEmpty && (ruouDrops + nuocXanhMl + camDrops > 0) ? `
        <path d="M 105 56 Q 98 40, 107 24" fill="none" stroke="${aromaColor}" stroke-width="${isOverdose ? '2.8' : '1.8'}" stroke-linecap="round" opacity="0.85"/>
        <path d="M 140 52 Q 148 34, 138 18" fill="none" stroke="${aromaColor}" stroke-width="${isOverdose ? '3.2' : '2.0'}" stroke-linecap="round" opacity="0.9"/>
        <path d="M 175 56 Q 182 40, 173 24" fill="none" stroke="${aromaColor}" stroke-width="${isOverdose ? '2.8' : '1.8'}" stroke-linecap="round" opacity="0.85"/>
    ` : '';

    return `
    <svg viewBox="0 0 280 132" width="100%" height="126" xmlns="http://www.w3.org/2000/svg" style="display:block;">
        <defs>
            <linearGradient id="basinBodyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#0284c7"/>
                <stop offset="55%" stop-color="#0369a1"/>
                <stop offset="100%" stop-color="#0f172a"/>
            </linearGradient>
            <linearGradient id="basinInnerGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#082f49"/>
                <stop offset="100%" stop-color="#0c4a6e"/>
            </linearGradient>
        </defs>

        <!-- Bóng đổ mặt đất dưới đáy chậu -->
        <ellipse cx="140" cy="116" rx="92" ry="11" fill="rgba(0,0,0,0.45)"/>

        <!-- Thân ngoài chậu nhựa câu đài EVA có vành gân chịu lực -->
        <path d="M 48 66 L 232 66 L 210 109 C 204 118, 176 123, 140 123 C 104 123, 76 118, 70 109 Z" fill="url(#basinBodyGrad)" stroke="#38bdf8" stroke-width="1.5"/>
        <!-- Quai cầm 2 bên vành chậu -->
        <path d="M 48 66 C 36 66, 36 76, 52 78" fill="none" stroke="#7dd3fc" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M 232 66 C 244 66, 244 76, 228 78" fill="none" stroke="#7dd3fc" stroke-width="3.2" stroke-linecap="round"/>

        <!-- Lòng chậu mở rộng -->
        <ellipse cx="140" cy="66" rx="92" ry="28" fill="url(#basinInnerGrad)" stroke="#7dd3fc" stroke-width="2.2"/>
        <ellipse cx="140" cy="72" rx="76" ry="21" fill="rgba(2,6,23,0.45)"/>

        <!-- Khối nguyên liệu bên trong Chậu -->
        ${!isEmpty ? `
            ${camKg > 0 ? `
                <ellipse cx="140" cy="74" rx="${Math.min(76, 48 + camKg * 11)}" ry="${Math.min(21, 13 + camKg * 3)}" fill="${pasteFill}" stroke="#f59e0b" stroke-width="0.9"/>
                <ellipse cx="136" cy="70" rx="${Math.min(58, 34 + camKg * 9)}" ry="${Math.min(15, 9 + camKg * 2)}" fill="rgba(254, 240, 138, 0.16)"/>
            ` : ''}
            ${cornSvg}
            ${snailSvg}
            ${glazeSvg}
        ` : `
            <text x="140" y="73" text-anchor="middle" fill="#94a3b8" font-size="10.5" font-weight="700">Chậu đang trống — Hãy bỏ mồi &amp; hương liệu vào!</text>
        `}

        ${aromaSvg}

        <!-- Nhãn trạng thái nổi trên miệng chậu -->
        ${isOverdose ? `
            <rect x="44" y="6" width="192" height="20" rx="10" fill="rgba(185, 28, 28, 0.92)" stroke="#fca5a5" stroke-width="1"/>
            <text x="140" y="19.5" text-anchor="middle" fill="#ffffff" font-size="9.5" font-weight="900">🚨 QUÁ LIỀU NẶNG MÙI • CÁ CÀY CHỈ ĐÈ PHAO!</text>
        ` : (isOptimal ? `
            <rect x="56" y="6" width="168" height="20" rx="10" fill="rgba(5, 150, 105, 0.92)" stroke="#6ee7b7" stroke-width="1"/>
            <text x="140" y="19.5" text-anchor="middle" fill="#ffffff" font-size="9.5" font-weight="900">✨ TỶ LỆ VÀNG HỢP LÝ • NHẠY CÁ LỚN!</text>
        ` : '')}
    </svg>`;
}

// 6. BỂ MÔ PHỎNG CÂN PHAO & SƠ ĐỒ TRỤC - CHÌ - THẺO DƯỚI ĐÁY HỒ 1:1 (Dùng trong Modal Set Trục/Phao)
export function renderRigWaterTankSVG(calib = {}, rigConfig = {}, floatTier = {}) {
    const styleId = (rigConfig && rigConfig.fishingStyle) || 'CAN_DAI';
    const isHoDau = styleId === 'HO_DAU';
    const isBanDau = styleId === 'BAN_DAU';
    const totalMarks = floatTier.tipMarks || 11;
    const visMarks = isHoDau ? 2.2 : (calib.visibleMarks || 3);
    const rigType = calib.rigType || 'BALANCED';
    const mainLbl = rigConfig.mainLineSize ? `${rigConfig.mainLineSize}.0` : '2.0';
    const leadLbl = rigConfig.leaderSize ? `${rigConfig.leaderSize}.0` : '1.0';

    // Mặt nước cố định tại Y = 58, Đáy bùn tại Y = 204
    const waterY = 58;
    const mudY = 204;
    const segH = 3.6;
    const floatCollarY = waterY + (totalMarks - visMarks) * segH;

    // Dựng tăm phao đúng số vạch nổi trên mặt nước và số vạch chìm dưới mặt nước!
    let tipSvg = '';
    for (let i = 0; i < totalMarks; i++) {
        // i = 0 là vạch sát bầu phao, i = totalMarks - 1 là vạch chóp ngọn
        const yBot = floatCollarY - i * segH;
        const yTop = yBot - segH * 0.82;
        let col = '#ff2200';
        if (floatTier.ledBiteColor) col = (i % 2 === 0) ? '#00ffaa' : '#38bdf8';
        else if (i % 3 === 1) col = '#facc15';
        else if (i % 3 === 2) col = '#22c55e';
        const underWater = yTop > waterY;
        tipSvg += `<rect x="86.5" y="${yTop.toFixed(1)}" width="3" height="${(segH * 0.82).toFixed(1)}" fill="${col}" opacity="${underWater ? '0.45' : '1'}"/>`;
    }

    const bodyTopY = floatCollarY + 2;
    const bodyBotY = bodyTopY + 34;
    const footBotY = bodyBotY + 24;

    // Tọa độ Chì lá, Khóa số 8 và 2 Lưỡi Thẻo theo đúng kiểu cân (Nhạy / Cân Bằng / Tì Đáy / Lửng / Hố Đấu)
    let sinkerX = 88, sinkerY = 166, swivelX = 88, swivelY = 176;
    let hook1 = { x: 80, y: 203 }, hook2 = { x: 97, y: 196 };
    let rigDescTag = '1 lưỡi chạm đáy • 1 lưỡi chớm đáy';

    if (isHoDau) {
        sinkerX = 138; sinkerY = 186;
        swivelX = 152; swivelY = 194;
        hook1 = { x: 176, y: 204 };
        hook2 = { x: 190, y: 204 };
        rigDescTag = 'Trục xiên Hố Đấu • 2 thẻo nằm đáy xa phao';
    } else if (isBanDau || rigType === 'DULL_BOTTOM' || calib.id === 'chi_nam_day') {
        const heavyLead = (calib.id === 'chi_nam_day');
        sinkerY = heavyLead ? 200 : 178;
        swivelY = heavyLead ? 203 : 188;
        hook1 = { x: 76, y: 204 };
        hook2 = { x: 102, y: 204 };
        rigDescTag = heavyLead ? 'Chì nằm đáy • 2 thẻo chùng sát bùn trị cá nhát' : '2 viên mồi nằm êm sát đáy (Chuẩn Ốc/Ngô)';
    } else if (calib.targetLayer === 'MIDWATER') {
        sinkerY = 142; swivelY = 152;
        hook1 = { x: 81, y: 172 };
        hook2 = { x: 96, y: 165 };
        rigDescTag = '2 lưỡi lơ lửng tầng giữa đón cá ăn lửng';
    } else if (rigType === 'SENSITIVE') {
        sinkerY = 162; swivelY = 172;
        hook1 = { x: 82, y: 202 };
        hook2 = { x: 96, y: 191 };
        rigDescTag = 'Thẻo căng đứng siêu nhạy • Cá chạm môi báo ngay';
    }

    return `
    <svg viewBox="0 0 240 232" width="100%" height="218" xmlns="http://www.w3.org/2000/svg" style="border-radius:10px;border:1px solid rgba(56,189,248,0.35);background:#062825;display:block;">
        <defs>
            <linearGradient id="skyGradRig" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#0f172a"/>
                <stop offset="100%" stop-color="#1e3a5f"/>
            </linearGradient>
            <linearGradient id="waterGradRig" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#0d5c54" stop-opacity="0.92"/>
                <stop offset="65%" stop-color="#073b36" stop-opacity="0.96"/>
                <stop offset="100%" stop-color="#04221f"/>
            </linearGradient>
        </defs>

        <!-- Bầu trời trên mặt nước -->
        <rect x="0" y="0" width="240" height="${waterY}" fill="url(#skyGradRig)"/>
        <!-- Khối nước hồ câu -->
        <rect x="0" y="${waterY}" width="240" height="${mudY - waterY}" fill="url(#waterGradRig)"/>
        <!-- Lớp bùn đáy hồ -->
        <rect x="0" y="${mudY}" width="240" height="${232 - mudY}" fill="#452c18"/>
        <line x1="0" y1="${mudY}" x2="240" y2="${mudY}" stroke="#785233" stroke-width="1.5"/>

        <!-- Đường mặt nước gợn sáng -->
        <line x1="0" y1="${waterY}" x2="240" y2="${waterY}" stroke="#7dd3fc" stroke-width="1.6"/>
        <ellipse cx="88" cy="${waterY}" rx="18" ry="2.2" fill="none" stroke="#e0f2fe" stroke-width="0.9" opacity="0.75"/>

        <!-- Dây trục từ ngọn cần xuống chân phao -->
        <path d="M 24 6 Q 54 ${waterY - 4}, 88 ${footBotY}" fill="none" stroke="#cbd5e1" stroke-width="1.1" stroke-dasharray="2 2" opacity="0.65"/>

        <!-- Bầu phao & Chân phao chìm dưới mặt nước -->
        <line x1="88" y1="${bodyBotY - 2}" x2="88" y2="${footBotY}" stroke="#1e293b" stroke-width="2"/>
        <rect x="86.5" y="${footBotY - 5}" width="3" height="5.5" rx="1" fill="#dc2626"/>
        <path d="M 88 ${bodyTopY} C 96 ${bodyTopY + 9}, 96 ${bodyTopY + 23}, 88 ${bodyBotY} C 80 ${bodyTopY + 23}, 80 ${bodyTopY + 9}, 88 ${bodyTopY} Z" fill="#38bdf8" stroke="#facc15" stroke-width="1"/>
        <!-- Tăm phao nhô đúng số nấc cân -->
        ${tipSvg}

        <!-- Dây trục chính nối từ chân phao qua hạt chặn xuống chì lá & khóa số 8 -->
        <path d="M 88 ${footBotY} Q ${(88 + sinkerX) / 2} ${(footBotY + sinkerY) / 2 + (isHoDau ? 10 : 0)}, ${sinkerX} ${sinkerY} L ${swivelX} ${swivelY}" fill="none" stroke="#bae6fd" stroke-width="1.3"/>
        <!-- 2 Hạt chặn silicon trên & dưới chân phao -->
        <ellipse cx="88" cy="${footBotY + 5}" rx="2.2" ry="1.4" fill="#ef4444"/>
        <ellipse cx="${sinkerX}" cy="${sinkerY - 7}" rx="2.0" ry="1.3" fill="#ef4444"/>
        <!-- Viên chì lá quấn trục (hoặc không chì Hố Đấu) -->
        ${!(isHoDau && rigConfig.hoDauLead === 'NO_LEAD') ? `<rect x="${sinkerX - 3.2}" y="${sinkerY - 5}" width="6.4" height="10" rx="2" fill="#94a3b8" stroke="#f8fafc" stroke-width="0.7"/>` : ''}
        <!-- Khóa link số 8 nối trục & đôi thẻo -->
        <circle cx="${swivelX}" cy="${swivelY}" r="2.0" fill="none" stroke="#facc15" stroke-width="1.1"/>
        <circle cx="${swivelX}" cy="${swivelY + 3.2}" r="2.0" fill="none" stroke="#facc15" stroke-width="1.1"/>

        <!-- Đôi dây thẻo so le & 2 viên mồi câu -->
        <path d="M ${swivelX} ${swivelY + 4} Q ${(swivelX + hook1.x) / 2 - 4} ${(swivelY + hook1.y) / 2 + 4}, ${hook1.x} ${hook1.y}" fill="none" stroke="#e2e8f0" stroke-width="1.0"/>
        <path d="M ${swivelX} ${swivelY + 4} Q ${(swivelX + hook2.x) / 2 + 4} ${(swivelY + hook2.y) / 2 + 3}, ${hook2.x} ${hook2.y}" fill="none" stroke="#e2e8f0" stroke-width="1.0"/>
        <circle cx="${hook1.x}" cy="${hook1.y}" r="4.2" fill="#eab308" stroke="#713f12" stroke-width="0.8"/>
        <circle cx="${hook2.x}" cy="${hook2.y}" r="4.2" fill="#d97706" stroke="#713f12" stroke-width="0.8"/>

        <!-- Chú thích thông số trực quan -->
        <text x="104" y="${waterY - 8}" fill="#fde047" font-size="9.5" font-weight="800">Nổi ${String(visMarks).replace('.', ',')} nấc tăm</text>
        <text x="14" y="${waterY + 14}" fill="#7dd3fc" font-size="8.5" font-weight="700">Trục ${mainLbl}</text>
        <text x="14" y="${mudY - 8}" fill="#cbd5e1" font-size="8.5" font-weight="700">Thẻo ${leadLbl}</text>
        <text x="120" y="221" text-anchor="middle" fill="#fed7aa" font-size="8.5" font-weight="700">${rigDescTag}</text>
    </svg>`;
}
