import * as THREE from 'three';
import { createRealisticHumanCharacter } from '../world/HumanCharacterBuilder.js';
import { buildRealisticFish } from '../world/FishModelBuilder.js';

/**
 * KIẾN TRÚC MẠNG MULTIPLAYER REALTIME & HỆ THỐNG BẠN CÂU 3D SỐNG ĐỘNG QUANH HỒ
 */
export const NET_EVENTS = {
    ROOM_STATE: 'ROOM_STATE',
    PLAYER_STATE_SYNC: 'PLAYER_STATE_SYNC',
    FISH_HOOKED: 'FISH_HOOKED',
    FISH_LANDED: 'FISH_LANDED',
    FISH_SNAPPED: 'FISH_SNAPPED',
    CHAT_MESSAGE: 'CHAT_MESSAGE',
    LEADERBOARD_UPDATE: 'LEADERBOARD_UPDATE'
};

export class NetworkManager {
    constructor(scene) {
        this.scene = scene;
        this.mode = 'SIMULATED_ONLINE';
        this.socket = null;
        this.roomId = 'lake_dai_yen';
        this.roomName = 'Hồ Câu Đại Yên';
        this.realOnlineCount = 1;

        let savedName = 'Bạn (Cần Thủ)';
        try {
            const n = localStorage.getItem('vn_carp_player_name');
            if (n && n.trim()) savedName = n.trim();
        } catch (e) {}

        this.localPlayer = {
            id: 'local_' + Math.floor(1000 + Math.random() * 9000),
            name: savedName,
            totalWeight: 0,
            biggestFish: 0,
            fishCount: 0,
            money: 1000000,
            momCount: 0
        };

        this.remotePlayers = new Map();
        this.realPlayers = new Map();
        this.remoteGroup = new THREE.Group();
        this.realGroup = new THREE.Group();
        this.scene.add(this.remoteGroup);
        this.scene.add(this.realGroup);

        this.eventCallbacks = [];
        this.syncAccumulator = 0;

        this.initSimulatedOnlineAnglers();
        this.autoConnectOnline();
    }

    autoConnectOnline() {
        if (typeof window === 'undefined' || !window.location) return;
        const { protocol, host, hostname, port } = window.location;
        const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';

        // Nếu đang chạy bản publish (Render/Railway/VPS/port != 3000,5173): kết nối trực tiếp cùng host!
        // Nếu đang chạy Vite dev ở localhost:3000: tự thử kết nối server local ws://localhost:8080 nếu có bật
        let targetUrl = `${wsProto}//${host}`;
        if ((hostname === 'localhost' || hostname === '127.0.0.1') && (port === '3000' || port === '5173')) {
            targetUrl = 'ws://localhost:8080';
        }
        this.connectWebSocket(targetUrl);
    }

    joinLakeRoom(lakeId, lakeName = '') {
        this.roomId = lakeId || 'lake_dai_yen';
        this.roomName = lakeName || this.roomId;
        this.clearRealPlayers();
        if (this.mode === 'WEBSOCKET' && this.socket && this.socket.readyState === 1) {
            this.socket.send(JSON.stringify({
                type: NET_EVENTS.ROOM_STATE,
                senderId: this.localPlayer.id,
                senderName: this.localPlayer.name,
                timestamp: Date.now(),
                payload: {
                    roomId: this.roomId,
                    player: this.localPlayer
                }
            }));
        }
        this.emitUIEvent({ type: 'ROOM_STATUS', mode: this.mode, roomName: this.roomName, onlineCount: this.realOnlineCount });
    }

    setPlayerName(newName) {
        const clean = (newName || '').trim().slice(0, 22);
        if (!clean) return;
        this.localPlayer.name = clean;
        try {
            localStorage.setItem('vn_carp_player_name', clean);
        } catch (e) {}
        if (this.mode === 'WEBSOCKET' && this.socket && this.socket.readyState === 1) {
            this.joinLakeRoom(this.roomId, this.roomName);
        }
        this.emitUIEvent({ type: 'LEADERBOARD' });
    }

    clearRealPlayers() {
        this.realPlayers.clear();
        while (this.realGroup.children.length > 0) {
            this.realGroup.remove(this.realGroup.children[0]);
        }
    }

    connectWebSocket(wsUrl) {
        try {
            if (this.socket) {
                try { this.socket.close(); } catch (e) {}
            }
            this.socket = new WebSocket(wsUrl);
            this.socket.onopen = () => {
                this.mode = 'WEBSOCKET';
                this.socket.send(JSON.stringify({
                    type: NET_EVENTS.ROOM_STATE,
                    senderId: this.localPlayer.id,
                    senderName: this.localPlayer.name,
                    timestamp: Date.now(),
                    payload: {
                        roomId: this.roomId,
                        player: this.localPlayer
                    }
                }));
                this.emitUIEvent({
                    type: 'SYSTEM',
                    text: `🟢 Đã kết nối máy chủ Online thật! Phòng: [${this.roomName}]`
                });
                this.emitUIEvent({ type: 'ROOM_STATUS', mode: 'WEBSOCKET', roomName: this.roomName, onlineCount: this.realOnlineCount });
            };

            this.socket.onmessage = (event) => {
                const packet = JSON.parse(event.data);
                this.handleIncomingPacket(packet);
            };

            this.socket.onclose = () => {
                this.mode = 'SIMULATED_ONLINE';
                this.realOnlineCount = 1;
                this.clearRealPlayers();
                this.emitUIEvent({ type: 'ROOM_STATUS', mode: 'SIMULATED_ONLINE', roomName: this.roomName, onlineCount: 1 });
            };

            this.socket.onerror = () => {
                this.mode = 'SIMULATED_ONLINE';
            };
        } catch (err) {
            this.mode = 'SIMULATED_ONLINE';
        }
    }

    sendPacket(type, payload) {
        const packet = {
            type,
            senderId: this.localPlayer.id,
            senderName: this.localPlayer.name,
            timestamp: Date.now(),
            payload
        };

        // Luôn xử lý local broadcast để update stats của localPlayer
        this.handleLocalBroadcast(packet);

        if (this.mode === 'WEBSOCKET' && this.socket && this.socket.readyState === 1) { // 1 = OPEN
            this.socket.send(JSON.stringify(packet));
        }
    }

    handleIncomingPacket(packet) {
        if (!packet) return;
        const type = packet.type;
        const payload = packet.payload || {};

        if (type === 'ROOM_ROSTER') {
            this.realOnlineCount = payload.onlineCount || (payload.players ? payload.players.length : 1);
            (payload.players || []).forEach(p => {
                if (p.id !== this.localPlayer.id) {
                    this.upsertRealPlayer(p.id, p.name, p);
                }
            });
            this.emitUIEvent({ type: 'ROOM_STATUS', mode: 'WEBSOCKET', roomName: this.roomName, onlineCount: this.realOnlineCount });
            this.emitUIEvent({ type: 'LEADERBOARD' });
        } else if (type === 'PLAYER_LEFT') {
            this.realOnlineCount = payload.onlineCount || Math.max(1, this.realOnlineCount - 1);
            const left = this.realPlayers.get(packet.senderId);
            if (left && left.mesh) {
                this.realGroup.remove(left.mesh);
            }
            this.realPlayers.delete(packet.senderId);
            this.emitUIEvent({ type: 'ROOM_STATUS', mode: 'WEBSOCKET', roomName: this.roomName, onlineCount: this.realOnlineCount });
            this.emitUIEvent({ type: 'LEADERBOARD' });
        } else if (type === NET_EVENTS.PLAYER_STATE_SYNC) {
            if (packet.senderId !== this.localPlayer.id) {
                this.handleRemoteSync(packet.senderId, packet.senderName, payload);
            }
        } else if (type === NET_EVENTS.LEADERBOARD_UPDATE) {
            if (packet.senderId !== this.localPlayer.id) {
                const target = this.realPlayers.get(packet.senderId);
                if (target) {
                    if (typeof payload.money === 'number') target.money = payload.money;
                    if (typeof payload.momCount === 'number') target.momCount = payload.momCount;
                    if (typeof payload.biggestFish === 'number') target.biggestFish = Math.max(target.biggestFish || 0, payload.biggestFish);
                    if (typeof payload.totalWeight === 'number') target.totalWeight = payload.totalWeight;
                    if (typeof payload.fishCount === 'number') target.fishCount = payload.fishCount;
                    this.emitUIEvent({ type: 'LEADERBOARD' });
                }
            }
        } else if (type === NET_EVENTS.FISH_HOOKED) {
            if (packet.senderId !== this.localPlayer.id) {
                this.emitUIEvent({
                    type: 'HOOKED',
                    text: `🔥 [${packet.senderName}] vừa đóng dính cá lớn! Cần đang cong vút!`
                });
            }
        } else if (type === NET_EVENTS.FISH_LANDED) {
            if (packet.senderId !== this.localPlayer.id) {
                const fish = payload.fish;
                const target = this.realPlayers.get(packet.senderId) || this.remotePlayers.get(packet.senderId);
                if (target && fish) {
                    target.fishCount += 1;
                    target.totalWeight = parseFloat((target.totalWeight + fish.weight).toFixed(2));
                    target.biggestFish = Math.max(target.biggestFish, fish.weight);
                }
                this.emitUIEvent({
                    type: 'LANDED',
                    text: `🏆 [${packet.senderName}] vừa lên bờ cụ [${fish ? fish.name : 'Cá'} - ${fish ? fish.weight : 0}kg]!`
                });
                this.emitUIEvent({ type: 'LEADERBOARD' });
            }
        } else if (type === NET_EVENTS.CHAT_MESSAGE) {
            if (packet.senderId !== this.localPlayer.id) {
                this.emitUIEvent({
                    type: 'CHAT',
                    sender: packet.senderName,
                    text: payload.message
                });
            }
        } else if (type === 'SYSTEM') {
            this.emitUIEvent(packet);
        }
    }

