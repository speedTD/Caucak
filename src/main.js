import * as THREE from 'three';
import { soundManager } from './audio/SoundManager.js';
import { BAIT_SHOP_ITEMS } from './data/BaitShopData.js';
import { LAKES_DATA } from './data/LakesData.js';
import { Environment } from './world/Environment.js';
import { PlayerController } from './world/PlayerController.js';
import { FishBubbleSystem } from './systems/FishBubbleSystem.js';
import { FishingGameplay, FISHING_STATES } from './systems/FishingGameplay.js';
import { BaitMixingSystem } from './systems/BaitMixingSystem.js';
import { NetworkManager, NET_EVENTS } from './network/NetworkManager.js';
import { UIManager } from './ui/UIManager.js';

class GameApp {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.clock = new THREE.Clock();

        this.initThree();
        this.initSystems();
        this.initEventListeners();

        // Tải hồ mặc định và hiển thị bảng lựa chọn hồ câu đầu ngày
        this.currentLake = LAKES_DATA[0];
        this.loadLake(this.currentLake);

        // Mở màn hình lựa chọn "Hôm nay đi hồ câu nào" ngay khi vào game
        setTimeout(() => {
            this.ui.openWelcomeLakeModal();
        }, 150);

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.08, 1000);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.08;
        this.renderer.autoClear = false;
        this.container.appendChild(this.renderer.domElement);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    initSystems() {
        this.environment = new Environment(this.scene);
        this.player = new PlayerController(this.camera, this.renderer.domElement, this.environment);
        this.bubbleSystem = new FishBubbleSystem(this.scene);
        this.gameplay = new FishingGameplay(this.scene, this.camera, this.bubbleSystem, this.environment);
        this.mixingSystem = new BaitMixingSystem();
        this.network = new NetworkManager(this.scene);

        // Mồi mặc định
        this.gameplay.activeHookBait = this.mixingSystem.mixedBaits.hookBait;
        this.gameplay.activeGroundBait = this.mixingSystem.mixedBaits.groundBait;

        // UI Manager
        this.ui = new UIManager(
            this.gameplay,
            this.mixingSystem,
            this.bubbleSystem,
            this.player,
            this.environment,
            BAIT_SHOP_ITEMS,
            (lake) => this.loadLake(lake),
            this.network
        );
    }

    loadLake(lake) {
        this.currentLake = lake;
        this.environment.loadLake(lake);
        this.gameplay.currentLake = lake;
        this.network.initSimulatedOnlineAnglers();
        if (this.network && typeof this.network.joinLakeRoom === 'function') {
            this.network.joinLakeRoom(lake.id, lake.name);
        }
        this.ui.setLakeName(lake.name);
        if (this.ui.lakeOps) {
            this.ui.lakeOps.setLake(lake);
        }
        this.ui.startMorningAtGate(true);
    }

    initEventListeners() {
        const startAudio = () => {
            soundManager.init();
            window.removeEventListener('click', startAudio);
            window.removeEventListener('keydown', startAudio);
        };
        window.addEventListener('click', startAudio);
        window.addEventListener('keydown', startAudio);

        // Phím tương tác nhanh
        window.addEventListener('keydown', (e) => {
            if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

            if (e.code === 'KeyE') {
                if (this.gameplay.state === FISHING_STATES.ROAM) {
                    if (this.environment && !this.environment.isGateOpen) {
                        this.ui.openLakeGateAndStartRush();
                        return;
                    }
                    const nearestInfo = this.player.getNearestFishingSpot();
                    if (nearestInfo && nearestInfo.canSit) {
                        this.ui.sitAtSpot(nearestInfo.spot);
                    } else if (this.player.isNearWaterBank()) {
                        this.ui.sitAtCustomBankPosition(this.player.position);
                    } else {
                        this.ui.showPrompt('⚠️ Hãy lại gần một Bến Cầu Gỗ hoặc mép nước để ngồi câu!');
                    }
                } else if (
                    this.gameplay.state === FISHING_STATES.SEATED ||
                    this.gameplay.state === FISHING_STATES.FLOAT_WAIT ||
                    this.gameplay.state === FISHING_STATES.LANDED
                ) {
                    this.gameplay.standUp();
                    this.player.setSeated(false);
                    this.ui.showPrompt('🚶 Đã đứng dậy! Đi dạo quanh hồ tìm chùm tăm cá mới.');
                }
            }

            if (e.code === 'KeyF') {
                if (
                    this.gameplay.state === FISHING_STATES.SEATED ||
                    this.gameplay.state === FISHING_STATES.FLOAT_WAIT ||
                    this.gameplay.state === FISHING_STATES.LANDED
                ) {
                    const res = this.gameplay.castGroundBait();
                    this.ui.showPrompt(res.message);
                    if (res.needMix) this.ui.openMixModal();
                }
            }

            if (e.code === 'KeyX' && this.gameplay.state === FISHING_STATES.FIGHTING) {
                const res = this.gameplay.triggerSafetyLeash();
                if (res && res.message) this.ui.showPrompt(res.message);
            }
        });

        // Xử lý chuột trái trên Canvas
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                if (this.gameplay.state === FISHING_STATES.SEATED || this.gameplay.state === FISHING_STATES.LANDED) {
                    this.ui.handleAttemptCast();
                } else if (this.gameplay.state === FISHING_STATES.BITING || this.gameplay.state === FISHING_STATES.FLOAT_WAIT) {
                    const res = this.gameplay.strikeRod();
                    this.ui.showPrompt(res.message);
                }
            } else if (e.button === 2) {
                if (this.gameplay.state === FISHING_STATES.CASTING || this.gameplay.state === FISHING_STATES.FLOAT_WAIT) {
                    this.gameplay.retrieveRod();
                    this.ui.showPrompt('Đã thu cần về!');
                }
            }
        });

        window.addEventListener('fish_escaped', (e) => {
            this.ui.showPrompt(e.detail.message);
        });

        window.addEventListener('fish_hooked_net', (e) => {
            this.network.sendPacket(NET_EVENTS.FISH_HOOKED, { fish: e.detail.fish });
        });

        window.addEventListener('fish_landed_net', (e) => {
            this.network.sendPacket(NET_EVENTS.FISH_LANDED, { fish: e.detail.fish });
            this.ui.onFishLanded(e.detail.fish);
        });
    }

    animate() {
        requestAnimationFrame(this.animate);

        const delta = Math.min(this.clock.getDelta(), 0.1);

        this.player.update(delta);
        this.bubbleSystem.update(delta, this.player.position);

        // Cập nhật vật lý dòng cá TRƯỚC khi cập nhật hình học cần câu Spline
        if (this.gameplay.state === FISHING_STATES.FIGHTING) {
            const fightRes = this.gameplay.updateFight(delta, this.player.keys);
            if (fightRes && fightRes.finished && fightRes.message) {
                this.ui.showPrompt(fightRes.message);
            }
        }

        this.gameplay.update(delta);
        this.environment.update(delta, this.bubbleSystem);
        this.network.update(delta, this.bubbleSystem);
        this.network.syncLocalPlayerState(
            delta,
            this.player.position,
            this.gameplay.state,
            this.gameplay.lineTension,
            this.gameplay.hookedFish ? this.gameplay.hookedFish.weight : 0
        );
        this.ui.update(delta, this.player.position);

        // 1. Render Màn Hình Chính (Full Viewport)
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.renderer.setViewport(0, 0, w, h);
        this.renderer.setScissor(0, 0, w, h);
        this.renderer.setScissorTest(false);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);

        // 2. Render Kính Ngắm Phao Cận Cảnh HD (Picture-in-Picture Float Cam) góc trên bên trái
        if (this.gameplay.shouldRenderFloatPiP()) {
            const pipW = 230;
            const pipH = 245;
            const pipX = 20;
            // Trong WebGL, gốc Y=0 nằm ở cạnh dưới màn hình
            const pipY = h - 75 - pipH;

            this.gameplay.pipCamera.aspect = pipW / pipH;
            this.gameplay.pipCamera.updateProjectionMatrix();

            // Tạm ẩn FPV Rig (và ẩn dây trục khi chân phao đã lặn xuống dưới mặt nước) để Kính Ngắm Phao không bao giờ bị lộ dây thừa
            const prevFpvVis = this.gameplay.fpvRig.visible;
            this.gameplay.fpvRig.visible = false;
            const prevLineVis = this.gameplay.fishingLine ? this.gameplay.fishingLine.visible : false;
            if (this.gameplay.fishingLine && (this.gameplay.state !== FISHING_STATES.CASTING || this.gameplay.castElapsed > 1.35)) {
                this.gameplay.fishingLine.visible = false;
            }

            this.renderer.setViewport(pipX, pipY, pipW, pipH);
            this.renderer.setScissor(pipX, pipY, pipW, pipH);
            this.renderer.setScissorTest(true);
            this.renderer.clearDepth();
            this.renderer.render(this.scene, this.gameplay.pipCamera);

            this.gameplay.fpvRig.visible = prevFpvVis;
            if (this.gameplay.fishingLine) {
                this.gameplay.fishingLine.visible = prevLineVis;
            }
            this.renderer.setScissorTest(false);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new GameApp();
});
