import * as THREE from 'three';
import { soundManager } from '../audio/SoundManager.js';

// HỆ THỐNG VẬN HÀNH HỒ CÂU ĐÀI: Giờ hồ, mở/đóng cổng, vé ca 5h/10h/15h, bồi cá định kỳ và kênh sự kiện hệ thống

export const OPEN_HOUR = 6.0;
export const CLOSE_HOUR = 21.0;           // 15 tiếng sau giờ mở cửa
export const HOUR_REAL_SECONDS = 60;      // 1 giờ trong hồ = 60 giây thật (ở tốc độ 1x)

export const LAKE_PHASES = {
    GATE_WAIT: 'GATE_WAIT',   // Mọi người đứng chờ ngoài cổng
    OPEN: 'OPEN',             // Hồ mở cửa, cần thủ chạy chỗ & câu
    CLOSED: 'CLOSED'          // Hồ đóng cửa nghỉ đêm
};

const EXTRA_NAMES = ['Bác Hải Sơn La', 'Chú Tư Bình Dương', 'Hùng Béo', 'Minh Râu', 'Thắng Đen', 'Quân Kèo', 'Tùng Lé', 'Bác Khoa Hải Phòng'];

export class LakeOperations {
    constructor(ui, deps) {
        this.ui = ui;
        this.environment = deps.environment;
        this.bubbleSystem = deps.bubbleSystem;
        this.network = deps.network;
        this.player = deps.player;
        this.gameplay = deps.gameplay;

        this.day = 1;
        this.hour = 5.92;
        this.speed = 1;
        this.phase = LAKE_PHASES.GATE_WAIT;
        this.gateWaitCountdown = 0;

        this.ticket = { active: false, hoursLeft: 0, packageHours: 0, price: 0 };
        this.ticketOfferPending = false;
        this.staffOnTheWay = false;

        // Thống kê ca câu hiện tại của người chơi
        this.sessionFishCount = 0;
        this.sessionTotalWeight = 0;
        this.sessionBiggestFish = 0;
        this.sessionPrizeBonus = 0;

        this.stockEveryDays = 1;
        this.lastStockedDay = 0;
        this.stockAnnouncedDay = 0;
        this.stockHour = 9.0;

        this.eventTimer = 14.0;
        this.eventHistory = [];
        this.closeAnnounced = false;
        this.nightSkipRate = 1.6;
        this.campRestSeconds = 0; // 5 phút (300 giây) nghỉ ngơi tại Lán Trại Tập Trung từ đêm tới sáng

        // Sự kiện Chủ Hồ hô RUNG bất ngờ (thưởng nóng tiền tươi cho người lên cá)
        this.rungEvent = null;
        this.rungCooldown = 48.0 + Math.random() * 45.0;

        // Thời tiết ổn định theo nhiều ngày tự nhiên (ví dụ: 2-4 ngày nắng -> mưa -> hôm sau nhiều mây, không cố định cứng)
        this.currentWeather = 'SUNNY';
        this.weatherDaysLeft = 2 + Math.floor(Math.random() * 2); // 2-3 ngày nắng ổn định ban đầu
        this.lastFeedingWindowKey = null;

        // Sự kiện vui đời thực: Mỗi ngày ngẫu nhiên 1 con cá chết nổi lềnh bềnh -> Chủ Hồ vác vợt ra hớt!
        this.deadFishEventDay = 0;
        this.deadFishTriggerHour = 8.4 + Math.random() * 7.0;
    }

    // Chuyển đổi thời tiết tự nhiên khi bước sang ngày mới (không có quy luật cố định, ổn định nhiều ngày như ngoài đời)
    advanceDailyWeather() {
        this.weatherDaysLeft = (this.weatherDaysLeft || 1) - 1;
        if (this.weatherDaysLeft <= 0) {
            const r = Math.random();
            if (this.currentWeather === 'SUNNY') {
                if (r < 0.48) {
                    this.currentWeather = 'RAINY';
                    this.weatherDaysLeft = 1 + (Math.random() < 0.35 ? 1 : 0); // 1-2 ngày mưa
                } else if (r < 0.85) {
                    this.currentWeather = 'CLOUDY';
                    this.weatherDaysLeft = 1 + (Math.random() < 0.45 ? 1 : 0); // 1-2 ngày nhiều mây
                } else {
                    this.currentWeather = 'SUNNY';
                    this.weatherDaysLeft = 1 + Math.floor(Math.random() * 2);
                }
            } else if (this.currentWeather === 'RAINY') {
                if (r < 0.62) {
                    this.currentWeather = 'CLOUDY'; // Sau mưa hôm sau thường trời nhiều mây mát mẻ
                    this.weatherDaysLeft = 1 + (Math.random() < 0.4 ? 1 : 0);
                } else if (r < 0.88) {
                    this.currentWeather = 'SUNNY';
                    this.weatherDaysLeft = 2 + Math.floor(Math.random() * 2); // 2-3 ngày nắng
                } else {
                    this.currentWeather = 'RAINY';
                    this.weatherDaysLeft = 1;
                }
            } else {
                // Đang CLOUDY (nhiều mây)
                if (r < 0.56) {
                    this.currentWeather = 'SUNNY';
                    this.weatherDaysLeft = 2 + Math.floor(Math.random() * 3); // 2-4 ngày nắng đẹp
                } else if (r < 0.86) {
                    this.currentWeather = 'RAINY';
                    this.weatherDaysLeft = 1 + (Math.random() < 0.3 ? 1 : 0);
                } else {
                    this.currentWeather = 'CLOUDY';
                    this.weatherDaysLeft = 1;
                }
            }
        }

        if (this.environment && typeof this.environment.setWeather === 'function') {
            this.environment.setWeather(this.currentWeather, true);
        }

        // Đồng bộ sinh thái hồ tự nhiên theo thời tiết hôm nay
        if (this.bubbleSystem && typeof this.bubbleSystem.syncEcologyWithWeather === 'function') {
            this.bubbleSystem.syncEcologyWithWeather(this.currentWeather);
        }

        const wLabel = this.currentWeather === 'RAINY'
            ? '🌧️ Trời Mưa (Nước đục phù sa, giàu oxy)'
            : (this.currentWeather === 'CLOUDY'
                ? '⛅ Trời Nhiều Mây Mát Mẻ (Cá đi ăn ổn định)'
                : '☀️ Trời Nắng Đẹp (Nước trong xanh)');
        return wLabel;
    }