    upsertRealPlayer(id, name, data = {}) {
        let rp = this.realPlayers.get(id);
        if (!rp) {
            const avatar = createRealisticHumanCharacter({
                shirtColor: 0x059669,
                pantsColor: 0x1e293b,
                hatColor: 0xfacc15,
                isSeated: false
            });
            avatar.position.set(data.pos ? data.pos.x : 0, 0, data.pos ? data.pos.z : 23);
            this.realGroup.add(avatar);
            rp = {
                id,
                name: name || 'Cần Thủ Online',
                fishCount: data.fishCount || 0,
                totalWeight: data.totalWeight || 0,
                biggestFish: data.biggestFish || 0,
                isReal: true,
                mesh: avatar
            };
            this.realPlayers.set(id, rp);
        } else {
            if (name) rp.name = name;
            if (typeof data.fishCount === 'number') rp.fishCount = data.fishCount;
            if (typeof data.totalWeight === 'number') rp.totalWeight = data.totalWeight;
            if (typeof data.biggestFish === 'number') rp.biggestFish = data.biggestFish;
        }
        return rp;
    }

    handleRemoteSync(senderId, senderName, payload) {
        const rp = this.upsertRealPlayer(senderId, senderName);
        if (rp && rp.mesh && payload && payload.pos) {
            rp.mesh.position.set(payload.pos.x, 0, payload.pos.z);
        }
    }

    onEvent(cb) {
        this.eventCallbacks.push(cb);
    }

    emitUIEvent(data) {
        this.eventCallbacks.forEach(cb => cb(data));
    }

    initSimulatedOnlineAnglers() {
        while (this.remoteGroup.children.length > 0) {
            this.remoteGroup.remove(this.remoteGroup.children[0]);
        }
        this.remotePlayers.clear();

        // CHỈ ĐỂ DUY NHẤT 1 BOT NGỒI CÂU MẪU — CHỪA TOÀN BỘ 15 BẾN CÒN LẠI CHO NGƯỜI CHƠI THẬT ONLINE!
        const botsConfig = [
            {
                id: 'angler_bot_01',
                name: '🤖 Bác Bảo Chép Củ (Bot)',
                x: 42.0,
                z: -20.0,
                lookX: 42.0,
                lookZ: 0,
                umbrellaColor: 0x0ea5e9,
                shirtColor: 0x0284c7,
                sleeveColor: 0xf8fafc,
                hatType: 'BUCKET',
                hatColor: 0x0369a1,
                baitUsed: 'Ốc Ngâm Hương Liệu + Câu Hố Đấu',
                totalWeight: 16.5,
                biggestFish: 11.4,
                fishCount: 2,
                money: 1650000,
                momCount: 1
            }
        ];

        const initialTimers = [4.5];
        botsConfig.forEach((cfg, idx) => {
            const x = cfg.x;
            const z = cfg.z;
            const meshGroup = this.build3DRemoteAngler(cfg, x, z, idx);
            this.remoteGroup.add(meshGroup);

            this.remotePlayers.set(cfg.id, {
                ...cfg,
                pierX: x,
                pierZ: z,
                x,
                z,
                phaseOffset: idx * 1.7,
                meshGroup,
                state: 'WAITING_AT_GATE', // WAITING_AT_GATE -> RUSHING_TO_SPOT -> WAITING -> FIGHTING -> NETTING -> LANDED_DROP
                stateDuration: initialTimers[idx] || 8.0,
                actionTimer: initialTimers[idx] || 8.0,
                bendFactor: 0,
                standAmount: 1.0,         // 0 = đang ngồi thùng câu, 1 = đã đứng dậy
                walkOffsetX: 0,           // Dịch ngang tránh thùng câu khi đứng dậy lùi sau
                walkOffsetZ: 0,           // Âm = lùi về sau bo cá, Dương = bước lên mép sạp hớt cá
                currentFishWeight: 0,
                fishWorldPos: new THREE.Vector3(),
                splashAccum: 0
            });
        });

        this.gatherAnglersAtGate();
    }

    // Đưa tất cả cần thủ NPC ra đứng chờ trước Cổng Hồ Câu lúc 05:55 sáng (trước khi Chủ Hồ mở cửa)
    gatherAnglersAtGate() {
        let idx = 0;
        this.remotePlayers.forEach(bot => {
            const gateX = -10.4 + idx * 1.65;
            const gateZ = 61.2 + (idx % 2) * 0.85;
            bot.x = gateX;
            bot.z = gateZ;
            bot.state = 'WAITING_AT_GATE';
            bot.standAmount = 1.0;
            bot.bendFactor = 0.0;
            bot.walkOffsetX = 0;
            bot.walkOffsetZ = 0;

            const group = bot.meshGroup;
            group.position.set(gateX, 0.28, gateZ);
            group.lookAt(-8.0, 0.28, 56.0);

            if (group.userData.pierPropsGroup) {
                group.userData.pierPropsGroup.visible = false;
            }
            if (group.userData.botRodMesh) group.userData.botRodMesh.visible = false;
            if (group.userData.fishingLine) group.userData.fishingLine.visible = false;
            if (group.userData.botFloatGroup) group.userData.botFloatGroup.visible = false;
            if (group.userData.botFishGroup) group.userData.botFishGroup.visible = false;
            if (group.userData.botWaterSpray) group.userData.botWaterSpray.visible = false;
            if (group.userData.botNetGroup) group.userData.botNetGroup.visible = false;

            this.updateAnglerBadge(
                group,
                `⏳ ${bot.name}`,
                `Đang đứng cửa hồ chờ Chủ mở cửa (06:00)`,
                '#facc15'
            );
            idx++;
        });
    }

    // Khi Chủ Hồ mở cửa lúc 06:00 sáng: Mọi người bắt đầu chạy chỗ quanh hồ để tìm chỗ đẹp ngồi!
    triggerMorningSpotRush() {
        let idx = 0;
        this.remotePlayers.forEach(bot => {
            bot.state = 'RUSHING_TO_SPOT';
            bot.standAmount = 1.0;
            bot.actionTimer = 3.5 + idx * 1.8;
            idx++;
        });
        this.emitUIEvent({
            type: 'CHAT',
            sender: 'Tuấn Củ Gấu (Hà Nội)',
            text: '🏃 Chủ hồ mở cổng rồi anh em ơi! Chạy nhanh vào chiếm bến đẹp đầu gió nào!'
        });
    }

