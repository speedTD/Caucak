// HỒ SƠ SINH HỌC CÁC LOÀI CÁ TRONG HỒ CÂU ĐÀI VIỆT NAM
// Khẩu vị (diet) nhân với độ hợp mồi: CAM = cám / mồi vê, CORN = ngô ủ hương liệu, SNAIL = ốc ngâm hương liệu

export const BAIT_KINDS = {
    CAM: 'CAM',
    CORN: 'CORN',
    SNAIL: 'SNAIL'
};

export const BAIT_KIND_LABELS = {
    CAM: 'Cám',
    CORN: 'Ngô ủ hương liệu',
    SNAIL: 'Ốc ngâm hương liệu'
};

export const SPECIES = {
    CARP: {
        key: 'CARP',
        name: 'Cá Chép',
        minW: 2.2, maxW: 7.2,
        isBig: true,
        diet: { CAM: 1.0, CORN: 1.15, SNAIL: 1.2 },
        baseSlow: 1.0,        // hệ số chậm khi ăn (càng lớn ăn càng chậm)
        mouthiness: 0.30,     // xác suất móm (ngậm thử rồi nhả)
        spawnWeight: 30,
        biteStyle: 'NIBBLE_DUNK',
        fightPowerMul: 1.0,
        visual: { dorsal: 0x6b5a2e, flank: 0xc99a3c, belly: 0xf2e2a6, fin: 0x9a6a2a, len: 0.92, barbels: true, shape: 'carp' }
    },
    OLD_CARP: {
        key: 'OLD_CARP',
        name: 'Cá Chép Củ',
        minW: 7.5, maxW: 16.5,
        isBig: true,
        diet: { CAM: 0.14, CORN: 1.55, SNAIL: 1.68 },  // Cá cũ hạn chế ăn cám, chỉ mê Ốc ngâm hương liệu & Ngô ủ!
        baseSlow: 1.65,
        mouthiness: 0.42,
        spawnWeight: 18,
        biteStyle: 'SLOW_LIFT',
        fightPowerMul: 1.18,
        visual: { dorsal: 0x4e4423, flank: 0xb08030, belly: 0xe7d49a, fin: 0x7a4f22, len: 1.15, barbels: true, shape: 'carp' }
    },
    BLACK_CARP: {
        key: 'BLACK_CARP',
        name: 'Cá Trắm Đen',
        minW: 5.5, maxW: 18.0,
        isBig: true,
        diet: { CAM: 0.08, CORN: 0.22, SNAIL: 1.65 },   // trắm đen rất hiếm ăn cám, mê ốc
        baseSlow: 1.5,
        mouthiness: 0.35,
        spawnWeight: 10,
        biteStyle: 'HEAVY_PULL',
        fightPowerMul: 1.3,
        visual: { dorsal: 0x1b2128, flank: 0x2c353d, belly: 0x8d969c, fin: 0x12171c, len: 1.15, barbels: false, shape: 'black' }
    },
    GRASS_CARP: {
        key: 'GRASS_CARP',
        name: 'Cá Trắm Cỏ',
        minW: 3.5, maxW: 14.0,
        isBig: true,
        diet: { CAM: 0.55, CORN: 1.55, SNAIL: 0.25 },   // ăn cám chậm, ăn ngô nhanh
        baseSlow: 1.1,
        camSlow: 1.9,      // ăn cám thì chậm gấp ~2
        cornSlow: 0.6,     // ăn ngô thì rất nhanh
        mouthiness: 0.22,
        spawnWeight: 14,
        biteStyle: 'DECISIVE_DUNK',
        fightPowerMul: 1.15,
        visual: { dorsal: 0x4f5a2a, flank: 0x9a9a45, belly: 0xe6e2b8, fin: 0x6d6a33, len: 1.05, barbels: false, shape: 'grass' }
    },
    TILAPIA: {
        key: 'TILAPIA',
        name: 'Cá Rô Phi',
        minW: 0.8, maxW: 2.8,
        isBig: false,
        diet: { CAM: 1.30, CORN: 0.85, SNAIL: 0.50 },
        baseSlow: 0.55,
        mouthiness: 0.55,   // rô phi hay rỉa mồi, nhấp liên tục
        spawnWeight: 28,
        biteStyle: 'RAPID_NIBBLE',
        fightPowerMul: 0.55,
        visual: { dorsal: 0x3b4a4f, flank: 0x7d8f8f, belly: 0xe2d8d2, fin: 0x55424a, len: 0.58, barbels: false, shape: 'tilapia' }
    }
};