    setLake(lake) {
        this.stockEveryDays = lake && lake.stockEveryDays ? lake.stockEveryDays : 1;
        this.lake = lake;
        this.owner = lake && lake.owner ? lake.owner : {
            name: 'Bác Chủ Hồ',
            title: 'Chủ Hồ',
            avatar: '🔑',
            personality: 'Nhiệt tình, chu đáo',
            quote: 'Cá lên rất tơi, còn nhiều chỗ đẹp anh em tới là vào việc nha!',
            gateGreeting: 'Mọi người ùa vào chạy chỗ tìm bến đẹp!'
        };
    }

    get timeText() {
        const h24 = ((this.hour % 24) + 24) % 24;
        const hh = Math.floor(h24);
        const mm = Math.floor((h24 - hh) * 60);
        const period = hh < 11 ? 'Sáng' : hh < 13 ? 'Trưa' : hh < 18 ? 'Chiều' : 'Tối';
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${period}`;
    }

    get hasTicket() {
        return this.ticket.active && this.ticket.hoursLeft > 0;
    }

    formatCampCountdown() {
        const sec = Math.max(0, Math.ceil(this.campRestSeconds || 0));
        const mm = Math.floor(sec / 60);
        const ss = sec % 60;
        return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }

    skipCampRestNow() {
        if (this.phase === LAKE_PHASES.CLOSED) {
            this.campRestSeconds = 0.05;
        }
    }

    // ===== VÀO HỒ HOẠT ĐỘNG NGAY (Không bắt đứng chờ mở cổng lúc mới vào game!) =====
    startMorning(isFirst = false) {
        this.phase = LAKE_PHASES.OPEN;
        this.hour = isFirst ? 7.5 : OPEN_HOUR; // Mới vào game là 07:30 sáng hồ đang hoạt động sầm uất!
        this.campRestSeconds = 0;
        this.closeAnnounced = false;
        this.ticket = { active: false, hoursLeft: 0, packageHours: 0, price: 0 };
        this.ticketOfferPending = false;
        this.staffOnTheWay = false;
        this.environment.setGateOpen(true);
        this.environment.staffTargetPos = null;
        this.network.remoteGroup.visible = true;
        this.network.triggerMorningSpotRush();
        this.gameplay.standUp();
        this.player.setSeated(false);
        this.player.standAtGateWaiting();
        // Đảm bảo tắt sạch bảng chờ cổng, cho người chơi vào hồ ngay
        const gateOverlay = document.getElementById('gate-rush-overlay');
        if (gateOverlay) gateOverlay.style.display = 'none';
        if (this.ui && typeof this.ui.onCampEnded === 'function') {
            this.ui.onCampEnded();
        }

        const lakeName = this.lake ? this.lake.name : 'Hồ Câu';
        const ownerName = this.owner ? this.owner.name : 'Bác Chủ Hồ';
        const greeting = this.owner ? this.owner.gateGreeting : 'Hồ đã mở cửa đón anh em, vào chọn bến đẹp nhé!';
        this.pushEvent(`🎣 Ngày ${this.day} • ${this.timeText}: Chào mừng đến ${lakeName}! Hồ đang hoạt động — hãy chọn bến hoặc bấm Chạy Chỗ để vào câu ngay!`, 'SYSTEM');
        this.network.emitUIEvent({
            type: 'CHAT',
            sender: ownerName,
            text: greeting
        });
    }

    // Chủ hồ ra mở cổng (đúng 06:00 hoặc người chơi bấm nút)
    openGate() {
        if (this.phase !== LAKE_PHASES.GATE_WAIT) return;
        this.phase = LAKE_PHASES.OPEN;
        if (this.hour < OPEN_HOUR) this.hour = OPEN_HOUR;
        this.environment.setGateOpen(true);
        this.network.triggerMorningSpotRush();
        soundManager.playCatchFanfare();
        this.ui.onGateOpened(this.day);
        const ownerName = this.owner ? this.owner.name : 'Chủ hồ';
        const greeting = this.owner ? this.owner.gateGreeting : 'Mọi người ùa vào chạy chỗ tìm bến đẹp!';
        this.pushEvent(`🔑 06:00: ${ownerName} đã ra mở cổng sắt! "${greeting}"`, 'SYSTEM');
        this.network.emitUIEvent({
            type: 'CHAT',
            sender: ownerName,
            text: greeting
        });
    }

    // ===== VÉ CÂU: Nhân viên đi bộ ra bến, thu tiền, bấm giờ =====
    requestTicketCollection() {
        if (this.phase !== LAKE_PHASES.OPEN) return false;
        if (this.hasTicket || this.staffOnTheWay || this.ticketOfferPending) return false;
        const pos = this.player.position.clone();
        this.staffOnTheWay = true;
        this.ui.onStaffComing();
        this.environment.sendStaffToCollectTicket(pos, () => {
            this.staffOnTheWay = false;
            this.ticketOfferPending = true;
            this.ui.onTicketOffer(this.getTicketPackages());
        });
        return true;
    }

    getTicketPackages() {
        // Mức giá vé ca 5h chuẩn của các hồ câu đài Việt Nam (250k/5h, 300k/5h, hồ khai trương 500k/5h)
        const base5h = this.lake && (this.lake.ticketPrice5h || this.lake.ticketPrice)
            ? (this.lake.ticketPrice5h || this.lake.ticketPrice)
            : 250000;
        const hoursLeftToday = Math.max(0, CLOSE_HOUR - this.hour);
        const isOpening = !!(this.lake && this.lake.isOpening);

        const p5h = base5h;
        const p10h = Math.round((base5h * 1.65) / 10000) * 10000;
        const p15h = Math.round((base5h * 2.2) / 10000) * 10000;

        return [
            {
                hours: 5,
                price: p5h,
                name: isOpening ? '🔥 Ca 5 Tiếng (Vé Khai Trương Bão Cá)' : 'Ca 5 Tiếng',
                desc: isOpening ? 'Hồ mới khai trương bồi bão cá, săn cá Boss đeo khuyên vàng' : 'Ca tiêu chuẩn 5 tiếng, đủ nuôi ổ & thử vận may',
                effectiveHours: Math.min(5, hoursLeftToday)
            },
            {
                hours: 10,
                price: p10h,
                name: isOpening ? 'Ca 10 Tiếng (Bán Ngày Khai Trương)' : 'Ca 10 Tiếng (Bán Ngày)',
                desc: 'Nửa ngày thoải mái nuôi ổ săn chép củ & trắm đen khủng',
                effectiveHours: Math.min(10, hoursLeftToday)
            },
            {
                hours: 15,
                price: p15h,
                name: isOpening ? 'Ca 15 Tiếng (Thông Hồ Khai Trương 21:00)' : 'Ca 15 Tiếng (Thông Hồ Đến 21:00)',
                desc: 'Câu xuyên ngày từ sáng sớm tới lúc chủ hồ đóng cổng nghỉ đêm',
                effectiveHours: Math.min(15, hoursLeftToday)
            }
        ];
    }

    buyTicket(hours) {
        const pkg = this.getTicketPackages().find(p => p.hours === hours);
        if (!pkg) return { success: false, message: 'Gói vé không hợp lệ' };
        if (this.ui.playerMoney < pkg.price) {
            return { success: false, message: 'Không đủ tiền trả vé ca này!' };
        }
        this.ui.playerMoney -= pkg.price;
        this.ui.updateMoneyUI();
        this.ticket = { active: true, hoursLeft: pkg.effectiveHours, packageHours: hours, price: pkg.price };
        this.ticketOfferPending = false;

        // Bắt đầu ca câu mới -> reset thống kê ca
        this.sessionFishCount = 0;
        this.sessionTotalWeight = 0;
        this.sessionBiggestFish = 0;
        this.sessionPrizeBonus = 0;

        soundManager.playClick();
        this.pushEvent(`🎫 Bạn đã trả ${pkg.price.toLocaleString()}đ cho ${pkg.name}. Nhân viên bấm giờ — còn ${this.formatHours(pkg.effectiveHours)} câu!`, 'SYSTEM');
        return { success: true, pkg };
    }

    recordFishCatch(fish) {
        if (!fish) return { wonRung: false, rungReward: 0 };
        this.sessionFishCount += 1;
        this.sessionTotalWeight = parseFloat((this.sessionTotalWeight + fish.weight).toFixed(2));
        if (fish.weight > this.sessionBiggestFish) {
            this.sessionBiggestFish = fish.weight;
        }
        if (fish.prizeBonus) {
            this.sessionPrizeBonus += fish.prizeBonus;
        }

        // Kiểm tra trúng kèo RUNG của Chủ Hồ!
        if (this.rungEvent && this.rungEvent.active && fish.weight >= this.rungEvent.minWeight) {
            const reward = this.rungEvent.reward;
            const ownerName = this.rungEvent.ownerName;
            this.rungEvent.active = false;
            this.rungEvent = null;
            this.rungCooldown = 75.0 + Math.random() * 55.0;
            this.sessionPrizeBonus += reward;

            soundManager.playCatchFanfare();
            const winMsg = `🔔🏆 NỔ RUNG RỒI! [${this.network?.localPlayer?.name || 'Bạn'}] vừa lên cụ ${fish.name} (${fish.weight}kg) HÚP TRỌN KÈO RUNG +${reward.toLocaleString()}đ tiền tươi từ ${ownerName}!`;
            this.pushEvent(winMsg, 'LANDED');
            if (this.ui && typeof this.ui.onRungEnded === 'function') {
                this.ui.onRungEnded(true, winMsg);
            }
            return { wonRung: true, rungReward: reward };
        }

        return { wonRung: false, rungReward: 0 };
    }

    // ===== CHỦ HỒ HÔ RUNG BẤT NGỜ (KÈO RUNG THƯỞNG NÓNG) =====
    triggerOwnerRung() {
        const ownerName = this.owner ? this.owner.name : 'Chủ Hồ';
        const presets = [
            { label: 'Lên 1 con cá bất kỳ đầu tiên', minWeight: 0.5, reward: 250000, duration: 60 },
            { label: 'Lên cá từ 3.0kg trở lên', minWeight: 3.0, reward: 350000, duration: 70 },
            { label: 'Lên cá củ từ 5.0kg trở lên', minWeight: 5.0, reward: 500000, duration: 80 }
        ];
        const pick = presets[Math.floor(Math.random() * presets.length)];
        this.rungEvent = {
            active: true,
            ownerName,
            label: pick.label,
            minWeight: pick.minWeight,
            reward: pick.reward,
            timeLeft: pick.duration,
            duration: pick.duration
        };

        soundManager.playRungBell();
        const shout = `🔔📢 ${ownerName.toUpperCase()} HÔ RUNG! "RUNG RỒI ANH EM ƠI! ${pick.label} trong ${pick.duration} giây tới em thưởng nóng +${pick.reward.toLocaleString()}đ tiền tươi tại bến!"`;
        this.pushEvent(shout, 'SYSTEM');
        if (this.ui && typeof this.ui.onRungStarted === 'function') {
            this.ui.onRungStarted(this.rungEvent, shout);
        }
    }

    updateRungEvent(delta) {
        if (this.rungEvent && this.rungEvent.active) {
            this.rungEvent.timeLeft -= delta;
            if (this.rungEvent.timeLeft <= 0) {
                const ownerName = this.rungEvent.ownerName;
                const reward = this.rungEvent.reward;
                this.rungEvent = null;
                this.rungCooldown = 70.0 + Math.random() * 60.0;

                const someoneWon = Math.random() < 0.55;
                const endMsg = someoneWon
                    ? `🔔 Kèo RUNG kết thúc! Cần thủ ${this.pickName()} ở bờ đối diện vừa lên cá húp gọn +${reward.toLocaleString()}đ của ${ownerName}!`
                    : `🔔 Hết giờ RUNG! ${ownerName} cười ha hả: "Cả hồ móm kèo Rung rồi nhé, em cất lại ${reward.toLocaleString()}đ hẹn anh em kèo sau!"`;
                this.pushEvent(endMsg, 'SYSTEM');
                if (this.ui && typeof this.ui.onRungEnded === 'function') {
                    this.ui.onRungEnded(false, endMsg);
                }
            }
        } else {
            this.rungCooldown -= delta;
            if (this.rungCooldown <= 0) {
                this.triggerOwnerRung();
            }
        }
    }

    declineTicket() {
        this.ticketOfferPending = false;
    }

    formatHours(h) {
        const hh = Math.floor(h);
        const mm = Math.round((h - hh) * 60);
        return mm > 0 ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`;
    }