    updateAnglerBadge(group, titleText, subText, borderColor = '#38bdf8') {
        const badgeData = group.userData.badgeData;
        if (!badgeData || badgeData.lastTitle === titleText && badgeData.lastSub === subText) return;
        badgeData.lastTitle = titleText;
        badgeData.lastSub = subText;

        const { ctx, badgeTex } = badgeData;
        ctx.clearRect(0, 0, 512, 128);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(0, 0, 512, 128);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, 504, 120);
        ctx.fillStyle = '#fde047';
        ctx.font = 'bold 36px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(titleText, 256, 52);
        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 26px "Segoe UI", sans-serif';
        ctx.fillText(subText, 256, 98);
        badgeTex.needsUpdate = true;
    }

    build3DRemoteAngler(cfg, x, z, idx) {
        const group = new THREE.Group();
        group.position.set(x, 0.25, z);
        const lookX = cfg.lookX ?? 0;
        const lookZ = cfg.lookZ ?? 0;
        group.rotation.y = Math.atan2(lookX - x, lookZ - z);

        const pierPropsGroup = new THREE.Group();
        group.add(pierPropsGroup);
        group.userData.pierPropsGroup = pierPropsGroup;

        // 1. Sạp gỗ câu đài rộng rãi (để cần thủ có khoảng trống đứng dậy lùi về sau bo cá và bước lên mép sạp hớt cá)
        const deck = new THREE.Mesh(
            new THREE.BoxGeometry(3.1, 0.16, 4.0),
            new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.8 })
        );
        deck.position.set(0, 0.08, -0.15);
        deck.receiveShadow = true;
        pierPropsGroup.add(deck);

        const keepnetRim = new THREE.Mesh(
            new THREE.TorusGeometry(0.22, 0.014, 10, 24),
            new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.8, roughness: 0.2 })
        );
        keepnetRim.rotation.x = Math.PI / 2.3;
        keepnetRim.position.set(-0.95, 0.18, 1.32);
        pierPropsGroup.add(keepnetRim);

        const keepnet = new THREE.Mesh(
            new THREE.CylinderGeometry(0.21, 0.20, 1.35, 14, 3, true),
            new THREE.MeshBasicMaterial({ color: 0x0284c7, wireframe: true, transparent: true, opacity: 0.58 })
        );
        keepnet.rotation.x = Math.PI / 3;
        keepnet.position.set(-0.95, -0.18, 1.55);
        pierPropsGroup.add(keepnet);

        // 2. Ô Dù Câu Đài Vòm Parabol 12 Múi 2 Tầng Thoáng Gió + Diềm Rủ Chắn Nắng
        const umbrella = new THREE.Group();
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.026, 0.030, 2.52, 10),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.88, roughness: 0.16 })
        );
        pole.position.y = 1.25;
        umbrella.add(pole);

        if (!this._sharedBotUmbGeo) {
            const pts = [];
            for (let s = 0; s <= 10; s++) {
                const u = s / 10;
                pts.push(new THREE.Vector2(u * 1.62, 0.42 * (1.0 - Math.pow(u, 1.7))));
            }
            this._sharedBotUmbGeo = new THREE.LatheGeometry(pts, 12);
            this._sharedBotValanceGeo = new THREE.CylinderGeometry(1.62, 1.65, 0.09, 12, 1, true);
        }
        const canopyMat = new THREE.MeshStandardMaterial({ color: cfg.umbrellaColor, roughness: 0.45, side: THREE.DoubleSide });
        const canopy = new THREE.Mesh(this._sharedBotUmbGeo, canopyMat);
        canopy.position.y = 2.18;
        canopy.castShadow = true;
        umbrella.add(canopy);

        const valance = new THREE.Mesh(this._sharedBotValanceGeo, canopyMat);
        valance.position.y = 2.135;
        umbrella.add(valance);

        const topVent = new THREE.Mesh(
            new THREE.ConeGeometry(0.68, 0.22, 12, 1, true),
            new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide })
        );
        topVent.position.y = 2.60;
        umbrella.add(topVent);

        umbrella.position.set(-0.88, 0.1, -0.35);
        umbrella.rotation.z = -0.10;
        umbrella.rotation.x = 0.08;
        pierPropsGroup.add(umbrella);

        // 3. Thùng Câu Đài Địa Hình 4 Chân Inox + Bộ Khay Mồi Đa Tầng + Đèn Soi Phao Đêm Ánh Xanh
        const seatBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.48, 0.42, 0.38),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.55, roughness: 0.28 })
        );
        seatBox.position.set(0, 0.35, -0.35);
        pierPropsGroup.add(seatBox);

        const cushion = new THREE.Mesh(
            new THREE.BoxGeometry(0.46, 0.04, 0.36),
            new THREE.MeshStandardMaterial({ color: cfg.umbrellaColor, roughness: 0.6 })
        );
        cushion.position.set(0, 0.57, -0.35);
        pierPropsGroup.add(cushion);

        const tray = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.16, 0.022, 18),
            new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3, metalness: 0.35 })
        );
        tray.position.set(-0.34, 0.48, -0.08);
        pierPropsGroup.add(tray);

        const lowerTray = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.11, 0.026, 16),
            new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.85 })
        );
        lowerTray.position.set(-0.42, 0.43, 0.04);
        pierPropsGroup.add(lowerTray);

        // Luồng tia Đèn Soi Phao Ánh Xanh Lam của bạn câu (tự bật sáng khi hồ tới 18:00 tối!)
        if (!this._sharedBotBeamGeo) {
            const bGeo = new THREE.CylinderGeometry(0.02, 0.28, 5.2, 12, 1, true);
            bGeo.translate(0, -2.6, 0);
            bGeo.rotateX(-Math.PI / 2);
            this._sharedBotBeamGeo = bGeo;
        }
        const botNightBeam = new THREE.Mesh(
            this._sharedBotBeamGeo,
            new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.075,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            })
        );
        botNightBeam.position.set(0.18, 0.52, -0.10);
        botNightBeam.rotation.x = 0.14;
        botNightBeam.visible = false;
        pierPropsGroup.add(botNightBeam);
        group.userData.botNightBeam = botNightBeam;

        // 4. Nhân Vật Bạn Câu 3D (Có thể chuyển mượt từ Ngồi Câu -> Đứng Dậy Lùi Về Sau Bo Cá -> Bước Lên Hớt Vợt)
        const anglerHuman = createRealisticHumanCharacter({
            shirtColor: cfg.shirtColor,
            sleeveColor: cfg.sleeveColor,
            vestColor: 0x1e293b,
            pantsColor: 0x111827,
            hatColor: cfg.hatColor,
            hatType: cfg.hatType,
            wearGlasses: idx % 2 === 0,
            pose: 'SEATED_FISHING',
            hasVest: idx % 2 === 0
        });
        anglerHuman.position.set(0, 0.14, 0);
        group.add(anglerHuman);
        group.userData.anglerHuman = anglerHuman;

        // 5. Bạn Câu / Khán Giả Đứng Quan Sát & Cổ Vũ Phía Sau
        const spectator = createRealisticHumanCharacter({
            shirtColor: idx % 2 === 0 ? 0xf8fafc : 0xf59e0b,
            vestColor: 0x334155,
            pantsColor: 0x1e293b,
            hatColor: 0x0f172a,
            hatType: idx % 2 === 0 ? 'NONE' : 'CAP',
            wearGlasses: false,
            pose: 'STANDING',
            hasVest: false
        });
        spectator.position.set(-0.78, 0.16, -1.15);
        spectator.rotation.y = 0.25;
        pierPropsGroup.add(spectator);
        group.userData.spectator = spectator;

        // 6. CẦN CÂU ĐÀI 3D ỐNG TRỤ CARBON UỐN CONG MƯỢT MÀ (24 Vòng x 8 Cạnh nhìn rõ từ xa)
        const ROD_RINGS = 24;
        const ROD_RADIAL = 8;
        const vertCount = (ROD_RINGS + 1) * (ROD_RADIAL + 1);
        const rodPositions = new Float32Array(vertCount * 3);
        const rodColors = new Float32Array(vertCount * 3);
        const rodIndices = [];
        const rodRadii = [];

        const cCarbon = new THREE.Color(0x1e293b);
        const cRed = new THREE.Color(0xdc2626);
        const cGold = new THREE.Color(0xfacc15);
        const cTip = new THREE.Color(0xff2a00);
        const cTmp = new THREE.Color();

        for (let r = 0; r <= ROD_RINGS; r++) {
            const t = r / ROD_RINGS;
            rodRadii.push(THREE.MathUtils.lerp(0.018, 0.0035, Math.pow(t, 0.85)));
            cTmp.copy(cCarbon);
            if (t < 0.18) cTmp.copy(cRed);
            else if (Math.abs(t - 0.25) < 0.02 || Math.abs(t - 0.50) < 0.02 || Math.abs(t - 0.75) < 0.02) cTmp.copy(cGold);
            else if (t > 0.92) cTmp.copy(cTip);

            for (let s = 0; s <= ROD_RADIAL; s++) {
                const idxV = r * (ROD_RADIAL + 1) + s;
                rodColors[idxV * 3] = cTmp.r;
                rodColors[idxV * 3 + 1] = cTmp.g;
                rodColors[idxV * 3 + 2] = cTmp.b;
            }
        }
        for (let r = 0; r < ROD_RINGS; r++) {
            for (let s = 0; s < ROD_RADIAL; s++) {
                const a = r * (ROD_RADIAL + 1) + s;
                const b = (r + 1) * (ROD_RADIAL + 1) + s;
                const c = (r + 1) * (ROD_RADIAL + 1) + (s + 1);
                const d = r * (ROD_RADIAL + 1) + (s + 1);
                rodIndices.push(a, b, d, b, c, d);
            }
        }

        const botRodGeo = new THREE.BufferGeometry();
        botRodGeo.setAttribute('position', new THREE.BufferAttribute(rodPositions, 3));
        botRodGeo.setAttribute('color', new THREE.BufferAttribute(rodColors, 3));
        botRodGeo.setIndex(rodIndices);

        const botRodMesh = new THREE.Mesh(
            botRodGeo,
            new THREE.MeshBasicMaterial({ vertexColors: true })
        );
        botRodMesh.frustumCulled = false;
        group.add(botRodMesh);

        // Dây cước mảnh nối từ đọt cần bạn câu xuống phao / miệng cá
        const linePts = [];
        for (let i = 0; i < 12; i++) linePts.push(new THREE.Vector3());
        const fishingLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(linePts),
            new THREE.LineBasicMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.48 })
        );
        fishingLine.frustumCulled = false;
        group.add(fishingLine);

        // 7. PHAO ĐÀI 3D CỦA BẠN CÂU TRÊN MẶT NƯỚC (Hỗ trợ Phao Đêm OLED Phát Sáng Xanh Ngọc / Đỏ Hồng từ 18:00 tối!)
        const botFloatGroup = new THREE.Group();
        const floatBelly = new THREE.Mesh(
            new THREE.SphereGeometry(0.026, 12, 12),
            new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 })
        );
        floatBelly.scale.set(1, 2.2, 1);
        floatBelly.position.y = -0.04;
        botFloatGroup.add(floatBelly);

        const botFloatTipMat = new THREE.MeshBasicMaterial({ color: 0xff2a00 });
        const floatTip = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0065, 0.0055, 0.26, 8),
            botFloatTipMat
        );
        floatTip.position.y = 0.13;
        botFloatGroup.add(floatTip);

        const botFloatHaloMat = new THREE.MeshBasicMaterial({
            color: 0x00ffd5,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const floatOledHalo = new THREE.Mesh(
            new THREE.CylinderGeometry(0.020, 0.020, 0.28, 8),
            botFloatHaloMat
        );
        floatOledHalo.position.y = 0.13;
        botFloatGroup.add(floatOledHalo);

        const floatRing = new THREE.Mesh(
            new THREE.RingGeometry(0.015, 0.068, 18),
            new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
        );
        floatRing.rotation.x = -Math.PI / 2;
        floatRing.position.y = 0.005;
        botFloatGroup.add(floatRing);

        botFloatGroup.position.set(0, -0.25, 5.4);
        group.add(botFloatGroup);
        group.userData.botFloatTipMat = botFloatTipMat;
        group.userData.botFloatHaloMat = botFloatHaloMat;

        // 8. CÁ 3D GIẢI PHẪU THẬT CỦA BẠN CÂU (Dùng chung FishModelBuilder: Vảy 3D, Nắp Mang, Tia Vây, Râu Chép!)
        const botSpeciesPool = ['OLD_CARP', 'CARP', 'BLACK_CARP', 'GRASS_CARP'];
        const chosenSp = botSpeciesPool[idx % botSpeciesPool.length];
        const botFishGroup = new THREE.Group();
        botFishGroup.visible = false;
        const realBotFish = buildRealisticFish(chosenSp, 7.5, { noScale: true });
        botFishGroup.add(realBotFish);
        const botFishTail = realBotFish.userData ? realBotFish.userData.tailPivot : null;
        group.add(botFishGroup);

        // Vòng bọt nước trắng xóa nơi cá quẫy
        const botWaterSpray = new THREE.Mesh(
            new THREE.RingGeometry(0.06, 0.28, 16),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78, side: THREE.DoubleSide })
        );
        botWaterSpray.rotation.x = -Math.PI / 2;
        botWaterSpray.visible = false;
        group.add(botWaterSpray);

        // 9. VỢT HỚT CÁ CÁN DÀI 3D (Nằm cạnh sạp khi đợi cá -> Cầm vươn ra mặt nước hớt gọn cá lên bờ khi cá nổi!)
        const botNetGroup = new THREE.Group();
        // Gốc tọa độ (0,0,0) của botNetGroup nằm tại vị trí tay cầm cán vợt, đầu vợt vươn về phía +Z (2.4m)
        const netHandle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.013, 0.017, 2.35, 10),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.2 })
        );
        netHandle.rotation.x = Math.PI / 2;
        netHandle.position.set(0, 0, 1.15);
        botNetGroup.add(netHandle);

        const netHoop = new THREE.Mesh(
            new THREE.TorusGeometry(0.32, 0.012, 10, 24),
            new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.85, roughness: 0.2 })
        );
        netHoop.rotation.x = Math.PI / 2;
        netHoop.position.set(0, 0, 2.62);
        botNetGroup.add(netHoop);

        const netBag = new THREE.Mesh(
            new THREE.CylinderGeometry(0.32, 0.17, 0.42, 16, 2, true),
            new THREE.MeshBasicMaterial({ color: 0xe0f2fe, wireframe: true, transparent: true, opacity: 0.72 })
        );
        netBag.position.set(0, -0.21, 2.62);
        botNetGroup.add(netBag);

        // Tư thế mặc định: Vợt đặt nằm dọc trên mặt sạp gỗ bên phải cần thủ
        botNetGroup.position.set(0.68, 0.19, -0.55);
        botNetGroup.rotation.set(0.03, -0.08, 0);
        group.add(botNetGroup);

        group.userData.botRodMesh = botRodMesh;
        group.userData.botRodGeo = botRodGeo;
        group.userData.rodRadii = rodRadii;
        group.userData.ROD_RINGS = ROD_RINGS;
        group.userData.ROD_RADIAL = ROD_RADIAL;
        group.userData.fishingLine = fishingLine;
        group.userData.botFloatGroup = botFloatGroup;
        group.userData.botFishGroup = botFishGroup;
        group.userData.botFishTail = botFishTail;
        group.userData.botWaterSpray = botWaterSpray;
        group.userData.botNetGroup = botNetGroup;

        // 10. Biển Tên & Trạng Thái Realtime Trên Đầu Bạn Câu
        const badgeCanvas = document.createElement('canvas');
        badgeCanvas.width = 512;
        badgeCanvas.height = 128;
        const ctx = badgeCanvas.getContext('2d');
        const badgeTex = new THREE.CanvasTexture(badgeCanvas);

        group.userData.badgeData = {
            ctx,
            badgeTex,
            lastTitle: '',
            lastSub: ''
        };
        this.updateAnglerBadge(group, `🎣 ${cfg.name}`, `Đang câu: ${cfg.baitUsed.slice(0, 26)}`, '#38bdf8');

        const spriteMat = new THREE.SpriteMaterial({ map: badgeTex, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(0, 3.45, 0);
        sprite.scale.set(3.3, 0.82, 1);
        group.add(sprite);

        return group;
    }

    handleLocalBroadcast(packet) {
        if (packet.type === NET_EVENTS.FISH_HOOKED) {
            this.emitUIEvent({
                type: 'HOOKED',
                text: `🔥 [${this.localPlayer.name}] vừa đóng dính cá lớn! Cần đang cong vút!`
            });
        } else if (packet.type === NET_EVENTS.FISH_LANDED) {
            const fish = packet.payload.fish;
            this.localPlayer.fishCount += 1;
            this.localPlayer.totalWeight = parseFloat((this.localPlayer.totalWeight + fish.weight).toFixed(2));
            if (fish.weight > this.localPlayer.biggestFish) {
                this.localPlayer.biggestFish = fish.weight;
            }
            this.emitUIEvent({
                type: 'LANDED',
                text: `🏆 [${this.localPlayer.name}] vừa lên bờ cụ [${fish.name} - ${fish.weight}kg]!`
            });
            this.emitUIEvent({ type: 'LEADERBOARD' });
        } else if (packet.type === NET_EVENTS.CHAT_MESSAGE) {
            this.emitUIEvent({
                type: 'CHAT',
                sender: this.localPlayer.name,
                text: packet.payload.message
            });
        }
    }

    syncLocalPlayerState(delta, playerPos, gameplayState, rodBend, fishWeight) {
        this.syncAccumulator += delta;
        if (this.syncAccumulator >= 0.05) {
            this.syncAccumulator = 0;
            if (this.mode === 'WEBSOCKET' && this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.sendPacket(NET_EVENTS.PLAYER_STATE_SYNC, {
                    x: Number(playerPos.x.toFixed(2)),
                    z: Number(playerPos.z.toFixed(2)),
                    state: gameplayState,
                    rodBend: Number(rodBend.toFixed(2)),
                    fishWeight: fishWeight || 0
                });
            }
        }
    }

    update(delta, bubbleSystem) {
        const now = performance.now() * 0.001;

        this.remotePlayers.forEach(bot => {
            bot.actionTimer -= delta;

            const group = bot.meshGroup;
            const udGroup = group.userData;
            const angler = udGroup.anglerHuman;
            const spectator = udGroup.spectator;
            const botFloatGroup = udGroup.botFloatGroup;
            const botFishGroup = udGroup.botFishGroup;
            const botFishTail = udGroup.botFishTail;
            const botWaterSpray = udGroup.botWaterSpray;
            const botNetGroup = udGroup.botNetGroup;

            let targetBend = 0;
            let targetStand = 0;
            let targetWalkX = 0;
            let targetWalkZ = 0;

            let fishLocalX = 0;
            let fishLocalY = -0.25;
            let fishLocalZ = 5.4;
            let isRunningRush = false;

            // ==================== MÁY TRẠNG THÁI CHỜ MỞ CỬA & CHẠY CHỖ LÚC 6H SÁNG + 4 GIAI ĐOẠN CÂU ====================
            if (bot.state === 'WAITING_AT_GATE') {
                targetBend = 0.0;
                targetStand = 1.0;
                targetWalkX = 0.0;
                targetWalkZ = 0.0;
                if (udGroup.pierPropsGroup) udGroup.pierPropsGroup.visible = false;
                if (udGroup.botRodMesh) udGroup.botRodMesh.visible = false;
                if (udGroup.fishingLine) udGroup.fishingLine.visible = false;
                botFloatGroup.visible = false;
                botFishGroup.visible = false;
                botWaterSpray.visible = false;
                botNetGroup.visible = false;

            } else if (bot.state === 'RUSHING_TO_SPOT') {
                // Chủ hồ mở cửa lúc 06:00 sáng -> Mọi người chạy chỗ tìm bến đẹp quanh hồ!
                targetBend = 0.0;
                targetStand = 1.0;
                targetWalkX = 0.0;
                targetWalkZ = 0.0;
                isRunningRush = true;

                if (udGroup.pierPropsGroup) udGroup.pierPropsGroup.visible = false;
                if (udGroup.botRodMesh) udGroup.botRodMesh.visible = false;
                if (udGroup.fishingLine) udGroup.fishingLine.visible = false;
                botFloatGroup.visible = false;
                botFishGroup.visible = false;
                botWaterSpray.visible = false;
                botNetGroup.visible = false;

                // Đường chạy dọc bờ Nam rồi rẽ sang bờ Đông/Tây tới đúng bến câu
                let wpX = bot.pierX;
                let wpZ = bot.pierZ;
                if (Math.abs(bot.z - bot.pierZ) > 6.0 && Math.abs(bot.x - bot.pierX) > 4.0) {
                    wpX = bot.pierX;
                    wpZ = 56.5; // Chạy dọc đường bờ Nam trước rồi mới rẽ dọc bờ Đông/Tây
                }
                const dx = wpX - bot.x;
                const dz = wpZ - bot.z;
                const dist = Math.hypot(dx, dz);
                const runSpeed = 16.5;

                if (dist > 0.65) {
                    const step = Math.min(dist, runSpeed * delta);
                    bot.x += (dx / dist) * step;
                    bot.z += (dz / dist) * step;
                    group.position.set(bot.x, 0.28, bot.z);
                    group.lookAt(wpX, 0.28, wpZ);
                    this.updateAnglerBadge(
                        group,
                        `🏃 ${bot.name}`,
                        `Đang chạy chỗ chiếm bến câu đẹp...`,
                        '#10b981'
                    );
                } else if (Math.hypot(bot.pierX - bot.x, bot.pierZ - bot.z) > 0.65) {
                    const dx2 = bot.pierX - bot.x;
                    const dz2 = bot.pierZ - bot.z;
                    const dist2 = Math.hypot(dx2, dz2);
                    const step2 = Math.min(dist2, runSpeed * delta);
                    bot.x += (dx2 / dist2) * step2;
                    bot.z += (dz2 / dist2) * step2;
                    group.position.set(bot.x, 0.28, bot.z);
                    group.lookAt(bot.pierX, 0.28, bot.pierZ);
                } else {
                    // Đã chạy tới bến câu -> Hạ thùng, cắm ô dù, ngồi câu!
                    bot.x = bot.pierX;
                    bot.z = bot.pierZ;
                    group.position.set(bot.pierX, 0.25, bot.pierZ);
                    group.lookAt(bot.lookX ?? 0, 0.25, bot.lookZ ?? 0);
                    if (udGroup.pierPropsGroup) udGroup.pierPropsGroup.visible = true;
                    if (udGroup.botRodMesh) udGroup.botRodMesh.visible = true;
                    if (udGroup.fishingLine) udGroup.fishingLine.visible = true;
                    botNetGroup.visible = true;
                    bot.state = 'WAITING';
                    bot.stateDuration = 6.0 + Math.random() * 8.0;
                    bot.actionTimer = bot.stateDuration;
                }

            } else if (bot.state === 'WAITING') {
                if (udGroup.pierPropsGroup) udGroup.pierPropsGroup.visible = true;
                if (udGroup.botRodMesh) udGroup.botRodMesh.visible = true;
                if (udGroup.fishingLine) udGroup.fishingLine.visible = true;
                botNetGroup.visible = true;
                targetBend = 0.02;
                targetStand = 0.0;
                targetWalkX = 0.0;
                targetWalkZ = 0.0;

                botFloatGroup.visible = true;
                botFishGroup.visible = false;
                botWaterSpray.visible = false;

                const curH = (bubbleSystem && typeof bubbleSystem.currentHour === 'number')
                    ? ((bubbleSystem.currentHour % 24) + 24) % 24
                    : 9.0;
                const isNight18 = (curH >= 18.0 || curH < 5.8);
                if (udGroup.botNightBeam) {
                    udGroup.botNightBeam.visible = isNight18;
                }

                // Phao dập dềnh; 1.1s cuối trước khi đóng cá thì phao thụt lút mất hình (& đổi Đỏ Hồng nếu là Phao Đêm OLED)!
                if (bot.actionTimer < 1.1) {
                    const biteDip = Math.min(0.14, (1.1 - bot.actionTimer) * 0.18);
                    botFloatGroup.position.set(0, -0.25 - biteDip, 5.4);
                    if (udGroup.botFloatTipMat && udGroup.botFloatHaloMat) {
                        udGroup.botFloatTipMat.color.setHex(isNight18 ? 0xff1744 : 0xff2a00);
                        udGroup.botFloatHaloMat.color.setHex(0xff1744);
                        udGroup.botFloatHaloMat.opacity = isNight18 ? 0.62 : 0.0;
                    }
                    this.updateAnglerBadge(group, `⚡ ${bot.name}`, `Phao đang thụt lút! Chuẩn bị giật!`, '#f59e0b');
                } else {
                    botFloatGroup.position.set(0, -0.25 + Math.sin(now * 2.8 + bot.phaseOffset) * 0.008, 5.4);
                    if (udGroup.botFloatTipMat && udGroup.botFloatHaloMat) {
                        udGroup.botFloatTipMat.color.setHex(isNight18 ? 0x00ffd5 : 0xff2a00);
                        udGroup.botFloatHaloMat.color.setHex(0x00ffd5);
                        udGroup.botFloatHaloMat.opacity = isNight18 ? 0.45 : 0.0;
                    }
                    this.updateAnglerBadge(group, `🎣 ${bot.name}`, `Đang câu: ${bot.baitUsed.slice(0, 26)}`, '#38bdf8');
                }

                // Đặt vợt nằm nghỉ trên mặt sạp gỗ
                botNetGroup.position.lerp(new THREE.Vector3(0.68, 0.19, -0.55), delta * 6);
                botNetGroup.rotation.x = THREE.MathUtils.lerp(botNetGroup.rotation.x, 0.03, delta * 6);
                botNetGroup.rotation.y = THREE.MathUtils.lerp(botNetGroup.rotation.y, -0.08, delta * 6);
                botNetGroup.rotation.z = THREE.MathUtils.lerp(botNetGroup.rotation.z, 0, delta * 6);

                if (bot.actionTimer <= 0) {
                    bot.state = 'FIGHTING';
                    bot.stateDuration = 8.0 + Math.random() * 2.5;
                    bot.actionTimer = bot.stateDuration;
                    bot.currentFishWeight = parseFloat((5.2 + Math.random() * 9.5).toFixed(2));
                    const fScale = 0.85 + (bot.currentFishWeight / 14.0) * 0.85;
                    botFishGroup.scale.set(fScale, fScale, fScale);

                    this.emitUIEvent({
                        type: 'HOOKED',
                        text: `⚡ Cần thủ [${bot.name}] vừa giật dính Chép Củ (~${bot.currentFishWeight}kg) - Đang đứng dậy lùi về sau bo cá!`
                    });
                }

            } else if (bot.state === 'FIGHTING') {
                // GIAI ĐOẠN 2: ĐỨNG DẬY & LÙI VỀ PHÍA SAU SẠP GỖ ĐỂ BO CÁ2 TAY!
                const progress = Math.min(1.0, Math.max(0.0, 1.0 - bot.actionTimer / bot.stateDuration));
                targetBend = 1.0;
                targetStand = 1.0;
                targetWalkX = 0.44;   // Bước lệch sang bên phải thùng câu
                targetWalkZ = -0.82;  // Lùi hẳn về phía sau sạp gỗ để ghì cần bo cá

                botFloatGroup.visible = false;
                botFishGroup.visible = true;
                botWaterSpray.visible = true;

                // Cá chép 3D quẫy đạp, chạy ngang trái/phải và bị kéo dần từ 5.8m vào 2.35m trước mặt sạp
                const lateralAmp = 1.85 * (1.0 - progress * 0.45);
                fishLocalX = Math.sin(now * 2.1 + bot.phaseOffset) * lateralAmp;
                fishLocalZ = THREE.MathUtils.lerp(5.8, 2.35, Math.pow(progress, 0.85));
                fishLocalY = THREE.MathUtils.lerp(-0.36, -0.23, progress);

                botFishGroup.position.set(fishLocalX, fishLocalY, fishLocalZ);
                const swimDir = Math.cos(now * 2.1 + bot.phaseOffset);
                botFishGroup.rotation.y = swimDir >= 0 ? Math.PI * 0.45 : -Math.PI * 0.45;
                botFishGroup.rotation.z = progress > 0.75 ? (progress - 0.75) * 3.2 : 0; // Cuối pha cá bắt đầu nghiêng mình
                if (botFishTail) {
                    botFishTail.rotation.y = Math.sin(now * 20) * 0.52;
                }

                botWaterSpray.position.set(fishLocalX, -0.23, fishLocalZ);
                const spScale = 0.85 + Math.sin(now * 16) * 0.25;
                botWaterSpray.scale.set(spScale, spScale, 1);

                // Tạo sóng nước & bọt tăm thực tế tại đúng vị trí con cá đang quẫy
                bot.splashAccum += delta;
                if (bot.splashAccum > 0.22 && bubbleSystem) {
                    bot.splashAccum = 0;
                    bot.fishWorldPos.set(fishLocalX, -0.25, fishLocalZ);
                    group.localToWorld(bot.fishWorldPos);
                    bubbleSystem.spawnRipple(bot.fishWorldPos.x, bot.fishWorldPos.z, 0.92);
                    if (Math.random() < 0.45) {
                        bubbleSystem.spawnCarpBubbles(bot.fishWorldPos.x, bot.fishWorldPos.z, true, false);
                    }
                }

                this.updateAnglerBadge(
                    group,
                    `🔥 ${bot.name}: DÒNG CÁ ${bot.currentFishWeight}KG`,
                    `🏃 Đứng dậy lùi sau bo cá (${Math.round(progress * 100)}%)`,
                    '#ef4444'
                );

                if (bot.actionTimer <= 0) {
                    bot.state = 'NETTING';
                    bot.stateDuration = 4.2;
                    bot.actionTimer = 4.2;
                    this.emitUIEvent({
                        type: 'HOOKED',
                        text: `🕸️ Cá của [${bot.name}] đã nổi ngửa bụng! Đang bước lên cầm vợt hớt cá!`
                    });
                }

            } else if (bot.state === 'NETTING') {
                // GIAI ĐOẠN 3: BƯỚC LÊN MÉP SẠP, TAY PHẢI DỰNG CẦN CAO, TAY TRÁI CẦM VỢT ĐƯA RA HỚT CÁ LÊN BỜ!
                const progress = Math.min(1.0, Math.max(0.0, 1.0 - bot.actionTimer / bot.stateDuration));
                targetBend = 0.82;
                targetStand = 1.0;
                targetWalkX = 0.36;
                targetWalkZ = 0.48; // Bước tiến lên sát mép sạp phía trước để vươn vợt

                botFloatGroup.visible = false;
                botFishGroup.visible = true;

                // nửa đầu (0 -> 0.55): Đẩy vợt vươn ra mặt nước luồn dưới bụng cá (cá ở z = 2.25, y = -0.22)
                // nửa sau (0.55 -> 1.0): Nhấc bổng vợt chứa con cá chép bên trong lên khỏi mặt nước (y = +0.42)!
                if (progress < 0.55) {
                    const tReach = progress / 0.55;
                    fishLocalX = THREE.MathUtils.lerp(fishLocalX, 0.15, delta * 5);
                    fishLocalZ = 2.25;
                    fishLocalY = -0.22;

                    botFishGroup.position.set(0.15, fishLocalY, fishLocalZ);
                    botFishGroup.rotation.set(0, Math.PI * 0.5, 1.25); // Cá nằm nghiêng ngửa bụng trên mặt nước
                    if (botFishTail) botFishTail.rotation.y = Math.sin(now * 8) * 0.22;

                    botWaterSpray.visible = true;
                    botWaterSpray.position.set(0.15, -0.23, fishLocalZ);

                    // Tay phải cần thủ cầm cán vợt đẩy từ (0.52, 0.85, -0.2) vươn ra (-0.05, 0.72, -0.35) sao cho vành vợt (cách cán 2.62m) khớp đúng vị trí cá (z = 2.25, y = -0.25)
                    const netBaseX = THREE.MathUtils.lerp(0.55, 0.15, tReach);
                    const netBaseY = THREE.MathUtils.lerp(0.45, 0.74, tReach);
                    const netBaseZ = THREE.MathUtils.lerp(-0.45, -0.32, tReach);
                    const netPitch = THREE.MathUtils.lerp(0.15, 0.38, tReach); // Chúc đầu vợt xuống mặt nước (-Y)

                    botNetGroup.position.set(netBaseX, netBaseY, netBaseZ);
                    botNetGroup.rotation.set(netPitch, 0, 0);
                } else {
                    const tLift = (progress - 0.55) / 0.45;
                    // Nâng góc cán vợt lên (-0.18 rad) để nhấc cả vành vợt lẫn con cá lên khỏi mặt nước!
                    const netPitch = THREE.MathUtils.lerp(0.38, -0.16, tLift);
                    const netBaseY = THREE.MathUtils.lerp(0.74, 0.96, tLift);
                    const netBaseZ = THREE.MathUtils.lerp(-0.32, -0.45, tLift);

                    botNetGroup.position.set(0.15, netBaseY, netBaseZ);
                    botNetGroup.rotation.set(netPitch, 0, 0);

                    // Vị trí tâm túi vợt trong không gian group khi nâng lên:
                    const hoopZ = netBaseZ + Math.cos(netPitch) * 2.62;
                    const hoopY = netBaseY - Math.sin(netPitch) * 2.62 - 0.14;
                    fishLocalX = 0.15;
                    fishLocalY = hoopY;
                    fishLocalZ = hoopZ;

                    botFishGroup.position.set(fishLocalX, fishLocalY, fishLocalZ);
                    botFishGroup.rotation.set(0.15, Math.PI * 0.5, 1.15);
                    if (botFishTail) botFishTail.rotation.y = Math.sin(now * 24) * 0.45; // Cá giãy trong túi vợt!
                    botWaterSpray.visible = (tLift < 0.35);
                }

                this.updateAnglerBadge(
                    group,
                    `🕸️ ${bot.name}: ĐANG HỚT CÁ!`,
                    `🐟 Đưa vợt xúc Chép Củ ${bot.currentFishWeight}kg lên bờ`,
                    '#10b981'
                );

                if (bot.actionTimer <= 0) {
                    bot.state = 'LANDED_DROP';
                    bot.stateDuration = 2.8;
                    bot.actionTimer = 2.8;

                    bot.fishCount += 1;
                    bot.totalWeight = parseFloat((bot.totalWeight + bot.currentFishWeight).toFixed(2));
                    if (bot.currentFishWeight > bot.biggestFish) {
                        bot.biggestFish = bot.currentFishWeight;
                    }
                    this.emitUIEvent({
                        type: 'LANDED',
                        text: `🎉 [${bot.name}] đã dùng vợt hớt gọn Chép Củ ${bot.currentFishWeight}kg bỏ vào rọng!`
                    });
                    this.emitUIEvent({ type: 'LEADERBOARD' });
                }

            } else if (bot.state === 'LANDED_DROP') {
                // GIAI ĐOẠN 4: XOAY VỢT SANG TRÁI ĐỔ CÁ VÀO RỌNG & QUAY LẠI THÙNG NGỒI CÂU
                const progress = Math.min(1.0, Math.max(0.0, 1.0 - bot.actionTimer / bot.stateDuration));
                targetBend = 0.08;

                if (progress < 0.65) {
                    const tSwing = progress / 0.65;
                    targetStand = 1.0;
                    targetWalkX = THREE.MathUtils.lerp(0.36, 0.15, tSwing);
                    targetWalkZ = THREE.MathUtils.lerp(0.48, 0.05, tSwing);

                    // Xoay mũi vợt sang bên trái (góc Yaw âm hướng về miệng rọng tại x = -0.95, z = 1.32)
                    const netYaw = THREE.MathUtils.lerp(0, -0.46, tSwing);
                    const netPitch = THREE.MathUtils.lerp(-0.16, 0.22, tSwing);
                    const netBaseX = THREE.MathUtils.lerp(0.15, 0.18, tSwing);
                    const netBaseY = THREE.MathUtils.lerp(0.96, 0.82, tSwing);
                    const netBaseZ = THREE.MathUtils.lerp(-0.45, -1.05, tSwing);

                    botNetGroup.position.set(netBaseX, netBaseY, netBaseZ);
                    botNetGroup.rotation.set(netPitch, netYaw, 0);

                    const hoopX = netBaseX + Math.sin(netYaw) * 2.62;
                    const hoopZ = netBaseZ + Math.cos(netYaw) * Math.cos(netPitch) * 2.62;
                    const hoopY = netBaseY - Math.sin(netPitch) * 2.62 - 0.15 - (tSwing > 0.75 ? (tSwing - 0.75) * 1.4 : 0);

                    botFishGroup.visible = true;
                    botFishGroup.position.set(hoopX, hoopY, hoopZ);
                    fishLocalX = hoopX;
                    fishLocalY = hoopY;
                    fishLocalZ = hoopZ;
                } else {
                    // Đã thả cá vào rọng -> Hạ vợt xuống sạp & bước về ngồi lại lên thùng câu đài
                    botFishGroup.visible = false;
                    botWaterSpray.visible = false;
                    targetStand = 0.0;
                    targetWalkX = 0.0;
                    targetWalkZ = 0.0;

                    botNetGroup.position.lerp(new THREE.Vector3(0.68, 0.19, -0.55), delta * 6);
                    botNetGroup.rotation.set(0.03, -0.08, 0);
                }

                this.updateAnglerBadge(
                    group,
                    `🏆 ${bot.name}: LÊN CÁ ${bot.currentFishWeight}KG!`,
                    `🪣 Tổng tích lũy: ${bot.totalWeight.toFixed(1)}kg (${bot.fishCount} con)`,
                    '#fde047'
                );

                if (bot.actionTimer <= 0) {
                    bot.state = 'WAITING';
                    bot.stateDuration = 10 + Math.random() * 12;
                    bot.actionTimer = bot.stateDuration;
                }
            }

            // ==================== NỘI SUY CHUYỂN ĐỘNG CƠ THỂ BẠN CÂU (NGỒI <-> ĐỨNG DẬY <-> BƯỚC LÙI / TIẾN) ====================
            const moveLerp = Math.min(1.0, delta * 4.5);
            const prevWalkZ = bot.walkOffsetZ;
            bot.bendFactor += (targetBend - bot.bendFactor) * moveLerp;
            bot.standAmount += (targetStand - bot.standAmount) * moveLerp;
            bot.walkOffsetX += (targetWalkX - bot.walkOffsetX) * moveLerp;
            bot.walkOffsetZ += (targetWalkZ - bot.walkOffsetZ) * moveLerp;

            const isStepping = isRunningRush || Math.abs(targetWalkZ - bot.walkOffsetZ) > 0.035 || Math.abs(targetWalkX - bot.walkOffsetX) > 0.035;
            const stepCycle = isStepping ? Math.sin(now * (isRunningRush ? 15.0 : 11.0) + bot.phaseOffset) * (isRunningRush ? 0.58 : 0.36) : 0;

            const tPhase = now * 1.8 + bot.phaseOffset;
            let handWorldX = -0.18;
            let handWorldY = 0.72;
            let handWorldZ = -0.02;

            if (angler && angler.userData) {
                const ud = angler.userData;
                const b = bot.bendFactor;
                const st = bot.standAmount; // 0 = ngồi trên thùng câu, 1 = đứng thẳng chân

                // Dịch chuyển toàn bộ nhân vật khi đứng dậy bước sang bên cạnh & lùi về sau / tiến lên trước
                angler.position.set(
                    bot.walkOffsetX,
                    0.14 + Math.abs(stepCycle) * 0.03,
                    bot.walkOffsetZ
                );

                // Tư thế thân trên & 2 chân chuyển mượt giữa Ngồi (SEATED) và Đứng Bo Cá (STANDING)
                const bodyY = THREE.MathUtils.lerp(0.50, 0.84, st);
                const bodyZ = THREE.MathUtils.lerp(-0.35, 0.0, st);
                ud.upperBody.position.set(0, bodyY, bodyZ);

                // Khi đang bo cá đứng lùi về sau: ngả lưng ra sau (-0.24 rad) ghì lực; khi đang vươn vợt hớt cá: hơi rướn người về phía trước (+0.18 rad)
                let targetTorsoLean = THREE.MathUtils.lerp(0.12 + Math.sin(tPhase) * 0.02, -0.24, b);
                if (bot.state === 'NETTING') targetTorsoLean = 0.16;
                ud.upperBody.rotation.x = THREE.MathUtils.lerp(ud.upperBody.rotation.x, targetTorsoLean, moveLerp);
                ud.upperBody.rotation.y = (bot.state === 'FIGHTING') ? (-fishLocalX * 0.12) : (bot.state === 'LANDED_DROP' ? 0.35 : 0);

                // Chân phải & Chân trái: Từ tư thế ngồi vuông góc (-PI/2) duỗi thẳng ra khi đứng dậy + bước chân nhịp nhàng khi lùi/tiến!
                const hipY = THREE.MathUtils.lerp(0.52, 0.86, st);
                const hipZ = THREE.MathUtils.lerp(-0.32, 0.0, st);
                ud.rightLeg.hipPivot.position.set(-0.11, hipY, hipZ);
                ud.leftLeg.hipPivot.position.set(0.11, hipY, hipZ);

                const standRightHipX = isStepping ? stepCycle : -0.14 * st; // Chân trước chân sau vững chãi khi đứng dòng cá
                const standLeftHipX = isStepping ? -stepCycle : 0.16 * st;
                ud.rightLeg.hipPivot.rotation.x = THREE.MathUtils.lerp(-Math.PI / 2 + 0.08, standRightHipX, st);
                ud.leftLeg.hipPivot.rotation.x = THREE.MathUtils.lerp(-Math.PI / 2 + 0.08, standLeftHipX, st);

                const standKneeX = isStepping ? Math.max(0.08, Math.abs(stepCycle) * 0.85) : 0.18;
                ud.rightLeg.kneePivot.rotation.x = THREE.MathUtils.lerp(Math.PI / 2 - 0.12, standKneeX, st);
                ud.leftLeg.kneePivot.rotation.x = THREE.MathUtils.lerp(Math.PI / 2 - 0.12, standKneeX, st);

                // Đầu hướng theo con cá hoặc phao
                ud.headGroup.rotation.y = (bot.state === 'FIGHTING')
                    ? (-fishLocalX * 0.18)
                    : Math.sin(tPhase * 0.7) * 0.14;
                ud.headGroup.rotation.x = THREE.MathUtils.lerp(0.05, -0.10, b);

                // Tay phải (luôn nắm cán cần câu đài): Khi NETTING dựng cao cần hết cỡ (-1.68 rad) để kéo cá nổi vào tầm vợt
                const rightShoulderTarget = (bot.state === 'NETTING')
                    ? -1.68
                    : THREE.MathUtils.lerp(-0.85, -1.38 + Math.sin(now * 8) * 0.04 * b, b);
                ud.rightArm.shoulderPivot.rotation.x = rightShoulderTarget;
                ud.rightArm.elbowPivot.rotation.x = THREE.MathUtils.lerp(-0.75, -0.45, b);

                // Tay trái: Khi FIGHTING nắm phụ vào gốc cần (2 tay ghì cần); Khi NETTING / LANDED_DROP vươn ra cầm cán vợt hớt cá!
                if (bot.state === 'NETTING' || bot.state === 'LANDED_DROP') {
                    ud.leftArm.shoulderPivot.rotation.x = -1.15;
                    ud.leftArm.shoulderPivot.rotation.z = 0.12;
                    ud.leftArm.elbowPivot.rotation.x = -0.25;
                } else {
                    const leftBaitMotion = Math.sin(tPhase * 1.4) * 0.12 * (1 - b);
                    ud.leftArm.shoulderPivot.rotation.x = THREE.MathUtils.lerp(-0.55 + leftBaitMotion, -1.28, b);
                    ud.leftArm.shoulderPivot.rotation.z = THREE.MathUtils.lerp(-0.15, -0.34, b);
                    ud.leftArm.elbowPivot.rotation.x = THREE.MathUtils.lerp(-0.85 - leftBaitMotion, -0.55, b);
                }

                // Tọa độ bàn tay cầm cần theo vị trí đứng/ngồi thực tế của nhân vật
                handWorldX = bot.walkOffsetX - 0.18;
                handWorldY = 0.14 + bodyY + 0.22 + b * 0.24 + (bot.state === 'NETTING' ? 0.18 : 0);
                handWorldZ = bot.walkOffsetZ + bodyZ + 0.32;
            }

            // Khán giả đứng sau cổ vũ nhiệt tình khi bạn câu dính cá / hớt cá
            if (spectator && spectator.userData) {
                const sud = spectator.userData;
                const b = bot.bendFactor;
                sud.headGroup.rotation.y = Math.sin(tPhase * 0.9 + 1.0) * 0.25;
                sud.upperBody.rotation.x = b * 0.14;
                sud.rightArm.shoulderPivot.rotation.x = THREE.MathUtils.lerp(-0.22, -1.25 + Math.sin(now * 7) * 0.15 * b, b);
                sud.rightArm.elbowPivot.rotation.x = THREE.MathUtils.lerp(-0.58, -0.15, b);
            }

            // ==================== 2. CẬP NHẬT ỐNG CẦN CARBON UỐN CONG 3D & DÂY TRỤC BẠN CÂU ====================
            const botRodGeo = udGroup.botRodGeo;
            const rodRadii = udGroup.rodRadii;
            const rings = udGroup.ROD_RINGS;
            const radial = udGroup.ROD_RADIAL;
            const fishingLine = udGroup.fishingLine;

            if (botRodGeo && fishingLine) {
                const b = bot.bendFactor;
                const posAttr = botRodGeo.attributes.position;

                // Góc nâng cần: khi đợi cá hạ thấp (74 độ), khi bo cá hoặc hớt vợt dựng cao (24-32 độ)
                const baseAngle = THREE.MathUtils.degToRad(
                    bot.state === 'NETTING' ? 22 : (74 - b * 44)
                );
                const rodLen = 4.5;
                let tipX = handWorldX;
                let tipY = handWorldY;
                let tipZ = handWorldZ;

                for (let r = 0; r <= rings; r++) {
                    const s = r / rings;
                    const dist = s * rodLen;
                    // Độ võng chữ C mượt mà hướng về phía con cá đang quẫy
                    const archY = Math.cos(baseAngle) * dist - Math.pow(s, 1.75) * (0.06 + b * 1.42);
                    const archZ = Math.sin(baseAngle) * dist;
                    const lateralPull = (bot.state === 'FIGHTING' || bot.state === 'NETTING')
                        ? (fishLocalX - handWorldX) * Math.pow(s, 1.5) * 0.48
                        : 0;

                    const cx = handWorldX + lateralPull;
                    const cy = handWorldY + archY;
                    const cz = handWorldZ + archZ;

                    const radius = rodRadii[r];
                    for (let k = 0; k <= radial; k++) {
                        const theta = (k / radial) * Math.PI * 2;
                        const idxV = r * (radial + 1) + k;
                        posAttr.setXYZ(
                            idxV,
                            cx + Math.cos(theta) * radius,
                            cy + Math.sin(theta) * radius,
                            cz
                        );
                    }

                    if (r === rings) {
                        tipX = cx;
                        tipY = cy;
                        tipZ = cz;
                    }
                }
                posAttr.needsUpdate = true;

                // Dây cước nối từ đọt cần (tipX, tipY, tipZ) xuống đúng vị trí phao (khi WAITING) hoặc miệng cá (khi FIGHTING / NETTING)
                const lineAttr = fishingLine.geometry.attributes.position;
                const lineCount = lineAttr.count;
                const endX = (bot.state === 'WAITING') ? 0 : fishLocalX;
                const endY = (bot.state === 'WAITING') ? -0.25 : fishLocalY + 0.04;
                const endZ = (bot.state === 'WAITING') ? 5.4 : fishLocalZ;
                const sag = (bot.state === 'WAITING') ? 0.08 : 0.0;

                for (let i = 0; i < lineCount; i++) {
                    const t = i / (lineCount - 1);
                    const lx = THREE.MathUtils.lerp(tipX, endX, t);
                    const lz = THREE.MathUtils.lerp(tipZ, endZ, t);
                    const ly = THREE.MathUtils.lerp(tipY, endY, t) - Math.sin(t * Math.PI) * sag;
                    lineAttr.setXYZ(i, lx, ly, lz);
                }
                lineAttr.needsUpdate = true;
            }
        });
    }

    syncLocalStats(stats = {}) {
        if (typeof stats.money === 'number') this.localPlayer.money = stats.money;
        if (typeof stats.momCount === 'number') this.localPlayer.momCount = stats.momCount;
        if (typeof stats.biggestFish === 'number') this.localPlayer.biggestFish = Math.max(this.localPlayer.biggestFish || 0, stats.biggestFish);
        if (this.mode === 'WEBSOCKET' && this.socket && this.socket.readyState === 1) {
            this.socket.send(JSON.stringify({
                type: NET_EVENTS.LEADERBOARD_UPDATE,
                senderId: this.localPlayer.id,
                senderName: this.localPlayer.name,
                timestamp: Date.now(),
                payload: {
                    money: this.localPlayer.money,
                    momCount: this.localPlayer.momCount,
                    biggestFish: this.localPlayer.biggestFish,
                    totalWeight: this.localPlayer.totalWeight,
                    fishCount: this.localPlayer.fishCount
                }
            }));
        }
    }

    getLeaderboard(mode = 'HUGO') {
        const list = [{ ...this.localPlayer, isLocal: true }];
        this.realPlayers.forEach(rp => {
            list.push({
                id: rp.id,
                name: `🟢 ${rp.name}`,
                totalWeight: rp.totalWeight || 0,
                biggestFish: rp.biggestFish || 0,
                fishCount: rp.fishCount || 0,
                money: typeof rp.money === 'number' ? rp.money : 1000000,
                momCount: rp.momCount || 0,
                isLocal: false,
                isReal: true
            });
        });
        this.remotePlayers.forEach(bot => {
            list.push({
                id: bot.id,
                name: bot.name,
                totalWeight: bot.totalWeight || 0,
                biggestFish: bot.biggestFish || 0,
                fishCount: bot.fishCount || 0,
                money: typeof bot.money === 'number' ? bot.money : 1000000,
                momCount: bot.momCount || 0,
                isLocal: false
            });
        });
        if (mode === 'HUGO') return list.sort((a, b) => (b.biggestFish || 0) - (a.biggestFish || 0));
        if (mode === 'MONEY') return list.sort((a, b) => (b.money || 0) - (a.money || 0));
        if (mode === 'MOM') return list.sort((a, b) => (b.momCount || 0) - (a.momCount || 0));
        return list.sort((a, b) => (b.totalWeight || 0) - (a.totalWeight || 0));
    }
}
