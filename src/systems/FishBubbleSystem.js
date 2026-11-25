import * as THREE from 'three';
import { soundManager } from '../audio/SoundManager.js';
import { buildRealisticFish } from '../world/FishModelBuilder.js';
import { SPECIES, pickRandomSpecies, getBaitKinds, getDietAffinity, getEatSlowness } from '../data/FishProfiles.js';
import { isValidSnailCornCalibration, getCalibrationById, getLineSpec, getFishingStyleById } from '../data/RigSetupData.js';

// Trạng thái ý thức của Cá AI dưới nước (Hệ thống Nhận thức & Ý thức độc lập từng cá thể)
export const AI_FISH_STATES = {
    CRUISE: 'CRUISE',                   // Đi tuần tự nhiên theo luồng chữ nhật & bơi theo đàn
    PATROL_BANK: 'PATROL_BANK',         // Đi dạo dọc sát mép bờ kè kiếm ăn ven bờ
    SMELL_SEEK: 'SMELL_SEEK',           // Đánh hơi thấy mùi mồi xả / mồi câu, vừa bơi vào ổ vừa ủi bùn
    PASS_BY_BRUSH: 'PASS_BY_BRUSH',     // Cá no hoặc đi tuần cắt ngang qua ổ -> Quệt thân vào dây câu tạo tín hiệu giả rồi bơi thẳng đi!
    GRAZE_GROUNDBAIT: 'GRAZE_GROUNDBAIT', // Cá khôn chỉ ủi bùn nhặt vụn mồi xả quanh chân phao nhưng PHỚT LỜ mồi trên lưỡi câu!
    INSPECT_BAIT: 'INSPECT_BAIT',       // Lượn vòng quanh chân phao dò xét dây trục, chì và mùi mồi
    PROBE_BLOW: 'PROBE_BLOW',           // Cá tiến sát thổi nước / nhấp rỉa thử mồi (làm mòn viên mồi) để kiểm tra có lưỡi câu sắt không!
    REJECT_TURN: 'REJECT_TURN',         // Cá khôn cảnh giác phát hiện bẫy / chê mồi (hoặc lệch hương liệu) quay đầu bỏ đi
    FEED_BITE: 'FEED_BITE',             // Tin tưởng hoàn toàn -> Chúi đầu hút mồi thật -> báo tín hiệu phao chuẩn cho cần thủ
    STARTLED_FLEE: 'STARTLED_FLEE'      // Hoảng sợ phóng chạy tán loạn khi động ổ / giật hụt / thấy lưỡi câu trần
};

// 5 Kiểu Nhân Cách & Ý Thức Riêng Của Từng Cá Thể Dưới Hồ Dịch Vụ
export const FISH_MIND_ARCHETYPES = {
    OLD_CUNNING: {
        id: 'OLD_CUNNING',
        label: 'Cá Bể Tinh Ranh (Từng Bị Câu Trượt)',
        baseCaution: 0.82,
        probeTendency: 0.78,      // Rất hay thổi nước thử mồi trước khi ăn
        groundbaitOnlyRate: 0.45  // Hay ăn mồi xả mà né lưỡi câu
    },
    BOTTOM_GRAZER: {
        id: 'BOTTOM_GRAZER',
        label: 'Cá Khôn Chuyên Nhặt Mồi Xả',
        baseCaution: 0.65,
        probeTendency: 0.55,
        groundbaitOnlyRate: 0.62  // Thường chỉ hớt mồi xả dưới bùn rồi bơi đi nếu mồi câu không đủ mềm ngon
    },
    PASSERBY_CRUISER: {
        id: 'PASSERBY_CRUISER',
        label: 'Cá Đi Tuần Ngang Ổ (Ít Đói)',
        baseCaution: 0.58,
        probeTendency: 0.35,
        groundbaitOnlyRate: 0.50  // Hay bơi cắt ngang quệt dây trục
    },
    CAUTIOUS_TESTER: {
        id: 'CAUTIOUS_TESTER',
        label: 'Cá Thăm Dò Kỹ Tính (Kén Hương Liệu)',
        baseCaution: 0.68,
        probeTendency: 0.82,      // Luôn rỉa/thổi thử xem mồi cứng hay mềm
        groundbaitOnlyRate: 0.35
    },
    VORACIOUS_FEEDER: {
        id: 'VORACIOUS_FEEDER',
        label: 'Cá Đói Sục Ổ Mạnh',
        baseCaution: 0.32,
        probeTendency: 0.25,
        groundbaitOnlyRate: 0.15
    }
};

// Quy luật di chuyển & ăn mồi thực tế của đàn cá trong câu đài
export const FISH_HABIT_MODES = {
    GATHER_SPOT: 'GATHER_SPOT',     // Cá tụ tập trung ở 1 ổ sục tăm dày đặc
    BANK_FORAGE: 'BANK_FORAGE',     // Cá tản ra đi ven bờ kiếm ăn dọc mép kè đá
    SLOW_LOCKJAW: 'SLOW_LOCKJAW'    // Cá lừng khừng, khóa mồm, không ăn hoặc ăn rất chậm
};

// ĐIỀU KIỆN THỜI TIẾT & SINH THÁI CA CÂU THỰC TẾ (Nguy cơ Móm Cả Ca / Cá Khóa Mồm)
export const LAKE_DAILY_CONDITIONS = {
    LOCKJAW_MOM_DAY: {
        id: 'LOCKJAW_MOM_DAY',
        name: '💀 Ngày Cá Khóa Mồm (Nguy cơ Móm Cả Ca)',
        desc: 'Trời oi bức ngột ngạt, áp suất khí quyển tụt dốc, thiếu oxy đáy. Cá ép sát đáy hoặc treo lơ lửng, ngậm chặt mồm không thèm ăn mồi thông thường!',
        badge: '💀 Nguy Cơ Móm Cả Ca',
        color: '#ef4444',
        eatPenalty: 0.18,      // Tỉ lệ ăn mồi tụt dốc, dễ móm cả ca
        fleeTendency: 1.8,     // Rất dễ bỏ chạy khi thấy bóng cần hoặc dây câu
        tip: 'Bí kíp cứu móm: Bắt buộc dùng Chì Nằm Đáy + Mồi Mềm Bung Sương Nhẹ + Xả Ổ tơi xốp dụ cá!'
    },
    PICKY_DAY: {
        id: 'PICKY_DAY',
        name: '⚠️ Ngày Cá Kén Mồi (Cá Bể Cảnh Giác)',
        desc: 'Hồ đài cuối tuần đã bị câu nhiều đợt, cá rất tinh khôn, thường chỉ lượn nhặt vụn mồi xả hoặc thổi thử chứ không chịu nuốt lưỡi!',
        badge: '⚠️ Cá Kén Mồi (Khó)',
        color: '#f59e0b',
        eatPenalty: 0.55,
        fleeTendency: 1.3,
        tip: 'Nên dùng mồi mềm xả tơi hoặc cân phao cực nhạy, kiên nhẫn đợi tín hiệu phao tụt lút!'
    },
    NORMAL_DAY: {
        id: 'NORMAL_DAY',
        name: '🌤️ Ngày Cá Ăn Đều',
        desc: 'Thời tiết mát mẻ có gió đông nam nhẹ, mặt hồ có sóng gợn lăn tăn, cá tuần tra khắp hồ kiếm mồi.',
        badge: '🌤️ Cá Ăn Đều (Bình Thường)',
        color: '#10b981',
        eatPenalty: 1.0,
        fleeTendency: 1.0,
        tip: 'Ra cần chuẩn bến, xả ổ đều tay cá sẽ vào cắn nhịp nhàng.'
    },
    BOOM_DAY: {
        id: 'BOOM_DAY',
        name: '🔥 Ngày Bão Cá (Cá Đói Sục Ổ)',
        desc: 'Hồ vừa thêm nước mới giàu oxy, đàn cá đói cồn cào sục ổ bùn mạnh, ăn bạo dạn liên tục!',
        badge: '🔥 Bão Cá (Rất Nhạy)',
        color: '#3b82f6',
        eatPenalty: 1.45,
        fleeTendency: 0.65,
        tip: 'Mồi thơm béo sẽ kéo cả đàn chép củ và trắm đen vào đè phao liên tục!'
    }
};

// 6 TÌNH HUỐNG THỜI TIẾT & SINH THÁI ĐỜI THỰC ẢNH HƯỞNG TRỰC TIẾP ĐỘ ĐÓI & TẬP TÍNH CÁ
export const ECOLOGY_EVENTS = {
    NORMAL: {
        id: 'NORMAL',
        badge: '🌿 Sinh Thái Ổn Định',
        eatMul: 1.0,
        desc: 'Nước hồ êm, oxy ổn định, cá ăn theo đúng chu kỳ đói/no tự nhiên.'
    },
    LOW_PRESSURE_SUSPEND: {
        id: 'LOW_PRESSURE_SUSPEND',
        badge: '🌫️ Áp Suất Tụt • Cá Treo Lửng',
        eatMul: 0.45,
        desc: 'Trời oi bức trước mưa, thiếu oxy đáy khiến cá bỏ đáy treo lửng — Câu Lửng 50cm cực nhạy, câu đáy dễ móm!'
    },
    COLD_NORTH_WIND: {
        id: 'COLD_NORTH_WIND',
        badge: '💨 Gió Đông Bắc • Nước Lạnh',
        eatMul: 0.48,
        desc: 'Gió mùa về nước lạnh đột ngột, cá rúc rãnh sâu ít di chuyển, giảm 50% độ đói!'
    },
    OXYGEN_SHOWER: {
        id: 'OXYGEN_SHOWER',
        badge: '🌧️ Mưa Rào Giàu Oxy • Cá Sục Ổ',
        eatMul: 1.42,
        desc: 'Mưa rào làm tăng mạnh oxy hòa tan, kích thích đàn cá đói bạo dạn lao vào sục ổ!'
    },
    HOT_NOON_SHADE: {
        id: 'HOT_NOON_SHADE',
        badge: '☀️ Nắng Gắt Đứng Bóng',
        eatMul: 0.62,
        desc: 'Nắng trưa nóng gắt tầng mặt, cá rúc bóng râm & đáy sâu, ăn cầm chừng rất cảnh giác.'
    },
    FRESH_WATER_PUMP: {
        id: 'FRESH_WATER_PUMP',
        badge: '🌊 Bơm Nước Mới • Kích Tiêu Hóa',
        eatMul: 1.30,
        desc: 'Chủ hồ bơm thêm nước mới giàu oxy giúp cá tiêu hóa nhanh hơn & quay lại kiếm ăn!'
    },
    SMALL_FRY_SWARM: {
        id: 'SMALL_FRY_SWARM',
        badge: '🐟 Đàn Rô Con Phá Ổ',
        eatMul: 0.72,
        desc: 'Đàn rô phi con kéo vào đớp vụn mồi làm cá chép củ lùi ra ngoài — nên câu tì chì (Cân 7 Câu 10)!'
    }
};

export class FishBubbleSystem {
    constructor(scene) {
        this.scene = scene;
        this.bubbles = [];         // Các bọt nước đang nổi lên
        this.ripples = [];         // Các gợn sóng lan tỏa
        this.fishSchools = [];     // Đàn cá AI 3D có ý thức dưới nước
        this.groundBaitSpots = []; // Ổ mồi xả
        this.surfaceBreachers = []; // Cá 3D trồi lên mặt nước thở & quẫy đuôi rồi lặn xuống (tỉ lệ Trắm Đen cao nhất!)
        this.breachTimer = 16.0 + Math.random() * 14.0;
        this.floatingDeadFish = null; // 1 con cá chết nổi lềnh bềnh ngửa bụng mỗi ngày chờ Chủ Hồ mang vợt ra hớt!

        // Kích thước lòng hồ chữ nhật hẹp chuẩn hồ đài thi đấu (170m x 44m, lakeHalfW = 80m, lakeHalfD = 20m)
        this.lakeHalfW = 80.0;
        this.lakeHalfD = 20.0;

        // Quy mô sinh khối hồ câu dịch vụ chuẩn thực tế: duy trì 1,5 tấn - 2,0 tấn cá (1.500kg - 2.000kg)
        this.minBiomassKg = 1500;
        this.maxBiomassKg = 2000;
        this.targetBiomassKg = Math.round(1550 + Math.random() * 400); // 1.55 - 1.95 tấn

        // Tình trạng ca câu hôm nay & Tình huống sinh thái thời tiết đời thực
        this.dailyCondition = this.pickDailyCondition();
        this.activeEcologyEvent = ECOLOGY_EVENTS.NORMAL;
        this.ecologyTimer = 75.0 + Math.random() * 55.0;
        this.spotOverfeedCount = 0; // Đếm số nắm mồi xả tích lũy gây no bụng đàn cá
        this.currentHour = 7.5;     // Giờ hồ hiện tại để tính giấc ăn (8-10h, 16-17h, giờ lười đè phao...)
        this.sessionProgress = 0.1; // Tiến độ ca câu (0.0 đầu ca -> 0.5 giữa ca cá giãn -> 1.0 cuối ca)

        // Mồi câu trên lưỡi hiện tại của người chơi (để Cá AI đánh hơi, lượn vòng dò xét và hút mồi)
        this.activeHookTarget = null;
        // Mức độ cảnh giác chung tại ổ câu (0.0 -> 1.0): Tăng khi giật hụt, bổ cần liên tục, lộ lưỡi câu trần
        this.spotAlertLevel = 0.15;
        this.catchesWithoutRebait = 0; // Đếm số cá đã câu lên mà CHƯA xả bồi giữ ổ (1 con -> cảnh giác, 2 con -> tàn ổ!)
        this.spotCollapsed = false;    // Cờ báo ổ đã tàn do câu 2 con liên tiếp không xả bồi
        this.lastMindLog = 'Mặt nước tĩnh lặng — Hãy xả mồi (F) để gọi đàn cá vào ổ';

        // Tập tính đàn cá hiện tại (Tụ 1 ổ <-> Đi ven bờ kiếm ăn <-> Không ăn / Ăn rất chậm)
        this.currentHabitMode = FISH_HABIT_MODES.GATHER_SPOT;
        this.habitTimer = 42.0;
        this.gatherCenter = new THREE.Vector2(0, 14.5); // Ổ tụ mặc định trước Bến #1 (Bờ Nam z=18, tầm câu rơi ở z=14.5)

        // Group chứa mô hình Cá AI dưới đáy nước:
        // Trong câu đài thực tế, cá ăn chìm dưới đáy bùn nên cần thủ CHỈ NHÌN THẤY TĂM CÁ SỦI LÊN MẶT NƯỚC chứ không bao giờ thấy thân cá hay lộ vây lưng khi bơi!
        this.aiFishGroup = new THREE.Group();
        this.aiFishGroup.visible = false;
        this.scene.add(this.aiFishGroup);

        // HÌNH HỌC & VẬT LIỆU TĂM CÁ ĐỜI THỰC:
        // Hạt tăm cá thật rất nhỏ (đường kính li ti từ 4mm đến 18mm, không bao giờ to như quả bóng 16cm!)
        // Base radius 0.012m (1.2cm), kết hợp scale biến thiên chuẩn theo từng loài cá
        this.bubbleGeo = new THREE.SphereGeometry(0.012, 12, 12);
        this.bubbleMat = new THREE.MeshStandardMaterial({
            color: 0xf0fdf4,
            emissive: 0xdbeafe,
            emissiveIntensity: 0.65, // Phản quang óng ánh lấp lánh dưới ánh nắng để ngồi xa 4-6m vẫn nhìn rõ mồn một
            transparent: true,
            opacity: 0.88,
            roughness: 0.08,
            metalness: 0.3
        });

        // Gợn sóng tăm cá li ti (Micro Ripples) — Khi tăm ngoi lên mặt nước chỉ gợn lăn tăn 5cm - 15cm siêu nhỏ
        this.microRippleGeo = new THREE.RingGeometry(0.012, 0.022, 24);
        this.microRippleGeo.rotateX(-Math.PI / 2);
        this.microRippleMat = new THREE.MeshBasicMaterial({
            color: 0xe0f2fe,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide
        });

        // Gợn sóng tròn đồng tâm lớn (Dành cho cá nhảy, quả chì rơi xuống nước, giật cá đập nước)
        this.rippleGeo = new THREE.RingGeometry(0.06, 0.16, 28);
        this.rippleGeo.rotateX(-Math.PI / 2);
        this.rippleMat = new THREE.MeshBasicMaterial({
            color: 0x93c5fd,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide
        });

        this.initFishSchools();
    }

    // Dựng mô hình Cá AI 3D chân thực theo từng loài (Chép / Chép củ / Trắm đen / Trắm cỏ / Rô phi)
    create3DAIFishMesh(speciesKey, weight, isTaggedPrize = false) {
        const root = buildRealisticFish(speciesKey, weight);

        // Nếu là "CÁ ĐEO KHUYÊN THƯỞNG NÓNG" của chủ hồ dịch vụ: Gắn khuyên vàng + thẻ đỏ trên vây lưng
        if (isTaggedPrize) {
            const ringTag = new THREE.Mesh(
                new THREE.TorusGeometry(0.055, 0.012, 8, 18),
                new THREE.MeshBasicMaterial({ color: 0xfacc15 })
            );
            ringTag.position.set(0, 0.26, -0.02);
            ringTag.rotation.y = Math.PI / 2;
            root.add(ringTag);

            const redBadge = new THREE.Mesh(
                new THREE.BoxGeometry(0.03, 0.07, 0.09),
                new THREE.MeshBasicMaterial({ color: 0xef4444 })
            );
            redBadge.position.set(0, 0.29, -0.06);
            root.add(redBadge);
        }
        return root;
    }

