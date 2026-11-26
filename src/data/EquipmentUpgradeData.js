// Hệ Thống Dữ Liệu Nâng Cấp Trang Bị Câu Đài Chuyên Nghiệp Việt Nam
// Gồm 7 hạng mục: Cần, Phao, Trục & Thẻo, Gác Cần, Pad/Khay Mồi, Thùng Câu Đài, Ô Câu Đài

export const EQUIPMENT_CATEGORIES = [
    {
        key: 'rod',
        label: 'Cần Câu Đài (Rep 1:1)',
        icon: '🎣',
        subtitle: 'Chuẩn hãng VN: Handing • Kaiwo • GUF • Gama • Hua',
        tiers: [
            {
                level: 1,
                name: 'Handing Shark 4.5m (4H • 28i)',
                tierTag: 'Quốc Dân',
                price: 0,
                rodColor: 0x3b1219,       // Đỏ sẫm phối bạc đặc trưng Handing Shark
                accentColor: 0xe2e8f0,    // Chỉ bạc sắc nhọn
                secondaryAccent: 0xef4444,// Viền đỏ
                gripColor: 0x1e293b,
                tensionReduce: 0.0,
                staminaDrainMul: 1.0,
                maxSafeWeight: 7,
                desc: 'Tông Đỏ - Bạc sắc nhọn đặc trưng Handing Shark. Độ cứng 4H phân bổ lực 28i dẻo dai, bắt chép 1–5kg êm tay.'
            },
            {
                level: 2,
                name: 'Handing La Văn Cương Gen 3 • 5.4m (5H • 28i)',
                tierTag: 'Dịch Vụ',
                price: 380000,
                rodColor: 0x1a3a2f,       // Xanh rêu phối carbon đen bóng La Văn Cương
                accentColor: 0x10b981,
                secondaryAccent: 0xfacc15,
                gripColor: 0x0f172a,
                tensionReduce: 0.12,
                staminaDrainMul: 1.12,
                maxSafeWeight: 11,
                desc: 'Tông Xanh Rêu phối carbon bóng tinh tế. Cần 5H đánh hồ dịch vụ cực bền, giảm 12% căng dây.'
            },
            {
                level: 3,
                name: 'Kaiwo Kiếm Vũ Lý Chiến 5.4m (5H • LRC Nhật)',
                tierTag: 'Cao Cấp',
                price: 720000,
                rodColor: 0x0f5c5c,       // Xanh ngọc bích mát mắt Kaiwo Kiếm Vũ
                accentColor: 0x5eead4,    // Ngọc bích sáng
                secondaryAccent: 0xf8fafc,
                gripColor: 0x134e4a,
                tensionReduce: 0.20,
                staminaDrainMul: 1.24,
                maxSafeWeight: 15,
                desc: 'Carbon nén nhựa LRC Nhật màu Xanh Ngọc Bích đặc trưng Kaiwo, đầu xoay 360° bảo vệ thẻo cực tốt (-20% căng).'
            },
            {
                level: 4,
                name: 'GUF Hắc Bạch Gen 2 • 6.3m (5.5H • 28i)',
                tierTag: 'Thi Đấu Pro',
                price: 1150000,
                rodColor: 0x111827,       // Đen tuyền đối lập Trắng Ngọc Trai GUF Hắc Bạch
                accentColor: 0xf8fafc,    // Trắng ngọc trai nổi bật
                secondaryAccent: 0x38bdf8,
                gripColor: 0x09090b,
                tensionReduce: 0.28,
                staminaDrainMul: 1.36,
                maxSafeWeight: 20,
                desc: 'Phối màu Đen – Trắng đối lập huyền thoại GUF Hắc Bạch Gen 2. Nảy đanh, bo cá chép củ cực đã (-28% căng).'
            },
            {
                level: 5,
                name: 'Gama Huyết Long 3D • 6.3m (6.5H • 19i)',
                tierTag: 'Săn Hàng',
                price: 1650000,
                rodColor: 0x7f1d1d,       // Đỏ huyết rực rỡ vảy rồng 3D Gama
                accentColor: 0xfacc15,    // Đai vàng kim vảy rồng
                secondaryAccent: 0xff2a00,
                gripColor: 0x450a0a,
                tensionReduce: 0.35,
                staminaDrainMul: 1.48,
                maxSafeWeight: 28,
                desc: 'Sơn Đỏ Huyết 3D vảy rồng quyền uy dòng Gama Huyết Long 6.5H phân bổ 19i, khóa đầu trắm đen bạo lực!'
            },
            {
                level: 6,
                name: 'GUF Vương Quyền MAX / Hua Hắc Ảnh 7.2m (8H VIP)',
                tierTag: 'Huyền Thoại',
                price: 2400000,
                rodColor: 0x09090b,       // Đen huyền bí carbon 46T
                accentColor: 0xf59e0b,    // Vàng đồng Vương Quyền ánh kim
                secondaryAccent: 0xfef08a,
                gripColor: 0x422006,
                tensionReduce: 0.44,
                staminaDrainMul: 1.65,
                maxSafeWeight: 40,
                desc: 'Đỉnh cao săn thủy quái 8H Đen Tuyền phối Vàng Đồng Vương Quyền, giảm 44% lực căng & ép cá nổi siêu tốc!'
            }
        ]
    },
    {
        key: 'float',
        label: 'Phao Câu Đài (Rep 1:1)',
        icon: '📍',
        subtitle: 'Chuẩn dáng bầu 3D: Quả Trám • Giọt Nước • Cỏ Sậy • Lông Công • LED',
        tiers: [
            {
                level: 1,
                name: 'Phao Nano Quốc Dân • Bầu Quả Trám (Tăm 9 nấc)',
                tierTag: 'Quốc Dân',
                price: 0,
                shape: 'DIAMOND',         // Bầu quả trám phình giữa, thon đều hai đầu
                bodyColor: 0xe2e8f0,      // Thân trắng ngọc vai đỏ
                bandColor: 0xdc2626,
                tipRadius: 0.0046,
                tipMarks: 9,
                glowTip: false,
                ledBiteColor: false,
                takeWindowBonus: 0.0,
                biteSpeedBonus: 1.0,
                desc: 'Chất liệu Nano ép khối, bầu Quả Trám thon đều 2 đầu, lọc tín hiệu cá con phá mồi cực tốt.'
            },
            {
                level: 2,
                name: 'Phao Nano Sa Phạm • Bầu Giọt Nước (Tăm 11 nấc)',
                tierTag: 'Cao Cấp',
                price: 240000,
                shape: 'TEARDROP',        // Bầu giọt nước vai to, thon dần xuống chân
                bodyColor: 0x0284c7,      // Xanh ngọc phản quang Sa Phạm
                bandColor: 0xfacc15,
                tipRadius: 0.0052,
                tipMarks: 11,
                glowTip: true,
                ledBiteColor: false,
                takeWindowBonus: 0.16,
                biteSpeedBonus: 1.08,
                desc: 'Dáng Bầu Giọt Nước vai to xuống mồi cực nhanh, bắt trọn nhịp đè/bềnh 0.5s (+16% thời gian giật).'
            },
            {
                level: 3,
                name: 'Phao Cỏ Sậy Tự Nhiên • Bầu Thon Dài (Tăm mảnh 13 nấc)',
                tierTag: 'Chuyên Nhát',
                price: 520000,
                shape: 'SLIM_REED',       // Thân cỏ sậy thuôn dài siêu mảnh
                bodyColor: 0xd6b370,      // Màu cỏ sậy tự nhiên cổ chỉ đỏ
                bandColor: 0xb91c1c,
                tipRadius: 0.0042,
                tipMarks: 13,
                glowTip: true,
                ledBiteColor: false,
                takeWindowBonus: 0.26,
                biteSpeedBonus: 1.15,
                desc: 'Thân lau sậy tự nhiên siêu nhẹ, 13 nấc tăm mảnh bắt nhạy từng cái nhấp môi của chép bể nhát mồi!'
            },
            {
                level: 4,
                name: 'Phao Lông Công Đấu Giải • Tăm Rỗng Mập (11 nấc)',
                tierTag: 'Thi Đấu Pro',
                price: 880000,
                shape: 'PEACOCK_LONG',    // Bầu dài lông công cao cấp
                bodyColor: 0x065f46,      // Xanh lục bảo ánh kim lông công
                bandColor: 0xfde047,
                tipRadius: 0.0068,        // Tăm rỗng to bản cực dễ nhìn từ xa!
                tipMarks: 11,
                glowTip: true,
                ledBiteColor: false,
                takeWindowBonus: 0.34,
                biteSpeedBonus: 1.22,
                desc: 'Lõi ống lông đuôi chim công cao cấp + Tăm Rỗng to bản cực sáng rõ từ xa, ổn định tuyệt đối trong sóng gió!'
            },
            {
                level: 5,
                name: 'Phao Điện Tử LED Hố Đấu • Đổi Màu Xanh→Đỏ (VIP)',
                tierTag: 'Huyền Thoại',
                price: 1350000,
                shape: 'SHORT_HEAVY',     // Bầu ngắn hố đấu trọng tâm thấp chống sóng
                bodyColor: 0x1e1b4b,      // Carbon đen tím hố đấu
                bandColor: 0x38bdf8,
                tipRadius: 0.0074,        // Tăm LED rỗng cực to rõ
                tipMarks: 11,
                glowTip: true,
                ledBiteColor: true,       // Đổi màu xanh ngọc -> đỏ rực khi cá cắn!
                takeWindowBonus: 0.46,
                biteSpeedBonus: 1.28,
                desc: 'Bầu ngắn hố đấu chống bão + Tăm LED phát quang: bình thường sáng Xanh Ngọc, cá ngậm mồi lập tức rực Đỏ Chói!'
            }
        ]
    },
    {
        key: 'line',
        label: 'Trục & Thẻo Cước',
        icon: '🧵',
        subtitle: 'Chống nổ thẻo, chống cọc & chịu lực kéo',
        tiers: [
            {
                level: 1,
                name: 'Trục 2.5 • Thẻo 1.5 Nylon',
                tierTag: 'Phổ Thông',
                price: 0,
                lineColor: 0xcbd5e1,
                snapResistance: 0.0,
                stakeTimeBonus: 0.0,
                desc: 'Dây mảnh đánh cá nhỏ nhạy nhưng dễ nổ thẻo khi dính chép củ >6kg hoặc cá lao cọc.'
            },
            {
                level: 2,
                name: 'Trục 3.5 • Thẻo 2.5 Carbon Xanh',
                tierTag: 'Cao Cấp',
                price: 260000,
                lineColor: 0x38bdf8,
                snapResistance: 0.25,
                stakeTimeBonus: 0.5,
                desc: 'Chống xoăn và chống mài mòn tốt, giảm 25% nguy cơ đứt thẻo, thêm +0.5s xử lý cá lao cọc.'
            },
            {
                level: 3,
                name: 'Trục 5.0 • Thẻo 3.5 Fluorocarbon',
                tierTag: 'Thi Đấu Pro',
                price: 620000,
                lineColor: 0xfde047,
                snapResistance: 0.50,
                stakeTimeBonus: 1.0,
                desc: 'Dây chìm nhanh tàng hình dưới nước, giảm 50% nguy cơ nổ thẻo & thêm +1.0s cứu cá cuốn cọc.'
            },
            {
                level: 4,
                name: 'Trục 7.0 • Thẻo 5.0 Săn Thủy Quái',
                tierTag: 'Huyền Thoại',
                price: 1200000,
                lineColor: 0xf97316,
                snapResistance: 0.78,
                stakeTimeBonus: 1.6,
                desc: 'Cước siêu bền phủ Titanium chống cứa cọc tre, giảm 78% nổ thẻo & thêm +1.6s xử lý tình huống hiểm.'
            }
        ]
    },
    {
        key: 'rodRest',
        label: 'Gác Cần Đài',
        icon: '🥢',
        subtitle: 'Đỡ cần êm ái, chống trượt & phản xạ giật',
        tiers: [
            {
                level: 1,
                name: 'Gác Cần Nhôm Thường 1.8m',
                tierTag: 'Phổ Thông',
                price: 0,
                boomColor: 0x475569,
                headColor: 0xdc2626,
                tipColor: 0xfacc15,
                strikeBonus: 0.0,
                desc: 'Gác cần cơ bản đầu chữ V cao su, đủ dùng để gác cần nghỉ tay.'
            },
            {
                level: 2,
                name: 'Gác Cần Inox Khóa Nhanh 2.1m',
                tierTag: 'Cao Cấp',
                price: 280000,
                boomColor: 0x94a3b8,
                headColor: 0x0284c7,
                tipColor: 0xe2e8f0,
                strikeBonus: 0.08,
                desc: 'Khớp khóa inox sáng bóng chắc chắn, nhấc cần giật cá gọn và mượt hơn (+8% độ chuẩn).'
            },
            {
                level: 3,
                name: 'Gác Cần Carbon Đầu Silicon 2.4m',
                tierTag: 'Thi Đấu Pro',
                price: 640000,
                boomColor: 0x1e293b,
                headColor: 0x10b981,
                tipColor: 0x38bdf8,
                strikeBonus: 0.16,
                desc: 'Thân carbon siêu nhẹ kèm con lăn silicon bảo vệ lóng cần, tăng 16% phản xạ đóng cá.'
            },
            {
                level: 4,
                name: 'Gác Cần Titanium Đấu Giải Vàng Kim',
                tierTag: 'Huyền Thoại',
                price: 1150000,
                boomColor: 0x0f172a,
                headColor: 0xfacc15,
                tipColor: 0xf97316,
                strikeBonus: 0.25,
                desc: 'Gác cần Titanium mạ vàng đấu giải, con lăn bi gốm siêu mượt, tăng 25% hiệu quả đóng đinh hàm cá!'
            }
        ]
    },
    {
        key: 'baitPad',
        label: 'Pad / Khay Đựng Mồi',
        icon: '🍽️',
        subtitle: 'Tăng tầng khay 3D, giữ mồi & tụ ổ nhanh',
        tiers: [
            {
                level: 1,
                name: 'Khay Mồi Kẹp Pat + Cốc Nước Chấm Tay',
                tierTag: 'Phổ Thông',
                price: 0,
                trayLayers: 1,
                rimColor: 0x94a3b8,
                innerColor: 0x1e3a8a,
                towelColor: 0x38bdf8,
                attractionBonus: 1.0,
                desc: 'Khay mồi tròn gắn pat inox có đĩa nam châm hút lưỡi, cốc nước nhúng tay vê mồi & khăn lau.'
            },
            {
                level: 2,
                name: 'Pad Từ Tính 2 Tầng Xanh Ngọc (+10% Mồi Vê)',
                tierTag: 'Cao Cấp',
                price: 320000,
                trayLayers: 2,
                rimColor: 0xcbd5e1,
                innerColor: 0x0284c7,
                towelColor: 0x38bdf8,
                attractionBonus: 1.12,
                desc: 'Khay từ tính xoay 2 tầng tách biệt mồi câu & mồi xả, giữ ẩm vê thêm +10% viên mồi & tụ ổ nhanh +12%.'
            },
            {
                level: 3,
                name: 'Pad Inox CNC 3 Tầng Vuốt Mồi Pro (+20% Mồi Vê)',
                tierTag: 'Thi Đấu Pro',
                price: 680000,
                trayLayers: 3,
                rimColor: 0xe2e8f0,
                innerColor: 0x059669,
                towelColor: 0x34d399,
                attractionBonus: 1.24,
                desc: 'Bộ 3 tầng inox CNC + khay bột tơ nhện, chống khô cám vê thêm +20% viên mồi & tăng +24% tốc độ tụ ổ.'
            },
            {
                level: 4,
                name: 'Pad Carbon Đấu Giải Vành Chắn Nắng (+30% Mồi Vê)',
                tierTag: 'Huyền Thoại',
                price: 1250000,
                trayLayers: 3,
                hasCover: true,
                rimColor: 0xfacc15,
                innerColor: 0x0f172a,
                towelColor: 0xf59e0b,
                attractionBonus: 1.38,
                desc: 'Pad carbon mạ vàng 3 tầng có vành chắn nắng gió chống bay hơi, vê thêm +30% lượng mồi & +38% tụ ổ!'
            }
        ]
    },
    {
        key: 'box',
        label: 'Thùng Câu Đài',
        icon: '🧰',
        subtitle: 'Tăng thưởng bán cá, địa hình vững & tiện ích',
        tiers: [
            {
                level: 1,
                name: 'Ghế Xếp Vải Dù Phổ Thông',
                tierTag: 'Phổ Thông',
                price: 0,
                boxColor: 0x334155,
                accentColor: 0x64748b,
                rewardBonus: 0.0,
                hasLegs: false,
                desc: 'Ghế xếp đơn giản gọn nhẹ, chưa có thùng bảo ôn giữ cá và pat gắn phụ kiện.'
            },
            {
                level: 2,
                name: 'Thùng Nhựa 28L Có Tựa Lưng',
                tierTag: 'Cao Cấp',
                price: 420000,
                boxColor: 0x0369a1,
                accentColor: 0x38bdf8,
                rewardBonus: 0.10,
                hasLegs: true,
                desc: 'Thùng câu 28L giữ mát đồ uống & mồi, ngồi vững chắc, thưởng +10% giá trị mỗi con cá lên bờ.'
            },
            {
                level: 3,
                name: 'Thùng 32L Chân Địa Hình Inox',
                tierTag: 'Thi Đấu Pro',
                price: 890000,
                boxColor: 0x1e293b,
                accentColor: 0x10b981,
                rewardBonus: 0.20,
                hasLegs: true,
                desc: 'Chân địa hình 4 góc chống trượt cân bằng mọi bờ kè, thưởng +20% tiền cá & bo cá êm hơn.'
            },
            {
                level: 4,
                name: 'Thùng Carbon 36L Full Pat Đấu Giải',
                tierTag: 'Huyền Thoại',
                price: 1650000,
                boxColor: 0x09090b,
                accentColor: 0xfacc15,
                rewardBonus: 0.35,
                hasLegs: true,
                desc: 'Thùng câu đài siêu VIP full pat inox mạ vàng, thưởng +35% giá trị cá & dáng ngồi chuẩn đại sư!'
            }
        ]
    },
    {
        key: 'umbrella',
        label: 'Ô Câu Đài',
        icon: '⛱️',
        subtitle: 'Che nắng mưa 3D trên đầu & giảm ảnh hưởng thời tiết',
        tiers: [
            {
                level: 1,
                name: 'Ô Bạt Xanh Phổ Thông 1.8m (Bấm O Nghiêng/Gập)',
                tierTag: 'Phổ Thông',
                price: 0,
                visible: true,
                canopyScale: 0.88,
                canopyColor: 0x0369a1,
                trimColor: 0xbae6fd,
                doubleLayer: false,
                weatherShield: 0.15,
                desc: 'Ô che nắng cơ bản 1.8m 12 nan sắt có khớp lò xo nghiêng cổ ô (Phím O), giảm 15% chói nắng mặt nước.'
            },
            {
                level: 2,
                name: 'Ô Câu Đài Phủ Bạc UV 2.2m Xanh Ngọc',
                tierTag: 'Cao Cấp',
                price: 350000,
                visible: true,
                canopyScale: 1.0,
                canopyColor: 0x0284c7,
                trimColor: 0xfef08a,
                doubleLayer: false,
                weatherShield: 0.38,
                desc: 'Tán ô vòm cong 2.2m tráng bạc chống tia UV có diềm rủ che nắng xiên, giảm 38% sóng gió lên phao.'
            },
            {
                level: 3,
                name: 'Ô 2 Tầng Thoáng Gió 2.4m Nan Thủy Tinh',
                tierTag: 'Thi Đấu Pro',
                price: 760000,
                visible: true,
                canopyScale: 1.08,
                canopyColor: 0x065f46,
                trimColor: 0x34d399,
                doubleLayer: true,
                weatherShield: 0.68,
                desc: 'Thiết kế 2 tầng thoát gió thông minh 12 nan sợi thủy tinh kép chống lật ô, giảm 68% rung lắc thời tiết.'
            },
            {
                level: 4,
                name: 'Ô Đấu Giải Chống Bão 2.6m Đen Vàng Hoàng Kim',
                tierTag: 'Huyền Thoại',
                price: 1350000,
                visible: true,
                canopyScale: 1.16,
                canopyColor: 0x111827,
                trimColor: 0xfacc15,
                doubleLayer: true,
                weatherShield: 0.92,
                desc: 'Ô đại sư 2.6m phủ Vinyl đen chống nóng tuyệt đối, nan kép carbon viền vàng kim, giảm 92% mưa bão!'
            }
        ]
    }
];

