// Hệ thống Pha Mồi Câu Đài Chuyên Nghiệp (Áp dụng Quy Tắc Nước Đục / Nước Trong & Nồng Độ Hương Liệu)

export class BaitMixingSystem {
    constructor() {
        this.currentMix = {
            baseBait: null,
            baseWeight: 200, // gram
            flavors: {},     // itemId: drops
            waterRatio: 0.8, // 1 phần mồi : 0.8 phần nước
            baitFirmness: 'MEDIUM', // 'SOFT' (Vê Mềm Bung Sương) | 'MEDIUM' (Vê Dẻo Chuẩn) | 'HARD' (Vê Chặt Chống Rỉa)
            rigStyle: 'STANDARD',   // 'SENSITIVE' (Cân 7 Câu 2 Nhạy) | 'STANDARD' (Cân 5 Câu 3 Đáy) | 'HEAVY_LEAD' (Chì Nằm Đáy Săn Hàng)
            mixType: 'dual'
        };

        // Khởi đầu KHAY MỒI TRỐNG: Bắt buộc người chơi phải pha mồi, vê mồi & cân phao trước khi ra cần!
        this.mixedBaits = {
            hookBait: null,   // Mồi vê câu (null cho tới khi pha)
            groundBait: null  // Mồi xả tụ ổ (null cho tới khi pha)
        };

        this.savedRecipes = [];
    }

    resetTray() {
        this.mixedBaits.hookBait = null;
        this.mixedBaits.groundBait = null;
    }

    setBaitFirmness(firmness) {
        this.currentMix.baitFirmness = firmness;
    }

    setRigStyle(style) {
        this.currentMix.rigStyle = style;
    }

    setBaseBait(item) {
        this.currentMix.baseBait = item;
    }

    setBaseWeight(weight) {
        this.currentMix.baseWeight = Math.max(100, Math.min(1000, weight));
    }

    setFlavorDrops(flavorId, drops) {
        if (drops <= 0) {
            delete this.currentMix.flavors[flavorId];
        } else {
            this.currentMix.flavors[flavorId] = drops;
        }
    }

    setWaterRatio(ratio) {
        this.currentMix.waterRatio = Math.round(ratio * 100) / 100;
    }