    createAIFishEntity(x, z, forceBigCarp = false, isTaggedPrize = false, opts = {}) {
        let spec;
        if (isTaggedPrize) {
            spec = Math.random() < 0.6 ? SPECIES.OLD_CARP : SPECIES.CARP;
        } else {
            spec = pickRandomSpecies(Math.random, forceBigCarp);
        }
        const weight = isTaggedPrize
            ? Number((8.5 + Math.random() * 6.5).toFixed(1))
            : Number((spec.minW + Math.random() * (spec.maxW - spec.minW)).toFixed(1));

        // XÂY DỰNG BỘ NÃO Ý THỨC RIÊNG CHO TỪNG CON CÁ (INDIVIDUAL FISH CONSCIOUSNESS)
        let archetype = FISH_MIND_ARCHETYPES.CAUTIOUS_TESTER;
        const rArch = Math.random();
        if (opts.fresh) {
            archetype = rArch < 0.65 ? FISH_MIND_ARCHETYPES.VORACIOUS_FEEDER : FISH_MIND_ARCHETYPES.CAUTIOUS_TESTER;
        } else if (spec.key === 'OLD_CARP' || spec.key === 'BLACK_CARP' || weight >= 8.0) {
            // Cá lớn / Cá củ / Trắm đen rất tinh khôn, đa số là Cá Bể hoặc Cá Ăn Mồi Xả
            if (rArch < 0.44) archetype = FISH_MIND_ARCHETYPES.OLD_CUNNING;
            else if (rArch < 0.72) archetype = FISH_MIND_ARCHETYPES.BOTTOM_GRAZER;
            else if (rArch < 0.88) archetype = FISH_MIND_ARCHETYPES.CAUTIOUS_TESTER;
            else archetype = FISH_MIND_ARCHETYPES.PASSERBY_CRUISER;
        } else {
            if (rArch < 0.22) archetype = FISH_MIND_ARCHETYPES.OLD_CUNNING;
            else if (rArch < 0.48) archetype = FISH_MIND_ARCHETYPES.BOTTOM_GRAZER;
            else if (rArch < 0.68) archetype = FISH_MIND_ARCHETYPES.PASSERBY_CRUISER;
            else if (rArch < 0.86) archetype = FISH_MIND_ARCHETYPES.CAUTIOUS_TESTER;
            else archetype = FISH_MIND_ARCHETYPES.VORACIOUS_FEEDER;
        }

        const caution = THREE.MathUtils.clamp(
            archetype.baseCaution + (weight / 20.0) * 0.18 + (Math.random() - 0.5) * 0.12,
            0.20,
            0.96
        );
        // Không phải con cá nào trong hồ cũng đang đói: có con đã lưng bụng chỉ bơi dạo hoặc ăn vụn mồi xả
        const satiety = opts.fresh ? 0.12 : THREE.MathUtils.clamp(0.15 + Math.random() * 0.68, 0.10, 0.85);
        const hunger = THREE.MathUtils.clamp(1.0 - satiety * 0.85, 0.18, 1.0);

        const baseDepth = -1.5 - Math.random() * 0.2;
        // Tối ưu 60 FPS khi hồ duy trì 1.5-2 tấn (~230-310 con AI): chỉ tạo mô hình 3D nặng cho tối đa 36 con đại diện,
        // toàn bộ 230-310 con còn lại vẫn là cá AI thật 100% có cân nặng, ý thức, luồng bơi, tăm cá và cắn câu đầy đủ!
        let meshGroup = null;
        if (opts.with3DMesh || this.aiFishGroup.children.length < 36) {
            meshGroup = this.create3DAIFishMesh(spec.key, weight, isTaggedPrize);
            meshGroup.position.set(x, baseDepth, z);
            this.aiFishGroup.add(meshGroup);
        }

        // Tuổi lưu hồ (daysInLake):
        // - Cá mới bồi: 0 ngày (cá mới, ăn cám tốt, chưa quá ranh ma)
        // - Cá ở hồ từ 5 ngày trở đi (daysInLake >= 5): chính thức thành CÁ CŨ (tụ cuối hồ, cày nhiều tăm, chê cám, chỉ mê Ốc/Ngô!)
        let daysInLake = 0;
        if (typeof opts.daysInLake === 'number') {
            daysInLake = opts.daysInLake;
        } else if (opts.fresh) {
            daysInLake = 0;
        } else {
            // Khi mới mở hồ đã hoạt động sẵn: ~38% là cá cũ (5–14 ngày), ~62% là cá bồi gần đây (1–4 ngày)
            const isOldInit = (spec.key === 'OLD_CARP' || spec.key === 'BLACK_CARP')
                ? Math.random() < 0.72
                : Math.random() < 0.25;
            daysInLake = isOldInit ? (5 + Math.floor(Math.random() * 10)) : (1 + Math.floor(Math.random() * 4));
        }

        return {
            id: 'ai_fish_' + Math.random().toString(36).slice(2, 8),
            speciesKey: spec.key,
            baseSpeciesName: spec.name,
            speciesName: isTaggedPrize ? `🏅 ${spec.name} [ĐEO KHUYÊN VÀNG]` : spec.name,
            weight,
            isBigCarp: spec.isBig,
            isTaggedPrize,
            prizeBonus: isTaggedPrize ? 200000 : 0,
            isFresh: !!opts.fresh || daysInLake < 2,
            daysInLake,
            freshTimer: opts.fresh ? 600 : 0,
            caution: opts.fresh ? Math.max(0.22, caution * 0.65) : caution,
            hunger,
            fullDaysLeft: satiety >= 0.80 ? Number((0.8 + Math.random() * 0.8).toFixed(1)) : 0, // Số ngày hồ cần tiêu hóa nếu ăn quá no (1-2 ngày)
            // Hồ sơ Ý Thức Riêng (Conscious Mind Profile)
            mind: {
                archetype: archetype.id,
                archetypeLabel: archetype.label,
                suspicion: THREE.MathUtils.clamp(caution * 0.6 + Math.random() * 0.2, 0.15, 0.90), // Độ nghi ngờ bẫy
                satiety,                                                                           // Độ no bụng (0 = rất đói, 1 = no căng)
                hookScars: weight > 7.5 ? Math.floor(1 + Math.random() * 3) : (Math.random() < 0.35 ? 1 : 0), // Số lần từng bị câu trượt
                probesRemaining: Math.random() < archetype.probeTendency ? (weight > 7.0 ? 2 : 1) : 0,
                lastThought: 'Đang bơi tuần tra tự nhiên'
            },
            aiState: AI_FISH_STATES.CRUISE,
            stateTimer: 4.0 + Math.random() * 6.0,
            x,
            z,
            depth: baseDepth,
            targetDepth: baseDepth,
            targetX: x + (Math.random() - 0.5) * 18,
            targetZ: z + (Math.random() - 0.5) * 14,
            speed: 0.75 + Math.random() * 0.45,
            baseSpeed: 0.75 + Math.random() * 0.45,
            swimAngle: Math.random() * Math.PI * 2,
            orbitAngle: Math.random() * Math.PI * 2,
            orbitDir: Math.random() < 0.5 ? 1 : -1,
            tailPhase: Math.random() * Math.PI * 2,
            bubbleCooldown: 0.8 + Math.random() * 2.2,
            nudgeCooldown: 1.5,
            trail: [{ x, z }],
            trailTimer: 0,
            meshGroup
        };
    }

    pickDailyCondition() {
        const rand = Math.random();
        if (rand < 0.25) return LAKE_DAILY_CONDITIONS.LOCKJAW_MOM_DAY;
        if (rand < 0.55) return LAKE_DAILY_CONDITIONS.PICKY_DAY;
        if (rand < 0.85) return LAKE_DAILY_CONDITIONS.NORMAL_DAY;
        return LAKE_DAILY_CONDITIONS.BOOM_DAY;
    }

    getDailyConditionInfo() {
        return this.dailyCondition || LAKE_DAILY_CONDITIONS.NORMAL_DAY;
    }

    setDailyCondition(condKey) {
        if (LAKE_DAILY_CONDITIONS[condKey]) {
            this.dailyCondition = LAKE_DAILY_CONDITIONS[condKey];
            window.dispatchEvent(new CustomEvent('lake_condition_changed', { detail: this.dailyCondition }));
        }
    }

    // Đánh giá hiệu quả chiến thuật Lối Đánh Độc Lập (Câu Cân Đài / Bán Đấu / Hố Đấu giấu thẻo + Câu Lửng)
    // theo giai đoạn ca câu (Đầu ca cá mới gần bờ -> Giữa ca cá giãn ra ngoài -> Gần cuối ca cá giãn xa nhát thẻo)
    getMethodTacticBonus(calibrationId, fish = null, fishingStyleId = 'CAN_DAI') {
        const style = getFishingStyleById(fishingStyleId);
        const calSpec = getCalibrationById(calibrationId);
        const isSuspend = calSpec && (calSpec.rigType === 'SUSPEND_LOW' || calSpec.rigType === 'SUSPEND_TOP');
        const prog = THREE.MathUtils.clamp(this.sessionProgress || 0, 0, 1);
        const isFreshFish = fish ? (fish.isFresh || (fish.daysInLake || 0) < 5) : true;
        const isOldFish = fish ? this.isOldResidentFish(fish) : false;

        let mult = 1.0;
        if (isSuspend) {
            const isLowPress = this.activeEcologyEvent && this.activeEcologyEvent.id === 'LOW_PRESSURE_SUSPEND';
            mult = isLowPress ? 1.48 : ((fish && (fish.speciesKey === 'GRASS_CARP' || fish.speciesKey === 'TILAPIA')) ? 1.28 : 0.90);
        } else if (style.id === 'CAN_DAI') {
            // Câu Cân Đài (trục thẳng đứng): Nhạy nhất đầu ca & cá mới; về cuối ca khi cá giãn xa & nhát thẻo giảm hiệu quả
            if (prog < 0.38) mult = isFreshFish ? 1.32 : 1.02;
            else if (prog < 0.70) mult = isFreshFish ? 0.96 : 0.80;
            else mult = 0.74;
        } else if (style.id === 'BAN_DAU') {
            // Câu Bán Đấu (trục hơi xiên, giấu thẻo nhẹ): Cực hiệu quả giữa ca -> cuối ca & trị Trắm Đen / Chép Lợn
            const isTrophy = fish && (fish.speciesKey === 'BLACK_CARP' || fish.speciesKey === 'OLD_CARP');
            if (prog < 0.35) mult = isTrophy ? 1.28 : 1.04;
            else if (prog < 0.72) mult = isTrophy ? 1.42 : 1.32;
            else mult = isTrophy ? 1.36 : 1.24;
        } else if (style.id === 'HO_DAU') {
            // Câu Hố Đấu (trục xiên 45°, giấu thẻo hoàn toàn sát đáy): Sát thủ số 1 săn Trắm Đen, Chép Lợn & gần cuối ca!
            const isTrophy = fish && (fish.speciesKey === 'BLACK_CARP' || fish.speciesKey === 'OLD_CARP');
            if (prog < 0.35) mult = (isTrophy || isOldFish) ? 1.38 : 0.90;
            else if (prog < 0.70) mult = isTrophy ? 1.48 : 1.18;
            else mult = isTrophy ? 1.58 : 1.40;
        }
        return { style, mult, prog, hideLeaderFactor: style.hideLeaderFactor || 0 };
    }

    // Tỷ lệ cuốn ổ tổng hợp (phụ thuộc: tỉ lệ pha mồi + giấc ăn + lối đánh giấu thẻo + bài cân phao + giai đoạn ca câu)
    computeSpotDrawRate(fish = null) {
        const hook = this.activeHookTarget;
        const bait = hook ? hook.bait : null;
        const calId = hook ? hook.calibrationId : 'can7_cau3';
        const styleId = hook ? (hook.fishingStyle || 'CAN_DAI') : 'CAN_DAI';
        const waterMult = hook ? (hook.waterEffectMultiplier || 1.0) : 1.0;

        // 1. Tỉ lệ nước pha mồi chuẩn (0.72 - 0.95 cuốn ổ đẹp nhất; quá khô hoặc quá nhão giảm cuốn ổ)
        const wr = (bait && typeof bait.waterRatio === 'number') ? bait.waterRatio : 0.80;
        const mixQuality = (wr >= 0.72 && wr <= 0.95) ? 1.18 : (wr < 0.62 || wr > 1.10 ? 0.72 : 0.95);

        // 2. Giấc ăn theo giờ trong ngày
        const fw = this.getFeedingWindowStatus(this.currentHour);
        const feedFactor = fw ? (fw.eatMul || 1.0) : 1.0;

        // 3. Chiến thuật lối đánh (Cân Đài / Bán Đấu / Hố Đấu giấu thẻo) theo giai đoạn ca câu
        const tactic = this.getMethodTacticBonus(calId, fish, styleId);

        return THREE.MathUtils.clamp(0.46 * mixQuality * waterMult * feedFactor * tactic.mult, 0.10, 0.90);
    }

    // Định nghĩa chuẩn Cá Cũ: Bất kỳ con cá nào đã được bồi / sống trong hồ từ 5 ngày trở đi (daysInLake >= 5)!
    isOldResidentFish(fish) {
        if (!fish) return false;
        return (fish.daysInLake || 0) >= 5;
    }

    // Giấc ăn của cá theo khung giờ thực tế trong ngày:
    // - 08:00–10:00 & 16:00–17:00: Giấc ăn mạnh nhất (Giờ Vàng)
    // - 11:30–14:30 & 19:30–21:00: Giờ cá lười — chỉ đè phao, cày ổ mà không ăn
    // - Các giờ khác: Ăn chậm / cầm chừng
    getFeedingWindowStatus(hour = this.currentHour) {
        const h = ((Number(hour) || 9.0) % 24 + 24) % 24;
        if (h >= 8.0 && h < 10.0) {
            return {
                key: 'PEAK_MORNING',
                badge: '🔥 GIẤC ĂN SÁNG (08:00–10:00)',
                desc: 'Giờ vàng sáng! Đàn cá đi ăn mạnh nhất trong ngày, phao báo nhịp dứt khoát!',
                eatMul: 1.52,
                pressFloatOnly: false
            };
        }
        if (h >= 16.0 && h < 17.0) {
            return {
                key: 'PEAK_AFTERNOON',
                badge: '🔥 GIẤC ĂN CHIỀU (16:00–17:00)',
                desc: 'Giờ vàng chiều (4–5h)! Cá vào ổ sục bùn ăn rộ cực mạnh!',
                eatMul: 1.48,
                pressFloatOnly: false
            };
        }
        if ((h >= 11.5 && h < 14.5) || h >= 19.5) {
            return {
                key: 'PRESS_FLOAT_ONLY',
                badge: '😴 GIỜ CÁ LƯỜI — CHỈ ĐÈ PHAO & CÀY Ổ',
                desc: 'Khung giờ cá nghỉ: cá vẫn lượn cày ổ, đè phao tạo nhịp giả nhưng rất khó chịu nuốt lưỡi!',
                eatMul: 0.14,
                pressFloatOnly: true
            };
        }
        return {
            key: 'SLOW_FEED',
            badge: '🌤️ GIỜ ĂN CHẬM',
            desc: 'Ngoài giờ vàng (8–10h & 16–17h), cá đi ăn đều nhẹ và cầm chừng hơn.',
            eatMul: 0.82,
            pressFloatOnly: false
        };
    }

    // Tính tổng khối lượng cá đang tồn dưới hồ (kg)
    getTotalBiomassKg() {
        let total = 0;
        for (let i = 0; i < this.fishSchools.length; i++) {
            total += (this.fishSchools[i].weight || 0);
        }
        return Number(total.toFixed(1));
    }

    initFishSchools() {
        // Giải phóng cá cũ nếu có
        while (this.aiFishGroup.children.length > 0) {
            this.aiFishGroup.remove(this.aiFishGroup.children[0]);
        }
        this.fishSchools = [];

        // Khởi tạo đàn Cá AI theo ĐÚNG SẢN LƯỢNG HỒ THỰC TẾ: 1,5 tấn - 2,0 tấn (1.500kg - 2.000kg)
        // Tự động chia ra số lượng con tương ứng (~230 - 310 con cá AI thật)
        let currentKg = 0;
        let idx = 0;
        while (currentKg < this.targetBiomassKg && idx < 380) {
            let fx, fz;
            if (idx < 28) {
                // Phân bố một nhóm gần khu vực bờ Nam (nơi cần thủ ngồi câu z=18)
                fx = (Math.random() - 0.5) * 110;
                fz = 6.0 + Math.random() * 11.0;
            } else {
                fx = (Math.random() - 0.5) * (this.lakeHalfW * 1.85);
                fz = (Math.random() - 0.5) * (this.lakeHalfD * 1.78);
            }
            const isTagged = idx === 0 || idx === 5 || idx === 18 || idx === 42;
            const fish = this.createAIFishEntity(fx, fz, false, isTagged);

            // TẬP TÍNH CÁ CŨ (từ 5 ngày bồi trở đi): Hay tập tụ ở CUỐI HỒ (Đông hồ x: +34m -> +74m) và cày rất nhiều tăm!
            if (this.isOldResidentFish(fish)) {
                fish.x = this.lakeHalfW * 0.42 + Math.random() * (this.lakeHalfW * 0.50);
                fish.z = (Math.random() - 0.5) * (this.lakeHalfD * 1.55);
                fish.targetX = fish.x + (Math.random() - 0.5) * 10;
                fish.targetZ = fish.z + (Math.random() - 0.5) * 8;
                if (fish.meshGroup) fish.meshGroup.position.set(fish.x, fish.depth, fish.z);
                if (fish.mind) {
                    fish.mind.lastThought = `🧓 Cá cũ (${fish.daysInLake} ngày) tụ đàn cuối hồ, cày tăm dày & chỉ mê Ốc ngâm / Ngô ủ`;
                }
            }
            this.fishSchools.push(fish);
            currentKg += fish.weight;
            idx++;
        }
    }