    expireTicket(reason) {
        this.ticket.active = false;
        this.ticket.hoursLeft = 0;
        // Nếu hết ca câu mà 0 con cá nào -> Ghi nhận +1 Ca Móm vào BXH Móm Ca!
        if (this.sessionFishCount === 0 && this.ui && typeof this.ui.recordMomSession === 'function') {
            this.ui.recordMomSession();
        }
        const st = this.gameplay.state;
        if (st === 'CASTING' || st === 'FLOAT_WAIT' || st === 'BITING') this.gameplay.retrieveRod();
        if (st === 'SEATED' || st === 'CASTING' || st === 'FLOAT_WAIT' || st === 'BITING') {
            this.gameplay.standUp();
            this.player.setSeated(false);
        }
        this.ui.onTicketExpired(reason);
    }

    // ===== BỒI CÁ ĐỊNH KỲ (1 ngày / 2 ngày một lần) Ở GẦN NHÀ LÁN CỦA CHỦ HỒ =====
    isStockingDay() {
        return ((this.day - 1) % this.stockEveryDays) === 0;
    }

    doStocking() {
        const n = this.bubbleSystem.spawnStockingBatch(0, -44, 14);
        this.lastStockedDay = this.day;
        soundManager.playCatchFanfare();
        const ownerName = this.owner ? this.owner.name : 'Chủ hồ';
        const quote = this.owner ? this.owner.quote : 'Cá lên rất tơi, còn nhiều chỗ đẹp anh em tới là vào việc nha!';
        const msg = `📢 ${ownerName.toUpperCase()} THÔNG BÁO: ${this.lake ? this.lake.name : 'Hồ'} vừa BỒI CÁ XONG! ${quote}`;
        this.ui.onStocking(msg, n);
        this.network.emitUIEvent({ type: 'SYSTEM', text: msg });
        const speakers = [
            ['Hoàng Đài Thủ 6H', 'Nghe bồi cá cái là em đổi ổ sang gần nhà lán liền!'],
            ['Lâm Lục Hương', 'Cá tơi phàm ăn lắm anh em ơi, bắt đầu vào việc thôi!'],
            ['Đức Vua Câu', 'Thả ổ mạnh tay đi, cá mới thả ăn như điên!']
        ];
        speakers.forEach((p, i) => {
            setTimeout(() => this.network.emitUIEvent({ type: 'CHAT', sender: p[0], text: p[1] }), 1500 + i * 2200);
        });
    }

