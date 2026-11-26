// Hệ thống Chậu Pha Mồi Câu Đài Thực Tế Việt Nam
// Hỗ trợ 3 Loại Câu (Câu Cám / Câu Ốc / Câu Ngô) • Bỏ đa nguyên liệu vào Chậu • Kiểm tra Tỷ Lệ Vàng & Nặng Mùi Đè Phao

export const FISHING_MODES = {
    CAM: {
        id: 'CAM',
        icon: '🥣',
        label: 'Câu Cám',
        shortTitle: 'Phối Cám Nền + Hương Liệu Cám',
        ruleHint: 'Dùng Cám Nền (Thơm / Tanh / Thơm Tanh) phối Mật Khoai, Tương Sữa Thơm, Lục Hương, Sữa Ngô (4–8 giọt / 1kg cám).'
    },
    SNAIL: {
        id: 'SNAIL',
        icon: '🐚',
        label: 'Câu Ốc',
        shortTitle: 'Ủ Ốc Bươu / Ốc Vặn + Cám + Rượu Thuốc Bắc',
        ruleHint: 'Tỷ lệ hợp lý: 5–10 giọt Rượu Thuốc Bắc / 1kg cám ủ ốc. Pha > 10 giọt/1kg sẽ làm nặng mùi, cá cày nhiều tăm và chỉ đè phao!'
    },
    CORN: {
        id: 'CORN',
        icon: '🌽',
        label: 'Câu Ngô',
        shortTitle: 'Ủ Ngô Ngọt + Nước Xanh chuyên dụng',
        ruleHint: 'Tỷ lệ hợp lý: 10 bắp Ngô Ngọt pha 5ml–10ml Nước Xanh (0.5–1ml/bắp). Pha nhiều hơn sẽ làm nặng mùi, cá cày chỉ đè phao!'
    }
};

export class BaitMixingSystem {
    constructor() {
        this.currentMix = {
            fishingMode: 'CAM', // 'CAM' | 'SNAIL' | 'CORN'
            basinItems: {       // Nguyên liệu đã đổ vào chậu: { [itemId]: số kg hoặc số bắp }
                cam_nen_thom_tanh: 1.0
            },
            flavors: {},        // Hương liệu đã nhỏ vào chậu: { [flavorId]: số giọt hoặc số ml }
            waterRatio: 0.8,    // Tỉ lệ nước trộn mồi
            baitFirmness: 'MEDIUM', // 'SOFT' | 'MEDIUM' | 'HARD'
            rigStyle: 'STANDARD',
            baseBait: null      // Tương thích ngược
        };

        // Khởi đầu KHAY MỒI TRỐNG: Bắt buộc người chơi chọn loại câu, bỏ đồ vào chậu & pha chế trước khi ra cần
        this.mixedBaits = {
            hookBait: null,
            groundBait: null
        };

        this.savedRecipes = [];
    }

    resetTray() {
        this.mixedBaits.hookBait = null;
        this.mixedBaits.groundBait = null;
    }

    setFishingMode(mode, autoSeedIfInvalid = true) {
        if (!FISHING_MODES[mode]) return;
        this.currentMix.fishingMode = mode;

        if (autoSeedIfInvalid) {
            const b = this.currentMix.basinItems || {};
            const camKg = (b.cam_nen_thom || 0) + (b.cam_nen_tanh || 0) + (b.cam_nen_thom_tanh || 0);
            const snailKg = (b.oc_van || 0) + (b.oc_buou || 0);
            const cornCobs = b.ngo_ngot || 0;

            if (mode === 'CAM' && camKg <= 0) {
                this.currentMix.basinItems = { cam_nen_thom_tanh: 1.0 };
                this.currentMix.flavors = {};
                this.currentMix.waterRatio = 0.8;
            } else if (mode === 'SNAIL' && snailKg <= 0) {
                this.currentMix.basinItems = { cam_nen_thom_tanh: 1.0, oc_buou: 1.0 };
                this.currentMix.flavors = { hl_ruou_thuoc_bac: 7 };
                this.currentMix.waterRatio = 0.7;
            } else if (mode === 'CORN' && cornCobs <= 0) {
                this.currentMix.basinItems = { ngo_ngot: 10 };
                this.currentMix.flavors = { hl_nuoc_xanh: 7 };
                this.currentMix.waterRatio = 0.65;
            }
        }
    }

    clearBasin() {
        this.currentMix.basinItems = {};
        this.currentMix.flavors = {};
    }

    setBasinItemAmount(itemId, amount, step = 0.5) {
        if (!this.currentMix.basinItems) this.currentMix.basinItems = {};
        const rounded = step >= 1 ? Math.round(amount) : Math.round(amount * 2) / 2;
        if (rounded <= 0) {
            delete this.currentMix.basinItems[itemId];
        } else {
            this.currentMix.basinItems[itemId] = Number(rounded.toFixed(2));
        }
    }

    getBasinItemAmount(itemId) {
        return (this.currentMix.basinItems && this.currentMix.basinItems[itemId]) || 0;
    }

    setBaitFirmness(firmness) {
        this.currentMix.baitFirmness = firmness;
    }

    setRigStyle(style) {
        this.currentMix.rigStyle = style;
    }