    // KỊCH BẢN ĐỜI THỰC #1: Chủ hồ đổ xe bồi cá mới + thả Cá Đeo Khuyên thưởng nóng 200,000đ
    spawnPrizeStockingWave(nearX = 0, nearZ = 12) {
        soundManager.playWaterSplash(1.8);
        for (let i = 0; i < 2; i++) {
            const fx = THREE.MathUtils.clamp(nearX + (Math.random() - 0.5) * 6.0, -this.lakeHalfW + 4, this.lakeHalfW - 4);
            const fz = THREE.MathUtils.clamp(nearZ + (Math.random() - 0.5) * 4.0, -this.lakeHalfD + 4, this.lakeHalfD - 4);
            const prizeFish = this.createAIFishEntity(fx, fz, true, true);
            prizeFish.aiState = AI_FISH_STATES.SMELL_SEEK;
            prizeFish.targetX = nearX;
            prizeFish.targetZ = nearZ;
            if (this.fishSchools.length < 36) {
                this.fishSchools.push(prizeFish);
            }
            this.spawnCarpBubbles(fx, fz, true, true);
            this.spawnRipple(fx, fz, 1.6);
        }
        // Đàn cá trong hồ bị kích thích tranh ăn mạnh hơn
        this.fishSchools.forEach(f => {
            f.hunger = Math.min(1.0, f.hunger + 0.25);
            if (f.mind) f.mind.satiety = Math.max(0.1, f.mind.satiety - 0.25);
        });
    }

    // BỒI CÁ ĐỊNH KỲ CỦA CHỦ HỒ (1 lần/ngày hoặc 2 ngày/lần): Đổ xe cá mới gần khu nhà lán, cá lên rất tơi, phàm ăn
    spawnStockingBatch(nearX = 0, nearZ = -14, count = 12) {
        soundManager.playWaterSplash(2.0);
        const added = [];
        for (let i = 0; i < count; i++) {
            const fx = THREE.MathUtils.clamp(nearX + (Math.random() - 0.5) * 18.0, -this.lakeHalfW + 4, this.lakeHalfW - 4);
            const fz = THREE.MathUtils.clamp(nearZ + (Math.random() - 0.5) * 5.0, -this.lakeHalfD + 4, this.lakeHalfD - 4);
            const isPrize = i < 2;
            const fish = this.createAIFishEntity(fx, fz, i % 3 !== 2, isPrize, { fresh: true });
            fish.aiState = AI_FISH_STATES.CRUISE;
            fish.targetX = fx + (Math.random() - 0.5) * 24;
            fish.targetZ = fz + Math.random() * 20;
            this.fishSchools.push(fish);
            added.push(fish);
            this.spawnCarpBubbles(fx, fz, true, true);
            this.spawnRipple(fx, fz, 1.8);
        }
        // Duy trì tổng sinh khối hồ không vượt quá ~2,05 tấn (2.050kg)
        while (this.getTotalBiomassKg() > this.maxBiomassKg + 80 && this.fishSchools.length > 120) {
            const idx = this.fishSchools.findIndex(f => !f.isFresh && !f.isTaggedPrize);
            if (idx < 0) break;
            const old = this.fishSchools.splice(idx, 1)[0];
            if (old.meshGroup) this.aiFishGroup.remove(old.meshGroup);
        }
        this.fishSchools.forEach(f => {
            f.hunger = Math.min(1.0, f.hunger + 0.2);
        });
        return added.length;
    }

    // Độ hợp khẩu vị của 1 con cá với mồi đang ngâm dưới nước
    getFishAffinity(fish) {
        const bait = this.activeHookTarget ? this.activeHookTarget.bait : null;
        return getDietAffinity(fish.speciesKey, getBaitKinds(bait));
    }

    getFishEatSlowness(fish) {
        const bait = this.activeHookTarget ? this.activeHookTarget.bait : null;
        let slow = getEatSlowness(fish.speciesKey, fish.weight, getBaitKinds(bait));
        if (fish.isFresh) slow *= 0.65;
        return slow;
    }

    // Kiểm tra tại vị trí lưỡi câu đã có ổ mồi xả dẫn dụ chưa
    hasGroundBaitNear(x, z, maxDist = 5.5) {
        return this.groundBaitSpots.some(sp => Math.hypot(sp.x - x, sp.z - z) <= maxDist);
    }

    // Đăng ký vị trí lưỡi câu / phao đang ngâm dưới nước để Cá AI chủ động đánh hơi, lượn vòng dò xét và ăn mồi
    setHookBaitTarget(targetInfo) {
        this.activeHookTarget = targetInfo;
        if (!targetInfo) return;

        // Tiếng chì và mồi rơi xuống nước làm cá ngay sát đó hơi giật mình nhẹ nếu bổ cần liên tục
        const hasGround = this.hasGroundBaitNear(targetInfo.x, targetInfo.z);
        this.lastMindLog = hasGround
            ? '🥣 Ổ câu đã có nền mồi xả — Đàn cá quanh vùng đang đánh hơi tiến vào thăm dò...'
            : '⚠️ Chưa xả mồi tụ ổ (Phím F) — Chỉ có mồi đơn lẻ trên lưỡi, cá sẽ rất lâu mới phát hiện và cảnh giác cao!';

        this.fishSchools.forEach(fish => {
            if (fish.aiState === AI_FISH_STATES.STARTLED_FLEE) return;
            const d = Math.hypot(fish.x - targetInfo.x, fish.z - targetInfo.z);
            // Nếu chưa xả mồi tụ ổ, bán kính mùi chỉ bằng 45% so với khi đã xả ổ!
            const groundBonus = hasGround ? 1.15 : 0.48;
            const scentRange = 15.0 * (targetInfo.waterEffectMultiplier || 1.0) * groundBonus;
            const interest = Math.min(1.0, this.getFishAffinity(fish) * 0.65 * (1.0 - this.spotAlertLevel * 0.4));
            if (d < scentRange && Math.random() < 0.42 * interest) {
                fish.aiState = AI_FISH_STATES.SMELL_SEEK;
                fish.targetX = targetInfo.x + (Math.random() - 0.5) * 2.0;
                fish.targetZ = targetInfo.z + (Math.random() - 0.5) * 2.0;
                fish.stateTimer = 8.0 + Math.random() * 6.0;
            }
        });
    }

    clearHookBaitTarget() {
        this.activeHookTarget = null;
        this.fishSchools.forEach(fish => {
            if (
                fish.aiState === AI_FISH_STATES.INSPECT_BAIT ||
                fish.aiState === AI_FISH_STATES.PROBE_BLOW ||
                fish.aiState === AI_FISH_STATES.FEED_BITE
            ) {
                fish.aiState = AI_FISH_STATES.CRUISE;
                fish.targetDepth = -1.45;
                fish.stateTimer = 4.0;
            }
        });
    }

    // Khi cần thủ giật hụt động ổ hoặc nổ trục, cá AI xung quanh hoảng sợ phóng chạy tán loạn & tăng mạnh độ cảnh giác!
    scareFishNear(x, z, radius = 10.0) {
        let scaredCount = 0;
        this.spotAlertLevel = Math.min(0.95, this.spotAlertLevel + 0.28);
        this.lastMindLog = `🚨 ĐỘNG Ổ! Mức độ cảnh giác dưới đáy tăng lên ${Math.round(this.spotAlertLevel * 100)}% — Cá khôn sẽ né lưỡi câu!`;

        this.fishSchools.forEach(fish => {
            const dx = fish.x - x;
            const dz = fish.z - z;
            const dist = Math.hypot(dx, dz);
            if (dist < radius) {
                scaredCount++;
                fish.aiState = AI_FISH_STATES.STARTLED_FLEE;
                fish.stateTimer = 5.5 + Math.random() * 4.0;
                if (fish.mind) {
                    fish.mind.suspicion = Math.min(0.98, fish.mind.suspicion + 0.25);
                    fish.mind.hookScars += 1;
                    fish.mind.lastThought = 'Hoảng sợ vì tiếng giật cần / nổ trục!';
                }
                const fleeAngle = Math.atan2(dz, dx) + (Math.random() - 0.5) * 0.6;
                fish.targetX = THREE.MathUtils.clamp(fish.x + Math.cos(fleeAngle) * 28, -this.lakeHalfW + 4, this.lakeHalfW - 4);
                fish.targetZ = THREE.MathUtils.clamp(fish.z + Math.sin(fleeAngle) * 24, -this.lakeHalfD + 4, this.lakeHalfD - 4);
                fish.targetDepth = -1.65;
                fish.speed = 5.8 + Math.random() * 1.8;

                this.spawnRipple(fish.x, fish.z, 1.4);
                this.spawnCarpBubbles(fish.x, fish.z, true, true);
            }
        });
        return scaredCount;
    }

    // Sinh đàn cá AI tụ tăm ngay ổ câu trước mũi cần (khi xả mồi)
    spawnFishNearSpot(spotX, spotZ) {
        this.gatherCenter.set(spotX, spotZ);
        if (this.fishSchools.length < 34) {
            for (let i = 0; i < 2; i++) {
                const offsetX = (Math.random() - 0.5) * 4.5;
                const offsetZ = (Math.random() - 0.5) * 4.5;
                const newFish = this.createAIFishEntity(
                    THREE.MathUtils.clamp(spotX + offsetX, -this.lakeHalfW + 3, this.lakeHalfW - 3),
                    THREE.MathUtils.clamp(spotZ + offsetZ, -this.lakeHalfD + 3, this.lakeHalfD - 3),
                    true
                );
                newFish.aiState = AI_FISH_STATES.SMELL_SEEK;
                newFish.targetX = spotX + (Math.random() - 0.5) * 2.2;
                newFish.targetZ = spotZ + (Math.random() - 0.5) * 2.2;
                this.fishSchools.push(newFish);
                this.spawnCarpBubbles(newFish.x, newFish.z, true);
            }
        }
    }

    // CƠ CHẾ GIỮ Ổ THỰC TẾ:
    // - Câu được 1 con mà không xả bồi: Cá quanh ổ CẢNH GIÁC cao, nhiều con nhát chê mồi quay đầu!
    // - Câu được 2 con liên tiếp mà không xả bồi: TÀN Ổ! Đàn cá tản hết, ổ mồi cũ tan sạch, cực kỳ khó ăn!
    onFishCaughtAtSpot(x, z, caughtFish = null) {
        this.catchesWithoutRebait += 1;

        // Xóa chính xác con cá vừa câu được khỏi đàn 1,5–2 tấn dưới hồ để tổng sinh khối giảm thật!
        if (caughtFish && this.fishSchools.length > 0) {
            let removeIdx = -1;
            if (caughtFish.aiFishId) {
                removeIdx = this.fishSchools.findIndex(f => f.id === caughtFish.aiFishId);
            }
            if (removeIdx < 0) {
                // Fallback: tìm con gần ổ cùng loài có cân nặng gần nhất
                let bestScore = 9999;
                this.fishSchools.forEach((f, i) => {
                    if (caughtFish.speciesKey && f.speciesKey !== caughtFish.speciesKey) return;
                    const score = Math.hypot(f.x - x, f.z - z) + Math.abs((f.weight || 5) - (caughtFish.weight || 5)) * 2;
                    if (score < bestScore) { bestScore = score; removeIdx = i; }
                });
            }
            if (removeIdx >= 0) {
                const removed = this.fishSchools.splice(removeIdx, 1)[0];
                if (removed && removed.meshGroup) {
                    this.aiFishGroup.remove(removed.meshGroup);
                }
            }
        }

        if (this.catchesWithoutRebait === 1) {
            this.spotAlertLevel = Math.min(0.95, Math.max(0.54, this.spotAlertLevel + 0.34));
            let shyCount = 0;
            this.fishSchools.forEach(fish => {
                const d = Math.hypot(fish.x - x, fish.z - z);
                if (d < 16.0) {
                    if (fish.mind) {
                        fish.mind.suspicion = Math.min(0.96, (fish.mind.suspicion || 0.4) + 0.26);
                    }
                    if (Math.random() < 0.60) {
                        fish.aiState = AI_FISH_STATES.REJECT_TURN;
                        fish.stateTimer = 10.0 + Math.random() * 6.0;
                        const away = Math.atan2(fish.z - z, fish.x - x) + (Math.random() - 0.5) * 0.8;
                        fish.targetX = THREE.MathUtils.clamp(fish.x + Math.cos(away) * 14, -this.lakeHalfW + 4, this.lakeHalfW - 4);
                        fish.targetZ = THREE.MathUtils.clamp(fish.z + Math.sin(away) * 11, -this.lakeHalfD + 4, this.lakeHalfD - 4);
                        if (fish.mind) fish.mind.lastThought = '⚠️ Đồng loại vừa bị kéo lên mà không có mồi xả bồi — cảnh giác lùi ra!';
                        shyCount++;
                    }
                }
            });
            this.lastMindLog = `⚠️ CÂU 1 CON CHƯA XẢ BỒI: Cảnh giác ổ vọt lên ${Math.round(this.spotAlertLevel * 100)}% (${shyCount} con nhát lùi ra)! Hãy bấm Xả Ổ (F) để giữ ổ!`;
            window.dispatchEvent(new CustomEvent('real_life_scenario', {
                detail: {
                    title: '⚠️ CÁ ĐANG CẢNH GIÁC — HÃY XẢ BỒI GIỮ Ổ!',
                    desc: 'Bạn vừa câu lên 1 con nhưng chưa xả bồi lại! Đàn cá quanh ổ đang rất cảnh giác — nếu câu thêm 1 con nữa mà không xả (F) sẽ TÀN Ổ ngay!',
                    type: 'WARN'
                }
            }));
        } else if (this.catchesWithoutRebait >= 2) {
            this.spotCollapsed = true;
            this.spotAlertLevel = Math.min(0.98, Math.max(0.86, this.spotAlertLevel + 0.35));
            // Xóa sạch các ổ mồi xả cũ trong bán kính 14m vì đã tàn ổ
            this.groundBaitSpots = this.groundBaitSpots.filter(sp => Math.hypot(sp.x - x, sp.z - z) > 14.0);

            let fledCount = 0;
            this.fishSchools.forEach(fish => {
                const d = Math.hypot(fish.x - x, fish.z - z);
                if (d < 22.0) {
                    fish.aiState = Math.random() < 0.55 ? AI_FISH_STATES.STARTLED_FLEE : AI_FISH_STATES.REJECT_TURN;
                    fish.stateTimer = 12.0 + Math.random() * 8.0;
                    fish.ignoreGroundbaitTimer = 20.0 + Math.random() * 14.0;
                    const away = Math.atan2(fish.z - z, fish.x - x) + (Math.random() - 0.5) * 0.9;
                    fish.targetX = THREE.MathUtils.clamp(fish.x + Math.cos(away) * 22, -this.lakeHalfW + 4, this.lakeHalfW - 4);
                    fish.targetZ = THREE.MathUtils.clamp(fish.z + Math.sin(away) * 16, -this.lakeHalfD + 4, this.lakeHalfD - 4);
                    fish.speed = 3.8 + Math.random() * 1.5;
                    if (fish.mind) {
                        fish.mind.suspicion = Math.min(0.98, (fish.mind.suspicion || 0.5) + 0.35);
                        fish.mind.lastThought = '🚨 Tàn ổ! Đã 2 con bị kéo lên liên tiếp không xả bồi — sợ hãi tản đi!';
                    }
                    fledCount++;
                }
            });
            this.lastMindLog = `🚨 TÀN Ổ RỒI! Câu ${this.catchesWithoutRebait} con liên tiếp không xả bồi — ${fledCount} con tản sạch, cá cực kỳ khó ăn! Bấm Xả Ổ (F) để gây lại ổ mới!`;
            window.dispatchEvent(new CustomEvent('real_life_scenario', {
                detail: {
                    title: '🚨 TÀN Ổ RỒI — CÁ TẢN HẾT, CỰC KỲ KHÓ ĂN!',
                    desc: `Bạn đã câu liên tiếp ${this.catchesWithoutRebait} con mà không xả bồi giữ ổ! Ổ cũ đã tan sạch và cá sợ hãi bỏ đi — hãy bấm Xả Ổ (F) để gây lại ổ mới!`,
                    type: 'WARN'
                }
            }));
        }
    }