    // ===== KÊNH SỰ KIỆN HỆ THỐNG: Kịch bản đời thực đi câu đài =====
    pushEvent(text, type = 'SYSTEM') {
        this.network.emitUIEvent({ type, text });
    }

    pickName(excludeName = null) {
        const pool = [];
        this.network.remotePlayers.forEach(b => pool.push(b.name));
        EXTRA_NAMES.forEach(n => pool.push(n));
        const list = pool.filter(n => n !== excludeName);
        return list[Math.floor(Math.random() * list.length)];
    }

    pickBot() {
        const arr = Array.from(this.network.remotePlayers.values());
        return arr[Math.floor(Math.random() * arr.length)];
    }

    splashNear(bot) {
        if (!bot) return;
        const dir = new THREE.Vector3(0, 0, 4.5).applyQuaternion(bot.meshGroup.quaternion);
        const px = bot.meshGroup.position.x + dir.x;
        const pz = bot.meshGroup.position.z + dir.z;
        soundManager.playWaterSplash(1.4);
        for (let i = 0; i < 5; i++) {
            this.bubbleSystem.spawnRipple(px + (Math.random() - 0.5) * 1.4, pz + (Math.random() - 0.5) * 1.4, 1.0 + i * 0.4);
        }
    }

    emitRandomScenario() {
        const A = this.pickName();
        const B = this.pickName(A);
        const bot = this.pickBot();
        const botName = bot ? bot.name : A;
        const w = (4 + Math.random() * 9).toFixed(1);
        const money = [150, 200, 250, 300, 350][Math.floor(Math.random() * 5)];
        const weather = this.environment.weather;
        const habit = this.bubbleSystem.currentHabitMode;

        const scenarios = [
            () => this.pushEvent(`📞 ${A} bị vợ gọi về trông con, lỗ ${money}k tiền vé vì vẫn đang móm... Cay ghê!`, 'WARN'),
            () => this.pushEvent(`📞 Vợ ${A} gọi video: "Ông đi câu hay đi ngủ đấy?" — ${A} vội úp điện thoại xuống.`, 'CHAT'),
            () => { this.splashNear(bot); this.pushEvent(`💦 ${botName} bị con cá lôi cả cần xuống hồ! Anh em đang cầm sào ra vớt cần giúp!`, 'WARN'); },
            () => { this.splashNear(bot); this.pushEvent(`🌊 ${botName} đóng phải cụ chép dữ, bị lôi trượt chân suýt ngã xuống hồ!`, 'WARN'); },
            () => this.pushEvent(`🤬 ${A}: "Mẹ nó, cá đi ăn chậm thế không biết!" — Cả bến cười ầm lên.`, 'CHAT'),
            () => this.pushEvent(`🤬 ${A} chửi thề vì giật hụt 3 phát liền, phao nhấp mà không ngậm.`, 'CHAT'),
            () => this.pushEvent(`😤 ${A} ngồi 3 tiếng chưa một lần phao đi, quay sang hỏi ${B} xin ít mồi...`, 'INFO'),
            () => this.pushEvent(`✂️ ${A} đứt cước giữa chừng, cụ cá chạy mất kèm theo cả bộ phao thẻo!`, 'WARN'),
            () => this.pushEvent(`💥 ${A} chửi toáng lên: "Mẹ nó, thẻo bé quá đứt mẹ thẻo rồi! Con cá bằng bắp chân bay mất!"`, 'WARN'),
            () => this.pushEvent(`💥 ${A} hét lên: "Cá cuốn vào cọc cầu gỗ rồi! Cước kẹt vào cọc tre đứt phựt cả chì lẫn thẻo cay đắng!"`, 'WARN'),
            () => this.pushEvent(`😤 ${A}: "Thẻo 1.2 mà giật sốc với trắm đen 8 cân, nghe cái ĐOÀNG đứt mẹ thẻo đập cả ngọn cần xuống nước!"`, 'WARN'),
            () => this.pushEvent(`⚡ ${A} gào lên: "Cá lao vào cọc chân cầu gỗ, không kịp bẻ lái cuốn luôn cả trục lẫn thẻo rồi anh em ơi!"`, 'WARN'),
            () => {
                const bt = this.network.remotePlayers.get('angler_01');
                if (bt) {
                    const wt = Number(w);
                    bt.fishCount += 1;
                    bt.totalWeight = Number((bt.totalWeight + wt).toFixed(2));
                    bt.biggestFish = Math.max(bt.biggestFish, wt);
                    this.pushEvent(`🏆 ${bt.name} vừa lên bờ 1 cụ chép ${w}kg! Cả bến vỗ tay!`, 'LANDED');
                    this.pushEvent('', 'LEADERBOARD');
                }
            },
            () => this.pushEvent(`🍚 ${A} đang mở cơm trưa thì phao đi — cơm đổ, cá cũng bay mất!`, 'INFO'),
            () => this.pushEvent(`🐌 ${A} khoe ốc bươu ngâm men nhà làm: "Trắm đen sục tăm ngay trước mặt luôn!"`, 'CHAT'),
            () => this.pushEvent(`🌽 ${A}: "Ngô ủ men hương liệu ăn trắm cỏ nhanh phết, 2 con rồi!"`, 'CHAT'),
            () => this.pushEvent(`🕸️ ${A}: "Có ai cho mượn cái vợt với, cá to quá em không với tới!"`, 'CHAT'),
            () => this.pushEvent(`⚔️ ${A} cãi nhau với ${B} vì quăng mồi xả trùm lên ổ của nhau!`, 'WARN'),
            () => this.pushEvent(`🐸 Con ếch nhảy vào cạnh thùng ${A} làm ông giật mình văng cả chén mồi.`, 'INFO'),
            () => this.pushEvent(`🍺 ${A} cá cược với ${B}: ai lên cá cụ trước thì chiêu bia tối nay.`, 'CHAT'),
            () => this.pushEvent(`🎣 ${A} giật sớm làm cả ổ cá tản hết, ${B} bên cạnh trợn mắt nhìn.`, 'WARN'),
            () => this.pushEvent(`😮‍💨 ${A} ngồi móm cả buổi sáng, mồi nào cá cũng ngậm rồi nhả. Thật sự là móm!`, 'INFO'),
            () => this.pushEvent(`🐕 Chó nhà chủ hồ chạy ngang cuốn dây cước của ${A}. Chủ hồ vội chạy lại xin lỗi.`, 'INFO'),
            () => this.pushEvent(`🧊 ${A} đổi thùng đá lạnh sang bến mới vì bến cũ "không có tăm".`, 'INFO'),
            () => this.pushEvent(`🔊 Chủ hồ nhắc: "Ai xả mồi nhớ gom bao nilon bỏ thùng rác giúp, đừng xả xuống hồ nhé!"`, 'SYSTEM'),
            () => this.pushEvent(`🎫 ${A} xin gia hạn thêm 1 ca 5h vì "đang có ổ tốt, về không tiếc".`, 'CHAT'),
            () => this.pushEvent(`💬 ${A}: "Anh em ơi nhà lán đang bán mì tôm trứng, ai ăn không em order luôn?"`, 'CHAT'),
            () => this.pushEvent(`🐟 ${A} vừa lên ${Number(w) > 8 ? 'cụ chép' : 'con rô phi'} ${w}kg, quay video khoe vợ.`, 'LANDED'),
            () => this.pushEvent(`🏅 Có người vừa trúng cá đeo khuyên vàng ${Number(w).toFixed(0)}kg, thưởng nóng 200k! ${A} đang tiếc hùi hụi vì ngồi cạnh.`, 'WARN'),
            () => this.pushEvent(`⚡ ${A} đóng sốc lườn cụ chép, cá lôi chạy ngang hồ cắt cước cả ${B} bên cạnh!`, 'WARN')
        ];

        if (weather === 'RAINY') {
            scenarios.push(
                () => this.pushEvent(`🌧️ Mưa rồi! ${A}: "Nước đục thế này phải pha hương liệu đậm từ 6 giọt trở lên anh em nhé!"`, 'CHAT'),
                () => this.pushEvent(`☔ ${A} dựng vội ô che mưa, tay vẫn không rời cần. Nghiện thật!`, 'INFO')
            );
        } else {
            scenarios.push(
                () => this.pushEvent(`☀️ Trời nắng nước trong: ${A} khuyên "hương liệu vừa phải thôi, đậm quá cá tinh nó nhờn".`, 'CHAT'),
                () => this.pushEvent(`🕶️ Nắng gắt quá, ${A} đeo kính phân cực ngồi soi từng hạt tăm.`, 'INFO')
            );
        }

        if (habit === 'SLOW_LOCKJAW') {
            scenarios.push(() => this.pushEvent(`😴 Cả hồ đang khóa mồm! ${A}: "Cá hôm nay như ngủ, phao im re!"`, 'WARN'));
        } else if (habit === 'GATHER_SPOT') {
            scenarios.push(() => this.pushEvent(`🫧 Tăm nổi dày đặc ở một ổ! ${A}: "Cá tụ hết bên này rồi anh em, qua đây đi!"`, 'CHAT'));
        } else {
            scenarios.push(() => this.pushEvent(`🌿 ${A} thấy tăm chạy dọc ven bờ: "Cá đi kiếm ăn ven bờ, quăng sát mép đi!"`, 'CHAT'));
        }

        const fn = scenarios[Math.floor(Math.random() * scenarios.length)];
        fn();
    }