    // Tính toán hệ số thu hút thực tế của mồi theo Độ Đục Của Nước (Trời Mưa Nước Đục vs Trời Nắng Nước Trong)
    static getWaterFlavorEffect(totalFlavorDrops = 3, weather = 'SUNNY') {
        if (weather === 'RAINY') {
            // QUY TẮC CÂU ĐÀI KHI TRỜI MƯA - NƯỚC ĐỤC PHÙ SA:
            // Nước đục cản mùi -> Hương liệu ĐẬM (>= 6 giọt) xuyên nước đục thu hút cá cực mạnh!
            // Hương liệu NHẠT (<= 3 giọt) bị bùn đất lấn át -> Thu hút cá ít hơn hẳn!
            if (totalFlavorDrops >= 6) {
                return {
                    multiplier: 1.42,
                    scoreDelta: +22,
                    bigCarpDelta: +26,
                    radiusDelta: +10,
                    statusTag: '🔥 RẤT HỢP NƯỚC ĐỤC (Hương Liệu Đậm)',
                    feedback: `🌧️ Nước Đục + Hương Liệu Đậm (${totalFlavorDrops} giọt): Xuyên tầng nước đục cực mạnh, thu hút cá nhiều hơn (+42%)!`
                };
            } else if (totalFlavorDrops <= 3) {
                return {
                    multiplier: 0.55,
                    scoreDelta: -24,
                    bigCarpDelta: -18,
                    radiusDelta: -5,
                    statusTag: '⚠️ HƯƠNG LIỆU NHẠT SO VỚI NƯỚC ĐỤC',
                    feedback: `⚠️ Nước Đục + Hương Liệu Nhạt (${totalFlavorDrops} giọt): Mùi bị bùn phù sa lấn át, thu hút cá ít hơn (-45%)! Hãy pha đậm ≥ 6 giọt!`
                };
            } else {
                return {
                    multiplier: 0.95,
                    scoreDelta: +4,
                    bigCarpDelta: +5,
                    radiusDelta: +2,
                    statusTag: '🌧️ TẠM ĐỦ CHO NƯỚC ĐỤC',
                    feedback: `🌧️ Nước Đục + Hương Liệu Vừa (${totalFlavorDrops} giọt): Tạm ổn, nhưng tăng lên ≥ 6 giọt sẽ thu hút cá mạnh hơn nhiều!`
                };
            }
        } else if (weather === 'CLOUDY') {
            // QUY TẮC CÂU ĐÀI KHI TRỜI NHIỀU MÂY MÁT MẺ:
            // Ánh sáng dịu, cá đi ăn đều — hương liệu trung bình (3 - 7 giọt) đạt hiệu quả tối ưu!
            if (totalFlavorDrops >= 3 && totalFlavorDrops <= 7) {
                return {
                    multiplier: 1.24,
                    scoreDelta: +12,
                    bigCarpDelta: +14,
                    radiusDelta: +5,
                    statusTag: '⛅ CHUẨN TRỜI NHIỀU MÂY (Hương Vừa Đủ)',
                    feedback: `⛅ Trời Nhiều Mây + Hương Liệu Vừa (${totalFlavorDrops} giọt): Mùi lan tỏa êm dịu rất hợp cá đi ăn đều (+24%)!`
                };
            } else if (totalFlavorDrops > 8) {
                return {
                    multiplier: 0.72,
                    scoreDelta: -14,
                    bigCarpDelta: -18,
                    radiusDelta: -2,
                    statusTag: '⚠️ HƠI GẮT MÙI TRỜI MÁT',
                    feedback: `⚠️ Trời Nhiều Mây + Hương Liệu Quá Đậm (${totalFlavorDrops} giọt): Cá cũ dễ sặc mùi, nên giảm còn 3–7 giọt!`
                };
            } else {
                return {
                    multiplier: 0.96,
                    scoreDelta: +2,
                    bigCarpDelta: +4,
                    radiusDelta: +1,
                    statusTag: '⛅ MÙI DỊU TỰ NHIÊN',
                    feedback: `⛅ Trời Nhiều Mây + Hương Nhẹ (${totalFlavorDrops} giọt): Cá ăn tự nhiên, thêm 1–2 giọt sẽ nhạy ổ hơn.`
                };
            }
        } else {
            // QUY TẮC CÂU ĐÀI KHI TRỜI NẮNG - NƯỚC TRONG XANH:
            // Nước trong cá tinh khôn -> Hương liệu dịu/vừa phải (2 - 6 giọt) nhạy nhất; quá đậm (>= 10 giọt) dễ làm cá sốc mùi
            if (totalFlavorDrops >= 2 && totalFlavorDrops <= 6) {
                return {
                    multiplier: 1.22,
                    scoreDelta: +12,
                    bigCarpDelta: +10,
                    radiusDelta: +4,
                    statusTag: '☀️ CHUẨN NƯỚC TRONG XANH (Dịu Tự Nhiên)',
                    feedback: `☀️ Nước Trong Xanh + Hương Liệu Vừa Phải (${totalFlavorDrops} giọt): Mùi thơm thanh tự nhiên, cá ăn rất nhạy (+22%)!`
                };
            } else if (totalFlavorDrops <= 1) {
                return {
                    multiplier: 0.78,
                    scoreDelta: -10,
                    bigCarpDelta: -8,
                    radiusDelta: -3,
                    statusTag: '⚠️ HƠI NHẠT HƯƠNG LIỆU',
                    feedback: `☀️ Nước Trong Xanh + Hương Liệu Quá Nhạt (${totalFlavorDrops} giọt): Ít tinh mùi dẫn dụ, thu hút cá chậm hơn.`
                };
            } else if (totalFlavorDrops >= 7) {
                return {
                    multiplier: 0.72,
                    scoreDelta: -16,
                    bigCarpDelta: -12,
                    radiusDelta: +6,
                    statusTag: '⚠️ NẶNG HƯƠNG LIỆU (CÁ CÀY TĂM & ĐÈ PHAO)',
                    feedback: `☀️ Nước Trong + Nặng Hương Liệu (${totalFlavorDrops} giọt): Tinh mùi nồng làm cá sặc mùi tụ lại cày tăm dày đặc quanh ổ, quẹt vây đè phao chìm từ từ rồi nổi lại mà không ăn mồi! Khuyến nghị: dùng 3-5 giọt!`
                };
            } else {
                return {
                    multiplier: 1.05,
                    scoreDelta: +6,
                    bigCarpDelta: +8,
                    radiusDelta: +5,
                    statusTag: '☀️ KHÁ TỐT CHO NƯỚC TRONG',
                    feedback: `☀️ Nước Trong Xanh + Hương Liệu Vừa Đủ (${totalFlavorDrops} giọt): Tỏa mùi tự nhiên, cá hút mồi rất nhạy.`
                };
            }
        }
    }