export function pickRandomSpecies(rng = Math.random, forceBig = false) {
    const list = Object.values(SPECIES).filter(s => !forceBig || s.isBig);
    const total = list.reduce((a, s) => a + s.spawnWeight, 0);
    let r = rng() * total;
    for (const s of list) {
        r -= s.spawnWeight;
        if (r <= 0) return s;
    }
    return list[0];
}

export function inferSpeciesKey(name = '') {
    const n = name.toLowerCase();
    if (n.includes('trắm đen')) return 'BLACK_CARP';
    if (n.includes('trắm cỏ')) return 'GRASS_CARP';
    if (n.includes('rô phi')) return 'TILAPIA';
    if (n.includes('củ')) return 'OLD_CARP';
    return 'CARP';
}

// Phân loại mồi trên lưỡi thành các nhóm khẩu vị (CAM / CORN / SNAIL)
export function getBaitKinds(hookBait) {
    if (hookBait && Array.isArray(hookBait.baitKinds) && hookBait.baitKinds.length > 0) {
        return hookBait.baitKinds;
    }
    const kinds = [];
    const base = (hookBait && hookBait.baseName ? hookBait.baseName : '').toLowerCase();
    const full = (hookBait && hookBait.name ? hookBait.name : '').toLowerCase();
    if (base.includes('ốc') || full.includes('ốc')) kinds.push('SNAIL');
    if (full.includes('ngô') || base.includes('ngô')) kinds.push('CORN');
    if (kinds.length === 0 || base.includes('cám') || base.includes('chép')) kinds.push('CAM');
    return kinds;
}

// Độ hợp khẩu vị của loài cá với mồi (0.05 -> 1.8)
export function getDietAffinity(speciesKey, baitKinds) {
    const sp = SPECIES[speciesKey] || SPECIES.CARP;
    const kinds = (baitKinds && baitKinds.length) ? baitKinds : ['CAM'];
    let best = 0;
    kinds.forEach(k => {
        best = Math.max(best, sp.diet[k] ?? 0.5);
    });
    return best + 0.08 * (kinds.length - 1);
}

// Hệ số chậm khi ăn: cá càng to / càng cũ ăn càng chậm; trắm cỏ ăn ngô nhanh, ăn cám chậm
export function getEatSlowness(speciesKey, weight, baitKinds) {
    const sp = SPECIES[speciesKey] || SPECIES.CARP;
    let slow = sp.baseSlow * (1.0 + Math.min(1.4, weight / 14.0) * 0.6);
    if (sp.key === 'GRASS_CARP') {
        const kinds = baitKinds || ['CAM'];
        if (kinds.includes('CORN')) slow *= sp.cornSlow;
        else slow *= sp.camSlow;
    }
    return Math.max(0.35, Math.min(3.2, slow));
}


// Ánh xạ chính xác loài cá -> đường dẫn ảnh chụp cá thật độ phân giải cao trong /images/fish/
export function getFishImageUrl(fishOrName, fallbackWeight = 0) {
    const isObj = fishOrName && typeof fishOrName === 'object';
    const name = (isObj ? (fishOrName.name || fishOrName.speciesName || '') : String(fishOrName || '')).toLowerCase();
    const speciesKey = isObj ? (fishOrName.speciesKey || '') : '';
    const weight = isObj ? (fishOrName.weight || 0) : (fallbackWeight || 0);

    if (name.includes('đỏ') || name.includes('boss') || name.includes('khuyên') || name.includes('koi')) {
        return '/images/fish/red_carp.png';
    }
    if (speciesKey === 'BLACK_CARP' || name.includes('trắm đen')) {
        return '/images/fish/black_carp.png';
    }
    if (speciesKey === 'GRASS_CARP' || name.includes('trắm cỏ') || name.includes('trắm')) {
        return '/images/fish/grass_carp.png';
    }
    if (speciesKey === 'TILAPIA' || name.includes('rô phi') || name.includes('diếc')) {
        return '/images/fish/tilapia.png';
    }
    if (speciesKey === 'OLD_CARP' || name.includes('chép củ') || name.includes('chép cụ') || name.includes('gù lưng') || weight >= 7.0) {
        return '/images/fish/old_carp.png';
    }
    return '/images/fish/carp.png';
}
