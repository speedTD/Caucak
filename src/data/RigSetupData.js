// DỮ LIỆU CHUẨN BỊ ĐỒ ĐÀI TRƯỚC KHI CÂU:
// 1. 2 Cần Khởi Đầu (Cần Vô Danh 3m6 tải 5kg, Cần Trúc 5m4 tải 7kg)
// 2. 11 Kiểu Cân Phao Câu Đài Việt Nam
// 3. Hệ Thống Trục & Thẻo Từ 1.0 Đến 10.0 (1.0: tải tĩnh 2kg / tải cá 5kg ... 10.0: tải tĩnh 20kg / tải cá 50kg)

export const MAIN_LINE_PACK_PRICE = 39000;  // 39k / 1 bộ trục hoàn chỉnh
export const LEADER_PACK_PRICE = 110000;    // 110k / 1 bộ 10 thẻo buộc sẵn
export const LEADER_PACK_COUNT = 10;

export const STARTER_RODS = [
    {
        id: 'starter_vodanh_36',
        name: 'Cần Vô Danh 3.6m',
        length: 3.6,
        hardness: '3.5H',
        maxFishWeight: 5,
        rodColor: 0x334155,
        accentColor: 0x94a3b8,
        secondaryAccent: 0xe2e8f0,
        tensionReduce: 0.0,
        staminaDrainMul: 0.95,
        desc: 'Cần khởi đầu vô danh dài 3.6m đánh sát mép bờ. Tải cá tối đa 5kg — gặp cá to hơn rất dễ căng nổ thẻo!'
    },
    {
        id: 'starter_truc_54',
        name: 'Cần Trúc 5.4m',
        length: 5.4,
        hardness: '4H',
        maxFishWeight: 7,
        rodColor: 0xa16207,       // Màu vàng trúc tự nhiên
        accentColor: 0xfde047,    // Mắt trúc vàng sáng
        secondaryAccent: 0x713f12,// Đốt trúc nâu đậm
        tensionReduce: 0.05,
        staminaDrainMul: 1.02,
        desc: 'Cần trúc cổ điển dài 5.4m dẻo dai, tầm đánh chuẩn đài. Tải cá tối đa 7kg.'
    }
];