    // Đánh giá công thức pha mồi
    analyzeRecipe(shopItemsMap, currentWeather = 'SUNNY') {
        const base = this.currentMix.baseBait;
        if (!base) {
            return {
                valid: false,
                message: 'Vui lòng chọn 1 loại Cám Nền (Phú Thành, Cargill...)'
            };
        }

        const flavorList = Object.keys(this.currentMix.flavors).map(id => ({
            item: shopItemsMap[id],
            drops: this.currentMix.flavors[id]
        })).filter(f => f.item);

        const totalFlavorDrops = flavorList.reduce((sum, f) => sum + f.drops, 0);

        let totalScore = base.attraction ? base.attraction.carp : 75;
        let bigCarpScore = base.attraction ? base.attraction.bigCarp : 75;
        let scentRadius = 12;
        let detectedCombos = [];
        let flavorTags = [];

        // Kiểm tra tỉ lệ nước trộn mồi
        let textureStatus = '';
        const wRatio = this.currentMix.waterRatio;
        if (wRatio < 0.6) {
            textureStatus = 'Mồi Rất Khô (Bung xả cực nhanh, thích hợp làm mồi xả đầu hồ)';
            scentRadius += 6;
        } else if (wRatio >= 0.6 && wRatio <= 0.75) {
            textureStatus = 'Mồi Tơi Xốp (Mồi xả tầng đáy chuẩn đài thủ, lưu ổ bền)';
            scentRadius += 10;
        } else if (wRatio > 0.75 && wRatio <= 0.95) {
            textureStatus = 'Mồi Dẻo Bám Lưỡi Chuẩn (Vê tròn 2 lưỡi câu, tan êm dịu 60-90 giây)';
            totalScore += 8;
        } else {
            textureStatus = 'Mồi Khá Ướt / Nhão (Dễ rã khi tiếp nước, cần vê nhẹ tay)';
            totalScore -= 5;
        }

        const flavorIds = Object.keys(this.currentMix.flavors);

        // Phát hiện các Combo đặc biệt
        const hasKLSuaNgo = flavorIds.includes('kl_sua_ngo');
        const hasKLMatKhoai = flavorIds.includes('kl_mat_khoai');
        const hasKLGaoRuou = flavorIds.includes('kl_gao_ruou');
        if (hasKLSuaNgo && (hasKLMatKhoai || hasKLGaoRuou)) {
            detectedCombos.push('🔥 Combo Kim Long: Sữa Ngô + Mật Khoai / Gạo Rượu (Chép Bu Kín Ổ)');
            totalScore += 16;
            bigCarpScore += 20;
            scentRadius += 10;
        }

        const hasSPLucHuong = flavorIds.includes('sp_luc_huong');
        const hasSPKhoai = flavorIds.includes('sp_tinh_khoai_lang');
        const hasSPSuaNon = flavorIds.includes('sp_sua_non');
        const hasSPGaoRuou = flavorIds.includes('sp_gao_ruou');
        if (hasSPLucHuong && (hasSPKhoai || hasSPSuaNon || hasSPGaoRuou)) {
            detectedCombos.push('⭐ Combo Đại Sư Sa Phạm: Lục Hương + Khoai Mật + Sữa Non (Cá Chép Ăn Đậm)');
            totalScore += 18;
            bigCarpScore += 22;
            scentRadius += 12;
        }

        const hasGUFBo3 = flavorIds.includes('guf_bo_ba_san_hang');
        const hasGUFMonster = flavorIds.includes('guf_tinh_mui_chep_cu');
        if (hasGUFBo3 || hasGUFMonster) {
            detectedCombos.push('👑 Combo GUF Săn Hàng Thủy Quái: Chuyên Bắt Chép Củ 8kg - 18kg!');
            totalScore += 14;
            bigCarpScore += 30;
            scentRadius += 15;
        }

        const vcFlavors = flavorIds.filter(id => id.startsWith('vc_'));
        if (vcFlavors.length >= 2) {
            detectedCombos.push(`🎯 Combo Vua Câu Đa Vị (${vcFlavors.length} vị): Kích Thích Cá Lười Ăn`);
            totalScore += 14;
            scentRadius += 9;
        }

        const isPTBase = base.id.startsWith('pt_');
        const hasPTSuaNon = flavorIds.includes('pt_sua_non');
        if (isPTBase && hasPTSuaNon) {
            detectedCombos.push('🌾 Combo Phú Thành: Cám Chép + Sữa Non Phú Thành (Dân Dã Nhạy Bén)');
            totalScore += 12;
            scentRadius += 7;
        }

        // Cộng điểm từng hương liệu
        flavorList.forEach(f => {
            const drops = f.drops;
            if (f.item.attraction) {
                totalScore += (f.item.attraction.carp - 75) * 0.14 * Math.min(drops, 10);
                bigCarpScore += (f.item.attraction.bigCarp - 75) * 0.18 * Math.min(drops, 10);
            }
            if (f.item.diffusion) {
                scentRadius += (f.item.diffusion * 0.04);
            }
            flavorTags.push(`${f.item.name} (${drops} giọt)`);
        });

        // Áp dụng Quy Tắc Tỷ Lệ Hương Liệu theo Màu Nước (Nước Đục vs Nước Trong)
        const waterEffect = BaitMixingSystem.getWaterFlavorEffect(totalFlavorDrops, currentWeather);
        totalScore += waterEffect.scoreDelta;
        bigCarpScore += waterEffect.bigCarpDelta;
        scentRadius += waterEffect.radiusDelta;

        totalScore = Math.max(25, Math.min(100, Math.round(totalScore)));
        bigCarpScore = Math.max(15, Math.min(100, Math.round(bigCarpScore)));
        scentRadius = Math.max(6, Math.round(scentRadius));

        const flavorLevel = totalFlavorDrops >= 7
            ? `NẶNG HƯƠNG LIỆU (${totalFlavorDrops} giọt)`
            : totalFlavorDrops >= 4
                ? `VỪA PHẢI (${totalFlavorDrops} giọt)`
                : `NHẠT (${totalFlavorDrops} giọt)`;

        return {
            valid: true,
            baseName: base.name,
            totalScore,
            bigCarpScore,
            scentRadius,
            totalFlavorDrops,
            flavorLevel,
            isFlavorOverdose: totalFlavorDrops >= (currentWeather === 'SUNNY' ? 7 : 9),
            waterRuleFeedback: waterEffect.feedback,
            waterStatusTag: waterEffect.statusTag,
            textureStatus,
            detectedCombos,
            flavorTags
        };
    }