    setBaseBait(item) {
        this.currentMix.baseBait = item;
        if (item && item.id) {
            const step = item.unitStep || 1;
            if (!this.currentMix.basinItems || Object.keys(this.currentMix.basinItems).length === 0) {
                this.currentMix.basinItems = { [item.id]: step >= 1 ? 5 : 1.0 };
            }
        }
    }

    setFlavorDrops(flavorId, amount) {
        const clean = Math.round(amount * 10) / 10;
        if (clean <= 0) {
            delete this.currentMix.flavors[flavorId];
        } else {
            this.currentMix.flavors[flavorId] = clean;
        }
    }

    setWaterRatio(ratio) {
        this.currentMix.waterRatio = Math.round(ratio * 100) / 100;
    }

    // Hệ số thu hút thực tế theo Độ Đục Nước & Cờ Quá Liều Nặng Mùi
    static getWaterFlavorEffect(effectiveDose = 5, weather = 'SUNNY', forceOverdose = null) {
        const isOver = typeof forceOverdose === 'boolean'
            ? forceOverdose
            : (effectiveDose > (weather === 'RAINY' ? 10.5 : (weather === 'CLOUDY' ? 10 : 9.5)));

        if (isOver) {
            return {
                multiplier: 0.68,
                scoreDelta: -20,
                bigCarpDelta: -18,
                radiusDelta: +7,
                statusTag: '🚨 NẶNG MÙI QUÁ LIỀU (CÁ CÀY TĂM & CHỈ ĐÈ PHAO)',
                feedback: '⚠️ Pha quá liều hương liệu! Mùi hăng nồng khiến đàn cá sặc mùi tụ lại cày nhiều tăm quanh ổ, quẹt vây đè phao chìm từ từ rồi nổi lên mà không chịu nuốt mồi!'
            };
        }

        if (weather === 'RAINY') {
            if (effectiveDose >= 6) {
                return {
                    multiplier: 1.40,
                    scoreDelta: +18,
                    bigCarpDelta: +22,
                    radiusDelta: +9,
                    statusTag: '🌧️ RẤT HỢP NƯỚC ĐỤC (Hương Đậm Xuyên Bùn)',
                    feedback: '🌧️ Trời Mưa Nước Đục + Tỷ lệ hương đậm chuẩn bài: Mùi xuyên tầng phù sa cực mạnh (+40% tốc độ cuốn ổ)!'
                };
            } else if (effectiveDose <= 3) {
                return {
                    multiplier: 0.62,
                    scoreDelta: -16,
                    bigCarpDelta: -14,
                    radiusDelta: -4,
                    statusTag: '⚠️ HƯƠNG HƠI NHẠT SO VỚI NƯỚC ĐỤC',
                    feedback: '🌧️ Trời mưa nước đục cản mùi: Đang pha hơi nhạt nên cá chậm đánh hơi vào ổ hơn.'
                };
            }
            return {
                multiplier: 1.06,
                scoreDelta: +6,
                bigCarpDelta: +8,
                radiusDelta: +3,
                statusTag: '🌧️ HỢP NƯỚC ĐỤC TRỜI MƯA',
                feedback: '🌧️ Nước đục phù sa: Nồng độ mồi hiện tại dẫn dụ đàn cá vào ổ ổn định.'
            };
        }

        if (weather === 'CLOUDY') {
            if (effectiveDose >= 4 && effectiveDose <= 10) {
                return {
                    multiplier: 1.25,
                    scoreDelta: +12,
                    bigCarpDelta: +15,
                    radiusDelta: +5,
                    statusTag: '⛅ CHUẨN TRỜI MÁT NHIỀU MÂY',
                    feedback: '⛅ Trời dịu mát + Tỷ lệ hương liệu hợp lý: Mùi lan tỏa êm, cá đi ăn đều (+25%)!'
                };
            }
            return {
                multiplier: 0.96,
                scoreDelta: +2,
                bigCarpDelta: +4,
                radiusDelta: +1,
                statusTag: '⛅ MÙI TỰ NHIÊN DỊU NHẸ',
                feedback: '⛅ Trời mát: Mồi thơm mộc tự nhiên, thêm chút tinh mùi đúng bài sẽ gom ổ nhanh hơn.'
            };
        }

        // SUNNY (Nước trong xanh)
        if (effectiveDose >= 4 && effectiveDose <= 10) {
            return {
                multiplier: 1.24,
                scoreDelta: +12,
                bigCarpDelta: +12,
                radiusDelta: +4,
                statusTag: '☀️ CHUẨN NƯỚC TRONG XANH (Đúng Tỷ Lệ Vàng)',
                feedback: '☀️ Trời nắng nước trong + Pha đúng tỷ lệ hợp lý: Mùi thơm thanh tự nhiên, cá hút mồi cực nhạy (+24%)!'
            };
        }
        return {
            multiplier: 0.86,
            scoreDelta: -6,
            bigCarpDelta: -4,
            radiusDelta: -2,
            statusTag: '☀️ MỒI NHẠT TỰ NHIÊN',
            feedback: '☀️ Nước trong xanh: Mồi hiện khá mộc, pha thêm hương liệu đúng tỷ lệ sẽ tăng mạnh tốc độ cuốn cá.'
        };
    }