    // Xả mồi dẫn dụ Cá AI vào ổ & làm dịu sự cảnh giác dưới đáy
    addGroundBaitSpot(x, z, groundBaitInfo) {
        this.gatherCenter.set(x, z);
        this.catchesWithoutRebait = 0; // Đã xả bồi giữ ổ -> reset đếm tàn ổ
        this.spotCollapsed = false;
        this.spotOverfeedCount += 1;
        this.spotAlertLevel = Math.max(0.08, this.spotAlertLevel - 0.22);

        // Thực tế câu đài: Cá ăn mồi xả nhiều quá sẽ NO CĂNG BỤNG, phải 1-2 ngày sau mới tiêu hóa đói lại!
        let newlyFullCount = 0;
        this.fishSchools.forEach(fish => {
            const dist = Math.hypot(fish.x - x, fish.z - z);
            if (dist < 18.0 && fish.mind) {
                const feedGain = dist < 8.0 ? (0.18 + Math.random() * 0.12) : (0.10 + Math.random() * 0.08);
                fish.mind.satiety = Math.min(1.0, (fish.mind.satiety || 0.25) + feedGain);
                fish.hunger = THREE.MathUtils.clamp(1.0 - fish.mind.satiety * 0.92, 0.05, 1.0);

                if (fish.mind.satiety >= 0.84 && (fish.fullDaysLeft || 0) <= 0) {
                    // Ăn no căng mồi xả -> bỏ ăn 1.0 đến 2.0 ngày hồ mới tiêu hóa đói lại!
                    fish.fullDaysLeft = Number((1.0 + Math.random() * 1.0).toFixed(1));
                    fish.hunger = 0.06;
                    fish.aiState = AI_FISH_STATES.CRUISE;
                    fish.mind.lastThought = `🤢 Ăn no căng mồi xả! Phải ${fish.fullDaysLeft} ngày sau mới tiêu hóa đói lại`;
                    newlyFullCount++;
                }
            }
        });

        if (newlyFullCount >= 2 || this.spotOverfeedCount >= 6) {
            this.lastMindLog = `⚠️ XẢ QUÁ TAY (${this.spotOverfeedCount} nắm)! ${newlyFullCount > 0 ? newlyFullCount + ' con cá' : 'Đàn cá'} đã ăn NO CĂNG mồi xả — sẽ bỏ ăn 1–2 ngày tới mới tiêu hóa đói lại!`;
            window.dispatchEvent(new CustomEvent('real_life_scenario', {
                detail: {
                    title: '⚠️ XẢ MỒI QUÁ TAY — CÁ ĂN NO CĂNG BỤNG!',
                    desc: `Đàn cá quanh ổ đã ăn no căng vụn mồi xả! Những con no sẽ khóa mồm 1–2 ngày hồ sau mới tiêu hóa đói trở lại — đừng xả dồn quá nhiều!`,
                    type: 'WARN'
                }
            }));
        } else {
            this.lastMindLog = `🥣 Cám xả bung tỏa đáy bùn — Cá đang vào nhặt mồi (Lưu ý: xả quá 5-6 nắm cá sẽ ăn no 1-2 ngày!)`;
        }

        const newSpot = {
            id: 'spot_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            x,
            z,
            radius: groundBaitInfo ? groundBaitInfo.scentRadius : 22,
            duration: 180,
            efficiency: groundBaitInfo ? groundBaitInfo.fishGatherSpeed : 1.5,
            bubbleSpurRate: groundBaitInfo ? groundBaitInfo.bubbleSpurRate : 2.0,
            name: groundBaitInfo ? groundBaitInfo.name : 'Mồi Xả Chép'
        };
        this.groundBaitSpots.push(newSpot);

        soundManager.playWaterSplash(1.5);
        for (let i = 0; i < 6; i++) {
            this.spawnRipple(x + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6, 0.8 + i * 0.3);
        }

        // THỰC TẾ ĐỜI THỰC: Xả ổ xong KHÔNG PHẢI CON NÀO CŨNG VÀO Ổ!
        // Từng con cá tự quyết định: có con vào ổ, có con rẽ sang ổ khác, có con bơi ven bờ / dạo quanh hồ / nằm nghỉ không muốn ăn!
        const otherSpots = this.groundBaitSpots.filter(s => s.id !== newSpot.id);
        let enteredCount = 0;
        let ignoredCount = 0;

        this.fishSchools.forEach(fish => {
            if (fish.aiState === AI_FISH_STATES.STARTLED_FLEE) return;
            const dx = fish.x - x;
            const dz = fish.z - z;
            const dist = Math.hypot(dx, dz);
            if (dist >= 35) return;

            fish._decidedSpotId = newSpot.id;
            const isFull = (fish.fullDaysLeft || 0) > 0 || (fish.mind && fish.mind.satiety >= 0.72);

            // 1. Cá đang no bụng -> Phớt lờ ổ xả, tiếp tục bơi dạo quanh hồ không muốn ăn
            if (isFull) {
                fish.ignoreGroundbaitTimer = 38 + Math.random() * 28;
                fish.aiState = AI_FISH_STATES.CRUISE;
                fish.targetX = THREE.MathUtils.clamp(fish.x + (Math.random() - 0.5) * 32, -this.lakeHalfW + 4, this.lakeHalfW - 4);
                fish.targetZ = THREE.MathUtils.clamp(fish.z + (Math.random() - 0.5) * 18, -this.lakeHalfD + 4, this.lakeHalfD - 4);
                if (fish.mind) fish.mind.lastThought = '😴 Không đói — phớt lờ ổ mồi xả, tiếp tục bơi dạo quanh hồ';
                ignoredCount++;
                return;
            }

            // 2. Cá nhát giật mình vì tiếng nắm mồi rơi ngay sát đầu -> Tản ra xa chỗ khác
            if (dist < 5.5 && fish.caution > 0.58 && Math.random() < 0.45) {
                fish.ignoreGroundbaitTimer = 22 + Math.random() * 18;
                fish.aiState = AI_FISH_STATES.REJECT_TURN;
                fish.stateTimer = 4.5;
                const away = Math.atan2(dz, dx) + (Math.random() - 0.5) * 0.8;
                fish.targetX = THREE.MathUtils.clamp(fish.x + Math.cos(away) * 16, -this.lakeHalfW + 4, this.lakeHalfW - 4);
                fish.targetZ = THREE.MathUtils.clamp(fish.z + Math.sin(away) * 12, -this.lakeHalfD + 4, this.lakeHalfD - 4);
                if (fish.mind) fish.mind.lastThought = '💦 Giật mình tiếng mồi xả rơi sát bên, lẩn ra chỗ khác!';
                ignoredCount++;
                return;
            }

            // 3. Nếu hồ có ổ xả khác -> Một số con lại rẽ sang ổ xả khác chứ không vào ổ này
            if (otherSpots.length > 0 && Math.random() < 0.28) {
                const alt = otherSpots[Math.floor(Math.random() * otherSpots.length)];
                fish.aiState = AI_FISH_STATES.SMELL_SEEK;
                fish.targetX = alt.x + (Math.random() - 0.5) * 2.8;
                fish.targetZ = alt.z + (Math.random() - 0.5) * 2.8;
                fish.speed = fish.baseSpeed * 1.1;
                if (fish.mind) fish.mind.lastThought = '🧭 Bỏ qua ổ này, rẽ sang tụ ở một ổ mồi xả khác trong hồ';
                ignoredCount++;
                return;
            }

            // 4. Tính xác suất thực sự hứng thú vào ổ (cân bằng vừa tay: tối đa ~14 con rẽ vào ổ cùng lúc)
            let attractProb = 0.24 + (fish.hunger || 0.5) * 0.32;
            if (fish.isFresh) attractProb += 0.14;
            if (this.isOldResidentFish(fish) && dist > 14.0) attractProb *= 0.42; // Cá cũ thích tụ cuối hồ, ít chịu bỏ chỗ chạy xa

            if (enteredCount < 14 && Math.random() < attractProb) {
                fish.aiState = AI_FISH_STATES.SMELL_SEEK;
                fish.targetX = x + (Math.random() - 0.5) * 2.8;
                fish.targetZ = z + (Math.random() - 0.5) * 2.8;
                fish.speed = 1.25;
                fish.ignoreGroundbaitTimer = 0;
                if (fish.mind) {
                    fish.mind.suspicion = Math.max(0.12, fish.mind.suspicion - 0.12);
                    fish.mind.lastThought = '👃 Đánh hơi thấy mùi mồi xả thơm, đang rẽ hướng tiến vào ổ';
                }
                enteredCount++;
            } else if (fish.caution >= 0.62 && dist < 14.0 && Math.random() < 0.45) {
                // Cá nhát thấy tiếng động xả ổ hoặc nghi ngờ bẫy -> Chê mồi quay đầu bỏ đi (hiện rõ trong mục 🔴 Nhát/Chê!)
                fish.ignoreGroundbaitTimer = 26 + Math.random() * 24;
                fish.aiState = AI_FISH_STATES.REJECT_TURN;
                fish.stateTimer = 10.0 + Math.random() * 6.0;
                const away = Math.atan2(dz, dx) + (Math.random() - 0.5) * 0.9;
                fish.targetX = THREE.MathUtils.clamp(fish.x + Math.cos(away) * 15, -this.lakeHalfW + 4, this.lakeHalfW - 4);
                fish.targetZ = THREE.MathUtils.clamp(fish.z + Math.sin(away) * 12, -this.lakeHalfD + 4, this.lakeHalfD - 4);
                if (fish.mind) fish.mind.lastThought = '🔴 Cá nhát nghi ngờ bẫy ở ổ mồi xả — quay đầu bỏ đi!';
                ignoredCount++;
            } else {
                // Cá không muốn ăn / tự do làm hành động khác: đi ven bờ, bơi lượn quanh hồ, hoặc tụ cuối hồ
                fish.ignoreGroundbaitTimer = 28 + Math.random() * 32;
                const actionRoll = Math.random();
                if (actionRoll < 0.38) {
                    fish.aiState = AI_FISH_STATES.PATROL_BANK;
                    const margin = 3.2 + Math.random() * 2.2;
                    fish.targetX = (Math.random() - 0.5) * (this.lakeHalfW * 1.6);
                    fish.targetZ = Math.random() < 0.5 ? (this.lakeHalfD - margin) : (-this.lakeHalfD + margin);
                    if (fish.mind) fish.mind.lastThought = '🌿 Không màng ổ xả, rẽ ra đi dạo ven bờ kiếm ăn tự nhiên';
                } else {
                    fish.aiState = AI_FISH_STATES.CRUISE;
                    fish.targetX = THREE.MathUtils.clamp((Math.random() - 0.5) * (this.lakeHalfW * 1.7), -this.lakeHalfW + 4, this.lakeHalfW - 4);
                    fish.targetZ = THREE.MathUtils.clamp((Math.random() - 0.5) * (this.lakeHalfD * 1.6), -this.lakeHalfD + 4, this.lakeHalfD - 4);
                    if (fish.mind) fish.mind.lastThought = '🐟 Không muốn ăn — bơi đi chỗ khác lượn quanh hồ';
                }
                ignoredCount++;
            }
        });

        if (newlyFullCount < 2 && this.spotOverfeedCount < 6) {
            this.lastMindLog = `🥣 Đã xả ổ! ${enteredCount} con đánh hơi tiến vào ổ, ${ignoredCount} con khác bỏ qua đi dạo quanh hồ / rẽ ổ khác.`;
        }
    }

    // Đổi tập tính hoạt động của đàn cá dưới đáy hồ: Tụ 1 ổ <-> Đi ven bờ kiếm ăn <-> Không ăn / Ăn rất chậm
    setFishHabitMode(mode, duration = 42.0, announce = true) {
        this.currentHabitMode = mode;
        this.habitTimer = duration;

        // Chọn một tọa độ ven bờ hoặc ổ tụ nếu chuyển trạng thái
        if (mode === FISH_HABIT_MODES.GATHER_SPOT) {
            if (this.groundBaitSpots.length > 0) {
                const sp = this.groundBaitSpots[this.groundBaitSpots.length - 1];
                this.gatherCenter.set(sp.x, sp.z);
            } else if (this.activeHookTarget) {
                this.gatherCenter.set(this.activeHookTarget.x, this.activeHookTarget.z);
            }
            this.fishSchools.forEach((f, idx) => {
                if (idx < 14 && f.aiState !== AI_FISH_STATES.STARTLED_FLEE) {
                    f.aiState = AI_FISH_STATES.SMELL_SEEK;
                    f.targetX = this.gatherCenter.x + (Math.random() - 0.5) * 3.0;
                    f.targetZ = this.gatherCenter.y + (Math.random() - 0.5) * 3.0;
                }
            });
        } else if (mode === FISH_HABIT_MODES.BANK_FORAGE) {
            // Điều hướng đàn cá dạt vào sát 4 mép bờ kè đá chữ nhật để đi tuần kiếm ăn ven bờ
            this.fishSchools.forEach((f, idx) => {
                if (f.aiState === AI_FISH_STATES.STARTLED_FLEE) return;
                f.aiState = AI_FISH_STATES.PATROL_BANK;
                const bankSide = idx % 4;
                const margin = 3.2 + Math.random() * 2.5;
                if (bankSide === 0) {
                    // Ven bờ Nam
                    f.targetX = (Math.random() - 0.5) * (this.lakeHalfW * 1.7);
                    f.targetZ = this.lakeHalfD - margin;
                } else if (bankSide === 1) {
                    // Ven bờ Đông
                    f.targetX = this.lakeHalfW - margin;
                    f.targetZ = (Math.random() - 0.5) * (this.lakeHalfD * 1.7);
                } else if (bankSide === 2) {
                    // Ven bờ Tây
                    f.targetX = -this.lakeHalfW + margin;
                    f.targetZ = (Math.random() - 0.5) * (this.lakeHalfD * 1.7);
                } else {
                    // Ven bờ Bắc
                    f.targetX = (Math.random() - 0.5) * (this.lakeHalfW * 1.7);
                    f.targetZ = -this.lakeHalfD + margin;
                }
            });
        } else if (mode === FISH_HABIT_MODES.SLOW_LOCKJAW) {
            // Cá lừng khừng, ăn rất chậm hoặc khóa mồm nằm đáy
            this.fishSchools.forEach(f => {
                f.hunger = Math.max(0.28, f.hunger * 0.65);
                f.speed = f.baseSpeed * 0.45;
            });
        }

        if (announce) {
            const info = this.getHabitStatusInfo();
            window.dispatchEvent(new CustomEvent('fish_habit_changed', { detail: info }));
        }
    }

    getHabitStatusInfo() {
        if (this.currentHabitMode === FISH_HABIT_MODES.GATHER_SPOT) {
            return {
                mode: this.currentHabitMode,
                badge: '🫧 Tăm Cá: Đang Tụ Ổ Sục Bùn',
                desc: 'Cá đang tụ tập trung ở 1 ổ sủi tăm chép dày đặc! Bổ cần trúng ổ cá sẽ đè phao rất nhanh!',
                biteSpeedMultiplier: 1.28
            };
        } else if (this.currentHabitMode === FISH_HABIT_MODES.BANK_FORAGE) {
            return {
                mode: this.currentHabitMode,
                badge: '🌿 Tăm Cá: Đi Ven Bờ Kiếm Ăn',
                desc: 'Đàn cá đang tản ra đi tuần sát mép bờ kè kiếm ăn, nổi vệt tăm dài dọc ven bờ!',
                biteSpeedMultiplier: 1.0
            };
        } else {
            return {
                mode: this.currentHabitMode,
                badge: '😴 Tăm Cá: Ăn Rất Chậm / Khóa Mồm',
                desc: 'Cá đang lừng khừng biến ăn, chỉ sủi 1-2 hạt tăm lẻ và ăn mồi rất chậm! Hãy xả thêm mồi (F) để kích cá!',
                biteSpeedMultiplier: 0.42
            };
        }
    }

    // Sinh chùm bọt tăm chép sủi bùn chân thực (Kích thước chuẩn đời thực: li ti 4mm - 18mm, sủi thành tổ đọng trên mặt nước)
    spawnCarpBubbles(x, z, isBigCarp = false, isDunkRun = false) {
        const isSlowMode = this.currentHabitMode === FISH_HABIT_MODES.SLOW_LOCKJAW;
        // Số hạt tăm trong một chùm tổ:
        // Chép cụ sục ổ: tổ 6 - 11 hạt; Bình thường: 3 - 7 hạt; Chậm/Khóa mồm: 1 - 2 hạt đơn lẻ
        const count = isDunkRun
            ? 8
            : (isSlowMode
                ? (Math.random() < 0.35 ? 2 : 1)
                : (isBigCarp ? (6 + Math.floor(Math.random() * 5)) : (3 + Math.floor(Math.random() * 4))));

        for (let i = 0; i < count; i++) {
            // Độ trễ xuất hiện nối tiếp tự nhiên giữa các hạt bọt trong cùng một tổ tăm (cách nhau 40ms - 90ms)
            const delayMs = i * (45 + Math.random() * 55);
            setTimeout(() => {
                const mesh = new THREE.Mesh(this.bubbleGeo, this.bubbleMat);
                // Bán kính cụm tổ tăm chép gom gọn: 6cm - 16cm quanh điểm cá sục bùn
                const spread = isBigCarp ? 0.16 : 0.09;
                const startX = x + (Math.random() - 0.5) * spread;
                const startZ = z + (Math.random() - 0.5) * spread;
                const startY = -1.2 - Math.random() * 0.4;

                mesh.position.set(startX, startY, startZ);

                // Kích thước hạt bọt chuẩn đời thực (base radius = 0.012m = 12mm):
                // - Hạt li ti (đầu tăm/rô phi/diếc): scale 0.28 - 0.45 (đường kính 7mm - 11mm)
                // - Hạt chép vừa: scale 0.45 - 0.75 (đường kính 11mm - 18mm)
                // - Hạt chép cụ/trắm đen: scale 0.75 - 1.15 (đường kính 18mm - 28mm)
                const scale = isBigCarp
                    ? (0.62 + Math.random() * 0.52)
                    : (0.32 + Math.random() * 0.38);
                mesh.scale.set(scale, scale, scale);

                this.scene.add(mesh);
                this.bubbles.push({
                    mesh,
                    scale,
                    speedY: 0.75 + Math.random() * 0.35, // Tốc độ ngoi tự nhiên từ đáy bùn lên
                    driftX: (Math.random() - 0.5) * 0.03,
                    driftZ: (Math.random() - 0.5) * 0.03,
                    isBigCarp,
                    wobble: Math.random() * Math.PI * 2,
                    wobbleSpeed: 4.0 + Math.random() * 4.0,
                    // Trạng thái đọng dập dềnh trên mặt nước (Surface Floating)
                    state: 'RISING',
                    surfaceTimer: 0.9 + Math.random() * 1.8, // Đọng lại trên mặt nước 0.9s - 2.7s trước khi vỡ bụp
                    surfaceBobPhase: Math.random() * Math.PI * 2
                });

                // Giữ số lượng bọt tối đa trong tầm kiểm soát (tối đa 180 bọt toàn hồ để đảm bảo mượt 60 FPS)
                if (this.bubbles.length > 180) {
                    const oldB = this.bubbles.shift();
                    if (oldB && oldB.mesh) this.scene.remove(oldB.mesh);
                }
            }, delayMs);
        }

        if (Math.random() < 0.45) {
            soundManager.playFishBubble();
        }
    }

    // Vệt tăm dầm chạy (Cá ủi bùn di chuyển tạo thành dải tăm nối đuôi nhau)
    spawnMudRunBubbles(startX, startZ, endX, endZ, count = 8) {
        for (let i = 0; i < count; i++) {
            const progress = i / count;
            const px = startX + (endX - startX) * progress + (Math.random() - 0.5) * 0.06;
            const pz = startZ + (endZ - startZ) * progress + (Math.random() - 0.5) * 0.06;
            setTimeout(() => {
                this.spawnCarpBubbles(px, pz, true, false);
            }, i * 160);
        }
    }