    // Tiến hành nhào trộn mồi thành phẩm
    mixBait(shopItemsMap, currentWeather = 'SUNNY') {
        const analysis = this.analyzeRecipe(shopItemsMap, currentWeather);
        if (!analysis.valid) return { success: false, message: analysis.message };

        // Phân loại khẩu vị mồi: Cám / Ngô ủ hương liệu / Ốc ngâm hương liệu
        const baitKinds = [];
        const baseFlavorType = this.currentMix.baseBait.flavorType;
        if (baseFlavorType === 'snail_protein') baitKinds.push('SNAIL');
        else if (baseFlavorType === 'fermented_corn') baitKinds.push('CORN');
        else baitKinds.push('CAM');
        Object.keys(this.currentMix.flavors).forEach(id => {
            const it = shopItemsMap[id];
            if (it && it.flavorType === 'sweet_corn' && !baitKinds.includes('CORN')) baitKinds.push('CORN');
        });

        const firmness = this.currentMix.baitFirmness || 'MEDIUM';
        const rigStyle = this.currentMix.rigStyle || 'STANDARD';
        const firmnessMap = {
            SOFT: { label: 'Vê Mềm Bung Sương', dissolveTime: 42 },
            MEDIUM: { label: 'Vê Dẻo Chuẩn Đài', dissolveTime: 72 },
            HARD: { label: 'Vê Cứng Chống Rỉa', dissolveTime: 110 }
        };
        const rigMap = {
            SENSITIVE: 'Cân 7 Câu 2 (Nhạy)',
            STANDARD: 'Cân 5 Câu 3 (Chuẩn Đáy)',
            HEAVY_LEAD: 'Chì Nằm Đáy (Săn Hàng)'
        };
        const fInfo = firmnessMap[firmness] || firmnessMap.MEDIUM;

        this.mixedBaits.hookBait = {
            name: `Mồi Vê ${this.currentMix.baseBait.name} (${analysis.flavorLevel})`,
            baseName: this.currentMix.baseBait.name,
            baitKinds,
            attractionRate: analysis.totalScore,
            bigCarpBonus: analysis.bigCarpScore,
            totalFlavorDrops: analysis.totalFlavorDrops,
            flavorLevel: analysis.flavorLevel,
            isFlavorOverdose: analysis.isFlavorOverdose,
            scentRadius: analysis.scentRadius,
            dissolveTime: fInfo.dissolveTime,
            baitFirmness: firmness,
            firmnessLabel: fInfo.label,
            rigStyle,
            rigStyleLabel: rigMap[rigStyle] || rigMap.STANDARD,
            charges: 10,
            maxCharges: 10,
            combos: analysis.detectedCombos,
            flavorTags: analysis.flavorTags,
            waterRatio: this.currentMix.waterRatio
        };

        this.mixedBaits.groundBait = {
            name: `Mồi Xả ${this.currentMix.baseBait.name} (${analysis.flavorLevel})`,
            baseName: this.currentMix.baseBait.name,
            totalFlavorDrops: analysis.totalFlavorDrops,
            scentRadius: Math.round(analysis.scentRadius * 1.35),
            fishGatherSpeed: 1.0 + (analysis.totalScore / 100),
            bubbleSpurRate: 1.2 + (analysis.bigCarpScore / 80),
            charges: 6,
            maxCharges: 6,
            combos: analysis.detectedCombos
        };

        return {
            success: true,
            analysis,
            hookBait: this.mixedBaits.hookBait,
            groundBait: this.mixedBaits.groundBait
        };
    }
}