    // Ước tính sát thực tế số lượng viên mồi câu / con ốc móc / lượt ngô móc & nắm xả được vê ra từ chậu mồi
    static estimateYield(mode, camKg, snailKg, cornCobs, waterRatio = 0.8, firmness = 'MEDIUM') {
        const firmMul = firmness === 'SOFT' ? 0.88 : (firmness === 'HARD' ? 1.14 : 1.0);
        const waterExpand = 0.92 + Math.min(0.26, Math.max(0, (waterRatio - 0.5) * 0.36));

        let hookCharges = 24;
        let groundCharges = 10;
        let unitHookLabel = 'viên mồi';
        let unitGroundLabel = 'nắm xả';

        if (mode === 'SNAIL') {
            // 1kg ốc (~140-180 con) lọc con đẹp móc lưỡi được ~52 lượt + ốc đập trộn cám ủ xả ổ ~16 muôi/kg
            const rawHook = snailKg * 52 + camKg * 14;
            const rawGround = snailKg * 12 + camKg * 14 + cornCobs * 1.2;
            hookCharges = Math.max(18, Math.min(180, Math.round(rawHook * firmMul)));
            groundCharges = Math.max(8, Math.min(80, Math.round(rawGround)));
            unitHookLabel = 'con ốc móc';
            unitGroundLabel = 'muôi xả';
        } else if (mode === 'CORN') {
            // 1 bắp ngô (~280 hạt): 10 bắp ngô tách hạt cho ~70 lượt móc đôi (2-3 hạt/lưỡi) + ~25 nắm xả hạt ngô
            const rawHook = cornCobs * 7.0 + camKg * 16;
            const rawGround = cornCobs * 2.5 + camKg * 12 + snailKg * 6;
            hookCharges = Math.max(16, Math.min(200, Math.round(rawHook * firmMul)));
            groundCharges = Math.max(8, Math.min(85, Math.round(rawGround)));
            unitHookLabel = 'lượt ngô móc';
            unitGroundLabel = 'nắm xả ngô';
        } else {
            // Câu Cám: 1kg cám nền nở với nước vê được ~44 đôi mồi câu chuẩn đài + ~14 nắm xả ổ
            const rawHook = camKg * 44 * waterExpand + cornCobs * 2.5 + snailKg * 10;
            const rawGround = camKg * 14 * waterExpand + snailKg * 8 + cornCobs * 1.5;
            hookCharges = Math.max(16, Math.min(180, Math.round(rawHook * firmMul)));
            groundCharges = Math.max(6, Math.min(75, Math.round(rawGround)));
            unitHookLabel = 'viên mồi';
            unitGroundLabel = 'nắm xả';
        }

        return {
            hookCharges,
            groundCharges,
            unitHookLabel,
            unitGroundLabel,
            yieldSummary: `${hookCharges} ${unitHookLabel} • ${groundCharges} ${unitGroundLabel}`
        };
    }