// 11 Kiểu Cân Phao chuẩn dân câu đài Việt Nam
export const FLOAT_CALIBRATIONS = [
    {
        id: 'can7_cau3',
        label: 'Cân 7 Câu 3',
        shortTag: 'Cân 7 Câu 3',
        visibleMarks: 3,
        rigType: 'BALANCED',
        sensitivityBonus: 0.08,
        cautionReduce: 0.05,
        targetLayer: 'BOTTOM',
        desc: 'Đa dụng quốc dân: 1 lưỡi chạm đáy, 1 lưỡi lơ lửng — phao báo nhịp sắc nét.'
    },
    {
        id: 'can5_cau3',
        label: 'Cân 5 Câu 3',
        shortTag: 'Cân 5 Câu 3',
        visibleMarks: 3,
        rigType: 'BALANCED',
        sensitivityBonus: 0.05,
        cautionReduce: 0.08,
        targetLayer: 'BOTTOM',
        desc: 'Cân bằng êm ái, chống sóng nhẹ tốt, cá chép hút mồi đầm nhịp.'
    },
    {
        id: 'can1_cau2',
        label: 'Cân 1 Câu 2 (Chuẩn Ốc / Ngô)',
        shortTag: 'Cân 1 Câu 2',
        visibleMarks: 2,
        rigType: 'DULL_BOTTOM',
        sensitivityBonus: 0.05,
        cautionReduce: 0.14,
        targetLayer: 'BOTTOM',
        desc: 'Bài cân chuyên trị Ốc ngâm & Ngô ủ: lưỡi nằm êm sát đáy, báo nhịp ăn thật cực chuẩn!'
    },
    {
        id: 'can1_cau3',
        label: 'Cân 1 Câu 3 (Chuẩn Ốc / Ngô)',
        shortTag: 'Cân 1 Câu 3',
        visibleMarks: 3,
        rigType: 'DULL_BOTTOM',
        sensitivityBonus: 0.03,
        cautionReduce: 0.15,
        targetLayer: 'BOTTOM',
        desc: 'Bài cân đầm đáy chuyên câu Ốc & Ngô, lọc tốt nhịp ảo cá nhỏ.'
    },
    {
        id: 'can1_cau4',
        label: 'Cân 1 Câu 4 (Chuẩn Ốc / Ngô)',
        shortTag: 'Cân 1 Câu 4',
        visibleMarks: 4,
        rigType: 'DULL_BOTTOM',
        sensitivityBonus: -0.02,
        cautionReduce: 0.16,
        targetLayer: 'BOTTOM',
        desc: 'Câu tì đáy sâu (2 lưỡi nằm đáy), chuẩn bài Ốc/Ngô & trị cá cũ nhát mồi!'
    },
    {
        id: 'can1_cau5',
        label: 'Cân 1 Câu 5 (Chuẩn Ốc / Ngô)',
        shortTag: 'Cân 1 Câu 5',
        visibleMarks: 5,
        rigType: 'DULL_BOTTOM',
        sensitivityBonus: -0.03,
        cautionReduce: 0.18,
        targetLayer: 'BOTTOM',
        desc: 'Tì đáy siêu đầm chuyên săn cá cũ bằng Ốc ngâm & Ngô ủ, hạn chế tối đa nhịp ảo.'
    },
    {
        id: 'can1_cau1',
        label: 'Cân 1 Câu 1',
        shortTag: 'Cân 1 Câu 1',
        visibleMarks: 1,
        rigType: 'SENSITIVE',
        sensitivityBonus: 0.14,
        cautionReduce: 0.0,
        targetLayer: 'BOTTOM',
        desc: 'Cực nhạy sát đáy, cá khẽ chạm môi là tăm phao nháy liền!'
    },
    {
        id: 'can3_cau3',
        label: 'Cân 3 Câu 3 (Chuẩn Ốc / Ngô)',
        shortTag: 'Cân 3 Câu 3',
        visibleMarks: 3,
        rigType: 'BALANCED',
        sensitivityBonus: 0.06,
        cautionReduce: 0.08,
        targetLayer: 'BOTTOM',
        desc: 'Mồi nằm êm sát nền đáy, chuẩn bài câu Ốc/Ngô — nhịp bềnh và nhịp đè đều rất rõ.'
    },
    {
        id: 'can3_cau5',
        label: 'Cân 3 Câu 5 (Chuẩn Ốc / Ngô)',
        shortTag: 'Cân 3 Câu 5',
        visibleMarks: 5,
        rigType: 'DULL_BOTTOM',
        sensitivityBonus: 0.02,
        cautionReduce: 0.15,
        targetLayer: 'BOTTOM',
        desc: 'Bài cân 3 câu 5 trứ danh đánh Ốc ngâm & Ngô ủ săn cá cũ cuối hồ cực nhạy!'
    },
    {
        id: 'can7_cau10',
        label: 'Cân 7 Câu 10 (Tì Chì)',
        shortTag: 'Cân 7 Câu 10',
        visibleMarks: 10,
        rigType: 'DULL_BOTTOM',
        sensitivityBonus: -0.04,
        cautionReduce: 0.20,
        targetLayer: 'BOTTOM',
        desc: 'Chì nằm đáy hoàn toàn, chống sóng gió & trị cá khóa mồm cực hiệu quả.'
    },
    {
        id: 'can7_cau11',
        label: 'Cân 7 Câu 11 (Chì Đáy Sâu)',
        shortTag: 'Cân 7 Câu 11',
        visibleMarks: 11,
        rigType: 'DULL_BOTTOM',
        sensitivityBonus: -0.05,
        cautionReduce: 0.22,
        targetLayer: 'BOTTOM',
        desc: 'Chì nằm sâu đáy bùn cực đầm, chuyên săn chép củ & trắm đen rãnh sâu.'
    },
    {
        id: 'can2_cau4',
        label: 'Cân 2 Câu 4',
        shortTag: 'Cân 2 Câu 4',
        visibleMarks: 4,
        rigType: 'DULL_BOTTOM',
        sensitivityBonus: 0.02,
        cautionReduce: 0.14,
        targetLayer: 'BOTTOM',
        desc: 'Hai lưỡi nằm gọn trên đáy bùn, giảm cảnh giác cho cá chép củ tinh ranh.'
    },
    {
        id: 'can4_cau2',
        label: 'Cân 4 Câu 2',
        shortTag: 'Cân 4 Câu 2',
        visibleMarks: 2,
        rigType: 'SENSITIVE',
        sensitivityBonus: 0.12,
        cautionReduce: 0.02,
        targetLayer: 'BOTTOM',
        desc: 'Thẻo căng cực nhạy, chuyên đánh tốc độ và cá ăn nhịp nhanh.'
    },
    {
        id: 'lung_day_10',
        label: 'Câu Lửng Cách Đáy 10 Phân',
        shortTag: 'Lửng Đáy 10cm',
        visibleMarks: 5,
        rigType: 'SUSPEND_LOW',
        sensitivityBonus: 0.10,
        cautionReduce: 0.12,
        targetLayer: 'LOW_MID',
        desc: 'Mồi treo cách đáy 10cm, đặc trị hồ bùn thối hoặc cá treo lơ lửng sát đáy.'
    },
    {
        id: 'lung_mat_50',
        label: 'Câu Lửng Cách Mặt 50 Phân',
        shortTag: 'Lửng Mặt 50cm',
        visibleMarks: 6,
        rigType: 'SUSPEND_TOP',
        sensitivityBonus: 0.13,
        cautionReduce: 0.08,
        targetLayer: 'SURFACE',
        desc: 'Đánh tầng mặt cách mặt nước 50cm — cực nhạy Trắm Cỏ & Rô Phi ăn lửng!'
    }
];

