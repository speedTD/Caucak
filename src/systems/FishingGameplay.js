import * as THREE from 'three';
import { soundManager } from '../audio/SoundManager.js';
import { createRodGripTexture, createCarbonWeaveTexture, createFloatBodyTexture } from '../world/TextureGenerator.js';
import { BaitMixingSystem } from './BaitMixingSystem.js';
import { buildRealisticFish } from '../world/FishModelBuilder.js';
import { SPECIES, inferSpeciesKey } from '../data/FishProfiles.js';
import { getDefaultEquipmentLevels, computeEquipmentBonuses } from '../data/EquipmentUpgradeData.js';
import { STARTER_RODS, getCalibrationById, getLineSpec, getDefaultRigState } from '../data/RigSetupData.js';

export const FISHING_STATES = {
    ROAM: 'ROAM',             // Đi dạo quanh hồ
    SEATED: 'SEATED',         // Đã ngồi vào bến câu đài
    CASTING: 'CASTING',       // Đang vung cần ném mồi
    FLOAT_WAIT: 'FLOAT_WAIT', // Phao đang dập dềnh đợi cá
    BITING: 'BITING',         // Cá đang ăn mồi & báo tín hiệu phao
    FIGHTING: 'FIGHTING',     // Đang dòng cá / bo cá thời gian thực
    LANDED: 'LANDED'          // Vợt cá thành công
};

export const BITE_TYPES = {
    QUICK_TAP: 'QUICK_TAP',       // Nháy đè 1 mắt dứt khoát
    NIBBLE_DANCE: 'NIBBLE_DANCE', // Nhấp nháy dập dềnh rồi đè sâu
    DUNK_AND_RUN: 'DUNK_AND_RUN', // Mất hình thụt lút dầm tăm chạy
    ROD_PULL: 'ROD_PULL',         // Thụt lút lôi cần chúc ngọn
    FLOAT_LIFT: 'FLOAT_LIFT',     // Bềnh phao nhấc từng nấc kinh điển
    FLOAT_PRESS: 'FLOAT_PRESS'    // Đè phao do nặng hương liệu: phao chìm từ từ dần xuống xong lại nổi lên!
};

export const FIGHT_PHASES = {
    RUN_OUT: 'RUN_OUT',               // Cá phi thẳng ra ngoài -> Dựng cần hoặc dùng Ngự Long (Q) / Hạ Ngư (C)
    RUN_LEFT: 'RUN_LEFT',             // Cá lao sang Trái -> Ghìm cần (Mũi tên Trái/Phải)
    RUN_RIGHT: 'RUN_RIGHT',           // Cá lao sang Phải -> Ghìm cần (Mũi tên Phải/Trái)
    UNDER_PIER: 'UNDER_PIER',         // Cá lao vào khu vực chân đứng / gầm cầu -> BẮT BUỘC DỰNG CẦN (Lên/W) kẻo cuốn chân cầu bong mất!
    PIN_SURFACE: 'PIN_SURFACE',       // Cá mệt -> Giữ Mũi tên Lên để ghì cá nổi lên mặt nước
    TAP_TO_NET: 'TAP_TO_NET'          // Cá đã nổi -> Bấm Mũi tên Xuống / Space để gõ lực hớt cá
};

export class FishingGameplay {
    constructor(scene, camera, bubbleSystem, environment = null) {
        this.scene = scene;
        this.camera = camera;
        this.bubbleSystem = bubbleSystem;
        this.environment = environment;

        this.state = FISHING_STATES.ROAM;
        this.currentLake = null;
        this.playerSeatPos = null;
        this.currentSpotName = '';

        // Trang bị hiện tại
        this.currentRod = { length: 5.4, hardness: '5H', name: 'Cần Handing Long Vân 5.4m (5 Lóng Carbon Liền Khối)' };
        this.currentFloat = { sensitivity: 95, visibleMarks: 11, name: 'Phao Nano Lông Công Kim Long' };
        this.activeHookBait = null;
        this.activeGroundBait = null;

        // FPV Viewmodel Rig gắn vào Camera
        this.fpvRig = new THREE.Group();
        this.camera.add(this.fpvRig);
        this.scene.add(this.camera);

        // Camera phụ Picture-in-Picture (PiP) Zoom cận cảnh Phao Đài thời gian thực
        this.pipCamera = new THREE.PerspectiveCamera(15, 1.0, 0.1, 120);

        // Cần câu đài Carbon Liền Khối Uốn Cong Mượt (Continuous Deformable Tube Mesh)
        this.rodRootGroup = null;
        this.rodMesh = null;
        this.rodGeo = null;
        this.ROD_RINGS = 64;
        this.ROD_RADIAL = 18;
        this.ROD_LENGTH = 4.4;
        this.rodRingRadii = [];
        this.rodTipLocalPos = new THREE.Vector3(0, 4.4, 0);
        this.baitTray = null;
        this.rodRestSupport = null;
        this.landingNetGroup = null;

        // Vị trí và Tỷ lệ Cần Câu khi Ngồi thường vs Bo Cá Toàn Cảnh (Dynamic Full-Rod Fighting Cam)
        this.baseRodPos = new THREE.Vector3(0.24, -0.29, -0.38);
        this.fightRodPos = new THREE.Vector3(0.30, -0.44, -0.76);
        this.currentRodPos = new THREE.Vector3(0.24, -0.29, -0.38);
        this.normalFov = 68;
        this.fightFov = 78;
        this.rodCurrentScale = 1.0;

        // Trạng thái Vật Lý Uốn Lóng Cần (Spring-Damper Continuous Curve)
        this.currentPitchDeg = -74;
        this.currentYawDeg = 6;
        this.currentRollDeg = 0;
        this.currentBendDown = 0;     // Độ uốn dọc của thân cần (0 -> 1.4)
        this.currentBendSide = 0;     // Độ uốn ngang của thân cần (-0.6 -> +0.6)
        this.bendVelocity = 0;
        this.headShakeTime = 0;

        // Kịch bản hiểm hóc: Cá lao vào cọc chân cầu gỗ / cọc tre ven bờ & Chiêu thức Bo Cá (Ngự Long / Hạ Ngư)
        this.stakeHazard = null;
        this.stakeHazardTimer = 0;
        this.hasTriggeredStakeHazard = false;
        this.activeFightSkill = null; // { type: 'NGU_LONG' | 'HA_NGU', timer: number, elapsed: number }
        this.nguLongCooldown = 0;
        this.haNguCooldown = 0;
        this.underPierTimer = 0;
        this.underPierHold = 0;

        // Cơ chế động ổ & vỡ ổ khi giật trượt nhiều lần liên tiếp (cá ăn chậm, nửa tiếng - 1 tiếng hồ mới có nhịp)
        this.consecutiveMisses = 0;
        this.groundBaitsCastCount = 0;
        this.selectedRodLength = 5.4; // Tầm cần câu đài có thể chọn: 3.6m / 4.5m / 5.4m / 6.3m / 7.2m

        // Trạng thái độ tan & nguyên vẹn của viên mồi trên lưỡi câu (1.0 -> 0.0: tan hết trơ lưỡi sắt)
        this.hookBaitIntegrity = 1.0;
        this.isBareHook = false;
        this.crumbSurfaceMesh = null;
        this.baitTrayBalls = [];

        // Phao đài 3D, Dây trục mảnh khớp chân phao & Cá Chép 3D
        this.floatGroup = null;
        this.floatShaderUniforms = {
            uWaterTint: { value: new THREE.Color(0x063b2d) },
            uSubmergeDepth: { value: 0.036 }
        };
        this.fishingLine = null;
        this.LINE_POINTS_COUNT = 32;
        this.fish3DGroup = null;
        this.waterEntrySpray = null;

        this.floatTargetPos = new THREE.Vector3();
        this.floatCurrentPos = new THREE.Vector3();
        this.floatVerticalOffset = 0;
        this.floatBobAngle = 0;

        // Trạng thái 3 giai đoạn phao xuống nước:
        // (Quăng bay -> 1. Nằm ngang trên mặt nước -> 2. Đứng dậy nổi bầu -> 3. Chìm dần tới khi mất bầu phao)
        this.castElapsed = 0;
        this.castStartPos = new THREE.Vector3();
        this.castPhaseLabel = '';
        this.equilibriumFloatY = -0.095; // Mực cân phao chuẩn (đỉnh bầu phao y=0 chìm sâu 9.5cm dưới mặt nước -> mất bầu phao)
        this.hasSpawnedLandingSplash = false;
        this.hasSpawnedBellyRipple = false;
        this.floatFootAnchor = null;

        // Cá tiếp cận ổ & cắn phao thời gian thực
        this.biteType = null;
        this.biteTimer = 0;
        this.biteMaxTime = 0;
        this.bitePromptText = '';
        this.waitFishTimer = 0;
        this.fishApproaching = false;
        this.approachProgress = 0;
        this.approachStartPos = new THREE.Vector2();

        // Trạng thái Bo Cá Vật Lý Thời Gian Thực
        this.hookedFish = null;
        this.fightPhase = FIGHT_PHASES.RUN_OUT;
        this.phaseTimer = 0;
        this.phaseGraceTimer = 0;
        this.lineTension = 0.35;
        this.fishStamina = 1.0;
        this.fishDistance = 6.2;
        this.fishLateralX = 0.0;
        this.surfaceProgress = 0.0;
        this.isNettingAnim = false;
        this.actionFeedback = '';
        this.isCounteringCorrectly = false;

        this.singSoundCooldown = 0;
        this.wakeSplashCooldown = 0;

        // Hệ thống cấp độ 7 trang bị câu đài & Bộ Set Trục/Thẻo/Cân Phao/Cần khởi đầu
        this.equipmentLevels = getDefaultEquipmentLevels();
        this.equipBonuses = computeEquipmentBonuses(this.equipmentLevels);
        this.rigConfig = getDefaultRigState();
        this.activeRodMaxFishKg = 7;
        this.activeMainLineSpec = getLineSpec(this.rigConfig.mainLineSize);
        this.activeLeaderSpec = getLineSpec(this.rigConfig.leaderSize);
        this.activeCalibration = getCalibrationById(this.rigConfig.calibrationId);

        this.initFPVViewmodel();
        this.initFloatModel();
        this.initFishingLine();
        this.initFish3DAndNet();
        this.applyEquipmentUpgrades(this.equipmentLevels);
    }