    // Phân tích toàn diện Chậu Pha Mồi hiện tại
    analyzeRecipe(shopItemsMap, currentWeather = 'SUNNY') {
        const mode = this.currentMix.fishingMode || 'CAM';
        const basin = this.currentMix.basinItems || {};
        const flavors = this.currentMix.flavors || {};

        const camIds = ['cam_nen_thom', 'cam_nen_tanh', 'cam_nen_thom_tanh'];
        const snailIds = ['oc_van', 'oc_buou'];
        const camFlavorIds = ['hl_mat_khoai', 'hl_tuong_sua_thom', 'hl_luc_huong', 'hl_sua_ngo'];

        const camKg = Number(camIds.reduce((s, id) => s + (basin[id] || 0), 0).toFixed(2));
        const snailKg = Number(snailIds.reduce((s, id) => s + (basin[id] || 0), 0).toFixed(2));
        const cornCobs = Math.round(basin.ngo_ngot || 0);

        const camFlavorDrops = camFlavorIds.reduce((s, id) => s + (flavors[id] || 0), 0);
        const ruouDrops = flavors.hl_ruou_thuoc_bac || 0;
        const nuocXanhMl = flavors.hl_nuoc_xanh || 0;
        const totalFlavorRaw = Number((camFlavorDrops + ruouDrops + nuocXanhMl).toFixed(1));

        const basinEntries = Object.entries(basin)
            .filter(([, qty]) => qty > 0)
            .map(([id, qty]) => ({ item: shopItemsMap[id], id, qty }))
            .filter(x => x.item);

        const flavorEntries = Object.entries(flavors)
            .filter(([, amt]) => amt > 0)
            .map(([id, amt]) => ({ item: shopItemsMap[id], id, amt }))
            .filter(x => x.item);

        // Kiểm tra điều kiện tối thiểu trong chậu theo Loại Câu
        if (basinEntries.length === 0) {
            return {
                valid: false,
                fishingMode: mode,
                camKg, snailKg, cornCobs,
                basinEntries: [],
                flavorEntries,
                message: 'Chậu trộn mồi đang trống! Hãy bỏ nguyên liệu vào chậu trước khi pha chế.'
            };
        }
        if (mode === 'CAM' && camKg <= 0) {
            return {
                valid: false,
                fishingMode: mode,
                camKg, snailKg, cornCobs,
                basinEntries,
                flavorEntries,
                message: 'Bạn đang chọn [🥣 Câu Cám]: Hãy bỏ ít nhất 0.5kg Cám Nền (Thơm / Tanh / Thơm Tanh) vào chậu!'
            };
        }
        if (mode === 'SNAIL' && snailKg <= 0) {
            return {
                valid: false,
                fishingMode: mode,
                camKg, snailKg, cornCobs,
                basinEntries,
                flavorEntries,
                message: 'Bạn đang chọn [🐚 Câu Ốc]: Hãy bỏ Ốc Bươu hoặc Ốc Vặn (kèm Cám Nền để ủ) vào chậu!'
            };
        }
        if (mode === 'CORN' && cornCobs <= 0) {
            return {
                valid: false,
                fishingMode: mode,
                camKg, snailKg, cornCobs,
                basinEntries,
                flavorEntries,
                message: 'Bạn đang chọn [🌽 Câu Ngô]: Hãy bỏ ít nhất 1 bắp Ngô Ngọt vào chậu!'
            };
        }

        // Tính điểm nền bình quân gia quyền theo nguyên liệu trong chậu
        let weightSum = 0;
        let baseCarp = 0;
        let baseBig = 0;
        basinEntries.forEach(({ item, qty }) => {
            const w = item.subType === 'CORN' ? qty * 0.15 : qty;
            weightSum += w;
            baseCarp += (item.attraction ? item.attraction.carp : 82) * w;
            baseBig += (item.attraction ? item.attraction.bigCarp : 82) * w;
        });
        let totalScore = weightSum > 0 ? baseCarp / weightSum : 82;
        let bigCarpScore = weightSum > 0 ? baseBig / weightSum : 82;
        let scentRadius = 12 + Math.min(8, weightSum * 2.2);

        const detectedCombos = [];
        const flavorTags = flavorEntries.map(({ item, amt }) => `${item.name} (${amt}${item.doseUnit === 'ml' ? 'ml' : ' giọt'})`);
        const ingredientSummary = basinEntries.map(({ item, qty }) => `${qty}${item.unitLabel || 'kg'} ${item.name}`).join(' + ');

        // Đánh giá TỶ LỆ VÀNG & QUÁ LIỀU NẶNG MÙI riêng cho từng chế độ câu
        let isFlavorOverdose = false;
        let normalizedFlavorDose = 5;
        let ratioVerdict = 'NORMAL';
        let ratioBadge = '';
        let ratioExplain = '';
        let flavorSummary = 'Mộc tự nhiên';

        if (mode === 'SNAIL') {
            // QUY TẮC Ủ ỐC: Rượu Thuốc Bắc 5–10 giọt / 1kg cám hợp lý; > 10 giọt / 1kg -> nặng mùi cá cày chỉ đè phao!
            const refKg = camKg > 0 ? camKg : snailKg;
            const ruouPerKg = ruouDrops / Math.max(0.25, refKg);
            const extraPerKg = (camFlavorDrops + nuocXanhMl * 1.5) / Math.max(0.25, refKg);
            const totalPerKg = ruouPerKg + extraPerKg;
            normalizedFlavorDose = Number(totalPerKg.toFixed(1));
            flavorSummary = ruouDrops > 0
                ? `${ruouDrops} giọt Rượu Thuốc Bắc / ${refKg}kg ${camKg > 0 ? 'cám' : 'ốc'} (${ruouPerKg.toFixed(1)} giọt/kg)`
                : (totalFlavorRaw > 0 ? `${totalFlavorRaw} giọt tinh mùi phụ` : 'Ốc mộc chưa ủ');

            if (camKg > 0 && snailKg > 0) {
                detectedCombos.push(`🐚 Nền Ủ Ốc Chuẩn Đài: ${snailKg}kg Ốc tươi + ${camKg}kg Cám Nền giữ ổ bền bỉ`);
                totalScore += 6;
                bigCarpScore += 10;
            }
            if (basin.oc_buou > 0 && basin.oc_van > 0) {
                detectedCombos.push('🐌🐚 Song Ốc Phối Hợp (Ốc Bươu + Ốc Vặn): Vừa xả dụ ổ vừa móc lưỡi săn Trắm Đen');
                bigCarpScore += 7;
            }

            if (ruouPerKg > 10 || totalPerKg > 10.5) {
                isFlavorOverdose = true;
                ratioVerdict = 'OVERDOSE';
                ratioBadge = `🚨 QUÁ LIỀU (${ruouPerKg.toFixed(1)} giọt/1kg > 10 giọt/1kg) ➔ NẶNG MÙI ĐÈ PHAO!`;
                ratioExplain = `⚠️ Bạn đang pha ${ruouDrops} giọt Rượu Thuốc Bắc cho ${refKg}kg ${camKg > 0 ? 'cám' : 'ốc'} (${ruouPerKg.toFixed(1)} giọt/1kg — vượt mức 5–10 giọt/1kg)! Mùi thuốc bắc quá nồng làm cá chỉ cày nhiều tăm và đè phao chứ không ăn!`;
            } else if (ruouPerKg >= 5 && ruouPerKg <= 10) {
                isFlavorOverdose = false;
                ratioVerdict = 'OPTIMAL';
                const recLabel = Number.isInteger(ruouPerKg) ? ruouPerKg : ruouPerKg.toFixed(1);
                ratioBadge = `✅ TỶ LỆ VÀNG Ủ ỐC (${recLabel} giọt Rượu Thuốc Bắc / 1kg ${camKg > 0 ? 'cám' : 'ốc'})`;
                ratioExplain = camKg > 0
                    ? `🔥 Đạt chuẩn 5–10 giọt Rượu Thuốc Bắc / 1kg cám! Ốc dậy hương thảo mộc đầm sâu, Trắm Đen & Chép Cụ vào ổ hút phao lút hình!`
                    : `👍 Đúng tỷ lệ 5–10 giọt/kg! Mẹo: Bỏ thêm 1kg Cám Nền vào chậu trộn cùng ốc sẽ thành bài Cám Ủ Ốc đỉnh cao!`;
                detectedCombos.push('🍶🔥 Bí Kíp Ốc Ủ Rượu Thuốc Bắc (5–10 giọt/1kg): Sát Thủ Trắm Đen & Chép Cụ!');
                totalScore += 16;
                bigCarpScore += 24;
                scentRadius += 8;
            } else if (ruouDrops > 0 && ruouPerKg < 5) {
                isFlavorOverdose = false;
                ratioVerdict = 'LIGHT';
                const minD = Math.ceil(5 * refKg);
                const maxD = Math.floor(10 * refKg);
                ratioBadge = `💡 HƠI NHẠT RƯỢU THUỐC BẮC (${ruouPerKg.toFixed(1)} giọt / 1kg)`;
                ratioExplain = `Với ${refKg}kg ${camKg > 0 ? 'cám' : 'ốc'} trong chậu, nên nhỏ từ ${minD}–${maxD} giọt Rượu Thuốc Bắc (tỷ lệ 5–10 giọt/1kg cám) để đạt độ bén tối đa.`;
                totalScore += 4;
                bigCarpScore += 6;
            } else {
                isFlavorOverdose = false;
                ratioVerdict = 'PLAIN';
                const minD = Math.ceil(5 * refKg);
                const maxD = Math.floor(10 * refKg);
                ratioBadge = '🐚 ỐC TƯƠI MỘC (Chưa có Rượu Thuốc Bắc)';
                ratioExplain = `Gợi ý: Nhỏ thêm ${minD}–${maxD} giọt Rượu Thuốc Bắc (chuẩn 5–10 giọt / 1kg cám) để kích thích cá lớn mở miệng nhanh hơn!`;
            }
        } else if (mode === 'CORN') {
            // QUY TẮC Ủ NGÔ: 10 bắp Ngô Ngọt pha 5ml–10ml Nước Xanh hợp lý; > 10ml/10 bắp -> nặng mùi cá cày chỉ đè phao!
            const mlPer10Cobs = (nuocXanhMl / Math.max(1, cornCobs)) * 10;
            const extraPer10 = ((camFlavorDrops + ruouDrops) / Math.max(1, cornCobs)) * 10;
            const totalPer10 = mlPer10Cobs + extraPer10;
            normalizedFlavorDose = Number(totalPer10.toFixed(1));
            const minMl = Number((cornCobs * 0.5).toFixed(1));
            const maxMl = Number((cornCobs * 1.0).toFixed(1));
            flavorSummary = nuocXanhMl > 0
                ? `${nuocXanhMl}ml Nước Xanh / ${cornCobs} bắp (${mlPer10Cobs.toFixed(1)}ml/10 bắp)`
                : (totalFlavorRaw > 0 ? `${totalFlavorRaw} giọt tinh mùi phụ` : 'Ngô ngọt mộc');

            if (mlPer10Cobs > 10 || totalPer10 > 10.5) {
                isFlavorOverdose = true;
                ratioVerdict = 'OVERDOSE';
                ratioBadge = `🚨 QUÁ LIỀU NƯỚC XANH (${mlPer10Cobs.toFixed(1)}ml / 10 bắp) ➔ NẶNG MÙI ĐÈ PHAO!`;
                ratioExplain = `⚠️ Đang pha ${nuocXanhMl}ml Nước Xanh cho ${cornCobs} bắp ngô (tương đương ${mlPer10Cobs.toFixed(1)}ml/10 bắp — vượt ngưỡng 5–10ml/10 bắp)! Mùi nồng gắt khiến cá cày tăm mù mịt và chỉ đè phao không ăn!`;
            } else if (mlPer10Cobs >= 5 && mlPer10Cobs <= 10) {
                isFlavorOverdose = false;
                ratioVerdict = 'OPTIMAL';
                const cleanRate = Number.isInteger(mlPer10Cobs) ? mlPer10Cobs : mlPer10Cobs.toFixed(1);
                ratioBadge = `✅ TỶ LỆ VÀNG Ủ NGÔ (${cleanRate}ml Nước Xanh / 10 bắp)`;
                ratioExplain = `🔥 Chuẩn tỷ lệ 10 bắp Ngô Ngọt : 5ml–10ml Nước Xanh! Hạt ngô ngấm vị xanh ngọt thanh, Chép Củ & Trắm Cỏ cực mê!`;
                detectedCombos.push('🌽🧪 Tuyệt Chiêu Ngô Ngọt Ủ Nước Xanh (5–10ml/10 bắp): Chuyên Chép Củ & Trắm Cỏ!');
                totalScore += 15;
                bigCarpScore += 22;
                scentRadius += 8;
            } else if (nuocXanhMl > 0 && mlPer10Cobs < 5) {
                isFlavorOverdose = false;
                ratioVerdict = 'LIGHT';
                ratioBadge = `💡 HƠI ÍT NƯỚC XANH (${mlPer10Cobs.toFixed(1)}ml / 10 bắp)`;
                ratioExplain = `Với ${cornCobs} bắp Ngô Ngọt hiện tại, đong từ ${minMl}ml – ${maxMl}ml Nước Xanh (chuẩn 5–10ml / 10 bắp) sẽ đạt đỉnh hiệu quả!`;
                totalScore += 4;
                bigCarpScore += 5;
            } else {
                isFlavorOverdose = false;
                ratioVerdict = 'PLAIN';
                ratioBadge = '🌽 NGÔ NGỌT TƯƠI (Chưa pha Nước Xanh)';
                ratioExplain = `Gợi ý: Đong ${minMl}ml – ${maxMl}ml Nước Xanh cho ${cornCobs} bắp ngô trong chậu (tỷ lệ vàng 5–10ml / 10 bắp)!`;
            }
        } else {
            // QUY TẮC CÂU CÁM: Dùng Mật Khoai, Tương Sữa Thơm, Lục Hương, Sữa Ngô (4–9 giọt / 1kg cám)
            const camDropsPerKg = camFlavorDrops / Math.max(0.25, camKg);
            const offModePerKg = (ruouDrops * 1.25 + nuocXanhMl * 1.35) / Math.max(0.25, camKg);
            const totalPerKg = camDropsPerKg + offModePerKg;
            normalizedFlavorDose = Number(totalPerKg.toFixed(1));
            const safeMax = currentWeather === 'RAINY' ? 10 : 9;
            flavorSummary = totalFlavorRaw > 0
                ? `${camFlavorDrops} giọt hương cám / ${camKg}kg cám (${totalPerKg.toFixed(1)} giọt/kg)`
                : 'Cám nền mộc';

            // Phát hiện combo phối hương cám thực tế
            const activeCamFlavors = camFlavorIds.filter(id => (flavors[id] || 0) > 0);
            if ((flavors.hl_mat_khoai || 0) > 0 && (flavors.hl_sua_ngo || 0) > 0) {
                detectedCombos.push('🍠🌽 Combo Quốc Dân: Mật Khoai + Sữa Ngô (Chép Mới & Chép Cũ Đều Mê)');
                totalScore += 10;
                bigCarpScore += 12;
                scentRadius += 5;
            }
            if ((flavors.hl_luc_huong || 0) > 0 && (flavors.hl_tuong_sua_thom || 0) > 0) {
                detectedCombos.push('🌿🥛 Combo Đấu Giải: Lục Hương + Tương Sữa Thơm (Tỏa Mây Sữa Xuyên Tầng Nước)');
                totalScore += 12;
                bigCarpScore += 10;
                scentRadius += 7;
            }
            if ((basin.cam_nen_thom || 0) > 0 && (basin.cam_nen_tanh || 0) > 0) {
                detectedCombos.push('🌾🦐 Phối Cám Thủ Công: Cám Nền Thơm + Cám Nền Tanh đa tầng vị');
                totalScore += 5;
            }

            if (totalPerKg > safeMax) {
                isFlavorOverdose = true;
                ratioVerdict = 'OVERDOSE';
                ratioBadge = `🚨 NẶNG HƯƠNG LIỆU CÁM (${totalPerKg.toFixed(1)} giọt/1kg) ➔ CÁ CÀY ĐÈ PHAO!`;
                ratioExplain = `⚠️ Đang pha vượt ngưỡng ${safeMax} giọt / 1kg cám! Tinh mùi quá gắt làm cá sặc mùi cày nhiều tăm quanh phao và chỉ quẹt dây đè phao chìm dần rồi nổi lên!`;
            } else if (camDropsPerKg >= 4 && camDropsPerKg <= safeMax && offModePerKg <= 2) {
                isFlavorOverdose = false;
                ratioVerdict = 'OPTIMAL';
                ratioBadge = `✅ TỶ LỆ CÁM HỢP LÝ (${camDropsPerKg.toFixed(1).replace('.0', '')} giọt / 1kg cám • ${activeCamFlavors.length} vị)`;
                ratioExplain = `🔥 Hương liệu chuyên Cám hòa quyện vừa vặn với ${camKg}kg cám nền, mồi bung tơi dẫn dụ cá ăn dứt khoát!`;
                totalScore += 10;
                bigCarpScore += 8;
            } else if (offModePerKg > 2) {
                isFlavorOverdose = false;
                ratioVerdict = 'LIGHT';
                ratioBadge = '⚠️ LỆCH VỊ HƯƠNG LIỆU CHO CÁM';
                ratioExplain = 'Rượu Thuốc Bắc hợp ủ Ốc, Nước Xanh hợp pha Ngô. Với Câu Cám hãy ưu tiên Mật Khoai, Tương Sữa Thơm, Lục Hương, Sữa Ngô!';
                totalScore -= 6;
            } else {
                isFlavorOverdose = false;
                ratioVerdict = 'LIGHT';
                const minD = Math.ceil(4 * camKg);
                const maxD = Math.floor(8 * camKg);
                ratioBadge = camFlavorDrops === 0 ? '🥣 CÁM NỀN MỘC CHƯA PHA HƯƠNG LIỆU' : `💡 HƯƠNG DỊU NHẸ (${camDropsPerKg.toFixed(1)} giọt / 1kg cám)`;
                ratioExplain = `Gợi ý: Với ${camKg}kg Cám Nền trong chậu, nhỏ tổng cộng ${minD}–${maxD} giọt (Mật Khoai / Tương Sữa Thơm / Lục Hương / Sữa Ngô) là hợp lý nhất!`;
            }
        }

        // Kiểm tra tỉ lệ nước trộn mồi
        let textureStatus = '';
        const wRatio = this.currentMix.waterRatio;
        if (wRatio < 0.6) {
            textureStatus = 'Mồi Rất Khô / Hạt Rời (Bung xả nhanh tầng đáy, hợp xả ổ)';
            scentRadius += 5;
        } else if (wRatio >= 0.6 && wRatio <= 0.75) {
            textureStatus = 'Mồi Tơi Xốp Chuẩn Ủ (Giữ hạt ốc/ngô và cám tơi đều dưới đáy)';
            scentRadius += 8;
        } else if (wRatio > 0.75 && wRatio <= 0.95) {
            textureStatus = 'Mồi Dẻo Bám Lưỡi Chuẩn (Vê 2 lưỡi êm, tan sương 60–90 giây)';
            totalScore += 6;
        } else {
            textureStatus = 'Mồi Mềm Cháo (Vuốt tơ đánh cá nhát mồi, rã nhanh)';
        }

        const waterEffect = BaitMixingSystem.getWaterFlavorEffect(normalizedFlavorDose, currentWeather, isFlavorOverdose);
        totalScore += waterEffect.scoreDelta;
        bigCarpScore += waterEffect.bigCarpDelta;
        scentRadius += waterEffect.radiusDelta;

        totalScore = Math.max(20, Math.min(100, Math.round(totalScore)));
        bigCarpScore = Math.max(15, Math.min(100, Math.round(bigCarpScore)));
        scentRadius = Math.max(6, Math.round(scentRadius));

        const primaryBaseName = mode === 'SNAIL'
            ? `Chậu Ốc Ủ (${ingredientSummary})`
            : (mode === 'CORN'
                ? `Chậu Ngô Ủ (${ingredientSummary})`
                : `Chậu Cám Đài (${ingredientSummary})`);

        const yieldInfo = BaitMixingSystem.estimateYield(
            mode,
            camKg,
            snailKg,
            cornCobs,
            wRatio,
            this.currentMix.baitFirmness || 'MEDIUM'
        );

        return {
            valid: true,
            fishingMode: mode,
            baseName: primaryBaseName,
            ingredientSummary,
            basinEntries,
            flavorEntries,
            camKg,
            snailKg,
            cornCobs,
            ruouDrops,
            nuocXanhMl,
            camFlavorDrops,
            totalScore,
            bigCarpScore,
            scentRadius,
            totalFlavorDrops: totalFlavorRaw,
            normalizedFlavorDose,
            flavorLevel: flavorSummary,
            flavorSummary,
            isFlavorOverdose,
            ratioVerdict,
            ratioBadge,
            ratioExplain,
            waterMultiplier: waterEffect.multiplier,
            waterRuleFeedback: `${ratioExplain}`,
            waterStatusTag: ratioBadge || waterEffect.statusTag,
            textureStatus,
            detectedCombos,
            flavorTags,
            estimatedHookCharges: yieldInfo.hookCharges,
            estimatedGroundCharges: yieldInfo.groundCharges,
            unitHookLabel: yieldInfo.unitHookLabel,
            unitGroundLabel: yieldInfo.unitGroundLabel,
            yieldSummary: yieldInfo.yieldSummary
        };
    }