    // Gợn sóng tăm cá li ti (Micro Ripples - gợn lăn tăn cực nhỏ 4cm - 14cm khi hạt tăm chạm mặt nước hoặc vỡ)
    spawnMicroRipple(x, z, maxScale = 1.0) {
        const mesh = new THREE.Mesh(this.microRippleGeo, this.microRippleMat.clone());
        mesh.position.set(x, 0.008, z);
        this.scene.add(mesh);
        this.ripples.push({
            mesh,
            scale: 0.2,
            maxScale,
            opacity: 0.72,
            speed: 0.85,
            isMicro: true
        });
    }

    // Gợn sóng tròn đồng tâm lớn (Dành cho cá nhảy bo cá, quả chì rơi đập nước, quạt nước)
    spawnRipple(x, z, maxRadius = 0.5) {
        const mesh = new THREE.Mesh(this.rippleGeo, this.rippleMat.clone());
        mesh.position.set(x, 0.02, z);
        this.scene.add(mesh);
        this.ripples.push({
            mesh,
            scale: 0.25,
            maxRadius,
            opacity: 0.78,
            speed: 0.65,
            isMicro: false
        });
    }

    // Đánh giá quyết định có ý thức của từng cá thể sau khi ngửi/thổi thử viên mồi
    evaluateConsciousBiteDecision(fish) {
        if (!this.activeHookTarget) return 'REJECT';
        if (this.activeHookTarget.isBareHook) return 'SPOOK_BARE_HOOK';

        // 0. KIỂM TRA ĐỘ NO BỤNG (1-2 NGÀY TIÊU HÓA): Cá đã ăn no mồi xả tuyệt đối không chịu cắn mồi câu!
        if ((fish.fullDaysLeft || 0) > 0 || (fish.mind && fish.mind.satiety >= 0.84)) {
            if (fish.mind) {
                const days = (fish.fullDaysLeft || 1.0).toFixed(1);
                fish.mind.lastThought = `🤢 No căng bụng (còn ${days} ngày tiêu hóa), phớt lờ mồi câu`;
            }
            return 'REJECT';
        }

        // 0.1. QUY TẮC CÂN PHAO CHUẨN CHO MỒI ỐC NGÂM & NGÔ Ủ:
        // Chỉ Cân 1 Câu 2/3/4/5, Cân 3 Câu 3, Cân 3 Câu 5 mới báo ăn thật; cân các loại khác CHỈ RA NHỊP ẢO!
        const bait = this.activeHookTarget.bait || {};
        const baitKinds = getBaitKinds(bait);
        const isSnailOrCorn = baitKinds.includes('SNAIL') || baitKinds.includes('CORN');
        const calId = this.activeHookTarget.calibrationId || 'can7_cau3';
        if (isSnailOrCorn && !isValidSnailCornCalibration(calId)) {
            if (fish.mind) {
                fish.mind.lastThought = `⚠️ Lệch cân phao đánh Ốc/Ngô (${calId}) — cá chạm vào chỉ tạo nhịp ảo!`;
            }
            return 'FALSE_SIGNAL_CALIBRATION';
        }

        // 0.2. TẬP TÍNH CÁ CŨ: Hạn chế tối đa ăn mồi cám, chỉ ăn mạnh Ốc ngâm hương liệu & Ngô ủ!
        if (this.isOldResidentFish(fish) && !isSnailOrCorn) {
            if (Math.random() < 0.88) {
                if (fish.mind) {
                    fish.mind.lastThought = `🐟 Cá cũ tinh ranh chê mồi cám — chỉ ăn Ốc ngâm hương liệu hoặc Ngô ủ!`;
                }
                return 'REJECT';
            }
        }

        // 0.2B. TẬP TÍNH SĂN HÀNG KHỦNG (TRẮM ĐEN & CHÉP LỢN / CHÉP CỦ):
        // Trắm Đen & Chép Lợn rất sợ dây trục thẳng đứng & lộ thẻo của Câu Cân Đài -> Phải đánh Hố Đấu / Bán Đấu giấu thẻo mới ăn!
        // Riêng Chép Lợn (OLD_CARP) khi đánh Câu Cân tỷ lệ ăn < 0.5%!
        const curStyleId = this.activeHookTarget.fishingStyle || 'CAN_DAI';
        if (curStyleId === 'CAN_DAI') {
            if (fish.speciesKey === 'OLD_CARP') {
                // Chưa tới 0.5% (0.004) Chép Lợn chịu ăn Câu Cân!
                if (Math.random() > 0.004) {
                    if (fish.mind) {
                        fish.mind.lastThought = '🐷 Chép Lợn (Chép Củ) thấy dây trục đứng lộ thẻo (Câu Cân) — quay đầu bỏ đi! (Cần Bán Đấu / Hố Đấu giấu thẻo)';
                    }
                    return 'REJECT';
                }
            } else if (fish.speciesKey === 'BLACK_CARP') {
                // Trắm Đen cũng cực kỳ hiếm ăn Câu Cân (< 1.2%), phải giấu thẻo bằng Hố Đấu / Bán Đấu mới ăn!
                if (Math.random() > 0.012) {
                    if (fish.mind) {
                        fish.mind.lastThought = '🐋 Trắm Đen phát hiện trục đứng & lộ thẻo (Câu Cân) — chỉ ăn khi giấu thẻo bằng Hố Đấu / Bán Đấu!';
                    }
                    return 'REJECT';
                }
            }
        }

        // 0.3. GIẤC ĂN THEO KHUNG GIỜ (8-10h & 16-17h mạnh nhất; 11:30-14:30 & sau 19:30 chỉ đè phao, cày ổ không ăn!)
        const feedWin = this.getFeedingWindowStatus(this.currentHour);
        if (feedWin.pressFloatOnly && Math.random() < 0.86) {
            if (fish.mind) {
                fish.mind.lastThought = `😴 Giờ cá lười — chỉ lượn đè phao, cày ổ chứ không chịu ăn mồi!`;
            }
            return 'FALSE_PRESS_HOUR';
        }

        // Ảnh hưởng trực tiếp của Tình Huống Sinh Thái & Thời Tiết hiện tại (đồng bộ với bài Câu Lửng khi cá treo lửng!)
        const calSpec = getCalibrationById(calId);
        const isSuspendRig = calSpec && (calSpec.rigType === 'SUSPEND_LOW' || calSpec.rigType === 'SUSPEND_TOP');
        let ecoMul = this.activeEcologyEvent ? (this.activeEcologyEvent.eatMul || 1.0) : 1.0;
        if (this.activeEcologyEvent && this.activeEcologyEvent.id === 'LOW_PRESSURE_SUSPEND' && isSuspendRig) {
            // Đánh Câu Lửng 10cm/50cm khắc chế hoàn toàn tình huống áp suất tụt cá treo lửng!
            ecoMul = 1.55;
        }
        if (ecoMul < 0.75 && Math.random() > ecoMul) {
            if (fish.mind) {
                fish.mind.lastThought = `🌦️ Bị ảnh hưởng [${this.activeEcologyEvent.badge}] nên lười ăn, quay đầu bỏ đi`;
            }
            return 'REJECT';
        }

        const isSlowMode = this.currentHabitMode === FISH_HABIT_MODES.SLOW_LOCKJAW;
        const isGatherMode = this.currentHabitMode === FISH_HABIT_MODES.GATHER_SPOT;
        const waterMult = this.activeHookTarget.waterEffectMultiplier || 1.0;
        const habitMult = isSlowMode ? 0.48 : (isGatherMode ? 1.18 : 0.92);
        const affinity = this.getFishAffinity(fish);
        const snailCornRigBonus = (isSnailOrCorn && isValidSnailCornCalibration(calId)) ? 1.24 : 1.0;
        const integrity = typeof this.activeHookTarget.baitIntegrity === 'number' ? this.activeHookTarget.baitIntegrity : 0.7;

        // 1. Hệ số trạng thái tan của viên mồi:
        // Mới ném xuống còn cứng (>0.88) cá khôn ngại hút; Đang độ bung sương (0.25 -> 0.85) nhạy nhất; Sắp rã hết (<0.20) kém hấp dẫn
        let stateFactor = 1.0;
        if (bait.baitFirmness === 'HARD' && integrity > 0.82) {
            stateFactor = 0.52; // Mồi vê quá cứng khi mới xuống nước làm cá nhát chê
        } else if (integrity >= 0.25 && integrity <= 0.85) {
            stateFactor = bait.baitFirmness === 'SOFT' ? 1.28 : 1.15; // Độ bung sương chuẩn
        } else if (integrity < 0.20) {
            stateFactor = 0.40;
        }

        // 2. Hợp nhất kỹ thuật Cân Phao mới (RigSetupData) + Kiểu Chì cũ (rigStyle) + độ thô của dây Trục/Thẻo
        let rigFactor = 1.0;
        const rigStyle = bait.rigStyle || 'STANDARD';
        const isDullBottom = (calSpec && calSpec.rigType === 'DULL_BOTTOM') || rigStyle === 'HEAVY_LEAD';
        const isSensitiveRig = (calSpec && calSpec.rigType === 'SENSITIVE') || rigStyle === 'SENSITIVE';

        if (fish.mind && (fish.mind.archetype === 'OLD_CUNNING' || this.isOldResidentFish(fish))) {
            if (isSensitiveRig && !isDullBottom) rigFactor = 0.62; // Cá củ/cá cũ chạm dây căng dễ nghi ngờ bỏ đi
            else if (isDullBottom) rigFactor = 1.32; // Tì đáy / Chì nằm đáy lừa cá củ rất tốt
        } else if (isSensitiveRig) {
            rigFactor = 1.12;
        }
        if (isSuspendRig && (fish.speciesKey === 'GRASS_CARP' || fish.speciesKey === 'TILAPIA')) {
            rigFactor *= 1.28; // Câu lửng đặc trị Trắm Cỏ & Rô Phi
        }

        // Phạt cảnh giác nếu dùng dây Trục/Thẻo quá to (1.0-2.0 mảnh khó thấy, 8.0-10.0 thô cá nhát dễ phát hiện!)
        const leaderSpec = getLineSpec(this.activeHookTarget.leaderSize || 1);
        const lineCautionPenalty = leaderSpec ? (leaderSpec.cautionPenalty || 0) : 0;

        // 3. Hệ số có ổ mồi xả dẫn dụ không
        const hasGround = this.hasGroundBaitNear(this.activeHookTarget.x, this.activeHookTarget.z);
        const groundFactor = hasGround ? 1.15 : 0.58;

        // 4. Hệ số Điều Kiện Sinh Thái & Thời Tiết Ca Câu Hôm Nay (Ngày móm cá khóa mồm / Kén mồi / Bão cá)
        let dayFactor = this.dailyCondition ? this.dailyCondition.eatPenalty : 1.0;
        let isSavedFromMom = false;

        if (this.dailyCondition && this.dailyCondition.id === 'LOCKJAW_MOM_DAY') {
            const isHeavyLead = isDullBottom;
            const isSoftBait = (bait.baitFirmness === 'SOFT');

            // KỸ THUẬT CỨU MÓM TRONG CÂU ĐÀI VIỆT NAM KHI GẶP NGÀY CÁ KHÓA MỒM:
            // Bắt buộc kết hợp: Cân Tì Đáy/Chì Nằm Đáy (Cân 7 Câu 10/11, Cân 1 Câu 4...) + Mồi Mềm + Có Ổ Xả
            if (isHeavyLead && isSoftBait && hasGround) {
                dayFactor = 1.35; // Cứu móm ngoạn mục: Đánh lừa cá khóa mồm thành công!
                isSavedFromMom = true;
                this.lastMindLog = '🎯 CỨU MÓM THÀNH CÔNG: Tì đáy + mồi mềm bung sương đã dụ cá khóa mồm mở miệng!';
            } else if (!hasGround && !isHeavyLead) {
                // Đánh mồi cứng chì lơ lửng không xả ổ => Nguy cơ ngồi cả ca móm 100%!
                dayFactor = 0.08;
                this.lastMindLog = '💀 Ngày Cá Khóa Mồm: Cá né lưỡi cứng! Cần xả ổ + chuyển Cân 7 Câu 10/11 (Tì Chì) + vê mồi mềm để cứu móm!';
            }
        }

        // 5. Tính điểm quyết định ăn thật so với Độ nghi ngờ + GIẤU THẺO (Bán Đấu / Hố Đấu: 1.5x/2x/2.5x, Không chì/Chì chạy) + Tàn Ổ
        const styleId = this.activeHookTarget.fishingStyle || 'CAN_DAI';
        const hoDauRatio = this.activeHookTarget.hoDauRatio || 2.0;
        const hoDauLead = this.activeHookTarget.hoDauLead || 'NO_LEAD';
        const tacticBonus = this.getMethodTacticBonus(calId, fish, styleId);
        // Hiệu ứng chi tiết của Câu Hố Đấu:
        // - Vừa 2x / Lụt 2.5x: lọc bớt cá nhỏ (Rô Phi), cá to/cá cũ ăn tự tin hơn
        // - Không chì: mồi tự nhiên, cá cũ ăn tự tin hơn (+18%)
        let hoDauDetailMul = 1.0;
        if (styleId === 'HO_DAU') {
            if (fish.speciesKey === 'TILAPIA') {
                hoDauDetailMul *= (hoDauRatio >= 2.5 ? 0.25 : (hoDauRatio >= 2.0 ? 0.45 : 0.78));
            } else if (fish.speciesKey === 'BLACK_CARP' || fish.speciesKey === 'OLD_CARP' || this.isOldResidentFish(fish)) {
                hoDauDetailMul *= (hoDauRatio >= 2.5 ? 1.16 : (hoDauRatio >= 2.0 ? 1.08 : 1.0));
                if (hoDauLead === 'NO_LEAD') hoDauDetailMul *= 1.18;
            }
        }
        // Câu Bán Đấu (giấu thẻo 50%) & Câu Hố Đấu (giấu thẻo 85%): giảm mạnh độ cảnh giác dây/thẻo của cá cũ & cá nhát!
        const effectiveLinePenalty = lineCautionPenalty * (1.0 - tacticBonus.hideLeaderFactor);
        const hiddenLeaderRelief = tacticBonus.hideLeaderFactor * 0.22;
        const collapsedMul = this.spotCollapsed ? 0.16 : (this.catchesWithoutRebait === 1 ? 0.52 : 1.0);
        const suspicionPenalty = Math.max(0.05, Math.min(0.98, (fish.mind ? fish.mind.suspicion : 0.4) * 0.52 + this.spotAlertLevel * 0.42 + fish.caution * 0.32 + effectiveLinePenalty - hiddenLeaderRelief));
        const desireScore = (fish.hunger * 0.78 + (1.0 - suspicionPenalty) * 0.62)
            * waterMult * habitMult * affinity * stateFactor * rigFactor * groundFactor * dayFactor
            * (feedWin.eatMul || 1.0) * snailCornRigBonus * collapsedMul * tacticBonus.mult * hoDauDetailMul
            * (fish.isFresh ? 1.25 : 1.0);

        const pCommit = THREE.MathUtils.clamp(desireScore * 0.58, 0.03, 0.92);
        if (Math.random() < pCommit) {
            if (isSavedFromMom) {
                soundManager.playBellSound && soundManager.playBellSound();
            }
            return 'COMMIT_BITE';
        }
        return 'REJECT';
    }