    // ===== VÒNG LẶP CHÍNH =====
    update(delta) {
        const dh = (delta / HOUR_REAL_SECONDS) * this.speed;
        if (this.environment) {
            this.environment.currentHour = this.hour;
        }

        if (this.phase === LAKE_PHASES.GATE_WAIT) {
            this.hour += dh;
            if (this.hour >= OPEN_HOUR) this.openGate();
        } else if (this.phase === LAKE_PHASES.OPEN) {
            this.hour += dh;

            // Giờ vé đếm ngược thực
            if (this.ticket.active) {
                this.ticket.hoursLeft = Math.max(0, this.ticket.hoursLeft - dh);
                if (this.ticket.hoursLeft <= 0 && this.gameplay.state !== 'FIGHTING') {
                    this.expireTicket('TIME_UP');
                }
            }

            // Bồi cá định kỳ
            if (this.isStockingDay() && this.lastStockedDay !== this.day) {
                if (this.stockAnnouncedDay !== this.day && this.hour >= this.stockHour - 0.2) {
                    this.stockAnnouncedDay = this.day;
                    this.pushEvent('🚚 Nhân viên chuẩn bị bồi cá! Xe cá đang ra khu vực nhà lán của chủ hồ...', 'SYSTEM');
                }
                if (this.hour >= this.stockHour) this.doStocking();
            }

            // Chủ Hồ thi thoảng hô RUNG thưởng nóng
            this.updateRungEvent(delta);

            // Sự kiện đời thực 1 lần/ngày: 1 con cá chết nổi lềnh bềnh mặt hồ -> Chủ Hồ vác vợt cán dài ra hớt!
            if (this.deadFishEventDay !== this.day && this.hour >= this.deadFishTriggerHour && this.bubbleSystem && typeof this.bubbleSystem.spawnFloatingDeadFish === 'function') {
                this.deadFishEventDay = this.day;
                const deadFish = this.bubbleSystem.spawnFloatingDeadFish();
                const ownerName = this.owner ? this.owner.name : 'Bác Chủ Hồ';
                const notice = `🫧 Có 1 em ${deadFish.name} (~${deadFish.weight}kg) bị ngạt nước nổi lềnh bềnh mặt hồ! ${ownerName} đang vác vợt ra ven bờ vớt ngay!`;
                this.pushEvent(notice, 'INFO');
                this.network.emitUIEvent({
                    type: 'CHAT',
                    sender: ownerName,
                    text: `Khổ quá có em ${deadFish.name} ${deadFish.weight}kg nổi lềnh bềnh, để tôi vác vợt ra hớt ngay cho sạch nước anh em câu nha! 😂`
                });
                setTimeout(() => {
                    if (this.environment && typeof this.environment.sendStaffToScoopDeadFish === 'function') {
                        this.environment.sendStaffToScoopDeadFish(deadFish, () => {
                            this.bubbleSystem.removeFloatingDeadFish();
                            soundManager.playWaterSplash(1.1);
                            this.pushEvent(`🧹 ${ownerName} đã dùng vợt hớt gọn em ${deadFish.name} nổi trên mặt hồ lên bờ! Nước sạch bong!`, 'INFO');
                            this.network.emitUIEvent({
                                type: 'CHAT',
                                sender: ownerName,
                                text: 'Đã hớt gọn con cá nổi lên bờ rồi nha anh em, tiếp tục lên hàng khủng nào! 💪'
                            });
                        });
                    }
                }, 4000);
            }

            // Đồng bộ giờ hồ hiện tại & tiến độ ca câu (đầu ca / giữa ca cá giãn ra ngoài / cuối ca) cho AI cá
            if (this.bubbleSystem) {
                this.bubbleSystem.currentHour = this.hour;
                if (this.ticket && this.ticket.active && this.ticket.packageHours > 0) {
                    const elapsed = Math.max(0, this.ticket.packageHours - this.ticket.hoursLeft);
                    this.bubbleSystem.sessionProgress = THREE.MathUtils.clamp(elapsed / this.ticket.packageHours, 0, 1);
                } else {
                    this.bubbleSystem.sessionProgress = THREE.MathUtils.clamp((this.hour - OPEN_HOUR) / (CLOSE_HOUR - OPEN_HOUR), 0, 1);
                }
                if (typeof this.bubbleSystem.getFeedingWindowStatus === 'function') {
                    const fw = this.bubbleSystem.getFeedingWindowStatus(this.hour);
                    if (fw && fw.key !== this.lastFeedingWindowKey) {
                        this.lastFeedingWindowKey = fw.key;
                        this.pushEvent(`${fw.badge}: ${fw.desc}`, fw.key.startsWith('PEAK') ? 'GOLD' : (fw.pressFloatOnly ? 'WARN' : 'INFO'));
                    }
                }
            }

            // Cảnh báo sắp đóng cửa
            if (!this.closeAnnounced && this.hour >= CLOSE_HOUR - 0.5) {
                this.closeAnnounced = true;
                this.pushEvent('⏰ Còn 30 phút nữa hồ đóng cửa! Anh em thu cần, dọn thùng nhé!', 'SYSTEM');
            }

            // Hết 15 tiếng: Hồ đóng cửa
            if (this.hour >= CLOSE_HOUR && this.gameplay.state !== 'FIGHTING') {
                this.closeLake();
            }

            // Sự kiện hệ thống ngẫu nhiên
            this.eventTimer -= delta;
            if (this.eventTimer <= 0) {
                this.eventTimer = 10 + Math.random() * 14;
                this.emitRandomScenario();
            }
        } else if (this.phase === LAKE_PHASES.CLOSED) {
            // Nghỉ đêm 5 phút (300 giây thực tế) tại Lán Trại Tập Trung: ánh sáng chuyển mượt 21:00 -> 06:00 sáng
            this.campRestSeconds = Math.max(0, this.campRestSeconds - delta);
            const progress = 1.0 - (this.campRestSeconds / 300.0);
            this.hour = CLOSE_HOUR + progress * 9.0; // 21:00 -> 30:00 (06:00 sáng hôm sau)
            if (this.campRestSeconds <= 0) {
                this.day += 1;
                this.deadFishTriggerHour = 8.4 + Math.random() * 7.5; // Random giờ mới cho ngày tiếp theo
                let hungryAgain = 0;
                if (this.bubbleSystem && typeof this.bubbleSystem.onNewLakeDay === 'function') {
                    hungryAgain = this.bubbleSystem.onNewLakeDay();
                }
                const weatherSummary = this.advanceDailyWeather();
                this.startMorning(false);
                const digestNote = hungryAgain > 0 ? ` (${hungryAgain} con cá ăn no hôm trước đã tiêu hóa xong, bụng đói đi kiếm ăn trở lại!)` : '';
                this.pushEvent(`🌅 06:00 SÁNG (NGÀY ${this.day}): ${weatherSummary} • Hết 5 phút nghỉ đêm, hệ thống đã đưa anh em về Cổng Hồ!${digestNote}`, 'SYSTEM');
            }
        }
    }