    // Nhào trộn toàn bộ nguyên liệu + hương liệu trong chậu thành Mồi Câu & Mồi Xả
    mixBait(shopItemsMap, currentWeather = 'SUNNY', playerInventory = null, trayCapacityBonus = 1.0) {
        const analysis = this.analyzeRecipe(shopItemsMap, currentWeather);
        if (!analysis.valid) {
            return { success: false, message: analysis.message };
        }

        // Kiểm tra tồn kho người chơi trước khi trừ nguyên liệu trong chậu
        if (playerInventory) {
            for (const { item, id, qty } of analysis.basinEntries) {
                const have = Number((playerInventory[id] || 0).toFixed(2));
                if (have + 1e-6 < qty) {
                    return {
                        success: false,
                        missingItem: item,
                        neededQty: qty,
                        haveQty: have,
                        message: `Kho chưa đủ [${item.name}]! Trong chậu cần ${qty} ${item.unitLabel || 'kg'} nhưng kho chỉ có ${have} ${item.unitLabel || 'kg'}. Hãy mua thêm ngay trên kệ!`
                    };
                }
            }
            for (const { item, id, amt } of analysis.flavorEntries) {
                if (amt > 0 && (playerInventory[id] || 0) <= 0) {
                    return {
                        success: false,
                        missingItem: item,
                        neededQty: 1,
                        haveQty: 0,
                        message: `Bạn chưa sở hữu chai [${item.name}] trong kho! Hãy bấm Mua 1 chai để pha chế.`
                    };
                }
            }

            // Trừ lượng nguyên liệu nền đã bỏ vào chậu (giữ chai hương liệu dùng lâu dài nhiều ca)
            for (const { id, qty } of analysis.basinEntries) {
                const left = Math.max(0, Number(((playerInventory[id] || 0) - qty).toFixed(2)));
                playerInventory[id] = left;
            }
        }

        // Xác định chuẩn khẩu vị mồi cho hệ thống AI FishProfiles ('CAM' | 'SNAIL' | 'CORN')
        const baitKinds = [];
        if (analysis.fishingMode === 'SNAIL' || analysis.snailKg > 0) baitKinds.push('SNAIL');
        if (analysis.fishingMode === 'CORN' || analysis.cornCobs > 0) baitKinds.push('CORN');
        if (analysis.fishingMode === 'CAM' || (analysis.camKg > 0 && baitKinds.length === 0)) {
            if (!baitKinds.includes('CAM')) baitKinds.push('CAM');
        }
        if ((this.currentMix.flavors.hl_sua_ngo || 0) > 0 && !baitKinds.includes('CORN') && analysis.fishingMode === 'CORN') {
            baitKinds.push('CORN');
        }

        const firmness = this.currentMix.baitFirmness || 'MEDIUM';
        const rigStyle = this.currentMix.rigStyle || 'STANDARD';
        const firmnessMap = {
            SOFT: { label: 'Vê Mềm Bung Sương', dissolveTime: 44 },
            MEDIUM: { label: 'Vê Dẻo Chuẩn Đài', dissolveTime: 76 },
            HARD: { label: 'Móc Chắc / Vê Chặt', dissolveTime: 115 }
        };
        const rigMap = {
            SENSITIVE: 'Cân Nhạy',
            STANDARD: 'Cân Chuẩn Đáy',
            HEAVY_LEAD: 'Cân Tì Đáy Săn Hàng'
        };
        const fInfo = firmnessMap[firmness] || firmnessMap.MEDIUM;

        // Số lượng mồi được vê ra sát thực tế câu đài + cộng hưởng khay mồi giữ ẩm chống hao hụt
        const padMul = Math.max(1.0, Number(trayCapacityBonus) || 1.0);
        const hookCharges = Math.round((analysis.estimatedHookCharges || 40) * padMul);
        const groundCharges = Math.round((analysis.estimatedGroundCharges || 14) * padMul);
        const unitHookLabel = analysis.unitHookLabel || 'viên mồi';
        const unitGroundLabel = analysis.unitGroundLabel || 'nắm xả';

        const modeMeta = FISHING_MODES[analysis.fishingMode] || FISHING_MODES.CAM;

        this.mixedBaits.hookBait = {
            name: `${modeMeta.icon} ${analysis.baseName}`,
            baseName: analysis.baseName,
            fishingMode: analysis.fishingMode,
            ingredientSummary: analysis.ingredientSummary,
            baitKinds,
            attractionRate: analysis.totalScore,
            bigCarpBonus: analysis.bigCarpScore,
            totalFlavorDrops: analysis.totalFlavorDrops,
            normalizedFlavorDose: analysis.normalizedFlavorDose,
            flavorLevel: analysis.flavorSummary,
            flavorSummary: analysis.flavorSummary,
            isFlavorOverdose: analysis.isFlavorOverdose,
            waterMultiplier: analysis.waterMultiplier,
            scentRadius: analysis.scentRadius,
            dissolveTime: (analysis.fishingMode === 'SNAIL' || analysis.fishingMode === 'CORN') ? Math.max(95, fInfo.dissolveTime + 25) : fInfo.dissolveTime,
            baitFirmness: firmness,
            firmnessLabel: fInfo.label,
            rigStyle,
            rigStyleLabel: rigMap[rigStyle] || rigMap.STANDARD,
            charges: hookCharges,
            maxCharges: hookCharges,
            unitLabel: unitHookLabel,
            combos: analysis.detectedCombos,
            flavorTags: analysis.flavorTags,
            waterRatio: this.currentMix.waterRatio
        };

        this.mixedBaits.groundBait = {
            name: `Xả Ổ ${analysis.ingredientSummary}`,
            baseName: analysis.baseName,
            fishingMode: analysis.fishingMode,
            totalFlavorDrops: analysis.totalFlavorDrops,
            normalizedFlavorDose: analysis.normalizedFlavorDose,
            isFlavorOverdose: analysis.isFlavorOverdose,
            scentRadius: Math.round(analysis.scentRadius * 1.35),
            fishGatherSpeed: 1.0 + (analysis.totalScore / 100),
            bubbleSpurRate: analysis.isFlavorOverdose ? 2.45 : (1.2 + (analysis.bigCarpScore / 80)),
            charges: groundCharges,
            maxCharges: groundCharges,
            unitLabel: unitGroundLabel,
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