    update(delta, playerPos) {
        // Ẩn thân cá dưới đáy bùn theo đúng thực tế câu đài, trừ khi Nhà Phát Triển bật chế độ "Hiện Cá 3D" trong Dev Tools!
        if (!this.devForceShow3D && this.aiFishGroup.visible) {
            this.aiFishGroup.visible = false;
        }

        // Giảm dần mức độ cảnh giác của ổ câu theo thời gian nếu cần thủ giữ yên tĩnh
        this.spotAlertLevel = Math.max(0.08, this.spotAlertLevel - delta * 0.008);

        // 0. Tự động chuyển đổi tập tính đàn cá: Tụ ở 1 ổ <-> Đi ven bờ kiếm ăn <-> Không ăn / Ăn rất chậm
        this.habitTimer -= delta;
        if (this.habitTimer <= 0) {
            const modes = [
                FISH_HABIT_MODES.GATHER_SPOT,
                FISH_HABIT_MODES.BANK_FORAGE,
                FISH_HABIT_MODES.SLOW_LOCKJAW
            ];
            const nextIdx = (modes.indexOf(this.currentHabitMode) + 1) % modes.length;
            const nextMode = modes[nextIdx];
            const nextDur = nextMode === FISH_HABIT_MODES.SLOW_LOCKJAW
                ? (30.0 + Math.random() * 12.0)
                : (40.0 + Math.random() * 18.0);
            this.setFishHabitMode(nextMode, nextDur, true);
        }

        // 1. Cập nhật thời gian tồn tại của các ổ mồi xả
        for (let i = this.groundBaitSpots.length - 1; i >= 0; i--) {
            const spot = this.groundBaitSpots[i];
            spot.duration -= delta;
            if (spot.duration <= 0) {
                this.groundBaitSpots.splice(i, 1);
            }
        }

        const isSlowMode = this.currentHabitMode === FISH_HABIT_MODES.SLOW_LOCKJAW;
        const isBankMode = this.currentHabitMode === FISH_HABIT_MODES.BANK_FORAGE;
        const isGatherMode = this.currentHabitMode === FISH_HABIT_MODES.GATHER_SPOT;

        // Đếm xem có con cá AI nào đang tương tác sát lưỡi câu hoặc đang kéo vào ổ (tránh tình trạng 30-50 con bu ăn cùng lúc)
        let activeInspectorCount = 0;
        let activeSeekerCount = 0;
        this.fishSchools.forEach(f => {
            if (
                f.aiState === AI_FISH_STATES.INSPECT_BAIT ||
                f.aiState === AI_FISH_STATES.PROBE_BLOW ||
                f.aiState === AI_FISH_STATES.FEED_BITE
            ) {
                activeInspectorCount++;
            } else if (f.aiState === AI_FISH_STATES.SMELL_SEEK) {
                activeSeekerCount++;
            }
        });

        // 2. CẬP NHẬT TRÍ TUỆ NHÂN TẠO (CONSCIOUSNESS STATE MACHINE) & TĂM CÁ DƯỚI ĐÁY HỒ
        this.fishSchools.forEach((fish, idx) => {
            fish.stateTimer -= delta;
            if (fish.freshTimer > 0) {
                fish.freshTimer -= delta;
                if (fish.freshTimer <= 0) fish.isFresh = false;
            }
            if ((fish.ignoreGroundbaitTimer || 0) > 0) {
                fish.ignoreGroundbaitTimer = Math.max(0, fish.ignoreGroundbaitTimer - delta);
            }
            // Cá tiêu hóa dần theo thời gian -> tăng nhẹ độ đói
            fish.hunger = Math.min(1.0, fish.hunger + delta * (isSlowMode ? 0.002 : 0.006));
            if (fish.mind) {
                fish.mind.satiety = Math.max(0.05, fish.mind.satiety - delta * 0.005);
            }

            let desiredSpeed = fish.baseSpeed * (isSlowMode ? 0.48 : 1.0);

            // --- XỬ LÝ TỪNG TRẠNG THÁI Ý THỨC CỦA CÁ AI ---
            if (fish.aiState === AI_FISH_STATES.STARTLED_FLEE) {
                desiredSpeed = 5.2;
                fish.targetDepth = -1.55;
                if (fish.stateTimer <= 0 || Math.hypot(fish.targetX - fish.x, fish.targetZ - fish.z) < 1.5) {
                    fish.aiState = isBankMode ? AI_FISH_STATES.PATROL_BANK : AI_FISH_STATES.CRUISE;
                    fish.stateTimer = 6.0 + Math.random() * 5.0;
                }
            } else if (fish.aiState === AI_FISH_STATES.REJECT_TURN) {
                desiredSpeed = 1.45;
                fish.targetDepth = -1.45;
                if (fish.stateTimer <= 0) {
                    fish.aiState = isBankMode ? AI_FISH_STATES.PATROL_BANK : AI_FISH_STATES.CRUISE;
                    fish.stateTimer = 6.0 + Math.random() * 5.0;
                }
            } else if (fish.aiState === AI_FISH_STATES.PASS_BY_BRUSH) {
                // HÀNH VI Ý THỨC 1: Cá chỉ bơi cắt ngang qua ổ, quệt đuôi vào dây câu tạo tín hiệu giả rồi bơi thẳng đi!
                desiredSpeed = 1.35;
                fish.targetDepth = -1.42;
                if (this.activeHookTarget && !fish._hasBrushedLine) {
                    const dHook = Math.hypot(fish.x - this.activeHookTarget.x, fish.z - this.activeHookTarget.z);
                    if (dHook < 0.95) {
                        fish._hasBrushedLine = true;
                        this.spawnCarpBubbles(fish.x, fish.z, fish.isBigCarp, false);
                        this.spawnMicroRipple(this.activeHookTarget.x, this.activeHookTarget.z, 0.85);
                        this.lastMindLog = `〰️ [${fish.baseSpeciesName} ${fish.weight}kg] chỉ bơi ngang qua ổ quệt đuôi vào dây trục — Không phải cá ăn mồi, đừng giật!`;
                        if (this.activeHookTarget.onLineBrush) {
                            this.activeHookTarget.onLineBrush(fish);
                        }
                    }
                }
                if (fish.stateTimer <= 0 || Math.hypot(fish.targetX - fish.x, fish.targetZ - fish.z) < 1.2) {
                    fish._hasBrushedLine = false;
                    fish.aiState = AI_FISH_STATES.CRUISE;
                    fish.stateTimer = 6.0 + Math.random() * 4.0;
                }
            } else if (fish.aiState === AI_FISH_STATES.GRAZE_GROUNDBAIT) {
                // HÀNH VI Ý THỨC 2: Cá khôn chỉ ủi bùn nhặt mồi xả quanh ổ, sủi tăm ùng ục nhưng PHỚT LỜ mồi câu trên lưỡi!
                desiredSpeed = 0.42;
                fish.targetDepth = -1.52;
                fish.nudgeCooldown -= delta;
                if (fish.nudgeCooldown <= 0) {
                    fish.nudgeCooldown = 1.4 + Math.random() * 1.2;
                    this.spawnCarpBubbles(fish.x, fish.z, fish.isBigCarp, false);
                    if (fish.mind) {
                        fish.mind.satiety = Math.min(0.95, fish.mind.satiety + 0.08);
                        fish.hunger = Math.max(0.15, fish.hunger - 0.06);
                    }
                    this.lastMindLog = `🐟 [${fish.baseSpeciesName}] đang ủi bùn nhặt cám xả quanh ổ nhưng cảnh giác né viên mồi trên lưỡi!`;
                    if (this.activeHookTarget && this.activeHookTarget.onGrazeGroundbait) {
                        this.activeHookTarget.onGrazeGroundbait(fish);
                    }
                }
                if (fish.stateTimer <= 0) {
                    // Ăn no vụn mồi xả rồi bơi ra ngoài mà không cắn câu!
                    fish.aiState = AI_FISH_STATES.REJECT_TURN;
                    fish.stateTimer = 4.0;
                    const awayAngle = Math.random() * Math.PI * 2;
                    fish.targetX = fish.x + Math.cos(awayAngle) * 10.0;
                    fish.targetZ = fish.z + Math.sin(awayAngle) * 10.0;
                    this.lastMindLog = `💨 [${fish.baseSpeciesName}] đã ăn no vụn mồi xả dưới bùn rồi quay đầu bơi đi mà không ăn mồi câu!`;
                }
            } else if (fish.aiState === AI_FISH_STATES.PROBE_BLOW) {
                // HÀNH VI Ý THỨC 3: Cá tiến sát thổi nước / rỉa thăm dò viên mồi để thử độ mềm và kiểm tra lưỡi câu
                if (!this.activeHookTarget) {
                    fish.aiState = AI_FISH_STATES.CRUISE;
                } else {
                    desiredSpeed = 0.25;
                    fish.targetDepth = -1.48;
                    fish.targetX = this.activeHookTarget.x + (Math.random() - 0.5) * 0.35;
                    fish.targetZ = this.activeHookTarget.z + (Math.random() - 0.5) * 0.35;

                    if (!fish._hasBlownBait) {
                        fish._hasBlownBait = true;
                        this.spawnCarpBubbles(this.activeHookTarget.x, this.activeHookTarget.z, fish.isBigCarp, false);
                        this.spawnMicroRipple(this.activeHookTarget.x, this.activeHookTarget.z, 0.85);
                        this.lastMindLog = `👄 [${fish.baseSpeciesName} ${fish.weight}kg] đang thổi nước & nhấp thử rìa viên mồi để kiểm tra bẫy...`;
                        if (this.activeHookTarget.onProbeTestBait) {
                            this.activeHookTarget.onProbeTestBait(fish);
                        }
                    }

                    if (fish.stateTimer <= 0) {
                        fish._hasBlownBait = false;
                        const decision = this.evaluateConsciousBiteDecision(fish);
                        if (decision === 'SPOOK_BARE_HOOK') {
                            fish.aiState = AI_FISH_STATES.STARTLED_FLEE;
                            fish.stateTimer = 4.5;
                            this.spotAlertLevel = Math.min(0.95, this.spotAlertLevel + 0.18);
                            const awayAngle = Math.random() * Math.PI * 2;
                            fish.targetX = fish.x + Math.cos(awayAngle) * 18.0;
                            fish.targetZ = fish.z + Math.sin(awayAngle) * 18.0;
                            this.lastMindLog = `⚠️ [${fish.baseSpeciesName}] phát hiện LƯỠI CÂU TRẦN (mồi đã rã hết) nên giật mình phóng chạy! Hãy thu cần vê lại mồi!`;
                            if (this.activeHookTarget.onSpookedByBareHook) {
                                this.activeHookTarget.onSpookedByBareHook(fish);
                            }
                        } else if (decision === 'FALSE_SIGNAL_CALIBRATION') {
                            // Sai bài cân phao cho Ốc / Ngô -> Phao chỉ ra nhịp ảo, cá không chịu ngậm thật!
                            fish.aiState = AI_FISH_STATES.REJECT_TURN;
                            fish.stateTimer = 4.2;
                            const awayAngle = Math.random() * Math.PI * 2;
                            fish.targetX = fish.x + Math.cos(awayAngle) * 9.0;
                            fish.targetZ = fish.z + Math.sin(awayAngle) * 9.0;
                            this.spawnCarpBubbles(fish.x, fish.z, fish.isBigCarp, false);
                            this.lastMindLog = `⚠️ [NHỊP ẢO CÂN PHAO]: Đánh Ốc/Ngô phải Cân 1 Câu 2–5, Cân 3 Câu 3 hoặc Cân 3 Câu 5! Cân hiện tại chỉ ra nhịp ảo!`;
                            if (this.activeHookTarget.onFalseSignalCalibration) {
                                this.activeHookTarget.onFalseSignalCalibration(fish);
                            }
                        } else if (decision === 'FALSE_PRESS_HOUR') {
                            // Giờ cá lười -> chỉ đè phao, cày ổ tạo tăm chứ không chịu ăn!
                            fish.aiState = AI_FISH_STATES.GRAZE_GROUNDBAIT;
                            fish.stateTimer = 3.8;
                            this.spawnCarpBubbles(fish.x, fish.z, fish.isBigCarp, false);
                            this.lastMindLog = `😴 [GIỜ CÁ LƯỜI]: [${fish.baseSpeciesName} ${fish.weight}kg] chỉ đè phao & cày ổ chứ không chịu ăn! (Giờ vàng: 8–10h sáng & 16–17h chiều)`;
                            if (this.activeHookTarget.onLineBrush) {
                                this.activeHookTarget.onLineBrush(fish);
                            }
                        } else if (decision === 'COMMIT_BITE') {
                            if (fish.mind && fish.mind.probesRemaining > 0) {
                                fish.mind.probesRemaining -= 1;
                                // Lượn thêm 1 vòng ngắn rồi mới hút thật
                                fish.aiState = AI_FISH_STATES.FEED_BITE;
                                fish.stateTimer = (0.9 + Math.random() * 0.8) * this.getFishEatSlowness(fish);
                                this.lastMindLog = `🎯 [${fish.baseSpeciesName} ${fish.weight}kg] thấy mồi mềm thơm tự nhiên — Đang chúi đầu chuẩn bị hút mồi!`;
                            } else {
                                fish.aiState = AI_FISH_STATES.FEED_BITE;
                                fish.stateTimer = 0.85 * this.getFishEatSlowness(fish);
                                this.lastMindLog = `🎯 [${fish.baseSpeciesName} ${fish.weight}kg] đã tin tưởng mồi — Chuẩn bị bắt tín hiệu phao!`;
                            }
                        } else {
                            // Cá phát hiện mùi hương liệu lệch thời tiết / thẻo căng / nghi ngờ -> bỏ đi!
                            fish.aiState = AI_FISH_STATES.REJECT_TURN;
                            fish.stateTimer = 11.0 + Math.random() * 5.0;
                            fish.ignoreGroundbaitTimer = 16.0 + Math.random() * 12.0;
                            const awayAngle = Math.random() * Math.PI * 2;
                            fish.targetX = fish.x + Math.cos(awayAngle) * 13.0;
                            fish.targetZ = fish.z + Math.sin(awayAngle) * 13.0;
                            this.spawnCarpBubbles(fish.x, fish.z, fish.isBigCarp, false);
                            this.lastMindLog = `🚫 [${fish.baseSpeciesName} ${fish.weight}kg] (${fish.mind ? fish.mind.archetypeLabel : 'Cá khôn'}) vừa thổi thử mồi rồi lắc đầu bỏ đi!`;
                            if (this.activeHookTarget.onRejectBait) {
                                this.activeHookTarget.onRejectBait(fish);
                            }
                        }
                    }
                }
            } else if (fish.aiState === AI_FISH_STATES.FEED_BITE) {
                // Cá AI đã vượt qua mọi bước kiểm tra ý thức -> Chúi đầu hút mồi thật!
                if (!this.activeHookTarget) {
                    fish.aiState = AI_FISH_STATES.CRUISE;
                } else {
                    desiredSpeed = isSlowMode ? 0.28 : 0.55;
                    fish.targetDepth = -1.50;
                    fish.targetX = this.activeHookTarget.x;
                    fish.targetZ = this.activeHookTarget.z;

                    const distToHook = Math.hypot(fish.x - this.activeHookTarget.x, fish.z - this.activeHookTarget.z);
                    if (distToHook < 0.45 || fish.stateTimer <= 0) {
                        this.spawnCarpBubbles(fish.x, fish.z, fish.isBigCarp, true);
                        if (this.activeHookTarget.onBiteTrigger) {
                            const cb = this.activeHookTarget.onBiteTrigger;
                            fish.currentSlow = this.getFishEatSlowness(fish);
                            fish.currentAffinity = this.getFishAffinity(fish);
                            this.activeHookTarget = null;
                            cb(fish);
                        }
                        fish.aiState = AI_FISH_STATES.CRUISE;
                        fish.stateTimer = 6.0;
                    }
                }
            } else if (fish.aiState === AI_FISH_STATES.INSPECT_BAIT) {
                // Cá AI lượn dưới đáy bùn quanh chân phao dò xét dây trục, chì và mồi câu
                if (!this.activeHookTarget) {
                    fish.aiState = AI_FISH_STATES.CRUISE;
                } else {
                    desiredSpeed = isSlowMode ? 0.32 : 0.55;
                    fish.targetDepth = -1.45;
                    fish.orbitAngle += delta * (isSlowMode ? 0.65 : 1.1) * fish.orbitDir;
                    const orbitRadius = 0.72 + Math.sin(fish.orbitAngle * 2.0) * 0.18;
                    fish.targetX = this.activeHookTarget.x + Math.cos(fish.orbitAngle) * orbitRadius;
                    fish.targetZ = this.activeHookTarget.z + Math.sin(fish.orbitAngle) * orbitRadius;

                    fish.nudgeCooldown -= delta;
                    if (fish.nudgeCooldown <= 0) {
                        fish.nudgeCooldown = (isSlowMode ? 2.5 : 1.4) + Math.random() * 1.1;
                        this.spawnCarpBubbles(fish.x, fish.z, fish.isBigCarp, false);
                        this.spawnMicroRipple(this.activeHookTarget.x, this.activeHookTarget.z, 0.85);
                        this.lastMindLog = `🫧 [${fish.baseSpeciesName} ${fish.weight}kg] đang lượn vòng quanh chân phao dò xét mùi mồi & dây trục...`;
                        if (this.activeHookTarget.onInspectNudge) {
                            this.activeHookTarget.onInspectNudge(fish);
                        }
                    }

                    // Hết thời gian lượn vòng quan sát -> Chuyển sang Thổi thử mồi (PROBE_BLOW) hoặc Quyết định!
                    if (fish.stateTimer <= 0) {
                        if (this.activeHookTarget.isBareHook) {
                            // Thấy lưỡi câu sắt trần trụi -> Sợ hãi bỏ chạy!
                            fish.aiState = AI_FISH_STATES.STARTLED_FLEE;
                            fish.stateTimer = 4.5;
                            const awayAngle = Math.random() * Math.PI * 2;
                            fish.targetX = fish.x + Math.cos(awayAngle) * 18.0;
                            fish.targetZ = fish.z + Math.sin(awayAngle) * 18.0;
                            this.lastMindLog = `⚠️ [${fish.baseSpeciesName}] nhìn thấy lưỡi câu trần (hết mồi) nên hoảng sợ bơi chạy mất!`;
                            if (this.activeHookTarget.onSpookedByBareHook) {
                                this.activeHookTarget.onSpookedByBareHook(fish);
                            }
                        } else if (fish.caution > 0.42 || (fish.mind && fish.mind.probesRemaining > 0) || Math.random() < 0.65) {
                            // Đa số cá sẽ tiến vào THỔI THỬ / NHẤP RỈA THĂM DÒ (PROBE_BLOW) trước khi dám nuốt!
                            fish.aiState = AI_FISH_STATES.PROBE_BLOW;
                            fish._hasBlownBait = false;
                            fish.stateTimer = 1.6 + fish.caution * 1.8;
                        } else {
                            const decision = this.evaluateConsciousBiteDecision(fish);
                            if (decision === 'FALSE_SIGNAL_CALIBRATION') {
                                fish.aiState = AI_FISH_STATES.REJECT_TURN;
                                fish.stateTimer = 4.0;
                                const awayAngle = Math.random() * Math.PI * 2;
                                fish.targetX = fish.x + Math.cos(awayAngle) * 9.0;
                                fish.targetZ = fish.z + Math.sin(awayAngle) * 9.0;
                                this.lastMindLog = `⚠️ [NHỊP ẢO CÂN PHAO]: Đánh Ốc/Ngô phải Cân 1 Câu 2–5, Cân 3 Câu 3 hoặc Cân 3 Câu 5!`;
                                if (this.activeHookTarget.onFalseSignalCalibration) {
                                    this.activeHookTarget.onFalseSignalCalibration(fish);
                                }
                            } else if (decision === 'FALSE_PRESS_HOUR') {
                                fish.aiState = AI_FISH_STATES.GRAZE_GROUNDBAIT;
                                fish.stateTimer = 3.6;
                                this.lastMindLog = `😴 [GIỜ CÁ LƯỜI]: [${fish.baseSpeciesName}] chỉ cày ổ đè phao, không ăn!`;
                                if (this.activeHookTarget.onLineBrush) {
                                    this.activeHookTarget.onLineBrush(fish);
                                }
                            } else if (decision === 'COMMIT_BITE') {
                                fish.aiState = AI_FISH_STATES.FEED_BITE;
                                fish.stateTimer = 1.1 * this.getFishEatSlowness(fish);
                            } else {
                                fish.aiState = AI_FISH_STATES.REJECT_TURN;
                                fish.stateTimer = 4.5;
                                const awayAngle = Math.random() * Math.PI * 2;
                                fish.targetX = fish.x + Math.cos(awayAngle) * 12.0;
                                fish.targetZ = fish.z + Math.sin(awayAngle) * 12.0;
                                this.lastMindLog = `🚫 [${fish.baseSpeciesName}] dò xét xong nhưng nghi ngờ không ăn, đã bơi rời khỏi ổ!`;
                                if (this.activeHookTarget.onRejectBait) {
                                    this.activeHookTarget.onRejectBait(fish);
                                }
                            }
                        }
                    }
                }
            } else {
                // Trạng thái CRUISE, PATROL_BANK hoặc SMELL_SEEK ở sát đáy bùn (-1.5m)
                fish.targetDepth = -1.50;

                // Kiểm tra mùi mồi xả (Groundbait) — CHỈ áp dụng cho cá không bận phớt lờ ổ & chưa no bụng
                const isDisinterested = (fish.ignoreGroundbaitTimer || 0) > 0 || (fish.fullDaysLeft || 0) > 0 || (fish.mind && fish.mind.satiety >= 0.78);
                let bestSpot = null;
                let minSpotDist = 999;
                if (!isDisinterested) {
                    this.groundBaitSpots.forEach(spot => {
                        const d = Math.hypot(spot.x - fish.x, spot.z - fish.z);
                        if (d < spot.radius && d < minSpotDist) {
                            minSpotDist = d;
                            bestSpot = spot;
                        }
                    });
                }

                // Kiểm tra khi cá bơi lại gần vị trí lưỡi câu của người chơi
                if (this.activeHookTarget && !isDisinterested) {
                    const dHook = Math.hypot(this.activeHookTarget.x - fish.x, this.activeHookTarget.z - fish.z);
                    const hasGround = this.hasGroundBaitNear(this.activeHookTarget.x, this.activeHookTarget.z);
                    const scentRadius = (isSlowMode ? 9.5 : 15.5) * (this.activeHookTarget.waterEffectMultiplier || 1.0) * (hasGround ? 1.15 : 0.55);

                    if (dHook < scentRadius && activeInspectorCount < (isSlowMode ? 2 : 3) && this.getFishAffinity(fish) > 0.18) {
                        if (dHook < 2.3) {
                            // CÁ VỪA BƠI VÀO TỚI RÌA Ổ CÂU (dHook < 2.3m):
                            // Hệ thống Ý Thức Cá Nhân quyết định cá sẽ làm gì (Không phải cứ vào là ăn!)
                            const arch = fish.mind ? fish.mind.archetype : 'CAUTIOUS_TESTER';
                            const satiety = fish.mind ? fish.mind.satiety : 0.3;
                            const roll = Math.random();

                            if (satiety > 0.72 || arch === 'PASSERBY_CRUISER' || roll < 0.24 + this.spotAlertLevel * 0.25) {
                                // 1. Cá đang no hoặc chỉ đi tuần ngang qua -> Đi thẳng cắt ngang ổ & quệt dây trục!
                                fish.aiState = AI_FISH_STATES.PASS_BY_BRUSH;
                                fish._hasBrushedLine = false;
                                fish.stateTimer = 4.2;
                                const passAngle = Math.atan2(this.activeHookTarget.z - fish.z, this.activeHookTarget.x - fish.x) + (Math.random() - 0.5) * 0.35;
                                fish.targetX = this.activeHookTarget.x + Math.cos(passAngle) * 7.5;
                                fish.targetZ = this.activeHookTarget.z + Math.sin(passAngle) * 7.5;
                            } else if (hasGround && (arch === 'BOTTOM_GRAZER' || roll < 0.52)) {
                                // 2. Cá khôn vào ổ chỉ ủi bùn ăn vụn mồi xả chứ không chịu ăn viên mồi trên lưỡi!
                                fish.aiState = AI_FISH_STATES.GRAZE_GROUNDBAIT;
                                fish.stateTimer = 4.0 + Math.random() * 2.5;
                                fish.nudgeCooldown = 0.6;
                                fish.targetX = this.activeHookTarget.x + (Math.random() - 0.5) * 1.8;
                                fish.targetZ = this.activeHookTarget.z + (Math.random() - 0.5) * 1.8;
                            } else {
                                // 3. Cá chú ý tới viên mồi trên lưỡi -> Chuyển sang Lượn Vòng Dò Xét (INSPECT_BAIT)
                                fish.aiState = AI_FISH_STATES.INSPECT_BAIT;
                                fish.stateTimer = ((isSlowMode ? 3.8 : 2.2) + fish.caution * 2.2) * this.getFishEatSlowness(fish);
                                fish.orbitAngle = Math.atan2(fish.z - this.activeHookTarget.z, fish.x - this.activeHookTarget.x);
                                fish.nudgeCooldown = 0.6;
                                activeInspectorCount++;
                            }
                        } else if (activeSeekerCount < 18) {
                            // Nếu là cá nhát/cá bể hoặc ổ đang cảnh giác cao -> có thể chê dây/nhát quay đầu ngay ở rìa ngoài!
                            if ((fish.caution >= 0.66 || this.spotAlertLevel >= 0.45) && dHook < 5.0 && Math.random() < 0.015) {
                                fish.aiState = AI_FISH_STATES.REJECT_TURN;
                                fish.stateTimer = 10.0 + Math.random() * 6.0;
                                fish.ignoreGroundbaitTimer = 18.0 + Math.random() * 14.0;
                                const away = Math.atan2(fish.z - this.activeHookTarget.z, fish.x - this.activeHookTarget.x) + (Math.random() - 0.5) * 0.7;
                                fish.targetX = THREE.MathUtils.clamp(fish.x + Math.cos(away) * 14, -this.lakeHalfW + 4, this.lakeHalfW - 4);
                                fish.targetZ = THREE.MathUtils.clamp(fish.z + Math.sin(away) * 11, -this.lakeHalfD + 4, this.lakeHalfD - 4);
                                if (fish.mind) fish.mind.lastThought = '🔴 Thấy dây trục / ổ có động — nhát chê mồi quay đầu bỏ đi!';
                            } else {
                                fish.aiState = AI_FISH_STATES.SMELL_SEEK;
                                fish.targetX = this.activeHookTarget.x + (Math.random() - 0.5) * 1.5;
                                fish.targetZ = this.activeHookTarget.z + (Math.random() - 0.5) * 1.5;
                                desiredSpeed = fish.baseSpeed * (isSlowMode ? 0.68 : 1.18);
                                activeSeekerCount++;
                            }
                        }
                    }
                } else if (bestSpot) {
                    // Khi cá tình cờ đi quanh hồ ngang vùng mùi 1 ổ mới: tỷ lệ cuốn ổ phụ thuộc tỉ lệ pha mồi + giấc ăn + loại cân phao (Cân / Bán Đấu / Hố Đấu / Lửng)!
                    if (fish._decidedSpotId !== bestSpot.id) {
                        fish._decidedSpotId = bestSpot.id;
                        const drawRate = this.computeSpotDrawRate(fish);
                        if (Math.random() > drawRate) {
                            fish.ignoreGroundbaitTimer = 26 + Math.random() * 26;
                            fish.aiState = Math.random() < 0.35 ? AI_FISH_STATES.PATROL_BANK : AI_FISH_STATES.CRUISE;
                            if (fish.mind) fish.mind.lastThought = '🐟 Bơi quanh hồ ngang qua mùi ổ nhưng chưa đủ cuốn — đi chỗ khác';
                            bestSpot = null;
                        }
                    }
                    if (bestSpot && activeSeekerCount < 18) {
                        fish.aiState = AI_FISH_STATES.SMELL_SEEK;
                        activeSeekerCount++;
                        desiredSpeed = fish.baseSpeed * (isSlowMode ? 0.75 : 1.25);
                        if (Math.hypot(fish.targetX - bestSpot.x, fish.targetZ - bestSpot.z) > 2.8) {
                            fish.targetX = bestSpot.x + (Math.random() - 0.5) * 2.2;
                            fish.targetZ = bestSpot.z + (Math.random() - 0.5) * 2.2;
                        }
                    }
                } else if (!isDisinterested && this.groundBaitSpots.length > 0 && activeSeekerCount < 16 && Math.random() < 0.004 * this.computeSpotDrawRate(fish)) {
                    // Tỷ lệ nhỏ cá đang đi tuần quanh hồ tự chọn 1 ổ mồi xả bất kỳ để rẽ vào thăm dò!
                    const chosen = this.groundBaitSpots[Math.floor(Math.random() * this.groundBaitSpots.length)];
                    fish._decidedSpotId = chosen.id;
                    fish.aiState = AI_FISH_STATES.SMELL_SEEK;
                    fish.targetX = chosen.x + (Math.random() - 0.5) * 2.6;
                    fish.targetZ = chosen.z + (Math.random() - 0.5) * 2.6;
                    activeSeekerCount++;
                    if (fish.mind) fish.mind.lastThought = '🧭 Đi tuần quanh hồ rồi tự chọn rẽ vào 1 ổ mồi xả thơm!';
                } else if (isGatherMode && !isDisinterested && activeSeekerCount < 10 && idx < 10) {
                    fish.aiState = AI_FISH_STATES.SMELL_SEEK;
                    if (Math.hypot(fish.targetX - this.gatherCenter.x, fish.targetZ - this.gatherCenter.y) > 3.2) {
                        fish.targetX = this.gatherCenter.x + (Math.random() - 0.5) * 2.8;
                        fish.targetZ = this.gatherCenter.y + (Math.random() - 0.5) * 2.8;
                    }
                } else if (isBankMode) {
                    fish.aiState = AI_FISH_STATES.PATROL_BANK;
                } else {
                    fish.aiState = AI_FISH_STATES.CRUISE;
                }
            }

            // --- DI CHUYỂN MƯỢT DƯỚI ĐÁY HỒ ---
            const dx = fish.targetX - fish.x;
            const dz = fish.targetZ - fish.z;
            const dist = Math.hypot(dx, dz);

            fish.speed += (desiredSpeed - fish.speed) * Math.min(1.0, delta * 3.5);

            if (dist > 0.25) {
                const targetAngle = Math.atan2(dx, dz);
                let angleDiff = targetAngle - fish.swimAngle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                const turnRate = fish.aiState === AI_FISH_STATES.INSPECT_BAIT ? 4.2 : 2.4;
                fish.swimAngle += angleDiff * Math.min(1.0, delta * turnRate);

                fish.x += Math.sin(fish.swimAngle) * fish.speed * delta;
                fish.z += Math.cos(fish.swimAngle) * fish.speed * delta;
            } else if (fish.aiState === AI_FISH_STATES.PATROL_BANK) {
                // Đi tuần dọc sát mép bờ kè đá chữ nhật để kiếm ăn ven bờ ("có lúc lại đi ven bờ kiếm ăn")
                const margin = 3.0 + Math.random() * 2.4;
                const nearSouth = Math.abs(fish.z - (this.lakeHalfD - margin)) < 8.0;
                const nearNorth = Math.abs(fish.z - (-this.lakeHalfD + margin)) < 8.0;
                if (nearSouth || nearNorth) {
                    const stepX = (Math.random() < 0.75 ? 1 : -1) * (14.0 + Math.random() * 18.0);
                    fish.targetX = THREE.MathUtils.clamp(fish.x + stepX, -this.lakeHalfW + margin, this.lakeHalfW - margin);
                    fish.targetZ = nearSouth ? (this.lakeHalfD - margin) : (-this.lakeHalfD + margin);
                } else {
                    const stepZ = (Math.random() < 0.75 ? 1 : -1) * (12.0 + Math.random() * 16.0);
                    fish.targetX = fish.x > 0 ? (this.lakeHalfW - margin) : (-this.lakeHalfW + margin);
                    fish.targetZ = THREE.MathUtils.clamp(fish.z + stepZ, -this.lakeHalfD + margin, this.lakeHalfD - margin);
                }
            } else if (fish.aiState === AI_FISH_STATES.CRUISE || fish.aiState === AI_FISH_STATES.SMELL_SEEK) {
                if (isGatherMode && fish.aiState === AI_FISH_STATES.SMELL_SEEK) {
                    // Quẩn quanh trong ổ mồi tạo chùm tăm tụ ổ
                    fish.targetX = this.gatherCenter.x + (Math.random() - 0.5) * 2.6;
                    fish.targetZ = this.gatherCenter.y + (Math.random() - 0.5) * 2.6;
                } else if (this.isOldResidentFish(fish) && Math.random() < 0.78) {
                    // Cá cũ (Chép Củ / Trắm Đen) luôn có xu hướng tập tụ quanh khu vực CUỐI HỒ (Đông hồ x: +34m -> +74m)
                    fish.targetX = this.lakeHalfW * 0.44 + Math.random() * (this.lakeHalfW * 0.48);
                    fish.targetZ = (Math.random() - 0.5) * (this.lakeHalfD * 1.5);
                } else {
                    const leader = this.fishSchools[(idx + 1) % this.fishSchools.length];
                    if (fish.aiState === AI_FISH_STATES.CRUISE && Math.random() < 0.38 && leader) {
                        fish.targetX = leader.targetX + (Math.random() - 0.5) * 4.5;
                        fish.targetZ = leader.targetZ + (Math.random() - 0.5) * 4.5;
                    } else {
                        const range = fish.aiState === AI_FISH_STATES.SMELL_SEEK ? 2.5 : 16.0;
                        fish.targetX = fish.x + (Math.random() - 0.5) * range * 2.0;
                        fish.targetZ = fish.z + (Math.random() - 0.5) * range * 1.5;
                    }
                }
            }

            // Giới hạn cá AI bơi bên trong lòng hồ chữ nhật 170m x 110m
            fish.x = THREE.MathUtils.clamp(fish.x, -this.lakeHalfW + 2.2, this.lakeHalfW - 2.2);
            fish.z = THREE.MathUtils.clamp(fish.z, -this.lakeHalfD + 2.2, this.lakeHalfD - 2.2);
            fish.targetX = THREE.MathUtils.clamp(fish.targetX, -this.lakeHalfW + 2.8, this.lakeHalfW - 2.8);
            fish.targetZ = THREE.MathUtils.clamp(fish.targetZ, -this.lakeHalfD + 2.8, this.lakeHalfD - 2.8);

            // Sủi tăm bùn tự nhiên trên mặt nước theo tập tính (Tụ 1 ổ sủi dày / Đi ven bờ sủi theo vệt / Ăn chậm sủi rất thưa)
            // ĐẶC BIỆT: Nếu mồi nặng hương liệu (>= 7 giọt) -> Cá bị kích thích sặc mùi tụ lại CÀY NHIỀU TĂM quanh ổ!
            const bait = this.activeHookTarget && this.activeHookTarget.bait;
            const flavorDrops = bait && typeof bait.totalFlavorDrops === 'number' ? bait.totalFlavorDrops : 0;
            const isHeavyFlavor = flavorDrops >= 7;

            fish.bubbleCooldown -= delta;
            if (fish.bubbleCooldown <= 0) {
                const isSeeking = (fish.aiState === AI_FISH_STATES.SMELL_SEEK || fish.aiState === AI_FISH_STATES.INSPECT_BAIT);
                const nearHook = this.activeHookTarget && Math.hypot(fish.x - this.activeHookTarget.x, fish.z - this.activeHookTarget.z) < 2.8;
                const nearPlayer = !playerPos || Math.hypot(fish.x - playerPos.x, fish.z - playerPos.z) < 38.0;
                const isOldFish = this.isOldResidentFish(fish);

                // Tối ưu 60 FPS với hồ 1.5-2 tấn (~250-300 con AI): luôn sủi tăm rõ cho cá trong tầm nhìn (<38m) hoặc quanh phao,
                // còn cá ở góc xa hồ chỉ sủi theo xác suất nhẹ để không tràn giới hạn bọt
                if (nearPlayer || nearHook || Math.random() < 0.14) {
                    this.spawnCarpBubbles(fish.x, fish.z, fish.isBigCarp || isOldFish, fish.aiState === AI_FISH_STATES.FEED_BITE || isOldFish);
                }

                if (isHeavyFlavor && nearHook) {
                    // Cá cày nhiều tăm dồn dập quanh ổ do sặc mùi hương nồng
                    fish.bubbleCooldown = 0.45 + Math.random() * 0.75;
                    this.lastMindLog = `⚠️ [Nặng hương liệu ${flavorDrops} giọt]: Đàn cá bị sặc mùi nồng tụ lại cày tăm dày đặc quanh ổ nhưng không chịu cắn mồi!`;
                } else if (isOldFish) {
                    // Cá cũ tụ cuối hồ cày rất nhiều tăm liên tục!
                    fish.bubbleCooldown = (nearPlayer ? 0.65 : 1.6) + Math.random() * 0.85;
                } else if (isSlowMode) {
                    fish.bubbleCooldown = (isSeeking ? 2.8 : 6.2) + Math.random() * 3.5;
                } else if (isGatherMode && isSeeking) {
                    fish.bubbleCooldown = 0.95 + Math.random() * 1.45;
                } else {
                    fish.bubbleCooldown = (nearPlayer ? (isSeeking ? 1.4 : 3.2) : 5.5) + Math.random() * 2.5;
                }
            }

            // Lưu vết đường luồng di chuyển cho Developer Fish Inspector (tối đa 16 điểm)
            fish.trailTimer = (fish.trailTimer || 0) + delta;
            if (fish.trailTimer >= 0.45) {
                fish.trailTimer = 0;
                if (!fish.trail) fish.trail = [];
                fish.trail.push({ x: fish.x, z: fish.z });
                if (fish.trail.length > 16) fish.trail.shift();
            }
        });

        // 3. Bọt nước tăm cá ngoi lên & đọng dập dềnh trên mặt nước chuẩn đời thực
        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            const b = this.bubbles[i];

            if (b.state === 'RISING') {
                b.mesh.position.y += b.speedY * delta;
                b.wobble += delta * (b.wobbleSpeed || 5.0);
                b.mesh.position.x += Math.sin(b.wobble) * 0.002 + b.driftX * delta;
                b.mesh.position.z += Math.cos(b.wobble) * 0.002 + b.driftZ * delta;

                // Khi hạt tăm chạm mặt nước (y >= 0.005)
                if (b.mesh.position.y >= 0.005) {
                    b.mesh.position.y = 0.005;
                    b.state = 'SURFACE_FLOATING';
                    // Tạo gợn tăm lăn tăn siêu nhỏ (Micro Ripple 4cm - 12cm)
                    this.spawnMicroRipple(b.mesh.position.x, b.mesh.position.z, b.isBigCarp ? 1.2 : 0.8);
                }
            } else if (b.state === 'SURFACE_FLOATING') {
                // Đọng dập dềnh trên mặt nước tạo thành tổ tăm chép đặc trưng
                b.surfaceTimer -= delta;
                b.surfaceBobPhase += delta * 3.2;
                b.mesh.position.y = 0.005 + Math.sin(b.surfaceBobPhase) * 0.0012;
                b.mesh.position.x += b.driftX * delta * 0.3;
                b.mesh.position.z += b.driftZ * delta * 0.3;

                // Khi hết thời gian sống trên mặt nước: bọt vỡ ("pop")
                if (b.surfaceTimer <= 0) {
                    this.spawnMicroRipple(b.mesh.position.x, b.mesh.position.z, b.isBigCarp ? 0.95 : 0.65);
                    this.scene.remove(b.mesh);
                    this.bubbles.splice(i, 1);
                }
            }
        }