    closeLake() {
        this.phase = LAKE_PHASES.CLOSED;
        this.hour = CLOSE_HOUR;
        this.campRestSeconds = 300; // Đúng 5 phút nghỉ ngơi tại Lán Trại Tập Trung
        if (this.ticket.active) this.expireTicket('CLOSED');
        else {
            const st = this.gameplay.state;
            if (st === 'SEATED' || st === 'CASTING' || st === 'FLOAT_WAIT' || st === 'BITING') {
                this.gameplay.retrieveRod();
                this.gameplay.standUp();
                this.player.setSeated(false);
            }
        }
        this.environment.setGateOpen(false);
        this.network.remoteGroup.visible = false;

        // Truyền tống người chơi ra Khu Lán Trại Tập Trung để đi lại, nghỉ ngơi & nói chuyện 5 phút!
        if (this.environment && this.environment.campPosition) {
            this.player.position.copy(this.environment.campPosition);
            this.player.yaw = 0;
            this.player.pitch = -0.05;
        }

        soundManager.playCatchFanfare();
        this.ui.onLakeClosed(this.day);
        this.pushEvent(`🏕️ 21:00 HẾT GIỜ CÂU: Mọi người đã được truyền tống ra LÁN TRẠI TẬP TRUNG! Nghỉ ngơi, đi lại trò chuyện & đi Chợ Thế Giới trong 5 phút đến 06:00 sáng mai!`, 'SYSTEM');
    }
}