// Bảng thông số Trục & Thẻo từ 1.0 đến 10.0:
// Quy luật chuẩn: 1.0 -> tải tĩnh 2kg, tải cá tối đa 5kg ... 10.0 -> tải tĩnh 20kg, tải cá tối đa 50kg
export const LINE_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => ({
    size: num,
    label: `${num.toFixed(1)}`,
    staticLoadKg: num * 2,   // Tải tĩnh: 2kg -> 20kg
    maxFishKg: num * 5,      // Tải cá tối đa: 5kg -> 50kg
    cautionPenalty: num <= 2 ? 0.0 : Number(((num - 2) * 0.032).toFixed(3)) // Cước càng to cá bể càng dễ thấy dây
}));

export function getLineSpec(sizeNum) {
    const clamped = Math.max(1, Math.min(10, Math.round(Number(sizeNum) || 1)));
    return LINE_SIZES[clamped - 1];
}

// Danh sách bài cân phao CHUẨN cho mồi Ốc ngâm hương liệu & Ngô ủ
// (Chỉ các bài này cá mới ăn thật; cân các loại khác sẽ chỉ ra nhịp ảo!)
export const SNAIL_CORN_VALID_CALIBRATIONS = [
    'can1_cau2',
    'can1_cau3',
    'can1_cau4',
    'can1_cau5',
    'can3_cau3',
    'can3_cau5'
];

export function isValidSnailCornCalibration(calibrationId) {
    return SNAIL_CORN_VALID_CALIBRATIONS.includes(calibrationId);
}