        // 4.5. CẬP NHẬT CÁ TRỒI LÊN MẶT NƯỚC THỞ & QUẪY ĐUÔI (TỈ LỆ TRẮM ĐEN CAO HƠN!)
        this.breachTimer -= delta;
        if (this.breachTimer <= 0 && this.surfaceBreachers.length < 2) {
            this.breachTimer = 22.0 + Math.random() * 20.0;
            this.spawnSurfaceBreach(playerPos);
        }
        for (let i = this.surfaceBreachers.length - 1; i >= 0; i--) {
            const br = this.surfaceBreachers[i];
            br.elapsed += delta;
            const p = br.elapsed / br.duration;
            if (p >= 1.0) {
                this.scene.remove(br.mesh);
                this.surfaceBreachers.splice(i, 1);
                continue;
            }
            // Quỹ đạo cong trồi lên mặt nước (y: -0.6 -> +0.28 -> -0.75) + quẫy đuôi mạnh ở đỉnh!
            const arc = Math.sin(p * Math.PI);
            const y = -0.62 + arc * 0.90;
            br.mesh.position.x = br.startX + br.dirX * br.elapsed * 1.15;
            br.mesh.position.z = br.startZ + br.dirZ * br.elapsed * 1.15;
            br.mesh.position.y = y;
            // Ngóc đầu lên khi trồi, chúc đầu lặn xuống khi quay về đáy + vẫy thân/đuôi mạnh
            br.mesh.rotation.x = (0.5 - p) * 1.15;
            br.mesh.rotation.y = br.yaw + Math.sin(br.elapsed * 26.0) * 0.24;
            br.mesh.rotation.z = Math.sin(br.elapsed * 22.0) * 0.35;

            if (!br.splashedApex && p >= 0.44) {
                br.splashedApex = true;
                this.spawnRipple(br.mesh.position.x, br.mesh.position.z, 2.2);
                this.spawnCarpBubbles(br.mesh.position.x, br.mesh.position.z, true, true);
                if (!playerPos || Math.hypot(br.mesh.position.x - playerPos.x, br.mesh.position.z - playerPos.z) < 42) {
                    soundManager.playWaterSplash(1.4);
                }
            }
        }

