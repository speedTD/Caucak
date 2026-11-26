import { soundManager } from '../audio/SoundManager.js';
import { BRANDS } from '../data/BaitShopData.js';
import { FISHING_MODES } from '../systems/BaitMixingSystem.js';
import { LAKES_DATA, assignRandomTerrainsToLakes } from '../data/LakesData.js';
import { getFishImageUrl } from '../data/FishProfiles.js';
import { EQUIPMENT_CATEGORIES, getDefaultEquipmentLevels, getEquippedTier, computeEquipmentBonuses } from '../data/EquipmentUpgradeData.js';
import { STARTER_RODS, FLOAT_CALIBRATIONS, FISHING_STYLES, LINE_SIZES, MAIN_LINE_PACK_PRICE, LEADER_PACK_PRICE, LEADER_PACK_COUNT, getLineSpec, getCalibrationById, getFishingStyleById, getDefaultRigState, isValidSnailCornCalibration } from '../data/RigSetupData.js';
import { LAKE_DEEDS, INITIAL_WORLD_MARKET_LISTINGS, getDefaultOwnedLakesState } from '../data/WorldMarketData.js';
import { NET_EVENTS } from '../network/NetworkManager.js';
import { LakeOperations } from '../systems/LakeOperations.js';
import {
    renderRodModelSVG,
    renderLineSpoolSVG,
    renderEquipmentPreviewSVG,
    renderShopItemSVG,
    renderMixingBasinSVG,
    renderRigWaterTankSVG
} from './GearVisualRenderer.js';

export class UIManager {
    constructor(gameplay, mixingSystem, bubbleSystem, player, environment, shopItems, onLakeChange, network) {
        this.gameplay = gameplay;
        this.mixingSystem = mixingSystem;
        this.bubbleSystem = bubbleSystem;
        this.player = player;
        this.environment = environment;
        this.shopItems = shopItems;
        this.onLakeChange = onLakeChange;
        this.network = network;

        // Kinh tế
        this.playerMoney = 1000000; // Mặc định mỗi người chơi mới nhận 1.000.000đ để đi câu!
        this.leaderboardMode = 'HUGO'; // BXH mặc định: HUGO (Cá to nhất) | MONEY (Tiền) | MOM (Móm Ca) | WEIGHT (Tổng cân)
        this.playerInventory = this.getDefaultBaitInventory();
        this.fishKeepnet = [];
        this.careerStats = {
            totalFish: 0,
            totalWeight: 0,
            biggestFish: 0,
            biggestFishName: '--',
            rungWins: 0,
            speciesRecords: {}
        };
        this.loadPlayerProfile();

        this.showFishMindHud = false;
        this.devPanelOpen = false;
        this.devFilter = 'ALL';
        this.devSelectedFishId = null;
        this.devShow3DFish = false;
        this.devUiAccum = 0;

        // Hệ thống 7 Trang Bị Câu Đài & Bộ Set Cần / Cân Phao / Trục / Thẻo
        this.equipmentLevels = this.loadEquipmentLevels();
        this.rigConfig = this.loadRigConfig();
        this.worldMarketTab = 'gear';
        this.worldListings = INITIAL_WORLD_MARKET_LISTINGS.map(x => ({ ...x }));
        this.ownedLakes = this.loadOwnedLakes();
        this.tournament = { active: false, timeLeft: 0, entryFee: 200000, prizePool: 2500000, entries: [], tickAccum: 0 };
        this.syncWorldMarketFromServer();
        this.ownedLakeEconAccum = 0;
        if (this.gameplay && typeof this.gameplay.applyEquipmentUpgrades === 'function') {
            this.gameplay.applyEquipmentUpgrades(this.equipmentLevels);
        }
        if (this.gameplay && typeof this.gameplay.applyRigSetup === 'function') {
            this.gameplay.applyRigSetup(this.rigConfig);
        }

        // Hệ thống Giờ Hồ Câu (06:00 Sáng mở cửa -> 21:00 Tối hết 15h đóng cửa -> 06:00 Sáng hôm sau mở lại) & Thu Vé Ca 5h / 10h / 15h
        this.dayCount = 1;
        this.lakeHour = 5.92; // 05:55 sáng đứng chờ ở cửa hồ
        this.lakeScheduleState = 'GATE_WAITING'; // 'GATE_WAITING' | 'SPOT_RUSH' | 'OPEN_FISHING' | 'CLOSED_NIGHT'
        this.gateCountdown = 4.5;
        this.hasActiveTicket = false;
        this.ticketState = 'NONE'; // 'NONE' | 'WAITING_STAFF' | 'MODAL_OPEN' | 'ACTIVE' | 'EXPIRED'
        this.selectedShiftHours = 0;
        this.remainingShiftHours = 0;
        this.chosenPackageHours = 15;
        this.timeSpeedMultiplier = 1;

        // Quản lý Vận hành Hồ Câu Đài: Mở/đóng cổng, Vé ca 5h/10h/15h, Bồi cá, Kênh sự kiện xã hội
        this.lakeOps = new LakeOperations(this, {
            environment: this.environment,
            bubbleSystem: this.bubbleSystem,
            network: this.network,
            player: this.player,
            gameplay: this.gameplay
        });
        if (this.gameplay && this.gameplay.currentLake) {
            this.lakeOps.setLake(this.gameplay.currentLake);
        }
        this.ticketPackages = [
            {
                hours: 5,
                name: 'Ca 5 Tiếng (Ca Ngắn)',
                price: 200000,
                desc: 'Câu 5 tiếng tính từ lúc nhân viên thu vé & trả tiền. Hết 5h có thể nối thêm ca.'
            },
            {
                hours: 10,
                name: 'Ca 10 Tiếng (Nửa Ngày)',
                price: 350000,
                desc: 'Câu 10 tiếng liên tục, thoải mái nuôi ổ săn Chép Củ & Trắm Đen.'
            },
            {
                hours: 15,
                name: 'Ca 15 Tiếng (Thông Ca 06:00 ➔ 21:00)',
                price: 450000,
                desc: 'Câu trọn vẹn 15 tiếng từ lúc mở hồ 6h sáng tới 21h tối hồ đóng cửa nghỉ đêm!'
            }
        ];

        this.initDOM();
        this.bindEvents();
        this.initNetworkListeners();
        this.initAuthFlow();
    }