// 3 Lối Đánh / Giải Pháp Dây Trục & Giấu Thẻo Độc Lập (Tách biệt hoàn toàn với Bài Cân Phao!):
// - CAN_DAI: Dây trục thẳng đứng đúng mực nước — nhạy nhất đầu ca & với cá mới bồi
// - BAN_DAU: Kéo phao cao hơn mực nước vừa phải, trục hơi xiên, giấu thẻo nhẹ — hiệu quả giữa ca khi cá giãn ra ngoài
// - HO_DAU: Kéo phao xa tạo trục xiên ~45°, vươn mồi xa & GIẤU THẺO hoàn toàn sát đáy — sát thủ gần cuối ca & cá cũ nhát dây (tỷ lệ giã gạo & mất hình phao cao!)
export const FISHING_STYLES = [
    {
        id: 'CAN_DAI',
        label: '🎯 Câu Cân Đài',
        shortLabel: 'Câu Cân Đài',
        color: '#38bdf8',
        hideLeaderFactor: 0.0,   // Trục thẳng đứng, không giấu thẻo
        desc: 'Dây trục thẳng đứng đúng độ sâu nước. Độ nhạy cực cao, phù hợp cá mới bồi & đầu ca câu.'
    },
    {
        id: 'BAN_DAU',
        label: '⚖️ Câu Bán Đấu',
        shortLabel: 'Câu Bán Đấu',
        color: '#a78bfa',
        hideLeaderFactor: 0.50,  // Giấu thẻo 50% sát đáy, trục hơi xiên
        desc: 'Trục hơi xiên, giấu thẻo một phần sát đáy để vươn ra rìa ổ khi cá bắt đầu giãn ra ngoài. Tăng nhịp giã gạo & mất hình.'
    },
    {
        id: 'HO_DAU',
        label: '⚓ Câu Hố Đấu',
        shortLabel: 'Câu Hố Đấu',
        color: '#f59e0b',
        hideLeaderFactor: 0.85,  // Giấu thẻo 85% hoàn toàn sát bùn/mồi xả, trục xiên 45°
        desc: 'Kéo phao xa tạo góc trục xiên ~45°, giấu thẻo hoàn toàn sát nền đáy — đánh cực hay gần cuối ca & cá cũ nhát dây (tỷ lệ giã gạo & mất hình phao cao!).'
    }
];

export function getFishingStyleById(styleId) {
    return FISHING_STYLES.find(s => s.id === styleId) || FISHING_STYLES[0];
}

export function getCalibrationById(id) {
    return FLOAT_CALIBRATIONS.find(c => c.id === id) || FLOAT_CALIBRATIONS[0];
}

export function getDefaultRigState() {
    return {
        selectedRodId: 'starter_truc_54', // Mặc định cầm Cần Trúc 5.4m (có sẵn cả Cần Vô Danh 3.6m)
        calibrationId: 'can7_cau3',
        fishingStyle: 'CAN_DAI',          // Lối đánh mặc định: Câu Cân Đài (có thể chuyển Bán Đấu / Hố Đấu bất cứ lúc nào)
        hoDauRatio: 2.0,                  // Hệ số Phao cách lưỡi cho Câu Hố Đấu: 1.5 (Nhạy) | 2.0 (Vừa) | 2.5 (Lụt)
        hoDauLead: 'NO_LEAD',             // Chế độ chì Hố Đấu: 'NO_LEAD' (Không chì) | 'SLIDING_LEAD' (Chì chạy)
        mainLineSize: 2,                  // Trục 2.0 (tải tĩnh 4kg / tải cá 10kg)
        leaderSize: 1,                    // Thẻo 1.0 (tải tĩnh 2kg / tải cá 5kg)
        mainLineStock: { 2: 1, 3: 1 },    // Tặng sẵn 1 bộ trục 2.0 & 1 bộ trục 3.0
        leaderStock: { 1: 5, 2: 5 },      // Tặng sẵn 5 thẻo 1.0 & 5 thẻo 2.0
        rodDurability: 100
    };
}