        // 4.6. CÁ CHẾT NỔI LỀNH BỀNH NGỬA BỤNG TRÊN MẶT NƯỚC (1 CON/NGÀY CHỜ CHỦ HỒ HỚT)
        if (this.floatingDeadFish && this.floatingDeadFish.mesh) {
            this.floatingDeadFish.bobPhase += delta * 2.2;
            const df = this.floatingDeadFish;
            df.mesh.position.y = 0.028 + Math.sin(df.bobPhase) * 0.012;
            df.mesh.rotation.x = Math.sin(df.bobPhase * 0.7) * 0.08;
            df.mesh.rotation.z = Math.PI + Math.cos(df.bobPhase * 0.9) * 0.12; // Lật ngửa bụng trắng!
        }

        // 4. Gợn sóng loang dần (Gợn tăm cá lăn tăn & Gợn sóng nước lớn)
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const r = this.ripples[i];
            r.scale += r.speed * delta;
            r.mesh.scale.set(r.scale, r.scale, r.scale);

            if (r.isMicro) {
                // Gợn tăm cá tan biến nhanh và êm dịu trong ~0.75 giây
                r.opacity -= delta * 0.92;
            } else {
                r.opacity -= delta * 0.55;
            }
            r.mesh.material.opacity = Math.max(0, r.opacity);

            const limitScale = r.isMicro ? (r.maxScale || 1.2) : ((r.maxRadius || 0.6) * 2.2);
            if (r.opacity <= 0 || r.scale >= limitScale) {
                this.scene.remove(r.mesh);
                this.ripples.splice(i, 1);
            }
        }
    }

    // ==================== CÁ TRỒI THỞ QUẪY ĐUÔI & CÁ CHẾT NỔI LỀNH BỀNH ====================
    spawnSurfaceBreach(playerPos = null) {
        // Tỉ lệ Trắm Đen trồi lên thở quẫy đuôi CAO HƠN HẲN (56% Trắm Đen, 24% Chép Lợn/Củ, 20% Trắm Cỏ/Chép)
        const r = Math.random();
        let speciesKey = 'BLACK_CARP';
        let label = 'Cá Trắm Đen';
        let weight = Number((8.0 + Math.random() * 9.5).toFixed(1));
        if (r < 0.56) {
            speciesKey = 'BLACK_CARP';
            label = 'Cá Trắm Đen';
            weight = Number((8.5 + Math.random() * 9.0).toFixed(1));
        } else if (r < 0.80) {
            speciesKey = 'OLD_CARP';
            label = 'Cá Chép Lợn (Chép Củ)';
            weight = Number((7.5 + Math.random() * 8.0).toFixed(1));
        } else {
            speciesKey = Math.random() < 0.5 ? 'GRASS_CARP' : 'CARP';
            label = speciesKey === 'GRASS_CARP' ? 'Cá Trắm Cỏ' : 'Cá Chép';
            weight = Number((4.0 + Math.random() * 5.5).toFixed(1));
        }

        // Chọn vị trí mặt hồ trong tầm mắt cần thủ (cách 10-34m) để nhìn thấy rõ pha quẫy đuôi!
        const baseX = playerPos ? THREE.MathUtils.clamp(playerPos.x + (Math.random() - 0.5) * 44, -this.lakeHalfW + 8, this.lakeHalfW - 8) : (Math.random() - 0.5) * 80;
        const baseZ = (Math.random() - 0.5) * (this.lakeHalfD * 1.45);
        const yaw = Math.random() * Math.PI * 2;
        const mesh = buildRealisticFish(speciesKey, weight);
        mesh.position.set(baseX, -0.62, baseZ);
        mesh.rotation.y = yaw;
        this.scene.add(mesh);

        this.spawnRipple(baseX, baseZ, 1.5);
        this.surfaceBreachers.push({
            mesh,
            speciesKey,
            label,
            weight,
            startX: baseX,
            startZ: baseZ,
            dirX: Math.sin(yaw),
            dirZ: Math.cos(yaw),
            yaw,
            elapsed: 0,
            duration: 2.3 + Math.random() * 0.5,
            splashedApex: false
        });

        if (speciesKey === 'BLACK_CARP' || weight >= 9.0) {
            this.lastMindLog = `🌊 ${label} (~${weight}kg) vừa trồi lưng lên mặt nước thở & quẫy đuôi ầm ầm rồi lặn xuống đáy!`;
            window.dispatchEvent(new CustomEvent('player_fishing_event', {
                detail: { type: 'INFO', text: `🌊 ${speciesKey === 'BLACK_CARP' ? '🐋' : '🐟'} ${label} (~${weight}kg) vừa trồi lên mặt hồ thở quẫy đuôi tung bọt rồi lặn mất tăm!` }
            }));
        }
    }

    spawnFloatingDeadFish() {
        this.removeFloatingDeadFish();
        const speciesPool = [
            { key: 'CARP', name: 'Cá Chép', weight: Number((3.2 + Math.random() * 3.5).toFixed(1)) },
            { key: 'GRASS_CARP', name: 'Cá Trắm Cỏ', weight: Number((4.5 + Math.random() * 4.0).toFixed(1)) },
            { key: 'TILAPIA', name: 'Cá Rô Phi', weight: Number((1.4 + Math.random() * 1.2).toFixed(1)) }
        ];
        const pick = speciesPool[Math.floor(Math.random() * speciesPool.length)];
        // Nổi lềnh bềnh gần mép bờ Nam/Bắc để cần thủ nhìn thấy rõ & Chủ Hồ dễ vác vợt ra hớt!
        const sideSouth = Math.random() < 0.65;
        const fx = (Math.random() - 0.5) * 48;
        const fz = sideSouth ? (this.lakeHalfD - 2.4) : (-this.lakeHalfD + 2.4);

        const mesh = buildRealisticFish(pick.key, pick.weight);
        mesh.position.set(fx, 0.028, fz);
        mesh.rotation.z = Math.PI; // Ngửa bụng trắng lên trời!
        mesh.rotation.y = Math.random() * Math.PI * 2;
        this.scene.add(mesh);
        this.spawnRipple(fx, fz, 1.0);

        this.floatingDeadFish = {
            mesh,
            name: pick.name,
            weight: pick.weight,
            x: fx,
            z: fz,
            sideSouth,
            bobPhase: 0
        };
        return this.floatingDeadFish;
    }

    removeFloatingDeadFish() {
        if (this.floatingDeadFish && this.floatingDeadFish.mesh) {
            this.scene.remove(this.floatingDeadFish.mesh);
        }
        this.floatingDeadFish = null;
    }

    // ==================== CÔNG CỤ NHÀ PHÁT TRIỂN (DEV TOOLS) ====================
    // Qua ngày mới (06:00 sáng sau đêm nghỉ Lán Trại):
    // 1. Cộng thêm 1 ngày lưu hồ (daysInLake += 1) -> cá đủ 5 ngày bồi trở đi chính thức thành CÁ CŨ!
    // 2. Cá tiêu hóa thức ăn 1 ngày -> hết 1-2 ngày sẽ đói lại!
    onNewLakeDay() {
        this.spotOverfeedCount = 0;
        let hungryAgainCount = 0;
        let becameOldCount = 0;
        this.fishSchools.forEach(fish => {
            fish.daysInLake = (fish.daysInLake || 0) + 1;
            if (fish.daysInLake >= 2) fish.isFresh = false;
            if (fish.daysInLake === 5) {
                becameOldCount++;
                fish.caution = Math.min(0.95, (fish.caution || 0.5) + 0.14);
                if (fish.mind) {
                    fish.mind.suspicion = Math.min(0.92, (fish.mind.suspicion || 0.4) + 0.12);
                    fish.mind.lastThought = '🧓 Đã ở hồ đủ 5 ngày — thành Cá Cũ, dạt về cuối hồ & chỉ mê Ốc/Ngô!';
                }
            }
            if ((fish.fullDaysLeft || 0) > 0) {
                fish.fullDaysLeft = Math.max(0, Number((fish.fullDaysLeft - 1.0).toFixed(1)));
                if (fish.fullDaysLeft <= 0 && fish.mind) {
                    fish.mind.satiety = Math.max(0.15, (fish.mind.satiety || 0.85) - 0.58);
                    fish.hunger = THREE.MathUtils.clamp(1.0 - fish.mind.satiety * 0.85, 0.25, 1.0);
                    fish.mind.lastThought = '😋 Đã tiêu hóa hết sau 1-2 ngày no, bụng đói đi kiếm ăn trở lại!';
                    hungryAgainCount++;
                }
            } else if (fish.mind) {
                fish.mind.satiety = Math.max(0.10, (fish.mind.satiety || 0.3) - 0.25);
                fish.hunger = THREE.MathUtils.clamp(1.0 - fish.mind.satiety * 0.85, 0.25, 1.0);
            }
        });
        if (becameOldCount > 0) {
            this.lastMindLog = `🧓 ${becameOldCount} con cá bồi đủ 5 ngày đã thành CÁ CŨ — bắt đầu dạt về cuối hồ, cày nhiều tăm và kén cám!`;
        }
        // Duy trì tổng lượng cá dưới hồ luôn đạt tối thiểu 1,5 tấn - 2,0 tấn (1.500kg - 2.000kg)
        const curBiomass = this.getTotalBiomassKg();
        if (curBiomass < this.minBiomassKg) {
            const needKg = Math.min(450, (this.targetBiomassKg || 1750) - curBiomass);
            const approxCount = Math.max(8, Math.round(needKg / 6.5));
            this.spawnStockingBatch(0, -14, approxCount);
        }
        return hungryAgainCount;
    }

    // Đồng bộ sinh thái hồ tự nhiên theo thời tiết ổn định nhiều ngày (Nắng / Nhiều mây / Mưa)
    syncEcologyWithWeather(weather = 'SUNNY') {
        let key = 'NORMAL';
        const r = Math.random();
        if (weather === 'RAINY') {
            key = r < 0.68 ? 'OXYGEN_SHOWER' : (r < 0.85 ? 'COLD_NORTH_WIND' : 'NORMAL');
        } else if (weather === 'CLOUDY') {
            key = r < 0.55 ? 'NORMAL' : (r < 0.82 ? 'LOW_PRESSURE_SUSPEND' : 'FRESH_WATER_PUMP');
        } else {
            key = r < 0.55 ? 'NORMAL' : (r < 0.78 ? 'HOT_NOON_SHADE' : (r < 0.90 ? 'SMALL_FRY_SWARM' : 'FRESH_WATER_PUMP'));
        }
        return this.pickRandomEcologyEvent(key);
    }

    pickRandomEcologyEvent(forceKey = null) {
        const keys = Object.keys(ECOLOGY_EVENTS);
        const key = (forceKey && ECOLOGY_EVENTS[forceKey])
            ? forceKey
            : keys[Math.floor(Math.random() * keys.length)];
        this.activeEcologyEvent = ECOLOGY_EVENTS[key];

        // Nếu bơm nước mới -> cá tiêu hóa nhanh hơn 0.5 ngày!
        if (key === 'FRESH_WATER_PUMP') {
            this.fishSchools.forEach(f => {
                if ((f.fullDaysLeft || 0) > 0) f.fullDaysLeft = Math.max(0, Number((f.fullDaysLeft - 0.5).toFixed(1)));
                if (f.mind) {
                    f.mind.satiety = Math.max(0.15, (f.mind.satiety || 0.4) - 0.18);
                    f.hunger = THREE.MathUtils.clamp(1.0 - f.mind.satiety * 0.85, 0.2, 1.0);
                }
            });
        }
        window.dispatchEvent(new CustomEvent('real_life_scenario', {
            detail: {
                title: `🌦️ DIỄN BIẾN HỒ CÂU: ${this.activeEcologyEvent.badge}`,
                desc: this.activeEcologyEvent.desc,
                type: this.activeEcologyEvent.eatMul >= 1.1 ? 'GOLD' : (this.activeEcologyEvent.eatMul < 0.7 ? 'WARN' : 'INFO')
            }
        }));
        return this.activeEcologyEvent;
    }

    devSetVisible3DFish(visible) {
        this.devForceShow3D = !!visible;
        if (this.aiFishGroup) {
            this.aiFishGroup.visible = this.devForceShow3D;
        }
    }

    devPullFishToFloat(count = 4) {
        const target = this.activeHookTarget
            ? { x: this.activeHookTarget.x, z: this.activeHookTarget.z }
            : { x: this.gatherCenter.x, z: this.gatherCenter.z };

        const sorted = [...this.fishSchools].sort((a, b) =>
            Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z)
        );
        const picked = sorted.slice(0, count);
        picked.forEach((f, idx) => {
            const ang = (idx / Math.max(1, picked.length)) * Math.PI * 2;
            f.x = target.x + Math.cos(ang) * (1.8 + Math.random() * 1.4);
            f.z = target.z + Math.sin(ang) * (1.8 + Math.random() * 1.4);
            f.targetX = target.x;
            f.targetZ = target.z;
            f.aiState = AI_FISH_STATES.SMELL_SEEK;
            f.stateTimer = 8.0;
            f.hunger = Math.max(f.hunger, 0.85);
            if (f.mind) {
                f.mind.suspicion = Math.min(f.mind.suspicion, 0.22);
                f.mind.satiety = 0.15;
                f.mind.lastThought = '[DEV] Được kéo vào ổ thử nghiệm cắn mồi';
            }
        });
        this.spotAlertLevel = Math.max(0.05, this.spotAlertLevel * 0.3);
        return picked.length;
    }

    devCalmAllFish() {
        this.spotAlertLevel = 0.05;
        this.fishSchools.forEach(f => {
            if (f.aiState === AI_FISH_STATES.STARTLED_FLEE || f.aiState === AI_FISH_STATES.REJECT_TURN) {
                f.aiState = AI_FISH_STATES.CRUISE;
                f.stateTimer = 4.0;
            }
            f.caution = Math.max(0.18, f.caution * 0.65);
            if (f.mind) {
                f.mind.suspicion = Math.max(0.1, f.mind.suspicion * 0.45);
                f.mind.lastThought = '[DEV] Đã trấn an, bơi bình thường';
            }
        });
    }
}