    initDOM() {
        this.uiRoot = document.createElement('div');
        this.uiRoot.id = 'game-ui-root';
        this.uiRoot.innerHTML = `
            <!-- Top HUD Bar Siêu Gọn 1 Dòng (Tối ưu cả PC & Mobile) -->
            <div class="top-hud">
                <div class="hud-card player-info">
                    <span class="money-tag">💰 <b id="ui-money">1,500,000</b>đ</span>
                    <span class="lake-tag">📍 <b id="ui-lake-name">Hồ Củ Gấu</b></span>
                    <span class="clock-tag" id="ui-lake-clock">🕒 05:55</span>
                    <span class="ticket-tag" id="ui-ticket-status">🎫 Chờ cổng</span>
                    <span class="stat-tag" id="ui-angler-stats">🪣 <b id="ui-stat-count">0</b> (<b id="ui-stat-weight">0.0</b>kg)<span class="hide-mobile"> • 🏆 <b id="ui-stat-biggest">0.0</b>kg</span></span>
                </div>
                <div class="world-chat-ticker" id="world-chat-ticker" style="display: none;"></div>
                <div class="hud-center-actions">
                    <button id="btn-open-rig" class="btn-hud btn-rig-hud btn-quick-compact" title="Set Cần • 11 Kiểu Cân Phao • Trục & Thẻo 1.0-10.0">⚙️ <span class="hide-mobile">Trục/Phao</span></button>
                    <button id="btn-open-mix" class="btn-hud btn-quick-compact" title="Pha Mồi (M)">🥣 <span class="hide-mobile">Pha Mồi</span></button>
                    <button id="btn-open-upgrade" class="btn-hud btn-upgrade-hud btn-quick-compact" title="Nâng Cấp Đồ Đài (U)">🎒 <span class="hide-mobile">Đồ Đài</span></button>
                    <button id="btn-open-dev" class="btn-hud btn-dev-hud btn-quick-compact" title="Nhà Phát Triển: Xem luồng cá đi & trạng thái AI (F9)">🐞 <span class="hide-mobile">DEV</span></button>
                    <button id="btn-toggle-main-menu" class="btn-hud btn-menu-primary" title="Mở Menu Tất Cả Chức Năng">☰ MENU</button>
                </div>
            </div>

            <!-- NGĂN KÉO MENU TỔNG HỢP (Gom toàn bộ chức năng gọn gàng cho PC & Mobile) -->
            <div class="main-menu-backdrop" id="main-menu-backdrop" style="display: none;"></div>
            <div class="main-menu-drawer" id="main-menu-drawer" style="display: none;">
                <div class="menu-drawer-header">
                    <span>☰ MENU HỒ CÂU ĐÀI</span>
                    <button class="btn-close" id="btn-close-main-menu">&times;</button>
                </div>
                <div class="menu-drawer-body">
                    <div class="menu-account-bar" id="menu-account-bar">
                        <span id="menu-account-name">👤 Tài khoản: <b>Khách</b></span>
                        <button class="btn-logout-mini" id="btn-menu-logout">🚪 Đăng Xuất</button>
                    </div>
                    <div class="menu-status-card">
                        <span class="habit-tag" id="ui-fish-habit">🫧 Tăm Cá: Đang Tụ Ổ</span>
                        <span class="condition-tag" id="ui-lake-condition" style="background: rgba(239, 68, 68, 0.22); border: 1px solid #ef4444; border-radius: 6px; padding: 4px 8px; font-weight: bold; font-size: 11.5px; cursor: pointer;" title="Bấm để xem bí kíp câu ca này">🌤️ Cá Ăn Đều</span>
                    </div>

                    <div class="menu-online-card">
                        <div class="menu-online-status" id="menu-online-status">🟡 Chế độ: Phòng Online Mô Phỏng</div>
                        <div class="menu-name-row">
                            <input type="text" id="input-player-name" placeholder="Tên cần thủ của bạn..." maxlength="22" />
                            <button id="btn-save-player-name" class="btn-save-name">Lưu Tên</button>
                        </div>
                    </div>

                    <div class="menu-section-lbl">🎣 THAO TÁC & BẾN CÂU</div>
                    <div class="menu-btn-grid">
                        <button id="btn-quick-sit" class="menu-item-btn menu-highlight">🏃 Chạy Chỗ Đẹp</button>
                        <button id="btn-open-world-market" class="menu-item-btn menu-world-btn">🌐 Chợ Thế Giới</button>
                        <button id="btn-select-spot" class="menu-item-btn">📍 Chọn Bến (1-6)</button>
                        <button id="btn-open-shop" class="menu-item-btn">🏪 Tiệm Đồ (B)</button>
                        <button id="btn-open-net" class="menu-item-btn">🪣 Rọng Cá (R)</button>
                        <button id="btn-switch-lake" class="menu-item-btn">🗺️ Đổi Hồ (L)</button>
                        <button id="btn-menu-open-upgrade" class="menu-item-btn">🎒 Nâng Cấp (U)</button>
                        <button id="btn-menu-open-rig" class="menu-item-btn">⚙️ Trục/Phao</button>
                        <button id="btn-open-tournament" class="menu-item-btn menu-highlight">🏆 Giải Đấu 5p</button>
                    </div>

                    <div class="menu-section-lbl">🌦️ MÔI TRƯỜNG & CÀI ĐẶT</div>
                    <div class="menu-btn-grid">
                        <button id="btn-toggle-weather" class="menu-item-btn btn-weather-sunny">☀️ Nắng / Mưa (T)</button>
                        <button id="btn-time-speed" class="menu-item-btn">⏩ Giờ: 1x</button>
                        <button id="btn-toggle-ground" class="menu-item-btn">🛣️ Nền Bờ (P)</button>
                        <button id="btn-toggle-touch" class="menu-item-btn">📱 Phím Mobile</button>
                        <button id="btn-menu-mute" class="menu-item-btn">🔊 Âm Thanh: BẬT</button>
                        <button id="btn-menu-records" class="menu-item-btn">🏆 Sổ Kỷ Lục</button>
                    </div>

                    <div class="menu-section-lbl">👁️ HIỂN THỊ CỬA SỔ PHỤ</div>
                    <div class="menu-btn-grid">
                        <button id="btn-menu-toggle-online" class="menu-item-btn">💬 Chat & BXH</button>
                        <button id="btn-menu-toggle-mind" class="menu-item-btn">🧠 Đáy Ổ</button>
                        <button id="btn-menu-toggle-keys" class="menu-item-btn">⌨️ Phím Tắt</button>
                        <button id="btn-menu-open-dev" class="menu-item-btn menu-dev-item">🐞 Soi Luồng Cá (F9)</button>
                    </div>
                </div>
            </div>

            <!-- BẢNG NHÀ PHÁT TRIỂN: SOI LUỒNG CÁ ĐI, CÁ ĂN / CÁ NHÁT & TRẠNG THÁI AI REALTIME -->
            <div class="dev-fish-panel" id="dev-fish-panel" style="display: none;">
                <div class="dev-panel-header">
                    <span>🐞 DEV FISH AI INSPECTOR • LUỒNG CÁ & TRẠNG THÁI</span>
                    <div class="dev-header-actions">
                        <button class="dev-mini-btn" id="btn-dev-toggle-3dfish" title="Hiện/Ẩn mô hình cá 3D bơi dưới đáy hồ">👁️ Cá 3D: Tắt</button>
                        <button class="btn-close" id="btn-close-dev">&times;</button>
                    </div>
                </div>
                <div class="dev-map-wrap">
                    <canvas id="dev-fish-map-canvas" width="520" height="175"></canvas>
                    <div class="dev-map-legend">
                        <span><i class="dot dot-eat"></i>Đang ăn/Sục ổ</span>
                        <span><i class="dot dot-inspect"></i>Dò xét/Thổi mồi</span>
                        <span><i class="dot dot-shy"></i>Nhát/Chê/Chạy</span>
                        <span><i class="dot dot-cruise"></i>Đi tuần</span>
                        <span><i class="dot dot-float"></i>Phao & Ổ xả</span>
                    </div>
                </div>
                <div class="dev-stats-strip" id="dev-stats-strip">
                    <span>Tổng: <b id="dev-cnt-total">0</b></span>
                    <span class="c-eat">🟢 Ăn: <b id="dev-cnt-eat">0</b></span>
                    <span class="c-ins">🟡 Dò: <b id="dev-cnt-ins">0</b></span>
                    <span class="c-shy">🔴 Nhát: <b id="dev-cnt-shy">0</b></span>
                    <span class="c-cru">🔵 Tuần: <b id="dev-cnt-cru">0</b></span>
                    <span>⚠️ Cảnh giác ổ: <b id="dev-spot-alert">0%</b></span>
                </div>
                <div class="dev-tools-row">
                    <button class="dev-tool-btn" id="btn-dev-add-money" style="background:rgba(16,185,129,0.28);border-color:#10b981;color:#6ee7b7;">💰 +10Tr</button>
                    <button class="dev-tool-btn" id="btn-dev-pull-fish">🎯 Kéo 4 cá vào ổ</button>
                    <button class="dev-tool-btn" id="btn-dev-calm-fish">😌 Trấn an toàn hồ</button>
                    <select id="dev-condition-select" class="dev-select" title="Đổi nhanh điều kiện ngày">
                        <option value="BOOM_DAY">🔥 Bão Cá</option>
                        <option value="NORMAL_DAY">🌤️ Ăn Đều</option>
                        <option value="PICKY_DAY">⚠️ Kén Mồi</option>
                        <option value="LOCKJAW_MOM_DAY">💀 Khóa Mồm</option>
                    </select>
                </div>
                <div class="dev-filter-tabs" id="dev-filter-tabs">
                    <button class="dev-ftab active" data-filter="ALL">Tất cả</button>
                    <button class="dev-ftab" data-filter="EAT">🟢 Đang ăn</button>
                    <button class="dev-ftab" data-filter="INSPECT">🟡 Dò xét</button>
                    <button class="dev-ftab" data-filter="SHY">🔴 Nhát/Chê</button>
                    <button class="dev-ftab" data-filter="NEAR">📍 Gần phao</button>
                </div>
                <div class="dev-fish-list" id="dev-fish-list"></div>
            </div>

            <!-- BANNER ĐỨNG CHỜ CỬA HỒ 06:00 SÁNG & CHẠY CHỖ TÌM BẾN ĐẸP -->
            <div class="gate-rush-overlay" id="gate-rush-overlay" style="display: none;">
                <div class="gate-rush-card">
                    <div class="gate-rush-badge" id="gate-rush-badge">⛩️ 05:55 SÁNG (NGÀY 1) • TẬP TRUNG TRƯỚC CỬA HỒ</div>
                    <h2 class="gate-rush-title" id="gate-rush-title">Mọi người đang đứng ở cửa hồ chờ Chủ Hồ ra mở cửa!</h2>
                    <p class="gate-rush-desc" id="gate-rush-desc">
                        Đúng 06:00 sáng Chủ Hồ sẽ mở cổng sắt. Ngay khi mở cửa, mọi người sẽ chạy chỗ quanh hồ để tìm bến đẹp ngồi câu!
                    </p>
                    <div class="gate-rush-actions" id="gate-waiting-actions">
                        <button class="btn-gate-open-now" id="btn-open-gate-now">🔑 CHỦ HỒ RA MỞ CỬA NGAY (06:00 SÁNG) — BẮT ĐẦU CHẠY CHỖ!</button>
                    </div>
                    <div class="spot-rush-grid" id="spot-rush-grid" style="display: none;"></div>
                </div>
            </div>

            <!-- THÔNG BÁO KỊCH BẢN ĐỜI THỰC HỒ CÂU ĐÀI VIỆT NAM (Nhỏ gọn góc trên, tự tắt sau 4.5s) -->
            <div class="scenario-toast" id="scenario-toast" style="display: none;">
                <div class="scenario-toast-title" id="scenario-toast-title">📢 KỊCH BẢN HỒ CÂU</div>
                <div class="scenario-toast-desc" id="scenario-toast-desc">Nhà hồ vừa thả thêm cá đeo khuyên thưởng nóng!</div>
            </div>

            <!-- BANNER ĐẾM NGƯỢC KÈO RUNG CHỦ HỒ (HIỆN KHI CHỦ HỒ HÔ RUNG!) -->
            <div class="rung-event-banner" id="rung-event-banner" style="display: none;">
                <span class="rung-bell-ico">🔔</span>
                <div class="rung-body">
                    <div class="rung-title" id="rung-banner-title">CHỦ HỒ HÔ RUNG! THƯỞNG NÓNG +300.000đ</div>
                    <div class="rung-sub" id="rung-banner-sub">Lên cá trong 60s tới để húp trọn tiền tươi!</div>
                </div>
                <div class="rung-timer" id="rung-banner-timer">60s</div>
            </div>

            <!-- BANNER NGHỈ ĐÊM 5 PHÚT TẠI LÁN TRẠI TẬP TRUNG -->
            <div class="camp-night-banner" id="camp-night-banner" style="display: none;">
                <span class="camp-ico">🏕️</span>
                <div class="camp-body">
                    <div class="camp-title">LÁN TRẠI TẬP TRUNG • NGHỈ ĐÊM CHỜ SÁNG</div>
                    <div class="camp-sub">Tự do đi lại, trò chuyện, đi Chợ Thế Giới! Tự động truyền tống về cổng hồ lúc 06:00 sáng.</div>
                </div>
                <div class="camp-timer" id="camp-banner-timer">05:00</div>
                <button class="btn-camp-market" id="btn-camp-open-market">🌐 Chợ Thế Giới</button>
                <button class="btn-camp-skip" id="btn-camp-skip-night" title="Tua nhanh qua đêm đến 06:00 sáng">⏩ Sáng Ngay</button>
            </div>

            <!-- KÍNH NGẮM PHAO CẬN CẢNH HD THỜI GIAN THỰC (PICTURE-IN-PICTURE FLOAT CAM) -->
            <div class="pip-float-frame" id="pip-float-frame" style="display: none;">
                <div class="pip-header">
                    <span>🎯 KÍNH NGẮM PHAO HD</span>
                    <span class="pip-status-tag" id="pip-float-status">Cân 7 Câu 3</span>
                </div>
                <div class="pip-reticle-overlay">
                    <div class="pip-waterline"></div>
                    <div class="pip-scale-marks">
                        <span>+3</span>
                        <span>+2</span>
                        <span>+1</span>
                        <span class="zero-mark">MẶT NƯỚC</span>
                        <span>-1</span>
                        <span>-2</span>
                    </div>
                </div>
                <div class="pip-footer" id="pip-float-footer">Phao Nano 11 Nấc Quang Học</div>
            </div>

            <!-- BẢNG PHÒNG CÂU ONLINE MULTIPLAYER & BẢNG XẾP HẠNG THỜI GIAN THỰC (Mặc định ẩn, mở qua Menu) -->
            <div class="online-room-panel" id="online-room-panel" style="display: none;">
                <div class="online-panel-header">
                    <span>🟢 ONLINE: PHÒNG SĂN HÀNG #01 (5/12)</span>
                    <button class="btn-toggle-keys" id="btn-toggle-online">_</button>
                </div>
                <div class="online-panel-body" id="online-panel-body">
                    <div class="online-sub-title">🏆 BẢNG XẾP HẠNG HỒ CÂU REALTIME</div>
                    <div class="lb-tabs-row" id="online-lb-tabs" style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap;">
                        <button class="lb-tab-btn active" data-lb="HUGO" style="flex:1;padding:4px 5px;font-size:10.5px;font-weight:800;border-radius:6px;border:1px solid #f59e0b;background:rgba(245,158,11,0.28);color:#fde047;cursor:pointer;">🏆 HUGO</button>
                        <button class="lb-tab-btn" data-lb="MONEY" style="flex:1;padding:4px 5px;font-size:10.5px;font-weight:800;border-radius:6px;border:1px solid rgba(148,163,184,0.3);background:rgba(30,41,59,0.7);color:#cbd5e1;cursor:pointer;">💰 TIỀN</button>
                        <button class="lb-tab-btn" data-lb="MOM" style="flex:1;padding:4px 5px;font-size:10.5px;font-weight:800;border-radius:6px;border:1px solid rgba(148,163,184,0.3);background:rgba(30,41,59,0.7);color:#cbd5e1;cursor:pointer;">💀 MÓM CA</button>
                        <button class="lb-tab-btn" data-lb="WEIGHT" style="flex:1;padding:4px 5px;font-size:10.5px;font-weight:800;border-radius:6px;border:1px solid rgba(148,163,184,0.3);background:rgba(30,41,59,0.7);color:#cbd5e1;cursor:pointer;">⚖️ CÂN</button>
                    </div>
                    <div class="online-leaderboard" id="online-leaderboard-list"></div>
                    <div class="online-sub-title" style="margin-top:6px;">💬 KÊNH BÁO CÁ & GIAO LƯU CẦN THỦ</div>
                    <div class="online-feed-list" id="online-feed-list"></div>
                    <div class="online-chat-row">
                        <input type="text" id="online-chat-input" placeholder="Chat với cần thủ trong hồ..." maxlength="80" />
                        <button id="btn-send-chat">Gửi</button>
                    </div>
                </div>
            </div>

            <!-- BẢNG CHÚ THÍCH PHÍM TẮT BÊN TAY PHẢI (Mặc định ẩn, mở qua Menu) -->
            <div class="right-controls-panel" id="right-controls-panel" style="display: none;">
                <div class="right-panel-header">
                    <span>⌨️ PHÍM TẮT CÂU ĐÀI</span>
                    <button class="btn-toggle-keys" id="btn-toggle-keys">_</button>
                </div>
                <div class="key-guide-list" id="key-guide-content">
                    <div class="key-row highlight-key">
                        <span class="key-badge">Chuột Trái</span>
                        <span class="key-label">Vung cần / Giật cá</span>
                    </div>
                    <div class="key-row highlight-key">
                        <span class="key-badge">⬆️ / W</span>
                        <span class="key-label">Dựng cần / Ghì nổi cá</span>
                    </div>
                    <div class="key-row highlight-key">
                        <span class="key-badge">⬅️ / ➡️</span>
                        <span class="key-label">Ghìm cần trái / phải</span>
                    </div>
                    <div class="key-row highlight-key">
                        <span class="key-badge">⬇️ / Space</span>
                        <span class="key-label">Gõ lực hớt cá vào vợt</span>
                    </div>
                    <div class="key-divider"></div>
                    <div class="key-row">
                        <span class="key-badge">E</span>
                        <span class="key-label">Hạ Thùng / Đứng dậy</span>
                    </div>
                    <div class="key-row">
                        <span class="key-badge">F</span>
                        <span class="key-label">Xả mồi tụ ổ</span>
                    </div>
                    <div class="key-row">
                        <span class="key-badge">Z</span>
                        <span class="key-label">Kính phân cực Zoom phao</span>
                    </div>
                    <div class="key-row">
                        <span class="key-badge">T</span>
                        <span class="key-label">Đổi Nắng (Nước Trong) / Mưa (Nước Đục)</span>
                    </div>
                    <div class="key-row">
                        <span class="key-badge">P</span>
                        <span class="key-label">Đổi Thảm Nhựa Asphalt / Bê Tông VN</span>
                    </div>
                    <div class="key-row">
                        <span class="key-badge">W A S D</span>
                        <span class="key-label">Đi dạo quanh hồ</span>
                    </div>
                    <div class="key-row">
                        <span class="key-badge">Chuột Phải</span>
                        <span class="key-label">Xoay góc nhìn FPV</span>
                    </div>
                    <div class="key-divider"></div>
                    <div class="key-row">
                        <span class="key-badge">M / B / R / L</span>
                        <span class="key-label">Mồi / Shop / Rọng / Hồ</span>
                    </div>
                </div>
            </div>

            <!-- Radar tăm cá nhỏ hơn phía trên bên phải -->
            <div class="radar-box">
                <div class="radar-title">📡 MÁY DÒ TĂM CÁ</div>
                <canvas id="radar-canvas" width="115" height="115"></canvas>
            </div>

            <!-- Gợi ý bến câu khi đi dạo gần bến -->
            <div class="spot-near-banner" id="spot-near-banner" style="display: none;">
                <div class="spot-near-title" id="spot-near-title">Bến Cầu Gỗ Chính #1</div>
                <div class="spot-near-desc" id="spot-near-desc">View đồi cây tự nhiên, luồng tăm cá củ thường tụ</div>
                <button class="btn-sit-near" id="btn-sit-near-act">🪑 HẠ THÙNG NGỒI CÂU NGAY (PHÍM E)</button>
            </div>

            <!-- THANH THAO TÁC CÂU ĐÀI KHI ĐÃ NGỒI VÀO BẾN -->
            <div class="seated-control-panel" id="seated-controls" style="display: none;">
                <!-- 4 BƯỚC VÀO CÂU CHUẨN ĐÀI: GHI VÉ ➔ PHA MỒI ➔ XẢ MỒI ➔ RA CẦN & CANH PHAO -->
                <div class="fishing-flow-bar" id="fishing-flow-bar">
                    <button class="flow-step-btn" id="flow-step-ticket" title="Bước 1: Ghi vé ca 5h/10h với nhân viên">
                        <span class="flow-step-num">1</span>
                        <span class="flow-step-title">GHI VÉ CA</span>
                        <span class="flow-step-badge" id="flow-badge-ticket">Chưa có vé</span>
                    </button>
                    <span class="flow-arrow">➔</span>
                    <button class="flow-step-btn" id="flow-step-mix" title="Bước 2: Mở thau pha mồi đài chuyên nghiệp (Phím M)">
                        <span class="flow-step-num">2</span>
                        <span class="flow-step-title">PHA MỒI (M)</span>
                        <span class="flow-step-badge" id="flow-badge-mix">Sẵn khay mồi</span>
                    </button>
                    <span class="flow-arrow">➔</span>
                    <button class="flow-step-btn" id="flow-step-ground" title="Bước 3: Xả 3-5 viên mồi tụ ổ dụ cá chép tụ lại (Phím F)">
                        <span class="flow-step-num">3</span>
                        <span class="flow-step-title">XẢ MỒI TỤ Ổ (F)</span>
                        <span class="flow-step-badge" id="flow-badge-ground">Chưa xả</span>
                    </button>
                    <span class="flow-arrow">➔</span>
                    <button class="flow-step-btn" id="flow-step-cast" title="Bước 4: Ra cần buông mồi vào ổ & Canh mắt phao">
                        <span class="flow-step-num">4</span>
                        <span class="flow-step-title">RA CẦN & CANH PHAO</span>
                        <span class="flow-step-badge" id="flow-badge-cast">Sẵn sàng</span>
                    </button>
                </div>

                <div class="panel-header">
                    <span class="panel-spot-name" id="seated-spot-name">Bến Cầu Gỗ Chính #1</span>
                    <span class="panel-bait-info" id="seated-bait-info">Khay mồi: Chép Phú Thành + Sữa Ngô</span>
                </div>
                <div class="panel-actions-row">
                    <button class="btn-action-main btn-cast" id="btn-act-cast">🎣 VUNG CẦN RA Ổ CÂU</button>
                    <button class="btn-action-sub btn-ground" id="btn-act-ground">🥣 XẢ Ổ (F)</button>
                    <button class="btn-action-sub btn-rodlen" id="btn-act-rodlen" title="Đổi tầm cần xa/gần (3.6m ven bờ -> 7.2m rãnh sâu)">📏 Tầm: 5.4m</button>
                    <button class="btn-action-sub btn-zoom" id="btn-act-zoom">🎯 ZOOM (Z)</button>
                    <button class="btn-action-sub btn-stand" id="btn-act-stand">🚶 ĐỨNG (E)</button>
                </div>
            </div>

            <!-- HUD Ý THỨC CÁ DƯỚI ĐÁY (đọc tín hiệu: cá đi ngang / nhặt mồi xả / thổi thử / ăn thật) -->
            <div class="fish-mind-hud" id="fish-mind-hud" style="display: none;">
                <div class="fish-mind-row">
                    <span class="fish-mind-title">🧠 ĐÁY Ổ</span>
                    <span class="fish-mind-tag" id="fish-mind-alert">Cảnh giác 15%</span>
                    <span class="fish-mind-tag" id="fish-mind-bait">Mồi 100%</span>
                    <span class="fish-mind-tag" id="fish-mind-tray">Khay: trống</span>
                </div>
                <div class="fish-mind-log" id="fish-mind-log">Mặt nước tĩnh lặng</div>
            </div>

            <!-- NÚT GIẬT CẦN THƯỜNG TRỰC KHI ĐANG BUÔNG CẦN / CÁ ĂN REALTIME -->
            <div class="strike-huge-btn-container" id="strike-container" style="display: none;">
                <button class="btn-strike-huge" id="btn-strike-act">⚡ GIẬT CẦN (SPACE / CLICK)</button>
            </div>

            <!-- Action Prompt trung tâm -->
            <div class="action-prompt-box" id="action-prompt">
                <div class="prompt-text" id="prompt-content">Bạn đang ngồi bến câu đài. Bấm "VUNG CẦN RA Ổ CÂU" để buông cần!</div>
            </div>

            <!-- Tín hiệu cắn phao realtime (Bỏ timer 0.5s) -->
            <div class="float-alert-banner" id="float-alert" style="display: none;">
                <div class="alert-icon">🎯</div>
                <div class="alert-body">
                    <div class="alert-title" id="alert-title">PHAO BÁO TÍN HIỆU REALTIME</div>
                    <div class="alert-sub" id="alert-sub">Quan sát mắt phao đè / bềnh kỹ rồi bấm GIẬT CẦN!</div>
                </div>
            </div>

            <!-- Fight HUD Tinh Gọn: Thanh Cân Bằng Mảnh Trên Cao + NÚT HÌNH TRÒN GHÌ & BO CÁ 360° GẦN GIỮA MÀN HÌNH -->
            <div class="fight-hud" id="fight-hud" style="display: none;">
                <div class="fight-top-hud-card">
                    <div class="fight-top-strip" id="fight-dir-banner">
                        <span class="fight-fish-name" id="fight-fish-name">🐟 Cá Chép Củ (8.5kg)</span>
                        <span class="dir-phase-badge" id="fight-phase-badge">▲ GHÌ LÊN</span>
                        <span class="fight-distance" id="fight-dist">6.2m</span>
                    </div>
                    <span id="fight-feedback-text" style="display:none;"></span>

                    <!-- THANH VẠCH CÂN BẰNG LỰC BO TRÁI / BO PHẢI -->
                    <div class="balance-gauge-box" id="balance-gauge-box">
                        <div class="balance-gauge-header">
                            <span class="bal-side-lbl bal-left-lbl">◀ BO TRÁI</span>
                            <span class="bal-status-text" id="balance-hint-text">⚖️ Giữ kim ở VÙNG XANH GIỮA</span>
                            <span class="bal-side-lbl bal-right-lbl">BO PHẢI ▶</span>
                        </div>
                        <div class="balance-track" id="balance-track">
                            <div class="balance-zone-sweet"></div>
                            <div class="balance-center-tick"></div>
                            <div class="balance-fish-vector" id="balance-fish-vector"></div>
                            <div class="balance-needle" id="balance-needle"></div>
                        </div>
                    </div>

                    <div class="fight-bars-row">
                        <div class="compact-meter">
                            <span class="meter-label">Căng cước</span>
                            <div class="tension-bar-bg">
                                <div class="tension-bar-fill" id="tension-fill"></div>
                            </div>
                        </div>
                        <div class="compact-meter">
                            <span class="meter-label">Sức cá</span>
                            <div class="stamina-bar-bg">
                                <div class="stamina-bar-fill" id="stamina-fill"></div>
                            </div>
                        </div>
                        <div class="compact-meter" id="surface-meter-box" style="display: none;">
                            <span class="meter-label">Độ nổi <b id="surface-pct">0%</b></span>
                            <div class="surface-bar-bg">
                                <div class="surface-bar-fill" id="surface-fill"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- NÚT HÌNH TRÒN GHÌ & BO CÁ ĐA HƯỚNG (HIỆN GẦN GIỮA MÀN HÌNH) -->
                <div class="fight-circle-zone" id="fight-circle-zone">
                    <div class="fight-circle-pad" id="fight-circle-pad">
                        <div class="fc-crosshair-h"></div>
                        <div class="fc-crosshair-v"></div>
                        <div class="fc-inner-ring"></div>

                        <div class="fc-sector fc-up" id="btn-fight-up">
                            <span class="fc-arr">▲</span>
                            <span class="fc-lbl" id="lbl-fight-up">GHÌ LÊN</span>
                        </div>
                        <div class="fc-sector fc-left" id="btn-fight-left">
                            <span class="fc-arr">◀</span>
                            <span class="fc-lbl">TRÁI</span>
                        </div>
                        <div class="fc-sector fc-right" id="btn-fight-right">
                            <span class="fc-lbl">PHẢI</span>
                            <span class="fc-arr">▶</span>
                        </div>
                        <div class="fc-sector fc-down" id="btn-fight-down">
                            <span class="fc-lbl" id="lbl-fight-down">HẠ NHẢ</span>
                            <span class="fc-arr">▼</span>
                        </div>

                        <!-- Núm Tròn Tâm Kéo Mượt 360° -->
                        <div class="fc-knob" id="fight-circle-knob">
                            <span class="fc-knob-ico" id="fc-knob-ico">✊</span>
                            <span class="fc-knob-txt" id="fc-knob-txt">GHÌ & BO</span>
                        </div>
                    </div>

                    <button class="btn-net-fish-round" id="btn-net-action" style="display: none;" disabled>🕸️ HỚT CÁ VÀO VỢT (SPACE)</button>

                    <div class="fight-mini-skills-arc">
                        <button class="btn-mini-skill" id="btn-skill-ngulong" title="Xoáy cần Ngự Long phá hướng cá chạy thẳng (Phím Q)">🐉 Q</button>
                        <button class="btn-mini-skill" id="btn-skill-hangu" title="Dìm cần Hạ Ngư giảm căng sâu (Phím C)">🌊 C</button>
                        <button class="btn-mini-skill btn-mini-leash" id="btn-skill-leash" title="Thả Dây Bảo Hiểm cứu cần & xả 52% căng cước (Phím X)">🪢 X</button>
                    </div>
                </div>
            </div>

            <!-- Modal Chọn Bến Câu (1-4) -->
            <div class="modal-overlay" id="modal-spots" style="display: none;">
                <div class="modal-content spots-modal-content">
                    <div class="modal-header">
                        <h2>📍 CHỌN BẾN CÂU ĐÀI XUNG QUANH HỒ</h2>
                        <button class="btn-close" id="btn-close-spots">&times;</button>
                    </div>
                    <div class="spots-list-grid" id="spots-list-container"></div>
                </div>
            </div>

            <!-- Modal Chậu Pha Mồi Chuyên Nghiệp: Chọn Loại Câu -> Bỏ Đồ Vào Chậu -> Pha Chế -->
            <div class="modal-overlay" id="modal-mix" style="display: none;">
                <div class="modal-content mix-modal-content">
                    <div class="modal-header">
                        <div class="modal-header-text">
                            <h2>🥣 CHẬU PHA MỒI CÂU ĐÀI VIỆT NAM</h2>
                            <p class="modal-subtitle">Bước 1: Chọn Loại Câu (Cám / Ốc / Ngô) • Bước 2: Bỏ nguyên liệu & hương liệu vào Chậu • Bước 3: Bấm Pha Chế</p>
                        </div>
                        <button class="btn-close" id="btn-close-mix">&times;</button>
                    </div>

                    <!-- BƯỚC 1: CHỌN LOẠI CÂU (CÂU CÁM / CÂU ỐC / CÂU NGÔ) -->
                    <div class="mix-mode-selector-bar" id="mix-mode-tabs">
                        <button class="mix-mode-tab active" data-mode="CAM">
                            <span class="mm-ico">🥣</span>
                            <div class="mm-txt">
                                <b>Câu Cám</b>
                                <small>Cám 35k/kg + Mật Khoai / Tương Sữa / Lục Hương / Sữa Ngô</small>
                            </div>
                        </button>
                        <button class="mix-mode-tab" data-mode="SNAIL">
                            <span class="mm-ico">🐚</span>
                            <div class="mm-txt">
                                <b>Câu Ốc (Ốc Bươu / Ốc Vặn)</b>
                                <small>Chuẩn: 5–10 giọt Rượu Thuốc Bắc / 1kg cám</small>
                            </div>
                        </button>
                        <button class="mix-mode-tab" data-mode="CORN">
                            <span class="mm-ico">🌽</span>
                            <div class="mm-txt">
                                <b>Câu Ngô Ngọt</b>
                                <small>Chuẩn: 10 bắp pha 5ml–10ml Nước Xanh</small>
                            </div>
                        </button>
                    </div>

                    <!-- BÀI MỒI MẪU NHANH ĐÚNG TỶ LỆ VÀNG -->
                    <div class="mix-presets-bar">
                        <span class="preset-label">⚡ BÀI MẪU CHUẨN TỶ LỆ:</span>
                        <button class="btn-preset-recipe" id="preset-cam-quocdan">🥣 Cám Chép Mật Khoai + Sữa Ngô</button>
                        <button class="btn-preset-recipe" id="preset-cam-daugiai">🌿 Cám Lục Hương + Tương Sữa</button>
                        <button class="btn-preset-recipe" id="preset-oc-thuocbac">🐚 Ốc Bươu Ủ Cám + 8 Giọt Rượu Thuốc Bắc</button>
                        <button class="btn-preset-recipe" id="preset-ngo-nuocxanh">🌽 10 Bắp Ngô Ngọt + 8ml Nước Xanh</button>
                    </div>

                    <div class="mix-layout">
                        <!-- Cột Trái: Chậu Trộn Mồi Trực Quan + Kệ Bỏ Nguyên Liệu & Hương Liệu Vào Chậu -->
                        <div class="mix-left">
                            <div class="basin-live-card" id="basin-live-card">
                                <div class="basin-card-head">
                                    <span id="basin-mode-hint">🥣 <b>Chậu Câu Cám:</b> Bỏ Cám Nền + Hương Liệu vào chậu rồi bấm Pha Chế</span>
                                    <button class="btn-clear-basin" id="btn-clear-basin" title="Đổ sạch nguyên liệu đang bỏ nháp trong chậu">🗑️ Làm Sạch Chậu</button>
                                </div>
                                <div class="basin-svg-stage" id="mix-basin-svg-wrap"></div>
                                <div class="basin-chips-list" id="mix-basin-chips"></div>
                            </div>

                            <div class="section-title" style="margin-top:10px;">1. Bỏ Nguyên Liệu Nền Vào Chậu (Cám 35k/kg • Ngô 10k/bắp • Ốc 20k/kg)</div>
                            <div class="base-select-grid" id="base-bait-list"></div>

                            <div class="section-title" style="margin-top:12px;">2. Nhỏ Hương Liệu Vào Chậu (Đúng Tỷ Lệ Tránh Nặng Mùi Đè Phao)</div>
                            <div class="flavor-controls" id="flavor-select-list"></div>
                        </div>

                        <!-- Cột Phải: Lối Đánh Giấu Thẻo, Chọn Cân Phao (15 Bài), Tỉ Lệ Nước & Đánh Giá -->
                        <div class="mix-right">
                            <div class="section-title">3A. Chọn Lối Đánh & Giải Pháp Giấu Thẻo (Độc Lập)</div>
                            <div class="mix-calib-grid" id="mix-style-grid" style="margin-bottom:8px;"></div>
                            <div id="ho-dau-config-card" class="ho-dau-card" style="display:none;"></div>

                            <div class="section-title">3B. Chọn Cách Cân Phao (15 Bài Chuẩn Đài)</div>
                            <div class="mix-calib-grid" id="mix-calib-grid"></div>
                            <div class="mix-calib-status" id="mix-calib-status"></div>

                            <div class="section-title" style="margin-top:10px;">4. Tỉ Lệ Nước & Độ Vê Mồi</div>
                            <div class="water-slider-box">
                                <div class="water-slider-header">
                                    <span class="water-ratio-label">Tỉ lệ Nước: <b id="water-ratio-val">0.80</b></span>
                                    <span class="water-zone-badge" id="water-zone-badge">Chuẩn Vê Lưỡi</span>
                                </div>
                                <input type="range" id="slider-water" min="0.5" max="1.2" step="0.05" value="0.8">
                                <div class="water-scale-ticks">
                                    <span>0.5 (Xả Hạt)</span>
                                    <span>0.8 (Vê Chuẩn)</span>
                                    <span>1.0 (Xốp)</span>
                                    <span>1.2 (Cháo)</span>
                                </div>
                                <div class="water-desc" id="water-texture-desc">Mồi dẻo bám đáy chuẩn bài</div>
                            </div>
                            <div class="prep-option-row" style="margin-top:8px;">
                                <span class="prep-option-label">Độ vê:</span>
                                <button class="btn-prep-opt" data-firm="SOFT" title="Tan nhanh ~44s, bung sương cực nhạy">Mềm Bung Sương</button>
                                <button class="btn-prep-opt active" data-firm="MEDIUM" title="Tan ~76s, cân bằng chuẩn đài">Dẻo Chuẩn</button>
                                <button class="btn-prep-opt" data-firm="HARD" title="Tan ~115s, chống rô phi rỉa / móc chắc">Móc Chắc / Vê Chặt</button>
                            </div>

                            <div class="section-title" style="margin-top:10px;">5. Kiểm Tra Tỷ Lệ Chậu Mồi & Cảnh Báo Nặng Mùi</div>
                            <div class="recipe-analysis-card" id="recipe-analysis">
                                <div class="water-rule-banner" id="ana-water-status">✅ TỶ LỆ HỢP LÝ</div>
                                <div class="analysis-stats-grid">
                                    <div class="score-line">Liều Hương: <b id="ana-flavor-drops">--</b></div>
                                    <div class="score-line">Hấp Dẫn Cá: <b id="ana-carp-score">--</b></div>
                                    <div class="score-line">Săn Hàng To: <b id="ana-big-score">--</b></div>
                                    <div class="score-line">Bán Kính Ổ: <b id="ana-radius">-- mét</b></div>
                                </div>
                                <div class="water-rule-feedback" id="ana-water-rule-feedback"></div>
                                <div class="combos-box" id="ana-combos"></div>
                            </div>
                        </div>
                    </div>

                    <!-- FOOTER CỐ ĐỊNH: BẤM PHA CHẾ TOÀN BỘ ĐỒ TRONG CHẬU -->
                    <div class="mix-footer-bar">
                        <div class="mix-footer-summary" id="mix-footer-summary">🎯 Bỏ nguyên liệu & hương liệu vào chậu sau đó bấm Pha Chế</div>
                        <button class="btn-primary-action btn-mix-confirm" id="btn-do-mix">🤲 NHÀO TRỘN & PHA CHẾ TRONG CHẬU (ENTER)</button>
                    </div>
                </div>
            </div>

            <!-- Modal Cửa Hàng -->
            <div class="modal-overlay" id="modal-shop" style="display: none;">
                <div class="modal-content shop-modal-content">
                    <div class="modal-header">
                        <h2>🏪 TIỆM MỒI CÂU • HƯƠNG LIỆU & ĐỒ ĐÀI</h2>
                        <button class="btn-close" id="btn-close-shop">&times;</button>
                    </div>
                    <div class="shop-tabs">
                        <button class="tab-btn active" data-tab="all">Tất Cả (12 Loại Mồi & Hương)</button>
                        <button class="tab-btn" data-tab="${BRANDS.BASE_CAM}">🌾 Cám Nền (35k/kg)</button>
                        <button class="tab-btn" data-tab="${BRANDS.NATURAL_BAIT}">🌽🐚 Ngô (10k) & Ốc (20k)</button>
                        <button class="tab-btn" data-tab="${BRANDS.FLAVOR_CAM}">🍯 Hương Pha Cám</button>
                        <button class="tab-btn" data-tab="${BRANDS.FLAVOR_SPECIAL}">🍶🧪 Rượu Thuốc Bắc & Nước Xanh</button>
                        <button class="tab-btn" data-tab="${BRANDS.EQUIPMENT}">🎣 Cần & Phao</button>
                    </div>
                    <div class="shop-item-grid" id="shop-items-container"></div>
                </div>
            </div>

            <!-- Modal Xưởng Nâng Cấp 7 Trang Bị Câu Đài (Cần, Phao, Trục Thẻo, Gác Cần, Pad Mồi, Thùng, Ô) -->
            <div class="modal-overlay" id="modal-upgrade" style="display: none;">
                <div class="modal-content upgrade-modal-content">
                    <div class="modal-header">
                        <div class="modal-header-text">
                            <h2>🎒 XƯỞNG NÂNG CẤP TRANG BỊ CÂU ĐÀI PRO</h2>
                            <p class="modal-subtitle">Nâng cấp trực tiếp Cần • Phao • Trục/Thẻo • Gác Cần • Pad Mồi • Thùng Câu • Ô Câu (Hiển thị 3D tức thì!)</p>
                        </div>
                        <button class="btn-close" id="btn-close-upgrade">&times;</button>
                    </div>
                    <div class="upgrade-summary-bar" id="upgrade-summary-bar">
                        <div class="upg-sum-pill">💰 Ví hiện tại: <b id="upg-money-val">1,500,000</b> đ</div>
                        <div class="upg-sum-pill">⚡ Tổng Cấp Đồ Đài: <b id="upg-total-lvl">7 / 28</b></div>
                        <div class="upg-sum-pill">🛡️ Giảm Căng / Chống Đứt: <b id="upg-combat-stat">0% / 0%</b></div>
                        <div class="upg-sum-pill">🎁 Thưởng Cá / Che Gió: <b id="upg-bonus-stat">+0% / 0%</b></div>
                    </div>
                    <div class="upgrade-grid" id="upgrade-items-container"></div>
                </div>
            </div>

            <!-- Modal Sổ Kỷ Lục & Hồ Sơ Cần Thủ (Lưu Tự Động) -->
            <div class="modal-overlay" id="modal-records" style="display: none;">
                <div class="modal-content records-modal-content">
                    <div class="modal-header">
                        <div class="modal-header-text">
                            <h2>🏆 SỔ KỶ LỤC & HỒ SƠ CẦN THỦ</h2>
                            <p class="modal-subtitle">Tiến trình Ví tiền • Túi mồi • Trang bị • Kỷ lục cá được tự động lưu trữ</p>
                        </div>
                        <button class="btn-close" id="btn-close-records">&times;</button>
                    </div>
                    <div class="records-summary-grid" id="records-summary-grid"></div>
                    <div class="records-species-title">🐟 KỶ LỤC CÂN NẶNG THEO TỪNG LOÀI CÁ</div>
                    <div class="records-species-list" id="records-species-list"></div>
                    <div class="records-footer">
                        <button class="btn-reset-save" id="btn-reset-profile">🗑️ Xóa Dữ Liệu Chơi Lại Từ Đầu</button>
                    </div>
                </div>
            </div>

            <!-- Modal Chuẩn Bị Đồ Đài Trước Khi Câu: Chọn Cần • 11 Kiểu Cân Phao • Trục & Thẻo 1.0-10.0 -->
            <div class="modal-overlay" id="modal-rig-setup" style="display: none;">
                <div class="modal-content rig-modal-content">
                    <div class="modal-header">
                        <div class="modal-header-text">
                            <h2>⚙️ SET CẦN • CÂN PHAO • TRỤC & THẺO ĐÀI</h2>
                            <p class="modal-subtitle">Thiết lập bộ đồ câu chuẩn trước khi buông cần — Đứt trục (39k/bộ) • Đứt thẻo (110k/10 thẻo)</p>
                        </div>
                        <button class="btn-close" id="btn-close-rig">&times;</button>
                    </div>
                    <div class="rig-modal-body">
                        <div class="rig-section">
                            <div class="rig-sec-title">1. 🎣 CHỌN CẦN CÂU ĐÀI (Tải cá tối đa)</div>
                            <div class="rig-rods-grid" id="rig-rods-grid"></div>
                        </div>

                        <div class="rig-section">
                            <div class="rig-sec-title">2. 📍 CHỌN KIỂU CÂN PHAO & MÔ PHỎNG BỂ CÂN NƯỚC 1:1</div>
                            <div class="rig-calib-showcase">
                                <div class="rig-calib-left">
                                    <div class="rig-calibs-grid" id="rig-calibs-grid"></div>
                                    <div class="rig-calib-desc" id="rig-calib-desc"></div>
                                </div>
                                <div class="rig-water-tank-box" id="rig-water-tank-preview"></div>
                            </div>
                        </div>

                        <div class="rig-section">
                            <div class="rig-sec-title">3. 🧵 SET TRỤC & THẺO (Số 1.0 → 10.0 • Tải Tĩnh 2kg→20kg • Tải Cá 5kg→50kg)</div>
                            <div class="rig-lines-row">
                                <div class="rig-line-card">
                                    <div class="rig-line-card-top">
                                        <div class="rig-spool-visual" id="spool-main-svg"></div>
                                        <div style="flex:1;">
                                            <div class="rig-line-head">🧵 DÂY TRỤC (39.000đ / 1 bộ)</div>
                                            <select id="sel-main-line" class="rig-select"></select>
                                            <div class="rig-line-spec" id="spec-main-line"></div>
                                        </div>
                                    </div>
                                    <div class="rig-line-stock-row">
                                        <span id="stock-main-line">Kho: 1 bộ</span>
                                        <button class="btn-buy-rig" id="btn-buy-main-line">🛒 Mua 1 Bộ (39k)</button>
                                    </div>
                                </div>
                                <div class="rig-line-card">
                                    <div class="rig-line-card-top">
                                        <div class="rig-spool-visual" id="spool-leader-svg"></div>
                                        <div style="flex:1;">
                                            <div class="rig-line-head">🪝 DÂY THẺO (110.000đ / 10 thẻo)</div>
                                            <select id="sel-leader-line" class="rig-select"></select>
                                            <div class="rig-line-spec" id="spec-leader-line"></div>
                                        </div>
                                    </div>
                                    <div class="rig-line-stock-row">
                                        <span id="stock-leader-line">Kho: 5 thẻo</span>
                                        <button class="btn-buy-rig" id="btn-buy-leader-line">🛒 Mua 10 Thẻo (110k)</button>
                                    </div>
                                </div>
                            </div>
                            <div class="rig-warning-box" id="rig-warning-box" style="display: none;"></div>
                        </div>
                    </div>
                    <div class="rig-modal-footer">
                        <div class="rig-summary-txt" id="rig-summary-txt"></div>
                        <button class="btn-rig-confirm" id="btn-confirm-rig">✅ XÁC NHẬN BỘ ĐỒ & VÀO CÂU</button>
                    </div>
                </div>
            </div>

            <!-- MODAL CHỢ THẾ GIỚI & QUẢN LÝ KHẾ ƯỚC CHỦ HỒ -->
            <div class="modal-overlay" id="modal-world-market" style="display: none;">
                <div class="modal-content wm-modal-content">
                    <div class="modal-header">
                        <div class="modal-header-text">
                            <h2>🌐 CHỢ THẾ GIỚI & SÀN KHẾ ƯỚC CHỦ HỒ</h2>
                            <p class="modal-subtitle">Mua bán cần/phao/mồi/phụ kiện giữa các cần thủ • Mua Khế Ước làm Chủ Hồ thu chi thực tế!</p>
                        </div>
                        <button class="btn-close" id="btn-close-world-market">&times;</button>
                    </div>
                    <div class="wm-tabs" id="wm-tabs">
                        <button class="wm-tab active" data-tab="gear">🎣 Cần & Phao Ký Gửi</button>
                        <button class="wm-tab" data-tab="bait">🥣 Mồi & Trục Thẻo</button>
                        <button class="wm-tab" data-tab="deeds">📜 Khế Ước Chủ Hồ</button>
                        <button class="wm-tab" data-tab="owner">👑 Sổ Thu/Chi Chủ Hồ</button>
                        <button class="wm-tab wm-tab-sell" id="btn-wm-quick-sell">📤 Ký Gửi Bán Đồ (+Tiền)</button>
                    </div>
                    <div class="wm-wallet-strip">
                        <span>💰 Ví hiện tại: <b id="wm-wallet-val">1,500,000</b> đ</span>
                        <span id="wm-owned-count">👑 Đang làm chủ: <b>0</b> hồ câu</span>
                    </div>
                    <div class="wm-body" id="wm-body-container"></div>
                </div>
            </div>

            <!-- Modal Rọng Cá -->
            <div class="modal-overlay" id="modal-net" style="display: none;">
                <div class="modal-content net-modal-content">
                    <div class="modal-header">
                        <h2>🪣 RỌNG CÁ CỦA BẠN (CHIẾN TÍCH)</h2>
                        <button class="btn-close" id="btn-close-net">&times;</button>
                    </div>
                    <div class="net-summary">
                        <span>Tổng số cá: <b id="net-count">0</b> con</span>
                        <span>Tổng trọng lượng: <b id="net-total-weight">0.00</b> kg</span>
                        <button class="btn-sell-fish" id="btn-sell-all">💰 Bán Trả Cá Cho Hồ</button>
                    </div>
                    <div class="fish-list-grid" id="net-fish-container"></div>
                </div>
            </div>

            <!-- Modal Chọn Hồ Câu Đầu Ngày & Đổi Hồ (6 Hồ Nổi Tiếng) -->
            <div class="modal-overlay lakes-welcome-modal" id="modal-lakes" style="display: none;">
                <div class="modal-content lakes-modal-content">
                    <div class="modal-header">
                        <div>
                            <h2 id="lakes-modal-title">🎣 HÔM NAY BẠN MUỐN ĐI HỒ CÂU ĐÀI NÀO?</h2>
                            <div class="lakes-modal-subtitle">Lựa chọn 1 trong 6 hồ câu dịch vụ nổi tiếng Việt Nam để bắt đầu chuyến săn hàng:</div>
                        </div>
                        <button class="btn-close" id="btn-close-lakes">&times;</button>
                    </div>
                    <div class="lakes-grid" id="lakes-container"></div>
                </div>
            </div>

            <!-- Modal Chúc Mừng Bắt Cá (Hiển thị Ảnh Chụp Cá Thật Theo Loài) -->
            <div class="modal-overlay celebration-modal" id="modal-celebration" style="display: none;">
                <div class="celebration-box">
                    <div class="celeb-badge">🎉 BẮT ĐƯỢC CÁ THÀNH CÔNG!</div>
                    <div class="celeb-photo-frame">
                        <img id="celeb-fish-photo" class="celeb-fish-photo" src="/images/fish/carp.jpg" alt="Cá vừa câu được" />
                        <span class="celeb-icon-mini" id="celeb-icon">🐟</span>
                    </div>
                    <h1 class="celeb-fish-name" id="celeb-fish-name">Cá Chép Củ Gấu</h1>
                    <div class="celeb-stats">
                        <div class="stat-pill">Cân nặng: <b id="celeb-weight">8.85</b> kg</div>
                        <div class="stat-pill">Độ hiếm: <b id="celeb-rarity">Cực Hiếm</b></div>
                        <div class="stat-pill">Tiền thưởng: <b id="celeb-reward">+180,000</b> đ</div>
                    </div>
                    <button class="btn-celebration-ok" id="btn-celeb-close">BỎ VÀO RỌNG CÁ 🪣</button>
                </div>
            </div>

            <!-- BANNER BỒI CÁ ĐỊNH KỲ (1 NGÀY / 2 NGÀY LẦN) GẦN NHÀ LÁN CHỦ HỒ -->
            <div class="stocking-broadcast-banner" id="stocking-banner" style="display: none;">
                <div class="stocking-icon">🚚🐟</div>
                <div class="stocking-content">
                    <div class="stocking-title">📢 CHỦ HỒ THÔNG BÁO BỒI CÁ!</div>
                    <div class="stocking-text" id="stocking-banner-text">Hồ vừa BỒI CÁ XONG tại khu vực nhà lán! Cá lên rất tơi, còn nhiều chỗ đẹp anh em tới là vào việc nha!</div>
                </div>
            </div>

            <!-- MODAL THU VÉ CA CÂU ĐÀI (5H / 10H / 15H THÔNG CA) KHI NHÂN VIÊN RA BẾN -->
            <div class="modal-overlay" id="modal-ticket" style="display: none;">
                <div class="modal-content ticket-modal-content">
                    <div class="modal-header">
                        <h2>🎫 NHÂN VIÊN THU VÉ CA HỒ CÂU ĐÀI</h2>
                        <button class="btn-close" id="btn-close-ticket">&times;</button>
                    </div>
                    <div class="ticket-modal-body">
                        <div class="ticket-staff-badge">
                            <span class="staff-avatar">👷‍♂️</span>
                            <div class="staff-info">
                                <div class="staff-name">Nhân Viên Quản Lý Bến Câu</div>
                                <div class="staff-quote">"Chào cần thủ! Mời anh chọn ca câu để em thu tiền và bấm giờ bắt đầu nhé!"</div>
                            </div>
                        </div>
                        <div class="ticket-packages-grid" id="ticket-packages-list"></div>
                        <div class="ticket-wallet-info">
                            <span>Số dư tài khoản: <b id="ticket-wallet-money">500,000</b> đ</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MODAL HẾT CA CÂU / HỒ ĐÓNG CỬA 21:00 -->
            <div class="modal-overlay" id="modal-shift-end" style="display: none;">
                <div class="modal-content shift-end-modal-content">
                    <div class="shift-end-badge" id="shift-end-icon">⏰</div>
                    <h2 id="shift-end-title">HẾT GIỜ CA CÂU!</h2>
                    <p id="shift-end-desc" class="shift-end-desc">Bạn đã câu hết thời gian ca vừa rồi. Vui lòng nối ca mới hoặc dọn đồ nghỉ ngơi.</p>
                    <div class="shift-end-actions">
                        <button class="btn-primary-action" id="btn-extend-ticket">🎫 NỐI THÊM CA MỚI</button>
                        <button class="btn-hud" id="btn-close-shift-modal">🚶 THU CẦN NGHỈ NGƠI</button>
                    </div>
                </div>
            </div>

            <!-- BẢNG ĐIỀU KHIỂN CẢM ỨNG DI ĐỘNG (MOBILE VIRTUAL CONTROLS) -->
            <div class="mobile-controls-layer" id="mobile-controls">
                <!-- Virtual D-Pad cho di động -->
                <div class="mobile-dpad" id="mobile-dpad">
                    <button class="dpad-btn dpad-up" id="btn-m-up">▲</button>
                    <button class="dpad-btn dpad-left" id="btn-m-left">◀</button>
                    <button class="dpad-btn dpad-center" id="btn-m-center">●</button>
                    <button class="dpad-btn dpad-right" id="btn-m-right">▶</button>
                    <button class="dpad-btn dpad-down" id="btn-m-down">▼</button>
                </div>

                <!-- Cụm Phím Thao Tác Chuyên Nghiệp Cho Mobile (Chỉ hiện nút ấn được theo đúng trạng thái!) -->
                <div class="mobile-action-cluster" id="mobile-actions">
                    <button class="mobile-action-btn btn-m-strike" id="btn-m-strike">⚡ GIẬT CẦN</button>
                    <button class="mobile-action-btn btn-m-cast" id="btn-m-cast">🎣 Vung Cần</button>
                    <button class="mobile-action-btn btn-m-ground" id="btn-m-ground">🥣 Xả Mồi</button>
                    <button class="mobile-action-btn btn-m-stand" id="btn-m-stand">🪑 Đứng/Ngồi</button>
                    <button class="mobile-action-btn btn-m-zoom" id="btn-m-zoom">🎯 Zoom Phao</button>
                </div>
            </div>

            <!-- HƯỚNG DẪN XOAY NGANG ĐIỆN THOẠI (MOBILE LANDSCAPE GUIDE) -->
            <div class="mobile-rotate-overlay" id="mobile-rotate-overlay" style="display: none;">
                <div class="mobile-rotate-card">
                    <div class="rotate-phone-icon">📱</div>
                    <h3>XOAY NGANG ĐIỆN THOẠI ĐỂ NGẮM PHAO CHUẨN NHẤT!</h3>
                    <p>
                        • Xoay ngang màn hình giúp <b>nhìn rõ toàn cảnh mặt hồ & Kính Ngắm Phao HD</b>.<br/>
                        • Dễ dàng canh từng nấc phao (bềnh cả củ / mất hình) và bấm nút <b>Giật Cần / Bo Cá</b> mượt mà!
                    </p>
                    <button class="btn-dismiss-rotate" id="btn-dismiss-rotate">Vẫn tiếp tục màn hình dọc</button>
                </div>
            </div>

            <!-- MÀN HÌNH ĐĂNG NHẬP / ĐĂNG KÝ TÀI KHOẢN ONLINE -->
            <div class="auth-screen-overlay" id="auth-screen-overlay" style="display: none;">
                <div class="auth-card">
                    <div class="auth-logo">🎣 CÂU ĐÀI 3D VIỆT NAM</div>
                    <div class="auth-sub">Đăng nhập hoặc tạo tài khoản — Lần sau vào game tự động giữ tài khoản!</div>
                    <div class="auth-tabs">
                        <button class="auth-tab active" id="tab-auth-login">🔑 Đăng Nhập</button>
                        <button class="auth-tab" id="tab-auth-register">📝 Đăng Ký Mới</button>
                    </div>
                    <div class="auth-form">
                        <input type="text" id="auth-username" class="auth-input" placeholder="Tên tài khoản (3-20 ký tự)" maxlength="20" autocomplete="username" />
                        <input type="password" id="auth-password" class="auth-input" placeholder="Mật khẩu (tối thiểu 4 ký tự)" maxlength="32" autocomplete="current-password" />
                        <div class="auth-error" id="auth-error-msg" style="display: none;"></div>
                        <button class="auth-submit-btn" id="btn-auth-submit">🚀 VÀO HỒ CÂU NGAY</button>
                    </div>
                    <div class="auth-hint">🎁 Tài khoản mới nhận ngay <b>1.000.000đ</b>, Cần Vô Danh 3.6m & Cần Trúc 5.4m!</div>
                </div>
            </div>

            <!-- MÀN HÌNH THANH LOADING VÀO GAME (0% -> 100%) -->
            <div class="game-loading-overlay" id="game-loading-overlay" style="display: none;">
                <div class="loading-box">
                    <div class="loading-title">🎣 ĐANG VÀO HỒ CÂU ĐÀI 3D...</div>
                    <div class="loading-user-tag" id="loading-user-tag">👤 Cần thủ: ...</div>
                    <div class="loading-bar-track">
                        <div class="loading-bar-fill" id="loading-bar-fill" style="width: 0%;"></div>
                    </div>
                    <div class="loading-meta-row">
                        <span id="loading-status-txt">Đang kết nối máy chủ hồ câu...</span>
                        <b id="loading-percent-txt">0%</b>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(this.uiRoot);
    }

    bindEvents() {
        // Hướng dẫn xoay ngang điện thoại khi người chơi cầm dọc trên mobile
        this._rotateDismissed = false;
        const checkMobileRotate = () => {
            const ov = document.getElementById('mobile-rotate-overlay');
            if (!ov) return;
            const isMobilePortrait = window.innerHeight > window.innerWidth && window.innerWidth <= 900;
            if (!isMobilePortrait) {
                this._rotateDismissed = false; // Reset khi đã xoay ngang
                ov.style.display = 'none';
            } else if (!this._rotateDismissed) {
                ov.style.display = 'flex';
            }
        };
        const btnDismissRotate = document.getElementById('btn-dismiss-rotate');
        if (btnDismissRotate) {
            btnDismissRotate.onclick = () => {
                this._rotateDismissed = true;
                const ov = document.getElementById('mobile-rotate-overlay');
                if (ov) ov.style.display = 'none';
            };
        }
        window.addEventListener('resize', checkMobileRotate);
        window.addEventListener('orientationchange', checkMobileRotate);
        checkMobileRotate();

        // Toggle ẩn hiện bảng phím tắt
        const btnToggleKeys = document.getElementById('btn-toggle-keys');
        const keyGuideContent = document.getElementById('key-guide-content');
        btnToggleKeys.onclick = () => {
            if (keyGuideContent.style.display === 'none') {
                keyGuideContent.style.display = 'flex';
                btnToggleKeys.innerText = '_';
            } else {
                keyGuideContent.style.display = 'none';
                btnToggleKeys.innerText = '+';
            }
        };

        // Nút MỞ CỔNG CỬA HỒ (06:00 Sáng)
        const btnOpenGate = document.getElementById('btn-open-gate-now');
        if (btnOpenGate) {
            btnOpenGate.onclick = () => {
                this.openLakeGateAndStartRush();
            };
        }

        // Nút TĂNG TỐC ĐỘ THỜI GIAN HỒ CÂU (1x -> 5x -> 15x -> 30x)
        const btnTimeSpeed = document.getElementById('btn-time-speed');
        if (btnTimeSpeed) {
            btnTimeSpeed.onclick = () => {
                if (!this.lakeOps) return;
                soundManager.playClick();
                const speeds = [1, 5, 15, 30];
                const curIdx = speeds.indexOf(this.lakeOps.speed);
                this.lakeOps.speed = speeds[(curIdx + 1) % speeds.length];
                btnTimeSpeed.innerText = `⏩ Giờ: ${this.lakeOps.speed}x`;
                this.showPrompt(`⏩ Tốc độ trôi thời gian hồ câu: ${this.lakeOps.speed}x (Để trải nghiệm nhanh các ca câu 5h/10h/15h & đóng mở hồ)`);
            };
        }

        // Nút BẬT/TẮT CỤM PHÍM CẢM ỨNG DI ĐỘNG (MOBILE VIRTUAL CONTROLS)
        const btnToggleTouch = document.getElementById('btn-toggle-touch');
        const mobileControls = document.getElementById('mobile-controls');
        if (btnToggleTouch && mobileControls) {
            btnToggleTouch.onclick = () => {
                soundManager.playClick();
                if (mobileControls.style.display === 'flex') {
                    mobileControls.style.display = 'none';
                    btnToggleTouch.innerText = '📱 Di Động (Tắt)';
                } else {
                    mobileControls.style.display = 'flex';
                    btnToggleTouch.innerText = '📱 Di Động (Bật)';
                }
            };
        }

        // Virtual D-Pad cho di động
        const bindTouchMove = (btnId, keyProp) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            const start = (e) => {
                e.preventDefault();
                this.player.keys[keyProp] = true;
            };
            const end = (e) => {
                e.preventDefault();
                this.player.keys[keyProp] = false;
            };
            btn.addEventListener('mousedown', start);
            btn.addEventListener('mouseup', end);
            btn.addEventListener('mouseleave', end);
            btn.addEventListener('touchstart', start, { passive: false });
            btn.addEventListener('touchend', end, { passive: false });
        };
        bindTouchMove('btn-m-up', 'forward');
        bindTouchMove('btn-m-down', 'backward');
        bindTouchMove('btn-m-left', 'left');
        bindTouchMove('btn-m-right', 'right');

        // Nút Giật cần Mobile
        const btnMStrike = document.getElementById('btn-m-strike');
        if (btnMStrike) {
            btnMStrike.onclick = (e) => {
                e.preventDefault();
                const res = this.gameplay.strikeRod();
                this.showPrompt(res.message);
            };
        }

        // Nút Vung cần Mobile
        const btnMCast = document.getElementById('btn-m-cast');
        if (btnMCast) {
            btnMCast.onclick = (e) => {
                e.preventDefault();
                if (this.gameplay.state === 'SEATED' || this.gameplay.state === 'LANDED') {
                    this.handleAttemptCast();
                } else if (this.gameplay.state === 'CASTING' || this.gameplay.state === 'FLOAT_WAIT' || this.gameplay.state === 'BITING') {
                    this.gameplay.retrieveRod();
                    this.showPrompt('Đã thu cần về!');
                }
            };
        }

        // Nút Xả mồi Mobile
        const btnMGround = document.getElementById('btn-m-ground');
        if (btnMGround) {
            btnMGround.onclick = (e) => {
                e.preventDefault();
                const res = this.gameplay.castGroundBait();
                this.showPrompt(res.message);
                if (res.needMix) this.openMixModal();
            };
        }

        // Nút Đứng/Ngồi Mobile
        const btnMStand = document.getElementById('btn-m-stand');
        if (btnMStand) {
            btnMStand.onclick = (e) => {
                e.preventDefault();
                if (this.gameplay.state === 'SEATED' || this.gameplay.state === 'FLOAT_WAIT' || this.gameplay.state === 'CASTING') {
                    this.gameplay.standUp();
                    this.player.setSeated(false);
                    this.showPrompt('🚶 Đã đứng dậy! Đi dạo quanh hồ tìm tăm cá.');
                } else if (this.gameplay.state === 'ROAM') {
                    const nearestInfo = this.player.getNearestFishingSpot();
                    if (nearestInfo && nearestInfo.canSit) {
                        this.sitAtSpot(nearestInfo.spot);
                    } else if (this.player.isNearWaterBank()) {
                        this.sitAtCustomBankPosition(this.player.position);
                    } else {
                        this.showPrompt('⚠️ Hãy lại gần mép nước hoặc bến gỗ để ngồi câu!');
                    }
                }
            };
        }

        // Nút Zoom Mobile
        const btnMZoom = document.getElementById('btn-m-zoom');
        if (btnMZoom) {
            btnMZoom.onclick = (e) => {
                e.preventDefault();
                this.player.toggleZoom();
            };
        }

        // Đóng Modal Thu Vé
        const btnCloseTicket = document.getElementById('btn-close-ticket');
        if (btnCloseTicket) {
            btnCloseTicket.onclick = () => {
                document.getElementById('modal-ticket').style.display = 'none';
                if (this.lakeOps) this.lakeOps.declineTicket();
            };
        }

        // Đóng Modal Hết Ca Câu
        const btnCloseShift = document.getElementById('btn-close-shift-modal');
        if (btnCloseShift) {
            btnCloseShift.onclick = () => {
                document.getElementById('modal-shift-end').style.display = 'none';
            };
        }

        // Nút VÀO BẾN CÂU ĐẸP NHẤT
        document.getElementById('btn-quick-sit').onclick = () => {
            soundManager.playClick();
            if (this.environment.fishingSpots.length > 0) {
                this.sitAtSpot(this.environment.fishingSpots[0]);
            }
        };

        // Nút CHỌN BẾN CÂU
        document.getElementById('btn-select-spot').onclick = () => this.openSpotsModal();
        document.getElementById('btn-close-spots').onclick = () => this.closeSpotsModal();

        // Nút ĐỔI THỜI TIẾT & MÀU NƯỚC (Nắng: Nước Trong Xanh <-> Mưa: Nước Đục Phù Sa)
        const btnWeather = document.getElementById('btn-toggle-weather');
        if (btnWeather) {
            btnWeather.onclick = () => this.toggleWeather();
        }

        // Nút ĐỔI NỀN BÊ TÔNG / THẢM NHỰA ASPHALT HỒ CÂU VIỆT NAM
        const btnGround = document.getElementById('btn-toggle-ground');
        if (btnGround) {
            btnGround.onclick = () => this.togglePavement();
        }

        // Bấm xem chi tiết Tình Trạng Ca Câu & Nguy Cơ Móm
        const condBadge = document.getElementById('ui-lake-condition');
        if (condBadge) {
            condBadge.onclick = () => {
                if (this.bubbleSystem && this.bubbleSystem.getDailyConditionInfo) {
                    const cond = this.bubbleSystem.getDailyConditionInfo();
                    this.showPrompt(`${cond.name}: ${cond.desc}\n💡 ${cond.tip}`, 6500);
                }
            };
        }

        // Nút ngồi bến gần nhất
        document.getElementById('btn-sit-near-act').onclick = () => {
            const nearestInfo = this.player.getNearestFishingSpot();
            if (nearestInfo && nearestInfo.spot) {
                this.sitAtSpot(nearestInfo.spot);
            }
        };

        // Nút thao tác câu đài
        document.getElementById('btn-act-cast').onclick = () => {
            soundManager.playClick();
            if (this.gameplay.state === 'SEATED' || this.gameplay.state === 'LANDED') {
                this.handleAttemptCast();
            } else if (this.gameplay.state === 'CASTING' || this.gameplay.state === 'FLOAT_WAIT' || this.gameplay.state === 'BITING') {
                this.gameplay.retrieveRod();
                this.showPrompt('Đã thu cần về!');
            }
        };

        document.getElementById('btn-act-ground').onclick = () => {
            soundManager.playClick();
            const res = this.gameplay.castGroundBait();
            this.showPrompt(res.message);
            if (res.needMix) this.openMixModal();
        };

        document.getElementById('btn-act-zoom').onclick = () => {
            soundManager.playClick();
            this.player.toggleZoom();
        };

        document.getElementById('btn-act-stand').onclick = () => {
            soundManager.playClick();
            this.gameplay.standUp();
            this.player.setSeated(false);
            this.showPrompt('🚶 Đã đứng dậy! Đi dạo dọc đường mòn ven hồ tìm tăm cá.');
        };

        // Nút GIẬT CẦN KHỔNG LỒ
        document.getElementById('btn-strike-act').onclick = () => {
            const res = this.gameplay.strikeRod();
            this.showPrompt(res.message);
        };

        // Modals
        document.getElementById('btn-open-mix').onclick = () => this.openMixModal();
        document.getElementById('btn-close-mix').onclick = () => this.closeMixModal();

        document.getElementById('btn-open-shop').onclick = () => this.openShopModal();
        document.getElementById('btn-close-shop').onclick = () => this.closeShopModal();

        const btnOpenUpgrade = document.getElementById('btn-open-upgrade');
        if (btnOpenUpgrade) btnOpenUpgrade.onclick = () => this.openUpgradeModal();
        const btnCloseUpgrade = document.getElementById('btn-close-upgrade');
        if (btnCloseUpgrade) btnCloseUpgrade.onclick = () => this.closeUpgradeModal();

        // ===== MODAL SET CẦN • CÂN PHAO • TRỤC & THẺO =====
        const btnOpenRig = document.getElementById('btn-open-rig');
        if (btnOpenRig) btnOpenRig.onclick = () => this.openRigModal();
        const btnCloseRig = document.getElementById('btn-close-rig');
        if (btnCloseRig) btnCloseRig.onclick = () => this.closeRigModal();
        const btnConfirmRig = document.getElementById('btn-confirm-rig');
        if (btnConfirmRig) {
            btnConfirmRig.onclick = () => {
                this.saveRigConfig();
                if (this.gameplay && this.gameplay.applyRigSetup) {
                    this.gameplay.applyRigSetup(this.rigConfig);
                }
                const btnRodLen = document.getElementById('btn-act-rodlen');
                if (btnRodLen && this.gameplay) {
                    btnRodLen.innerText = `📏 Tầm: ${this.gameplay.selectedRodLength}m`;
                }
                soundManager.playClick();
                this.closeRigModal();
                const cal = getCalibrationById(this.rigConfig.calibrationId);
                this.showPrompt(`✅ Đã set đồ đài: ${cal.label} • Trục ${this.rigConfig.mainLineSize}.0 / Thẻo ${this.rigConfig.leaderSize}.0!`);
            };
        }

        const selMain = document.getElementById('sel-main-line');
        if (selMain) {
            selMain.onchange = (e) => {
                this.rigConfig.mainLineSize = Number(e.target.value);
                this.saveRigConfig();
                this.renderRigModal();
            };
        }
        const selLeader = document.getElementById('sel-leader-line');
        if (selLeader) {
            selLeader.onchange = (e) => {
                this.rigConfig.leaderSize = Number(e.target.value);
                this.saveRigConfig();
                this.renderRigModal();
            };
        }
        const btnBuyMain = document.getElementById('btn-buy-main-line');
        if (btnBuyMain) {
            btnBuyMain.onclick = () => this.buyMainLinePack(this.rigConfig.mainLineSize);
        }
        const btnBuyLeader = document.getElementById('btn-buy-leader-line');
        if (btnBuyLeader) {
            btnBuyLeader.onclick = () => this.buyLeaderPack(this.rigConfig.leaderSize);
        }

        // Lắng nghe sự kiện ĐỨT THẺO / ĐỨT TRỤC từ FishingGameplay để trừ kho thực tế!
        window.addEventListener('rig_line_broken', (e) => {
            if (!e.detail || !this.rigConfig) return;
            const { breakMainLine, mainLineSize, leaderSize } = e.detail;
            const lStock = this.rigConfig.leaderStock || {};
            const mStock = this.rigConfig.mainLineStock || {};

            lStock[leaderSize] = Math.max(0, (lStock[leaderSize] || 0) - 1);
            let msg = `💥 Đứt mất 1 thẻo ${leaderSize}.0 (Còn ${lStock[leaderSize]} thẻo).`;
            if (breakMainLine) {
                mStock[mainLineSize] = Math.max(0, (mStock[mainLineSize] || 0) - 1);
                msg = `💥 ĐỨT CẢ TRỤC ${mainLineSize}.0 (còn ${mStock[mainLineSize]} bộ) & THẺO ${leaderSize}.0 (còn ${lStock[leaderSize]} thẻo)! Hãy mua lại trong [⚙️ Trục/Phao]!`;
            }
            this.rigConfig.leaderStock = lStock;
            this.rigConfig.mainLineStock = mStock;
            this.saveRigConfig();
            if (this.gameplay && this.gameplay.applyRigSetup) {
                this.gameplay.applyRigSetup(this.rigConfig);
            }
            this.showScenarioToast('🧵 HAO HỤT TRỤC / THẺO', msg, 'WARN');
        });

        // ===== NGĂN KÉO MENU TỔNG HỢP (PC & MOBILE) =====
        const btnToggleMenu = document.getElementById('btn-toggle-main-menu');
        if (btnToggleMenu) btnToggleMenu.onclick = () => this.toggleMainMenu();
        const btnCloseMenu = document.getElementById('btn-close-main-menu');
        if (btnCloseMenu) btnCloseMenu.onclick = () => this.closeMainMenu();
        const menuBackdrop = document.getElementById('main-menu-backdrop');
        if (menuBackdrop) menuBackdrop.onclick = () => this.closeMainMenu();

        const btnMenuUpg = document.getElementById('btn-menu-open-upgrade');
        if (btnMenuUpg) btnMenuUpg.onclick = () => { this.closeMainMenu(); this.openUpgradeModal(); };

        const btnMenuRig = document.getElementById('btn-menu-open-rig');
        if (btnMenuRig) btnMenuRig.onclick = () => { this.closeMainMenu(); this.openRigModal(); };

        const btnOpenWM = document.getElementById('btn-open-world-market');
        if (btnOpenWM) btnOpenWM.onclick = () => { this.closeMainMenu(); this.openWorldMarketModal('gear'); };
        const btnCloseWM = document.getElementById('btn-close-world-market');
        if (btnCloseWM) btnCloseWM.onclick = () => this.closeWorldMarketModal();

        document.querySelectorAll('#wm-tabs .wm-tab[data-tab]').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('#wm-tabs .wm-tab[data-tab]').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.worldMarketTab = tab.getAttribute('data-tab') || 'gear';
                this.renderWorldMarket();
            };
        });
        const btnQuickSell = document.getElementById('btn-wm-quick-sell');
        if (btnQuickSell) btnQuickSell.onclick = () => this.quickSellToWorldMarket();

        const btnCampMarket = document.getElementById('btn-camp-open-market');
        if (btnCampMarket) btnCampMarket.onclick = () => this.openWorldMarketModal('gear');
        const btnCampSkip = document.getElementById('btn-camp-skip-night');
        if (btnCampSkip) {
            btnCampSkip.onclick = () => {
                if (this.lakeOps && this.lakeOps.skipCampRestNow) {
                    this.lakeOps.skipCampRestNow();
                }
            };
        }

        const btnMenuMute = document.getElementById('btn-menu-mute');
        if (btnMenuMute) {
            btnMenuMute.onclick = () => {
                const muted = soundManager.toggleMute();
                btnMenuMute.innerText = muted ? '🔇 Âm Thanh: TẮT' : '🔊 Âm Thanh: BẬT';
                btnMenuMute.classList.toggle('menu-active', muted);
            };
        }

        const btnMenuRecords = document.getElementById('btn-menu-records');
        if (btnMenuRecords) btnMenuRecords.onclick = () => { this.closeMainMenu(); this.openRecordsModal(); };
        const btnCloseRecords = document.getElementById('btn-close-records');
        if (btnCloseRecords) btnCloseRecords.onclick = () => this.closeRecordsModal();

        const btnResetProfile = document.getElementById('btn-reset-profile');
        if (btnResetProfile) {
            btnResetProfile.onclick = () => {
                if (confirm('Bạn chắc chắn muốn xóa toàn bộ tiền, trang bị nâng cấp và kỷ lục để chơi lại từ đầu?')) {
                    try {
                        localStorage.removeItem('vn_carp_profile_v1');
                        localStorage.removeItem('vn_carp_equip_v1');
                        localStorage.removeItem('vn_carp_rig_v1');
                        localStorage.removeItem('vn_carp_owned_lakes_v1');
                    } catch (e) {}
                    window.location.reload();
                }
            };
        }

        const btnRodLen = document.getElementById('btn-act-rodlen');
        if (btnRodLen) {
            btnRodLen.onclick = () => {
                if (!this.gameplay || !this.gameplay.cycleRodLength) return;
                soundManager.playClick();
                const len = this.gameplay.cycleRodLength();
                btnRodLen.innerText = `📏 Tầm: ${len}m`;
                const note = len <= 4.5 ? 'Đánh sát ven bờ (cá đi mép)' : (len >= 6.3 ? 'Đánh xa rãnh sâu (chép củ & trắm đen)' : 'Tầm chuẩn đài cân bằng');
                this.showPrompt(`📏 Đã đổi tầm cần sang ${len}m — ${note}! (Xả ổ F & Vung cần sẽ rơi đúng 1 điểm)`);
            };
        }

        const btnMenuOnline = document.getElementById('btn-menu-toggle-online');
        if (btnMenuOnline) {
            btnMenuOnline.onclick = () => {
                const p = document.getElementById('online-room-panel');
                if (p) {
                    const show = p.style.display === 'none';
                    p.style.display = show ? 'block' : 'none';
                    btnMenuOnline.classList.toggle('menu-active', show);
                }
                this.closeMainMenu();
            };
        }

        const btnMenuMind = document.getElementById('btn-menu-toggle-mind');
        if (btnMenuMind) {
            btnMenuMind.onclick = () => {
                this.showFishMindHud = !this.showFishMindHud;
                btnMenuMind.classList.toggle('menu-active', this.showFishMindHud);
                this.updateFishMindHUD();
                this.closeMainMenu();
            };
        }

        const btnMenuKeys = document.getElementById('btn-menu-toggle-keys');
        if (btnMenuKeys) {
            btnMenuKeys.onclick = () => {
                const p = document.getElementById('right-controls-panel');
                if (p) {
                    const show = p.style.display === 'none';
                    p.style.display = show ? 'block' : 'none';
                    btnMenuKeys.classList.toggle('menu-active', show);
                }
                this.closeMainMenu();
            };
        }

        // Tự động đóng Menu Drawer khi bấm nút mở modal bên trong drawer
        ['btn-quick-sit', 'btn-select-spot', 'btn-open-shop', 'btn-open-net', 'btn-switch-lake'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('click', () => this.closeMainMenu());
            }
        });

        // ===== BẢNG NHÀ PHÁT TRIỂN (DEV FISH AI INSPECTOR) =====
        const btnOpenDev = document.getElementById('btn-open-dev');
        if (btnOpenDev) btnOpenDev.onclick = () => this.toggleDevFishPanel();
        const btnMenuDev = document.getElementById('btn-menu-open-dev');
        if (btnMenuDev) btnMenuDev.onclick = () => { this.closeMainMenu(); this.toggleDevFishPanel(true); };
        const btnCloseDev = document.getElementById('btn-close-dev');
        if (btnCloseDev) btnCloseDev.onclick = () => this.toggleDevFishPanel(false);

        const btnDev3D = document.getElementById('btn-dev-toggle-3dfish');
        if (btnDev3D) {
            btnDev3D.onclick = () => {
                this.devShow3DFish = !this.devShow3DFish;
                if (this.bubbleSystem && this.bubbleSystem.devSetVisible3DFish) {
                    this.bubbleSystem.devSetVisible3DFish(this.devShow3DFish);
                }
                btnDev3D.innerText = this.devShow3DFish ? '👁️ Cá 3D: BẬT' : '👁️ Cá 3D: Tắt';
                btnDev3D.classList.toggle('active', this.devShow3DFish);
            };
        }

        const btnDevPull = document.getElementById('btn-dev-pull-fish');
        if (btnDevPull) {
            btnDevPull.onclick = () => {
                if (this.bubbleSystem && this.bubbleSystem.devPullFishToFloat) {
                    const n = this.bubbleSystem.devPullFishToFloat(4);
                    this.showPrompt(`🐞 [DEV] Đã kéo ${n} con cá gần nhất vào ổ phao!`);
                }
            };
        }

        const btnDevCalm = document.getElementById('btn-dev-calm-fish');
        if (btnDevCalm) {
            btnDevCalm.onclick = () => {
                if (this.bubbleSystem && this.bubbleSystem.devCalmAllFish) {
                    this.bubbleSystem.devCalmAllFish();
                    this.showPrompt('🐞 [DEV] Đã reset độ nhát & trấn an toàn bộ cá trong hồ!');
                }
            };
        }

        const devAddMoneyBtn = document.getElementById('btn-dev-add-money');
        if (devAddMoneyBtn) {
            devAddMoneyBtn.onclick = () => {
                this.playerMoney += 10000000;
                this.updateMoneyUI();
                this.savePlayerProfile();
                this.showPrompt('💰 [DEV] Đã nạp thêm +10.000.000đ vào ví cần thủ!');
            };
        }

        const devCondSelect = document.getElementById('dev-condition-select');
        if (devCondSelect) {
            devCondSelect.onchange = (e) => {
                if (this.bubbleSystem && this.bubbleSystem.setDailyCondition) {
                    this.bubbleSystem.setDailyCondition(e.target.value);
                    this.showPrompt(`🐞 [DEV] Đã đổi điều kiện ca câu thành: ${e.target.options[e.target.selectedIndex].text}`);
                }
            };
        }

        document.querySelectorAll('#dev-filter-tabs .dev-ftab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('#dev-filter-tabs .dev-ftab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.devFilter = tab.getAttribute('data-filter') || 'ALL';
                this.renderDevFishList();
            };
        });

        const devCanvas = document.getElementById('dev-fish-map-canvas');
        if (devCanvas) {
            devCanvas.onclick = (e) => {
                if (!this.bubbleSystem || !this.bubbleSystem.fishSchools) return;
                const rect = devCanvas.getBoundingClientRect();
                const mx = ((e.clientX - rect.left) / rect.width) * devCanvas.width;
                const my = ((e.clientY - rect.top) / rect.height) * devCanvas.height;
                const hw = this.bubbleSystem.lakeHalfW || 80;
                const hd = this.bubbleSystem.lakeHalfD || 20;
                const pad = 14;
                const mapW = devCanvas.width - pad * 2;
                const mapH = devCanvas.height - pad * 2;

                let best = null;
                let bestDist = 18;
                this.bubbleSystem.fishSchools.forEach(f => {
                    const fx = pad + ((f.x + hw) / (hw * 2)) * mapW;
                    const fy = pad + ((f.z + hd) / (hd * 2)) * mapH;
                    const d = Math.hypot(fx - mx, fy - my);
                    if (d < bestDist) {
                        bestDist = d;
                        best = f;
                    }
                });
                this.devSelectedFishId = best ? best.id : null;
                this.renderDevFishList();
            };
        }

        document.getElementById('btn-open-net').onclick = () => this.openNetModal();
        document.getElementById('btn-close-net').onclick = () => this.closeNetModal();

        document.getElementById('btn-switch-lake').onclick = () => this.openLakesModal();
        document.getElementById('btn-close-lakes').onclick = () => this.closeLakesModal();

        document.getElementById('btn-celeb-close').onclick = () => {
            document.getElementById('modal-celebration').style.display = 'none';
            if (this.gameplay.state === 'LANDED' || this.gameplay.state === 'FIGHTING') {
                this.gameplay.state = 'SEATED';
            }
            this.showPrompt('🎣 Đã bỏ cá vào rọng! Bấm [Chuột Trái / Vung Cần Ra Ổ Câu] để tiếp tục buông cần!');
        };

        document.getElementById('btn-sell-all').onclick = () => this.sellAllFish();

        document.getElementById('btn-net-action').onclick = () => {
            const result = this.gameplay.netFish();
            if (result && result.success) {
                this.onFishLanded(result.fish);
            }
        };

        const btnNguLong = document.getElementById('btn-skill-ngulong');
        if (btnNguLong) {
            btnNguLong.onclick = () => {
                const res = this.gameplay.useSkillNguLong();
                if (res && res.message) this.showPrompt(res.message);
            };
        }
        const btnHaNgu = document.getElementById('btn-skill-hangu');
        if (btnHaNgu) {
            btnHaNgu.onclick = () => {
                const res = this.gameplay.useSkillHaNgu();
                if (res && res.message) this.showPrompt(res.message);
            };
        }
        const btnLeash = document.getElementById('btn-skill-leash');
        if (btnLeash) {
            btnLeash.onclick = () => {
                const res = this.gameplay.triggerSafetyLeash();
                if (res && res.message) this.showPrompt(res.message);
            };
        }
        const btnTourn = document.getElementById('btn-open-tournament');
        if (btnTourn) {
            btnTourn.onclick = () => {
                this.closeMainMenu();
                this.openTournamentModal();
            };
        }
        window.addEventListener('rod_section_broken', () => {
            this.saveRigConfig();
            this.showScenarioToast('💥 GÃY LÓNG CẦN!', 'Cần câu quá tải bị gãy lóng (Độ bền 0%)! Mở [⚙️ Trục/Phao] để Thay Lóng Cần (150.000đ)!', 'WARN');
        });

        // Xử lý kéo 360° (Trái / Phải / Lên / Xuống) trên NÚT HÌNH TRÒN GHÌ & BO CÁ gần giữa màn hình
        this._padVisualOffset = { dx: 0, dy: 0, active: false };
        const circlePad = document.getElementById('fight-circle-pad');
        if (circlePad) {
            let activePointerId = null;
            const maxR = 54;

            const updateCircleVector = (clientX, clientY, isInitialTap = false) => {
                const rect = circlePad.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                let dx = clientX - cx;
                let dy = clientY - cy;
                const dist = Math.hypot(dx, dy);

                // Nếu cá đã ngửa bụng 100% và người chơi bấm ngay vào nút tròn -> Hớt cá luôn cho tiện!
                if (isInitialTap && dist < 30 && this.gameplay && this.gameplay.fightPhase === 'TAP_TO_NET') {
                    const netBtn = document.getElementById('btn-net-action');
                    if (netBtn && !netBtn.disabled) {
                        netBtn.click();
                        return;
                    }
                }

                // Nếu mới nhấn giữ ngay đúng tâm tròn (< 10px) -> Mặc định ghì dựng nhẹ lên (y = +0.72), sau đó kéo tay đi đâu bo mượt tới đó!
                if (dist < 10) {
                    this._padVisualOffset = { dx: 0, dy: -18, active: true };
                    if (this.gameplay && this.gameplay.setFightPadInput) {
                        this.gameplay.setFightPadInput(0, 0.72, true);
                    }
                    return;
                }

                if (dist > maxR) {
                    dx = (dx / dist) * maxR;
                    dy = (dy / dist) * maxR;
                }
                this._padVisualOffset = { dx, dy, active: true };
                const normX = Math.max(-1, Math.min(1, dx / maxR));
                const normY = Math.max(-1, Math.min(1, -dy / maxR)); // Kéo lên (dy < 0) => normY > 0 (Ghì lên), Kéo xuống => normY < 0 (Hạ nhả)
                if (this.gameplay && this.gameplay.setFightPadInput) {
                    this.gameplay.setFightPadInput(normX, normY, true);
                }
            };

            const releaseCirclePad = (e) => {
                if (activePointerId !== null && e && e.pointerId !== undefined && e.pointerId !== activePointerId) return;
                activePointerId = null;
                this._padVisualOffset = { dx: 0, dy: 0, active: false };
                if (this.gameplay && this.gameplay.setFightPadInput) {
                    this.gameplay.setFightPadInput(0, 0, false);
                }
            };

            circlePad.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                activePointerId = e.pointerId;
                if (circlePad.setPointerCapture) {
                    try { circlePad.setPointerCapture(e.pointerId); } catch (_) {}
                }
                updateCircleVector(e.clientX, e.clientY, true);
            });
            circlePad.addEventListener('pointermove', (e) => {
                if (activePointerId === null || e.pointerId !== activePointerId) return;
                e.preventDefault();
                updateCircleVector(e.clientX, e.clientY, false);
            });
            circlePad.addEventListener('pointerup', releaseCirclePad);
            circlePad.addEventListener('pointercancel', releaseCirclePad);
            window.addEventListener('blur', () => releaseCirclePad());
        }

        // Lắng nghe sự kiện thời tiết tự động hoặc thủ công thay đổi
        window.addEventListener('weather_changed', (e) => {
            if (e.detail) {
                this.syncWeatherUI(e.detail.weather, e.detail.isAuto);
            }
        });

        // Lắng nghe các Kịch Bản Đời Thực Câu Đài Việt Nam (Cá Đeo Khuyên, Sốc Lườn, Thả Dây Bảo Hiểm, Hàng Xóm Xả Ốc, Rô Con Phá Ổ)
        window.addEventListener('real_life_scenario', (e) => {
            if (!e.detail) return;
            const { title, desc, chatSender, chatText, type } = e.detail;
            this.showScenarioToast(title, desc, type);
            if (chatSender && chatText) {
                this.appendOnlineFeed(`💬 <b>${chatSender}:</b> ${chatText}`, 'CHAT');
            } else if (title) {
                this.appendOnlineFeed(`🔥 <b>${title}</b>`, 'CATCH');
            }
        });

        // Phím nóng
        window.addEventListener('keydown', (e) => {
            if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
            if (e.code === 'KeyT') this.toggleWeather();
            if (e.code === 'KeyP') this.togglePavement();
            if (e.code === 'KeyM') this.toggleModal('modal-mix', () => this.openMixModal());
            if (e.code === 'KeyU') this.toggleModal('modal-upgrade', () => this.openUpgradeModal());
            if (e.code === 'F9') { e.preventDefault(); this.toggleDevFishPanel(); }
            if (e.code === 'KeyB') this.toggleModal('modal-shop', () => this.openShopModal());
            if (e.code === 'KeyR') this.toggleModal('modal-net', () => this.openNetModal());
            if (e.code === 'KeyL') this.toggleModal('modal-lakes', () => this.openLakesModal());
            if (e.code === 'KeyQ' && this.gameplay.state === 'FIGHTING') {
                const res = this.gameplay.useSkillNguLong();
                if (res && res.message) this.showPrompt(res.message);
            }
            if (e.code === 'KeyC' && this.gameplay.state === 'FIGHTING') {
                const res = this.gameplay.useSkillHaNgu();
                if (res && res.message) this.showPrompt(res.message);
            }
            if (e.code === 'Space') {
                if (this.gameplay.state === 'BITING' || this.gameplay.state === 'FLOAT_WAIT') {
                    const strikeBtn = document.getElementById('btn-strike-act');
                    if (strikeBtn) strikeBtn.click();
                } else if (this.gameplay.state === 'FIGHTING') {
                    const btn = document.getElementById('btn-net-action');
                    if (btn && !btn.disabled) btn.click();
                }
            }
            if (e.code === 'Enter') {
                const mixModal = document.getElementById('modal-mix');
                if (mixModal && mixModal.style.display === 'flex') {
                    e.preventDefault();
                    const doMixBtn = document.getElementById('btn-do-mix');
                    if (doMixBtn) doMixBtn.click();
                }
            }
        });

        // Chọn Loại Câu trong Chậu Pha Mồi (Câu Cám / Câu Ốc / Câu Ngô)
        document.querySelectorAll('#mix-mode-tabs .mix-mode-tab').forEach(tab => {
            tab.onclick = () => {
                soundManager.playClick();
                const mode = tab.getAttribute('data-mode') || 'CAM';
                this.mixingSystem.setFishingMode(mode, true);
                // Nếu chuyển sang Câu Ốc hoặc Câu Ngô và đang cân bài không phải tì đáy, gợi ý tự chuyển sang Cân 3 Câu 3 cho tiện
                if ((mode === 'SNAIL' || mode === 'CORN') && this.rigConfig && !isValidSnailCornCalibration(this.rigConfig.calibrationId)) {
                    this.rigConfig.calibrationId = 'can3_cau3';
                    this.saveRigConfig();
                    if (this.gameplay && this.gameplay.applyRigSetup) this.gameplay.applyRigSetup(this.rigConfig);
                }
                const slider = document.getElementById('slider-water');
                if (slider) slider.value = this.mixingSystem.currentMix.waterRatio;
                const wVal = document.getElementById('water-ratio-val');
                if (wVal) wVal.innerText = Number(this.mixingSystem.currentMix.waterRatio).toFixed(2);
                this.renderMixModes();
                this.renderMixBaseBaits();
                this.renderMixFlavors();
                this.renderMixCalibrations();
                this.updateMixAnalysis();
            };
        });

        const btnClearBasin = document.getElementById('btn-clear-basin');
        if (btnClearBasin) {
            btnClearBasin.onclick = () => {
                soundManager.playClick();
                this.mixingSystem.clearBasin();
                this.renderMixBaseBaits();
                this.renderMixFlavors();
                this.renderMixCalibrations();
                this.updateMixAnalysis();
            };
        }

        // Thanh trượt nước
        const waterSlider = document.getElementById('slider-water');
        waterSlider.oninput = (e) => {
            const val = parseFloat(e.target.value);
            document.getElementById('water-ratio-val').innerText = val.toFixed(2);
            this.mixingSystem.setWaterRatio(val);
            this.updateMixAnalysis();
        };

        // Nút Nhào Trộn & Pha Chế toàn bộ đồ trong chậu
        document.getElementById('btn-do-mix').onclick = () => {
            const itemsMap = {};
            this.shopItems.forEach(i => itemsMap[i.id] = i);
            const currentWeather = this.environment ? this.environment.weather : 'SUNNY';
            const res = this.mixingSystem.mixBait(itemsMap, currentWeather, this.playerInventory);
            if (res.success) {
                this.savePlayerProfile();
                this.gameplay.activeHookBait = res.hookBait;
                this.gameplay.activeGroundBait = res.groundBait;
                if (this.gameplay.updateBaitTrayVisuals) this.gameplay.updateBaitTrayVisuals();
                soundManager.playWaterSplash(1.0);
                this.closeMixModal();
                const warnOverdose = res.analysis.isFlavorOverdose
                    ? ' ⚠️ CẢNH BÁO: Đang pha quá liều gây NẶNG MÙI — cá sẽ cày nhiều tăm và dễ đè phao!'
                    : ` ✨ ${res.analysis.ratioBadge}`;
                this.showPrompt(`✅ Đã pha chế [${res.hookBait.name}] (${res.hookBait.charges} viên câu + ${res.groundBait.charges} nắm xả).${warnOverdose} 👉 Bấm F xả ổ trước rồi mới ra cần!`);
            } else {
                this.showScenarioToast('🥣 CHƯA THỂ PHA CHẾ', res.message, 'WARN');
            }
        };

        // 4 BÀI MỒI MẪU CHUẨN TỶ LỆ VÀNG (CÁM / ỐC / NGÔ)
        const applyBasinPreset = (btnId, mode, basinMap, flavorMap, waterRatio) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            btn.onclick = () => {
                soundManager.playClick();
                this.mixingSystem.setFishingMode(mode, false);
                this.mixingSystem.currentMix.basinItems = { ...basinMap };
                this.mixingSystem.currentMix.flavors = { ...flavorMap };
                this.mixingSystem.setWaterRatio(waterRatio);

                if ((mode === 'SNAIL' || mode === 'CORN') && this.rigConfig && !isValidSnailCornCalibration(this.rigConfig.calibrationId)) {
                    this.rigConfig.calibrationId = 'can3_cau3';
                    this.saveRigConfig();
                    if (this.gameplay && this.gameplay.applyRigSetup) this.gameplay.applyRigSetup(this.rigConfig);
                }

                const slider = document.getElementById('slider-water');
                if (slider) slider.value = waterRatio;
                const waterVal = document.getElementById('water-ratio-val');
                if (waterVal) waterVal.innerText = Number(waterRatio).toFixed(2);

                this.renderMixModes();
                this.renderMixBaseBaits();
                this.renderMixFlavors();
                this.renderMixCalibrations();
                this.updateMixAnalysis();
            };
        };

        // 1. Câu Cám Quốc Dân: 1kg Cám Thơm Tanh + 4 giọt Mật Khoai + 3 giọt Sữa Ngô (7 giọt/1kg)
        applyBasinPreset('preset-cam-quocdan', 'CAM', { cam_nen_thom_tanh: 1.0 }, { hl_mat_khoai: 4, hl_sua_ngo: 3 }, 0.8);
        // 2. Câu Cám Đấu Giải: 1kg Cám Nền Thơm + 4 giọt Lục Hương + 3 giọt Tương Sữa Thơm (7 giọt/1kg)
        applyBasinPreset('preset-cam-daugiai', 'CAM', { cam_nen_thom: 1.0 }, { hl_luc_huong: 4, hl_tuong_sua_thom: 3 }, 0.8);
        // 3. Câu Ốc Săn Hàng Chuẩn Tỷ Lệ: 1kg Ốc Bươu + 1kg Cám Thơm Tanh + 8 giọt Rượu Thuốc Bắc (chuẩn 5–10 giọt/1kg cám!)
        applyBasinPreset('preset-oc-thuocbac', 'SNAIL', { oc_buou: 1.0, cam_nen_thom_tanh: 1.0 }, { hl_ruou_thuoc_bac: 8 }, 0.7);
        // 4. Câu Ngô Ngọt Chuẩn Tỷ Lệ: 10 bắp Ngô Ngọt + 8ml Nước Xanh (chuẩn 5–10ml/10 bắp!)
        applyBasinPreset('preset-ngo-nuocxanh', 'CORN', { ngo_ngot: 10 }, { hl_nuoc_xanh: 8 }, 0.65);

        // QUY TRÌNH 4 BƯỚC CÂU ĐÀI (FISHING FLOW BUTTONS)
        const btnFlowTicket = document.getElementById('flow-step-ticket');
        if (btnFlowTicket) {
            btnFlowTicket.onclick = () => {
                if (this.lakeOps) {
                    if (this.lakeOps.hasTicket) {
                        this.showPrompt(`🎫 Bạn đang có vé câu ca ${this.lakeOps.ticket.packageHours} tiếng (còn ${this.lakeOps.formatHours(this.lakeOps.ticket.hoursLeft)}).`);
                    } else {
                        this.lakeOps.requestTicketCollection();
                        this.showPrompt('🎫 Đã gọi nhân viên mang vé ca ra bến!');
                    }
                }
            };
        }

        const btnFlowMix = document.getElementById('flow-step-mix');
        if (btnFlowMix) {
            btnFlowMix.onclick = () => this.openMixModal();
        }

        const btnFlowGround = document.getElementById('flow-step-ground');
        if (btnFlowGround) {
            btnFlowGround.onclick = () => {
                const res = this.gameplay.castGroundBait();
                this.showPrompt(res.message);
                if (res.needMix) this.openMixModal();
            };
        }

        const btnFlowCast = document.getElementById('flow-step-cast');
        if (btnFlowCast) {
            btnFlowCast.onclick = () => this.handleAttemptCast();
        }
    }

    toggleWeather() {
        if (!this.environment) return;
        soundManager.playClick();
        this.environment.toggleWeather();
    }

    togglePavement() {
        if (!this.environment) return;
        soundManager.playClick();
        const info = this.environment.togglePavementMode();
        const btnGround = document.getElementById('btn-toggle-ground');
        if (btnGround) {
            btnGround.innerText = `${info.label} (P)`;
        }
        this.showPrompt(`🛠️ [NỀN HỒ CÂU]: ${info.label}! ${info.desc}`);
    }

    syncWeatherUI(weather, isAuto = false) {
        const btnWeather = document.getElementById('btn-toggle-weather');
        if (weather === 'RAINY') {
            if (btnWeather) {
                btnWeather.innerText = '🌧️ Mưa • Nước Đục (T)';
                btnWeather.className = 'menu-item-btn btn-weather-rainy';
            }
            const prefix = isAuto ? '🌦️ Thời tiết chuyển sang MƯA RÀO!' : '🌧️ Trời đổ mưa rào!';
            this.showPrompt(`${prefix} Nước hồ chuyển ĐỤC PHÙ SA -> Hương liệu ĐẬM (>= 6 giọt) sẽ thu hút cá AI mạnh hơn!`);
        } else if (weather === 'CLOUDY') {
            if (btnWeather) {
                btnWeather.innerText = '⛅ Nhiều Mây • Mát (T)';
                btnWeather.className = 'menu-item-btn btn-weather-rainy';
            }
            const prefix = isAuto ? '⛅ Hôm nay TRỜI NHIỀU MÂY MÁT MẺ!' : '⛅ Trời nhiều mây dịu mát!';
            this.showPrompt(`${prefix} Ánh sáng dịu, cá đi ăn đều — lưu ý canh Giờ Vàng (8–10h & 16–17h) để gặt cá!`);
        } else {
            if (btnWeather) {
                btnWeather.innerText = '☀️ Nắng • Nước Trong (T)';
                btnWeather.className = 'menu-item-btn btn-weather-sunny';
            }
            const prefix = isAuto ? '🌤️ Trời chuyển NẮNG ĐẸP!' : '☀️ Trời hửng nắng đẹp!';
            this.showPrompt(`${prefix} Nước hồ lắng TRONG XANH -> Hương liệu dịu tự nhiên (3-5 giọt) sẽ nhạy cá nhất!`);
        }

        const mixModal = document.getElementById('modal-mix');
        if (mixModal && mixModal.style.display === 'flex') {
            this.updateMixAnalysis();
        }
    }

    startMorningAtGate(isFirst = false) {
        if (this.lakeOps) {
            this.lakeOps.startMorning(isFirst);
        }
    }

    openLakeGateAndStartRush() {
        if (this.lakeOps) {
            this.lakeOps.openGate();
        }
    }

    // Kiểm tra khay mồi trước khi ra cần: chưa pha / hết mồi -> mở thau pha mồi
    ensureBaitReadyForCast() {
        const hb = this.gameplay.activeHookBait;
        if (!hb) {
            this.showPrompt('🥣 Khay mồi đang TRỐNG! Phải pha mồi, chọn độ vê & cân phao trước khi ra cần.');
            this.openMixModal();
            return false;
        }
        if (typeof hb.charges === 'number' && hb.charges <= 0) {
            this.showPrompt('🥣 Hết mồi câu trên khay! Pha mẻ mồi mới (có thể đổi bài theo thời tiết hiện tại).');
            this.openMixModal();
            return false;
        }
        return true;
    }

    handleAttemptCast() {
        // Kiểm tra kho Trục & Thẻo trước khi vung cần
        if (this.gameplay && typeof this.gameplay.hasValidRigToCast === 'function') {
            const rigCheck = this.gameplay.hasValidRigToCast();
            if (!rigCheck.ok) {
                this.showPrompt(rigCheck.message);
                this.openRigModal();
                return;
            }
        }

        if (!this.lakeOps) {
            if (!this.ensureBaitReadyForCast()) return;
            this.gameplay.castRod();
            return;
        }
        if (this.lakeOps.phase === 'GATE_WAIT') {
            this.showPrompt('⛩️ 05:55 Sáng: Cổng hồ chưa mở! Mọi người đang đứng chờ Chủ Hồ mở cổng lúc 06:00.');
            return;
        }
        if (this.lakeOps.phase === 'CLOSED') {
            this.showPrompt('🔒 Hồ đã đóng cửa lúc 21:00! Vui lòng chờ đến 06:00 sáng hôm sau hồ mở cửa lại.');
            return;
        }
        if (!this.lakeOps.hasTicket) {
            if (this.lakeOps.staffOnTheWay) {
                this.showPrompt('🚶 Nhân viên đang đi bộ ra bến thu vé ca... Vui lòng chờ trong giây lát để trả tiền vé rồi tính giờ câu!');
            } else if (this.lakeOps.ticketOfferPending) {
                this.onTicketOffer(this.lakeOps.getTicketPackages());
            } else {
                this.lakeOps.requestTicketCollection();
                this.showPrompt('🎫 Bạn chưa có vé câu! Đã gọi nhân viên mang vé ra bến. Trả tiền vé xong mới được tính giờ buông cần.');
            }
            return;
        }
        if (!this.ensureBaitReadyForCast()) return;
        const noGround = (this.gameplay.groundBaitsCastCount || 0) === 0;
        if (!this.gameplay.castRod()) return;
        const left = this.gameplay.activeHookBait && typeof this.gameplay.activeHookBait.charges === 'number'
            ? ` (Còn ${this.gameplay.activeHookBait.charges} viên)` : '';
        this.showPrompt(noGround
            ? `🎣 Đã bổ cần${left}! ⚠️ Chưa xả mồi tụ ổ — cá sẽ rất lâu mới tìm thấy và cảnh giác cao. Nên bấm F!`
            : `🎣 Đã bổ cần${left}! Quan sát phao: Nằm ngang ➔ Đứng ➔ Chìm mất bầu phao...`);
    }

    sitAtCustomBankPosition(playerPos) {
        if (this.lakeOps && this.lakeOps.phase === 'GATE_WAIT') {
            this.showPrompt('⛩️ Cổng hồ chưa mở! Mọi người đang đứng chờ ở cửa hồ lúc 05:55 sáng.');
            return;
        }
        const spot = {
            id: 'custom_bank_' + Date.now(),
            name: 'Mép Bờ Đất Ven Hồ',
            pos: playerPos.clone(),
            targetLook: new THREE.Vector3(0, 0, 0)
        };
        this.sitAtSpot(spot);
    }

    sitAtSpot(spot) {
        if (this.lakeOps && this.lakeOps.phase === 'GATE_WAIT') {
            this.showPrompt('⛩️ Cổng hồ chưa mở! Hãy chờ chủ hồ mở cửa lúc 06:00 rồi mới chạy chỗ vào bến.');
            return;
        }
        this.player.teleportToSpot(spot);
        this.player.setSeated(true, spot.pos, spot.targetLook);
        this.player.update(0.016);
        this.gameplay.seatAtPosition(spot.pos, this.gameplay.currentLake, spot.name);
        soundManager.playWaterSplash(0.6);

        if (this.lakeOps && !this.lakeOps.hasTicket) {
            this.lakeOps.requestTicketCollection();
            this.showPrompt(`🪑 Đã ngồi vào [${spot.name}]! Nhân viên đang ra bến thu vé ca câu...`);
        } else {
            this.showPrompt(`🪑 Đã ngồi vào [${spot.name}]! Bấm "VUNG CẦN RA Ổ CÂU" để buông cần!`);
        }
    }

    // Callbacks do LakeOperations gọi khi vận hành hồ câu
    onGateWaiting(day, isFirst) {
        const overlay = document.getElementById('gate-rush-overlay');
        const lakeName = this.gameplay.currentLake ? this.gameplay.currentLake.name : 'Hồ Câu';
        const owner = this.gameplay.currentLake && this.gameplay.currentLake.owner ? this.gameplay.currentLake.owner : { name: 'Chủ Hồ', title: 'Chủ Hồ' };
        if (overlay) {
            overlay.style.display = 'flex';
            const titleEl = document.getElementById('gate-rush-title');
            const badgeEl = document.getElementById('gate-rush-badge');
            const descEl = document.getElementById('gate-rush-desc');
            if (titleEl) titleEl.innerText = `Mọi người đang đứng trước cổng ${lakeName} chờ ${owner.name} ra mở cửa!`;
            if (badgeEl) badgeEl.innerText = `⛩️ 05:55 SÁNG (NGÀY ${day}) • CỔNG ${lakeName.toUpperCase()}`;
            if (descEl) descEl.innerText = `Đúng 06:00 sáng, ${owner.name} (${owner.title}) sẽ mở cổng sắt. Ngay khi mở cửa, mọi người sẽ ùa vào chạy chỗ quanh hồ để tìm bến đẹp ngồi câu!`;
        }
        this.showPrompt(`⛩️ 05:55 Sáng: Đang đứng trước cổng ${lakeName} chờ ${owner.name} ra mở cổng lúc 06:00!`);
    }

    onGateOpened(day) {
        const overlay = document.getElementById('gate-rush-overlay');
        if (overlay) overlay.style.display = 'none';
        this.showPrompt(`🔑 06:00 Sáng: Cổng hồ đã mở! Mọi người đang chạy chỗ quanh hồ, hãy tìm bến đẹp ngồi câu ngay!`);
    }

    onStaffComing() {
        this.showScenarioToast('🚶 NHÂN VIÊN HỒ CÂU', 'Nhân viên đang đi bộ ra bến thu vé ca câu... Vui lòng chờ vài giây để trả tiền rồi mới tính giờ buông cần!', 'INFO');
        this.showPrompt('🚶 Nhân viên đang đi bộ ra bến thu vé ca... Vui lòng chờ vài giây!');
    }

    onTicketOffer(packages) {
        document.exitPointerLock();
        soundManager.playClick();
        const modal = document.getElementById('modal-ticket');
        if (!modal) return;
        const walletEl = document.getElementById('ticket-wallet-money');
        if (walletEl) walletEl.innerText = this.playerMoney.toLocaleString();

        const list = document.getElementById('ticket-packages-list');
        if (list) {
            list.innerHTML = '';
            packages.forEach(pkg => {
                const card = document.createElement('div');
                card.className = 'ticket-pkg-card';
                const canAfford = this.playerMoney >= pkg.price;
                card.innerHTML = `
                    <div class="pkg-header">
                        <span class="pkg-name">${pkg.name}</span>
                        <span class="pkg-price">${pkg.price.toLocaleString()} đ</span>
                    </div>
                    <div class="pkg-desc">${pkg.desc}</div>
                    <div class="pkg-time">Thời lượng câu thực tế: <b>${this.lakeOps.formatHours(pkg.effectiveHours)}</b></div>
                    <button class="btn-buy-ticket ${canAfford ? '' : 'btn-disabled'}" id="pkg-btn-${pkg.hours}">
                        ${canAfford ? 'Trả Tiền & Bắt Đầu Tính Giờ' : 'Không Đủ Tiền'}
                    </button>
                `;
                list.appendChild(card);
                const btn = card.querySelector(`#pkg-btn-${pkg.hours}`);
                if (btn && canAfford) {
                    btn.onclick = () => {
                        const res = this.lakeOps.buyTicket(pkg.hours);
                        if (res.success) {
                            modal.style.display = 'none';
                            this.showPrompt(`🎫 Đã thanh toán ${pkg.price.toLocaleString()}đ cho [${pkg.name}]. Nhân viên đã bấm giờ, bắt đầu tính ca!`);
                        } else {
                            alert(res.message);
                        }
                    };
                }
            });
        }
        modal.style.display = 'flex';
    }

    onTicketExpired(reason) {
        document.exitPointerLock();
        const modal = document.getElementById('modal-shift-end');
        if (!modal) return;
        const titleEl = document.getElementById('shift-end-title');
        const descEl = document.getElementById('shift-end-desc');
        const extBtn = document.getElementById('btn-extend-ticket');

        if (reason === 'CLOSED') {
            if (titleEl) titleEl.innerText = '🔒 21:00 • HỒ CÂU ĐÓNG CỬA NGHỈ ĐÊM!';
            if (descEl) descEl.innerText = 'Đã hết 15 tiếng hoạt động trong ngày! Chủ hồ đóng cổng nghỉ đêm. 06:00 sáng mai hồ sẽ mở cửa đón cần thủ trở lại.';
            if (extBtn) extBtn.style.display = 'none';
        } else {
            if (titleEl) titleEl.innerText = '⏰ HẾT GIỜ CA CÂU!';
            if (descEl) descEl.innerText = 'Bạn đã câu hết thời gian ca vừa rồi. Bạn có muốn nối thêm ca để tiếp tục nuôi ổ săn hàng không?';
            if (extBtn) {
                extBtn.style.display = 'inline-block';
                extBtn.onclick = () => {
                    modal.style.display = 'none';
                    this.lakeOps.requestTicketCollection();
                };
            }
        }
        modal.style.display = 'flex';
    }

    onStocking(msg, count) {
        const banner = document.getElementById('stocking-banner');
        if (banner) {
            const textEl = document.getElementById('stocking-banner-text');
            if (textEl) textEl.innerText = msg;
            banner.style.display = 'flex';
            if (this.stockingTimeout) clearTimeout(this.stockingTimeout);
            this.stockingTimeout = setTimeout(() => {
                banner.style.display = 'none';
            }, 7500);
        }
        this.showScenarioToast('🚚 BỒI CÁ ĐỊNH KỲ', msg, 'WARN');
    }

    onLakeClosed(day) {
        const banner = document.getElementById('camp-night-banner');
        if (banner) banner.style.display = 'flex';
        this.showScenarioToast('🏕️ TRUYỀN TỐNG RA LÁN TRẠI ĐÊM', `21:00: Hồ đóng cửa! Mọi người đã tập trung tại Lán Trại nghỉ ngơi 5 phút đến 06:00 sáng mai!`, 'INFO');
    }

    onCampEnded() {
        const banner = document.getElementById('camp-night-banner');
        if (banner) banner.style.display = 'none';
    }

    openSpotsModal() {
        document.exitPointerLock();
        soundManager.playClick();
        document.getElementById('modal-spots').style.display = 'flex';
        this.renderSpotsList();
    }

    closeSpotsModal() {
        document.getElementById('modal-spots').style.display = 'none';
    }

    renderSpotsList() {
        const container = document.getElementById('spots-list-container');
        container.innerHTML = '';

        this.environment.fishingSpots.forEach(spot => {
            const card = document.createElement('div');
            card.className = 'spot-select-card';
            card.innerHTML = `
                <div class="spot-card-icon">🎣</div>
                <div class="spot-card-info">
                    <div class="spot-card-title">${spot.name}</div>
                    <div class="spot-card-desc">${spot.desc}</div>
                </div>
                <button class="btn-warp-spot" id="warp-${spot.id}">Ngồi Bến Này Ngay</button>
            `;
            container.appendChild(card);

            card.querySelector(`#warp-${spot.id}`).onclick = () => {
                this.closeSpotsModal();
                this.sitAtSpot(spot);
            };
        });
    }

    toggleModal(modalId, openFn) {
        const modal = document.getElementById(modalId);
        if (modal.style.display === 'flex') {
            modal.style.display = 'none';
        } else {
            openFn();
        }
    }

    openShopModal() {
        document.exitPointerLock();
        soundManager.playClick();
        document.getElementById('modal-shop').style.display = 'flex';
        this.renderShopTabs();
        this.renderShopItems('all');
    }

    closeShopModal() {
        document.getElementById('modal-shop').style.display = 'none';
    }

    // ==================== XƯỞNG NÂNG CẤP 7 TRANG BỊ CÂU ĐÀI ====================
    loadEquipmentLevels() {
        const defaults = getDefaultEquipmentLevels();
        try {
            const raw = localStorage.getItem('vn_carp_equip_v1');
            if (raw) {
                const parsed = JSON.parse(raw);
                return { ...defaults, ...parsed };
            }
        } catch (e) {}
        return defaults;
    }

    saveEquipmentLevels() {
        try {
            localStorage.setItem('vn_carp_equip_v1', JSON.stringify(this.equipmentLevels));
        } catch (e) {}
    }

    // ==================== QUẢN LÝ BỘ SET CẦN • CÂN PHAO • TRỤC & THẺO ====================
    loadRigConfig() {
        const def = getDefaultRigState();
        try {
            const raw = localStorage.getItem('vn_carp_rig_v1');
            if (raw) {
                const parsed = JSON.parse(raw);
                return {
                    ...def,
                    ...parsed,
                    mainLineStock: { ...def.mainLineStock, ...(parsed.mainLineStock || {}) },
                    leaderStock: { ...def.leaderStock, ...(parsed.leaderStock || {}) }
                };
            }
        } catch (e) {}
        return def;
    }

    saveRigConfig() {
        try {
            localStorage.setItem('vn_carp_rig_v1', JSON.stringify(this.rigConfig));
        } catch (e) {}
    }

    // ==================== CHỢ THẾ GIỚI & KHẾ ƯỚC CHỦ HỒ THU / CHI ====================
    loadOwnedLakes() {
        try {
            const raw = localStorage.getItem('vn_carp_owned_lakes_v1');
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return getDefaultOwnedLakesState();
    }

    saveOwnedLakes() {
        try {
            localStorage.setItem('vn_carp_owned_lakes_v1', JSON.stringify(this.ownedLakes));
        } catch (e) {}
    }

    getServerApiBase() {
        if (typeof window !== 'undefined' && window.location && window.location.port === '3000') {
            return 'http://localhost:8080';
        }
        return '';
    }

    async syncWorldMarketFromServer() {
        try {
            const resp = await fetch(`${this.getServerApiBase()}/api/market`);
            if (!resp.ok) return;
            const data = await resp.json();
            if (data && data.ok && Array.isArray(data.listings)) {
                const srvItems = data.listings.map(x => ({ ...x, fromServer: true }));
                const baseNpc = INITIAL_WORLD_MARKET_LISTINGS.map(x => ({ ...x }));
                this.worldListings = [...srvItems, ...baseNpc];
                const modal = document.getElementById('modal-world-market');
                if (modal && modal.style.display === 'flex') {
                    this.renderWorldMarket();
                }
            }
        } catch (e) {}
    }

    openWorldMarketModal(tab = null) {
        document.exitPointerLock();
        soundManager.playClick();
        if (tab) {
            this.worldMarketTab = tab;
            document.querySelectorAll('#wm-tabs .wm-tab[data-tab]').forEach(t => {
                t.classList.toggle('active', t.getAttribute('data-tab') === tab);
            });
        }
        this.syncWorldMarketFromServer();
        const modal = document.getElementById('modal-world-market');
        if (modal) {
            modal.style.display = 'flex';
            this.renderWorldMarket();
        }
    }

    closeWorldMarketModal() {
        const modal = document.getElementById('modal-world-market');
        if (modal) modal.style.display = 'none';
    }

    updateOwnedLakesEconomy(delta) {
        const ownedIds = Object.keys(this.ownedLakes || {});
        if (ownedIds.length === 0) return;
        this.ownedLakeEconAccum += delta;
        if (this.ownedLakeEconAccum < 8.0) return;
        this.ownedLakeEconAccum = 0;

        ownedIds.forEach(lakeId => {
            const st = this.ownedLakes[lakeId];
            const deed = LAKE_DEEDS.find(d => d.lakeId === lakeId);
            if (!st || !deed) return;
            if (st.stockBoostTimer > 0) st.stockBoostTimer = Math.max(0, st.stockBoostTimer - 8);
            const boostMul = st.stockBoostTimer > 0 ? 1.65 : 1.0;
            const priceFactor = deed.baseTicket / Math.max(150000, st.ticketPrice || deed.baseTicket);
            const activeAnglers = Math.max(2, Math.round(deed.baseAnglersPerHour * boostMul * Math.min(1.3, priceFactor)));
            st.anglersCount = activeAnglers;
            // Doanh thu vé thu được mỗi chu kỳ 8s
            const incomeTick = Math.round((activeAnglers * (st.ticketPrice || deed.baseTicket)) / 24);
            st.vaultMoney = (st.vaultMoney || 0) + incomeTick;
            st.totalIncome = (st.totalIncome || 0) + incomeTick;
        });
        this.saveOwnedLakes();
        const modal = document.getElementById('modal-world-market');
        if (modal && modal.style.display === 'flex' && this.worldMarketTab === 'owner') {
            this.renderWorldMarket();
        }
    }

    quickSellToWorldMarket() {
        // Cho phép người chơi ký gửi bán lại gói mồi dư hoặc cá rọng ngay trên Chợ Thế Giới
        const invKeys = Object.keys(this.playerInventory || {}).filter(k => (this.playerInventory[k] || 0) > 1);
        if (invKeys.length === 0) {
            this.showScenarioToast('📤 CHƯA CÓ ĐỒ DƯ', 'Bạn cần có ít nhất 2 gói cám/hương liệu cùng loại để ký gửi bán bớt trên Chợ Thế Giới!', 'INFO');
            return;
        }
        const key = invKeys[0];
        const shopItem = this.shopItems.find(i => i.id === key);
        const sellPrice = Math.round((shopItem ? shopItem.price : 45000) * 0.85);
        this.playerInventory[key] -= 1;
        this.playerMoney += sellPrice;
        this.updateMoneyUI();
        soundManager.playUpgradeSuccess();
        const itemName = shopItem ? shopItem.name : key;
        const sellerName = (this.network && this.network.localPlayer && this.network.localPlayer.name) ? this.network.localPlayer.name : 'Cần Thủ Online';
        // Đăng tin rao thật lên Server Chợ Thế Giới Online (lưu JSON + đồng bộ mọi người chơi!)
        fetch(`${this.getServerApiBase()}/api/market/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tab: 'bait',
                type: 'BAIT_PACK',
                baitItemId: key,
                name: `${itemName} (Ký gửi Online)`,
                seller: sellerName,
                price: Math.round(sellPrice * 1.15),
                icon: shopItem ? (shopItem.icon || '🥣') : '🥣',
                desc: `Hàng ký gửi thật từ cần thủ ${sellerName} trên Chợ Thế Giới Online.`
            })
        }).then(() => this.syncWorldMarketFromServer()).catch(() => {});

        this.showScenarioToast('📤 KÝ GỬI ONLINE THÀNH CÔNG!', `Đã bán [${itemName}] lên Chợ Thế Giới Online thu về +${sellPrice.toLocaleString()}đ!`, 'GOLD');
        if (this.network) {
            this.network.emitUIEvent({
                type: 'SYSTEM',
                text: `🌐 [CHỢ THẾ GIỚI] ${sellerName} vừa đăng bán [${itemName}] giá ${sellPrice.toLocaleString()}đ!`
            });
        }
        this.renderWorldMarket();
    }

    buyWorldListing(listingId) {
        const idx = this.worldListings.findIndex(x => x.id === listingId);
        if (idx === -1) return;
        const item = this.worldListings[idx];
        if (this.playerMoney < item.price) {
            this.showScenarioToast('💰 THIẾU TIỀN', `Cần ${item.price.toLocaleString()}đ để mua [${item.name}]!`, 'WARN');
            return;
        }
        this.playerMoney -= item.price;

        if (item.fromServer) {
            fetch(`${this.getServerApiBase()}/api/market/buy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: item.id })
            }).then(() => this.syncWorldMarketFromServer()).catch(() => {});
            this.worldListings.splice(idx, 1);
            const targetBaitId = item.baitItemId || 'cam_nen_thom_tanh';
            this.playerInventory[targetBaitId] = Number(((this.playerInventory[targetBaitId] || 0) + 1).toFixed(2));
        } else if (item.rewardType === 'UPGRADE_LEVEL') {
            const cur = this.equipmentLevels[item.equipKey] || 1;
            if (item.targetLevel > cur) {
                this.equipmentLevels[item.equipKey] = item.targetLevel;
                this.saveEquipmentLevels();
                if (item.equipKey === 'rod') {
                    this.rigConfig.selectedRodId = 'upgraded_rod';
                    this.saveRigConfig();
                }
                if (this.gameplay && this.gameplay.applyEquipmentUpgrades) {
                    this.gameplay.applyEquipmentUpgrades(this.equipmentLevels);
                }
            }
            this.worldListings.splice(idx, 1); // Hàng ký gửi duy nhất -> mua xong gỡ khỏi chợ
        } else if (item.rewardType === 'BAIT_PACK' && item.items) {
            Object.entries(item.items).forEach(([k, qty]) => {
                this.playerInventory[k] = (this.playerInventory[k] || 0) + qty;
            });
        } else if (item.rewardType === 'RIG_PACK') {
            this.rigConfig.mainLineStock[item.mainLineSize] = (this.rigConfig.mainLineStock[item.mainLineSize] || 0) + item.mainLineQty;
            this.rigConfig.leaderStock[item.leaderSize] = (this.rigConfig.leaderStock[item.leaderSize] || 0) + item.leaderQty;
            this.saveRigConfig();
        }

        this.updateMoneyUI();
        soundManager.playUpgradeSuccess();
        this.renderWorldMarket();
        this.showScenarioToast('🌐 MUA THÀNH CÔNG!', `Đã chốt đơn [${item.name}] từ ${item.seller}!`, 'GOLD');
    }

    buyLakeDeed(lakeId) {
        const deed = LAKE_DEEDS.find(d => d.lakeId === lakeId);
        if (!deed || this.ownedLakes[lakeId]) return;
        if (this.playerMoney < deed.price) {
            this.showScenarioToast('💰 CHƯA ĐỦ VỐN', `Cần ${deed.price.toLocaleString()}đ để mua Khế Ước [${deed.lakeName}]!`, 'WARN');
            return;
        }
        this.playerMoney -= deed.price;
        this.ownedLakes[lakeId] = {
            ticketPrice: deed.baseTicket,
            vaultMoney: 0,
            totalIncome: 0,
            totalExpense: deed.price,
            anglersCount: deed.baseAnglersPerHour,
            stockBoostTimer: 0
        };
        this.saveOwnedLakes();
        this.updateMoneyUI();
        soundManager.playCatchFanfare();
        this.worldMarketTab = 'owner';
        this.openWorldMarketModal('owner');
        this.showScenarioToast('👑 CHÚC MỪNG TÂN CHỦ HỒ!', `Bạn đã chính thức sở hữu Khế Ước [${deed.lakeName}]! Bắt đầu thu vé & quản lý thu chi ngay!`, 'GOLD');
        if (this.network) {
            this.network.emitUIEvent({
                type: 'SYSTEM',
                text: `👑 [CHẤN ĐỘNG HỒ ĐÀI] ${this.network.localPlayer?.name || 'Cần thủ'} vừa chi ${deed.price.toLocaleString()}đ MUA LẠI KHẾ ƯỚC [${deed.lakeName}] làm Chủ Hồ mới!`
            });
        }
    }

    renderWorldMarket() {
        const body = document.getElementById('wm-body-container');
        if (!body) return;
        const wEl = document.getElementById('wm-wallet-val');
        const oEl = document.getElementById('wm-owned-count');
        const ownedCount = Object.keys(this.ownedLakes || {}).length;
        if (wEl) wEl.innerText = this.playerMoney.toLocaleString();
        if (oEl) oEl.innerHTML = `👑 Đang làm chủ: <b>${ownedCount}</b> hồ câu`;

        if (this.worldMarketTab === 'gear' || this.worldMarketTab === 'bait') {
            const list = this.worldListings.filter(x => x.tab === this.worldMarketTab);
            body.innerHTML = `<div class="wm-grid">${list.map(item => `
                <div class="wm-card">
                    <div class="wm-card-top">
                        <span class="wm-ico">${item.icon}</span>
                        <div>
                            <div class="wm-name">${item.name}</div>
                            <div class="wm-seller">👤 ${item.seller} • <span class="wm-cond">${item.condition}</span></div>
                        </div>
                    </div>
                    <div class="wm-desc">${item.desc}</div>
                    <div class="wm-foot">
                        <span class="wm-price">${item.price.toLocaleString()} đ</span>
                        <button class="btn-wm-buy" data-id="${item.id}">🛒 Mua Ngay</button>
                    </div>
                </div>
            `).join('') || '<div class="dev-empty">Chợ hiện đã hết hàng mục này!</div>'}</div>`;

            body.querySelectorAll('.btn-wm-buy').forEach(btn => {
                btn.onclick = () => this.buyWorldListing(btn.getAttribute('data-id'));
            });
        } else if (this.worldMarketTab === 'deeds') {
            body.innerHTML = `<div class="wm-grid">${LAKE_DEEDS.map(d => {
                const owned = !!this.ownedLakes[d.lakeId];
                return `
                    <div class="wm-card ${owned ? 'wm-card-owned' : ''}">
                        <div class="wm-card-top">
                            <span class="wm-ico">📜</span>
                            <div>
                                <div class="wm-name">Khế Ước: ${d.lakeName}</div>
                                <div class="wm-seller">🎫 Vé chuẩn: ${d.baseTicket.toLocaleString()}đ/5h • 👥 ~${d.baseAnglersPerHour} khách/h</div>
                            </div>
                        </div>
                        <div class="wm-desc">${d.desc}</div>
                        <div class="wm-foot">
                            <span class="wm-price">${d.price.toLocaleString()} đ</span>
                            ${owned
                                ? '<span class="wm-owned-badge">👑 ĐÃ SỞ HỮU</span>'
                                : `<button class="btn-wm-buy btn-buy-deed" data-lake="${d.lakeId}">📜 Mua Khế Ước</button>`}
                        </div>
                    </div>
                `;
            }).join('')}</div>`;

            body.querySelectorAll('.btn-buy-deed').forEach(btn => {
                btn.onclick = () => this.buyLakeDeed(btn.getAttribute('data-lake'));
            });
        } else if (this.worldMarketTab === 'owner') {
            const ownedIds = Object.keys(this.ownedLakes || {});
            if (ownedIds.length === 0) {
                body.innerHTML = '<div class="dev-empty">Bạn chưa sở hữu hồ câu nào! Hãy sang tab <b>📜 Khế Ước Chủ Hồ</b> để mua lại hồ và bắt đầu thu vé làm chủ hồ!</div>';
                return;
            }
            body.innerHTML = `<div class="wm-owner-list">${ownedIds.map(lakeId => {
                const st = this.ownedLakes[lakeId];
                const deed = LAKE_DEEDS.find(d => d.lakeId === lakeId);
                if (!deed || !st) return '';
                const netProfit = (st.totalIncome || 0) - (st.totalExpense || 0);
                return `
                    <div class="wm-owner-card">
                        <div class="wm-owner-head">
                            <b>👑 ${deed.lakeName}</b>
                            <span>👥 Đang câu: <b>${st.anglersCount || deed.baseAnglersPerHour}</b> cần thủ ${st.stockBoostTimer > 0 ? '🔥(Đang Bồi Cá +65%)' : ''}</span>
                        </div>
                        <div class="wm-owner-stats">
                            <span>📈 Tổng Thu: <b style="color:#4ade80">+${(st.totalIncome || 0).toLocaleString()}đ</b></span>
                            <span>📉 Tổng Chi: <b style="color:#f87171">-${(st.totalExpense || 0).toLocaleString()}đ</b></span>
                            <span>🏦 Két Lãi Chờ Rút: <b style="color:#fde047">${(st.vaultMoney || 0).toLocaleString()}đ</b></span>
                            <span>📊 Lãi Ròng: <b>${netProfit.toLocaleString()}đ</b></span>
                        </div>
                        <div class="wm-owner-actions">
                            <button class="btn-own-act btn-own-withdraw" data-lake="${lakeId}">💰 Rút Két (+${(st.vaultMoney || 0).toLocaleString()}đ)</button>
                            <button class="btn-own-act btn-own-stock" data-lake="${lakeId}">🚚 Bồi Cá (-${(deed.stockCost / 1000).toFixed(0)}k)</button>
                            <button class="btn-own-act btn-own-rung" data-lake="${lakeId}">🔔 Hô RUNG (-300k)</button>
                            <select class="own-price-sel" data-lake="${lakeId}">
                                ${[250000, 300000, 350000, 500000].map(p => `<option value="${p}" ${st.ticketPrice === p ? 'selected' : ''}>Vé ${p / 1000}k/5h</option>`).join('')}
                            </select>
                        </div>
                    </div>
                `;
            }).join('')}</div>`;

            body.querySelectorAll('.btn-own-withdraw').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.getAttribute('data-lake');
                    const st = this.ownedLakes[id];
                    if (!st || (st.vaultMoney || 0) <= 0) return;
                    const amt = st.vaultMoney;
                    st.vaultMoney = 0;
                    this.playerMoney += amt;
                    this.saveOwnedLakes();
                    this.updateMoneyUI();
                    soundManager.playCatchFanfare();
                    this.renderWorldMarket();
                    this.showScenarioToast('💰 RÚT LÃI CHỦ HỒ', `Đã rút +${amt.toLocaleString()}đ tiền vé từ két hồ về ví!`, 'GOLD');
                };
            });

            body.querySelectorAll('.btn-own-stock').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.getAttribute('data-lake');
                    const deed = LAKE_DEEDS.find(d => d.lakeId === id);
                    const st = this.ownedLakes[id];
                    if (!deed || !st) return;
                    if (this.playerMoney < deed.stockCost) {
                        this.showScenarioToast('💰 THIẾU TIỀN', `Cần ${deed.stockCost.toLocaleString()}đ để nhập xe cá bồi!`, 'WARN');
                        return;
                    }
                    this.playerMoney -= deed.stockCost;
                    st.totalExpense = (st.totalExpense || 0) + deed.stockCost;
                    st.stockBoostTimer = 180;
                    this.saveOwnedLakes();
                    this.updateMoneyUI();
                    if (this.lakeOps && this.gameplay.currentLake && this.gameplay.currentLake.id === id) {
                        this.lakeOps.doStocking();
                    } else {
                        soundManager.playCatchFanfare();
                    }
                    this.renderWorldMarket();
                    this.showScenarioToast('🚚 ĐÃ BỒI CÁ MỚI!', `Khách kéo tới [${deed.lakeName}] đông nghịt (+65% doanh thu vé)!`, 'GOLD');
                };
            });

            body.querySelectorAll('.btn-own-rung').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.getAttribute('data-lake');
                    const st = this.ownedLakes[id];
                    if (!st || this.playerMoney < 300000) {
                        this.showScenarioToast('💰 THIẾU TIỀN', 'Cần 300.000đ quỹ thưởng để Chủ Hồ hô RUNG!', 'WARN');
                        return;
                    }
                    this.playerMoney -= 300000;
                    st.totalExpense = (st.totalExpense || 0) + 300000;
                    st.stockBoostTimer = Math.max(st.stockBoostTimer || 0, 90);
                    this.saveOwnedLakes();
                    this.updateMoneyUI();
                    if (this.lakeOps && this.lakeOps.triggerOwnerRung) {
                        this.lakeOps.triggerOwnerRung();
                    }
                    this.closeWorldMarketModal();
                };
            });

            body.querySelectorAll('.own-price-sel').forEach(sel => {
                sel.onchange = (e) => {
                    const id = sel.getAttribute('data-lake');
                    if (this.ownedLakes[id]) {
                        this.ownedLakes[id].ticketPrice = Number(e.target.value);
                        this.saveOwnedLakes();
                        this.renderWorldMarket();
                    }
                };
            });
        }
    }

    openRigModal() {
        document.exitPointerLock();
        soundManager.playClick();
        const modal = document.getElementById('modal-rig-setup');
        if (modal) {
            modal.style.display = 'flex';
            this.renderRigModal();
        }
    }

    closeRigModal() {
        const modal = document.getElementById('modal-rig-setup');
        if (modal) modal.style.display = 'none';
    }

    buyMainLinePack(sizeNum) {
        if (this.playerMoney < MAIN_LINE_PACK_PRICE) {
            this.showScenarioToast('💰 THIẾU TIỀN', `Cần ${MAIN_LINE_PACK_PRICE.toLocaleString()}đ để mua 1 bộ Trục ${sizeNum}.0!`, 'WARN');
            return;
        }
        this.playerMoney -= MAIN_LINE_PACK_PRICE;
        this.rigConfig.mainLineStock[sizeNum] = (this.rigConfig.mainLineStock[sizeNum] || 0) + 1;
        this.saveRigConfig();
        this.updateMoneyUI();
        soundManager.playUpgradeSuccess();
        this.renderRigModal();
        this.showPrompt(`🛒 Đã mua 1 bộ Trục ${sizeNum}.0 (${MAIN_LINE_PACK_PRICE.toLocaleString()}đ)!`);
    }

    buyLeaderPack(sizeNum) {
        if (this.playerMoney < LEADER_PACK_PRICE) {
            this.showScenarioToast('💰 THIẾU TIỀN', `Cần ${LEADER_PACK_PRICE.toLocaleString()}đ để mua 1 bộ 10 Thẻo ${sizeNum}.0!`, 'WARN');
            return;
        }
        this.playerMoney -= LEADER_PACK_PRICE;
        this.rigConfig.leaderStock[sizeNum] = (this.rigConfig.leaderStock[sizeNum] || 0) + LEADER_PACK_COUNT;
        this.saveRigConfig();
        this.updateMoneyUI();
        soundManager.playUpgradeSuccess();
        this.renderRigModal();
        this.showPrompt(`🛒 Đã mua 1 bộ ${LEADER_PACK_COUNT} Thẻo ${sizeNum}.0 (${LEADER_PACK_PRICE.toLocaleString()}đ)!`);
    }

    renderRigModal() {
        const rodsEl = document.getElementById('rig-rods-grid');
        const calibsEl = document.getElementById('rig-calibs-grid');
        const calibDescEl = document.getElementById('rig-calib-desc');
        const selMain = document.getElementById('sel-main-line');
        const selLeader = document.getElementById('sel-leader-line');
        if (!rodsEl || !calibsEl || !selMain || !selLeader) return;

        // 1. Render danh sách Cần (2 cần khởi đầu + Cần nâng cấp nếu đã nâng cấp > Lv.1)
        const rodOptions = [...STARTER_RODS];
        const upgRodLvl = (this.equipmentLevels && this.equipmentLevels.rod) || 1;
        if (upgRodLvl > 1) {
            const upgTier = getEquippedTier('rod', upgRodLvl);
            if (upgTier) {
                rodOptions.push({
                    id: 'upgraded_rod',
                    name: `🏆 ${upgTier.name}`,
                    length: upgLvlToLen(upgRodLvl),
                    hardness: upgTier.tierTag,
                    maxFishWeight: upgTier.maxSafeWeight,
                    rodColor: upgTier.rodColor,
                    accentColor: upgTier.accentColor,
                    secondaryAccent: upgTier.secondaryAccent,
                    gripColor: upgTier.gripColor,
                    desc: upgTier.desc
                });
            }
        }
        function upgLvlToLen(lv) { return lv >= 6 ? 7.2 : lv >= 4 ? 6.3 : 5.4; }

        rodsEl.innerHTML = rodOptions.map(r => {
            const active = this.rigConfig.selectedRodId === r.id;
            return `
                <button class="rig-rod-card ${active ? 'active' : ''}" data-rod-id="${r.id}">
                    <div class="rig-rod-svg-wrap">${renderRodModelSVG(r, 178, 48)}</div>
                    <div class="rig-rod-name">${r.name}</div>
                    <div class="rig-rod-stats">📏 Dài ${r.length}m • 💪 Tải cá tối đa: <b>${r.maxFishWeight}kg</b></div>
                </button>
            `;
        }).join('');
        rodsEl.querySelectorAll('.rig-rod-card').forEach(btn => {
            btn.onclick = () => {
                soundManager.playClick();
                this.rigConfig.selectedRodId = btn.getAttribute('data-rod-id');
                this.saveRigConfig();
                if (this.gameplay && this.gameplay.applyRigSetup) this.gameplay.applyRigSetup(this.rigConfig);
                this.renderRigModal();
            };
        });

        // 2. Render 11 kiểu Cân Phao
        calibsEl.innerHTML = FLOAT_CALIBRATIONS.map(c => {
            const active = this.rigConfig.calibrationId === c.id;
            return `<button class="rig-calib-btn ${active ? 'active' : ''}" data-calib-id="${c.id}">${c.label}</button>`;
        }).join('');
        calibsEl.querySelectorAll('.rig-calib-btn').forEach(btn => {
            btn.onclick = () => {
                soundManager.playClick();
                this.rigConfig.calibrationId = btn.getAttribute('data-calib-id');
                this.saveRigConfig();
                if (this.gameplay && this.gameplay.applyRigSetup) this.gameplay.applyRigSetup(this.rigConfig);
                this.renderRigModal();
            };
        });
        const curCalib = getCalibrationById(this.rigConfig.calibrationId);
        if (calibDescEl && curCalib) {
            calibDescEl.innerText = `💡 ${curCalib.label}: ${curCalib.desc}`;
        }

        const tankPreviewEl = document.getElementById('rig-water-tank-preview');
        if (tankPreviewEl && curCalib) {
            const fltLvl = (this.equipmentLevels && this.equipmentLevels.float) || 1;
            const curFloatTier = getEquippedTier('float', fltLvl) || {};
            tankPreviewEl.innerHTML = renderRigWaterTankSVG(curCalib, this.rigConfig, curFloatTier);
        }

        // 3. Render Dropdown Trục & Thẻo (1.0 -> 10.0) + Thông số tải tĩnh/tải cá + Tồn kho
        const optsHtml = LINE_SIZES.map(ls =>
            `<option value="${ls.size}">Số ${ls.label} (Tải tĩnh ${ls.staticLoadKg}kg • Tải cá ${ls.maxFishKg}kg)</option>`
        ).join('');
        selMain.innerHTML = optsHtml;
        selLeader.innerHTML = optsHtml;
        selMain.value = String(this.rigConfig.mainLineSize || 2);
        selLeader.value = String(this.rigConfig.leaderSize || 1);

        const mSpec = getLineSpec(this.rigConfig.mainLineSize);
        const lSpec = getLineSpec(this.rigConfig.leaderSize);
        const mStock = (this.rigConfig.mainLineStock && this.rigConfig.mainLineStock[mSpec.size]) || 0;
        const lStock = (this.rigConfig.leaderStock && this.rigConfig.leaderStock[lSpec.size]) || 0;

        const mainSvgEl = document.getElementById('spool-main-svg');
        const leadSvgEl = document.getElementById('spool-leader-svg');
        if (mainSvgEl) mainSvgEl.innerHTML = renderLineSpoolSVG({ label: mSpec.label, lineColor: 0xfacc15 }, false, 64, 64);
        if (leadSvgEl) leadSvgEl.innerHTML = renderLineSpoolSVG({ label: lSpec.label, lineColor: 0x38bdf8 }, true, 64, 64);

        document.getElementById('spec-main-line').innerHTML = `Tải tĩnh: <b>${mSpec.staticLoadKg}kg</b> • Tải cá tối đa: <b>${mSpec.maxFishKg}kg</b>`;
        document.getElementById('spec-leader-line').innerHTML = `Tải tĩnh: <b>${lSpec.staticLoadKg}kg</b> • Tải cá tối đa: <b>${lSpec.maxFishKg}kg</b>`;
        document.getElementById('stock-main-line').innerHTML = `Kho hiện có: <b style="color:${mStock > 0 ? '#4ade80' : '#f87171'}">${mStock} bộ</b>`;
        document.getElementById('stock-leader-line').innerHTML = `Kho hiện có: <b style="color:${lStock > 0 ? '#4ade80' : '#f87171'}">${lStock} thẻo</b>`;

        const warnEl = document.getElementById('rig-warning-box');
        if (warnEl) {
            if (mStock <= 0 || lStock <= 0) {
                warnEl.style.display = 'block';
                warnEl.innerText = '🚨 Bạn đang HẾT TRỤC hoặc HẾT THẺO số này! Hãy bấm nút Mua ở trên (hoặc đổi sang số còn hàng) trước khi ra cần!';
            } else if (lSpec.size >= mSpec.size) {
                warnEl.style.display = 'block';
                warnEl.innerText = `⚠️ Lưu ý dân đài: Thẻo (${lSpec.label}) đang lớn hơn hoặc bằng Trục (${mSpec.label}) — khi cá kéo quá tải có thể ĐỨT LUÔN BỘ TRỤC! Khuyên chọn Trục > Thẻo.`;
            } else {
                warnEl.style.display = 'none';
            }
        }

        const curRod = rodOptions.find(r => r.id === this.rigConfig.selectedRodId) || rodOptions[0];
        const weakest = Math.min(curRod.maxFishWeight, mSpec.maxFishKg, lSpec.maxFishKg);
        const dur = typeof this.rigConfig.rodDurability === 'number' ? Math.round(this.rigConfig.rodDurability) : 100;
        const durColor = dur <= 20 ? '#f87171' : (dur <= 55 ? '#fbbf24' : '#4ade80');
        const sumEl = document.getElementById('rig-summary-txt');
        if (sumEl) {
            sumEl.innerHTML = `Bộ hiện tại: <b>${curRod.name}</b> • Độ bền: <b style="color:${durColor}">${dur}%</b> ${dur < 100 ? '<button id="btn-repair-rod" style="margin-left:6px;padding:3px 8px;border-radius:6px;border:1px solid #f59e0b;background:rgba(245,158,11,0.22);color:#fde047;font-size:11px;font-weight:700;cursor:pointer;">🔧 Thay Lóng (150k)</button>' : ''} • <b>${curCalib.shortTag}</b> • Tải an toàn: <b style="color:#fde047">${weakest}kg</b>`;
            const repBtn = document.getElementById('btn-repair-rod');
            if (repBtn) {
                repBtn.onclick = () => {
                    if (this.playerMoney < 150000) {
                        this.showPrompt('💰 Cần 150.000đ để thay lóng cần!');
                        return;
                    }
                    this.playerMoney -= 150000;
                    this.rigConfig.rodDurability = 100;
                    this.saveRigConfig();
                    this.updateMoneyUI();
                    soundManager.playUpgradeSuccess();
                    this.renderRigModal();
                    this.showPrompt('🔧 Đã thay lóng cần mới — Độ bền phục hồi 100%!');
                };
            }
        }
    }

    // ==================== GIẢI ĐẤU CÂU ĐÀI 5 PHÚT (TOURNAMENT) ====================
    openTournamentModal() {
        document.exitPointerLock();
        soundManager.playClick();
        let modal = document.getElementById('modal-tournament');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-tournament';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width:520px;padding:18px;">
                    <div class="modal-header">
                        <h2>🏆 GIẢI ĐẤU CÂU ĐÀI GIAO LƯU (5 PHÚT)</h2>
                        <button class="btn-close" id="btn-close-tourn">&times;</button>
                    </div>
                    <div id="tourn-body" style="padding:10px 4px;font-size:13px;color:#e2e8f0;"></div>
                </div>
            `;
            document.getElementById('ui-layer').appendChild(modal);
            modal.querySelector('#btn-close-tourn').onclick = () => { modal.style.display = 'none'; };
        }
        modal.style.display = 'flex';
        this.renderTournamentModal();
    }

    startTournament() {
        if (this.tournament.active) return;
        if (this.playerMoney < this.tournament.entryFee) {
            this.showPrompt(`💰 Cần ${this.tournament.entryFee.toLocaleString()}đ góp quỹ tham gia giải!`);
            return;
        }
        this.playerMoney -= this.tournament.entryFee;
        this.updateMoneyUI();
        const myName = (this.network && this.network.localPlayer && this.network.localPlayer.name) ? this.network.localPlayer.name : 'Bạn (Cần Thủ)';
        this.tournament = {
            active: true,
            timeLeft: 300, // 5 phút thi đấu tranh tổng cân
            entryFee: 200000,
            prizePool: 2500000,
            tickAccum: 0,
            entries: [
                { id: 'LOCAL', name: `⭐ ${myName}`, kg: 0, count: 0 },
                { id: 'ai1', name: 'Bảo Chép Củ', kg: 0, count: 0 },
                { id: 'ai2', name: 'Hoàng Đài Thủ 6H', kg: 0, count: 0 },
                { id: 'ai3', name: 'Tuấn Cú Gấu', kg: 0, count: 0 },
                { id: 'ai4', name: 'Sơn Trắm Đen', kg: 0, count: 0 }
            ]
        };
        soundManager.playCatchFanfare();
        this.showScenarioToast('🏆 GIẢI ĐẤU 5 PHÚT BẮT ĐẦU!', 'Quỹ thưởng 2.500.000đ (Top 1: 1.5Tr • Top 2: 700k • Top 3: 300k)! Hãy kéo thật nhiều cân trong 5 phút!', 'GOLD');
        this.renderTournamentModal();
    }

    updateTournament(delta) {
        if (!this.tournament || !this.tournament.active) return;
        this.tournament.timeLeft = Math.max(0, this.tournament.timeLeft - delta);
        this.tournament.tickAccum += delta;
        if (this.tournament.tickAccum >= 18.0) {
            this.tournament.tickAccum = 0;
            // Mô phỏng đối thủ lên cá tự nhiên trong giải
            const aiList = this.tournament.entries.filter(e => e.id !== 'LOCAL');
            const pick = aiList[Math.floor(Math.random() * aiList.length)];
            if (pick && Math.random() < 0.65) {
                const w = Number((2.2 + Math.random() * 6.5).toFixed(1));
                pick.kg = Number((pick.kg + w).toFixed(1));
                pick.count += 1;
            }
            const modal = document.getElementById('modal-tournament');
            if (modal && modal.style.display === 'flex') this.renderTournamentModal();
        }
        if (this.tournament.timeLeft <= 0) {
            this.tournament.active = false;
            const sorted = [...this.tournament.entries].sort((a, b) => b.kg - a.kg);
            const myRank = sorted.findIndex(e => e.id === 'LOCAL') + 1;
            const prizes = { 1: 1500000, 2: 700000, 3: 300000 };
            const won = prizes[myRank] || 0;
            if (won > 0) {
                this.playerMoney += won;
                this.updateMoneyUI();
                soundManager.playCatchFanfare();
            }
            this.showScenarioToast(
                `🏆 KẾT THÚC GIẢI ĐẤU — HẠNG #${myRank}!`,
                won > 0
                    ? `Chúc mừng! Bạn đạt Top ${myRank} và ẵm trọn giải thưởng +${won.toLocaleString()}đ tiền tươi!`
                    : `Hết 5 phút thi đấu! Bạn xếp hạng #${myRank} — Top 1 thuộc về ${sorted[0].name} (${sorted[0].kg}kg).`,
                won > 0 ? 'GOLD' : 'INFO'
            );
            this.renderTournamentModal();
        }
    }

    renderTournamentModal() {
        const body = document.getElementById('tourn-body');
        if (!body) return;
        const t = this.tournament;
        if (!t.active && t.entries.length === 0) {
            body.innerHTML = `
                <p style="line-height:1.5;margin-bottom:12px;">
                    Tranh tài <b>Tổng Cân Nặng</b> trong <b>5 phút</b> cùng các cần thủ trong hồ!<br/>
                    • Phí góp quỹ: <b style="color:#fde047">200.000đ</b><br/>
                    • Tổng quỹ thưởng: <b style="color:#4ade80">2.500.000đ</b> (🥇 1.500k • 🥈 700k • 🥉 300k)
                </p>
                <button id="btn-start-tourn-now" style="width:100%;padding:11px;border-radius:10px;border:1px solid #f59e0b;background:linear-gradient(135deg,#f59e0b,#d97706);color:#111827;font-weight:800;font-size:14px;cursor:pointer;">🔥 ĐĂNG KÝ & BẮT ĐẦU GIẢI NGAY (200K)</button>
            `;
            const btn = document.getElementById('btn-start-tourn-now');
            if (btn) btn.onclick = () => this.startTournament();
            return;
        }
        const mm = Math.floor(t.timeLeft / 60);
        const ss = Math.floor(t.timeLeft % 60);
        const sorted = [...t.entries].sort((a, b) => b.kg - a.kg);
        body.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(15,23,42,0.75);padding:8px 12px;border-radius:8px;margin-bottom:10px;">
                <span>${t.active ? '⏱️ Thời gian còn lại:' : '🏁 Trạng thái:'}</span>
                <b style="color:#fde047;font-size:16px;">${t.active ? `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : 'ĐÃ KẾT THÚC'}</b>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
                ${sorted.map((e, i) => `
                    <div style="display:flex;justify-content:space-between;padding:7px 10px;border-radius:8px;background:${e.id === 'LOCAL' ? 'rgba(56,189,248,0.22)' : 'rgba(30,41,59,0.65)'};border:1px solid ${e.id === 'LOCAL' ? '#38bdf8' : 'rgba(148,163,184,0.2)'};">
                        <span><b>#${i + 1}</b> ${e.name}</span>
                        <span><b>${e.kg.toFixed(1)} kg</b> (${e.count} con)</span>
                    </div>
                `).join('')}
            </div>
            ${!t.active ? '<button id="btn-restart-tourn" style="width:100%;padding:10px;border-radius:10px;border:1px solid #f59e0b;background:linear-gradient(135deg,#f59e0b,#d97706);color:#111827;font-weight:800;cursor:pointer;">🔥 THI ĐẤU GIẢI MỚI (200K)</button>' : '<div style="font-size:11.5px;color:#94a3b8;text-align:center;">Đóng bảng này để tiếp tục kéo cá — cân nặng sẽ tự động cộng vào BXH giải!</div>'}
        `;
        const reBtn = document.getElementById('btn-restart-tourn');
        if (reBtn) reBtn.onclick = () => this.startTournament();
    }

    openUpgradeModal() {
        document.exitPointerLock();
        soundManager.playClick();
        const modal = document.getElementById('modal-upgrade');
        if (modal) {
            modal.style.display = 'flex';
            this.renderUpgradeModal();
        }
    }

    closeUpgradeModal() {
        const modal = document.getElementById('modal-upgrade');
        if (modal) modal.style.display = 'none';
    }

    renderUpgradeModal() {
        const container = document.getElementById('upgrade-items-container');
        if (!container) return;
        container.innerHTML = '';

        const bonuses = computeEquipmentBonuses(this.equipmentLevels);
        const totalLevel = Object.values(this.equipmentLevels).reduce((a, b) => a + b, 0);
        const maxLevel = EQUIPMENT_CATEGORIES.reduce((sum, c) => sum + c.tiers.length, 0);

        const moneyEl = document.getElementById('upg-money-val');
        const totalEl = document.getElementById('upg-total-lvl');
        const combatEl = document.getElementById('upg-combat-stat');
        const bonusEl = document.getElementById('upg-bonus-stat');

        if (moneyEl) moneyEl.innerText = this.playerMoney.toLocaleString();
        if (totalEl) totalEl.innerText = `${totalLevel} / ${maxLevel}`;
        if (combatEl) combatEl.innerText = `-${Math.round(bonuses.tensionReduce * 100)}% căng / -${Math.round(bonuses.snapResistance * 100)}% đứt`;
        if (bonusEl) bonusEl.innerText = `+${Math.round(bonuses.rewardBonus * 100)}% tiền cá / ${Math.round(bonuses.weatherShield * 100)}% chắn gió`;

        EQUIPMENT_CATEGORIES.forEach(cat => {
            const curLvl = this.equipmentLevels[cat.key] || 1;
            const curTier = getEquippedTier(cat.key, curLvl);
            const nextTier = curLvl < cat.tiers.length ? cat.tiers[curLvl] : null;

            const card = document.createElement('div');
            const isMax = curLvl >= cat.tiers.length;
            const visualRank = isMax ? 4 : Math.min(3, Math.ceil((curLvl / cat.tiers.length) * 3));
            card.className = `upgrade-card upg-tier-${visualRank}`;

            const pipsHtml = cat.tiers.map(t => `
                <span class="upg-pip ${t.level <= curLvl ? 'filled' : ''}" title="Lv.${t.level}: ${t.name}"></span>
            `).join('');

            const nextSectionHtml = nextTier ? `
                <div class="upg-next-box">
                    <div class="upg-next-label">⬆️ Cấp tiếp theo (Lv.${nextTier.level} • ${nextTier.tierTag}):</div>
                    <div class="upg-next-name">${nextTier.name}</div>
                    <div class="upg-next-desc">${nextTier.desc}</div>
                </div>
                <button class="btn-do-upgrade ${this.playerMoney >= nextTier.price ? '' : 'btn-upg-locked'}" data-key="${cat.key}">
                    ${this.playerMoney >= nextTier.price
                        ? `⬆️ NÂNG CẤP NGAY (${nextTier.price.toLocaleString()} đ)`
                        : `🔒 THIẾU TIỀN (${nextTier.price.toLocaleString()} đ)`}
                </button>
            ` : `
                <div class="upg-max-box">
                    👑 ĐÃ ĐẠT ĐỈNH HUYỀN THOẠI ĐẤU GIẢI (MAX LV.${cat.tiers.length})
                </div>
            `;

            card.innerHTML = `
                <div class="upg-card-top">
                    <div class="upg-icon">${cat.icon}</div>
                    <div class="upg-title-wrap">
                        <div class="upg-cat-name">${cat.label} <span class="upg-lvl-badge">Lv.${curLvl}/${cat.tiers.length}</span></div>
                        <div class="upg-cat-sub">${cat.subtitle}</div>
                    </div>
                    <span class="upg-rank-tag rank-${visualRank}">${curTier.tierTag}</span>
                </div>
                <div class="upg-pips-row">${pipsHtml}</div>
                <div class="upg-model-showcase">
                    <div class="upg-model-cur">
                        <span class="upg-model-tag">Đang dùng</span>
                        ${renderEquipmentPreviewSVG(cat.key, curTier)}
                    </div>
                    ${nextTier ? `
                    <div class="upg-model-arrow">➔</div>
                    <div class="upg-model-next">
                        <span class="upg-model-tag next">Lv.${nextTier.level}</span>
                        ${renderEquipmentPreviewSVG(cat.key, nextTier)}
                    </div>` : ''}
                </div>
                <div class="upg-current-box">
                    <div class="upg-cur-name">✅ Đang dùng: <b>${curTier.name}</b></div>
                    <div class="upg-cur-desc">${curTier.desc}</div>
                </div>
                ${nextSectionHtml}
            `;

            const btn = card.querySelector('.btn-do-upgrade');
            if (btn) {
                btn.onclick = () => this.upgradeEquipment(cat.key);
            }

            container.appendChild(card);
        });
    }

    upgradeEquipment(categoryKey) {
        const cat = EQUIPMENT_CATEGORIES.find(c => c.key === categoryKey);
        if (!cat) return;
        const curLvl = this.equipmentLevels[categoryKey] || 1;
        if (curLvl >= cat.tiers.length) return;

        const nextTier = cat.tiers[curLvl];
        if (this.playerMoney < nextTier.price) {
            this.showScenarioToast('💰 CHƯA ĐỦ TIỀN', `Cần ${nextTier.price.toLocaleString()}đ để nâng cấp [${nextTier.name}]. Hãy đi câu thêm cá nhé!`, 'WARN');
            return;
        }

        this.playerMoney -= nextTier.price;
        this.equipmentLevels[categoryKey] = nextTier.level;
        this.saveEquipmentLevels();
        this.updateMoneyUI();

        if (this.gameplay && typeof this.gameplay.applyEquipmentUpgrades === 'function') {
            this.gameplay.applyEquipmentUpgrades(this.equipmentLevels);
        }

        soundManager.playUpgradeSuccess();
        this.renderUpgradeModal();
        this.showScenarioToast(
            `✨ NÂNG CẤP THÀNH CÔNG: ${cat.label.toUpperCase()} LV.${nextTier.level}`,
            `Đã trang bị [${nextTier.name}]! Mô hình 3D và chỉ số câu đài đã được cập nhật tức thì!`,
            'GOLD'
        );
        this.showPrompt(`🎒 Đã nâng cấp [${cat.label}] lên Lv.${nextTier.level}: ${nextTier.name}!`);
    }

    renderShopTabs() {
        const tabs = document.querySelectorAll('.shop-tabs .tab-btn');
        tabs.forEach(t => {
            t.onclick = () => {
                tabs.forEach(btn => btn.classList.remove('active'));
                t.classList.add('active');
                this.renderShopItems(t.getAttribute('data-tab'));
            };
        });
    }

    renderShopItems(filter) {
        const container = document.getElementById('shop-items-container');
        container.innerHTML = '';

        const filtered = this.shopItems.filter(item => {
            if (filter === 'all') return true;
            return item.brand === filter;
        });

        filtered.forEach(item => {
            const ownedCount = Number((this.playerInventory[item.id] || 0).toFixed(2));
            const unitTxt = item.unitLabel ? ` ${item.unitLabel}` : (item.category === 'flavor' ? ' chai' : '');
            const isCorn = item.id === 'ngo_ngot';
            const card = document.createElement('div');
            card.className = 'shop-card';
            card.innerHTML = `
                <div class="card-icon shop-svg-icon">${renderShopItemSVG(item)}</div>
                <div class="card-info">
                    <div class="card-title">${item.name}</div>
                    <div class="card-brand">${item.brand} ${item.volume || item.hardness ? '• ' + (item.volume || item.hardness) : ''}</div>
                    <div class="card-desc">${item.description}</div>
                    <div class="card-bottom">
                        <span class="card-price">${item.price.toLocaleString()} đ${item.packSizeLabel ? ' / ' + item.packSizeLabel : ''}</span>
                        <span class="card-owned">Kho: <b>${ownedCount}${unitTxt}</b></span>
                        <div style="display:flex;gap:5px;flex-wrap:wrap;">
                            <button class="btn-buy" id="buy-${item.id}">Mua +1</button>
                            ${isCorn ? `<button class="btn-buy" id="buy10-${item.id}" style="background:linear-gradient(135deg,#d97706,#b45309);">+10 bắp (100k)</button>` : ''}
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(card);

            card.querySelector(`#buy-${item.id}`).onclick = () => {
                if (this.playerMoney >= item.price) {
                    this.playerMoney -= item.price;
                    this.playerInventory[item.id] = Number(((this.playerInventory[item.id] || 0) + 1).toFixed(2));
                    this.updateMoneyUI();
                    soundManager.playClick();
                    this.renderShopItems(filter);
                } else {
                    this.showScenarioToast('💰 THIẾU TIỀN', `Cần ${item.price.toLocaleString()}đ để mua [${item.name}]!`, 'WARN');
                }
            };

            const buy10Btn = card.querySelector(`#buy10-${item.id}`);
            if (buy10Btn) {
                buy10Btn.onclick = () => {
                    const p10 = item.price * 10;
                    if (this.playerMoney >= p10) {
                        this.playerMoney -= p10;
                        this.playerInventory[item.id] = Number(((this.playerInventory[item.id] || 0) + 10).toFixed(2));
                        this.updateMoneyUI();
                        soundManager.playClick();
                        this.renderShopItems(filter);
                        this.showPrompt('🌽 Đã mua +10 bắp Ngô Ngọt (100.000đ) — sẵn sàng pha 5ml–10ml Nước Xanh!');
                    } else {
                        this.showScenarioToast('💰 THIẾU TIỀN', `Cần ${p10.toLocaleString()}đ để mua 10 bắp Ngô Ngọt!`, 'WARN');
                    }
                };
            }
        });
    }

    openMixModal() {
        document.exitPointerLock();
        soundManager.playClick();
        document.getElementById('modal-mix').style.display = 'flex';
        const slider = document.getElementById('slider-water');
        if (slider) slider.value = this.mixingSystem.currentMix.waterRatio || 0.8;
        const wVal = document.getElementById('water-ratio-val');
        if (wVal) wVal.innerText = Number(this.mixingSystem.currentMix.waterRatio || 0.8).toFixed(2);
        this.renderMixModes();
        this.renderMixBaseBaits();
        this.renderMixFlavors();
        this.renderMixCalibrations();
        this.updateMixAnalysis();
        this.bindPrepOptions();
    }

    renderMixModes() {
        const curMode = this.mixingSystem.currentMix.fishingMode || 'CAM';
        document.querySelectorAll('#mix-mode-tabs .mix-mode-tab').forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-mode') === curMode);
        });
        const hintEl = document.getElementById('basin-mode-hint');
        if (hintEl) {
            const m = FISHING_MODES[curMode] || FISHING_MODES.CAM;
            hintEl.innerHTML = `${m.icon} <b>Chế độ ${m.label}:</b> ${m.ruleHint}`;
        }
    }

    // Hiển thị đủ 15 bài Cân Phao ngay trong Chậu Pha Mồi (đồng bộ 2 chiều với bộ Trục/Phao!)
    renderMixCalibrations() {
        const grid = document.getElementById('mix-calib-grid');
        if (!grid) return;
        const mix = this.mixingSystem.currentMix;
        const basin = mix.basinItems || {};
        const isSnailOrCorn = mix.fishingMode === 'SNAIL' || mix.fishingMode === 'CORN' || (basin.oc_van || 0) > 0 || (basin.oc_buou || 0) > 0 || (basin.ngo_ngot || 0) > 0;
        const curCalId = (this.rigConfig && this.rigConfig.calibrationId) ? this.rigConfig.calibrationId : 'can7_cau3';
        const curStyleId = (this.rigConfig && this.rigConfig.fishingStyle) ? this.rigConfig.fishingStyle : 'CAN_DAI';

        // 3A. Hàng chọn Lối Đánh Độc Lập (Câu Cân Đài / Câu Bán Đấu / Câu Hố Đấu giấu thẻo)
        const styleGrid = document.getElementById('mix-style-grid');
        if (styleGrid) {
            styleGrid.innerHTML = FISHING_STYLES.map(st => {
                const active = st.id === curStyleId;
                return `<button class="mix-calib-btn ${active ? 'active' : ''}" data-style-id="${st.id}" title="${st.desc}" style="${active ? '' : `border-color:${st.color}66;`}"><div>${st.label}</div><div style="font-size:9.5px;opacity:0.85;">${st.id === 'CAN_DAI' ? 'Trục thẳng' : (st.id === 'BAN_DAU' ? 'Giấu thẻo 50%' : 'Giấu thẻo 85%')}</div></button>`;
            }).join('');
            styleGrid.querySelectorAll('.mix-calib-btn').forEach(btn => {
                btn.onclick = () => {
                    soundManager.playClick();
                    if (this.rigConfig) {
                        this.rigConfig.fishingStyle = btn.getAttribute('data-style-id');
                        this.saveRigConfig();
                        if (this.gameplay && this.gameplay.applyRigSetup) {
                            this.gameplay.applyRigSetup(this.rigConfig);
                        }
                    }
                    this.renderMixCalibrations();
                };
            });
        }

        // 3A-2. Bảng cấu hình chuyên sâu CÂU HỐ ĐẤU (Phao chân dài, trục xiên: 1.5x / 2x / 2.5x, Không chì / Chì chạy + Sơ đồ SVG trực quan 1:1)
        const hoDauCard = document.getElementById('ho-dau-config-card');
        if (hoDauCard) {
            if (curStyleId === 'HO_DAU') {
                hoDauCard.style.display = 'block';
                const ratio = (this.rigConfig && this.rigConfig.hoDauRatio) ? Number(this.rigConfig.hoDauRatio) : 2.0;
                const leadMode = (this.rigConfig && this.rigConfig.hoDauLead) ? this.rigConfig.hoDauLead : 'NO_LEAD';
                const depthM = 2.7;
                const lineLen = (depthM * ratio).toFixed(1);
                const farM = Math.sqrt(Math.max(0.1, (depthM * ratio) ** 2 - depthM ** 2)).toFixed(1);
                const baitSvgX = ratio <= 1.5 ? 195 : (ratio >= 2.5 ? 285 : 242);
                const modeNote = ratio <= 1.5
                    ? '<b>Nhạy 1,5×:</b> báo nhanh hơn, lọc cá nhỏ ít hơn.'
                    : (ratio >= 2.5
                        ? '<b>Lụt 2,5×:</b> siêu giấu thẻo, lọc mạnh cá con, chuyên trị Chép Lợn & Trắm Đen tinh ranh!'
                        : '<b>Vừa 2×:</b> lọc bớt cá nhỏ, cá to kéo là phao thụt rõ.');
                const leadNote = leadMode === 'NO_LEAD'
                    ? '<b>Không chì:</b> mồi rơi tự nhiên, cá cũ ăn tự tin hơn (+18%); báo chậm hơn chút.'
                    : '<b>Chì chạy:</b> mồi xuống đáy nhanh, chống sóng trôi ổ tốt, báo tín hiệu dứt khoát.';

                hoDauCard.innerHTML = `
                    <div class="hd-top-row">
                        <span class="hd-title">🎯 Câu hố đấu <small>(phao chân dài, trục xiên)</small></span>
                        <div class="hd-stepper">
                            <button class="hd-step-btn" id="hd-ratio-minus">−</button>
                            <span class="hd-ratio-val">${String(ratio).replace('.', ',')} × độ sâu</span>
                            <button class="hd-step-btn" id="hd-ratio-plus">+</button>
                        </div>
                    </div>
                    <div class="hd-pill-row">
                        <button class="hd-pill ${ratio === 1.5 ? 'active' : ''}" data-hd-ratio="1.5">Nhạy 1,5×</button>
                        <button class="hd-pill ${ratio === 2.0 ? 'active' : ''}" data-hd-ratio="2.0">Vừa 2×</button>
                        <button class="hd-pill ${ratio === 2.5 ? 'active' : ''}" data-hd-ratio="2.5">Lụt 2,5×</button>
                        <span style="width:6px;"></span>
                        <button class="hd-pill ${leadMode === 'NO_LEAD' ? 'active' : ''}" data-hd-lead="NO_LEAD">Không chì</button>
                        <button class="hd-pill ${leadMode === 'SLIDING_LEAD' ? 'active' : ''}" data-hd-lead="SLIDING_LEAD">Chì chạy</button>
                    </div>
                    <div class="hd-diagram-wrap">
                        <svg viewBox="0 0 340 102" width="100%" height="96" xmlns="http://www.w3.org/2000/svg">
                            <rect x="0" y="0" width="340" height="22" fill="#93c5fd" fill-opacity="0.75"/>
                            <rect x="0" y="22" width="340" height="62" fill="#0f4c45"/>
                            <rect x="0" y="84" width="340" height="18" fill="#7c5a36"/>
                            <line x1="0" y1="22" x2="340" y2="22" stroke="#bae6fd" stroke-width="1"/>
                            <line x1="56" y1="10" x2="56" y2="56" stroke="#e2e8f0" stroke-width="1.6"/>
                            <rect x="53.5" y="10" width="5" height="4" fill="#ef4444"/>
                            <rect x="53.5" y="14" width="5" height="4" fill="#facc15"/>
                            <rect x="53.5" y="18" width="5" height="4" fill="#22c55e"/>
                            <ellipse cx="56" cy="31" rx="4.5" ry="9" fill="#c2410c" stroke="#fed7aa" stroke-width="0.9"/>
                            <path d="M 56 56 Q ${(56 + baitSvgX) / 2} 76 ${baitSvgX} 83" fill="none" stroke="#e2e8f0" stroke-width="1.6"/>
                            ${leadMode === 'SLIDING_LEAD' ? `<ellipse cx="${Math.round(56 + (baitSvgX - 56) * 0.72)}" cy="79" rx="4" ry="2.2" fill="#94a3b8" stroke="#f8fafc" stroke-width="0.7"/>` : ''}
                            <circle cx="${baitSvgX}" cy="82" r="3.6" fill="#eab308" stroke="#713f12" stroke-width="0.8"/>
                            <circle cx="${baitSvgX + 7}" cy="82" r="3.6" fill="#eab308" stroke="#713f12" stroke-width="0.8"/>
                            <text x="68" y="15" fill="#0f172a" font-size="9.5" font-weight="700">phao đứng 2,2/3 nấc</text>
                            <text x="12" y="79" fill="#e2e8f0" font-size="9.5">sâu ${String(depthM).replace('.', ',')} m</text>
                            <text x="${Math.round(56 + (baitSvgX - 56) * 0.42)}" y="66" fill="#fef08a" font-size="9.5" font-weight="700">${String(ratio).replace('.', ',')} × độ sâu</text>
                            <text x="${Math.max(150, baitSvgX - 28)}" y="97" fill="#fef3c7" font-size="9.5" font-weight="700">mồi xa phao ~${String(farM).replace('.', ',')} m</text>
                        </svg>
                    </div>
                    <div class="hd-desc">
                        Phao cách lưỡi <b>${String(lineLen).replace('.', ',')} m</b> · đáy dưới phao <b>2,7 m</b> · mồi nằm xa phao <b>~${String(farM).replace('.', ',')} m</b> về phía ngoài.<br/>
                        Phao đứng <b>2,2 / 3 nấc</b> (tăm 3 nấc ngắn). Báo cá khi phao thụt hết nấc hoặc chìm hẳn; cá quệt trục hay làm phao thụt giả (50/50).<br/>
                        ${modeNote} ${leadNote}<br/>
                        <span style="color:#94a3b8;">Cái giá: nút buộc chịu lực lớn khi dây đỏ (&gt;82%), dễ nổ thẻo hơn nếu không xả lực / dùng dây bảo hiểm (X).</span>
                    </div>
                `;

                const setRatio = (val) => {
                    const clamped = Math.max(1.5, Math.min(2.5, Math.round(val * 2) / 2));
                    if (this.rigConfig) {
                        this.rigConfig.hoDauRatio = clamped;
                        this.saveRigConfig();
                    }
                    soundManager.playClick();
                    this.renderMixCalibrations();
                };
                const btnM = hoDauCard.querySelector('#hd-ratio-minus');
                const btnP = hoDauCard.querySelector('#hd-ratio-plus');
                if (btnM) btnM.onclick = () => setRatio(ratio - 0.5);
                if (btnP) btnP.onclick = () => setRatio(ratio + 0.5);
                hoDauCard.querySelectorAll('[data-hd-ratio]').forEach(b => {
                    b.onclick = () => setRatio(Number(b.getAttribute('data-hd-ratio')));
                });
                hoDauCard.querySelectorAll('[data-hd-lead]').forEach(b => {
                    b.onclick = () => {
                        if (this.rigConfig) {
                            this.rigConfig.hoDauLead = b.getAttribute('data-hd-lead');
                            this.saveRigConfig();
                        }
                        soundManager.playClick();
                        this.renderMixCalibrations();
                    };
                });
            } else {
                hoDauCard.style.display = 'none';
            }
        }

        // 3B. Lưới 15 bài Cân Phao chuẩn đài
        grid.innerHTML = FLOAT_CALIBRATIONS.map(c => {
            const active = c.id === curCalId;
            const validSC = isValidSnailCornCalibration(c.id);
            const highlightSC = isSnailOrCorn && validSC;
            return `<button class="mix-calib-btn ${active ? 'active' : ''} ${highlightSC ? 'sc-valid' : ''}" data-calib-id="${c.id}" title="${c.desc}">${c.shortTag}${highlightSC ? ' ✓' : ''}</button>`;
        }).join('');

        grid.querySelectorAll('.mix-calib-btn').forEach(btn => {
            btn.onclick = () => {
                soundManager.playClick();
                const cid = btn.getAttribute('data-calib-id');
                if (this.rigConfig) {
                    this.rigConfig.calibrationId = cid;
                    this.saveRigConfig();
                    if (this.gameplay && this.gameplay.applyRigSetup) {
                        this.gameplay.applyRigSetup(this.rigConfig);
                    }
                }
                const calObj = getCalibrationById(cid);
                if (calObj) {
                    const mappedRig = calObj.rigType === 'DULL_BOTTOM' ? 'HEAVY_LEAD' : (calObj.rigType === 'SENSITIVE' ? 'SENSITIVE' : 'STANDARD');
                    this.mixingSystem.setRigStyle(mappedRig);
                }
                this.renderMixCalibrations();
                this.updateMixAnalysis();
            };
        });

        const curCal = getCalibrationById(curCalId);
        const curStyle = getFishingStyleById(curStyleId);
        const prog = (this.bubbleSystem && typeof this.bubbleSystem.sessionProgress === 'number') ? this.bubbleSystem.sessionProgress : 0.1;
        const phaseTip = prog < 0.38
            ? 'Đầu ca (cá mới gần bờ): 🎯 Câu Cân Đài + Cân 7:3 / 5:3 nhạy nhất!'
            : (prog < 0.70
                ? 'Giữa ca (cá giãn ra ngoài): ⚖️ Câu Bán Đấu (giấu thẻo nhẹ) hiệu quả vượt trội!'
                : 'Gần cuối ca (cá giãn xa, nhát dây): ⚓ Câu Hố Đấu (trục xiên 45°, giấu thẻo) cực nhạy — tỷ lệ giã gạo & mất hình phao cao!');
        const statusEl = document.getElementById('mix-calib-status');
        if (statusEl && curCal) {
            if (isSnailOrCorn) {
                if (isValidSnailCornCalibration(curCal.id)) {
                    statusEl.innerHTML = `<span style="color:#4ade80;font-weight:700;">✅ ${curStyle.label} + ${curCal.label}:</span> Chuẩn bài đánh Ốc/Ngô! <br/><span style="color:#94a3b8;">💡 ${phaseTip}</span>`;
                } else {
                    statusEl.innerHTML = `<span style="color:#fbbf24;font-weight:700;">⚠️ ${curCal.label}:</span> Đánh Ốc/Ngô bằng bài cân này sẽ chỉ ra <b>nhịp ảo</b>! Chọn bài có dấu <b>✓</b> (Cân 1 Câu 2–5, Cân 3 Câu 3/5).`;
                }
            } else {
                statusEl.innerHTML = `<span style="color:#7dd3fc;font-weight:700;">${curStyle.label} + ${curCal.label}:</span> ${curStyle.desc}<br/><span style="color:#fde047;">💡 ${phaseTip}</span>`;
            }
        }
    }

    // Nút chọn Độ vê mồi & Kiểu cân phao trong chậu pha mồi
    bindPrepOptions() {
        const mix = this.mixingSystem.currentMix;
        document.querySelectorAll('.btn-prep-opt[data-firm]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.firm === mix.baitFirmness);
            btn.onclick = () => {
                soundManager.playClick();
                this.mixingSystem.setBaitFirmness(btn.dataset.firm);
                document.querySelectorAll('.btn-prep-opt[data-firm]').forEach(b => b.classList.toggle('active', b === btn));
            };
        });
        document.querySelectorAll('.btn-prep-opt[data-rig]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.rig === mix.rigStyle);
            btn.onclick = () => {
                soundManager.playClick();
                this.mixingSystem.setRigStyle(btn.dataset.rig);
                document.querySelectorAll('.btn-prep-opt[data-rig]').forEach(b => b.classList.toggle('active', b === btn));
            };
        });
    }

    closeMixModal() {
        document.getElementById('modal-mix').style.display = 'none';
    }

    // BƯỚC 2A: KỆ NGUYÊN LIỆU NỀN ĐỂ BỎ VÀO CHẬU (Cám 35k/kg • Ngô Ngọt 10k/bắp • Ốc Vặn/Ốc Bươu 20k/kg)
    renderMixBaseBaits() {
        const container = document.getElementById('base-bait-list');
        if (!container) return;
        container.innerHTML = '';

        const mode = this.mixingSystem.currentMix.fishingMode || 'CAM';
        const baseItems = [...this.shopItems.filter(i => i.category === 'base_bait')];

        // Ưu tiên đưa nhóm nguyên liệu chính của Loại Câu đang chọn lên đầu kệ
        const rankItem = (it) => {
            if (mode === 'SNAIL') return it.subType === 'SNAIL' ? 0 : (it.subType === 'CAM' ? 1 : 2);
            if (mode === 'CORN') return it.subType === 'CORN' ? 0 : (it.subType === 'CAM' ? 1 : 2);
            return it.subType === 'CAM' ? 0 : 1;
        };
        baseItems.sort((a, b) => rankItem(a) - rankItem(b));

        baseItems.forEach(item => {
            const stock = Number((this.playerInventory[item.id] || 0).toFixed(2));
            const inBasin = this.mixingSystem.getBasinItemAmount(item.id);
            const isCorn = item.subType === 'CORN';
            const step = isCorn ? 1 : 0.5;
            const fastStep = isCorn ? 5 : 1;
            const unit = item.unitLabel || 'kg';
            const buyQty = isCorn ? 10 : 2;
            const buyCost = item.price * buyQty;

            const isPrimaryForMode =
                (mode === 'CAM' && item.subType === 'CAM') ||
                (mode === 'SNAIL' && (item.subType === 'SNAIL' || item.subType === 'CAM')) ||
                (mode === 'CORN' && item.subType === 'CORN');

            const row = document.createElement('div');
            row.className = `basin-ing-row ${inBasin > 0 ? 'in-basin' : ''} ${isPrimaryForMode ? 'mode-match' : 'mode-dim'}`;
            row.innerHTML = `
                <div class="ing-row-left">
                    <span class="ing-ico">${item.icon}</span>
                    <div class="ing-meta">
                        <div class="ing-title">
                            <b>${item.name}</b>
                            <span class="ing-price-tag">${item.volume || ''}</span>
                        </div>
                        <div class="ing-stock">
                            Kho: <b style="color:${stock >= inBasin && stock > 0 ? '#7dd3fc' : '#f87171'}">${stock} ${unit}</b>
                            ${inBasin > stock ? `<span style="color:#fbbf24;font-weight:700;"> (Thiếu ${Number((inBasin - stock).toFixed(2))} ${unit})</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="ing-row-controls">
                    <button class="btn-ing-step btn-minus" ${inBasin <= 0 ? 'disabled' : ''} title="Bớt khỏi chậu">−</button>
                    <span class="ing-basin-val">${inBasin > 0 ? `<b>${inBasin}</b> ${unit}` : '0'}</span>
                    <button class="btn-ing-step btn-plus" title="Bỏ thêm ${step}${unit} vào chậu">+${step}${isCorn ? '' : 'kg'}</button>
                    <button class="btn-ing-step btn-plus-fast" title="Bỏ nhanh +${fastStep} ${unit} vào chậu">+${fastStep}${isCorn ? '🌽' : 'kg'}</button>
                    <button class="btn-quick-buy-base" title="Mua thêm ${buyQty} ${unit} ${item.name} (${buyCost.toLocaleString()}đ)">🛒+${buyQty}${isCorn ? '' : 'kg'} (${Math.round(buyCost / 1000)}k)</button>
                </div>
            `;

            row.querySelector('.btn-minus').onclick = () => {
                soundManager.playClick();
                this.mixingSystem.setBasinItemAmount(item.id, Math.max(0, inBasin - step), step);
                this.renderMixBaseBaits();
                this.renderMixCalibrations();
                this.updateMixAnalysis();
            };
            row.querySelector('.btn-plus').onclick = () => {
                soundManager.playClick();
                this.mixingSystem.setBasinItemAmount(item.id, inBasin + step, step);
                this.renderMixBaseBaits();
                this.renderMixCalibrations();
                this.updateMixAnalysis();
            };
            row.querySelector('.btn-plus-fast').onclick = () => {
                soundManager.playClick();
                this.mixingSystem.setBasinItemAmount(item.id, inBasin + fastStep, step);
                this.renderMixBaseBaits();
                this.renderMixCalibrations();
                this.updateMixAnalysis();
            };
            row.querySelector('.btn-quick-buy-base').onclick = () => {
                if (this.playerMoney < buyCost) {
                    this.showScenarioToast('💰 THIẾU TIỀN', `Cần ${buyCost.toLocaleString()}đ để mua +${buyQty} ${unit} [${item.name}]!`, 'WARN');
                    return;
                }
                this.playerMoney -= buyCost;
                this.playerInventory[item.id] = Number(((this.playerInventory[item.id] || 0) + buyQty).toFixed(2));
                this.updateMoneyUI();
                soundManager.playClick();
                if (inBasin <= 0) {
                    this.mixingSystem.setBasinItemAmount(item.id, isCorn ? 10 : 1.0, step);
                }
                this.renderMixBaseBaits();
                this.renderMixCalibrations();
                this.updateMixAnalysis();
                this.showPrompt(`🛒 Đã mua nhanh +${buyQty} ${unit} [${item.name}] (${buyCost.toLocaleString()}đ)!`);
            };

            container.appendChild(row);
        });
    }

    // BƯỚC 2B: KỆ HƯƠNG LIỆU NHỎ VÀO CHẬU (Giọt cho Cám & Rượu Thuốc Bắc • ml cho Nước Xanh)
    renderMixFlavors() {
        const container = document.getElementById('flavor-select-list');
        if (!container) return;
        container.innerHTML = '';

        const mode = this.mixingSystem.currentMix.fishingMode || 'CAM';
        const flavorItems = [...this.shopItems.filter(i => i.category === 'flavor')];
        flavorItems.sort((a, b) => {
            const aMatch = a.bestFor === mode ? 0 : 1;
            const bMatch = b.bestFor === mode ? 0 : 1;
            return aMatch - bMatch;
        });

        flavorItems.forEach(item => {
            const owned = this.playerInventory[item.id] || 0;
            const currentAmt = this.mixingSystem.currentMix.flavors[item.id] || 0;
            const unit = item.doseUnit || 'giọt';
            const isMatch = item.bestFor === mode;

            const row = document.createElement('div');
            row.className = `flavor-row ${currentAmt > 0 ? 'in-basin' : ''} ${isMatch ? 'flavor-recommended' : ''}`;
            row.innerHTML = `
                <div class="flavor-name">
                    <div>${item.icon} <b>${item.name}</b> ${isMatch ? '<span class="flv-rec-badge">⭐ Khuyên dùng</span>' : ''}</div>
                    <small class="flv-best-note">${item.bestForLabel || item.brand}</small>
                </div>
                <div class="flavor-drops-control">
                    ${owned > 0 ? `
                        <button class="btn-drop minus" ${currentAmt <= 0 ? 'disabled' : ''}>−</button>
                        <span class="drop-num"><b>${currentAmt}</b> ${unit}</span>
                        <button class="btn-drop plus">+1</button>
                        <button class="btn-drop plus5" title="Thêm nhanh 5 ${unit}">+5</button>
                    ` : `
                        <button class="btn-quick-buy-base btn-buy-flavor">🛒 Mua Chai (${Math.round(item.price / 1000)}k)</button>
                    `}
                </div>
            `;

            const minusBtn = row.querySelector('.minus');
            if (minusBtn) {
                minusBtn.onclick = () => {
                    soundManager.playClick();
                    this.mixingSystem.setFlavorDrops(item.id, Math.max(0, currentAmt - 1));
                    this.renderMixFlavors();
                    this.updateMixAnalysis();
                };
            }
            const plusBtn = row.querySelector('.plus');
            if (plusBtn) {
                plusBtn.onclick = () => {
                    soundManager.playClick();
                    this.mixingSystem.setFlavorDrops(item.id, currentAmt + 1);
                    this.renderMixFlavors();
                    this.updateMixAnalysis();
                };
            }
            const plus5Btn = row.querySelector('.plus5');
            if (plus5Btn) {
                plus5Btn.onclick = () => {
                    soundManager.playClick();
                    this.mixingSystem.setFlavorDrops(item.id, currentAmt + 5);
                    this.renderMixFlavors();
                    this.updateMixAnalysis();
                };
            }
            const buyFlvBtn = row.querySelector('.btn-buy-flavor');
            if (buyFlvBtn) {
                buyFlvBtn.onclick = () => {
                    if (this.playerMoney < item.price) {
                        this.showScenarioToast('💰 THIẾU TIỀN', `Cần ${item.price.toLocaleString()}đ để mua chai [${item.name}]!`, 'WARN');
                        return;
                    }
                    this.playerMoney -= item.price;
                    this.playerInventory[item.id] = (this.playerInventory[item.id] || 0) + 1;
                    this.updateMoneyUI();
                    soundManager.playClick();
                    this.mixingSystem.setFlavorDrops(item.id, item.suggestedDrops || 5);
                    this.renderMixFlavors();
                    this.updateMixAnalysis();
                    this.showPrompt(`🛒 Đã mua chai [${item.name}] và nhỏ sẵn ${item.suggestedDrops || 5} ${unit} vào chậu!`);
                };
            }

            container.appendChild(row);
        });
    }

    updateMixAnalysis() {
        const itemsMap = {};
        this.shopItems.forEach(i => itemsMap[i.id] = i);
        const currentWeather = this.environment ? this.environment.weather : 'SUNNY';
        const res = this.mixingSystem.analyzeRecipe(itemsMap, currentWeather);

        // Vẽ trực tiếp Chậu Trộn Mồi 3D SVG + Danh sách Chip các đồ đang nằm trong chậu
        const svgWrap = document.getElementById('mix-basin-svg-wrap');
        if (svgWrap) {
            svgWrap.innerHTML = renderMixingBasinSVG(this.mixingSystem.currentMix, res);
        }

        const chipsWrap = document.getElementById('mix-basin-chips');
        if (chipsWrap) {
            const chips = [];
            (res.basinEntries || []).forEach(({ item, id, qty }) => {
                chips.push(`<span class="basin-chip chip-base" data-rm-base="${id}" title="Bấm để bỏ món này ra khỏi chậu">${item.icon} ${qty}${item.unitLabel || 'kg'} ${item.name} <b>&times;</b></span>`);
            });
            (res.flavorEntries || []).forEach(({ item, id, amt }) => {
                chips.push(`<span class="basin-chip chip-flavor ${res.isFlavorOverdose ? 'chip-overdose' : ''}" data-rm-flv="${id}" title="Bấm để bỏ hương liệu này ra khỏi chậu">${item.icon} ${amt}${item.doseUnit || ' giọt'} ${item.name} <b>&times;</b></span>`);
            });
            chipsWrap.innerHTML = chips.length > 0
                ? chips.join('')
                : '<span class="basin-empty-note">Chưa có nguyên liệu nào trong chậu — Hãy bấm [+0.5kg / +1kg / +5🌽] ở kệ bên dưới!</span>';

            chipsWrap.querySelectorAll('[data-rm-base]').forEach(el => {
                el.onclick = () => {
                    soundManager.playClick();
                    this.mixingSystem.setBasinItemAmount(el.getAttribute('data-rm-base'), 0, 0.5);
                    this.renderMixBaseBaits();
                    this.renderMixCalibrations();
                    this.updateMixAnalysis();
                };
            });
            chipsWrap.querySelectorAll('[data-rm-flv]').forEach(el => {
                el.onclick = () => {
                    soundManager.playClick();
                    this.mixingSystem.setFlavorDrops(el.getAttribute('data-rm-flv'), 0);
                    this.renderMixFlavors();
                    this.updateMixAnalysis();
                };
            });
        }

        const curCal = getCalibrationById((this.rigConfig && this.rigConfig.calibrationId) || 'can7_cau3');
        const curStyle = getFishingStyleById((this.rigConfig && this.rigConfig.fishingStyle) || 'CAN_DAI');
        const footSum = document.getElementById('mix-footer-summary');

        if (!res.valid) {
            const waterStatusEl = document.getElementById('ana-water-status');
            if (waterStatusEl) {
                waterStatusEl.innerText = '⚠️ CHẬU CHƯA ĐỦ NGUYÊN LIỆU CHÍNH';
                waterStatusEl.className = 'water-rule-banner muddy';
            }
            const ruleFeedbackEl = document.getElementById('ana-water-rule-feedback');
            if (ruleFeedbackEl) {
                ruleFeedbackEl.innerText = res.message;
                ruleFeedbackEl.className = 'water-rule-feedback rule-bad';
            }
            if (footSum) {
                footSum.innerHTML = `<span style="color:#fca5a5;">⚠️ ${res.message}</span>`;
            }
            return;
        }

        const waterStatusEl = document.getElementById('ana-water-status');
        if (waterStatusEl) {
            waterStatusEl.innerText = res.waterStatusTag;
            waterStatusEl.className = `water-rule-banner ${res.isFlavorOverdose ? 'overdose-alert' : (res.ratioVerdict === 'OPTIMAL' ? 'optimal-alert' : 'clear')}`;
        }

        const flavorDropsEl = document.getElementById('ana-flavor-drops');
        if (flavorDropsEl) {
            flavorDropsEl.innerText = res.flavorSummary;
        }

        document.getElementById('ana-carp-score').innerText = `${res.totalScore} / 100 ⭐`;
        document.getElementById('ana-big-score').innerText = `${res.bigCarpScore}% (Săn Hàng)`;
        document.getElementById('ana-radius').innerText = `${res.scentRadius} mét`;
        document.getElementById('water-texture-desc').innerText = res.textureStatus;

        const ruleFeedbackEl = document.getElementById('ana-water-rule-feedback');
        if (ruleFeedbackEl) {
            ruleFeedbackEl.innerText = res.waterRuleFeedback || '';
            ruleFeedbackEl.className = `water-rule-feedback ${res.isFlavorOverdose ? 'rule-bad' : (res.ratioVerdict === 'OPTIMAL' ? 'rule-good' : 'rule-neutral')}`;
        }

        const comboDiv = document.getElementById('ana-combos');
        comboDiv.innerHTML = '';
        if (res.detectedCombos.length > 0) {
            res.detectedCombos.forEach(c => {
                const tag = document.createElement('div');
                tag.className = 'combo-tag';
                tag.innerText = c;
                comboDiv.appendChild(tag);
            });
        } else {
            comboDiv.innerHTML = '<span class="text-muted">Mẹo: Ốc pha 5–10 giọt Rượu Thuốc Bắc/1kg cám • Ngô 10 bắp pha 5–10ml Nước Xanh • Cám phối Mật Khoai + Sữa Ngô / Lục Hương!</span>';
        }

        const wRatio = this.mixingSystem.currentMix.waterRatio || 0.8;
        const zoneBadge = document.getElementById('water-zone-badge');
        if (zoneBadge) {
            if (wRatio < 0.75) {
                zoneBadge.innerText = 'Ủ Tơi / Xả Hạt';
                zoneBadge.className = 'water-zone-badge zone-loose';
            } else if (wRatio <= 0.88) {
                zoneBadge.innerText = 'Chuẩn Vê Lưỡi';
                zoneBadge.className = 'water-zone-badge zone-standard';
            } else {
                zoneBadge.innerText = 'Mềm Vuốt Tơ';
                zoneBadge.className = 'water-zone-badge zone-soft';
            }
        }

        if (footSum && curCal && curStyle) {
            const modeMeta = FISHING_MODES[res.fishingMode] || FISHING_MODES.CAM;
            footSum.innerHTML = `${modeMeta.icon} <b>${res.ingredientSummary}</b> (${res.flavorSummary}) • <b style="color:${curStyle.color}">${curStyle.shortLabel}</b> • <b style="color:#fde047">${curCal.shortTag}</b>`;
        }
    }

    updateAnglerStatsBadge() {
        const countEl = document.getElementById('ui-stat-count');
        const weightEl = document.getElementById('ui-stat-weight');
        const biggestEl = document.getElementById('ui-stat-biggest');
        if (!countEl || !weightEl) return;

        let count = 0;
        let weight = 0;
        let biggest = 0;

        if (this.network && this.network.localPlayer) {
            count = this.network.localPlayer.fishCount || 0;
            weight = this.network.localPlayer.totalWeight || 0;
            biggest = this.network.localPlayer.biggestFish || 0;
        } else if (this.fishKeepnet) {
            count = this.fishKeepnet.length;
            this.fishKeepnet.forEach(f => {
                weight += f.weight;
                if (f.weight > biggest) biggest = f.weight;
            });
        }

        countEl.innerText = count;
        weightEl.innerText = weight.toFixed(1);
        if (biggestEl) biggestEl.innerText = biggest.toFixed(1);

        const badge = document.getElementById('ui-angler-stats');
        if (badge) {
            badge.classList.remove('stat-pulse');
            void badge.offsetWidth;
            badge.classList.add('stat-pulse');
        }
    }

    // HUD Ý thức cá: mức cảnh giác ổ, độ tan mồi, lượng mồi trên khay, hành vi gần nhất của cá dưới đáy
    updateFishMindHUD() {
        const hud = document.getElementById('fish-mind-hud');
        if (!hud) return;
        const st = this.gameplay.state;
        const seated = st && st !== 'ROAM';
        hud.style.display = (seated && this.showFishMindHud) ? 'block' : 'none';
        if (!seated || !this.showFishMindHud) return;

        const alert = Math.round((this.bubbleSystem.spotAlertLevel || 0) * 100);
        const alertEl = document.getElementById('fish-mind-alert');
        if (alertEl) {
            alertEl.innerText = `Cảnh giác ${alert}%`;
            alertEl.className = 'fish-mind-tag ' + (alert >= 55 ? 'tag-danger' : alert >= 30 ? 'tag-warn' : 'tag-ok');
        }

        const baitEl = document.getElementById('fish-mind-bait');
        if (baitEl) {
            const inWater = st === 'FLOAT_WAIT' || st === 'BITING';
            if (!inWater) {
                baitEl.innerText = 'Mồi: chưa ra cần';
                baitEl.className = 'fish-mind-tag';
            } else if (this.gameplay.isBareHook) {
                baitEl.innerText = '⚠️ TRƠ LƯỠI';
                baitEl.className = 'fish-mind-tag tag-danger';
            } else {
                const p = Math.round((this.gameplay.hookBaitIntegrity || 0) * 100);
                baitEl.innerText = `Mồi trên lưỡi ${p}%`;
                baitEl.className = 'fish-mind-tag ' + (p < 25 ? 'tag-danger' : p > 85 ? 'tag-warn' : 'tag-ok');
            }
        }

        const trayEl = document.getElementById('fish-mind-tray');
        if (trayEl) {
            const hb = this.gameplay.activeHookBait;
            const gb = this.gameplay.activeGroundBait;
            if (!hb) {
                trayEl.innerText = 'Khay: TRỐNG (M)';
                trayEl.className = 'fish-mind-tag tag-danger';
            } else {
                const hc = typeof hb.charges === 'number' ? hb.charges : '∞';
                const gc = gb && typeof gb.charges === 'number' ? gb.charges : 0;
                trayEl.innerText = `Khay: ${hc} viên • ${gc} nắm xả`;
                trayEl.className = 'fish-mind-tag ' + (hc === 0 ? 'tag-danger' : 'tag-ok');
            }
        }

        const logEl = document.getElementById('fish-mind-log');
        if (logEl && this.bubbleSystem.lastMindLog) logEl.innerText = this.bubbleSystem.lastMindLog;
    }

    updateFishingFlowBar() {
        const stepTicket = document.getElementById('flow-step-ticket');
        const badgeTicket = document.getElementById('flow-badge-ticket');
        const stepMix = document.getElementById('flow-step-mix');
        const badgeMix = document.getElementById('flow-badge-mix');
        const stepGround = document.getElementById('flow-step-ground');
        const badgeGround = document.getElementById('flow-badge-ground');
        const stepCast = document.getElementById('flow-step-cast');
        const badgeCast = document.getElementById('flow-badge-cast');

        if (!stepTicket || !stepMix || !stepGround || !stepCast) return;

        // 1. Ghi vé
        const hasTicket = this.lakeOps && this.lakeOps.hasTicket;
        if (hasTicket) {
            stepTicket.className = 'flow-step-btn step-completed';
            if (badgeTicket) badgeTicket.innerText = `✓ Ca ${this.lakeOps.ticket.packageHours}h (${this.lakeOps.formatHours(this.lakeOps.ticket.hoursLeft)})`;
        } else {
            stepTicket.className = 'flow-step-btn step-pending';
            if (badgeTicket) badgeTicket.innerText = this.lakeOps && this.lakeOps.staffOnTheWay ? 'Nhân viên đang tới' : 'Bấm lấy vé';
        }

        // 2. Pha mồi
        const hb = this.gameplay.activeHookBait;
        const hasBait = !!hb && !(typeof hb.charges === 'number' && hb.charges <= 0);
        if (hasBait) {
            stepMix.className = 'flow-step-btn step-completed';
            if (badgeMix) {
                badgeMix.innerText = typeof hb.charges === 'number' ? `✓ Còn ${hb.charges} viên` : '✓ Đã pha';
            }
        } else {
            stepMix.className = 'flow-step-btn step-pending';
            if (badgeMix) badgeMix.innerText = hb ? 'Hết mồi - M' : 'Bấm phím M';
        }

        // 3. Xả mồi tụ ổ
        const castCount = this.gameplay.groundBaitsCastCount || 0;
        if (castCount > 0) {
            stepGround.className = 'flow-step-btn step-completed';
            if (badgeGround) badgeGround.innerText = `✓ Đã xả ${castCount} viên`;
        } else {
            stepGround.className = 'flow-step-btn step-ready';
            if (badgeGround) badgeGround.innerText = 'Bấm F xả ổ';
        }

        // 4. Ra cần & Canh phao
        const st = this.gameplay.state;
        if (st === 'CASTING' || st === 'FLOAT_WAIT' || st === 'BITING') {
            stepCast.className = 'flow-step-btn step-active';
            if (badgeCast) badgeCast.innerText = st === 'BITING' ? '⚡ CÁ ĐANG CẮN!' : '🎣 Đang canh phao';
        } else if (st === 'FIGHTING') {
            stepCast.className = 'flow-step-btn step-active';
            if (badgeCast) badgeCast.innerText = '⚡ ĐANG DÒNG CÁ!';
        } else {
            stepCast.className = 'flow-step-btn step-ready';
            if (badgeCast) badgeCast.innerText = 'Vung cần ra ổ';
        }
    }

    openNetModal() {
        document.exitPointerLock();
        soundManager.playClick();
        document.getElementById('modal-net').style.display = 'flex';
        this.renderKeepnet();
    }

    closeNetModal() {
        document.getElementById('modal-net').style.display = 'none';
    }

    renderKeepnet() {
        const container = document.getElementById('net-fish-container');
        container.innerHTML = '';

        let totalWeight = 0;
        this.fishKeepnet.forEach(fish => {
            totalWeight += fish.weight;
            const item = document.createElement('div');
            item.className = 'net-fish-card';
            item.innerHTML = `
                <img class="net-fish-photo" src="${getFishImageUrl(fish)}" alt="${fish.name}" />
                <div class="fish-name">${fish.name}</div>
                <div class="fish-weight">⚖️ ${fish.weight} kg</div>
                <div class="fish-rarity">${fish.rarity}</div>
            `;
            container.appendChild(item);
        });

        document.getElementById('net-count').innerText = this.fishKeepnet.length;
        document.getElementById('net-total-weight').innerText = totalWeight.toFixed(2);
    }

    sellAllFish() {
        if (this.fishKeepnet.length === 0) {
            alert('Rọng cá đang trống!');
            return;
        }

        let earned = 0;
        this.fishKeepnet.forEach(fish => {
            let pricePerKg = 30000;
            if (fish.rarity === 'Hiếm') pricePerKg = 45000;
            if (fish.rarity === 'Cực Hiếm' || fish.rarity === 'Huyền Thoại') pricePerKg = 70000;
            earned += Math.round(fish.weight * pricePerKg);
        });

        this.playerMoney += earned;
        this.fishKeepnet = [];
        this.updateMoneyUI();
        this.renderKeepnet();
        soundManager.playCatchFanfare();
        alert(`🎉 Bạn đã bàn giao rọng cá cho chủ hồ và nhận: +${earned.toLocaleString()} VNĐ!`);
    }

    openWelcomeLakeModal() {
        document.exitPointerLock();
        const modal = document.getElementById('modal-lakes');
        if (modal) {
            modal.style.display = 'flex';
            this.renderLakes(true);
        }
    }

    openLakesModal() {
        document.exitPointerLock();
        soundManager.playClick();
        const modal = document.getElementById('modal-lakes');
        if (modal) {
            modal.style.display = 'flex';
            this.renderLakes(false);
        }
    }

    closeLakesModal() {
        const modal = document.getElementById('modal-lakes');
        if (modal) modal.style.display = 'none';
    }

    renderLakes(isWelcome = false) {
        const container = document.getElementById('lakes-container');
        if (!container) return;
        container.innerHTML = '';
        const titleEl = document.getElementById('lakes-modal-title');
        if (titleEl) {
            titleEl.innerText = isWelcome
                ? '🎣 HÔM NAY BẠN MUỐN ĐI HỒ CÂU ĐÀI NÀO?'
                : '🗺️ ĐỔI HỒ CÂU ĐÀI SĂN HÀNG';
        }

        LAKES_DATA.forEach(lake => {
            const isCurrent = this.gameplay.currentLake && this.gameplay.currentLake.id === lake.id;
            const owner = lake.owner || {};
            const card = document.createElement('div');
            card.className = `lake-card ${isCurrent ? 'lake-card-active' : ''} ${lake.isOpening ? 'lake-card-opening' : ''}`;
            card.innerHTML = `
                <div class="lake-card-header">
                    <span class="lake-badge-loc">📍 ${lake.location}</span>
                    ${lake.terrainShortName ? `<span class="lake-badge-terrain" title="${lake.terrainDesc || ''}">${lake.terrainShortName}</span>` : ''}
                    ${lake.isOpening ? '<span class="lake-badge-opening">🔥 ĐẠI KHAI TRƯƠNG</span>' : ''}
                    <h3 class="lake-card-title">${lake.name}</h3>
                    <div class="lake-tagline">"${lake.tagline}"</div>
                </div>

                <!-- Khối Chủ Hồ Độc Bản với Tính Cách Riêng Biệt -->
                <div class="lake-owner-profile">
                    <div class="owner-avatar-circle">${owner.avatar || '👨‍🌾'}</div>
                    <div class="owner-meta">
                        <div class="owner-name-title">
                            <span class="owner-name">${owner.name}</span>
                            <span class="owner-title-tag">${owner.title}</span>
                        </div>
                        <div class="owner-personality-desc"><b>Tính cách:</b> ${owner.personality}</div>
                        <div class="owner-quote-bubble">"${owner.quote}"</div>
                    </div>
                </div>

                <div class="lake-card-body">
                    <p class="lake-desc">${lake.description}</p>
                    <div class="lake-specs-table">
                        <div class="spec-cell">
                            <span class="lbl">Kích thước Map:</span>
                            <b class="val">📏 ${lake.halfW * 2}m x ${lake.halfD * 2}m</b>
                        </div>
                        <div class="spec-cell">
                            <span class="lbl">Độ sâu đáy:</span>
                            <b class="val">🌊 ${lake.depth} mét</b>
                        </div>
                        <div class="spec-cell">
                            <span class="lbl">Vé ca 5 tiếng:</span>
                            <b class="val val-price">💰 ${(lake.ticketPrice5h || lake.ticketPrice).toLocaleString()} đ / 5h</b>
                        </div>
                        <div class="spec-cell">
                            <span class="lbl">Lịch bồi cá:</span>
                            <b class="val">🚚 ${lake.stockEveryDays} ngày / lần</b>
                        </div>
                    </div>

                    <div class="lake-fish-species-box">
                        <span class="fish-species-title">🐟 Cá Săn Hàng Chủ Lực:</span>
                        <div class="fish-species-pills">
                            ${lake.fishSpecies.map(f => `
                                <span class="f-pill" style="border-left: 3px solid ${f.color}">
                                    ${f.icon} ${f.name} (<b>${f.weightRange[0]}-${f.weightRange[1]}kg</b>)
                                </span>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="lake-card-action">
                    <button class="btn-go-lake ${isCurrent ? 'btn-lake-selected' : ''}" id="go-${lake.id}">
                        ${isCurrent ? '✅ Đang Ở Hồ Này' : '🎣 VÀO HỒ NÀY CÂU NGAY'}
                    </button>
                </div>
            `;
            container.appendChild(card);

            card.querySelector(`#go-${lake.id}`).onclick = () => {
                soundManager.playClick();
                if (this.onLakeChange) {
                    this.onLakeChange(lake);
                    this.closeLakesModal();
                }
            };
        });
    }

    onFishLanded(fish) {
        this.fishKeepnet.push(fish);
        document.getElementById('fight-hud').style.display = 'none';

        const baseReward = Math.round(fish.weight * 35000);
        const boxBonusPct = (this.gameplay && this.gameplay.equipBonuses) ? (this.gameplay.equipBonuses.rewardBonus || 0) : 0;
        const boxBonusMoney = Math.round(baseReward * boxBonusPct);
        const prizeBonus = fish.prizeBonus || 0;
        const totalReward = baseReward + boxBonusMoney + prizeBonus;
        this.playerMoney += totalReward;
        this.updateMoneyUI();

        // 1. Cập nhật gói mạng Online & Leaderboard
        if (this.network) {
            this.network.sendPacket(NET_EVENTS.FISH_LANDED, { fish });
        }

        // 1.5. Cơ chế Giữ Ổ thực tế: Câu 1 con không xả bồi -> Cá cảnh giác; Câu 2 con không xả -> Tàn ổ, cá rất khó ăn!
        if (this.bubbleSystem && typeof this.bubbleSystem.onFishCaughtAtSpot === 'function') {
            const fp = (this.gameplay && this.gameplay.floatPos) ? this.gameplay.floatPos : null;
            const hx = fp ? fp.x : (this.player ? this.player.position.x : 0);
            const hz = fp ? fp.z : (this.player ? this.player.position.z : 12);
            this.bubbleSystem.onFishCaughtAtSpot(hx, hz, fish);
        }

        // 1.6. Cộng cân vào Giải Đấu 5 phút nếu đang tham gia
        if (this.tournament && this.tournament.active) {
            const me = this.tournament.entries.find(e => e.id === 'LOCAL');
            if (me) {
                me.kg = Number((me.kg + fish.weight).toFixed(1));
                me.count += 1;
            }
        }

        // 2. Cập nhật Thống kê ca câu & kiểm tra trúng Kèo RUNG Chủ Hồ!
        let rungReward = 0;
        if (this.lakeOps) {
            const rungRes = this.lakeOps.recordFishCatch(fish);
            if (rungRes && rungRes.wonRung && rungRes.rungReward > 0) {
                rungReward = rungRes.rungReward;
                this.playerMoney += rungReward;
                if (this.careerStats) this.careerStats.rungWins = (this.careerStats.rungWins || 0) + 1;
                this.updateMoneyUI();
            }
        }

        // Ghi nhận Kỷ Lục Sự Nghiệp & Tự Động Lưu Hồ Sơ
        if (this.careerStats) {
            this.careerStats.totalFish += 1;
            this.careerStats.totalWeight = parseFloat((this.careerStats.totalWeight + fish.weight).toFixed(2));
            if (fish.weight > this.careerStats.biggestFish) {
                this.careerStats.biggestFish = fish.weight;
                this.careerStats.biggestFishName = fish.name;
            }
            const spKey = fish.name || 'Cá Hồ';
            const prev = this.careerStats.speciesRecords[spKey] || { count: 0, maxWeight: 0, icon: fish.icon || '🐟' };
            prev.count += 1;
            if (fish.weight > prev.maxWeight) prev.maxWeight = fish.weight;
            this.careerStats.speciesRecords[spKey] = prev;
            this.savePlayerProfile();
        }

        // 3. Render ngay lập tức Bảng Xếp Hạng & Rọng cá & Thống kê Cần Thủ
        this.renderOnlineLeaderboard();
        this.renderKeepnet();
        this.updateAnglerStatsBadge();

        const finalTotalReward = totalReward + rungReward;
        const celebModal = document.getElementById('modal-celebration');
        const photoEl = document.getElementById('celeb-fish-photo');
        if (photoEl) {
            photoEl.src = getFishImageUrl(fish);
            photoEl.alt = fish.name;
        }
        document.getElementById('celeb-icon').innerText = fish.icon || '🐟';
        document.getElementById('celeb-fish-name').innerText = fish.name;
        document.getElementById('celeb-weight').innerText = fish.weight;
        document.getElementById('celeb-rarity').innerText = fish.rarity;
        const bonusParts = [];
        if (prizeBonus > 0) bonusParts.push(`+${(prizeBonus / 1000).toFixed(0)}k Cá Khuyên`);
        if (rungReward > 0) bonusParts.push(`+${(rungReward / 1000).toFixed(0)}k Kèo RUNG`);
        document.getElementById('celeb-reward').innerText = bonusParts.length > 0
            ? `+${finalTotalReward.toLocaleString()} đ (${bonusParts.join(' • ')})`
            : `+${finalTotalReward.toLocaleString()} đ`;
        celebModal.style.display = 'flex';
    }

    showScenarioToast(title, desc, type = 'INFO') {
        const toast = document.getElementById('scenario-toast');
        const tEl = document.getElementById('scenario-toast-title');
        const dEl = document.getElementById('scenario-toast-desc');
        if (!toast || !tEl || !dEl) return;

        tEl.innerText = title;
        dEl.innerText = desc;
        toast.className = `scenario-toast scenario-${(type || 'INFO').toLowerCase()}`;
        toast.style.display = 'flex';

        if (this.scenarioToastTimeout) clearTimeout(this.scenarioToastTimeout);
        this.scenarioToastTimeout = setTimeout(() => {
            toast.style.display = 'none';
        }, 2500);
    }

    updateMoneyUI() {
        const el = document.getElementById('ui-money');
        if (el) el.innerText = this.playerMoney.toLocaleString();
        if (this.network && typeof this.network.syncLocalStats === 'function') {
            this.network.syncLocalStats({ money: this.playerMoney });
        }
        this.savePlayerProfile();
        if (this.leaderboardMode === 'MONEY') this.renderOnlineLeaderboard();
    }

    // ==================== LƯU HỒ SƠ TỰ ĐỘNG & SỔ KỶ LỤC CẦN THỦ ====================
    getDefaultBaitInventory() {
        return {
            cam_nen_thom: 2,
            cam_nen_tanh: 1,
            cam_nen_thom_tanh: 2,
            ngo_ngot: 10,
            oc_van: 2,
            oc_buou: 2,
            hl_mat_khoai: 1,
            hl_tuong_sua_thom: 1,
            hl_luc_huong: 1,
            hl_sua_ngo: 1,
            hl_ruou_thuoc_bac: 1,
            hl_nuoc_xanh: 1
        };
    }

    ensureStarterBaitInventory(savedInv) {
        const def = this.getDefaultBaitInventory();
        if (!savedInv || typeof savedInv !== 'object') return def;
        const merged = { ...savedInv };
        // Nếu hồ sơ cũ chưa từng được cấp bộ 12 mồi & hương liệu mới -> cấp bổ sung gói khởi đầu
        const hasAnyNewBase =
            typeof merged.cam_nen_thom === 'number' ||
            typeof merged.cam_nen_tanh === 'number' ||
            typeof merged.cam_nen_thom_tanh === 'number' ||
            typeof merged.ngo_ngot === 'number' ||
            typeof merged.oc_van === 'number' ||
            typeof merged.oc_buou === 'number';
        if (!hasAnyNewBase) {
            Object.entries(def).forEach(([k, v]) => {
                merged[k] = v;
            });
        }
        return merged;
    }

    loadPlayerProfile() {
        try {
            const raw = localStorage.getItem('vn_carp_profile_v1');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (typeof data.playerMoney === 'number' && !Number.isNaN(data.playerMoney)) {
                this.playerMoney = data.playerMoney;
            }
            if (data.playerInventory && typeof data.playerInventory === 'object') {
                this.playerInventory = this.ensureStarterBaitInventory(data.playerInventory);
            }
            if (data.careerStats && typeof data.careerStats === 'object') {
                this.careerStats = { ...this.careerStats, ...data.careerStats };
                if (!this.careerStats.speciesRecords) this.careerStats.speciesRecords = {};
            }
        } catch (e) {}
    }

    savePlayerProfile() {
        try {
            const payload = {
                playerMoney: this.playerMoney,
                playerInventory: this.playerInventory,
                careerStats: this.careerStats
            };
            const accKey = this.currentUsername ? `vn_carp_acc_${this.currentUsername.toLowerCase()}_profile` : 'vn_carp_profile_v1';
            localStorage.setItem(accKey, JSON.stringify(payload));
            if (this.currentUsername) {
                this.syncAccountSaveToServer();
            }
        } catch (e) {}
    }

    // ==================== HỆ THỐNG TÀI KHOẢN (ĐĂNG KÝ / ĐĂNG NHẬP / LOADING / ĐĂNG XUẤT) ====================
    initAuthFlow() {
        this.authMode = 'LOGIN';
        this.currentUsername = null;

        const tabLogin = document.getElementById('tab-auth-login');
        const tabReg = document.getElementById('tab-auth-register');
        const submitBtn = document.getElementById('btn-auth-submit');
        const userInp = document.getElementById('auth-username');
        const passInp = document.getElementById('auth-password');
        const errEl = document.getElementById('auth-error-msg');
        const btnLogout = document.getElementById('btn-menu-logout');

        const setAuthMode = (mode) => {
            this.authMode = mode;
            if (tabLogin) tabLogin.classList.toggle('active', mode === 'LOGIN');
            if (tabReg) tabReg.classList.toggle('active', mode === 'REGISTER');
            if (submitBtn) submitBtn.innerText = mode === 'LOGIN' ? '🔑 ĐĂNG NHẬP & VÀO GAME' : '📝 ĐĂNG KÝ & VÀO GAME';
            if (errEl) errEl.style.display = 'none';
        };

        if (tabLogin) tabLogin.onclick = () => setAuthMode('LOGIN');
        if (tabReg) tabReg.onclick = () => setAuthMode('REGISTER');

        const doSubmit = async () => {
            const username = (userInp ? userInp.value : '').trim();
            const password = passInp ? passInp.value : '';
            if (username.length < 3) {
                if (errEl) { errEl.innerText = '⚠️ Tên tài khoản phải có ít nhất 3 ký tự!'; errEl.style.display = 'block'; }
                return;
            }
            if (password.length < 4) {
                if (errEl) { errEl.innerText = '⚠️ Mật khẩu phải có ít nhất 4 ký tự!'; errEl.style.display = 'block'; }
                return;
            }
            if (errEl) errEl.style.display = 'none';
            if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = '⏳ Đang xác thực...'; }

            const endpoint = this.authMode === 'REGISTER' ? '/api/auth/register' : '/api/auth/login';
            let ok = false;
            let serverSaveData = null;
            let finalUsername = username;

            try {
                const resp = await fetch(`${this.getServerApiBase()}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await resp.json();
                if (!resp.ok || !data.ok) {
                    if (errEl) { errEl.innerText = `⚠️ ${data.error || 'Đăng nhập thất bại!'}`; errEl.style.display = 'block'; }
                    if (submitBtn) { submitBtn.disabled = false; setAuthMode(this.authMode); }
                    return;
                }
                ok = true;
                finalUsername = data.username || username;
                serverSaveData = data.saveData || null;
            } catch (e) {
                // Fallback LocalStorage nếu chạy offline không có server API
                const localUsers = JSON.parse(localStorage.getItem('vn_carp_local_users') || '{}');
                const k = username.toLowerCase();
                if (this.authMode === 'REGISTER') {
                    if (localUsers[k]) {
                        if (errEl) { errEl.innerText = '⚠️ Tài khoản này đã tồn tại!'; errEl.style.display = 'block'; }
                        if (submitBtn) { submitBtn.disabled = false; setAuthMode(this.authMode); }
                        return;
                    }
                    localUsers[k] = { username, pass: btoa(password) };
                    localStorage.setItem('vn_carp_local_users', JSON.stringify(localUsers));
                    ok = true;
                } else {
                    if (!localUsers[k] || localUsers[k].pass !== btoa(password)) {
                        if (errEl) { errEl.innerText = '⚠️ Sai tài khoản hoặc mật khẩu!'; errEl.style.display = 'block'; }
                        if (submitBtn) { submitBtn.disabled = false; setAuthMode(this.authMode); }
                        return;
                    }
                    finalUsername = localUsers[k].username;
                    ok = true;
                }
            }

            if (submitBtn) { submitBtn.disabled = false; setAuthMode(this.authMode); }
            if (ok) {
                localStorage.setItem('vn_carp_auth_session', JSON.stringify({ username: finalUsername }));
                const authOv = document.getElementById('auth-screen-overlay');
                if (authOv) authOv.style.display = 'none';
                this.enterGameWithLoading(finalUsername, serverSaveData);
            }
        };

        if (submitBtn) submitBtn.onclick = doSubmit;
        if (passInp) passInp.onkeydown = (e) => { if (e.key === 'Enter') doSubmit(); };
        if (userInp) userInp.onkeydown = (e) => { if (e.key === 'Enter' && passInp) passInp.focus(); };

        if (btnLogout) {
            btnLogout.onclick = () => {
                this.closeMainMenu();
                this.logoutAccount();
            };
        }

        // Kiểm tra xem lần trước đã đăng nhập tài khoản chưa -> Tự động vào lại đúng tài khoản đó kèm thanh Loading!
        try {
            const rawSess = localStorage.getItem('vn_carp_auth_session');
            if (rawSess) {
                const sess = JSON.parse(rawSess);
                if (sess && sess.username) {
                    this.enterGameWithLoading(sess.username, null);
                    return;
                }
            }
        } catch (e) {}

        // Chưa có phiên đăng nhập -> Hiện màn hình Đăng Nhập / Đăng Ký
        const authOv = document.getElementById('auth-screen-overlay');
        if (authOv) authOv.style.display = 'flex';
    }

    enterGameWithLoading(username, serverSaveData = null) {
        this.currentUsername = username;
        const loadOv = document.getElementById('game-loading-overlay');
        const fillEl = document.getElementById('loading-bar-fill');
        const pctEl = document.getElementById('loading-percent-txt');
        const stEl = document.getElementById('loading-status-txt');
        const userTag = document.getElementById('loading-user-tag');
        if (userTag) userTag.innerText = `👤 Cần thủ: ${username}`;
        if (loadOv) loadOv.style.display = 'flex';

        // Nạp dữ liệu riêng của tài khoản này (Tiền 1.000.000đ mặc định nếu tài khoản mới)
        this.loadAccountData(username, serverSaveData);

        const steps = [
            { p: 24, t: 'Đang kết nối phòng hồ Online...' },
            { p: 52, t: 'Đang tải bộ cần, trục thẻo & mồi câu của tài khoản...' },
            { p: 80, t: 'Đang đồng bộ 1,5–2 tấn cá AI & 32 bến câu...' },
            { p: 100, t: 'Sẵn sàng ra bến câu!' }
        ];
        let idx = 0;
        const tick = () => {
            const s = steps[idx];
            if (fillEl) fillEl.style.width = `${s.p}%`;
            if (pctEl) pctEl.innerText = `${s.p}%`;
            if (stEl) stEl.innerText = s.t;
            idx++;
            if (idx < steps.length) {
                setTimeout(tick, 320);
            } else {
                setTimeout(() => {
                    if (loadOv) loadOv.style.display = 'none';
                    const accLbl = document.getElementById('menu-account-name');
                    if (accLbl) accLbl.innerHTML = `👤 Tài khoản: <b>${username}</b>`;
                    if (this.network && typeof this.network.setPlayerName === 'function') {
                        this.network.setPlayerName(username);
                    }
                    const nameInp = document.getElementById('menu-player-name');
                    if (nameInp) nameInp.value = username;
                    this.updateMoneyUI();
                    this.renderOnlineLeaderboard();
                    this.showPrompt(`👋 Chào mừng cần thủ [${username}] trở lại hồ câu!`);
                }, 260);
            }
        };
        tick();
    }

    loadAccountData(username, serverSaveData = null) {
        const prefix = `vn_carp_acc_${username.toLowerCase()}`;
        let prof = null;
        try {
            prof = (serverSaveData && serverSaveData.profile)
                ? serverSaveData.profile
                : JSON.parse(localStorage.getItem(`${prefix}_profile`) || 'null');
        } catch (e) {}

        if (prof && typeof prof.playerMoney === 'number') {
            this.playerMoney = prof.playerMoney;
            this.playerInventory = this.ensureStarterBaitInventory(prof.playerInventory);
            this.careerStats = prof.careerStats || { totalFish: 0, totalWeight: 0, biggestFish: 0, biggestFishName: '', rungWins: 0, momCount: 0, speciesRecords: {} };
        } else {
            // Tài khoản mới mặc định đúng 1.000.000đ + đủ 12 loại mồi & hương liệu khởi đầu + 2 cần khởi đầu!
            this.playerMoney = 1000000;
            this.playerInventory = this.getDefaultBaitInventory();
            this.careerStats = { totalFish: 0, totalWeight: 0, biggestFish: 0, biggestFishName: '', rungWins: 0, momCount: 0, speciesRecords: {} };
        }

        // Nạp trang bị, bộ trục/phao & khế ước hồ riêng của tài khoản
        try {
            const eq = (serverSaveData && serverSaveData.equipmentLevels) || JSON.parse(localStorage.getItem(`${prefix}_equip`) || 'null');
            this.equipmentLevels = eq ? { ...getDefaultEquipmentLevels(), ...eq } : getDefaultEquipmentLevels();
            if (this.gameplay && this.gameplay.applyEquipmentUpgrades) this.gameplay.applyEquipmentUpgrades(this.equipmentLevels);
        } catch (e) {}

        try {
            const rg = (serverSaveData && serverSaveData.rigConfig) || JSON.parse(localStorage.getItem(`${prefix}_rig`) || 'null');
            this.rigConfig = rg ? { ...getDefaultRigState(), ...rg } : getDefaultRigState();
            if (this.gameplay && this.gameplay.applyRigSetup) this.gameplay.applyRigSetup(this.rigConfig);
        } catch (e) {}

        try {
            const ol = (serverSaveData && serverSaveData.ownedLakes) || JSON.parse(localStorage.getItem(`${prefix}_lakes`) || 'null');
            this.ownedLakes = ol || getDefaultOwnedLakesState();
        } catch (e) {}
    }

    syncAccountSaveToServer() {
        if (!this.currentUsername) return;
        const prefix = `vn_carp_acc_${this.currentUsername.toLowerCase()}`;
        const saveData = {
            profile: {
                playerMoney: this.playerMoney,
                playerInventory: this.playerInventory,
                careerStats: this.careerStats
            },
            equipmentLevels: this.equipmentLevels,
            rigConfig: this.rigConfig,
            ownedLakes: this.ownedLakes
        };
        try {
            localStorage.setItem(`${prefix}_equip`, JSON.stringify(this.equipmentLevels));
            localStorage.setItem(`${prefix}_rig`, JSON.stringify(this.rigConfig));
            localStorage.setItem(`${prefix}_lakes`, JSON.stringify(this.ownedLakes));
        } catch (e) {}

        if (this._authSaveDebounce) clearTimeout(this._authSaveDebounce);
        this._authSaveDebounce = setTimeout(() => {
            fetch(`${this.getServerApiBase()}/api/auth/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: this.currentUsername, saveData })
            }).catch(() => {});
        }, 800);
    }

    logoutAccount() {
        this.savePlayerProfile();
        this.currentUsername = null;
        try { localStorage.removeItem('vn_carp_auth_session'); } catch (e) {}
        document.exitPointerLock();
        const userInp = document.getElementById('auth-username');
        const passInp = document.getElementById('auth-password');
        if (userInp) userInp.value = '';
        if (passInp) passInp.value = '';
        const authOv = document.getElementById('auth-screen-overlay');
        if (authOv) authOv.style.display = 'flex';
        this.showPrompt('🚪 Đã đăng xuất! Bạn có thể đăng nhập hoặc tạo tài khoản mới.');
    }

    openRecordsModal() {
        document.exitPointerLock();
        soundManager.playClick();
        const modal = document.getElementById('modal-records');
        if (modal) {
            modal.style.display = 'flex';
            this.renderRecordsModal();
        }
    }

    closeRecordsModal() {
        const modal = document.getElementById('modal-records');
        if (modal) modal.style.display = 'none';
    }

    renderRecordsModal() {
        const sumEl = document.getElementById('records-summary-grid');
        const listEl = document.getElementById('records-species-list');
        if (!sumEl || !listEl) return;
        const st = this.careerStats || { totalFish: 0, totalWeight: 0, biggestFish: 0, biggestFishName: '--', rungWins: 0, speciesRecords: {} };

        sumEl.innerHTML = `
            <div class="rec-stat-card"><span>🐟 Tổng Số Cá</span><b>${st.totalFish} con</b></div>
            <div class="rec-stat-card"><span>⚖️ Tổng Trọng Lượng</span><b>${(st.totalWeight || 0).toFixed(1)} kg</b></div>
            <div class="rec-stat-card"><span>🏆 Cá Kỷ Lục To Nhất</span><b>${(st.biggestFish || 0).toFixed(1)} kg</b><small>${st.biggestFishName || '--'}</small></div>
            <div class="rec-stat-card"><span>🔔 Kèo RUNG Đã Húp</span><b>${st.rungWins || 0} lần</b></div>
        `;

        const entries = Object.entries(st.speciesRecords || {}).sort((a, b) => b[1].maxWeight - a[1].maxWeight);
        if (entries.length === 0) {
            listEl.innerHTML = '<div class="dev-empty">Chưa có kỷ lục nào. Hãy ra cần lên cá đầu tiên nhé!</div>';
        } else {
            listEl.innerHTML = entries.map(([name, info]) => `
                <div class="rec-species-row">
                    <span class="rec-species-left">
                        <img class="rec-fish-thumb" src="${getFishImageUrl(name, info.maxWeight)}" alt="${name}" />
                        <b>${name}</b>
                    </span>
                    <span>Đã bắt: <b>${info.count}</b> con • Kỷ lục: <b class="rec-max">${info.maxWeight.toFixed(1)} kg</b></span>
                </div>
            `).join('');
        }
    }

    setLakeName(name) {
        document.getElementById('ui-lake-name').innerText = name;
    }

    showPrompt(text, duration = 2800) {
        const box = document.getElementById('action-prompt');
        const elem = document.getElementById('prompt-content');
        if (!box || !elem) return;

        // Nếu người chơi đang buông cần canh phao, cá đang cắn hoặc đang Bo Cá -> tuyệt đối không hiện khung chữ che tầm nhìn!
        if (this.gameplay && (this.gameplay.state === 'FLOAT_WAIT' || this.gameplay.state === 'BITING' || this.gameplay.state === 'FIGHTING')) {
            box.style.display = 'none';
            return;
        }

        elem.innerText = text;
        box.style.display = 'block';
        box.style.opacity = '1';
        box.style.transform = 'translateX(-50%) translateY(0)';

        if (this._promptTimeout) clearTimeout(this._promptTimeout);
        if (duration > 0) {
            this._promptTimeout = setTimeout(() => {
                box.style.opacity = '0';
                box.style.transform = 'translateX(-50%) translateY(6px)';
                setTimeout(() => {
                    if (box.style.opacity === '0') box.style.display = 'none';
                }, 300);
            }, duration);
        }
    }

    initNetworkListeners() {
        const btnToggleOnline = document.getElementById('btn-toggle-online');
        const onlineBody = document.getElementById('online-panel-body');
        if (btnToggleOnline && onlineBody) {
            btnToggleOnline.onclick = () => {
                if (onlineBody.style.display === 'none') {
                    onlineBody.style.display = 'flex';
                    btnToggleOnline.innerText = '_';
                } else {
                    onlineBody.style.display = 'none';
                    btnToggleOnline.innerText = '+';
                }
            };
        }

        const chatInput = document.getElementById('online-chat-input');
        const btnSendChat = document.getElementById('btn-send-chat');
        const sendChat = () => {
            if (!chatInput || !chatInput.value.trim()) return;
            const msg = chatInput.value.trim();
            chatInput.value = '';
            if (this.network) {
                this.network.sendPacket(NET_EVENTS.CHAT_MESSAGE, { message: msg });
            }
        };
        if (btnSendChat) btnSendChat.onclick = sendChat;
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') sendChat();
            });
        }

        // Đổi tên cần thủ Online trong Menu Drawer
        const nameInput = document.getElementById('input-player-name');
        const btnSaveName = document.getElementById('btn-save-player-name');
        if (nameInput && this.network && this.network.localPlayer) {
            nameInput.value = this.network.localPlayer.name;
            nameInput.addEventListener('keydown', (e) => e.stopPropagation());
        }
        if (btnSaveName && nameInput) {
            btnSaveName.onclick = () => {
                if (this.network && nameInput.value.trim()) {
                    this.network.setPlayerName(nameInput.value.trim());
                    soundManager.playClick();
                    this.showPrompt(`✅ Đã đổi tên cần thủ thành: [${this.network.localPlayer.name}]`);
                }
            };
        }

        if (this.network) {
            this.renderOnlineLeaderboard();
            this.appendOnlineFeed('🟢 Đã vào phòng câu trực tuyến: sẵn sàng giao lưu & đua top cùng hồ!', 'SYSTEM');

            this.network.onEvent((evt) => {
                if (evt.type === 'LEADERBOARD') {
                    this.renderOnlineLeaderboard();
                } else if (evt.type === 'ROOM_STATUS') {
                    const stEl = document.getElementById('menu-online-status');
                    const hdrEl = document.querySelector('#online-room-panel .online-panel-header span');
                    if (evt.mode === 'WEBSOCKET') {
                        const txt = `🟢 ONLINE THẬT: ${evt.roomName} (${evt.onlineCount} cần thủ)`;
                        if (stEl) stEl.innerText = txt;
                        if (hdrEl) hdrEl.innerText = txt;
                    } else {
                        const txt = `🟡 PHÒNG HỒ: ${evt.roomName} (Mô phỏng + Sẵn sàng Online)`;
                        if (stEl) stEl.innerText = txt;
                        if (hdrEl) hdrEl.innerText = `🟢 PHÒNG ${evt.roomName.toUpperCase()}`;
                    }
                } else if (evt.type === 'CHAT') {
                    this.appendOnlineFeed(`💬 <b>${evt.sender}:</b> ${evt.text}`, 'CHAT');
                    this.showWorldChatTicker(evt.sender, evt.text);
                } else if (evt.text) {
                    this.appendOnlineFeed(evt.text, evt.type);
                    this.renderOnlineLeaderboard();
                }
            });
        }
    }

    // Kênh Chat Thế Giới nổi gọn ngay khoảng trống giữa Top HUD — tự ẩn sau tối đa 4 giây!
    showWorldChatTicker(sender, text) {
        const el = document.getElementById('world-chat-ticker');
        if (!el || !text) return;
        const safeSender = String(sender || 'Cần thủ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeText = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        el.innerHTML = `<span class="wc-badge">🌐</span><b class="wc-sender">${safeSender}:</b> <span class="wc-text">${safeText}</span>`;
        el.style.display = 'flex';
        el.classList.remove('wc-fade-out');
        void el.offsetWidth;
        el.classList.add('wc-pop');

        if (this._worldChatTimer) clearTimeout(this._worldChatTimer);
        if (this._worldChatHideTimer) clearTimeout(this._worldChatHideTimer);
        this._worldChatTimer = setTimeout(() => {
            el.classList.add('wc-fade-out');
            this._worldChatHideTimer = setTimeout(() => {
                el.style.display = 'none';
                el.classList.remove('wc-fade-out', 'wc-pop');
            }, 320);
        }, 3680); // Tổng thời gian hiện đúng tối đa 4 giây (3.68s + 0.32s mờ dần)
    }

    // Chỉ hiển thị đúng các nút Mobile có thể ấn được theo trạng thái hiện tại (tránh hiện nút thừa che màn hình!)
    updateMobileTouchControlsState() {
        const dpad = document.getElementById('mobile-dpad');
        const actions = document.getElementById('mobile-actions');
        if (!dpad || !actions || !this.gameplay) return;

        const st = this.gameplay.state;
        const btnStrike = document.getElementById('btn-m-strike');
        const btnCast = document.getElementById('btn-m-cast');
        const btnGround = document.getElementById('btn-m-ground');
        const btnStand = document.getElementById('btn-m-stand');
        const btnZoom = document.getElementById('btn-m-zoom');

        // D-Pad đi bộ góc trái CHỈ hiện khi đang đi bộ (ROAM) — khi bo cá (FIGHTING) ẩn sạch để dùng Nút Tròn gần giữa màn hình!
        dpad.style.display = (st === 'ROAM') ? 'block' : 'none';
        // Khi đang bo cá, ẩn toàn bộ cụm nút phụ bên phải để nhìn cá rẽ nước rõ nhất!
        actions.style.display = (st === 'FIGHTING') ? 'none' : 'flex';

        if (st === 'ROAM') {
            if (btnStrike) btnStrike.style.display = 'none';
            if (btnCast) btnCast.style.display = 'none';
            if (btnGround) btnGround.style.display = 'none';
            if (btnZoom) btnZoom.style.display = 'none';
            const near = this.player && this.player.getNearestFishingSpot ? this.player.getNearestFishingSpot() : null;
            if (btnStand) {
                btnStand.style.display = (near && near.canSit) ? 'inline-flex' : 'none';
                btnStand.innerText = '🪑 Ngồi Câu';
            }
        } else if (st === 'SEATED' || st === 'LANDED') {
            if (btnStrike) btnStrike.style.display = 'none';
            if (btnCast) btnCast.style.display = 'inline-flex';
            if (btnGround) btnGround.style.display = 'inline-flex';
            if (btnZoom) btnZoom.style.display = 'none';
            if (btnStand) {
                btnStand.style.display = 'inline-flex';
                btnStand.innerText = '🚶 Đứng Dậy';
            }
        } else if (st === 'CASTING' || st === 'FLOAT_WAIT' || st === 'BITING') {
            if (btnStrike) btnStrike.style.display = 'inline-flex';
            if (btnCast) btnCast.style.display = 'none';
            if (btnGround) btnGround.style.display = 'inline-flex';
            if (btnZoom) btnZoom.style.display = 'inline-flex';
            if (btnStand) btnStand.style.display = 'none';
        }
    }

    onRungStarted(ev, shout) {
        const banner = document.getElementById('rung-event-banner');
        const titleEl = document.getElementById('rung-banner-title');
        const subEl = document.getElementById('rung-banner-sub');
        const timerEl = document.getElementById('rung-banner-timer');
        if (titleEl) titleEl.innerText = `🔔 ${ev.ownerName.toUpperCase()} HÔ RUNG! +${ev.reward.toLocaleString()}đ`;
        if (subEl) subEl.innerText = `${ev.label} để húp trọn tiền tươi tại bến!`;
        if (timerEl) timerEl.innerText = `${Math.ceil(ev.timeLeft)}s`;
        if (banner) banner.style.display = 'flex';
        this.showScenarioToast('🔔 CHỦ HỒ HÔ RUNG!', shout, 'GOLD');
    }

    onRungEnded(won, msg) {
        const banner = document.getElementById('rung-event-banner');
        if (banner) banner.style.display = 'none';
        this.showScenarioToast(won ? '🏆 NỔ KÈO RUNG!' : '🔔 KẾT THÚC KÈO RUNG', msg, won ? 'GOLD' : 'INFO');
    }

    recordMomSession() {
        if (!this.careerStats) this.careerStats = {};
        this.careerStats.momCount = (this.careerStats.momCount || 0) + 1;
        this.savePlayerProfile();
        if (this.network && typeof this.network.syncLocalStats === 'function') {
            this.network.syncLocalStats({ momCount: this.careerStats.momCount, money: this.playerMoney });
        }
        this.renderOnlineLeaderboard();
        this.showScenarioToast('💀 MÓM CA RỒI!', `Bạn vừa kết thúc ca câu 0 cá (+1 vào BXH Móm Ca — Tổng: ${this.careerStats.momCount} ca móm)!`, 'WARN');
    }

    renderOnlineLeaderboard() {
        if (!this.network) return;
        const container = document.getElementById('online-leaderboard-list');
        if (!container) return;

        // Gắn sự kiện cho 4 tab BXH (HUGO / TIỀN / MÓM CA / TỔNG CÂN)
        const tabsWrap = document.getElementById('online-lb-tabs');
        if (tabsWrap && !tabsWrap._bound) {
            tabsWrap._bound = true;
            tabsWrap.querySelectorAll('.lb-tab-btn').forEach(btn => {
                btn.onclick = () => {
                    this.leaderboardMode = btn.getAttribute('data-lb') || 'HUGO';
                    tabsWrap.querySelectorAll('.lb-tab-btn').forEach(b => {
                        const act = b === btn;
                        b.classList.toggle('active', act);
                        b.style.background = act ? 'rgba(245,158,11,0.28)' : 'rgba(30,41,59,0.7)';
                        b.style.borderColor = act ? '#f59e0b' : 'rgba(148,163,184,0.3)';
                        b.style.color = act ? '#fde047' : '#cbd5e1';
                    });
                    this.renderOnlineLeaderboard();
                };
            });
        }

        // Đồng bộ stats mới nhất của local player trước khi xếp hạng
        if (this.network.localPlayer) {
            this.network.localPlayer.money = this.playerMoney;
            this.network.localPlayer.momCount = (this.careerStats && this.careerStats.momCount) ? this.careerStats.momCount : 0;
            if (this.careerStats && this.careerStats.biggestFish > (this.network.localPlayer.biggestFish || 0)) {
                this.network.localPlayer.biggestFish = this.careerStats.biggestFish;
            }
        }

        const mode = this.leaderboardMode || 'HUGO';
        const list = this.network.getLeaderboard(mode);
        container.innerHTML = '';
        list.forEach((p, idx) => {
            const row = document.createElement('div');
            row.className = `lb-row ${p.isLocal ? 'lb-local' : ''}`;
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
            let scoreText = `${(p.totalWeight || 0).toFixed(1)}kg (${p.fishCount || 0} con)`;
            if (mode === 'HUGO') {
                scoreText = `🐟 ${(p.biggestFish || 0).toFixed(1)}kg (To nhất)`;
            } else if (mode === 'MONEY') {
                scoreText = `💰 ${Math.round(p.money || 0).toLocaleString()}đ`;
            } else if (mode === 'MOM') {
                scoreText = `💀 ${p.momCount || 0} ca móm`;
            }
            row.innerHTML = `
                <span class="lb-rank">${medal} ${p.name}</span>
                <span class="lb-score">${scoreText}</span>
            `;
            container.appendChild(row);
        });
    }

    appendOnlineFeed(htmlText, type = 'INFO') {
        const feed = document.getElementById('online-feed-list');
        if (!feed) return;
        const item = document.createElement('div');
        item.className = `feed-item feed-${type.toLowerCase()}`;
        item.innerHTML = htmlText;
        feed.appendChild(item);
        while (feed.children.length > 15) {
            feed.removeChild(feed.firstChild);
        }
        feed.scrollTop = feed.scrollHeight;
    }

    // ==================== NGĂN KÉO MENU TỔNG HỢP & DEV FISH AI INSPECTOR ====================
    toggleMainMenu() {
        const drawer = document.getElementById('main-menu-drawer');
        const backdrop = document.getElementById('main-menu-backdrop');
        if (!drawer) return;
        soundManager.playClick();
        const isOpen = drawer.style.display === 'flex';
        drawer.style.display = isOpen ? 'none' : 'flex';
        if (backdrop) backdrop.style.display = isOpen ? 'none' : 'block';
    }

    closeMainMenu() {
        const drawer = document.getElementById('main-menu-drawer');
        const backdrop = document.getElementById('main-menu-backdrop');
        if (drawer) drawer.style.display = 'none';
        if (backdrop) backdrop.style.display = 'none';
    }

    toggleDevFishPanel(forceState = null) {
        const panel = document.getElementById('dev-fish-panel');
        if (!panel) return;
        soundManager.playClick();
        const next = (forceState !== null) ? !!forceState : !this.devPanelOpen;
        this.devPanelOpen = next;
        panel.style.display = next ? 'flex' : 'none';
        const btnDev = document.getElementById('btn-open-dev');
        if (btnDev) btnDev.classList.toggle('dev-active', next);

        if (next) {
            const sel = document.getElementById('dev-condition-select');
            if (sel && this.bubbleSystem && this.bubbleSystem.dailyCondition) {
                sel.value = this.bubbleSystem.dailyCondition.id;
            }
            this.renderDevFishList();
        }
    }

    getDevFishStateMeta(aiState) {
        switch (aiState) {
            case 'FEED_BITE':
                return { group: 'EAT', color: '#22c55e', label: '🟢 Cắn mồi thật', cls: 'st-eat' };
            case 'SMELL_SEEK':
                return { group: 'EAT', color: '#4ade80', label: '🟢 Đánh hơi vào ổ', cls: 'st-eat' };
            case 'GRAZE_GROUNDBAIT':
                return { group: 'EAT', color: '#10b981', label: '🟢 Ăn vụn mồi xả', cls: 'st-eat' };
            case 'INSPECT_BAIT':
                return { group: 'INSPECT', color: '#facc15', label: '🟡 Dò xét mồi/dây', cls: 'st-ins' };
            case 'PROBE_BLOW':
                return { group: 'INSPECT', color: '#fbbf24', label: '🟡 Thổi/Rỉa thử', cls: 'st-ins' };
            case 'PASS_BY_BRUSH':
                return { group: 'INSPECT', color: '#f59e0b', label: '🟡 Quệt dây đi ngang', cls: 'st-ins' };
            case 'STARTLED_FLEE':
                return { group: 'SHY', color: '#ef4444', label: '🔴 Hoảng sợ bỏ chạy', cls: 'st-shy' };
            case 'REJECT_TURN':
                return { group: 'SHY', color: '#f43f5e', label: '🔴 Chê mồi/Quay đầu', cls: 'st-shy' };
            case 'PATROL_BANK':
                return { group: 'CRUISE', color: '#38bdf8', label: '🔵 Đi ven bờ', cls: 'st-cru' };
            default:
                return { group: 'CRUISE', color: '#60a5fa', label: '🔵 Đi tuần luồng', cls: 'st-cru' };
        }
    }

    updateDevFishInspector(delta, playerPos) {
        if (!this.devPanelOpen || !this.bubbleSystem) return;
        this.drawDevFishMap(playerPos);

        this.devUiAccum += delta;
        if (this.devUiAccum >= 0.35) {
            this.devUiAccum = 0;
            this.renderDevFishList();
        }
    }

    drawDevFishMap(playerPos) {
        const canvas = document.getElementById('dev-fish-map-canvas');
        if (!canvas || !this.bubbleSystem) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const pad = 14;
        const mapW = W - pad * 2;
        const mapH = H - pad * 2;
        const hw = this.bubbleSystem.lakeHalfW || 80;
        const hd = this.bubbleSystem.lakeHalfD || 20;

        const toX = (wx) => pad + ((wx + hw) / (hw * 2)) * mapW;
        const toY = (wz) => pad + ((wz + hd) / (hd * 2)) * mapH;

        ctx.clearRect(0, 0, W, H);

        // Nền lòng hồ & lưới tọa độ
        ctx.fillStyle = '#061524';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0a253a';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.fillRect(pad, pad, mapW, mapH);
        ctx.strokeRect(pad, pad, mapW, mapH);

        // Đường lưới chia ô 20m
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
        ctx.lineWidth = 1;
        for (let gx = -60; gx <= 60; gx += 20) {
            const px = toX(gx);
            ctx.beginPath();
            ctx.moveTo(px, pad);
            ctx.lineTo(px, pad + mapH);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(pad, toY(0));
        ctx.lineTo(pad + mapW, toY(0));
        ctx.stroke();

        // Vẽ Ổ tụ cá chính (gatherCenter)
        if (this.bubbleSystem.gatherCenter) {
            const gx = toX(this.bubbleSystem.gatherCenter.x);
            const gy = toY(this.bubbleSystem.gatherCenter.y);
            ctx.beginPath();
            ctx.arc(gx, gy, 16, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
            ctx.setLineDash([4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Vẽ các ổ mồi xả (groundBaitSpots)
        (this.bubbleSystem.groundBaitSpots || []).forEach(sp => {
            const sx = toX(sp.x);
            const sy = toY(sp.z);
            const rad = Math.max(8, ((sp.radius || 10) / (hw * 2)) * mapW);
            ctx.beginPath();
            ctx.arc(sx, sy, rad, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        // Vẽ Phao câu hiện tại (activeHookTarget)
        const hook = this.bubbleSystem.activeHookTarget;
        if (hook) {
            const hx = toX(hook.x);
            const hy = toY(hook.z);
            ctx.beginPath();
            ctx.arc(hx, hy, 18, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(hx, hy, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
        }

        // Vẽ 6 Bến Câu
        if (this.environment && this.environment.fishingSpots) {
            this.environment.fishingSpots.forEach((sp, idx) => {
                const bx = toX(sp.pos.x);
                const by = Math.max(8, Math.min(H - 8, toY(sp.pos.z)));
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(bx - 3, by - 3, 6, 6);
                ctx.fillStyle = '#94a3b8';
                ctx.font = '9px monospace';
                ctx.fillText(`#${idx + 1}`, bx + 4, by + 3);
            });
        }

        // Vẽ đường luồng (trail) & từng con cá AI theo màu trạng thái
        const schools = this.bubbleSystem.fishSchools || [];
        schools.forEach(f => {
            const meta = this.getDevFishStateMeta(f.aiState);
            const fx = toX(f.x);
            const fy = toY(f.z);

            // Đường luồng bơi (Trail)
            if (f.trail && f.trail.length > 1) {
                ctx.beginPath();
                f.trail.forEach((pt, idx) => {
                    const tx = toX(pt.x);
                    const ty = toY(pt.z);
                    if (idx === 0) ctx.moveTo(tx, ty);
                    else ctx.lineTo(tx, ty);
                });
                ctx.lineTo(fx, fy);
                ctx.strokeStyle = meta.color + '66';
                ctx.lineWidth = (f.id === this.devSelectedFishId) ? 2.2 : 1.1;
                ctx.stroke();
            }

            // Mũi tên hướng bơi của cá
            const size = f.weight >= 8 ? 6.5 : f.weight >= 4 ? 5.2 : 4.0;
            const ang = f.swimAngle || 0;
            ctx.save();
            ctx.translate(fx, fy);
            ctx.rotate(ang);
            ctx.beginPath();
            ctx.moveTo(size, 0);
            ctx.lineTo(-size * 0.7, -size * 0.55);
            ctx.lineTo(-size * 0.4, 0);
            ctx.lineTo(-size * 0.7, size * 0.55);
            ctx.closePath();
            ctx.fillStyle = meta.color;
            ctx.fill();

            if (f.id === this.devSelectedFishId || f.isTaggedPrize) {
                ctx.strokeStyle = f.isTaggedPrize ? '#fde047' : '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            ctx.restore();
        });

        // Vẽ vị trí người chơi
        if (playerPos) {
            const px = toX(playerPos.x);
            const py = Math.max(8, Math.min(H - 8, toY(playerPos.z)));
            ctx.beginPath();
            ctx.arc(px, py, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }

    renderDevFishList() {
        const listEl = document.getElementById('dev-fish-list');
        if (!listEl || !this.bubbleSystem) return;
        const schools = this.bubbleSystem.fishSchools || [];
        const hook = this.bubbleSystem.activeHookTarget;

        let cEat = 0, cIns = 0, cShy = 0, cCru = 0;
        const enriched = schools.map(f => {
            const meta = this.getDevFishStateMeta(f.aiState);
            if (meta.group === 'EAT') cEat++;
            else if (meta.group === 'INSPECT') cIns++;
            else if (meta.group === 'SHY') cShy++;
            else cCru++;
            const distToFloat = hook ? Math.hypot(f.x - hook.x, f.z - hook.z) : null;
            return { f, meta, distToFloat };
        });

        const setTxt = (id, val) => { const e = document.getElementById(id); if (e) e.innerText = val; };
        const totalKg = this.bubbleSystem.getTotalBiomassKg ? this.bubbleSystem.getTotalBiomassKg() : 0;
        const tonsText = totalKg > 0 ? ` (${(totalKg / 1000).toFixed(2)} tấn)` : '';
        setTxt('dev-cnt-total', `${schools.length}${tonsText}`);
        setTxt('dev-cnt-eat', cEat);
        setTxt('dev-cnt-ins', cIns);
        setTxt('dev-cnt-shy', cShy);
        setTxt('dev-cnt-cru', cCru);
        setTxt('dev-spot-alert', `${Math.round((this.bubbleSystem.spotAlertLevel || 0) * 100)}%`);

        let filtered = enriched.filter(({ meta, distToFloat }) => {
            if (this.devFilter === 'EAT') return meta.group === 'EAT';
            if (this.devFilter === 'INSPECT') return meta.group === 'INSPECT';
            if (this.devFilter === 'SHY') return meta.group === 'SHY';
            if (this.devFilter === 'NEAR') return distToFloat !== null && distToFloat <= 15;
            return true;
        });

        // Ưu tiên con đang chọn lên đầu, sau đó ưu tiên cá gần phao / đang ăn
        filtered.sort((a, b) => {
            if (a.f.id === this.devSelectedFishId) return -1;
            if (b.f.id === this.devSelectedFishId) return 1;
            if (a.distToFloat !== null && b.distToFloat !== null) return a.distToFloat - b.distToFloat;
            return b.f.weight - a.f.weight;
        });

        listEl.innerHTML = filtered.slice(0, 28).map(({ f, meta, distToFloat }) => {
            const hungerPct = Math.round((f.hunger || 0) * 100);
            const shyPct = Math.round((f.caution || 0) * 100);
            const suspPct = Math.round(((f.mind && f.mind.suspicion) || 0) * 100);
            const isFull = (f.fullDaysLeft || 0) > 0 || (f.mind && f.mind.satiety >= 0.84);
            const fullTag = isFull ? `<span style="color:#fb923c;font-weight:800;">🤢 No (${(f.fullDaysLeft || 1).toFixed(1)} ngày)</span>` : `<span>🍽️ Đói: <b>${hungerPct}%</b></span>`;
            const daysInLake = f.daysInLake || 0;
            const ageTag = daysInLake >= 5
                ? `<span style="color:#facc15;font-weight:800;">🧓 Cá Cũ (${daysInLake}n)</span>`
                : `<span style="color:#34d399;">✨ Cá Mới (${daysInLake}n)</span>`;
            const arch = (f.mind && f.mind.archetypeLabel) ? f.mind.archetypeLabel.split('(')[0].trim() : 'Cá thường';
            const thought = (f.mind && f.mind.lastThought) ? f.mind.lastThought : '';
            const distText = distToFloat !== null ? `${distToFloat.toFixed(1)}m` : '--';
            const isSel = f.id === this.devSelectedFishId;

            return `
                <div class="dev-fish-row ${isSel ? 'dev-row-selected' : ''}" data-fid="${f.id}">
                    <div class="dev-row-top">
                        <span class="dev-fish-name">${f.speciesName} <b>${f.weight}kg</b></span>
                        <span class="dev-state-pill ${meta.cls}">${meta.label}</span>
                    </div>
                    <div class="dev-row-meta">
                        ${ageTag}
                        <span>🎭 ${arch}</span>
                        ${fullTag}
                        <span>😰 Nhát/Nghi: <b>${shyPct}%/${suspPct}%</b></span>
                        <span>📍 Phao: <b>${distText}</b></span>
                    </div>
                    ${thought ? `<div class="dev-row-thought">💭 ${thought}</div>` : ''}
                </div>
            `;
        }).join('') || '<div class="dev-empty">Không có con cá nào thuộc bộ lọc này.</div>';

        listEl.querySelectorAll('.dev-fish-row').forEach(row => {
            row.onclick = () => {
                this.devSelectedFishId = row.getAttribute('data-fid');
                this.renderDevFishList();
            };
        });
    }

    update(delta, playerPos) {
        this.drawRadar(playerPos);
        this.updateFishMindHUD();
        this.updateDevFishInspector(delta, playerPos);

        // Vận hành giờ hồ câu 24h & vé ca & đếm ngược kèo Rung & Lán Trại Đêm & Thu Chi Chủ Hồ
        this.updateOwnedLakesEconomy(delta);
        this.updateTournament(delta);
        this.updateMobileTouchControlsState();
        if (this.lakeOps) {
            this.lakeOps.update(delta);
            if (this.lakeOps.rungEvent && this.lakeOps.rungEvent.active) {
                const timerEl = document.getElementById('rung-banner-timer');
                if (timerEl) timerEl.innerText = `${Math.max(0, Math.ceil(this.lakeOps.rungEvent.timeLeft))}s`;
            }
            if (this.lakeOps.phase === 'CLOSED') {
                const campTimerEl = document.getElementById('camp-banner-timer');
                if (campTimerEl) campTimerEl.innerText = this.lakeOps.formatCampCountdown();
            }

            const clockEl = document.getElementById('ui-lake-clock');
            if (clockEl) clockEl.innerText = `🕒 Ngày ${this.lakeOps.day} • ${this.lakeOps.timeText}`;

            const ticketEl = document.getElementById('ui-ticket-status');
            if (ticketEl) {
                if (this.lakeOps.phase === 'GATE_WAIT') {
                    ticketEl.innerText = '⛩️ Chờ mở cổng 06:00';
                    ticketEl.className = 'ticket-tag ticket-wait';
                } else if (this.lakeOps.phase === 'CLOSED') {
                    ticketEl.innerText = '🔒 Hồ đóng cửa (21:00)';
                    ticketEl.className = 'ticket-tag ticket-closed';
                } else if (this.lakeOps.hasTicket) {
                    ticketEl.innerText = `🎫 Ca ${this.lakeOps.ticket.packageHours}h • Còn ${this.lakeOps.formatHours(this.lakeOps.ticket.hoursLeft)}`;
                    ticketEl.className = 'ticket-tag ticket-active';
                } else if (this.lakeOps.staffOnTheWay) {
                    ticketEl.innerText = '🚶 Nhân viên đang tới bến...';
                    ticketEl.className = 'ticket-tag ticket-wait';
                } else {
                    ticketEl.innerText = '⚠️ Chưa mua vé ca';
                    ticketEl.className = 'ticket-tag ticket-none';
                }
            }

            const habitEl = document.getElementById('ui-fish-habit');
            if (habitEl && this.bubbleSystem) {
                const mode = this.bubbleSystem.currentHabitMode;
                if (mode === 'GATHER_SPOT') habitEl.innerText = '🫧 Tăm Cá: Đang Tụ Ổ';
                else if (mode === 'BANK_FORAGE' || mode === 'BANK_PATROL') habitEl.innerText = '🌿 Tăm Cá: Đi Ven Bờ';
                else if (mode === 'SLOW_LOCKJAW') habitEl.innerText = '😴 Tăm Cá: Khóa Mồm / Ăn Chậm';
            }

            const condEl = document.getElementById('ui-lake-condition');
            if (condEl && this.bubbleSystem && this.bubbleSystem.getDailyConditionInfo) {
                const cond = this.bubbleSystem.getDailyConditionInfo();
                condEl.innerText = cond.badge || '🌤️ Cá Ăn Đều';
                condEl.style.borderColor = cond.color || '#38bdf8';
                condEl.style.color = '#ffffff';
                condEl.title = `${cond.name}\n${cond.desc}\n💡 ${cond.tip}`;
            }

            const speedBtn = document.getElementById('btn-time-speed');
            if (speedBtn) {
                speedBtn.innerText = `⏩ Giờ: ${this.lakeOps.speed}x`;
            }
        }

        // 0. Kính Ngắm Phao Cận Cảnh HD (Picture-in-Picture Float Cam)
        const pipFrame = document.getElementById('pip-float-frame');
        if (pipFrame) {
            if (this.gameplay.shouldRenderFloatPiP()) {
                pipFrame.style.display = 'flex';
                const statusEl = document.getElementById('pip-float-status');
                const footerEl = document.getElementById('pip-float-footer');
                if (this.gameplay.state === 'CASTING') {
                    statusEl.innerText = this.gameplay.castPhaseLabel || 'Đang xuống nước...';
                    statusEl.className = 'pip-status-tag pip-warn';
                    if (footerEl) footerEl.innerText = 'Phao Bầu Nano: Nằm ngang ➔ Đứng ➔ Mất bầu';
                } else {
                    const isHoDau = this.rigConfig && this.rigConfig.fishingStyle === 'HO_DAU';
                    const cal = this.gameplay.activeCalibration;
                    const visMarks = isHoDau ? '2,2' : (cal ? cal.visibleMarks : 3);
                    statusEl.innerText = isHoDau ? '⚓ Hố Đấu (2,2 nấc)' : (cal ? cal.shortTag : 'Cân 7 Câu 3');
                    statusEl.className = 'pip-status-tag';
                    if (footerEl) footerEl.innerText = `Phao Nano 11 Nấc • Nổi chuẩn ${visMarks} nấc trên mặt nước`;
                }
            } else {
                pipFrame.style.display = 'none';
            }
        }

        // 1. Gợi ý bến câu gần nhất
        const spotNearBanner = document.getElementById('spot-near-banner');
        if (this.gameplay.state === 'ROAM') {
            const nearestInfo = this.player.getNearestFishingSpot();
            if (nearestInfo && nearestInfo.canSit) {
                spotNearBanner.style.display = 'flex';
                document.getElementById('spot-near-title').innerText = `📍 ${nearestInfo.spot.name}`;
                document.getElementById('spot-near-desc').innerText = nearestInfo.spot.desc;
            } else {
                spotNearBanner.style.display = 'none';
            }
        } else {
            spotNearBanner.style.display = 'none';
        }

        // Chế độ Màn Hình Sạch Khi Bo Cá: Ẩn toàn bộ bảng nút ngồi bến, top bar, radar, prompt để nhìn cá chạy & dùng Nút Tròn gần giữa màn hình!
        const isFightingNow = (this.gameplay.state === 'FIGHTING' && !!this.gameplay.hookedFish);
        if (this.uiRoot) {
            this.uiRoot.classList.toggle('fighting-clean-view', isFightingNow);
        }
        if (!isFightingNow && this._padVisualOffset && this._padVisualOffset.active) {
            this._padVisualOffset = { dx: 0, dy: 0, active: false };
            if (this.gameplay && this.gameplay.setFightPadInput) {
                this.gameplay.setFightPadInput(0, 0, false);
            }
        }

        // 2. Seated Controls Panel (Ẩn hoàn toàn khi đang Bo Cá; thu gọn thanh 4 bước khi đã ra cần canh phao!)
        const seatedPanel = document.getElementById('seated-controls');
        const flowBar = document.getElementById('fishing-flow-bar');
        if (
            this.gameplay.state === 'SEATED' ||
            this.gameplay.state === 'LANDED' ||
            this.gameplay.state === 'CASTING' ||
            this.gameplay.state === 'FLOAT_WAIT' ||
            this.gameplay.state === 'BITING'
        ) {
            seatedPanel.style.display = 'flex';
            const isRodOut = (this.gameplay.state === 'CASTING' || this.gameplay.state === 'FLOAT_WAIT' || this.gameplay.state === 'BITING');
            if (flowBar) flowBar.style.display = isRodOut ? 'none' : 'flex';

            document.getElementById('seated-spot-name').innerText = `📍 ${this.gameplay.currentSpotName || 'Bến Câu Đài'}`;
            const baitName = this.gameplay.activeHookBait ? this.gameplay.activeHookBait.name : 'Chưa gắn mồi';
            document.getElementById('seated-bait-info').innerText = `Khay mồi: ${baitName}`;

            const castBtn = document.getElementById('btn-act-cast');
            if (this.gameplay.state === 'SEATED' || this.gameplay.state === 'LANDED') {
                castBtn.innerText = '🎣 VUNG CẦN RA Ổ CÂU';
                castBtn.classList.remove('btn-retrieve');
            } else {
                castBtn.innerText = '🔄 THU CẦN VỀ';
                castBtn.classList.add('btn-retrieve');
            }

            // Cập nhật thanh quy trình 4 bước câu đài
            this.updateFishingFlowBar();
        } else {
            seatedPanel.style.display = 'none';
        }

        // Cập nhật thống kê rọng cá & cá to nhất trên Top Bar
        this.updateAnglerStatsBadge();

        // 3. Nút giật cần thường trực (TUYỆT ĐỐI KHÔNG HIỆN POPUP CHỮ BÁO LÚC NÀO NÊN GIẬT CÁ - NGƯỜI CHƠI TỰ NHÌN PHAO)
        const alertBanner = document.getElementById('float-alert');
        const strikeContainer = document.getElementById('strike-container');
        const btnStrike = document.getElementById('btn-strike-act');

        if (alertBanner) alertBanner.style.display = 'none';

        if (this.gameplay.state === 'FLOAT_WAIT' || this.gameplay.state === 'BITING') {
            if (strikeContainer) strikeContainer.style.display = 'block';
            if (btnStrike) {
                btnStrike.innerHTML = '⚡ GIẬT CẦN <span style="font-size: 11px; opacity: 0.85; margin-left: 4px;">[SPACE / CLICK]</span>';
                btnStrike.className = 'btn-strike-huge';
            }
        } else {
            if (strikeContainer) strikeContainer.style.display = 'none';
        }

        // 4. Fight HUD Nút Hình Tròn 360° Gần Giữa Màn Hình (Ẩn sạch các nút khác để nhìn cá bo Trái/Phải/Lên/Xuống dễ dàng!)
        const fightHud = document.getElementById('fight-hud');
        const promptBox = document.getElementById('action-prompt');
        if (isFightingNow) {
            fightHud.style.display = 'block';
            if (promptBox) promptBox.style.display = 'none';
            const fish = this.gameplay.hookedFish;
            document.getElementById('fight-fish-name').innerText = `${fish.icon || '🐟'} ${fish.name} (${fish.weight}kg)`;
            document.getElementById('fight-dist').innerText = `${this.gameplay.fishDistance.toFixed(1)}m`;
            document.getElementById('tension-fill').style.width = `${Math.min(100, this.gameplay.lineTension * 100)}%`;
            document.getElementById('stamina-fill').style.width = `${Math.max(0, this.gameplay.fishStamina * 100)}%`;

            const phase = this.gameplay.fightPhase;
            const tension = this.gameplay.lineTension || 0;
            const phaseBadge = document.getElementById('fight-phase-badge');
            const dirBanner = document.getElementById('fight-dir-banner');
            const lblUp = document.getElementById('lbl-fight-up');
            const lblDown = document.getElementById('lbl-fight-down');
            const surfaceBox = document.getElementById('surface-meter-box');
            const knobEl = document.getElementById('fight-circle-knob');
            const knobIco = document.getElementById('fc-knob-ico');
            const knobTxt = document.getElementById('fc-knob-txt');
            const circlePadEl = document.getElementById('fight-circle-pad');

            const btnUp = document.getElementById('btn-fight-up');
            const btnLeft = document.getElementById('btn-fight-left');
            const btnRight = document.getElementById('btn-fight-right');
            const btnDown = document.getElementById('btn-fight-down');
            [btnUp, btnLeft, btnRight, btnDown].forEach(b => {
                if (b) b.classList.remove('required-key', 'pressed-key');
            });

            // Đồng bộ vị trí Núm Tròn ở tâm theo cả Chuột/Cảm ứng kéo lẫn phím W/A/S/D / Mũi tên!
            const leanVal = this.gameplay.playerRodLean || 0;
            const vertVal = this.gameplay.playerRodVert || 0;
            const padState = this._padVisualOffset || { dx: 0, dy: 0, active: false };
            const knobDx = padState.active ? padState.dx : (leanVal * 44);
            const knobDy = padState.active ? padState.dy : (-vertVal * 44);

            if (knobEl) {
                knobEl.style.transform = `translate(calc(-50% + ${knobDx.toFixed(1)}px), calc(-50% + ${knobDy.toFixed(1)}px))`;
                knobEl.classList.toggle('knob-active', padState.active || Math.abs(leanVal) > 0.15 || Math.abs(vertVal) > 0.15);
                knobEl.classList.toggle('knob-net-ready', phase === 'TAP_TO_NET');
            }
            if (circlePadEl) {
                circlePadEl.classList.toggle('pad-danger-tension', tension >= 0.78);
            }

            if (vertVal > 0.22 && btnUp) btnUp.classList.add('pressed-key');
            if (vertVal < -0.22 && btnDown) btnDown.classList.add('pressed-key');
            if (leanVal < -0.22 && btnLeft) btnLeft.classList.add('pressed-key');
            if (leanVal > 0.22 && btnRight) btnRight.classList.add('pressed-key');

            // CẬP NHẬT THANH VẠCH CÂN BẰNG LỰC BO TRÁI / BO PHẢI
            const bal = Math.max(-1, Math.min(1, this.gameplay.forceBalance || 0));
            const pull = Math.max(-1, Math.min(1, this.gameplay.fishPullDir || 0));
            const absBal = Math.abs(bal);
            const balBox = document.getElementById('balance-gauge-box');
            const balNeedle = document.getElementById('balance-needle');
            const balHint = document.getElementById('balance-hint-text');
            const balVector = document.getElementById('balance-fish-vector');

            if (balBox) {
                balBox.style.display = (phase === 'TAP_TO_NET') ? 'none' : 'block';
                balBox.classList.remove('bal-state-sweet', 'bal-state-warn', 'bal-state-danger');
                if (absBal <= 0.36) balBox.classList.add('bal-state-sweet');
                else if (absBal <= 0.74) balBox.classList.add('bal-state-warn');
                else balBox.classList.add('bal-state-danger');
            }
            if (balNeedle) {
                balNeedle.style.left = `${(50 + bal * 46).toFixed(1)}%`;
            }
            if (balVector) {
                const vecPct = Math.abs(pull) * 42;
                balVector.style.left = pull < 0 ? `${(50 - vecPct).toFixed(1)}%` : '50%';
                balVector.style.width = `${vecPct.toFixed(1)}%`;
            }
            if (balHint) {
                if (tension >= 0.80 && phase !== 'UNDER_PIER' && phase !== 'TAP_TO_NET') {
                    balHint.innerText = '🚨 CƯỚC CĂNG ĐỎ! Kéo nút tròn XUỐNG [▼ HẠ NHẢ] xả lực ngay!';
                } else if (absBal <= 0.36) {
                    balHint.innerText = '🎯 CÂN BẰNG CHUẨN! Kéo [▲ GHÌ LÊN] để thu cá vào bờ';
                } else if (absBal <= 0.74) {
                    balHint.innerText = bal < 0
                        ? '⬅️ Lệch TRÁI ➔ Kéo nút tròn sang [PHẢI ▶]'
                        : '➡️ Lệch PHẢI ➔ Kéo nút tròn sang [◀ TRÁI]';
                } else {
                    balHint.innerText = bal < 0
                        ? '🚨 THẲNG CẦN TRÁI! Kéo gấp sang [PHẢI ▶]!'
                        : '🚨 THẲNG CẦN PHẢI! Kéo gấp sang [◀ TRÁI]!';
                }
            }

            if (lblDown) {
                lblDown.innerText = phase === 'TAP_TO_NET' ? 'HỚT VỢT' : (tension >= 0.76 ? 'XẢ CĂNG!' : 'HẠ NHẢ');
            }
            if (knobIco && knobTxt) {
                if (phase === 'TAP_TO_NET') {
                    knobIco.innerText = '🕸️';
                    knobTxt.innerText = 'HỚT CÁ!';
                } else {
                    knobIco.innerText = '✊';
                    knobTxt.innerText = 'GHÌ & BO';
                }
            }

            const hazard = this.gameplay.stakeHazard;
            if (hazard) {
                phaseBadge.innerText = `⚠️ LAO CỌC ${hazard.side === 'LEFT' ? 'TRÁI' : 'PHẢI'} ➔ KÉO ${hazard.side === 'LEFT' ? 'PHẢI ▶' : '◀ TRÁI'} (${hazard.timeLeft.toFixed(1)}s)`;
                phaseBadge.className = 'fight-phase-tag fight-phase-hazard';
                if (hazard.requiredKey === 'right' && btnRight) btnRight.classList.add('required-key');
                else if (hazard.requiredKey === 'left' && btnLeft) btnLeft.classList.add('required-key');
                surfaceBox.style.display = 'none';
            } else {
                phaseBadge.className = 'fight-phase-tag';
                const santoTag = this.gameplay.isSantoJumping ? ' 🤸 SANTO!' : '';
                if (bal < -0.22 && phase !== 'TAP_TO_NET' && btnRight) btnRight.classList.add('required-key');
                else if (bal > 0.22 && phase !== 'TAP_TO_NET' && btnLeft) btnLeft.classList.add('required-key');

                if ((tension >= 0.78 || this.gameplay.isSantoJumping) && phase !== 'UNDER_PIER' && btnDown) {
                    btnDown.classList.add('required-key');
                }

                if (phase === 'RUN_OUT') {
                    phaseBadge.innerText = tension >= 0.78
                        ? `🚨 CĂNG CƯỚC ➔ KÉO ▼ HẠ NHẢ!${santoTag}`
                        : `▲ KÉO LÊN GHÌ CẦN + BO ◀/▶${santoTag}`;
                    if (lblUp) lblUp.innerText = 'GHÌ LÊN';
                    if (tension < 0.78 && btnUp) btnUp.classList.add('required-key');
                    surfaceBox.style.display = 'none';
                } else if (phase === 'UNDER_PIER') {
                    phaseBadge.innerText = `⚠️ CHUI GẦM CẦU! KÉO ▲ LÊN NGAY (${Math.max(0, this.gameplay.underPierTimer || 0).toFixed(1)}s)`;
                    phaseBadge.className = 'fight-phase-tag fight-phase-hazard';
                    if (lblUp) lblUp.innerText = 'DỰNG GẤP!';
                    if (btnUp) btnUp.classList.add('required-key');
                    surfaceBox.style.display = 'none';
                } else if (phase === 'RUN_LEFT') {
                    phaseBadge.innerText = `🐟 Cá lôi TRÁI ➔ Kéo [PHẢI ▶]${santoTag}`;
                    if (lblUp) lblUp.innerText = 'GHÌ LÊN';
                    if (bal <= -0.10 && btnRight) btnRight.classList.add('required-key');
                    surfaceBox.style.display = 'none';
                } else if (phase === 'RUN_RIGHT') {
                    phaseBadge.innerText = `🐟 Cá lôi PHẢI ➔ Kéo [◀ TRÁI]${santoTag}`;
                    if (lblUp) lblUp.innerText = 'GHÌ LÊN';
                    if (bal >= 0.10 && btnLeft) btnLeft.classList.add('required-key');
                    surfaceBox.style.display = 'none';
                } else if (phase === 'PIN_SURFACE') {
                    phaseBadge.innerText = '🌊 KÉO ▲ LÊN: GHÌ CÁ NGỬA BỤNG';
                    if (lblUp) lblUp.innerText = 'GHÌ NỔI';
                    if (btnUp) btnUp.classList.add('required-key');
                    surfaceBox.style.display = 'flex';
                    const pct = Math.round((this.gameplay.surfaceProgress || 0) * 100);
                    document.getElementById('surface-pct').innerText = `${pct}%`;
                    document.getElementById('surface-fill').style.width = `${pct}%`;
                } else if (phase === 'TAP_TO_NET') {
                    phaseBadge.innerText = '🕸️ BẤM TÂM TRÒN / ▼ HỚT CÁ!';
                    if (lblUp) lblUp.innerText = 'GHÌ NỔI';
                    if (btnDown) btnDown.classList.add('required-key');
                    surfaceBox.style.display = 'flex';
                    document.getElementById('surface-pct').innerText = '100%';
                    document.getElementById('surface-fill').style.width = '100%';
                }
            }

            if (this.gameplay.isCounteringCorrectly || phase === 'TAP_TO_NET') {
                dirBanner.classList.add('counter-ok');
                dirBanner.classList.remove('counter-warn');
            } else {
                dirBanner.classList.add('counter-warn');
                dirBanner.classList.remove('counter-ok');
            }

            const btnNgu = document.getElementById('btn-skill-ngulong');
            if (btnNgu) {
                const cd = this.gameplay.nguLongCooldown || 0;
                btnNgu.disabled = cd > 0;
                btnNgu.innerText = cd > 0 ? `🐉 ${cd.toFixed(0)}s` : '🐉 Q';
                btnNgu.classList.toggle('skill-recommended', cd <= 0 && phase === 'RUN_OUT');
            }
            const btnHa = document.getElementById('btn-skill-hangu');
            if (btnHa) {
                const cd = this.gameplay.haNguCooldown || 0;
                btnHa.disabled = cd > 0;
                btnHa.innerText = cd > 0 ? `🌊 ${cd.toFixed(0)}s` : '🌊 C';
                btnHa.classList.toggle('skill-recommended', cd <= 0 && phase === 'RUN_OUT');
            }
            const btnLeash = document.getElementById('btn-skill-leash');
            if (btnLeash) {
                const avail = !!this.gameplay.safetyLeashAvailable;
                btnLeash.disabled = !avail;
                btnLeash.innerText = avail ? '🪢 X' : '🪢--';
                btnLeash.classList.toggle('skill-recommended', avail && tension >= 0.78);
            }

            const btnNet = document.getElementById('btn-net-action');
            if (btnNet) {
                if (phase === 'TAP_TO_NET') {
                    btnNet.style.display = 'inline-flex';
                    btnNet.disabled = false;
                    btnNet.classList.add('pulse');
                } else {
                    btnNet.style.display = 'none';
                    btnNet.disabled = true;
                    btnNet.classList.remove('pulse');
                }
            }
        } else {
            fightHud.style.display = 'none';
            // Khi đang buông cần canh phao hoặc cá đang cắn, ẩn prompt để giải phóng tầm nhìn mặt hồ
            if (this.gameplay.state === 'FLOAT_WAIT' || this.gameplay.state === 'BITING') {
                if (promptBox) promptBox.style.display = 'none';
            }
        }
    }

    drawRadar(playerPos) {
        const canvas = document.getElementById('radar-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const scale = 0.56; // Tỷ lệ bao quát mặt hồ chữ nhật mở rộng gấp đôi (170m x 110m)

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Nền radar tròn
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 52, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10, 25, 40, 0.88)';
        ctx.fill();
        ctx.clip();

        // Vẽ khung bờ kè Hồ Chữ Nhật (170m x 110m) trên Radar
        const hw = (this.environment && this.environment.lakeHalfW ? this.environment.lakeHalfW : 85) * scale;
        const hd = (this.environment && this.environment.lakeHalfD ? this.environment.lakeHalfD : 55) * scale;
        const rx = cx + (0 - playerPos.x) * scale - hw;
        const ry = cy + (0 - playerPos.z) * scale - hd;
        ctx.fillStyle = 'rgba(14, 116, 144, 0.32)';
        ctx.fillRect(rx, ry, hw * 2, hd * 2);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx, ry, hw * 2, hd * 2);

        // 6 Bến câu quanh hồ chữ nhật
        if (this.environment.fishingSpots) {
            this.environment.fishingSpots.forEach(spot => {
                const spX = cx + (spot.pos.x - playerPos.x) * scale;
                const spY = cy + (spot.pos.z - playerPos.z) * scale;
                ctx.beginPath();
                ctx.rect(spX - 2.5, spY - 2.5, 5, 5);
                ctx.fillStyle = '#38bdf8';
                ctx.fill();
            });
        }

        // Đàn Cá AI 3D có ý thức (Đổi màu theo trạng thái AI: Đang đi tuần / Đánh hơi vào ổ / Lượn ngửi mồi / Đang đớp mồi / Hoảng sợ)
        this.bubbleSystem.fishSchools.forEach(fish => {
            const relX = (fish.x - playerPos.x) * scale;
            const relY = (fish.z - playerPos.z) * scale;
            if (Math.hypot(relX, relY) < 50) {
                let dotColor = fish.isBigCarp ? '#facc15' : '#67e8f9';
                let dotRadius = fish.isBigCarp ? 3.2 : 2.1;

                if (fish.aiState === 'FEED_BITE') {
                    dotColor = '#ef4444';
                    dotRadius = 4.2;
                } else if (fish.aiState === 'INSPECT_BAIT') {
                    dotColor = '#fb923c';
                    dotRadius = 3.8;
                } else if (fish.aiState === 'SMELL_SEEK') {
                    dotColor = '#fde047';
                    dotRadius = 3.4;
                } else if (fish.aiState === 'STARTLED_FLEE') {
                    dotColor = '#f472b6';
                }

                ctx.beginPath();
                ctx.arc(cx + relX, cy + relY, dotRadius, 0, Math.PI * 2);
                ctx.fillStyle = dotColor;
                ctx.fill();
            }
        });

        // Vị trí người chơi ở tâm Radar
        ctx.beginPath();
        ctx.arc(cx, cy, 3.6, 0, Math.PI * 2);
        ctx.fillStyle = '#00e676';
        ctx.fill();
        ctx.restore();

        // Viền ngoài Radar
        ctx.beginPath();
        ctx.arc(cx, cy, 52, 0, Math.PI * 2);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#00e5ff';
        ctx.stroke();
    }
}