export function getDefaultEquipmentLevels() {
    return {
        rod: 1,
        float: 1,
        line: 1,
        rodRest: 1,
        baitPad: 1,
        box: 1,
        umbrella: 1
    };
}

export function getEquippedTier(categoryKey, level = 1) {
    const cat = EQUIPMENT_CATEGORIES.find(c => c.key === categoryKey);
    if (!cat) return null;
    const idx = Math.max(0, Math.min(cat.tiers.length - 1, (level || 1) - 1));
    return cat.tiers[idx];
}

export function computeEquipmentBonuses(levels) {
    const rod = getEquippedTier('rod', levels.rod);
    const flt = getEquippedTier('float', levels.float);
    const line = getEquippedTier('line', levels.line);
    const rest = getEquippedTier('rodRest', levels.rodRest);
    const pad = getEquippedTier('baitPad', levels.baitPad);
    const box = getEquippedTier('box', levels.box);
    const umb = getEquippedTier('umbrella', levels.umbrella);

    return {
        rod,
        float: flt,
        line,
        rodRest: rest,
        baitPad: pad,
        box,
        umbrella: umb,
        tensionReduce: rod.tensionReduce,
        staminaDrainMul: rod.staminaDrainMul,
        maxSafeWeight: rod.maxSafeWeight,
        takeWindowBonus: flt.takeWindowBonus + rest.strikeBonus * 0.5,
        biteSpeedBonus: flt.biteSpeedBonus * pad.attractionBonus,
        snapResistance: line.snapResistance,
        stakeTimeBonus: line.stakeTimeBonus,
        rewardBonus: box.rewardBonus,
        weatherShield: umb.weatherShield,
        ledBiteColor: flt.ledBiteColor
    };
}