    // XÂY DỰNG CẦN CÂU ĐÀI KHỚP RÚT 5 LÓNG (TELESCOPIC JOINTED CARBON POLE) + TAY NGƯỜI THẬT
    initFPVViewmodel() {
        this.fpvRig.visible = false;

        // 1. KHAY / PAD ĐỰNG MỒI TỪ TÍNH ĐA TẦNG (NÂNG CẤP TỪ 1 TẦNG -> 2 TẦNG -> 3 TẦNG + CHẮN GIÓ CARBON)
        this.baitTray = new THREE.Group();
        this.baitTrayRimMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.15 });
        const rim = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.17, 0.025, 28),
            this.baitTrayRimMat
        );
        this.baitTray.add(rim);

        this.baitTrayInnerMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.25, metalness: 0.4 });
        const inner = new THREE.Mesh(
            new THREE.CylinderGeometry(0.165, 0.165, 0.028, 28),
            this.baitTrayInnerMat
        );
        this.baitTray.add(inner);

        // Khay mồi tầng 2 đựng bột mồi xả tơi (hiện từ Lv.2 trở lên)
        this.baitTrayLowerBowl = new THREE.Mesh(
            new THREE.CylinderGeometry(0.135, 0.12, 0.032, 24),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.5 })
        );
        this.baitTrayLowerBowl.position.set(0.08, -0.045, 0.06);
        this.baitTray.add(this.baitTrayLowerBowl);

        // Khay mồi tầng 3 inox vuốt mồi chuyên nghiệp (hiện từ Lv.3 trở lên)
        this.baitTrayThirdBowl = new THREE.Mesh(
            new THREE.CylinderGeometry(0.11, 0.10, 0.026, 24),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.18 })
        );
        this.baitTrayThirdBowl.position.set(-0.11, -0.04, 0.09);
        this.baitTrayThirdBowl.visible = false;
        this.baitTray.add(this.baitTrayThirdBowl);

        // Vành chắn gió & chụp mồi VIP (hiện ở Lv.4)
        this.baitTrayCover = new THREE.Mesh(
            new THREE.TorusGeometry(0.182, 0.012, 10, 28, Math.PI * 1.2),
            new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.15 })
        );
        this.baitTrayCover.rotation.x = Math.PI / 2;
        this.baitTrayCover.rotation.z = -0.3;
        this.baitTrayCover.position.set(0, 0.022, 0);
        this.baitTrayCover.visible = false;
        this.baitTray.add(this.baitTrayCover);

        const crumbSurface = new THREE.Mesh(
            new THREE.CylinderGeometry(0.125, 0.125, 0.012, 24),
            new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.95 })
        );
        crumbSurface.position.set(0.08, -0.028, 0.06);
        crumbSurface.visible = false; // Ẩn mồi xả cho đến khi người chơi thực sự pha mồi
        this.crumbSurfaceMesh = crumbSurface;
        this.baitTray.add(crumbSurface);

        // 4 viên mồi câu vê tròn trên đĩa từ (Chỉ hiện khi đã pha mồi và giảm dần khi vê mồi ra cần)
        this.baitTrayBalls = [];
        const ballCoords = [
            [-0.048, 0.026, 0.022],
            [0.028, 0.026, 0.022],
            [-0.022, 0.026, -0.042],
            [0.048, 0.026, -0.036]
        ];
        for (let i = 0; i < ballCoords.length; i++) {
            const bBall = new THREE.Mesh(
                new THREE.SphereGeometry(0.025, 14, 14),
                new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.85 })
            );
            bBall.position.set(ballCoords[i][0], ballCoords[i][1], ballCoords[i][2]);
            bBall.visible = false;
            this.baitTrayBalls.push(bBall);
            this.baitTray.add(bBall);
        }

        // Khăn lau tay cần thủ vắt cạnh khay mồi
        this.baitTowelMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.9 });
        const towel = new THREE.Mesh(
            new THREE.BoxGeometry(0.09, 0.014, 0.14),
            this.baitTowelMat
        );
        towel.position.set(-0.11, 0.016, -0.04);
        towel.rotation.y = 0.25;
        this.baitTray.add(towel);

        this.baitTray.position.set(-0.36, -0.33, -0.65);
        this.baitTray.rotation.x = Math.PI / 4.5;
        this.baitTray.rotation.z = Math.PI / 12;
        this.fpvRig.add(this.baitTray);

        // 2. CÂY GÁC CẦN ĐÀI + ĐẦU GÁC SỪNG HƯƠU CHỮ V + MIỆNG RỌNG CÁ
        this.rodRestSupport = new THREE.Group();

        // Đầu gác cần sừng hươu chữ V đôi bọc silicon có con lăn đỡ lóng cần
        this.rodRestHeadMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.35 });
        const vHead = new THREE.Mesh(
            new THREE.TorusGeometry(0.038, 0.0085, 10, 20, Math.PI),
            this.rodRestHeadMat
        );
        vHead.rotation.z = Math.PI;
        vHead.position.set(0.15, -0.05, -1.18);
        this.rodRestSupport.add(vHead);

        // Hai nhánh sừng hươu mở rộng có chốt đầu
        this.rodRestTipMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.15 });
        for (let side of [-1, 1]) {
            const hornTip = new THREE.Mesh(
                new THREE.SphereGeometry(0.011, 10, 10),
                this.rodRestTipMat
            );
            hornTip.position.set(0.15 + side * 0.038, -0.05, -1.18);
            this.rodRestSupport.add(hornTip);
        }

        // Trục đứng đỡ ngàm chữ V
        const stemSupport = new THREE.Mesh(
            new THREE.CylinderGeometry(0.007, 0.009, 0.16, 10),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.12 })
        );
        stemSupport.position.set(0.15, -0.15, -1.18);
        this.rodRestSupport.add(stemSupport);

        // Thân cây gác cần vươn từ thùng câu đài ra phía trước đỡ lấy ngàm chữ V
        this.rodRestBoomMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.18 });
        const mainRestBoom = new THREE.Mesh(
            new THREE.CylinderGeometry(0.009, 0.013, 1.05, 12),
            this.rodRestBoomMat
        );
        mainRestBoom.rotation.x = THREE.MathUtils.degToRad(-76);
        mainRestBoom.position.set(0.15, -0.34, -0.72);
        this.rodRestSupport.add(mainRestBoom);

        // 2B. THÙNG CÂU ĐÀI 3D (Nằm gọn mép dưới góc trái FPV khi ngồi bến, nâng cấp từ ghế xếp -> thùng 36L VIP)
        this.fishingBoxGroup = new THREE.Group();
        this.fishingBoxBodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.35 });
        this.fishingBoxAccentMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.2 });

        const boxBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.24), this.fishingBoxBodyMat);
        this.fishingBoxGroup.add(boxBody);

        const boxLid = new THREE.Mesh(new THREE.BoxGeometry(0.335, 0.032, 0.255), this.fishingBoxAccentMat);
        boxLid.position.set(0, 0.12, 0);
        this.fishingBoxGroup.add(boxLid);

        // 4 chân địa hình inox (hiện từ Lv.2 trở lên)
        this.fishingBoxLegs = new THREE.Group();
        for (const lx of [-0.145, 0.145]) {
            for (const lz of [-0.105, 0.105]) {
                const leg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.012, 0.012, 0.28, 8),
                    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.15 })
                );
                leg.position.set(lx, -0.04, lz);
                this.fishingBoxLegs.add(leg);
            }
        }
        this.fishingBoxGroup.add(this.fishingBoxLegs);
        this.fishingBoxGroup.position.set(-0.52, -0.50, -0.58);
        this.fishingBoxGroup.rotation.y = 0.28;
        this.fpvRig.add(this.fishingBoxGroup);

        // 2C. Ô CÂU ĐÀI 3D PHÍA TRÊN ĐẦU (Che nắng/mưa cực thực tế khi nâng cấp từ Lv.2 -> Lv.4)
        this.umbrellaGroup = new THREE.Group();
        this.umbrellaCanopyMat = new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            roughness: 0.55,
            metalness: 0.12,
            side: THREE.DoubleSide
        });
        this.umbrellaTrimMat = new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            metalness: 0.7,
            roughness: 0.25,
            side: THREE.DoubleSide
        });

        // Tán ô chính vòm cong rộng che trên góc nhìn
        const canopyMain = new THREE.Mesh(
            new THREE.ConeGeometry(1.15, 0.34, 16, 1, true),
            this.umbrellaCanopyMat
        );
        canopyMain.position.set(0, 0.72, -0.25);
        this.umbrellaGroup.add(canopyMain);

        // Viền trang trí mép tán ô
        const canopyTrim = new THREE.Mesh(
            new THREE.TorusGeometry(1.14, 0.016, 8, 24),
            this.umbrellaTrimMat
        );
        canopyTrim.rotation.x = Math.PI / 2;
        canopyTrim.position.set(0, 0.55, -0.25);
        this.umbrellaGroup.add(canopyTrim);

        // Tầng ô thoáng gió thứ 2 (hiện từ Lv.3 trở lên)
        this.umbrellaSecondLayer = new THREE.Mesh(
            new THREE.ConeGeometry(0.62, 0.20, 14, 1, true),
            this.umbrellaTrimMat
        );
        this.umbrellaSecondLayer.position.set(0, 0.88, -0.25);
        this.umbrellaGroup.add(this.umbrellaSecondLayer);

        // Trục ô inox cắm bên trái thùng câu
        const umbPole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.014, 0.016, 1.35, 10),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.18 })
        );
        umbPole.position.set(-0.56, 0.05, -0.45);
        this.umbrellaGroup.add(umbPole);

        this.umbrellaGroup.visible = false; // Mặc định Lv.1 chưa có ô
        this.fpvRig.add(this.umbrellaGroup);

        // Vành miệng rọng cá hợp kim nhôm xanh dương đặt bên trái mép nước
        const keepnetRim = new THREE.Mesh(
            new THREE.TorusGeometry(0.22, 0.011, 10, 28),
            new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.85, roughness: 0.2 })
        );
        keepnetRim.rotation.x = Math.PI / 2.4;
        keepnetRim.position.set(-0.48, -0.46, -1.32);
        this.rodRestSupport.add(keepnetRim);

        const keepnetMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.21, 0.18, 0.45, 18, 3, true),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.45 })
        );
        keepnetMesh.rotation.x = 0.28;
        keepnetMesh.position.set(-0.48, -0.66, -1.42);
        this.rodRestSupport.add(keepnetMesh);

        this.fpvRig.add(this.rodRestSupport);

        // 3. CẦN CÂU ĐÀI CARBON LIỀN KHỐI UỐN CONG MƯỢT MÀ (SEAMLESS CONTINUOUS DEFORMABLE CARBON POLE)
        this.rodRootGroup = new THREE.Group();
        this.rodRootGroup.position.set(0.24, -0.29, -0.38);

        const carbonTex = createCarbonWeaveTexture();
        const gripTex = createRodGripTexture();

        const goldFerruleMat = new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            metalness: 0.95,
            roughness: 0.12
        });

        // Tạo 1 lưới ống trụ liên tục duy nhất (64 vòng x 18 cạnh = không có bất kỳ đoạn rời rạc nào!)
        const rings = this.ROD_RINGS;
        const radial = this.ROD_RADIAL;
        const vertCount = (rings + 1) * (radial + 1);
        const positions = new Float32Array(vertCount * 3);
        const normals = new Float32Array(vertCount * 3);
        const uvs = new Float32Array(vertCount * 2);
        const colors = new Float32Array(vertCount * 3);
        const indices = [];

        this.rodRingRadii = [];
        const baseColor = new THREE.Color(0x263238);
        const redBandColor = new THREE.Color(0xdc2626);
        const goldRingColor = new THREE.Color(0xfacc15);
        const tipRedColor = new THREE.Color(0xff2a00);
        const tmpColor = new THREE.Color();

        for (let r = 0; r <= rings; r++) {
            const t = r / rings; // 0 (gốc cần) -> 1 (đọt cần)
            // Bán kính vuốt thon mượt mà liên tục từ gốc (18.5mm) tới ngọn (1.6mm)
            const radius = THREE.MathUtils.lerp(0.0185, 0.0016, Math.pow(t, 0.86));
            this.rodRingRadii.push(radius);

            // Phối màu sơn lóng cần & viền chỉ vàng/đỏ trực tiếp vào Vertex Color của ống liền khối
            tmpColor.copy(baseColor);
            // 4 vị trí cổ lóng truyền thống (t = 0.20, 0.40, 0.60, 0.80) sơn chỉ đỏ & đai vàng liền mạch trên thân ống
            for (const jointT of [0.20, 0.40, 0.60, 0.80]) {
                const dist = Math.abs(t - jointT);
                if (dist < 0.007) {
                    tmpColor.copy(goldRingColor);
                } else if (t < jointT && jointT - t < 0.022) {
                    tmpColor.copy(redBandColor);
                }
            }
            // Đầu đọt cần sơn đỏ dạ quang dễ quan sát
            if (t > 0.95) {
                tmpColor.copy(tipRedColor);
            }

            const y = t * this.ROD_LENGTH;
            for (let s = 0; s <= radial; s++) {
                const u = s / radial;
                const theta = u * Math.PI * 2;
                const cosT = Math.cos(theta);
                const sinT = Math.sin(theta);

                const idx = r * (radial + 1) + s;
                positions[idx * 3] = cosT * radius;
                positions[idx * 3 + 1] = y;
                positions[idx * 3 + 2] = sinT * radius;

                normals[idx * 3] = cosT;
                normals[idx * 3 + 1] = 0;
                normals[idx * 3 + 2] = sinT;

                uvs[idx * 2] = u * 2.0;
                uvs[idx * 2 + 1] = t * 18.0;

                colors[idx * 3] = tmpColor.r;
                colors[idx * 3 + 1] = tmpColor.g;
                colors[idx * 3 + 2] = tmpColor.b;
            }
        }

        for (let r = 0; r < rings; r++) {
            for (let s = 0; s < radial; s++) {
                const a = r * (radial + 1) + s;
                const b = (r + 1) * (radial + 1) + s;
                const c = (r + 1) * (radial + 1) + (s + 1);
                const d = r * (radial + 1) + (s + 1);
                indices.push(a, b, d);
                indices.push(b, c, d);
            }
        }

        this.rodGeo = new THREE.BufferGeometry();
        this.rodGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.rodGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        this.rodGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        this.rodGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.rodGeo.setIndex(indices);

        const rodMat = new THREE.MeshStandardMaterial({
            map: carbonTex,
            vertexColors: true,
            metalness: 0.78,
            roughness: 0.18
        });

        this.rodMesh = new THREE.Mesh(this.rodGeo, rodMat);
        this.rodMesh.frustumCulled = false;
        this.rodRootGroup.add(this.rodMesh);

        // Cuốn cán cao su đen có gân xoắn + Vòng silicon ở Lóng Gốc
        const gripGeo = new THREE.CylinderGeometry(0.020, 0.021, 0.56, 16);
        this.rodGripMat = new THREE.MeshStandardMaterial({ map: gripTex, roughness: 0.88, metalness: 0.12 });
        const gripMesh = new THREE.Mesh(gripGeo, this.rodGripMat);
        gripMesh.position.set(0, 0.28, 0);
        this.rodRootGroup.add(gripMesh);

        const buttCap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0215, 0.020, 0.035, 16),
            goldFerruleMat
        );
        buttCap.position.set(0, 0.01, 0);
        this.rodRootGroup.add(buttCap);

        this.rodSiliconRingMat = new THREE.MeshBasicMaterial({ color: 0x39ff14 });
        const siliconRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.023, 0.0055, 10, 20),
            this.rodSiliconRingMat
        );
        siliconRing.position.set(0, 0.52, 0);
        siliconRing.rotation.x = Math.PI / 2;
        this.rodRootGroup.add(siliconRing);

        // 4. BÀN TAY & CÁNH TAY CẦN THỦ GÓC NHÌN THỨ NHẤT (Giải phẫu liền mạch: Bàn tay ôm khít cán cần -> Cổ tay -> Đồng hồ -> Cẳng tay hướng xuống khuỷu tay phải)
        const armGroup = new THREE.Group();
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.58 });
        const skinShadowMat = new THREE.MeshStandardMaterial({ color: 0xc99355, roughness: 0.65 });
        const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.72 });
        const cuffMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.6 });

        // Hàm nối 2 điểm 3D bằng ống trụ bo tròn 2 đầu giúp cổ tay, ngón tay và cẳng tay không bao giờ bị lệch hay rời rạc
        const addConnectedSegment = (pA, pB, rA, rB, mat, addCaps = true) => {
            const dir = new THREE.Vector3().subVectors(pB, pA);
            const len = dir.length();
            if (len < 0.0001) return null;
            const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
            const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rB, rA, len, 14), mat);
            cyl.position.copy(mid);
            cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
            armGroup.add(cyl);

            if (addCaps) {
                const capA = new THREE.Mesh(new THREE.SphereGeometry(rA * 0.98, 10, 10), mat);
                capA.position.copy(pA);
                armGroup.add(capA);
                const capB = new THREE.Mesh(new THREE.SphereGeometry(rB * 0.98, 10, 10), mat);
                capB.position.copy(pB);
                armGroup.add(capB);
            }
            return cyl;
        };

        // Mu bàn tay & lòng bàn tay ôm sát bên phải và mặt dưới cán cần (tại y = 0.22 .. 0.31)
        const pWristJoin = new THREE.Vector3(0.022, 0.215, -0.008);
        const pKnuckleTop = new THREE.Vector3(0.016, 0.298, -0.002);
        const handBody = addConnectedSegment(pWristJoin, pKnuckleTop, 0.020, 0.021, skinMat, true);
        if (handBody) handBody.scale.set(0.82, 1.0, 1.18);

        // Đệm lòng bàn tay đỡ mặt dưới cán cần
        addConnectedSegment(
            new THREE.Vector3(0.006, 0.228, -0.016),
            new THREE.Vector3(0.004, 0.295, -0.016),
            0.015, 0.016, skinShadowMat, true
        );

        // 4 ngón tay (Út, Áp út, Giữa, Trỏ) vòng từ cạnh dưới qua bên trái ôm chặt lấy cán cần (bán kính cán 0.020m)
        for (let f = 0; f < 4; f++) {
            const fy = 0.236 + f * 0.0195;
            const rFinger = f === 0 ? 0.0065 : 0.0074;
            const pKnuckle = new THREE.Vector3(0.014, fy, -0.017);
            const pUnderLeft = new THREE.Vector3(-0.017, fy + 0.002, -0.013);
            const pSideLeft = new THREE.Vector3(-0.022, fy + 0.004, 0.004);
            const pFingerTip = new THREE.Vector3(-0.012, fy + 0.006, 0.016);

            addConnectedSegment(pKnuckle, pUnderLeft, rFinger, rFinger * 0.95, skinMat, true);
            addConnectedSegment(pUnderLeft, pSideLeft, rFinger * 0.95, rFinger * 0.88, skinMat, true);
            addConnectedSegment(pSideLeft, pFingerTip, rFinger * 0.88, rFinger * 0.78, skinShadowMat, true);
        }

        // Ngón cái tì dọc lên sống trên của cán cần (tư thế cầm cần đài chuẩn xác)
        const pThumbBase = new THREE.Vector3(0.020, 0.238, 0.006);
        const pThumbMid = new THREE.Vector3(0.011, 0.282, 0.020);
        const pThumbTip = new THREE.Vector3(0.001, 0.325, 0.022);
        addConnectedSegment(pThumbBase, pThumbMid, 0.0105, 0.0092, skinMat, true);
        addConnectedSegment(pThumbMid, pThumbTip, 0.0092, 0.0078, skinMat, true);

        // Cổ tay nối liền từ mu bàn tay (pWristJoin) lùi về phía ống tay áo (pSleeveStart)
        const pSleeveStart = new THREE.Vector3(0.042, 0.145, -0.030);
        addConnectedSegment(pWristJoin, pSleeveStart, 0.021, 0.025, skinMat, true);

        // Đồng hồ thể thao ôm khít đúng trục cổ tay (nằm giữa pWristJoin và pSleeveStart)
        const pWatchA = new THREE.Vector3().lerpVectors(pWristJoin, pSleeveStart, 0.42);
        const pWatchB = new THREE.Vector3().lerpVectors(pWristJoin, pSleeveStart, 0.68);
        const watchStrapMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4, metalness: 0.5 });
        const watchBand = addConnectedSegment(pWatchA, pWatchB, 0.0245, 0.0255, watchStrapMat, false);
        if (watchBand) {
            // Mặt đồng hồ hướng lên trên cổ tay (+Z)
            const watchFace = new THREE.Mesh(
                new THREE.CylinderGeometry(0.016, 0.016, 0.008, 16),
                new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.85, roughness: 0.15 })
            );
            watchFace.rotation.x = Math.PI / 2;
            watchFace.position.set(0.004, 0, 0.022);
            watchBand.add(watchFace);
        }

        // Cổ tay áo chống nắng & Cẳng tay phải chạy mượt từ cổ tay (pSleeveStart) về phía khuỷu tay phải bên dưới góc màn hình (pElbow)
        const pCuffEnd = new THREE.Vector3(0.048, 0.125, -0.036);
        const pElbow = new THREE.Vector3(0.145, -0.18, -0.135);
        addConnectedSegment(pSleeveStart, pCuffEnd, 0.028, 0.030, cuffMat, false);
        addConnectedSegment(pCuffEnd, pElbow, 0.030, 0.044, sleeveMat, true);

        this.rodRootGroup.add(armGroup);

        this.fpvRig.add(this.rodRootGroup);
        this.applyArticulatedRodPose(1.0);
    }

    // CẬP NHẬT ĐƯỜNG CONG PARABOL LIỀN MẠCH CỦA CẦN CÂU ĐÀI (CONTINUOUS SMOOTH CURVED ROD PHYSICS)
    applyArticulatedRodPose(delta) {
        let targetPitch = -74; // Góc hạ cần trên gác chữ V
        let targetYaw = 6;     // Chếch nhẹ tự nhiên từ tay phải hướng ra điểm câu
        let targetRoll = 0;
        let targetBendDown = 0.02; // Độ võng tự nhiên cực nhẹ của cần 5.4m
        let targetBendSide = 0.0;

        if (this.state === FISHING_STATES.CASTING) {
            if (this.castElapsed < 0.35) {
                // Vung cần bổ mồi ra ổ câu
                targetPitch = -44;
                targetYaw = 8;
                targetBendDown = 0.28;
            } else {
                // Đã hạ cần xuống gác chữ V
                targetPitch = -74;
                targetYaw = 6;
                targetBendDown = 0.03;
            }
        } else if (this.state === FISHING_STATES.BITING && this.biteType === BITE_TYPES.ROD_PULL) {
            targetPitch = -79;
            targetBendDown = 0.38;
        } else if (this.state === FISHING_STATES.FIGHTING && this.hookedFish) {
            // Khi bo cá: Gốc cần lùi lại góc dưới phải, thân cần uốn cong parabol chữ C mượt mà (toàn bộ cần và ngọn cần nằm trọn vẹn trong màn hình)
            const tension = this.lineTension;
            this.headShakeTime += delta * (11 + tension * 9);
            const shake = (Math.sin(this.headShakeTime) + Math.cos(this.headShakeTime * 2.1) * 0.4) * 0.035 * tension;

            // Xử lý góc uốn đặc biệt nếu đang gặp kịch bản nguy hiểm: Cá lao vào cọc chân cầu gỗ
            if (this.stakeHazard) {
                // Cá lao sang bên nào thì cước kéo ngọn cần cong về bên đó
                const bSide = (this.stakeHazard.side === 'LEFT' ? -0.55 : 0.55);
                targetPitch = -48;
                targetYaw = 6;
                targetRoll = (this.stakeHazard.side === 'LEFT' ? -6 : 6);
                targetBendDown = 1.25 + shake * 1.5;
                targetBendSide = bSide;
            } else if (this.fightPhase === FIGHT_PHASES.RUN_OUT) {
                if (this.isCounteringCorrectly) {
                    // DỰNG CẦN: Gốc cần dựng lên, thân cần cong parabol chữ C gập chúc xuống mặt hồ chịu tải
                    targetPitch = -46;
                    targetYaw = 7;
                    targetRoll = 0;
                    targetBendDown = 1.15 + shake * 1.2;
                    targetBendSide = 0.0;
                } else {
                    // Chưa dựng cần: Cần bị cá lôi chúc sâu xuống mặt nước
                    targetPitch = -62;
                    targetYaw = 7;
                    targetBendDown = 0.85 + shake;
                    targetBendSide = 0.0;
                }
            } else if (this.fightPhase === FIGHT_PHASES.RUN_LEFT) {
                if (this.isCounteringCorrectly) {
                    // CÁ CHẠY TRÁI: Dây cước kéo ngọn cần cong về bên Trái, cần thủ ghìm giữ góc cần chếch phải
                    targetPitch = -48;
                    targetYaw = 10;
                    targetRoll = 6;
                    targetBendDown = 1.05 + shake * 1.1;
                    targetBendSide = -0.42;
                } else {
                    targetPitch = -58;
                    targetYaw = 8;
                    targetBendDown = 0.82 + shake;
                    targetBendSide = -0.55;
                }
            } else if (this.fightPhase === FIGHT_PHASES.RUN_RIGHT) {
                if (this.isCounteringCorrectly) {
                    // CÁ CHẠY PHẢI: Dây cước kéo ngọn cần cong về bên Phải, cần thủ ghìm giữ góc cần chếch trái
                    targetPitch = -48;
                    targetYaw = 4;
                    targetRoll = -6;
                    targetBendDown = 1.05 + shake * 1.1;
                    targetBendSide = 0.42;
                } else {
                    targetPitch = -58;
                    targetYaw = 6;
                    targetBendDown = 0.82 + shake;
                    targetBendSide = 0.55;
                }
            } else if (this.fightPhase === FIGHT_PHASES.PIN_SURFACE) {
                if (this.isCounteringCorrectly) {
                    // GHÌ CÁ NỔI LÊN MẶT NƯỚC: Thân cần uốn cong vòng cung ép ngửa bụng cá
                    targetPitch = -44;
                    targetYaw = 7;
                    targetRoll = 0;
                    targetBendDown = 0.95 + shake * 0.6;
                    targetBendSide = 0.0;
                } else {
                    targetPitch = -58;
                    targetYaw = 7;
                    targetBendDown = 0.65;
                }
            } else if (this.fightPhase === FIGHT_PHASES.TAP_TO_NET) {
                targetPitch = -52;
                targetYaw = 7;
                targetBendDown = 0.72;
                targetBendSide = 0.0;
            }
        }

        // Chuyển đổi mượt mà Vị Trí Gốc Cần, Tỷ Lệ Scale và Camera FOV giữa Ngồi thường vs Bo Cá Toàn Cảnh
        const isFightingMode = (this.state === FISHING_STATES.FIGHTING && this.hookedFish);
        const targetScale = isFightingMode ? 0.80 : 1.0;
        const targetPos = isFightingMode ? this.fightRodPos : this.baseRodPos;
        const targetFov = isFightingMode ? this.fightFov : this.normalFov;

        const transRate = Math.min(1.0, delta * 5.2);
        this.rodCurrentScale += (targetScale - this.rodCurrentScale) * transRate;
        this.currentRodPos.lerp(targetPos, transRate);
        this.rodRootGroup.position.copy(this.currentRodPos);
        this.rodRootGroup.scale.set(this.rodCurrentScale, this.rodCurrentScale, this.rodCurrentScale);

        // Hiệu ứng 3D Chiêu Thức Bo Cá: 🐉 NGỰ LONG (Xoáy cần vòng tròn) & 🌊 HẠ NGƯ (Dìm cần xuống nước)
        if (isFightingMode && this.activeFightSkill && this.activeFightSkill.timer > 0) {
            this.activeFightSkill.elapsed += delta;
            this.activeFightSkill.timer -= delta;
            const t = this.activeFightSkill.elapsed;
            if (this.activeFightSkill.type === 'NGU_LONG') {
                // Xoáy cần vòng tròn phá hướng lao thẳng của cá
                this.rodRootGroup.position.x += Math.cos(t * 14.0) * 0.13;
                this.rodRootGroup.position.y += Math.sin(t * 14.0) * 0.11;
                this.rodRootGroup.rotation.z += Math.sin(t * 14.0) * 0.22;
            } else if (this.activeFightSkill.type === 'HA_NGU') {
                // Dìm sâu thân & ngọn cần chúc xuống mặt nước để cá quay đầu vào bờ
                const dipFactor = Math.sin(Math.min(1, t / 1.55) * Math.PI);
                this.rodRootGroup.position.y -= 0.28 * dipFactor;
                this.rodRootGroup.rotation.x -= 0.45 * dipFactor;
            } else if (this.activeFightSkill.type === 'SAFETY_LEASH') {
                // Thả dây bảo hiểm 3D: Cần bung lao ra phía trước mặt nước rồi được dây co giãn kéo ngược về tay!
                const arc = Math.sin(Math.min(1, t / 2.4) * Math.PI);
                this.rodRootGroup.position.z -= 1.45 * arc;
                this.rodRootGroup.position.y -= 0.14 * arc;
                this.rodRootGroup.rotation.x -= 0.22 * arc;
            }
            if (this.activeFightSkill.timer <= 0) {
                this.activeFightSkill = null;
            }
        }

        if (Math.abs(this.camera.fov - targetFov) > 0.1) {
            this.camera.fov += (targetFov - this.camera.fov) * transRate;
            this.camera.updateProjectionMatrix();
        }

        // Nội suy đàn hồi mượt mà
        const lerpRate = Math.min(1.0, delta * 8.5);
        this.currentPitchDeg += (targetPitch - this.currentPitchDeg) * lerpRate;
        this.currentYawDeg += (targetYaw - this.currentYawDeg) * lerpRate;
        this.currentRollDeg += (targetRoll - this.currentRollDeg) * lerpRate;

        // Lò xo giảm chấn cho độ uốn của thân cần
        const force = (targetBendDown - this.currentBendDown) * 90.0;
        this.bendVelocity += force * delta;
        this.bendVelocity *= Math.max(0, 1.0 - 11.5 * delta);
        this.currentBendDown += this.bendVelocity * delta;
        this.currentBendSide += (targetBendSide - this.currentBendSide) * lerpRate;

        // Đặt góc cho gốc cần
        this.rodRootGroup.rotation.order = 'YXZ';
        this.rodRootGroup.rotation.x = THREE.MathUtils.degToRad(this.currentPitchDeg);
        this.rodRootGroup.rotation.y = THREE.MathUtils.degToRad(this.currentYawDeg);
        this.rodRootGroup.rotation.z = THREE.MathUtils.degToRad(this.currentRollDeg);

        // Cập nhật tọa độ đỉnh 64 vòng của lưới ống cần liền khối theo đường cong Parabol 28 mượt mà
        if (this.rodGeo) {
            const rings = this.ROD_RINGS;
            const radial = this.ROD_RADIAL;
            const dL = this.ROD_LENGTH / rings;
            const posAttr = this.rodGeo.attributes.position;
            const normAttr = this.rodGeo.attributes.normal;

            let cx = 0;
            let cy = 0;
            let cz = 0;
            let pitchAngle = 0;
            let sideAngle = 0;

            for (let r = 0; r <= rings; r++) {
                const t = r / rings;
                if (r > 0) {
                    // Phân bổ độ cong liên tục tăng dần từ bụng cần lên ngọn cần (Action 28 săn hàng)
                    // Dấu cộng (+) giúp thân cần uốn cong parabol chữ C chúc xuống phía trước mặt nước nơi cá đang quẫy sóng!
                    const flexWeight = Math.pow(t, 1.65) * 0.042;
                    pitchAngle += this.currentBendDown * flexWeight;
                    sideAngle += this.currentBendSide * flexWeight;

                    const tx = Math.sin(sideAngle) * Math.cos(pitchAngle);
                    const ty = Math.cos(sideAngle) * Math.cos(pitchAngle);
                    const tz = -Math.sin(pitchAngle);

                    cx += tx * dL;
                    cy += ty * dL;
                    cz += tz * dL;
                }

                // Hệ trục trực chuẩn chống xoắn (Twist-free Bishop Frame) tại vòng thứ r
                const tx = Math.sin(sideAngle) * Math.cos(pitchAngle);
                const ty = Math.cos(sideAngle) * Math.cos(pitchAngle);
                const tz = -Math.sin(pitchAngle);

                // Vector ngang (Right) và Pháp tuyến (Binormal) vuông góc với tiếp tuyến (tx, ty, tz)
                const rx = Math.cos(sideAngle);
                const ry = -Math.sin(sideAngle);
                const rz = 0;

                const bx = ry * tz - rz * ty;
                const by = rz * tx - rx * tz;
                const bz = rx * ty - ry * tx;

                const radius = this.rodRingRadii[r];
                for (let s = 0; s <= radial; s++) {
                    const theta = (s / radial) * Math.PI * 2;
                    const cosT = Math.cos(theta);
                    const sinT = Math.sin(theta);

                    const nx = rx * cosT + bx * sinT;
                    const ny = ry * cosT + by * sinT;
                    const nz = rz * cosT + bz * sinT;

                    const idx = r * (radial + 1) + s;
                    posAttr.setXYZ(idx, cx + nx * radius, cy + ny * radius, cz + nz * radius);
                    normAttr.setXYZ(idx, nx, ny, nz);
                }

                if (r === rings) {
                    this.rodTipLocalPos.set(cx, cy, cz);
                }
            }

            posAttr.needsUpdate = true;
            normAttr.needsUpdate = true;
        }
    }

    // Shader cắt mặt nước Y = 0.0 giúp bầu phao khi chìm xuống dưới mặt nước sẽ mờ dần theo đúng màu nước (Trong Xanh / Đục Phù Sa) rồi mất hẳn bầu phao
    applyFloatWaterlineShader(material) {
        material.onBeforeCompile = (shader) => {
            shader.uniforms.uWaterTint = this.floatShaderUniforms.uWaterTint;
            shader.uniforms.uSubmergeDepth = this.floatShaderUniforms.uSubmergeDepth;

            shader.vertexShader = 'varying float vFloatWorldY;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `#include <project_vertex>
                vec4 floatWorldPos = modelMatrix * vec4(transformed, 1.0);
                vFloatWorldY = floatWorldPos.y;`
            );
            shader.fragmentShader = 'uniform vec3 uWaterTint;\nuniform float uSubmergeDepth;\nvarying float vFloatWorldY;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `#include <dithering_fragment>
                if (vFloatWorldY < -uSubmergeDepth) {
                    discard;
                }
                if (vFloatWorldY < 0.0) {
                    float depthRatio = clamp(-vFloatWorldY / uSubmergeDepth, 0.0, 1.0);
                    gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.68, uWaterTint, depthRatio * 0.95);
                } else if (vFloatWorldY < 0.0045) {
                    float meniscusMix = 1.0 - (vFloatWorldY / 0.0045);
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.92, 0.98, 1.0), meniscusMix * 0.65);
                }`
            );
        };
        return material;
    }

    // XÂY DỰNG PHAO ĐÀI THÂN BẦU SĂN HÀNG (PLUMP BULBOUS CARP FLOAT: CHÂN CARBON + BẦU GIỌT NƯỚC SƠN MÀI + TĂM QUANG HỌC 11 NẤC)
    initFloatModel() {
        this.floatGroup = new THREE.Group();
        this.floatGroup.visible = false;

        // Quy ước tọa độ local Y của chiếc phao đài:
        // y = 0.000 : Đỉnh cổ bầu phao (Ranh giới nơi bầu phao chìm khuất hoàn toàn dưới mặt nước -> "mất bầu phao")
        // y = -0.215 .. 0.000 : Thân Bầu Phao (Bầu giọt nước / hạt táo phình tròn sơn mài bóng + vai phao cam đỏ)
        // y = -0.455 .. -0.215 : Chân Phao Carbon thuôn dài + Chân cắm phao silicon đỏ & khóa link đồng
        // y = 0.000 .. +0.355 : Tăm Phao Quang Học 11 Nấc có 2 mắt ngọn đầu to chống lóa

        const floatBodyTex = createFloatBodyTexture();

        // 1. THÂN PHAO BẦU (PLUMP TEARDROP / JUJUBE-PIT BULBOUS FLOAT BODY)
        const bodyPoints = [];
        const steps = 28;
        const bodyBottomY = -0.215;
        const bodyTopY = -0.008;
        const bodyLen = bodyTopY - bodyBottomY;

        for (let i = 0; i <= steps; i++) {
            const t = i / steps; // 0 (đáy bầu) -> 1 (vai bầu)
            // Đường cong giọt nước bầu bĩnh: phình to nhất ở khoảng 58% chiều cao bầu phao (bán kính 3.1cm -> đường kính 6.2cm nổi bật)
            const asymCurve = Math.sin(Math.pow(t, 0.72) * Math.PI);
            const r = 0.0042 + Math.pow(asymCurve, 0.82) * 0.0275;
            const y = bodyBottomY + t * bodyLen;
            bodyPoints.push(new THREE.Vector2(r, y));
        }

        const bodyGeo = new THREE.LatheGeometry(bodyPoints, 32);
        this.floatBodyMat = this.applyFloatWaterlineShader(new THREE.MeshStandardMaterial({
            map: floatBodyTex,
            color: 0xffffff,
            metalness: 0.22,
            roughness: 0.08
        }));
        this.floatBodyMesh = new THREE.Mesh(bodyGeo, this.floatBodyMat);
        this.floatGroup.add(this.floatBodyMesh);

        // Vòng đai kim tuyến vàng nổi 3D ôm quanh bụng bầu phao và vai bầu phao
        const goldRingMat = this.applyFloatWaterlineShader(new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            metalness: 0.92,
            roughness: 0.12
        }));

        const bellyBand = new THREE.Mesh(
            new THREE.TorusGeometry(0.0312, 0.0016, 10, 28),
            goldRingMat
        );
        bellyBand.rotation.x = Math.PI / 2;
        bellyBand.position.y = -0.098;
        this.floatGroup.add(bellyBand);

        const shoulderBand = new THREE.Mesh(
            new THREE.TorusGeometry(0.0218, 0.0015, 10, 28),
            goldRingMat
        );
        shoulderBand.rotation.x = Math.PI / 2;
        shoulderBand.position.y = -0.045;
        this.floatGroup.add(shoulderBand);

        // 2. CỔ ĐỒNG GIA CƯỜNG ĐỈNH BẦU PHAO (Tại y = -0.006 -> 0.000)
        const collar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0052, 0.0085, 0.014, 20),
            goldRingMat
        );
        collar.position.y = -0.005;
        this.floatGroup.add(collar);

        // 3. CHÂN PHAO CARBON DÀI + CHÂN CẮM PHAO SILICON ĐỎ ĐÔ & KHÓA LINK ĐỒNG
        const legMat = this.applyFloatWaterlineShader(new THREE.MeshStandardMaterial({
            color: 0x111827,
            metalness: 0.5,
            roughness: 0.25
        }));
        const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0042, 0.0022, 0.23, 12),
            legMat
        );
        leg.position.y = -0.33;
        this.floatGroup.add(leg);

        // Chân cắm phao silicon đỏ ngọc ở cuối chân phao
        const siliconePlugMat = this.applyFloatWaterlineShader(new THREE.MeshStandardMaterial({
            color: 0xdc2626,
            roughness: 0.35
        }));
        const siliconePlug = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0038, 0.0042, 0.032, 12),
            siliconePlugMat
        );
        siliconePlug.position.y = -0.442;
        this.floatGroup.add(siliconePlug);

        // Khoen đồng chân phao (Điểm neo dây trục chính xác tuyệt đối, không bị thừa dây)
        const footSwivel = new THREE.Mesh(
            new THREE.TorusGeometry(0.0032, 0.0010, 8, 14),
            goldRingMat
        );
        footSwivel.position.y = -0.460;
        this.floatGroup.add(footSwivel);

        this.floatFootAnchor = new THREE.Object3D();
        this.floatFootAnchor.position.set(0, -0.460, 0);
        this.floatGroup.add(this.floatFootAnchor);

        // 4. TĂM PHAO QUANG HỌC (Đặt trong Group riêng để thay đổi độ mảnh/rỗng & số nấc 1:1 khi nâng cấp Phao)
        this.floatTipsGroup = new THREE.Group();
        this.floatGroup.add(this.floatTipsGroup);
        const tipMarksCount = 11;
        const markHeight = 0.032;
        this.floatBlackSpacerMat = this.applyFloatWaterlineShader(new THREE.MeshBasicMaterial({ color: 0x09090b }));
        this.floatTipMats = [];
        this.floatOriginalTipColors = [];

        for (let i = 0; i < tipMarksCount; i++) {
            const isTopEye = (i >= tipMarksCount - 2);
            const radius = isTopEye ? 0.0072 : 0.0048;

            let markColor = 0xff1e00; // Đỏ dạ quang
            if (i % 3 === 1) markColor = 0xffe600; // Vàng chanh dạ quang
            if (i % 3 === 2) markColor = 0x00ff66; // Xanh lá dạ quang
            if (i === tipMarksCount - 1) markColor = 0xff2a00; // Mắt ngọn trên cùng đỏ cam rực rỡ

            const segMat = this.applyFloatWaterlineShader(new THREE.MeshBasicMaterial({ color: markColor }));
            this.floatTipMats.push(segMat);
            this.floatOriginalTipColors.push(markColor);
            const seg = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, markHeight * 0.82, 14),
                segMat
            );
            const yPos = 0.016 + i * markHeight;
            seg.position.y = yPos;
            this.floatTipsGroup.add(seg);

            const spacer = new THREE.Mesh(
                new THREE.CylinderGeometry(radius * 0.94, radius * 0.94, markHeight * 0.18, 12),
                this.floatBlackSpacerMat
            );
            spacer.position.y = yPos - markHeight * 0.5;
            this.floatTipsGroup.add(spacer);
        }

        // 5. VÒNG SỨC CĂNG BỀ MẶT NƯỚC (Luôn nằm phẳng trên mặt nước Y = 0.005, tự động co giãn theo bầu phao / tăm phao)
        this.floatMeniscusRing = new THREE.Mesh(
            new THREE.RingGeometry(0.006, 0.055, 32),
            new THREE.MeshBasicMaterial({
                color: 0xe0f2fe,
                transparent: true,
                opacity: 0.72,
                side: THREE.DoubleSide
            })
        );
        this.floatMeniscusRing.rotation.x = -Math.PI / 2;
        this.floatMeniscusRing.position.y = 0.005;
        this.floatMeniscusRing.visible = false;
        this.scene.add(this.floatMeniscusRing);

        this.scene.add(this.floatGroup);
    }

    initFishingLine() {
        // Dây cước trục mảnh tinh tế (opacity 0.38) kèm Shader cắt phần dây chìm dưới mặt nước để luôn khớp tuyệt đối với chân phao, không bao giờ lộ hay thừa dây
        const lineMat = new THREE.LineBasicMaterial({
            color: 0xdbeafe,
            transparent: true,
            opacity: 0.38,
            depthWrite: false
        });
        lineMat.onBeforeCompile = (shader) => {
            shader.vertexShader = 'varying float vLineWorldY;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `#include <project_vertex>
                vec4 lineWPos = modelMatrix * vec4(transformed, 1.0);
                vLineWorldY = lineWPos.y;`
            );
            shader.fragmentShader = 'varying float vLineWorldY;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `#include <dithering_fragment>
                if (vLineWorldY < 0.001) {
                    discard;
                }`
            );
        };
        const pts = [];
        for (let i = 0; i < this.LINE_POINTS_COUNT; i++) {
            pts.push(new THREE.Vector3());
        }
        const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
        this.fishingLine = new THREE.Line(lineGeo, lineMat);
        this.fishingLine.frustumCulled = false;
        this.fishingLine.visible = false;
        this.scene.add(this.fishingLine);
    }

    // ==================== ÁP DỤNG NÂNG CẤP 7 TRANG BỊ LÊN 3D & CHỈ SỐ VẬT LÝ ====================
    applyEquipmentUpgrades(levels) {
        if (!levels) return;
        this.equipmentLevels = { ...this.equipmentLevels, ...levels };
        this.equipBonuses = computeEquipmentBonuses(this.equipmentLevels);

        const { rod, float: flt, line, rodRest, baitPad, box, umbrella } = this.equipBonuses;

        // 1. Cần câu đài Rep 1:1 (Sơn lóng gốc, chỉ kép đặc trưng từng hãng Handing / Kaiwo / GUF / Gama)
        if (this.rodGeo && this.rodGeo.attributes.color && rod) {
            const colorAttr = this.rodGeo.attributes.color;
            const rings = this.ROD_RINGS;
            const radial = this.ROD_RADIAL;
            const baseColor = new THREE.Color(rod.rodColor);
            const accentColor = new THREE.Color(rod.accentColor);
            const secAccentColor = new THREE.Color(rod.secondaryAccent || rod.accentColor);
            const tipRedColor = new THREE.Color(0xff2a00);
            const tmpColor = new THREE.Color();

            for (let r = 0; r <= rings; r++) {
                const t = r / rings;
                tmpColor.copy(baseColor);

                // Sơn họa tiết nổi bật ở lóng gốc (t: 0.10 -> 0.22) giống cần thật ngoài thị trường
                if (t > 0.11 && t < 0.17) {
                    tmpColor.lerp(accentColor, 0.55);
                } else if (t >= 0.17 && t < 0.185) {
                    tmpColor.copy(secAccentColor);
                }

                // 4 vị trí cổ lóng sơn chỉ kép chuẩn hãng
                for (const jointT of [0.22, 0.42, 0.62, 0.82]) {
                    const dist = Math.abs(t - jointT);
                    if (dist < 0.008) {
                        tmpColor.copy(accentColor);
                    } else if (t < jointT && jointT - t < 0.024) {
                        tmpColor.copy(secAccentColor);
                    }
                }
                if (t > 0.95) tmpColor.copy(tipRedColor);

                for (let s = 0; s <= radial; s++) {
                    const idx = r * (radial + 1) + s;
                    colorAttr.setXYZ(idx, tmpColor.r, tmpColor.g, tmpColor.b);
                }
            }
            colorAttr.needsUpdate = true;
        }
        if (this.rodSiliconRingMat && rod) {
            this.rodSiliconRingMat.color.setHex(rod.secondaryAccent || rod.accentColor);
        }
        if (this.rodGripMat && rod) {
            this.rodGripMat.color.setHex(rod.level >= 5 ? 0xfef08a : 0xffffff);
        }

        // 2. Phao đài Rep 1:1 (Dựng lại đúng hình dáng bầu phao 3D & số nấc/độ dày tăm phao!)
        if (flt) {
            this.rebuildFloat3DGeometry(flt);
        }
        this.updateFloatLedGlow(false);

        // 3. Trục & thẻo cước (Đổi màu dây cước)
        if (this.fishingLine && this.fishingLine.material && line) {
            this.fishingLine.material.color.setHex(line.lineColor);
            this.fishingLine.material.opacity = line.level >= 3 ? 0.52 : 0.38;
        }

        // 4. Gác cần đài (Đổi màu thân, đầu chữ V, chốt sừng)
        if (this.rodRestBoomMat && rodRest) this.rodRestBoomMat.color.setHex(rodRest.boomColor);
        if (this.rodRestHeadMat && rodRest) this.rodRestHeadMat.color.setHex(rodRest.headColor);
        if (this.rodRestTipMat && rodRest) this.rodRestTipMat.color.setHex(rodRest.tipColor);

        // 5. Pad / Khay đựng mồi (Ẩn/hiện tầng 2, tầng 3, vành chắn gió, đổi màu inox/vàng)
        if (this.baitTrayRimMat && baitPad) this.baitTrayRimMat.color.setHex(baitPad.rimColor);
        if (this.baitTrayInnerMat && baitPad) this.baitTrayInnerMat.color.setHex(baitPad.innerColor);
        if (this.baitTowelMat && baitPad) this.baitTowelMat.color.setHex(baitPad.towelColor);
        if (this.baitTrayLowerBowl && baitPad) this.baitTrayLowerBowl.visible = baitPad.trayLayers >= 2;
        if (this.baitTrayThirdBowl && baitPad) this.baitTrayThirdBowl.visible = baitPad.trayLayers >= 3;
        if (this.baitTrayCover && baitPad) this.baitTrayCover.visible = !!baitPad.hasCover;

        // 6. Thùng câu đài 3D
        if (this.fishingBoxBodyMat && box) this.fishingBoxBodyMat.color.setHex(box.boxColor);
        if (this.fishingBoxAccentMat && box) this.fishingBoxAccentMat.color.setHex(box.accentColor);
        if (this.fishingBoxLegs && box) this.fishingBoxLegs.visible = !!box.hasLegs;

        // 7. Ô câu đài 3D
        if (this.umbrellaGroup && umbrella) {
            this.umbrellaGroup.visible = !!umbrella.visible;
            if (this.umbrellaCanopyMat) this.umbrellaCanopyMat.color.setHex(umbrella.canopyColor);
            if (this.umbrellaTrimMat) this.umbrellaTrimMat.color.setHex(umbrella.trimColor);
            if (this.umbrellaSecondLayer) this.umbrellaSecondLayer.visible = !!umbrella.doubleLayer;
        }

        // Áp dụng lại cấu hình bộ cần/phao/trục/thẻo hiện tại (nếu đang cầm cần khởi đầu)
        if (this.rigConfig) {
            this.applyRigSetup(this.rigConfig);
        }
    }

    // ==================== ÁP DỤNG BỘ SET CẦN • CÂN PHAO • TRỤC • THẺO ====================
    applyRigSetup(rigConfig) {
        if (!rigConfig) return;
        this.rigConfig = rigConfig;
        this.activeCalibration = getCalibrationById(rigConfig.calibrationId);
        this.activeMainLineSpec = getLineSpec(rigConfig.mainLineSize);
        this.activeLeaderSpec = getLineSpec(rigConfig.leaderSize);

        // 1. Điều chỉnh độ nổi mặt nước (equilibriumFloatY) CHÍNH XÁC TỪNG MILIMET theo hình học tăm phao 11 nấc (markHeight = 0.032m, đỉnh tăm y = 0.352m):
        // Để nổi chính xác N nấc trên mặt nước (y = 0): equilibriumFloatY = -0.352 + N * 0.032
        const isHoDau = rigConfig.fishingStyle === 'HO_DAU';
        const marks = isHoDau ? 2.2 : (this.activeCalibration ? this.activeCalibration.visibleMarks : 3);
        this.equilibriumFloatY = THREE.MathUtils.clamp(-0.352 + marks * 0.032, -0.325, 0.005);
        const pipTag = document.getElementById('pip-float-status');
        if (pipTag && this.activeCalibration) {
            pipTag.innerText = isHoDau ? '⚓ Hố Đấu (2,2 nấc)' : this.activeCalibration.shortTag;
        }

        // 2. Xác định Cần đang cầm (Cần Vô Danh 3m6 tải 5kg / Cần Trúc 5m4 tải 7kg / hoặc Cần đã nâng cấp trong Xưởng)
        const starter = STARTER_RODS.find(r => r.id === rigConfig.selectedRodId);
        if (starter) {
            this.activeRodMaxFishKg = starter.maxFishWeight;
            this.selectedRodLength = starter.length;
            // Tô màu cần khởi đầu (đặc biệt Cần Trúc 5m4 màu vàng trúc đốt nâu cực đẹp!)
            if (this.rodGeo && this.rodGeo.attributes.color) {
                const colorAttr = this.rodGeo.attributes.color;
                const rings = this.ROD_RINGS;
                const radial = this.ROD_RADIAL;
                const baseColor = new THREE.Color(starter.rodColor);
                const accColor = new THREE.Color(starter.accentColor);
                const secColor = new THREE.Color(starter.secondaryAccent);
                const tipRed = new THREE.Color(0xff2a00);
                const tmp = new THREE.Color();
                for (let r = 0; r <= rings; r++) {
                    const t = r / rings;
                    tmp.copy(baseColor);
                    for (const jt of [0.20, 0.40, 0.60, 0.80]) {
                        if (Math.abs(t - jt) < 0.01) tmp.copy(secColor);
                        else if (Math.abs(t - jt) < 0.022) tmp.copy(accColor);
                    }
                    if (t > 0.95) tmp.copy(tipRed);
                    for (let s = 0; s <= radial; s++) {
                        colorAttr.setXYZ(r * (radial + 1) + s, tmp.r, tmp.g, tmp.b);
                    }
                }
                colorAttr.needsUpdate = true;
            }
        } else if (this.equipBonuses && this.equipBonuses.rod) {
            this.activeRodMaxFishKg = this.equipBonuses.rod.maxSafeWeight || 12;
        }
    }

    hasValidRigToCast() {
        if (!this.rigConfig) return { ok: true };
        const dur = typeof this.rigConfig.rodDurability === 'number' ? this.rigConfig.rodDurability : 100;
        if (dur <= 0) {
            return { ok: false, missing: 'ROD_BROKEN', message: '💥 CẦN ĐANG BỊ GÃY LÓNG (Độ bền 0%)! Hãy mở [⚙️ Set Trục/Phao] để Thay Lóng Cần (150.000đ)!' };
        }
        const mSize = this.rigConfig.mainLineSize || 2;
        const lSize = this.rigConfig.leaderSize || 1;
        const mCount = (this.rigConfig.mainLineStock && this.rigConfig.mainLineStock[mSize]) || 0;
        const lCount = (this.rigConfig.leaderStock && this.rigConfig.leaderStock[lSize]) || 0;
        if (mCount <= 0) {
            return { ok: false, missing: 'MAIN', message: `💥 Bạn đã HẾT TRỤC ${mSize}.0! Hãy mở [⚙️ Set Trục/Phao] để mua bộ trục mới (39.000đ/bộ)!` };
        }
        if (lCount <= 0) {
            return { ok: false, missing: 'LEADER', message: `💥 Bạn đã HẾT THẺO ${lSize}.0! Hãy mở [⚙️ Set Trục/Phao] để mua bộ 10 thẻo mới (110.000đ/10 thẻo)!` };
        }
        return { ok: true };
    }

    notifyRigLineBroken(reason, lostFish) {
        const mSize = this.rigConfig ? (this.rigConfig.mainLineSize || 2) : 2;
        const lSize = this.rigConfig ? (this.rigConfig.leaderSize || 1) : 1;
        // Nếu dùng thẻo >= trục hoặc đứt nặng ở cọc/chân cầu -> có khả năng đứt luôn cả bộ trục!
        const breakMainLine = (lSize >= mSize) || ((reason === 'STAKE' || reason === 'PIER') && Math.random() < 0.45);
        window.dispatchEvent(new CustomEvent('rig_line_broken', {
            detail: { breakMainLine, mainLineSize: mSize, leaderSize: lSize, reason, fish: lostFish }
        }));
    }

    rebuildFloat3DGeometry(flt) {
        if (!flt) return;
        // 1. Dựng đúng hình dáng Bầu Phao 3D (Quả Trám / Giọt Nước / Cỏ Sậy / Lông Công / Hố Đấu)
        if (this.floatBodyMesh) {
            const shape = flt.shape || 'DIAMOND';
            let pts = [];
            if (shape === 'DIAMOND') {
                // Bầu Quả Trám: phình đều ở giữa, thon 2 đầu
                pts = [
                    [0.003, -0.22], [0.016, -0.17], [0.028, -0.11],
                    [0.016, -0.05], [0.004, 0.0]
                ];
            } else if (shape === 'TEARDROP') {
                // Bầu Giọt Nước (Sa Phạm): vai to ở trên, thuôn nhọn dần về chân
                pts = [
                    [0.003, -0.23], [0.011, -0.17], [0.021, -0.11],
                    [0.032, -0.055], [0.022, -0.02], [0.004, 0.0]
                ];
            } else if (shape === 'SLIM_REED') {
                // Bầu Cỏ Sậy tự nhiên: thân thon mảnh dài
                pts = [
                    [0.003, -0.26], [0.013, -0.20], [0.017, -0.12],
                    [0.015, -0.04], [0.004, 0.0]
                ];
            } else if (shape === 'PEACOCK_LONG') {
                // Bầu Lông Công đấu giải: bầu dài đều sang trọng
                pts = [
                    [0.003, -0.25], [0.021, -0.19], [0.024, -0.12],
                    [0.022, -0.05], [0.004, 0.0]
                ];
            } else {
                // SHORT_HEAVY: Bầu ngắn hố đấu chống sóng gió
                pts = [
                    [0.004, -0.17], [0.028, -0.12], [0.034, -0.075],
                    [0.024, -0.03], [0.004, 0.0]
                ];
            }
            const lathePts = pts.map(([r, y]) => new THREE.Vector2(r, y));
            if (this.floatBodyMesh.geometry) this.floatBodyMesh.geometry.dispose();
            this.floatBodyMesh.geometry = new THREE.LatheGeometry(lathePts, 28);
            if (this.floatBodyMat) {
                this.floatBodyMat.color.setHex(flt.bodyColor || 0xffffff);
            }
        }

        // 2. Dựng lại Tăm Phao theo đúng độ dày (tăm đặc mảnh vs tăm rỗng mập) và số nấc (9/11/13)
        if (this.floatTipsGroup) {
            while (this.floatTipsGroup.children.length > 0) {
                const c = this.floatTipsGroup.children[0];
                if (c.geometry) c.geometry.dispose();
                this.floatTipsGroup.remove(c);
            }
            const count = flt.tipMarks || 11;
            const baseR = flt.tipRadius || 0.0048;
            const markH = 0.35 / count;
            this.floatTipMats = [];
            this.floatOriginalTipColors = [];

            for (let i = 0; i < count; i++) {
                const isTopEye = (i >= count - 2);
                const radius = isTopEye ? baseR * 1.42 : baseR;

                let markColor = 0xff1e00;
                if (flt.ledBiteColor) {
                    // Phao LED điện tử: bình thường phát sáng Xanh Ngọc / Xanh Chuối cực rõ!
                    markColor = (i % 2 === 0) ? 0x00ffaa : 0x38bdf8;
                } else {
                    if (i % 3 === 1) markColor = 0xffe600;
                    if (i % 3 === 2) markColor = 0x00ff66;
                    if (i === count - 1) markColor = 0xff2a00;
                }

                const segMat = this.applyFloatWaterlineShader(new THREE.MeshBasicMaterial({ color: markColor }));
                this.floatTipMats.push(segMat);
                this.floatOriginalTipColors.push(markColor);
                const seg = new THREE.Mesh(
                    new THREE.CylinderGeometry(radius, radius, markH * 0.82, 14),
                    segMat
                );
                const yPos = 0.014 + i * markH;
                seg.position.y = yPos;
                this.floatTipsGroup.add(seg);

                const spacer = new THREE.Mesh(
                    new THREE.CylinderGeometry(radius * 0.94, radius * 0.94, markH * 0.18, 12),
                    this.floatBlackSpacerMat
                );
                spacer.position.y = yPos - markH * 0.5;
                this.floatTipsGroup.add(spacer);
            }
        }
    }

    updateFloatLedGlow(isBiteTake = false) {
        if (!this.floatTipMats || !this.floatOriginalTipColors) return;
        const useLed = this.equipBonuses && this.equipBonuses.ledBiteColor;
        for (let i = 0; i < this.floatTipMats.length; i++) {
            if (useLed && isBiteTake) {
                this.floatTipMats[i].color.setHex(0xff1100); // Đỏ rực phát quang khi cá cắn đúng nhịp!
            } else {
                this.floatTipMats[i].color.setHex(this.floatOriginalTipColors[i]);
            }
        }
    }

    initFish3DAndNet() {
        this.fish3DGroup = new THREE.Group();
        this.fish3DGroup.visible = false;

        const bodyGeo = new THREE.SphereGeometry(0.20, 20, 14);
        bodyGeo.scale(0.62, 1.05, 2.75);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xd97706,
            metalness: 0.55,
            roughness: 0.25
        });
        const fishBody = new THREE.Mesh(bodyGeo, bodyMat);
        this.fish3DGroup.add(fishBody);

        const bellyGeo = new THREE.SphereGeometry(0.185, 16, 12);
        bellyGeo.scale(0.58, 0.9, 2.5);
        const bellyMat = new THREE.MeshStandardMaterial({
            color: 0xfef3c7,
            metalness: 0.3,
            roughness: 0.35
        });
        const belly = new THREE.Mesh(bellyGeo, bellyMat);
        belly.position.y = -0.04;
        this.fish3DGroup.add(belly);

        const tailGeo = new THREE.ConeGeometry(0.22, 0.38, 4);
        tailGeo.scale(0.18, 1.0, 1.0);
        const tailMat = new THREE.MeshStandardMaterial({ color: 0xb45309 });
        const fishTail = new THREE.Mesh(tailGeo, tailMat);
        fishTail.rotation.x = -Math.PI / 2;
        fishTail.position.set(0, 0, 0.55);
        this.fish3DGroup.add(fishTail);
        this.fishTailMesh = fishTail;

        const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.38), tailMat);
        dorsal.position.set(0, 0.18, 0.02);
        this.fish3DGroup.add(dorsal);

        this.waterEntrySpray = new THREE.Mesh(
            new THREE.RingGeometry(0.05, 0.28, 20),
            new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.85,
                side: THREE.DoubleSide
            })
        );
        this.waterEntrySpray.rotation.x = -Math.PI / 2;
        this.waterEntrySpray.visible = false;
        this.scene.add(this.waterEntrySpray);

        // VỆT SÓNG CHỮ V CÁ CHẠY RẼ NƯỚC (3D V-WAKE BOW WAVE)
        this.vWakeGroup = new THREE.Group();
        this.vWakeGroup.visible = false;
        const wakeMat = new THREE.MeshBasicMaterial({
            color: 0xe0f2fe,
            transparent: true,
            opacity: 0.82,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const leftWakeWing = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.35), wakeMat);
        leftWakeWing.rotation.x = -Math.PI / 2;
        leftWakeWing.rotation.z = -0.36;
        leftWakeWing.position.set(-0.26, 0.025, -0.52);
        this.vWakeGroup.add(leftWakeWing);

        const rightWakeWing = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.35), wakeMat);
        rightWakeWing.rotation.x = -Math.PI / 2;
        rightWakeWing.rotation.z = 0.36;
        rightWakeWing.position.set(0.26, 0.025, -0.52);
        this.vWakeGroup.add(rightWakeWing);

        const bowCrest = new THREE.Mesh(
            new THREE.ConeGeometry(0.18, 0.32, 10, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
        );
        bowCrest.position.set(0, 0.08, 0.08);
        bowCrest.rotation.x = -0.45;
        this.vWakeGroup.add(bowCrest);
        this.scene.add(this.vWakeGroup);

        // HỆ THỐNG HẠT NƯỚC BẮN TUNG TÓE KHI CÁ CHẠY RẼ NƯỚC & NHẢY SANTO (3D WATER SPRAY PARTICLES)
        this.waterSprayDrops = [];
        const dropGeo = new THREE.SphereGeometry(0.034, 6, 6);
        const dropMat = new THREE.MeshBasicMaterial({
            color: 0xf0f9ff,
            transparent: true,
            opacity: 0.9
        });
        for (let i = 0; i < 28; i++) {
            const drop = new THREE.Mesh(dropGeo, dropMat);
            drop.visible = false;
            this.scene.add(drop);
            this.waterSprayDrops.push({
                mesh: drop,
                vx: 0,
                vy: 0,
                vz: 0,
                life: 0
            });
        }
        this.lastFishWorldPos = new THREE.Vector3();
        this.isSantoJumping = false;
        this.santoProgress = 0;
        this.santoCooldown = 2.5;
        this.santoFlipDir = 1;

        this.scene.add(this.fish3DGroup);

        this.landingNetGroup = new THREE.Group();
        this.landingNetGroup.visible = false;

        const handle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.012, 0.016, 2.9, 10),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 })
        );
        handle.rotation.x = THREE.MathUtils.degToRad(-78);
        handle.position.set(-0.22, -0.34, -1.25);
        this.landingNetGroup.add(handle);

        const hoop = new THREE.Mesh(
            new THREE.TorusGeometry(0.34, 0.012, 10, 28),
            new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.85 })
        );
        hoop.rotation.x = Math.PI / 2.2;
        hoop.position.set(-0.12, -0.05, -2.65);
        this.landingNetGroup.add(hoop);

        const meshNet = new THREE.Mesh(
            new THREE.CylinderGeometry(0.34, 0.18, 0.42, 18, 2, true),
            new THREE.MeshBasicMaterial({
                color: 0xe0f2fe,
                wireframe: true,
                transparent: true,
                opacity: 0.7
            })
        );
        meshNet.position.set(-0.12, -0.25, -2.65);
        this.landingNetGroup.add(meshNet);

        this.fpvRig.add(this.landingNetGroup);
    }

    seatAtPosition(pos, lake, spotName = 'Bến Câu Đài') {
        this.currentLake = lake;
        this.currentSpotName = spotName;
        this.playerSeatPos = pos.clone();
        this.state = FISHING_STATES.SEATED;

        this.fpvRig.visible = true;
        this.rodRestSupport.visible = true;
        this.landingNetGroup.visible = false;
        this.fish3DGroup.visible = false;
        this.waterEntrySpray.visible = false;
        if (this.vWakeGroup) this.vWakeGroup.visible = false;
        this.hideAllWaterSpray();
        this.floatGroup.visible = false;
        if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
        this.fishingLine.visible = false;

        this.currentBendDown = 0.02;
        this.currentBendSide = 0;
        this.lineTension = 0;
        this.applyArticulatedRodPose(1.0);

        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const baitSpotX = pos.x + forward.x * 5.8;
        const baitSpotZ = pos.z + forward.z * 5.8;
        this.bubbleSystem.spawnFishNearSpot(baitSpotX, baitSpotZ);
    }

    standUp() {
        if (this.state === FISHING_STATES.FIGHTING) return false;
        soundManager.stopLineSingLoop();
        this.updateFloatLedGlow(false);
        this.bubbleSystem.clearHookBaitTarget();
        this.state = FISHING_STATES.ROAM;
        this.fpvRig.visible = false;
        this.floatGroup.visible = false;
        if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
        this.fishingLine.visible = false;
        this.fish3DGroup.visible = false;
        this.waterEntrySpray.visible = false;
        this.landingNetGroup.visible = false;
        return true;
    }

    // Đồng bộ hiển thị 3D của khay mồi từ tính theo lượng mồi câu & mồi xả đã pha
    updateBaitTrayVisuals() {
        const hookCharges = (this.activeHookBait && typeof this.activeHookBait.charges === 'number')
            ? this.activeHookBait.charges
            : (this.activeHookBait ? 4 : 0);
        const groundCharges = (this.activeGroundBait && typeof this.activeGroundBait.charges === 'number')
            ? this.activeGroundBait.charges
            : (this.activeGroundBait ? 3 : 0);

        if (this.crumbSurfaceMesh) {
            this.crumbSurfaceMesh.visible = groundCharges > 0;
        }
        if (this.baitTrayBalls && this.baitTrayBalls.length > 0) {
            const visibleBalls = hookCharges <= 0 ? 0 : Math.min(4, Math.ceil((hookCharges / 10) * 4));
            this.baitTrayBalls.forEach((b, idx) => {
                b.visible = idx < visibleBalls;
            });
        }
    }

    getCastDistance() {
        const map = { 3.6: 4.3, 4.5: 5.2, 5.4: 6.0, 6.3: 7.3, 7.2: 8.6 };
        return map[this.selectedRodLength] || 6.0;
    }

    cycleRodLength() {
        const lengths = [3.6, 4.5, 5.4, 6.3, 7.2];
        const idx = lengths.indexOf(this.selectedRodLength);
        this.selectedRodLength = lengths[(idx + 1) % lengths.length];
        return this.selectedRodLength;
    }

    castGroundBait() {
        if (this.state !== FISHING_STATES.SEATED && this.state !== FISHING_STATES.FLOAT_WAIT && this.state !== FISHING_STATES.CASTING) {
            return { success: false, message: 'Hãy ngồi vào bến câu để xả mồi!' };
        }
        if (!this.activeGroundBait || (typeof this.activeGroundBait.charges === 'number' && this.activeGroundBait.charges <= 0)) {
            return {
                success: false,
                needMix: true,
                message: '⚠️ Khay mồi xả đang TRỐNG! Hãy mở Thau Pha Mồi (Phím M) để trộn mồi trước khi xả ổ!'
            };
        }

        if (typeof this.activeGroundBait.charges === 'number') {
            this.activeGroundBait.charges = Math.max(0, this.activeGroundBait.charges - 1);
        }
        this.updateBaitTrayVisuals();

        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const castDist = this.getCastDistance();
        const baitSpotX = this.camera.position.x + forward.x * castDist;
        const baitSpotZ = this.camera.position.z + forward.z * castDist;

        this.bubbleSystem.addGroundBaitSpot(baitSpotX, baitSpotZ, this.activeGroundBait);
        this.groundBaitsCastCount += 1;
        // Xả mồi giúp trấn an đàn cá và hồi phục ổ nhanh chóng sau khi giật trượt
        this.consecutiveMisses = Math.max(0, this.consecutiveMisses - 1);
        if (this.state === FISHING_STATES.FLOAT_WAIT) {
            this.waitFishTimer = Math.min(this.waitFishTimer, 8.0);
        }

        const rem = typeof this.activeGroundBait.charges === 'number' ? ` (Còn ${this.activeGroundBait.charges} nắm xả)` : '';
        return {
            success: true,
            message: `🥣 Đã ném mồi xả [${this.activeGroundBait.name}]${rem}! Mùi thơm lan tỏa trấn an đàn cá, dẫn dụ cá vào ổ!`
        };
    }

    castRod() {
        if (this.state !== FISHING_STATES.SEATED) return false;
        if (!this.activeHookBait || (typeof this.activeHookBait.charges === 'number' && this.activeHookBait.charges <= 0)) {
            return false;
        }

        // Vê 1 viên mồi câu lên 2 lưỡi câu đài
        if (typeof this.activeHookBait.charges === 'number') {
            this.activeHookBait.charges = Math.max(0, this.activeHookBait.charges - 1);
        }
        this.hookBaitIntegrity = 1.0;
        this.isBareHook = false;
        this.updateBaitTrayVisuals();

        this.state = FISHING_STATES.CASTING;
        this.castElapsed = 0;
        this.hasSpawnedLandingSplash = false;
        this.hasSpawnedBellyRipple = false;
        this.castPhaseLabel = '🎣 Đang bổ mồi ra ổ...';

        this.rodRestSupport.visible = true;
        this.landingNetGroup.visible = false;
        this.fish3DGroup.visible = false;
        this.waterEntrySpray.visible = false;

        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const castDist = this.getCastDistance();
        this.floatTargetPos.set(
            this.camera.position.x + forward.x * castDist,
            0.0,
            this.camera.position.z + forward.z * castDist
        );

        // Điểm xuất phát từ đọt cần khi vung bổ mồi
        if (this.rodRootGroup) {
            this.rodRootGroup.updateMatrixWorld();
            this.castStartPos.copy(this.rodTipLocalPos);
            this.rodRootGroup.localToWorld(this.castStartPos);
        } else {
            this.castStartPos.set(
                this.camera.position.x + forward.x * 2.8,
                0.65,
                this.camera.position.z + forward.z * 2.8
            );
        }

        this.floatCurrentPos.copy(this.castStartPos);
        this.floatVerticalOffset = 0;
        this.floatGroup.position.copy(this.floatCurrentPos);
        this.floatGroup.visible = true;
        if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
        this.fishingLine.visible = true;

        return true;
    }

    retrieveRod() {
        if (
            this.state === FISHING_STATES.CASTING ||
            this.state === FISHING_STATES.FLOAT_WAIT ||
            this.state === FISHING_STATES.BITING
        ) {
            this.bubbleSystem.clearHookBaitTarget();
            this.state = FISHING_STATES.SEATED;
            this.floatGroup.visible = false;
            if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
            this.fishingLine.visible = false;
            this.fish3DGroup.visible = false;
            this.waterEntrySpray.visible = false;
            this.landingNetGroup.visible = false;
            soundManager.playHooksetMiss();
            return true;
        }
        return false;
    }

    // TÍN HIỆU PHAO REALTIME: Hệ thống quyết định cá đã ngậm mồi thật hay mới chỉ nhấp / móm
    // Chuỗi: NIBBLE (nhấp rỉa) -> MOUTH (ngậm thử, đội phao) -> [SPIT: nhả mồi - móm] hoặc [TAKE: ngậm chặt, phao đi]
    // Chỉ giật trúng khi cá đang ở pha TAKE (ngậm chặt). Giật sớm = hụt + động ổ. Giật muộn = cá đã nhả mồi.
    // 6 KỊCH BẢN TÍN HIỆU PHAO ĐÀI CHÂN THỰC (Bềnh, Mất Hình, Giã Gạo, Bấm Giữ 1 Nấc, Ăn 2 Nhịp, Lướt Chạy Phao)
    startFishBite(aiFish = null) {
        if (this.state === FISHING_STATES.BITING || this.state === FISHING_STATES.FIGHTING) return;
        this.bubbleSystem.clearHookBaitTarget();
        this.pendingAIFish = aiFish;
        this.state = FISHING_STATES.BITING;
        this.fishApproaching = false;

        this.bubbleSystem.spawnCarpBubbles(this.floatTargetPos.x, this.floatTargetPos.z, true, false);
        this.bubbleSystem.spawnRipple(this.floatTargetPos.x, this.floatTargetPos.z, 0.75);

        const key = aiFish && aiFish.speciesKey ? aiFish.speciesKey : 'CARP';
        const sp = SPECIES[key] || SPECIES.CARP;
        const slow = aiFish && aiFish.currentSlow ? aiFish.currentSlow : 1.0;
        const aff = aiFish && typeof aiFish.currentAffinity === 'number' ? aiFish.currentAffinity : 1.0;
        const isFresh = !!(aiFish && aiFish.isFresh);

        // Xác suất móm: cá khôn, cá to, mồi chưa chuẩn khẩu vị => móm nhiều; cá mới bồi => ăn bạo ít móm
        let mouthy = sp.mouthiness * (isFresh ? 0.55 : 1.0);
        if (aiFish) mouthy *= (0.8 + aiFish.caution * 0.55);
        mouthy += Math.max(0, 1.0 - Math.min(1.0, aff)) * 0.22;
        const habit = this.bubbleSystem.currentHabitMode;
        if (habit === 'SLOW_LOCKJAW') mouthy += 0.2;
        mouthy = THREE.MathUtils.clamp(mouthy, 0.05, 0.88);
        const flavorDrops = this.activeHookBait && typeof this.activeHookBait.totalFlavorDrops === 'number'
            ? this.activeHookBait.totalFlavorDrops
            : 0;
        const isSunny = !this.environment || this.environment.weather === 'SUNNY';
        const isFlavorOverdose = flavorDrops >= (isSunny ? 7 : 9);

        let willCommit = Math.random() > mouthy;

        // KỊCH BẢN ĐẶC BIỆT CÂU ĐÀI: NẾU NẶNG HƯƠNG LIỆU QUÁ
        // Cá bị sặc mùi nồng tụ lại cày nhiều tăm nhưng không chịu nuốt mồi!
        // Thay vào đó cá quẹt vây và thân vào dây trục làm ĐÈ PHAO: phao chìm từ từ dần xuống xong lại từ từ nổi lên!
        let scenario;
        if (isFlavorOverdose && Math.random() < 0.85) {
            scenario = 'FLOAT_PRESS';
            willCommit = false; // Cá sặc mùi chỉ quẹt dây chứ không cắn mồi!
        } else {
            // Phân bổ kịch bản theo đặc trưng sinh học từng loài & LỐI ĐÁNH (Câu Cân Đài / Bán Đấu / Hố Đấu giấu thẻo)
            const curStyle = (this.rigConfig && this.rigConfig.fishingStyle) ? this.rigConfig.fishingStyle : 'CAN_DAI';
            let scenarios = ['LIFT', 'SUBMERGE', 'MORTAR', 'SNAP_HOLD', 'TWO_STEP', 'SKATE_RUN'];
            if (curStyle === 'HO_DAU') {
                // Câu Hố Đấu (trục xiên 45°, giấu thẻo sát đáy): Tỷ lệ cá GIÃ GẠO (MORTAR) & MẤT HÌNH PHAO (SUBMERGE) rất cao!
                scenarios = ['SUBMERGE', 'SUBMERGE', 'SUBMERGE', 'MORTAR', 'MORTAR', 'MORTAR', 'TWO_STEP', 'LIFT'];
            } else if (curStyle === 'BAN_DAU') {
                // Câu Bán Đấu (trục hơi xiên, giấu thẻo nhẹ): Tỷ lệ giã gạo & mất hình phao cao hơn câu cân đài
                scenarios = ['SUBMERGE', 'SUBMERGE', 'MORTAR', 'MORTAR', 'TWO_STEP', 'LIFT', 'SNAP_HOLD'];
            } else if (key === 'TILAPIA') {
                scenarios = ['MORTAR', 'MORTAR', 'SNAP_HOLD', 'LIFT', 'TWO_STEP'];
            } else if (key === 'BLACK_CARP') {
                scenarios = ['SUBMERGE', 'SUBMERGE', 'SNAP_HOLD', 'TWO_STEP'];
            } else if (key === 'GRASS_CARP') {
                scenarios = ['SKATE_RUN', 'SKATE_RUN', 'SUBMERGE', 'TWO_STEP', 'LIFT'];
            } else if (key === 'OLD_CARP') {
                scenarios = ['TWO_STEP', 'TWO_STEP', 'SNAP_HOLD', 'LIFT', 'SUBMERGE'];
            }
            scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
        }

        // Thiết lập các giai đoạn (stages) và thời lượng chuẩn từng kịch bản
        let stages = [];
        if (scenario === 'LIFT') {
            // Nhịp PHAO BỀNH CẢ CỦ: khi đã bềnh cả củ thì chắc chắn cá đã đội chì nuốt gọn (100% dính cá!)
            willCommit = true;
            stages = [
                { name: 'NIBBLE', duration: (0.7 + Math.random() * 0.6) * Math.min(2.0, slow) },
                { name: 'LIFTING', duration: (2.2 + Math.random() * 1.2) * Math.min(2.0, slow) }
            ];
        } else if (scenario === 'SUBMERGE') {
            // Nhịp PHAO MẤT HÌNH: phao tụt lút biến mất dưới mặt nước — tỷ lệ đóng dính cá 50/50!
            willCommit = true;
            stages = [
                { name: 'TREMOR', duration: (0.45 + Math.random() * 0.35) * Math.min(1.8, slow) },
                { name: 'PLUNGE', duration: (1.8 + Math.random() * 1.0) * Math.min(2.0, slow) }
            ];
        } else if (scenario === 'FLOAT_PRESS') {
            // ĐÈ PHAO: Cá sục bùn cày tăm -> Phao chìm từ từ dần xuống -> Xong lại từ từ nổi lên!
            stages = [
                { name: 'PECK_MUD', duration: 1.4 + Math.random() * 0.5 },
                { name: 'SLOW_SINK', duration: 2.6 + Math.random() * 0.7 },
                { name: 'SLOW_RISE', duration: 2.3 + Math.random() * 0.6 }
            ];
        } else if (scenario === 'MORTAR') {
            stages = [
                { name: 'PECKING', duration: (2.4 + Math.random() * 1.8) * Math.min(1.8, slow) },
                { name: 'TAKE_OR_SPIT', duration: (1.8 + Math.random() * 0.8) }
            ];
        } else if (scenario === 'SNAP_HOLD') {
            stages = [
                { name: 'SNAP', duration: 0.18 },
                { name: 'HOLD', duration: (2.0 + Math.random() * 1.0) * Math.min(2.0, slow) }
            ];
        } else if (scenario === 'TWO_STEP') {
            stages = [
                { name: 'STEP1', duration: 0.8 + Math.random() * 0.4 },
                { name: 'PAUSE', duration: (1.4 + Math.random() * 0.8) * Math.min(2.0, slow) },
                { name: 'STEP2', duration: (1.8 + Math.random() * 1.0) }
            ];
        } else if (scenario === 'SKATE_RUN') {
            stages = [
                { name: 'TILT', duration: 0.6 + Math.random() * 0.3 },
                { name: 'SKATE', duration: (2.0 + Math.random() * 1.2) * Math.min(2.0, slow) }
            ];
        }

        this.biteScript = {
            scenario,
            stageIndex: 0,
            stages,
            stageTime: 0,
            willCommit,
            isTakeWindow: false,
            speciesKey: key,
            driftX: 0,
            driftZ: 0,
            rippleTimer: 0,
            flavorDrops,
            isFlavorOverdose
        };

        this.biteType = BITE_TYPES.FLOAT_LIFT;
        this.biteMaxTime = 1;
        this.biteTimer = 1;
        this.bitePromptText = '';
    }

    advanceBiteScript(delta) {
        const s = this.biteScript;
        if (!s) return null;
        s.stageTime += delta;
        const curStage = s.stages[s.stageIndex];
        if (!curStage) return 'TAKE_MISSED';

        if (s.stageTime >= curStage.duration) {
            s.stageTime = 0;
            s.stageIndex += 1;
            if (s.stageIndex >= s.stages.length) {
                if (s.scenario === 'FLOAT_PRESS') {
                    return 'FLOAT_PRESS_RESTORE';
                }
                return s.willCommit ? 'TAKE_MISSED' : 'MOM_END';
            }
            const nextStage = s.stages[s.stageIndex];
            if (s.willCommit && (nextStage.name === 'LIFTING' || nextStage.name === 'PLUNGE' || nextStage.name === 'STEP2' || nextStage.name === 'SKATE' || nextStage.name === 'TAKE_OR_SPIT')) {
                this.bubbleSystem.spawnCarpBubbles(this.floatTargetPos.x, this.floatTargetPos.z, true, true);
            }
        }
        return null;
    }

    // Cá nhả mồi bỏ đi mà cần thủ chưa giật trúng
    resolveBiteEnded(reason) {
        if (reason === 'FLOAT_PRESS_RESTORE') {
            const fDrops = this.biteScript ? (this.biteScript.flavorDrops || 'nhiều') : 'nhiều';
            this.biteScript = null;
            this.pendingAIFish = null;
            this.state = FISHING_STATES.FLOAT_WAIT;
            this.floatVerticalOffset = 0;
            this.waitFishTimer = 3.0 + Math.random() * 4.0;
            if (this.lastHookTargetInfo) {
                this.bubbleSystem.setHookBaitTarget(this.lastHookTargetInfo);
            }
            const msg = `💡 ĐÈ PHAO (NẶNG HƯƠNG LIỆU ${fDrops} GIỌT): Cá sặc mùi cày tăm & quẹt vây đè phao chìm dần rồi nổi lên! Bạn đã kiên nhẫn không giật bậy, giữ trọn ổ câu!`;
            window.dispatchEvent(new CustomEvent('player_fishing_event', { detail: { type: 'INFO', text: msg } }));
            return;
        }

        const keyName = this.biteScript ? (SPECIES[this.biteScript.speciesKey] || SPECIES.CARP).name : 'Cá';
        this.biteScript = null;
        this.pendingAIFish = null;
        this.state = FISHING_STATES.FLOAT_WAIT;
        this.floatVerticalOffset = 0;
        const fPos = this.floatTargetPos;
        // Nếu bị giật trượt nhiều lần liên tiếp, cá sẽ ăn cực kỳ chậm (nửa tiếng - 1 tiếng giờ hồ mới có nhịp lại)
        let missPenalty = 0;
        if (this.consecutiveMisses === 1) missPenalty = 14.0 + Math.random() * 8.0;
        else if (this.consecutiveMisses === 2) missPenalty = 32.0 + Math.random() * 15.0; // ~nửa tiếng giờ hồ
        else if (this.consecutiveMisses >= 3) missPenalty = 60.0 + Math.random() * 25.0; // ~1 tiếng giờ hồ
        this.waitFishTimer = 5.0 + Math.random() * 6.0 + missPenalty;
        this.fishApproaching = true;
        this.approachProgress = 0;
        const ang = Math.random() * Math.PI * 2;
        this.approachStartPos.set(fPos.x + Math.cos(ang) * 2.4, fPos.z + Math.sin(ang) * 2.4);
        if (this.lastHookTargetInfo) {
            this.bubbleSystem.setHookBaitTarget(this.lastHookTargetInfo);
        }
        let msg;
        let evtType;
        if (reason === 'MOM_END') {
            msg = `😤 ${keyName} MÓM! Cá thăm dò rồi nhả mồi bơi đi, phao trở lại im lìm. Kiên nhẫn đợi nhịp khác!`;
            evtType = 'MOM';
        } else {
            msg = `💨 ${keyName} đã nuốt mồi nhưng quá thời gian không giật nên cá nhả mồi bơi đi mất!`;
            evtType = 'MISSED';
        }
        window.dispatchEvent(new CustomEvent('fish_escaped', { detail: { message: msg } }));
        window.dispatchEvent(new CustomEvent('player_fishing_event', { detail: { type: evtType, text: msg } }));
        soundManager.playHooksetMiss();
    }

    // Giật cần: Không báo trước bằng popup chữ, người chơi quan sát phao bằng mắt thật
    strikeRod() {
        if (this.state === FISHING_STATES.FLOAT_WAIT) {
            this.consecutiveMisses += 1;
            const scareRadius = Math.min(22.0, 7.0 + this.consecutiveMisses * 4.5);
            const scared = this.bubbleSystem.scareFishNear(this.floatTargetPos.x, this.floatTargetPos.z, scareRadius);
            this.retrieveRod();

            let penaltyNote = '';
            if (this.consecutiveMisses === 2) {
                penaltyNote = ' (ĐÃ TRƯỢT 2 LẦN: Đàn cá dạt ra xa, cá ăn cực chậm, nửa tiếng hồ mới có nhịp lại!)';
            } else if (this.consecutiveMisses >= 3) {
                penaltyNote = ` (VỠ Ổ! Trượt ${this.consecutiveMisses} lần: Cá hoảng loạn khóa mồm, gần 1 tiếng hồ mới dám quay lại ổ!)`;
            }

            const msg = scared > 0
                ? `⚠️ Giật khi phao chưa có tín hiệu! ${scared} con cá dưới ổ giật mình tản ra!${penaltyNote}`
                : `Giật vào khoảng không (phao chưa có tín hiệu), đã thu mồi về!${penaltyNote}`;

            window.dispatchEvent(new CustomEvent('player_fishing_event', { detail: { type: 'EARLY', text: msg } }));
            return { success: false, message: msg };
        }

        if (this.state !== FISHING_STATES.BITING) {
            return { success: false, message: '' };
        }

        const s = this.biteScript;
        if (!s) {
            this.retrieveRod();
            return { success: false, message: 'Đã thu cần về!' };
        }

        // Kiểm tra xem cần thủ có giật đúng vào thời điểm vàng (isTakeWindow) hay không
        if (!s.isTakeWindow) {
            this.consecutiveMisses += 1;
            const scareRadius = Math.min(24.0, 8.5 + this.consecutiveMisses * 5.0);
            const scared = this.bubbleSystem.scareFishNear(this.floatTargetPos.x, this.floatTargetPos.z, scareRadius);
            const scenario = s.scenario;
            const curStage = s.stages[s.stageIndex] ? s.stages[s.stageIndex].name : '';
            this.biteScript = null;
            this.pendingAIFish = null;
            this.retrieveRod();

            let earlyMsg = '⚠️ Giật sớm khi cá chưa kịp nuốt mồi!';
            if (scenario === 'FLOAT_PRESS') {
                earlyMsg = `⚠️ GIẬT HỤT DO ĐÈ PHAO: Mồi quá nặng hương liệu (${s.flavorDrops || 'nhiều'} giọt)! Cá sặc mùi chỉ quẹt vây đè phao chìm dần rồi nổi lên chứ không cắn mồi — ${scared} con cá tản ổ! Hãy kiên nhẫn không giật ẩu hoặc pha nhạt hương liệu bớt (3-5 giọt)!`;
            } else if (scenario === 'MORTAR' && curStage === 'PECKING') {
                earlyMsg = `⚠️ Giật quá sớm! Cá đang GIÃ GẠO rỉa ngoài mép mồi chưa nuốt — ${scared} con cá tản ổ!`;
            } else if (scenario === 'TWO_STEP' && (curStage === 'STEP1' || curStage === 'PAUSE')) {
                earlyMsg = `⚠️ Giật non ở nhịp 1! Cá mới nhấm thử chưa kịp sang nhịp 2 — ${scared} con cá giật mình bỏ đi!`;
            } else if (scenario === 'SNAP_HOLD' && curStage === 'SNAP') {
                earlyMsg = `⚠️ Giật quá vội khi phao chưa kịp bấm giữ im — cá giật mình nhả mồi!`;
            } else if (scenario === 'LIFT' && curStage === 'NIBBLE') {
                earlyMsg = `⚠️ Giật non khi phao chưa kịp bềnh lên — lưỡi chưa vào hàm!`;
            } else {
                earlyMsg = `⚠️ Giật sớm! Cá mới nhấp nháy thăm dò chứ chưa ngậm chặt — ${scared} con cá tản ổ!`;
            }

            if (this.consecutiveMisses === 2) {
                earlyMsg += ` ⚠️ ĐỘNG Ổ (Trượt 2 lần): Cá cảnh giác cao độ, nửa tiếng hồ mới có nhịp lại! Hãy bấm [Phím F - Xả Mồi]!`;
            } else if (this.consecutiveMisses >= 3) {
                earlyMsg += ` 💥 VỠ Ổ NẶNG (Trượt ${this.consecutiveMisses} lần): Cả đàn cá tản sạch và khóa mồm, gần 1 tiếng hồ mới có nhịp mới! Hãy xả mồi tụ ổ ngay!`;
            }

            window.dispatchEvent(new CustomEvent('player_fishing_event', { detail: { type: 'EARLY', text: earlyMsg } }));
            return { success: false, message: earlyMsg };
        }

        // QUY TẮC TỶ LỆ DÍNH CÁ THEO NHỊP PHAO THỰC TẾ:
        // - Nhịp PHAO MẤT HÌNH (SUBMERGE): Tỷ lệ dính cá 50/50 (50% đóng dính, 50% trượt do cá quệt dây/nhả cực nhanh!)
        // - Nhịp PHAO BỀNH CẢ CỦ (LIFT): Tỷ lệ dính cá 100%!
        if (s.scenario === 'SUBMERGE' && Math.random() >= 0.50) {
            this.biteScript = null;
            this.pendingAIFish = null;
            this.retrieveRod();
            soundManager.playHooksetMiss();
            const msg5050 = '💨 NHỊP PHAO MẤT HÌNH (Tỷ lệ 50/50): Giật đúng lúc phao tụt mất hình nhưng trúng pha cá quệt dây / nhả nhanh — trượt mất rồi! Ra cần tiếp nhé!';
            window.dispatchEvent(new CustomEvent('player_fishing_event', { detail: { type: 'MISSED', text: msg5050 } }));
            return { success: false, message: msg5050 };
        }

        // GIẬT TRÚNG THỜI ĐIỂM VÀNG (HIT)! Reset chuỗi trượt về 0
        this.consecutiveMisses = 0;
        let praiseText = 'Đóng trúng hàm trên! Cần đã cong vút chữ C!';
        if (s.scenario === 'LIFT') {
            praiseText = '🎯 PHAO BỀNH CẢ CỦ (100% DÍNH CÁ)! Cá đội chì nuốt trọn lưỡi — đóng chuẩn tuyệt đối!';
        } else if (s.scenario === 'SUBMERGE') {
            praiseText = '🔥 ĐÓNG TRÚNG NHỊP PHAO MẤT HÌNH (50/50 THÀNH CÔNG)! Cần cong vút chữ C, cá đóng sâu!';
        } else if (s.scenario === 'MORTAR') {
            praiseText = 'Đóng chuẩn sau chuỗi GIÃ GẠO! Bắt đúng nhịp đè dứt khoát!';
        } else if (s.scenario === 'SNAP_HOLD') {
            praiseText = 'Cú giật đỉnh cao đúng nhịp PHAO BẤM 1 NẤC RỒI GIỮ IM!';
        } else if (s.scenario === 'TWO_STEP') {
            praiseText = 'Bắt trọn NHỊP 2 sau khoảng lặng nín thở! Đóng ngập hàm!';
        } else if (s.scenario === 'SKATE_RUN') {
            praiseText = 'Đóng đúng lúc CÁ LƯỚT CHẠY PHAO RẼ NƯỚC!';
        }

        this.biteScript = null;
        this.updateFloatLedGlow(false);
        this.state = FISHING_STATES.FIGHTING;
        this.initFishFight();
        soundManager.playHooksetSuccess(this.hookedFish ? this.hookedFish.weight : 3.0);
        this.bendVelocity = 3.2;

        window.dispatchEvent(new CustomEvent('fish_hooked_net', {
            detail: { fish: this.hookedFish }
        }));

        return {
            success: true,
            hit: true,
            message: `🎯 ĐÓNG DÍNH [${this.hookedFish.name} ${this.hookedFish.weight}kg]! ${praiseText}`
        };
    }

    // Dựng lại mô hình cá bị đóng theo đúng loài (chép / trắm đen / trắm cỏ / rô phi)
    setFightFishModel(speciesKey, weight) {
        while (this.fish3DGroup.children.length > 0) {
            this.fish3DGroup.remove(this.fish3DGroup.children[0]);
        }
        const model = buildRealisticFish(speciesKey, weight, { noScale: true });
        const holder = new THREE.Group();
        holder.rotation.y = Math.PI; // Mô hình mũi +Z -> cá đang bơi mũi hướng -Z theo quy ước cũ của hệ cá bị đóng
        holder.add(model);
        this.fish3DGroup.add(holder);
        this.fishTailMesh = model.userData.tailPivot;
    }

    initFishFight() {
        const speciesList = this.currentLake ? this.currentLake.fishSpecies : [
            { name: 'Cá Chép Củ Gấu', weightRange: [6.0, 15.0], rarity: 'Hiếm', icon: '🐟' }
        ];

        const selectedSpecies = speciesList[Math.floor(Math.random() * speciesList.length)];
        const minW = selectedSpecies.weightRange[0];
        const maxW = selectedSpecies.weightRange[1];

        const weather = this.environment ? this.environment.weather : 'SUNNY';
        const flavorDrops = this.activeHookBait && typeof this.activeHookBait.totalFlavorDrops === 'number'
            ? this.activeHookBait.totalFlavorDrops
            : 4;
        const waterEffect = BaitMixingSystem.getWaterFlavorEffect(flavorDrops, weather);

        const baitBonus = this.activeHookBait ? (this.activeHookBait.bigCarpBonus || 0) / 100 : 0.15;
        const effectiveBonus = Math.min(1.2, Math.max(0.05, baitBonus * waterEffect.multiplier));
        const fallbackWeight = parseFloat((minW + Math.random() * (maxW - minW) * (0.62 + effectiveBonus * 0.38)).toFixed(2));

        // Nếu có Cá AI 3D trực tiếp hút mồi dưới ổ thì đồng bộ chính xác tên & cân nặng của con Cá AI đó!
        const aiFish = this.pendingAIFish;
        this.pendingAIFish = null;
        const isTaggedPrize = !!(aiFish && aiFish.isTaggedPrize) || Math.random() < 0.14;
        const baseName = aiFish ? aiFish.speciesName : selectedSpecies.name;
        const finalName = (isTaggedPrize && !baseName.includes('KHUYÊN'))
            ? `🏅 ${baseName} [ĐEO KHUYÊN VÀNG]`
            : baseName;
        const finalWeight = aiFish ? aiFish.weight : fallbackWeight;
        const speciesKey = aiFish && aiFish.speciesKey ? aiFish.speciesKey : inferSpeciesKey(baseName);
        const speciesProfile = SPECIES[speciesKey] || SPECIES.CARP;
        const speciesIcons = { CARP: '🐟', OLD_CARP: '👑', BLACK_CARP: '🖤', GRASS_CARP: '🌿', TILAPIA: '🐠' };

        // KỊCH BẢN ĐỜI THỰC CÂU ĐÀI VIỆT NAM: "ĐÓNG SỐC LƯỜN CÁ" (22% xác suất móc ngang vây lưng / lườn cá làm cá chạy khỏe gấp rưỡi!)
        const isFoulHooked = Math.random() < 0.22;
        const basePower = Math.min(1.0, (finalWeight / 12.0) * speciesProfile.fightPowerMul);

        const isHoanBoss = this.currentLake && this.currentLake.id === 'lake_hoan_boss';
        const prizeAmount = isHoanBoss ? 500000 : 200000;

        this.hookedFish = {
            aiFishId: aiFish ? aiFish.id : null,
            name: finalName,
            weight: finalWeight,
            speciesKey,
            rarity: isTaggedPrize ? `🏅 Cá Khuyên Thưởng Nóng (+${prizeAmount / 1000}k)` : (finalWeight >= 10.0 ? 'Cực Hiếm (Cá Cụ AI)' : (aiFish ? (speciesProfile.isBig ? 'Hiếm' : 'Phổ Biến') : selectedSpecies.rarity)),
            icon: isTaggedPrize ? '🏅' : (aiFish ? speciesIcons[speciesKey] : (selectedSpecies.icon || '🐟')),
            color: selectedSpecies.color || '#ffb703',
            fightPower: isFoulHooked ? Math.min(1.0, basePower * 1.25) : basePower,
            isTaggedPrize,
            prizeBonus: isTaggedPrize ? prizeAmount : 0,
            isFoulHooked
        };

        this.safetyLeashAvailable = true; // Trang bị 1 lượt Dây Bảo Hiểm cứu cần khi cá kéo căng đỏ 98%
        this.lineTension = isFoulHooked ? 0.46 : 0.35;
        this.fishStamina = 1.0;
        this.fishDistance = 5.8;
        this.fishLateralX = 0.0;
        this.surfaceProgress = 0.0;
        this.isNettingAnim = false;

        this.fightPhase = isFoulHooked ? FIGHT_PHASES.RUN_LEFT : FIGHT_PHASES.RUN_OUT;
        this.phaseTimer = 6.5;
        this.phaseGraceTimer = 1.8;
        this.isSantoJumping = false;
        this.santoProgress = 0;
        this.santoCooldown = isFoulHooked ? 1.4 : 2.4;

        // Kịch bản hiểm hóc khi bo cá: Cá phóng vào cọc chân cầu gỗ / cọc tre ven bờ
        this.stakeHazard = null;
        this.stakeHazardTimer = 3.2 + Math.random() * 2.8;
        this.hasTriggeredStakeHazard = false;

        if (isFoulHooked) {
            window.dispatchEvent(new CustomEvent('real_life_scenario', {
                detail: {
                    title: '⚡ KỊCH BẢN ĐỜI THỰC: ĐÓNG SỐC LƯỜN CÁ!',
                    desc: `Lưỡi câu móc ngang vây lưng cụ [${finalName} ${finalWeight}kg] làm cá lồng lộn chạy ngang khỏe gấp rưỡi!`,
                    type: 'WARN'
                }
            }));
        } else if (isTaggedPrize) {
            window.dispatchEvent(new CustomEvent('real_life_scenario', {
                detail: {
                    title: `🏅 TRÚNG CÁ ĐEO KHUYÊN VÀNG CỦA CHỦ HỒ (+${prizeAmount.toLocaleString()}đ)!`,
                    desc: `Đóng trúng cụ cá đeo khuyên thưởng nóng +${prizeAmount.toLocaleString()}đ tiền tươi! Hãy dòng cẩn thận đưa vào vợt để lĩnh thưởng!`,
                    type: 'GOLD'
                }
            }));
        }

        this.floatGroup.visible = false;
        if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
        this.rodRestSupport.visible = false;
        this.landingNetGroup.visible = false;
        this.fish3DGroup.visible = true;
        this.waterEntrySpray.visible = true;
        if (this.vWakeGroup) this.vWakeGroup.visible = true;

        const fScale = THREE.MathUtils.clamp(0.7 + this.hookedFish.weight / 14.0, 0.8, 1.75);
        this.fish3DGroup.scale.set(fScale, fScale, fScale);
        this.setFightFishModel(this.hookedFish.speciesKey, this.hookedFish.weight);
    }

    hideAllWaterSpray() {
        if (!this.waterSprayDrops) return;
        this.waterSprayDrops.forEach(d => {
            d.life = 0;
            d.mesh.visible = false;
        });
    }

    spawnWaterSprayBurst(originX, originZ, count = 8, upSpeed = 2.6, spreadSpeed = 1.8) {
        if (!this.waterSprayDrops) return;
        let spawned = 0;
        for (let i = 0; i < this.waterSprayDrops.length && spawned < count; i++) {
            const d = this.waterSprayDrops[i];
            if (d.life <= 0) {
                d.life = 0.45 + Math.random() * 0.35;
                d.mesh.position.set(
                    originX + (Math.random() - 0.5) * 0.25,
                    0.06 + Math.random() * 0.12,
                    originZ + (Math.random() - 0.5) * 0.25
                );
                const ang = Math.random() * Math.PI * 2;
                const spd = (0.3 + Math.random() * 0.7) * spreadSpeed;
                d.vx = Math.cos(ang) * spd;
                d.vz = Math.sin(ang) * spd;
                d.vy = upSpeed * (0.65 + Math.random() * 0.55);
                d.mesh.visible = true;
                spawned++;
            }
        }
    }

    // ==================== CHIÊU THỨC BO CÁ ĐẠI SƯ: 🐉 NGỰ LONG & 🌊 HẠ NGƯ ====================
    useSkillNguLong() {
        if (this.state !== FISHING_STATES.FIGHTING || !this.hookedFish) {
            return { success: false, message: 'Chỉ dùng được khi đang bo cá!' };
        }
        if (this.nguLongCooldown > 0) {
            return { success: false, message: `🐉 Ngự Long đang hồi chiêu (${this.nguLongCooldown.toFixed(1)}s)!` };
        }
        this.nguLongCooldown = 6.0;
        this.activeFightSkill = { type: 'NGU_LONG', timer: 1.5, elapsed: 0 };
        const isRunOut = (this.fightPhase === FIGHT_PHASES.RUN_OUT);
        this.lineTension = Math.max(0.26, this.lineTension - (isRunOut ? 0.26 : 0.16));
        this.fishStamina = Math.max(0.05, this.fishStamina - (isRunOut ? 0.20 : 0.12));
        this.fishDistance = Math.max(2.6, this.fishDistance - (isRunOut ? 1.1 : 0.5));
        this.phaseGraceTimer = 1.6;
        if (isRunOut) {
            this.fightPhase = Math.random() < 0.5 ? FIGHT_PHASES.RUN_LEFT : FIGHT_PHASES.RUN_RIGHT;
            this.phaseTimer = 4.5;
        }
        soundManager.playWaterSplash(1.25);
        window.dispatchEvent(new CustomEvent('real_life_scenario', {
            detail: {
                title: '🐉 CHIÊU THỨC: NGỰ LONG XOÁY CẦN!',
                desc: isRunOut
                    ? 'Xoáy tròn đầu cần phá tan pha lao thẳng của cá! Lực căng giảm mạnh & cá mất phương hướng!'
                    : 'Xoáy cần Ngự Long dìu cá, giảm căng dây và rút sức cá nhanh chóng!',
                type: 'GOLD'
            }
        }));
        return { success: true, message: '🐉 Đã thi triển NGỰ LONG XOÁY CẦN!' };
    }

    useSkillHaNgu() {
        if (this.state !== FISHING_STATES.FIGHTING || !this.hookedFish) {
            return { success: false, message: 'Chỉ dùng được khi đang bo cá!' };
        }
        if (this.haNguCooldown > 0) {
            return { success: false, message: `🌊 Hạ Ngư đang hồi chiêu (${this.haNguCooldown.toFixed(1)}s)!` };
        }
        this.haNguCooldown = 7.5;
        this.activeFightSkill = { type: 'HA_NGU', timer: 1.6, elapsed: 0 };
        const isRunOut = (this.fightPhase === FIGHT_PHASES.RUN_OUT);
        this.lineTension = Math.max(0.22, this.lineTension - (isRunOut ? 0.34 : 0.22));
        this.fishStamina = Math.max(0.05, this.fishStamina - 0.15);
        this.fishDistance = Math.max(2.6, this.fishDistance - (isRunOut ? 1.8 : 0.9));
        this.phaseGraceTimer = 1.8;
        if (isRunOut) {
            this.fightPhase = Math.random() < 0.5 ? FIGHT_PHASES.RUN_LEFT : FIGHT_PHASES.RUN_RIGHT;
            this.phaseTimer = 4.5;
        }
        soundManager.playWaterSplash(1.4);
        window.dispatchEvent(new CustomEvent('real_life_scenario', {
            detail: {
                title: '🌊 CHIÊU THỨC: HẠ NGƯ DÌM CẦN XUỐNG NƯỚC!',
                desc: 'Dìm ngọn cần sâu xuống mặt hồ đổi góc kéo — cá tưởng hết lực lập tức quay ngoắt đầu bơi ngược vào bờ!',
                type: 'GOLD'
            }
        }));
        return { success: true, message: '🌊 Đã thi triển HẠ NGƯ DÌM CẦN XUỐNG NƯỚC!' };
    }

    // KỸ THUẬT THẢ DÂY BẢO HIỂM CỨU CẦN 3D (Phím X): Bung cần theo cá khi quá tải, xả -52% lực căng & cứu gãy lóng!
    triggerSafetyLeash() {
        if (this.state !== FISHING_STATES.FIGHTING || !this.hookedFish) {
            return { success: false, message: 'Chỉ dùng được Dây Bảo Hiểm khi đang bo cá!' };
        }
        if (!this.safetyLeashAvailable) {
            return { success: false, message: '🪢 Bạn đã dùng hết lượt Thả Dây Bảo Hiểm cho con cá này!' };
        }
        this.safetyLeashAvailable = false;
        this.activeFightSkill = { type: 'SAFETY_LEASH', timer: 2.4, elapsed: 0 };
        this.lineTension = Math.max(0.18, this.lineTension - 0.52);
        this.fishStamina = Math.max(0.05, this.fishStamina - 0.18);
        this.phaseGraceTimer = 2.6;
        if (this.fightPhase === FIGHT_PHASES.UNDER_PIER) {
            this.fightPhase = FIGHT_PHASES.RUN_OUT;
            this.phaseTimer = 4.0;
        }
        soundManager.playWaterSplash(1.6);
        window.dispatchEvent(new CustomEvent('real_life_scenario', {
            detail: {
                title: '🪢 THẢ DÂY BẢO HIỂM CỨU CẦN NGOẠN MỤC!',
                desc: 'Bạn đã bung cần theo dây bảo hiểm co giãn — xả lập tức 52% lực căng, cứu cần khỏi gãy lóng & chống nổ thẻo!',
                type: 'GOLD'
            }
        }));
        return { success: true, message: '🪢 Đã THẢ DÂY BẢO HIỂM cứu cần (-52% lực căng)!' };
    }

    pickNextFishRun() {
        if (this.fishStamina <= 0.25) {
            this.fightPhase = FIGHT_PHASES.PIN_SURFACE;
            return;
        }

        // 24% cơ hội (hoặc khi cá vào sát < 4.5m) cá bất ngờ lao vào khu vực chân đứng / gầm cầu!
        const wantUnderPier = (this.fightPhase !== FIGHT_PHASES.UNDER_PIER) &&
            (this.fishDistance < 4.5 ? Math.random() < 0.38 : Math.random() < 0.20);

        if (wantUnderPier) {
            const bonusT = this.equipBonuses ? (this.equipBonuses.stakeTimeBonus || 0) * 0.4 : 0;
            this.fightPhase = FIGHT_PHASES.UNDER_PIER;
            this.underPierTimer = 2.9 + bonusT;
            this.underPierHold = 0;
            this.phaseGraceTimer = 0.6;
            soundManager.playLineSing(0.95, true);
            window.dispatchEvent(new CustomEvent('real_life_scenario', {
                detail: {
                    title: '⚠️ NGUY HIỂM: CÁ LAO VÀO KHU VỰC CHÂN ĐỨNG / GẦM CẦU!',
                    desc: 'GIỮ NGAY [⬆️ MŨI TÊN LÊN / W / CHUỘT TRÁI] ĐỂ DỰNG THẲNG CẦN LÊN CAO! Nếu không dựng cần cá sẽ cuốn vào chân cầu bong mất!',
                    type: 'WARN'
                }
            }));
            return;
        }

        const phases = [FIGHT_PHASES.RUN_OUT, FIGHT_PHASES.RUN_LEFT, FIGHT_PHASES.RUN_RIGHT];
        const otherPhases = phases.filter(p => p !== this.fightPhase);
        this.fightPhase = otherPhases[Math.floor(Math.random() * otherPhases.length)];
        this.phaseTimer = 6.0 + Math.random() * 1.5;
        this.phaseGraceTimer = 1.8;

        soundManager.playWaterSplash(0.85);
        this.bendVelocity += 1.4;
    }

    updateFight(delta, keys) {
        if (this.state !== FISHING_STATES.FIGHTING || !this.hookedFish) return null;
        if (this.isNettingAnim) return { finished: false };

        if (this.nguLongCooldown > 0) this.nguLongCooldown = Math.max(0, this.nguLongCooldown - delta);
        if (this.haNguCooldown > 0) this.haNguCooldown = Math.max(0, this.haNguCooldown - delta);

        const power = this.hookedFish.fightPower;
        const keyUp = keys.forward || keys.isMouseDown;
        const keyLeft = keys.left;
        const keyRight = keys.right;
        const keyDown = keys.backward;

        let actionFeedback = '';
        let isCounteringCorrectly = false;

        if (this.phaseGraceTimer > 0) {
            this.phaseGraceTimer = Math.max(0, this.phaseGraceTimer - delta);
        }

        // KỊCH BẢN ĐỜI THỰC CÂU ĐÀI VIỆT NAM: "CÁ CUỐN VÀO CỌC CẦU GỖ / CỌC TRE"
        // Đối với cá to (>= 3.2kg), cá sẽ bất ngờ quay đầu lao thẳng vào cọc tre chân cầu! Người chơi phải phản xạ ghì cần ngược lại để bẻ lái!
        if (!this.hasTriggeredStakeHazard && !this.stakeHazard && this.hookedFish && this.hookedFish.weight >= 3.2) {
            this.stakeHazardTimer -= delta;
            if (this.stakeHazardTimer <= 0 && (
                this.fightPhase === FIGHT_PHASES.RUN_OUT ||
                this.fightPhase === FIGHT_PHASES.RUN_LEFT ||
                this.fightPhase === FIGHT_PHASES.RUN_RIGHT
            )) {
                this.hasTriggeredStakeHazard = true;
                const isLeftHazard = Math.random() < 0.5;
                const side = isLeftHazard ? 'LEFT' : 'RIGHT';
                const requiredKey = isLeftHazard ? 'right' : 'left'; // Cá lao cọc bên trái -> ghì cần sang phải để ép đầu cá quay ra
                const requiredKeyName = isLeftHazard ? '➡️ MŨI TÊN PHẢI (D)' : '⬅️ MŨI TÊN TRÁI (A)';

                const stakeBonusTime = this.equipBonuses ? (this.equipBonuses.stakeTimeBonus || 0) : 0;
                this.stakeHazard = {
                    side,
                    requiredKey,
                    requiredKeyName,
                    timeLeft: 3.2 + stakeBonusTime,
                    holdTime: 0,
                    requiredHold: 0.95
                };

                soundManager.playLineSing(1.0, true);
                soundManager.playWaterSplash(1.35);
                this.bendVelocity += 3.8;

                window.dispatchEvent(new CustomEvent('real_life_scenario', {
                    detail: {
                        title: `⚠️ NGUY HIỂM TỘT CÙNG: CÁ LAO VÀO CỌC CẦU GỖ BÊN ${side === 'LEFT' ? 'TRÁI' : 'PHẢI'}!`,
                        desc: `Cụ [${this.hookedFish.name}] lao thốc vào hàng cọc tre ven bờ! Hãy GIỮ [${requiredKeyName}] NGAY ĐỂ BẺ LÁI CỨU CƯỚC!`,
                        type: 'WARN'
                    }
                }));
            }
        }

        // Xử lý cơ chế giằng co khi đang gặp kịch bản Cá Lao Vào Cọc Tre
        if (this.stakeHazard) {
            this.stakeHazard.timeLeft -= delta;
            const isHoldingCorrectTurn = (this.stakeHazard.requiredKey === 'right' ? keyRight : keyLeft);

            if (isHoldingCorrectTurn) {
                isCounteringCorrectly = true;
                this.stakeHazard.holdTime += delta;
                actionFeedback = `⚠️ ĐANG GHÌ CẦN BẺ LÁI NÉ CỌC TRE! Giữ thêm ${Math.max(0, this.stakeHazard.requiredHold - this.stakeHazard.holdTime).toFixed(1)}s!`;

                if (this.stakeHazard.holdTime >= this.stakeHazard.requiredHold) {
                    // BẺ LÁI THÀNH CÔNG!
                    this.stakeHazard = null;
                    this.fishStamina = Math.max(0.04, this.fishStamina - 0.22);
                    this.lineTension = Math.max(0.35, this.lineTension - 0.18);
                    soundManager.playWaterSplash(1.5);
                    this.bubbleSystem.spawnRipple(this.camera.position.x, this.camera.position.z, 2.0);

                    window.dispatchEvent(new CustomEvent('real_life_scenario', {
                        detail: {
                            title: '✅ BẺ LÁI CỨU CƯỚC THÀNH CÔNG!',
                            desc: 'Bạn đã ghì cần ngược hướng cứu cước ngoạn mục trước mũi cọc tre! Đầu cá đã quay ngoắt ra giữa hồ!',
                            type: 'GOLD'
                        }
                    }));
                }
            } else {
                actionFeedback = `⚠️ CỰC KỲ NGUY HIỂM: CÁ LAO VÀO CỌC CẦU GỖ BÊN ${this.stakeHazard.side === 'LEFT' ? 'TRÁI' : 'PHẢI'}! GIỮ [${this.stakeHazard.requiredKeyName}] NGAY! (${this.stakeHazard.timeLeft.toFixed(1)}s)`;
            }

            // Hết thời gian mà người chơi không bẻ lái kịp -> CÁ CUỐN VÀO CỌC, ĐỨT THẺO!
            if (this.stakeHazard && this.stakeHazard.timeLeft <= 0) {
                soundManager.stopLineSingLoop();
                soundManager.playLineSnap();
                this.bubbleSystem.scareFishNear(this.floatTargetPos.x, this.floatTargetPos.z, 14.0);
                this.state = FISHING_STATES.SEATED;
                this.floatGroup.visible = false;
                if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
                this.fishingLine.visible = false;
                this.fish3DGroup.visible = false;
                this.waterEntrySpray.visible = false;
                if (this.vWakeGroup) this.vWakeGroup.visible = false;
                this.hideAllWaterSpray();
                this.landingNetGroup.visible = false;
                this.rodRestSupport.visible = true;
                this.camera.fov = this.normalFov;
                this.camera.updateProjectionMatrix();
                this.bendVelocity = -6.5;

                const lostFish = this.hookedFish;
                this.hookedFish = null;
                this.stakeHazard = null;
                this.notifyRigLineBroken('STAKE', lostFish);

                const failMsg = `💥 CÁ CUỐN VÀO CỌC! Cụ [${lostFish.name} ${lostFish.weight}kg] đã luồn qua chân cọc tre làm kẹt cước, đứt phựt cả bộ thẻo rồi! Cay thật!`;
                window.dispatchEvent(new CustomEvent('real_life_scenario', {
                    detail: {
                        title: '💥 CÁ CUỐN VÀO CỌC CẦU GỖ!',
                        desc: `Không kịp bẻ lái! Cụ [${lostFish.name} ${lostFish.weight}kg] lao vào cọc tre cuốn kẹt cước, đứt phựt cả bộ thẻo lẫn chì!`,
                        type: 'WARN'
                    }
                }));
                window.dispatchEvent(new CustomEvent('player_fishing_event', { detail: { type: 'BREAK', text: failMsg } }));

                return {
                    finished: true,
                    snapped: true,
                    message: failMsg
                };
            }
        }

        if (
            this.fightPhase === FIGHT_PHASES.RUN_OUT ||
            this.fightPhase === FIGHT_PHASES.RUN_LEFT ||
            this.fightPhase === FIGHT_PHASES.RUN_RIGHT
        ) {
            this.phaseTimer -= delta;
            if (this.phaseTimer <= 0) {
                this.pickNextFishRun();
            }

            const rodTensionMul = 1.0 - (this.equipBonuses ? (this.equipBonuses.tensionReduce || 0) : 0);
            const rodDrainMul = this.equipBonuses ? (this.equipBonuses.staminaDrainMul || 1.0) : 1.0;

            // Tính quá tải thực tế theo tải cá tối đa của Cần (Vô Danh 5kg / Trúc 7kg / Cần nâng cấp) & Trục / Thẻo (1.0=5kg .. 10.0=50kg)
            const fishW = this.hookedFish ? (this.hookedFish.weight || 2.0) : 2.0;
            const rodLimit = this.activeRodMaxFishKg || 7;
            const mainLimit = this.activeMainLineSpec ? this.activeMainLineSpec.maxFishKg : 10;
            const leaderLimit = this.activeLeaderSpec ? this.activeLeaderSpec.maxFishKg : 5;
            const weakestLimit = Math.min(rodLimit, mainLimit, leaderLimit);
            const overloadMul = fishW > weakestLimit ? (1.0 + Math.min(1.6, ((fishW - weakestLimit) / weakestLimit) * 1.15)) : 1.0;

            // Độ bền cần câu (0–100%): Giảm khi quá tải cần hoặc để căng dây > 80% liên tục!
            if (this.rigConfig && (this.lineTension > 0.80 || fishW > rodLimit)) {
                const curDur = typeof this.rigConfig.rodDurability === 'number' ? this.rigConfig.rodDurability : 100;
                const wearRate = (fishW > rodLimit ? 3.2 : 1.4) * (this.lineTension > 0.86 ? 1.8 : 1.0);
                this.rigConfig.rodDurability = Math.max(0, Number((curDur - wearRate * delta).toFixed(2)));
                if (this.rigConfig.rodDurability <= 0) {
                    soundManager.stopLineSingLoop();
                    soundManager.playLineSnap();
                    this.state = FISHING_STATES.SEATED;
                    this.floatGroup.visible = false;
                    if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
                    this.fishingLine.visible = false;
                    this.fish3DGroup.visible = false;
                    this.waterEntrySpray.visible = false;
                    if (this.vWakeGroup) this.vWakeGroup.visible = false;
                    this.hideAllWaterSpray();
                    this.landingNetGroup.visible = false;
                    this.rodRestSupport.visible = true;
                    this.camera.fov = this.normalFov;
                    this.camera.updateProjectionMatrix();
                    const lostFish = this.hookedFish;
                    this.hookedFish = null;
                    window.dispatchEvent(new CustomEvent('rod_section_broken', { detail: { fish: lostFish } }));
                    return {
                        finished: true,
                        snapped: true,
                        message: `💥 GÃY LÓNG CẦN! Cá [${lostFish.name} ${lostFish.weight}kg] quá tải làm gãy lóng cần (Độ bền 0%) — Hãy vào [⚙️ Set Trục/Phao] Thay Lóng Cần (150k)!`
                    };
                }
            }

            const tensionClimbRate = (this.phaseGraceTimer > 0) ? -0.05 : ((0.055 + power * 0.024) * rodTensionMul * overloadMul);

            if (this.fightPhase === FIGHT_PHASES.RUN_OUT) {
                if (keyUp) {
                    isCounteringCorrectly = true;
                    this.fishStamina -= (0.28 + (1 - power) * 0.09) * rodDrainMul * delta;
                    this.fishDistance = Math.max(2.3, this.fishDistance - 0.62 * delta);
                    this.lineTension += (0.54 - this.lineTension) * delta * 3.8;
                    actionFeedback = '✅ Đang GHÌ CẦN cực êm! 5 lóng cần uốn cong chữ C kéo cá vào bờ!';
                } else {
                    this.fishDistance = Math.min(11.5, this.fishDistance + (0.48 + power * 0.25) * delta);
                    this.lineTension += tensionClimbRate * delta;
                    actionFeedback = '✊ GIỮ NÚT [GHÌ CẦN] (hoặc Chuột Trái / Phím W) để ghìm cá!';
                }
                this.fishLateralX += (0 - this.fishLateralX) * delta * 1.2;

            } else if (this.fightPhase === FIGHT_PHASES.RUN_LEFT) {
                this.fishLateralX = Math.max(-3.8, this.fishLateralX - (0.68 + power * 0.30) * delta);

                if (keyUp || keyLeft || keyRight) {
                    isCounteringCorrectly = true;
                    this.fishStamina -= (0.27 + (1 - power) * 0.09) * rodDrainMul * delta;
                    this.fishLateralX += 0.98 * delta;
                    this.fishDistance = Math.max(2.3, this.fishDistance - 0.52 * delta);
                    this.lineTension += (0.53 - this.lineTension) * delta * 3.8;
                    actionFeedback = '✅ Đang GHÌ CẦN cực mượt! Ép đầu cá quay lại vào bờ!';
                } else {
                    this.lineTension += tensionClimbRate * delta;
                    actionFeedback = '✊ CÁ LAO SANG TRÁI — GIỮ NÚT [GHÌ CẦN] ngay!';
                }

            } else if (this.fightPhase === FIGHT_PHASES.RUN_RIGHT) {
                this.fishLateralX = Math.min(3.8, this.fishLateralX + (0.68 + power * 0.30) * delta);

                if (keyUp || keyRight || keyLeft) {
                    isCounteringCorrectly = true;
                    this.fishStamina -= (0.27 + (1 - power) * 0.09) * rodDrainMul * delta;
                    this.fishLateralX -= 0.98 * delta;
                    this.fishDistance = Math.max(2.3, this.fishDistance - 0.52 * delta);
                    this.lineTension += (0.53 - this.lineTension) * delta * 3.8;
                    actionFeedback = '✅ Đang GHÌ CẦN cực mượt! Cá đang mỏi dần!';
                } else {
                    this.lineTension += tensionClimbRate * delta;
                    actionFeedback = '✊ CÁ LAO SANG PHẢI — GIỮ NÚT [GHÌ CẦN] ngay!';
                }
            }

            if (this.fishStamina <= 0.24) {
                this.fightPhase = FIGHT_PHASES.PIN_SURFACE;
                soundManager.playWaterSplash(1.2);
            }
        } else if (this.fightPhase === FIGHT_PHASES.UNDER_PIER) {
            // PHA NGUY HIỂM: CÁ LAO VÀO KHU VỰC CHÂN ĐỨNG / GẦM CẦU -> BẮT BUỘC DỰNG THẲNG CẦN LÊN!
            this.underPierTimer -= delta;
            this.fishLateralX += (0 - this.fishLateralX) * delta * 2.4;

            if (keyUp) {
                isCounteringCorrectly = true;
                this.underPierHold += delta;
                this.fishDistance = Math.min(5.2, this.fishDistance + 1.15 * delta);
                this.lineTension += (0.64 - this.lineTension) * delta * 3.2;
                actionFeedback = `⬆️ ĐANG DỰNG THẲNG CẦN CHẶN ĐẦU CÁ! Giữ thêm ${Math.max(0, 0.95 - this.underPierHold).toFixed(1)}s!`;

                if (this.underPierHold >= 0.95) {
                    this.fishStamina = Math.max(0.05, this.fishStamina - 0.18);
                    this.fishDistance = Math.max(4.2, this.fishDistance + 1.5);
                    this.fightPhase = FIGHT_PHASES.RUN_OUT;
                    this.phaseTimer = 4.5;
                    this.phaseGraceTimer = 1.4;
                    soundManager.playWaterSplash(1.3);
                    window.dispatchEvent(new CustomEvent('real_life_scenario', {
                        detail: {
                            title: '✅ DỰNG CẦN KỊP THỜI — CỨU CÁ KHỎI CHÂN CẦU!',
                            desc: 'Đầu cá đã bị nâng bổng lên khỏi gầm cầu, không cuốn được vào chân đứng!',
                            type: 'GOLD'
                        }
                    }));
                }
            } else {
                this.fishDistance = Math.max(1.0, this.fishDistance - 1.35 * delta);
                this.lineTension += 0.12 * delta;
                actionFeedback = `⚠️ CÁ CHUI CHÂN CẦU! GIỮ NGAY [⬆️ LÊN / W / CHUỘT TRÁI] DỰNG CẦN! (${Math.max(0, this.underPierTimer).toFixed(1)}s)`;
            }

            if (this.underPierTimer <= 0 && this.underPierHold < 0.95) {
                soundManager.stopLineSingLoop();
                soundManager.playLineSnap();
                this.bubbleSystem.scareFishNear(this.floatTargetPos.x, this.floatTargetPos.z, 12.0);
                this.state = FISHING_STATES.SEATED;
                this.floatGroup.visible = false;
                if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
                this.fishingLine.visible = false;
                this.fish3DGroup.visible = false;
                this.waterEntrySpray.visible = false;
                if (this.vWakeGroup) this.vWakeGroup.visible = false;
                this.hideAllWaterSpray();
                this.landingNetGroup.visible = false;
                this.rodRestSupport.visible = true;
                this.camera.fov = this.normalFov;
                this.camera.updateProjectionMatrix();
                this.bendVelocity = -6.0;

                const lostFish = this.hookedFish;
                this.hookedFish = null;
                this.stakeHazard = null;
                this.notifyRigLineBroken('STAKE', lostFish);
                this.activeFightSkill = null;

                const pierMsg = `💥 BONG MẤT RỒI! Cụ [${lostFish.name} ${lostFish.weight}kg] chui thẳng vào khu vực chân đứng cuốn vào chân cầu đứt phựt thẻo! Lần sau nhớ DỰNG CẦN (⬆️/W) ngay nhé!`;
                window.dispatchEvent(new CustomEvent('real_life_scenario', {
                    detail: {
                        title: '💥 CÁ CUỐN VÀO CHÂN CẦU BONG MẤT!',
                        desc: pierMsg,
                        type: 'WARN'
                    }
                }));
                window.dispatchEvent(new CustomEvent('player_fishing_event', { detail: { type: 'BREAK', text: pierMsg } }));
                return { finished: true, snapped: true, message: pierMsg };
            }
        } else if (this.fightPhase === FIGHT_PHASES.PIN_SURFACE) {
            this.fishStamina = Math.max(0.04, this.fishStamina - 0.05 * delta);
            this.fishLateralX += (0 - this.fishLateralX) * delta * 2.5;
            this.fishDistance += (2.35 - this.fishDistance) * delta * 2.2;

            if (keyUp) {
                isCounteringCorrectly = true;
                this.surfaceProgress = Math.min(1.0, this.surfaceProgress + 0.58 * delta);
                this.lineTension += (0.56 - this.lineTension) * delta * 4.0;
                actionFeedback = `🌊 Đang ghì cá trồi lên mặt nước ngửa bụng đớp khí... (${Math.round(this.surfaceProgress * 100)}%)`;

                if (this.surfaceProgress >= 1.0) {
                    this.fightPhase = FIGHT_PHASES.TAP_TO_NET;
                    this.landingNetGroup.visible = true;
                    soundManager.playWaterSplash(1.1);
                }
            } else {
                this.surfaceProgress = Math.max(0, this.surfaceProgress - 0.18 * delta);
                this.lineTension += (0.38 - this.lineTension) * delta * 3.0;
                actionFeedback = '🌊 CÁ ĐÃ MỆT! GIỮ [⬆️ MŨI TÊN LÊN] ĐỂ GHÌ CÁ NỔI NGỬA BỤNG LÊN MẶT NƯỚC!';
            }
        } else if (this.fightPhase === FIGHT_PHASES.TAP_TO_NET) {
            this.fishStamina = 0;
            this.fishLateralX += (-0.12 - this.fishLateralX) * delta * 3.0;
            this.fishDistance += (2.15 - this.fishDistance) * delta * 3.0;
            this.lineTension = 0.48;
            isCounteringCorrectly = true;
            actionFeedback = '🕸️ CÁ ĐÃ NGỬA BỤNG TRƯỚC VỢT! BẤM [⬇️ MŨI TÊN XUỐNG / SPACE] ĐỂ GÕ LỰC HỚT CÁ!';

            if (keyDown) {
                const netRes = this.netFish();
                if (netRes && netRes.success) {
                    window.dispatchEvent(new CustomEvent('fish_landed_net', {
                        detail: { fish: netRes.fish }
                    }));
                    return { finished: true, landed: true, fish: netRes.fish };
                }
            }
        }

        this.lineTension += (Math.sin(performance.now() * 0.014) * 0.05) * delta;
        this.lineTension = Math.max(0.15, Math.min(1.05, this.lineTension));

        this.singSoundCooldown -= delta;
        const isFastRun = (
            this.fightPhase === FIGHT_PHASES.RUN_OUT ||
            this.fightPhase === FIGHT_PHASES.RUN_LEFT ||
            this.fightPhase === FIGHT_PHASES.RUN_RIGHT
        );

        // Tiếng cước rít liên tục động theo pha cá chạy, lực căng và trọng lượng cá!
        let runIntensity = 0.25;
        let soundPhase = this.fightPhase;
        if (this.stakeHazard) {
            runIntensity = 1.45;
            soundPhase = 'HAZARD';
        } else if (this.fightPhase === FIGHT_PHASES.RUN_OUT) {
            runIntensity = isCounteringCorrectly ? 0.95 : 1.35;
        } else if (this.fightPhase === FIGHT_PHASES.RUN_LEFT || this.fightPhase === FIGHT_PHASES.RUN_RIGHT) {
            runIntensity = isCounteringCorrectly ? 0.9 : 1.28;
        } else if (this.fightPhase === FIGHT_PHASES.PIN_SURFACE) {
            runIntensity = 0.38;
        } else if (this.fightPhase === FIGHT_PHASES.TAP_TO_NET) {
            runIntensity = 0.12;
        }
        if (this.isSantoJumping) runIntensity = Math.max(runIntensity, 1.4);

        soundManager.updateLineSingLoop(
            this.lineTension,
            runIntensity,
            this.hookedFish ? this.hookedFish.weight : 3.0,
            soundPhase
        );

        // Thêm tiếng rít xé nước đột ngột khi cá phi cực gắt hoặc căng > 75%
        if (this.singSoundCooldown <= 0 && (this.lineTension > 0.72 || (isFastRun && !isCounteringCorrectly))) {
            soundManager.playLineSing(this.lineTension, isFastRun);
            this.singSoundCooldown = isFastRun ? 0.34 : 0.45;
        }

        this.updateFish3DPosition(delta);

        // Ngưỡng nổ thẻo được nới rộng thêm theo cấp Trục & Thẻo nâng cấp
        const snapResist = this.equipBonuses ? (this.equipBonuses.snapResistance || 0) : 0;
        const snapThreshold = 0.98 + snapResist * 0.05;

        if (this.lineTension >= snapThreshold) {
            // KỊCH BẢN ĐỜI THỰC CÂU ĐÀI VIỆT NAM: "THẢ DÂY BẢO HIỂM CỨU CẦN" (1 Lượt cứu nguy khi cá kéo căng đỏ)
            if (this.safetyLeashAvailable) {
                this.safetyLeashAvailable = false;
                this.lineTension = 0.42;
                this.fishDistance = Math.min(12.2, this.fishDistance + 1.6);
                this.phaseGraceTimer = 2.2;
                this.bendVelocity = -3.8;
                soundManager.playWaterSplash(1.45);
                window.dispatchEvent(new CustomEvent('real_life_scenario', {
                    detail: {
                        title: '🪢 THẢ DÂY BẢO HIỂM CỨU CẦN KỊP THỜI!',
                        desc: `Cụ [${this.hookedFish.name}] kéo thẳng cần suýt nổ trục! Đã bung dây thun bảo hiểm giảm tải và thu cần lại thành công!`,
                        type: 'GOLD'
                    }
                }));
            } else if (Math.random() < snapResist * 0.45) {
                // Thẻo xịn chống đứt: tự giảm lực căng giữ cá lại!
                this.lineTension = 0.68;
                this.phaseGraceTimer = 1.2;
                soundManager.playLineSing(0.95, true);
            } else {
                soundManager.stopLineSingLoop();
                soundManager.playLineSnap();
                this.bubbleSystem.scareFishNear(this.floatTargetPos.x, this.floatTargetPos.z, 12.0);
                this.state = FISHING_STATES.SEATED;
                this.floatGroup.visible = false;
                if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
                this.fishingLine.visible = false;
                this.fish3DGroup.visible = false;
                this.waterEntrySpray.visible = false;
                if (this.vWakeGroup) this.vWakeGroup.visible = false;
                this.hideAllWaterSpray();
                this.landingNetGroup.visible = false;
                this.rodRestSupport.visible = true;
                this.camera.fov = this.normalFov;
                this.camera.updateProjectionMatrix();
                this.bendVelocity = -6.0;

                const lostFish = this.hookedFish;
                this.hookedFish = null;
                this.stakeHazard = null;
                this.notifyRigLineBroken('STAKE', lostFish);

                const breakMsg = `💥 ĐOÀNG! MẸ NÓ, THẺO BÉ QUÁ ĐỨT MẸ THẺO RỒI! Cụ [${lostFish.name} ${lostFish.weight}kg] to quá mà dùng thẻo mảnh chịu sao thấu!`;
                window.dispatchEvent(new CustomEvent('real_life_scenario', {
                    detail: {
                        title: '💥 NỔ CƯỚC: THẺO BÉ QUÁ ĐỨT MẸ THẺO RỒI!',
                        desc: `Tiếng nổ ĐOÀNG vang cả góc hồ! Cụ [${lostFish.name} ${lostFish.weight}kg] phi thẳng kéo nổ bung thẻo, bay mất cả bộ lưỡi chì!`,
                        type: 'WARN'
                    }
                }));
                window.dispatchEvent(new CustomEvent('player_fishing_event', { detail: { type: 'BREAK', text: breakMsg } }));

                return {
                    finished: true,
                    snapped: true,
                    message: breakMsg
                };
            }
        }

        this.actionFeedback = actionFeedback;
        this.isCounteringCorrectly = isCounteringCorrectly;

        return {
            finished: false,
            tension: this.lineTension,
            stamina: Math.max(0, this.fishStamina),
            distance: Math.max(1.5, this.fishDistance),
            fightPhase: this.fightPhase,
            surfaceProgress: this.surfaceProgress,
            isCounteringCorrectly,
            actionFeedback,
            canNet: (this.fightPhase === FIGHT_PHASES.TAP_TO_NET),
            fishName: this.hookedFish.name,
            fishWeight: this.hookedFish.weight,
            stakeHazard: this.stakeHazard
        };
    }

    updateFish3DPosition(delta) {
        if (!this.fish3DGroup) return;

        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3(-forward.z, 0, forward.x);

        const fishWorldPos = new THREE.Vector3()
            .copy(this.camera.position)
            .addScaledVector(forward, this.fishDistance)
            .addScaledVector(right, this.fishLateralX);

        // Xử lý chu kỳ Cá Nhảy Santo Lộn Mình Trên Không (Acrobatic Santo Leap)
        const canSanto = (
            this.fightPhase === FIGHT_PHASES.RUN_OUT ||
            this.fightPhase === FIGHT_PHASES.RUN_LEFT ||
            this.fightPhase === FIGHT_PHASES.RUN_RIGHT
        );

        if (!this.isSantoJumping && canSanto) {
            this.santoCooldown -= delta;
            if (this.santoCooldown <= 0) {
                this.isSantoJumping = true;
                this.santoProgress = 0;
                this.santoFlipDir = Math.random() < 0.5 ? 1 : -1;
                soundManager.playFishSantoSplash(false);
                this.bubbleSystem.spawnRipple(fishWorldPos.x, fishWorldPos.z, 1.8);
                this.spawnWaterSprayBurst(fishWorldPos.x, fishWorldPos.z, 14, 3.6, 2.2);
                this.bendVelocity += 2.2;
            }
        }

        let jumpArcY = 0;
        if (this.isSantoJumping) {
            this.santoProgress += delta / 0.92; // Cú nhảy Santo kéo dài ~0.92s
            if (this.santoProgress >= 1.0) {
                // Cá đập mình rơi xuống mặt nước tung bọt trắng xóa!
                this.isSantoJumping = false;
                this.santoProgress = 0;
                this.santoCooldown = 4.6 + Math.random() * 2.6;
                soundManager.playFishSantoSplash(true);
                this.bubbleSystem.spawnRipple(fishWorldPos.x, fishWorldPos.z, 2.2);
                this.bubbleSystem.spawnCarpBubbles(fishWorldPos.x, fishWorldPos.z, true, true);
                this.spawnWaterSprayBurst(fishWorldPos.x, fishWorldPos.z, 18, 4.2, 2.8);
                this.bendVelocity += 2.8;
            } else {
                // Quỹ đạo vọt cao 1.25m trên mặt nước
                jumpArcY = Math.sin(this.santoProgress * Math.PI) * 1.25;
                if (Math.random() < 0.45) {
                    this.spawnWaterSprayBurst(fishWorldPos.x, fishWorldPos.z, 2, 1.8, 1.2);
                }
            }
        }

        const depthY = this.isSantoJumping
            ? (0.08 + jumpArcY)
            : (-0.08 + this.surfaceProgress * 0.14);
        fishWorldPos.y = depthY;

        // Tính vector vận tốc chạy rẽ nước để xoay vệt sóng chữ V (V-Wake)
        const moveDx = fishWorldPos.x - this.lastFishWorldPos.x;
        const moveDz = fishWorldPos.z - this.lastFishWorldPos.z;
        const moveSpeed = Math.hypot(moveDx, moveDz) / Math.max(0.001, delta);
        this.lastFishWorldPos.copy(fishWorldPos);

        this.fish3DGroup.position.copy(fishWorldPos);
        this.fish3DGroup.visible = true;

        if (this.waterEntrySpray) {
            this.waterEntrySpray.position.set(fishWorldPos.x, 0.022, fishWorldPos.z);
            const s = (this.isSantoJumping ? 1.45 : 0.95) + Math.sin(performance.now() * 0.03) * 0.28;
            this.waterEntrySpray.scale.set(s, s, 1);
            this.waterEntrySpray.visible = true;
        }

        // Cập nhật Vệt Sóng Chữ V Cá Chạy Rẽ Nước (3D V-Wake)
        if (this.vWakeGroup) {
            this.vWakeGroup.visible = !this.isSantoJumping && (this.fightPhase !== FIGHT_PHASES.TAP_TO_NET);
            this.vWakeGroup.position.set(fishWorldPos.x, 0.015, fishWorldPos.z);
            const baseYaw = Math.atan2(forward.x, forward.z);
            let wakeYaw = baseYaw;
            if (this.fightPhase === FIGHT_PHASES.RUN_LEFT) wakeYaw = baseYaw + Math.PI / 2;
            else if (this.fightPhase === FIGHT_PHASES.RUN_RIGHT) wakeYaw = baseYaw - Math.PI / 2;
            else if (moveSpeed > 0.4) wakeYaw = Math.atan2(moveDx, moveDz);

            this.vWakeGroup.rotation.y = wakeYaw;
            const wakePulse = 0.9 + Math.sin(performance.now() * 0.025) * 0.2;
            this.vWakeGroup.scale.set(wakePulse, 1.0, 1.0 + Math.min(0.8, moveSpeed * 0.25));
        }

        // Cập nhật các hạt bọt nước 3D bắn lên mặt hồ
        if (this.waterSprayDrops) {
            this.waterSprayDrops.forEach(d => {
                if (d.life > 0) {
                    d.life -= delta;
                    d.vy -= 9.8 * delta;
                    d.mesh.position.x += d.vx * delta;
                    d.mesh.position.y += d.vy * delta;
                    d.mesh.position.z += d.vz * delta;
                    if (d.life <= 0 || d.mesh.position.y < 0.0) {
                        d.life = 0;
                        d.mesh.visible = false;
                    }
                }
            });
        }

        const baseYaw = Math.atan2(forward.x, forward.z);
        if (this.isSantoJumping) {
            // Animation Cá Santo lộn vòng 360 độ trên không trung + vẫy đuôi mạnh
            this.fish3DGroup.rotation.order = 'YXZ';
            this.fish3DGroup.rotation.y = baseYaw + (this.fightPhase === FIGHT_PHASES.RUN_LEFT ? 0.8 : (this.fightPhase === FIGHT_PHASES.RUN_RIGHT ? -0.8 : 0));
            this.fish3DGroup.rotation.x = this.santoProgress * Math.PI * 2.0 * this.santoFlipDir;
            this.fish3DGroup.rotation.z = Math.sin(this.santoProgress * Math.PI * 2.0) * 0.55;
        } else {
            this.fish3DGroup.rotation.order = 'YXZ';
            this.fish3DGroup.rotation.x = 0;
            if (this.fightPhase === FIGHT_PHASES.RUN_LEFT) {
                this.fish3DGroup.rotation.y = baseYaw + Math.PI / 2;
                this.fish3DGroup.rotation.z = 0.28;
            } else if (this.fightPhase === FIGHT_PHASES.RUN_RIGHT) {
                this.fish3DGroup.rotation.y = baseYaw - Math.PI / 2;
                this.fish3DGroup.rotation.z = -0.28;
            } else if (this.fightPhase === FIGHT_PHASES.PIN_SURFACE || this.fightPhase === FIGHT_PHASES.TAP_TO_NET) {
                this.fish3DGroup.rotation.y = baseYaw + Math.PI;
                this.fish3DGroup.rotation.z = Math.PI * 0.45 * this.surfaceProgress;
            } else {
                this.fish3DGroup.rotation.y = baseYaw;
                this.fish3DGroup.rotation.z = 0;
            }
        }

        if (this.fishTailMesh) {
            const tailSpeed = this.isSantoJumping ? 0.055 : ((this.fightPhase === FIGHT_PHASES.TAP_TO_NET) ? 0.006 : 0.032);
            this.fishTailMesh.rotation.y = Math.sin(performance.now() * tailSpeed) * (this.isSantoJumping ? 0.72 : 0.52);
        }

        this.wakeSplashCooldown -= delta;
        if (this.wakeSplashCooldown <= 0) {
            this.bubbleSystem.spawnRipple(fishWorldPos.x, fishWorldPos.z, canSanto ? 1.15 : 0.85);
            if (canSanto && !this.isSantoJumping) {
                // Bắn tia nước trắng xóa khi cá chạy rẽ nước
                this.spawnWaterSprayBurst(fishWorldPos.x, fishWorldPos.z, 3, 1.5, 1.1);
            }
            if (this.fightPhase !== FIGHT_PHASES.TAP_TO_NET && Math.random() < 0.45) {
                this.bubbleSystem.spawnCarpBubbles(fishWorldPos.x, fishWorldPos.z, true, false);
            }
            this.wakeSplashCooldown = canSanto ? 0.11 : 0.18;
        }
    }

    netFish() {
        if (this.state !== FISHING_STATES.FIGHTING || !this.hookedFish) return null;
        soundManager.stopLineSingLoop();

        this.isNettingAnim = true;
        const resultFish = { ...this.hookedFish };

        this.bendVelocity = -2.8;
        soundManager.playCatchFanfare();
        soundManager.playWaterSplash(1.5);

        this.state = FISHING_STATES.SEATED;
        this.hookedFish = null;
        this.lineTension = 0;
        this.currentBendDown = 0.02;
        this.currentBendSide = 0;
        this.camera.fov = this.normalFov;
        this.camera.updateProjectionMatrix();
        this.stakeHazard = null;
        this.applyArticulatedRodPose(1.0);
        this.floatGroup.visible = false;
        if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
        this.fishingLine.visible = false;
        this.fish3DGroup.visible = false;
        this.waterEntrySpray.visible = false;
        if (this.vWakeGroup) this.vWakeGroup.visible = false;
        this.hideAllWaterSpray();
        this.landingNetGroup.visible = false;
        this.rodRestSupport.visible = true;
        this.isNettingAnim = false;

        return {
            success: true,
            fish: resultFish
        };
    }

    update(delta) {
        // HỆ THỐNG KỊCH BẢN ĐỜI THỰC CÂU ĐÀI DỊCH VỤ VIỆT NAM (Tự động diễn ra định kỳ mỗi 34s - 48s quanh hồ)
        if (typeof this.realLifeScenarioTimer !== 'number') {
            this.realLifeScenarioTimer = 26.0;
            this.scenarioStep = 0;
        }
        if (this.state !== FISHING_STATES.FIGHTING) {
            this.realLifeScenarioTimer -= delta;
            if (this.realLifeScenarioTimer <= 0) {
                this.realLifeScenarioTimer = 34.0 + Math.random() * 16.0;
                this.triggerRandomVietnameseFishingScenario();
            }
        }

        if (!this.fpvRig.visible) return;

        // Đồng bộ màu nước & độ đục thực tế vào Shader cắt mặt nước của Phao Đài
        if (this.environment && this.floatShaderUniforms) {
            this.floatShaderUniforms.uWaterTint.value.copy(this.environment.currentWaterColor).multiplyScalar(0.65);
            const turbidity = this.environment.waterTurbidity || 0.18;
            // Nước mưa đục phù sa làm bầu phao khuất nhanh hơn (2.4cm), nước nắng trong xanh nhìn sâu hơn (3.8cm)
            this.floatShaderUniforms.uSubmergeDepth.value = THREE.MathUtils.lerp(0.038, 0.024, turbidity);
        }

        // 1. Cập nhật đường cong Parabol liền mạch của thân cần câu đài
        this.applyArticulatedRodPose(delta);

        const fPos = this.floatTargetPos;
        const toCam = new THREE.Vector3()
            .subVectors(this.camera.position, fPos)
            .setY(0)
            .normalize();
        const baseFloatYaw = Math.atan2(toCam.x, toCam.z);

        // 2. CẬP NHẬT VẬT LÝ HẠ THỦY 3 GIAI ĐOẠN & TÍN HIỆU BÁO CÁ CỦA PHAO ĐÀI THÂN BẦU
        if (this.state === FISHING_STATES.CASTING) {
            this.castElapsed += delta;
            this.floatGroup.rotation.order = 'YXZ';
            this.floatGroup.rotation.y = baseFloatYaw;

            if (this.castElapsed < 0.28) {
                // GIAI ĐOẠN 0 (0.00s -> 0.28s): Mồi & Phao bay vòng cung từ đọt cần ra điểm câu
                const p = this.castElapsed / 0.28;
                this.floatGroup.position.lerpVectors(this.castStartPos, fPos, p);
                this.floatGroup.position.y = THREE.MathUtils.lerp(this.castStartPos.y, 0.022, p) + Math.sin(p * Math.PI) * 0.85;

                const airTilt = THREE.MathUtils.lerp(0.45, 1.50, p);
                this.floatGroup.rotation.z = airTilt * 0.94;
                this.floatGroup.rotation.x = airTilt * 0.22;

                if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
                this.castPhaseLabel = '🎣 Đang bổ mồi ra ổ...';

            } else if (this.castElapsed < 1.35) {
                // GIAI ĐOẠN 1 (0.28s -> 1.35s): PHAO ĐÁP NƯỚC & NẰM NGANG TRÊN MẶT NƯỚC ("Đầu tiên nằm ngang")
                if (!this.hasSpawnedLandingSplash) {
                    this.hasSpawnedLandingSplash = true;
                    soundManager.playWaterSplash(0.95);
                    this.bubbleSystem.spawnRipple(fPos.x, fPos.z, 1.25);
                }

                const tFlat = (this.castElapsed - 0.28) / 1.07; // 0 -> 1
                const splashWave = Math.sin(tFlat * Math.PI * 4.0) * Math.exp(-tFlat * 2.5) * 0.012;

                // Phao nằm ngang nổi trên mặt nước (Y ≈ +0.022) để lộ rõ toàn bộ chân phao, thân bầu phao và tăm phao
                this.floatGroup.position.set(fPos.x, 0.022 + splashWave, fPos.z);

                // Góc nghiêng ~86 độ (1.50 rad = nằm ngang sát mặt nước), cuối giai đoạn chì bắt đầu kéo nhẹ chân phao
                const leadPullStart = tFlat > 0.70 ? ((tFlat - 0.70) / 0.30) * 0.14 : 0;
                const flatTilt = 1.50 - leadPullStart + Math.sin(tFlat * Math.PI * 3.5) * 0.035 * (1 - tFlat);
                this.floatGroup.rotation.z = flatTilt * 0.94;
                this.floatGroup.rotation.x = flatTilt * 0.22;

                if (this.floatMeniscusRing) {
                    this.floatMeniscusRing.visible = true;
                    this.floatMeniscusRing.position.set(fPos.x, 0.005, fPos.z);
                    this.floatMeniscusRing.rotation.z = -baseFloatYaw;
                    this.floatMeniscusRing.scale.set(2.4, 0.85, 1);
                }
                this.castPhaseLabel = '1/3: Phao nằm ngang mặt nước';

            } else if (this.castElapsed < 2.15) {
                // GIAI ĐOẠN 2 (1.35s -> 2.15s): CHÌ CHÌM KÉO CHÂN PHAO - PHAO TRỞ MÌNH ĐỨNG DẬY (Bầu phao vẫn nổi trên mặt nước)
                const tStand = (this.castElapsed - 1.35) / 0.80; // 0 -> 1
                const easeStand = tStand * tStand * (3 - 2 * tStand);

                const standTilt = THREE.MathUtils.lerp(1.36, 0.0, easeStand);
                // Khi xoay thẳng đứng dậy, bầu phao (local y = -0.215..0.0) vẫn nổi cao trên mặt nước (y = +0.185)
                const standY = THREE.MathUtils.lerp(0.022, 0.185, easeStand);

                this.floatGroup.position.set(fPos.x, standY, fPos.z);
                this.floatGroup.rotation.z = standTilt * 0.94;
                this.floatGroup.rotation.x = standTilt * 0.22;

                if (this.floatMeniscusRing) {
                    this.floatMeniscusRing.visible = true;
                    this.floatMeniscusRing.position.set(fPos.x, 0.005, fPos.z);
                    const sx = THREE.MathUtils.lerp(2.2, 1.15, easeStand);
                    this.floatMeniscusRing.scale.set(sx, 1.0, 1);
                }
                this.castPhaseLabel = '2/3: Phao trở mình đứng dậy';

            } else if (this.castElapsed < 3.75) {
                // GIAI ĐOẠN 3 (2.15s -> 3.75s): MỒI KÉO PHAO CHÌM DẦN TỚI KHI MẤT BẦU PHAO ("Sau đó chìm dần tới khi mất bầu phao")
                const tSink = (this.castElapsed - 2.15) / 1.60; // 0 -> 1
                const easeSink = 1.0 - Math.pow(1.0 - tSink, 2.15);

                // Hạ dần từ +0.185 (nổi trọn bầu phao) xuống equilibriumFloatY = -0.095 (mất hẳn bầu phao dưới mặt nước, chỉ lộ tăm phao)
                const sinkY = THREE.MathUtils.lerp(0.185, this.equilibriumFloatY, easeSink);
                const settleSway = Math.sin(tSink * Math.PI * 2.5) * 0.024 * (1 - tSink);

                this.floatGroup.position.set(fPos.x, sinkY, fPos.z);
                this.floatGroup.rotation.z = settleSway;
                this.floatGroup.rotation.x = 0;

                if (!this.hasSpawnedBellyRipple && sinkY < 0.06) {
                    this.hasSpawnedBellyRipple = true;
                    this.bubbleSystem.spawnRipple(fPos.x, fPos.z, 0.55);
                }

                if (this.floatMeniscusRing) {
                    this.floatMeniscusRing.visible = true;
                    this.floatMeniscusRing.position.set(fPos.x, 0.005, fPos.z);
                    // Vòng nước nở rộng khi ôm qua bụng bầu phao và thu nhỏ lại khi bầu phao đã chìm mất (sinkY <= 0)
                    const bellyAtWaterline = sinkY > 0.0 ? Math.sin(Math.min(1, sinkY / 0.185) * Math.PI) : 0;
                    const ringScale = 0.65 + bellyAtWaterline * 0.75;
                    this.floatMeniscusRing.scale.set(ringScale, ringScale, 1);
                }

                this.castPhaseLabel = (sinkY > -0.01)
                    ? '3/3: Chìm dần mất bầu phao...'
                    : '✅ Đã mất bầu phao - Vào mục câu!';

            } else {
                // HOÀN TẤT HẠ THỦY -> CHUYỂN SANG FLOAT_WAIT (Đợi cá ăn tại mực cân phao đã mất bầu)
                this.state = FISHING_STATES.FLOAT_WAIT;
                this.floatVerticalOffset = 0;

                // Áp dụng quy tắc Tỷ Lệ Hương Liệu theo Độ Đục Nước Câu Đài:
                // Nước đục (Trời mưa): Hương liệu đậm (>= 6 giọt) thu hút cá nhanh vượt trội, hương liệu nhạt (<= 3 giọt) cá chậm vào ổ
                const weather = this.environment ? this.environment.weather : 'SUNNY';
                const flavorDrops = this.activeHookBait && typeof this.activeHookBait.totalFlavorDrops === 'number'
                    ? this.activeHookBait.totalFlavorDrops
                    : 4;
                const waterEffect = BaitMixingSystem.getWaterFlavorEffect(flavorDrops, weather);
                const habitInfo = this.bubbleSystem.getHabitStatusInfo ? this.bubbleSystem.getHabitStatusInfo() : { biteSpeedMultiplier: 1.0 };

                // Phạt thời gian chờ cá ăn nếu cần thủ giật trượt nhiều lần liên tiếp (nửa tiếng - 1 tiếng hồ mới có nhịp lại)
                // 1 giờ hồ = 60 giây thật. Nửa tiếng hồ = 30s thật, 1 tiếng hồ = 60s thật.
                let missPenalty = 0;
                if (this.consecutiveMisses === 1) {
                    missPenalty = 14.0 + Math.random() * 8.0; // ~15-20 phút giờ hồ
                } else if (this.consecutiveMisses === 2) {
                    missPenalty = 32.0 + Math.random() * 15.0; // ~30-45 phút (nửa tiếng) giờ hồ
                } else if (this.consecutiveMisses >= 3) {
                    missPenalty = 60.0 + Math.random() * 25.0; // ~1 tiếng đến 1 tiếng 25 phút giờ hồ
                }

                const bonus = this.activeHookBait ? (this.activeHookBait.attractionRate || 80) / 100 : 0.8;
                const baseWait = 4.2 + (1.15 - bonus) * 3.0 + Math.random() * 2.2 + missPenalty;
                this.waitFishTimer = Math.max(2.2, baseWait / (waterEffect.multiplier * habitInfo.biteSpeedMultiplier));

                // Đăng ký vị trí lưỡi câu / phao với hệ thống Ý Thức Cá AI dưới đáy bùn
                // Nếu đánh Câu Hố Đấu (trục xiên 1.5x / 2x / 2.5x độ sâu): mồi vươn xa hơn phao về phía ngoài lòng hồ!
            const curStyle = (this.rigConfig && this.rigConfig.fishingStyle) ? this.rigConfig.fishingStyle : 'CAN_DAI';
            const hoDauRatio = (this.rigConfig && this.rigConfig.hoDauRatio) ? Number(this.rigConfig.hoDauRatio) : 2.0;
            const hoDauLead = (this.rigConfig && this.rigConfig.hoDauLead) ? this.rigConfig.hoDauLead : 'NO_LEAD';
            let baitX = fPos.x;
            let baitZ = fPos.z;
            if (curStyle === 'HO_DAU' || curStyle === 'BAN_DAU') {
                const effRatio = curStyle === 'HO_DAU' ? hoDauRatio : 1.35;
                const waterDepth = 2.7;
                const extraReach = Math.min(4.8, Math.sqrt(Math.max(0.2, (effRatio * waterDepth) ** 2 - waterDepth ** 2)) * 0.72);
                const dirX = fPos.x - this.camera.position.x;
                const dirZ = fPos.z - this.camera.position.z;
                const dLen = Math.hypot(dirX, dirZ) || 1;
                baitX = fPos.x + (dirX / dLen) * extraReach;
                baitZ = fPos.z + (dirZ / dLen) * extraReach;
            }
            this.lastHookTargetInfo = {
                    x: baitX,
                    z: baitZ,
                    bait: this.activeHookBait,
                    calibrationId: this.rigConfig ? this.rigConfig.calibrationId : 'can7_cau3',
                    fishingStyle: curStyle,
                    hoDauRatio,
                    hoDauLead,
                    mainLineSize: this.rigConfig ? (this.rigConfig.mainLineSize || 2) : 2,
                    leaderSize: this.rigConfig ? (this.rigConfig.leaderSize || 1) : 1,
                    baitIntegrity: this.hookBaitIntegrity,
                    isBareHook: this.isBareHook,
                    waterEffectMultiplier: waterEffect.multiplier,
                    onFalseSignalCalibration: (aiFish) => {
                        // Sai bài cân phao khi câu Ốc ngâm / Ngô ủ -> Phao chỉ nháy nhịp ảo, không ăn thật!
                        this.floatVerticalOffset = -0.022;
                        const curCal = this.activeCalibration ? this.activeCalibration.shortTag : 'Cân hiện tại';
                        this.castPhaseLabel = `⚠️ Nhịp ảo (${curCal}) — Ốc/Ngô cần Cân 1 Câu 2-5 hoặc Cân 3 Câu 3/5!`;
                        window.dispatchEvent(new CustomEvent('fish_escaped', {
                            detail: {
                                message: `⚠️ NHỊP ẢO CÂN PHAO: [${aiFish.baseSpeciesName}] chạm mồi Ốc/Ngô nhưng bạn đang đánh [${curCal}] nên phao chỉ ra nhịp ảo! Hãy đổi sang Cân 1 Câu 2/3/4/5, Cân 3 Câu 3 hoặc Cân 3 Câu 5 trong Cài Đồ (G)!`
                            }
                        }));
                    },
                    onLineBrush: (aiFish) => {
                        // Cá chỉ bơi cắt ngang qua ổ quệt đuôi vào dây trục -> Phao nhún gắt 1 nhịp giả rồi tắt!
                        this.floatVerticalOffset = -0.032;
                        this.castPhaseLabel = `〰️ Cá bơi ngang quệt dây trục (Tín hiệu giả)...`;
                        window.dispatchEvent(new CustomEvent('fish_escaped', {
                            detail: {
                                message: `〰️ Vệt tăm đi thẳng, phao nhún 1 nhịp rồi đứng im: [${aiFish.baseSpeciesName}] chỉ bơi ngang quệt đuôi vào dây trục, KHÔNG PHẢI ăn mồi — Đừng giật kẻo động ổ!`
                            }
                        }));
                    },
                    onGrazeGroundbait: (aiFish) => {
                        // Cá ủi bùn nhặt mồi xả quanh chân phao nhưng bơ viên mồi trên lưỡi
                        this.floatVerticalOffset = -0.009;
                        this.castPhaseLabel = `🐟 Cá đang nhặt mồi xả, chưa ngậm lưỡi...`;
                        window.dispatchEvent(new CustomEvent('fish_escaped', {
                            detail: {
                                message: `🐟 Tăm sủi quanh ổ nhưng phao đứng im: [${aiFish.baseSpeciesName}] đang ăn vụn mồi xả dưới bùn và cảnh giác né viên mồi trên lưỡi!`
                            }
                        }));
                    },
                    onInspectNudge: (aiFish) => {
                        // Cá AI lượn vòng dò xét mùi mồi & dây trục
                        this.floatVerticalOffset = -0.015;
                        this.castPhaseLabel = `🫧 Cá đang lượn vòng dò xét mồi...`;
                        window.dispatchEvent(new CustomEvent('fish_escaped', {
                            detail: {
                                message: `🫧 Chùm tăm sủi sát chân phao: [${aiFish.baseSpeciesName} ${aiFish.weight}kg] đang lượn vòng kiểm tra dây trục và mùi mồi, tuyệt đối đừng giật vội!`
                            }
                        }));
                    },
                    onProbeTestBait: (aiFish) => {
                        // Cá thổi nước / nhấp rỉa thử viên mồi -> Mồi trên lưỡi bị rã bớt 25-30%
                        this.hookBaitIntegrity = Math.max(0, this.hookBaitIntegrity - 0.28);
                        if (this.lastHookTargetInfo) {
                            this.lastHookTargetInfo.baitIntegrity = this.hookBaitIntegrity;
                        }
                        this.floatVerticalOffset = -0.024;
                        const pct = Math.round(this.hookBaitIntegrity * 100);
                        this.castPhaseLabel = `👄 Cá đang thổi thử mồi (Còn ${pct}% mồi)...`;
                        window.dispatchEvent(new CustomEvent('fish_escaped', {
                            detail: {
                                message: `👄 [${aiFish.baseSpeciesName} ${aiFish.weight}kg] vừa thổi nước & nhấp thử rìa mồi để kiểm tra lưỡi câu (Mồi trên lưỡi còn ${pct}%) — Chờ xem cá có tin tưởng nuốt thật không!`
                            }
                        }));
                    },
                    onSpookedByBareHook: (aiFish) => {
                        this.floatVerticalOffset = 0.025;
                        this.castPhaseLabel = `⚠️ Lộ lưỡi câu trần - Cá giật mình chạy!`;
                        window.dispatchEvent(new CustomEvent('fish_escaped', {
                            detail: {
                                message: `⚠️ Mồi đã rã hết làm lộ LƯỠI CÂU SẮT TRẦN! Cụ [${aiFish.baseSpeciesName}] nhìn thấy lưỡi câu nên hoảng sợ quẫy đuôi chạy mất! Hãy THU CẦN VỀ vê mồi mới ngay!`
                            }
                        }));
                    },
                    onRejectBait: (aiFish) => {
                        this.floatVerticalOffset = 0.012;
                        this.castPhaseLabel = `🚫 Cá nghi ngờ chê mồi bỏ đi`;
                        window.dispatchEvent(new CustomEvent('fish_escaped', {
                            detail: {
                                message: `🚫 [${aiFish.baseSpeciesName} ${aiFish.weight}kg] sau khi thổi thử đã phát hiện bất thường (hoặc chê hương liệu / thẻo căng) nên quay đầu bơi đi!`
                            }
                        }));
                    },
                    onBiteTrigger: (aiFish) => {
                        if (this.state === FISHING_STATES.FLOAT_WAIT && !this.isBareHook) {
                            this.startFishBite(aiFish);
                        }
                    }
                };
                this.bubbleSystem.setHookBaitTarget(this.lastHookTargetInfo);

                this.fishApproaching = false;
                this.approachProgress = 0;
            }

        } else if (this.state === FISHING_STATES.FLOAT_WAIT) {
            this.floatBobAngle += delta * 2.6;
            this.floatVerticalOffset += (0.0 - this.floatVerticalOffset) * Math.min(1, delta * 3.5);

            // CẬP NHẬT ĐỘ TAN RÃ CỦA VIÊN MỒI TRÊN LƯỠI THEO THỜI GIAN THỰC
            const dissolveDuration = (this.activeHookBait && this.activeHookBait.dissolveTime) ? this.activeHookBait.dissolveTime : 72;
            if (!this.isBareHook) {
                this.hookBaitIntegrity = Math.max(0, this.hookBaitIntegrity - delta / dissolveDuration);
                if (this.lastHookTargetInfo) {
                    this.lastHookTargetInfo.baitIntegrity = this.hookBaitIntegrity;
                }
                if (this.hookBaitIntegrity <= 0.02) {
                    this.isBareHook = true;
                    this.hookBaitIntegrity = 0;
                    if (this.lastHookTargetInfo) {
                        this.lastHookTargetInfo.isBareHook = true;
                    }
                    this.castPhaseLabel = '⚠️ Mồi đã tan hết (Trơ lưỡi câu) - Hãy thu cần vê lại mồi!';
                    window.dispatchEvent(new CustomEvent('fish_escaped', {
                        detail: {
                            message: '⚠️ Viên mồi trên lưỡi đã tan rã hết (0%)! Tăm phao đã trồi cao trả mục (Trơ lưỡi câu sắt) — Hãy bấm THU CẦN VỀ để vê viên mồi mới!'
                        }
                    }));
                }
            }

            // Khi mồi tan hết (isBareHook), mất trọng lượng viên mồi nên tăm phao trồi cao lên +0.026m (2 mắt phao)
            const bareHookRise = this.isBareHook ? 0.026 : (1.0 - this.hookBaitIntegrity) * 0.012;
            const waveY = Math.sin(this.floatBobAngle) * 0.0045;
            this.floatGroup.position.set(
                fPos.x,
                this.equilibriumFloatY + bareHookRise + this.floatVerticalOffset + waveY,
                fPos.z
            );
            this.floatGroup.rotation.order = 'YXZ';
            this.floatGroup.rotation.y = baseFloatYaw;
            this.floatGroup.rotation.x = 0;
            this.floatGroup.rotation.z = Math.sin(this.floatBobAngle * 0.8) * 0.032;

            if (this.floatMeniscusRing) {
                this.floatMeniscusRing.visible = true;
                this.floatMeniscusRing.position.set(fPos.x, 0.005, fPos.z);
                const pulse = 0.62 + Math.sin(this.floatBobAngle * 1.5) * 0.06;
                this.floatMeniscusRing.scale.set(pulse, pulse, 1);
            }

            this.waitFishTimer -= delta;
            if (this.waitFishTimer <= 0) {
                // Chỉ lan tỏa mùi hương tự nhiên nếu trên lưỡi còn mồi (Không tự động ép sinh cá vào cắn câu nữa!)
                this.waitFishTimer = 12.0 + Math.random() * 10.0;
                if (!this.isBareHook && this.lastHookTargetInfo) {
                    this.bubbleSystem.setHookBaitTarget(this.lastHookTargetInfo);
                }
            }
        } else if (this.state === FISHING_STATES.BITING) {
            this.floatGroup.rotation.order = 'YXZ';
            this.floatGroup.rotation.y = baseFloatYaw;
            this.floatGroup.rotation.x = 0;

            const endReason = this.advanceBiteScript(delta);
            const s = this.biteScript;
            if (endReason) {
                this.updateFloatLedGlow(false);
                this.resolveBiteEnded(endReason);
            } else if (s) {
                this.updateFloatLedGlow(!!s.isTakeWindow);
                const eq = this.equilibriumFloatY;
                const curStage = s.stages[s.stageIndex];
                const stageName = curStage ? curStage.name : '';
                const dur = curStage ? curStage.duration : 1;
                const k = Math.min(1, s.stageTime / Math.max(0.001, dur));
                let y = eq;
                let rotZ = 0;
                s.isTakeWindow = false;

                // 1. Kịch bản: PHAO BỀNH CẢ CỦ (LIFT — Tỷ lệ dính cá 100%!)
                if (s.scenario === 'LIFT') {
                    if (stageName === 'NIBBLE') {
                        const pulse = Math.sin(s.stageTime * 12);
                        y = eq - Math.max(0, pulse) * 0.015;
                        rotZ = pulse * 0.03;
                    } else if (stageName === 'LIFTING') {
                        // Bềnh cao lộ hẳn cả bầu/củ phao lên mặt nước và ngả nghiêng rõ rệt (100% dính cá!)
                        const lift = Math.min(0.24, 0.04 + k * 0.22);
                        y = eq + lift;
                        rotZ = Math.min(0.76, k * 0.72);
                        s.isTakeWindow = (s.stageTime >= 0.28);
                        s.driftX += delta * 0.05;
                    }
                }
                // 2. Kịch bản: CÁ CẮN MẤT HÌNH (SUBMERGE — Phao tụt lút mất hình, tỷ lệ dính cá 50/50!)
                else if (s.scenario === 'SUBMERGE') {
                    if (stageName === 'TREMOR') {
                        y = eq - Math.abs(Math.sin(s.stageTime * 18)) * 0.009;
                        rotZ = Math.sin(s.stageTime * 15) * 0.04;
                    } else if (stageName === 'PLUNGE') {
                        // Thụt lút mất hình phao biến mất hoàn toàn dưới mặt nước
                        const sink = Math.min(0.32, 0.06 + s.stageTime * 0.34);
                        y = eq - sink;
                        rotZ = -0.34;
                        s.driftX += delta * 0.42;
                        s.driftZ += delta * 0.22;
                        s.isTakeWindow = (s.stageTime >= 0.16);
                    }
                }
                // 3. Kịch bản: CÁ GIÃ GẠO PHAO (MORTAR)
                else if (s.scenario === 'MORTAR') {
                    if (stageName === 'PECKING') {
                        // Nhấp nhấp thụt thụt liên hồi dồn dập
                        const cycle = s.stageTime * 15;
                        const dip = Math.abs(Math.sin(cycle));
                        y = eq - dip * 0.025;
                        rotZ = Math.sin(cycle) * 0.07;
                        s.rippleTimer -= delta;
                        if (s.rippleTimer <= 0 && dip > 0.85) {
                            s.rippleTimer = 0.22;
                            this.bubbleSystem.spawnRipple(fPos.x + s.driftX, fPos.z + s.driftZ, 0.4);
                        }
                    } else if (stageName === 'TAKE_OR_SPIT') {
                        if (s.willCommit) {
                            // Sau chuỗi giã gạo, đè tụt hẳn 2-3 nấc!
                            y = eq - Math.min(0.14, 0.04 + s.stageTime * 0.16);
                            rotZ = -0.25;
                            s.driftX += delta * 0.35;
                            s.isTakeWindow = true;
                        } else {
                            // Giã gạo thưa dần rồi phao đứng im (móm)
                            const dip = Math.abs(Math.sin(s.stageTime * 7)) * 0.015 * (1 - k);
                            y = eq - dip;
                        }
                    }
                }
                // 4. Kịch bản: CÁ BẤM XUỐNG 1 NẤC RỒI GIỮ (SNAP_HOLD)
                else if (s.scenario === 'SNAP_HOLD') {
                    if (stageName === 'SNAP') {
                        // Tụt dứt khoát đúng 1 nấc (~2.8cm)
                        y = eq - (0.028 * k);
                    } else if (stageName === 'HOLD') {
                        if (s.willCommit) {
                            // GIỮ NGUYÊN VỊ TRÍ TỤT 1 NẤC ĐÓ, im phăng phắc!
                            y = eq - 0.028;
                            rotZ = 0;
                            s.isTakeWindow = (s.stageTime >= 0.15);
                        } else {
                            // Giữ 1 lúc rồi từ từ nhả mồi nổi lại
                            if (s.stageTime < 1.0) {
                                y = eq - 0.028;
                            } else {
                                const rel = Math.min(1, (s.stageTime - 1.0) / 1.0);
                                y = eq - 0.028 * (1 - rel);
                            }
                        }
                    }
                }
                // 5. Kịch bản: CÁ ĂN 2 NHỊP (TWO_STEP)
                else if (s.scenario === 'TWO_STEP') {
                    if (stageName === 'STEP1') {
                        // Nhịp 1: nhấp nhẹ 1 phát rồi thôi
                        const pulse = Math.sin(k * Math.PI);
                        y = eq - pulse * 0.024;
                        rotZ = pulse * 0.06;
                    } else if (stageName === 'PAUSE') {
                        // Khoảng lặng nín thở: phao đứng im phăng phắc!
                        y = eq;
                        rotZ = 0;
                    } else if (stageName === 'STEP2') {
                        if (s.willCommit) {
                            // Nhịp 2: bất ngờ đè tụt sâu 2-3 nấc!
                            y = eq - Math.min(0.14, 0.03 + s.stageTime * 0.15);
                            rotZ = -0.22;
                            s.driftX += delta * 0.3;
                            s.isTakeWindow = true;
                        } else {
                            // Nhịp 2 không cắn (móm)
                            y = eq + Math.sin(s.stageTime * 8) * 0.007 * (1 - k);
                        }
                    }
                }
                // 6. Kịch bản: CÁ LƯỚT CHẠY PHAO / XÉ NƯỚC (SKATE_RUN)
                else if (s.scenario === 'SKATE_RUN') {
                    if (stageName === 'TILT') {
                        rotZ = -0.25 * k;
                    } else if (stageName === 'SKATE') {
                        if (s.willCommit) {
                            // Phao nghiêng xé nước lướt chạy ngang
                            rotZ = -0.32;
                            s.driftX += delta * 0.48;
                            s.driftZ += delta * 0.24;
                            y = eq - 0.025;
                            s.isTakeWindow = true;
                            s.rippleTimer -= delta;
                            if (s.rippleTimer <= 0) {
                                s.rippleTimer = 0.25;
                                this.bubbleSystem.spawnRipple(fPos.x + s.driftX, fPos.z + s.driftZ, 0.5);
                            }
                        } else {
                            rotZ = -0.2 * (1 - k);
                            s.driftX += delta * 0.12 * (1 - k);
                            y = eq;
                        }
                    }
                }
                // 7. Kịch bản: ĐÈ PHAO DO NẶNG HƯƠNG LIỆU (FLOAT_PRESS) - Phao chìm từ từ dần xuống xong lại từ từ nổi lên!
                else if (s.scenario === 'FLOAT_PRESS') {
                    const flavorDrops = s.flavorDrops || 8;
                    const maxSink = 0.065 + Math.min(0.045, (flavorDrops - 6) * 0.007);
                    if (stageName === 'PECK_MUD') {
                        // Rung nhẹ do đàn cá sục tăm cày ổ
                        const jitter = Math.sin(s.stageTime * 16) * 0.003;
                        y = eq + jitter;
                        rotZ = Math.sin(s.stageTime * 8) * 0.02;
                        s.rippleTimer -= delta;
                        if (s.rippleTimer <= 0) {
                            s.rippleTimer = 0.42;
                            this.bubbleSystem.spawnCarpBubbles(fPos.x + (Math.random() - 0.5) * 0.12, fPos.z + (Math.random() - 0.5) * 0.12, true, false);
                        }
                    } else if (stageName === 'SLOW_SINK') {
                        // PHAO CHÌM TỪ TỪ DẦN XUỐNG: Cá quẹt vây đè dây thẻo
                        const progress = Math.sin(k * Math.PI * 0.5);
                        y = eq - progress * maxSink;
                        rotZ = -0.10 * progress;
                        s.isTakeWindow = false; // Cá không nuốt mồi!

                        // Cá cày nhiều tăm liên tục xung quanh chân phao
                        s.rippleTimer -= delta;
                        if (s.rippleTimer <= 0) {
                            s.rippleTimer = 0.5;
                            this.bubbleSystem.spawnCarpBubbles(fPos.x + (Math.random() - 0.5) * 0.15, fPos.z + (Math.random() - 0.5) * 0.15, true, false);
                        }
                    } else if (stageName === 'SLOW_RISE') {
                        // XONG LẠI TỪ TỪ NỔI LÊN: Cá bơi qua khỏi dây
                        const progress = Math.cos(k * Math.PI * 0.5);
                        y = eq - progress * maxSink;
                        rotZ = -0.10 * progress;
                        s.isTakeWindow = false;
                    }
                }

                this.floatGroup.position.set(fPos.x + s.driftX, y, fPos.z + s.driftZ);
                this.floatGroup.rotation.z = rotZ;
            }

            if (this.floatMeniscusRing) {
                this.floatMeniscusRing.visible = (this.floatGroup.position.y > -0.34);
                this.floatMeniscusRing.position.set(this.floatGroup.position.x, 0.005, this.floatGroup.position.z);
            }
        }

        // Cập nhật Camera Kính Ngắm Phao Cận Cảnh HD (Tự động lấy nét rộng khi phao nằm ngang & zoom sát khi bầu phao chìm dần)
        if (this.floatGroup.visible) {
            let camDist = 1.25;
            let camHeight = 0.26;
            let lookY = 0.09;

            if (this.state === FISHING_STATES.CASTING) {
                if (this.castElapsed < 1.35) {
                    // Khi phao đang nằm ngang trên mặt nước: mở góc nhìn rộng hơn một chút để thấy trọn vẹn thân bầu phao nằm ngang
                    camDist = 1.85;
                    camHeight = 0.34;
                    lookY = 0.03;
                } else if (this.castElapsed < 2.15) {
                    const t = (this.castElapsed - 1.35) / 0.80;
                    camDist = THREE.MathUtils.lerp(1.85, 1.55, t);
                    camHeight = THREE.MathUtils.lerp(0.34, 0.30, t);
                    lookY = THREE.MathUtils.lerp(0.03, 0.08, t);
                } else {
                    const t = Math.min(1.0, (this.castElapsed - 2.15) / 1.60);
                    const visMarks = (this.rigConfig && this.rigConfig.fishingStyle === 'HO_DAU')
                        ? 2.2
                        : (this.activeCalibration ? this.activeCalibration.visibleMarks : 3);
                    const finalDist = visMarks >= 8 ? 2.15 : (visMarks >= 5 ? 1.55 : 1.25);
                    camDist = THREE.MathUtils.lerp(1.65, finalDist, t);
                    camHeight = THREE.MathUtils.lerp(0.28, visMarks >= 8 ? 0.34 : 0.20, t);
                    lookY = THREE.MathUtils.lerp(0.04, 0.0, t); // Khớp chuẩn vạch MẶT NƯỚC tại đúng y = 0.00m!
                }
            } else {
                const visMarks = (this.rigConfig && this.rigConfig.fishingStyle === 'HO_DAU')
                    ? 2.2
                    : (this.activeCalibration ? this.activeCalibration.visibleMarks : 3);
                camDist = visMarks >= 8 ? 2.15 : (visMarks >= 5 ? 1.55 : 1.25);
                camHeight = visMarks >= 8 ? 0.34 : 0.20;
                lookY = 0.0; // Khớp chuẩn đường MẶT NƯỚC ở giữa kính ngắm với đúng mặt nước 3D (y = 0)!
            }

            this.pipCamera.position.set(
                fPos.x + toCam.x * camDist,
                camHeight,
                fPos.z + toCam.z * camDist
            );
            this.pipCamera.lookAt(fPos.x, lookY, fPos.z);
        }

        // 3. Cập nhật dây cước trục mảnh nối từ chóp đọt cần liền khối tới đúng khoen chân cắm phao (hoặc cá)
        if (this.fishingLine && this.fishingLine.visible && this.rodRootGroup) {
            this.rodRootGroup.updateMatrixWorld();
            const worldTip = this.rodTipLocalPos.clone();
            this.rodRootGroup.localToWorld(worldTip);

            let endPoint = new THREE.Vector3();
            let sagAmount = 0.045;

            if (this.state === FISHING_STATES.FIGHTING && this.fish3DGroup) {
                endPoint.copy(this.fish3DGroup.position);
                endPoint.y += 0.04;
                sagAmount = 0.0;
            } else if (this.floatFootAnchor) {
                this.floatGroup.updateMatrixWorld();
                endPoint.set(0, 0, 0);
                this.floatFootAnchor.localToWorld(endPoint);
                // Khi phao đang nằm ngang trên mặt nước (chân phao nổi ở Y >= 0.001): giảm độ võng dây để dây cước ăn khớp tuyệt đối vào khoen chân phao, không bị thừa
                if (endPoint.y >= 0.001) {
                    sagAmount = 0.010;
                }
            } else {
                endPoint.set(
                    this.floatGroup.position.x,
                    this.floatGroup.position.y - 0.02,
                    this.floatGroup.position.z
                );
            }

            const posAttr = this.fishingLine.geometry.attributes.position;
            for (let i = 0; i < this.LINE_POINTS_COUNT; i++) {
                const t = i / (this.LINE_POINTS_COUNT - 1);
                const px = THREE.MathUtils.lerp(worldTip.x, endPoint.x, t);
                const pz = THREE.MathUtils.lerp(worldTip.z, endPoint.z, t);
                const py = THREE.MathUtils.lerp(worldTip.y, endPoint.y, t) - Math.sin(t * Math.PI) * sagAmount;
                posAttr.setXYZ(i, px, py, pz);
            }
            posAttr.needsUpdate = true;
        }
    }

    shouldRenderFloatPiP() {
        return (
            this.floatGroup &&
            this.floatGroup.visible &&
            (this.state === FISHING_STATES.CASTING ||
                this.state === FISHING_STATES.FLOAT_WAIT ||
                this.state === FISHING_STATES.BITING)
        );
    }

    // KÍCH HOẠT CÁC KỊCH BẢN ĐỜI THỰC HAY XẢY RA TẠI HỒ CÂU ĐÀI DỊCH VỤ VIỆT NAM (FB / ZALO HỘI CÂU ĐÀI)
    triggerRandomVietnameseFishingScenario() {
        const scenarioIdx = this.scenarioStep % 4;
        this.scenarioStep++;

        const targetX = this.floatGroup && this.floatGroup.visible ? this.floatTargetPos.x : 0;
        const targetZ = this.floatGroup && this.floatGroup.visible ? this.floatTargetPos.z : 44;

        if (scenarioIdx === 0) {
            // 1. CHỦ HỒ ĐỔ XE BỒI CÁ MỚI & THẢ CÁ ĐEO KHUYÊN THƯỞNG NÓNG +200,000Đ
            this.bubbleSystem.spawnPrizeStockingWave(targetX, targetZ);
            window.dispatchEvent(new CustomEvent('real_life_scenario', {
                detail: {
                    title: '📢 LOA CHỦ HỒ: ĐỔ XE BỒI CÁ MỚI & CÁ ĐEO KHUYÊN VÀNG!',
                    desc: 'Nhà hồ vừa thả thêm Chép Củ mới xuống hồ kèm Cá Đeo Khuyên Vàng (Thưởng nóng +200,000đ)! Đàn cá mới đang rất đói và cắn cực gắt!',
                    chatSender: 'Chủ Hồ Củ Gấu',
                    chatText: '📢 Anh em cần thủ chú ý! Nhà hồ vừa bồi thêm lô Chép Củ mới + 2 Cụ Cá Đeo Khuyên Vàng thưởng nóng 200k nhé!',
                    type: 'GOLD'
                }
            }));
        } else if (scenarioIdx === 1) {
            // 2. RÔ PHI CON NHIỄU Ổ / CÁ TẠP RỈA MỒI LÀM PHAO NHẢY MÚA
            if (this.state === FISHING_STATES.FLOAT_WAIT) {
                this.floatVerticalOffset = -0.025;
                this.bubbleSystem.spawnRipple(targetX, targetZ, 0.65);
            }
            window.dispatchEvent(new CustomEvent('real_life_scenario', {
                detail: {
                    title: '🐟 KỊCH BẢN HỒ CÂU: ĐÀN RÔ CON ĐANG RỈA MỒI NHIỄU Ổ!',
                    desc: 'Mùi cám thơm gọi đàn rô phi con vào rỉa làm phao nhấp nháy giả! Bình tĩnh đừng giật sớm kẻo động ổ, đợi Chép Củ vào đè lút phao hãy đóng!',
                    chatSender: 'Hoàng Đài Thủ 6H',
                    chatText: 'Ổ em bên này rô con cũng đang rỉa phao nhảy như tập thể dục, phải đợi nhịp đè lút của chép cụ mới dám đóng!',
                    type: 'INFO'
                }
            }));
        } else if (scenarioIdx === 2) {
            // 3. HÀNG XÓM ĐỔ 2 CÂN ỐC XAY XẢ Ổ "ĐÈ ĐẦU CƯỠI CỔ" KÉO ĐÀN CÁ
            soundManager.playWaterSplash(1.65);
            this.bubbleSystem.spawnRipple(-15.0, 46.0, 2.2);
            window.dispatchEvent(new CustomEvent('real_life_scenario', {
                detail: {
                    title: '🪣 CẢNH BÁO: HÀNG XÓM BÊN CẠNH VỪA ĐỔ 2 CÂN ỐC XAY CƯỚP Ổ!',
                    desc: 'Cần thủ ngồi bến cạnh vừa ném 1 chậu ốc xay lớn để kéo đàn cá chép sang ổ họ! Hãy bấm [Phím F - Xả Mồi Tụ Ổ] để giữ cá lại ngay!',
                    chatSender: 'Tuấn Củ Gấu (Hà Nội)',
                    chatText: 'Hehe anh em thông cảm nhé, em vừa bồi nhẹ 2 cân ốc xay ủ mộng giữ chân đàn chép củ bên bờ Nam đây!',
                    type: 'WARN'
                }
            }));
        } else {
            // 4. CHỦ HỒ BẬT MAX 4 GUỒNG QUẠT NƯỚC OXY KÍCH CÁ ĐI ĂN ĐÁY
            this.bubbleSystem.fishSchools.forEach(f => {
                f.hunger = 1.0;
                f.speed = f.baseSpeed * 1.35;
            });
            if (this.state === FISHING_STATES.FLOAT_WAIT) {
                this.waitFishTimer = Math.min(this.waitFishTimer, 1.5);
            }
            window.dispatchEvent(new CustomEvent('real_life_scenario', {
                detail: {
                    title: '🌀 NHÀ HỒ BẬT MAX 4 QUẠT NƯỚC OXY - CÁ VÀO LUỒNG ĂN MẠNH!',
                    desc: 'Nước giàu oxy chảy đều khắp hồ chữ nhật, đàn Cá Trắm Đen & Chép Củ AI đã lặn sát đáy đi ăn cực mạnh!',
                    chatSender: 'Lâm Lục Hương',
                    chatText: 'Quạt oxy vừa bật cái là tăm chép ủi bùn đen đặc trước mặt luôn anh em ơi, chuẩn bị ôm cần nhé!',
                    type: 'INFO'
                }
            }));
        }
    }
}
