import * as THREE from 'three';
import { soundManager } from '../audio/SoundManager.js';
import { createRodGripTexture, createCarbonWeaveTexture, createFloatBodyTexture } from '../world/TextureGenerator.js';
import { BaitMixingSystem } from './BaitMixingSystem.js';
import { buildRealisticFish } from '../world/FishModelBuilder.js';
import { createRealisticHumanCharacter } from '../world/HumanCharacterBuilder.js';
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

        // Rig Đạo Cụ Bến Câu & Cần Thủ: Neo tại tọa độ ghế ngồi để khi Camera lùi ra Góc Nhìn Thứ 3 khi bo cá, Thùng/Khay/Ô/Cần vẫn bám chuẩn trên sàn bến!
        this.fpvRig = new THREE.Group();
        this.scene.add(this.fpvRig);
        this.scene.add(this.camera);

        // Trạng thái Camera Góc Nhìn Thứ 3 Động (Third-Person Fighting Camera) & Mỏ neo ghế ngồi chuẩn
        this.tpvBlend = 0.0;
        this.hasSeatAnchor = false;
        this.seatEyePos = new THREE.Vector3(0, 1.25, 0);
        this.seatBaseQuat = new THREE.Quaternion();
        this.seatLevelQuat = new THREE.Quaternion();
        this.seatForward = new THREE.Vector3(0, 0, -1);
        this.seatRight = new THREE.Vector3(1, 0, 0);
        this.tpvCamPos = new THREE.Vector3();
        this.tpvLookTarget = new THREE.Vector3();
        this.smoothedTpvCamPos = new THREE.Vector3();
        this.smoothedTpvLook = new THREE.Vector3();
        this.tpvCamInitialized = false;
        this.lastJumpArcY = 0;
        this.hardRunScreamCooldown = 0;

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
        this.fpvArmGroup = null;
        this.tpvAnglerGroup = null;
        this.rodFrontGripAnchor = null;
        this.rodButtGripAnchor = null;

        // Vị trí và Tỷ lệ Cần Câu khi Ngồi thường (FPV) vs Đứng Bo Cá Góc Nhìn Thứ 3 (TPV Action Cam)
        this.baseRodPos = new THREE.Vector3(0.24, -0.29, -0.38);
        this.fightRodPos = new THREE.Vector3(0.05, 0.10, -0.16);
        this.currentRodPos = new THREE.Vector3(0.24, -0.29, -0.38);
        this.normalFov = 68;
        this.fightFov = 64;
        this.rodCurrentScale = 1.0;

        // Trạng thái Vật Lý Uốn Lóng Cần & Xung Lực Đóng Cá (Spring-Damper + Strike Whip Impulse)
        this.currentPitchDeg = -74;
        this.currentYawDeg = 6;
        this.currentRollDeg = 0;
        this.currentBendDown = 0;     // Độ uốn dọc của thân cần (0 -> 1.4)
        this.currentBendSide = 0;     // Độ uốn ngang của thân cần (-0.6 -> +0.6)
        this.bendVelocity = 0;
        this.sideBendVelocity = 0;
        this.headShakeTime = 0;
        this.strikeWhipTimer = 0;     // Cú vút cổ tay khi giật cần đóng cá / giật hụt
        this.strikeWhipDuration = 0.42;
        this.strikeWhipHit = false;
        this.rodFerruleRings = [];    // 4 đai kim loại chống nổ lóng bám theo đường cong cần
        this.rodTipSwivelGroup = null;// Đầu xoay 360° + dây dù đỏ Lillian gắn chóp đọt cần
        this.rodLillianAnchor = null; // Điểm buộc cước trục ở đầu dây dù đỏ
        this.floatTexCache = {};      // Cache texture sơn mài từng dáng bầu phao

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

        // Trạng thái Bo Cá Vật Lý Thời Gian Thực & Thanh Cân Bằng Lực Bo Trái/Phải
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

        // Hệ thống Cân Bằng Lực Ngang (Lateral Force Balance Gauge: -1.0 Trái .. 0.0 Giữa .. +1.0 Phải)
        this.forceBalance = 0.0;
        this.playerRodLean = 0.0;     // Độ nghiêng đảo cần của người chơi (-1 Trái .. +1 Phải)
        this.fishPullDir = 0.0;       // Lực kéo ngang tức thời của cá
        this.fishPullTarget = 0.0;
        this.fishWeavePhase = 0.0;
        this.headShakeCooldown = 1.6;
        this.headShakeImpulse = 0.0;
        this.lineCutWakeGroup = null; // Sóng chữ V & bọt trắng tại điểm cước cắt mặt nước
        this.fishMudBoil = null;      // Quầng bùn/nước cuộn sục từ đáy khi cá lớn quẫy
        this.lastLineCutPos = new THREE.Vector3();
        this.lineCutSpeed = 0;
        this.lineCutRippleCooldown = 0;

        this.singSoundCooldown = 0;
        this.wakeSplashCooldown = 0;

        // Hệ thống KÍCH MỒI (Nhấc nhử đọt cần): Mỗi ca 5 tiếng có 5-15 lần hiệu quả random, 30% cá ăn sau 5s (Bấm 2-3 vạch giữ 3-5s)
        this.twitchEffectiveLeft = 0;
        this.twitchEffectiveMax = 0;
        this.twitchBiteCountdown = 0;
        this.twitchBubbleHintSpawned = false;
        this.twitchRodAnimTimer = 0;
        this.twitchCooldownTimer = 0;

        // Hệ thống PHAO ĐÊM ĐIỆN TỬ OLED (Tự động bật phát sáng quang học từ 18:00 tối trở đi)
        this.isNightOledActive = false;
        this.floatOledSheathMats = [];
        this.floatOledNightColors = [];
        this.floatOledCollarGlow = null;
        this.floatNightWaterGlow = null;
        this.floatNightPointLight = null;
        this.nightLampBeamMesh = null;
        this.nightLampLensMat = null;
        this.keepnetFishList = [];
        this.groundBaitProjectiles = [];

        // Hệ thống cấp độ 7 trang bị câu đài & Bộ Set Trục/Thẻo/Cân Phao/Cần khởi đầu
        this.equipmentLevels = getDefaultEquipmentLevels();
        this.equipBonuses = computeEquipmentBonuses(this.equipmentLevels);
        this.rigConfig = getDefaultRigState();
        this.activeRodMaxFishKg = 7;
        this.activeMainLineSpec = getLineSpec(this.rigConfig.mainLineSize);
        this.activeLeaderSpec = getLineSpec(this.rigConfig.leaderSize);
        this.activeCalibration = getCalibrationById(this.rigConfig.calibrationId);

        this.resetTwitchShiftQuota(5);

        this.initFPVViewmodel();
        this.initFloatModel();
        this.initFishingLine();
        this.initFish3DAndNet();
        this.applyEquipmentUpgrades(this.equipmentLevels);
    }

    // XÂY DỰNG CẦN CÂU ĐÀI KHỚP RÚT 5 LÓNG (TELESCOPIC JOINTED CARBON POLE) + TAY NGƯỜI THẬT
    initFPVViewmodel() {
        this.fpvRig.visible = false;

        // 1. BỘ KHAY / PAD MỒI TỪ TÍNH ĐA TẦNG CNC + CỐC NƯỚC CHẤM TAY + ĐĨA NAM CHÂM HÚT LƯỠI + 16 VIÊN MỒI 3D ĐA HÌNH THÁI
        this.baitTray = new THREE.Group();
        const cncInoxMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.94, roughness: 0.14 });
        const darkCarbonMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.55, roughness: 0.32 });

        // Tay đòn pat kẹp inox nối từ hông Thùng Câu Đài sang trục xoay bộ Khay Mồi
        const mountArm = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.24, 10), cncInoxMat);
        mountArm.rotation.z = Math.PI / 2.15;
        mountArm.position.set(-0.14, -0.065, 0.03);
        this.baitTray.add(mountArm);

        const centerShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.011, 0.14, 12), cncInoxMat);
        centerShaft.position.set(0, -0.052, 0);
        this.baitTray.add(centerShaft);

        const knobNut = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 8), darkCarbonMat);
        knobNut.position.set(0, -0.095, 0);
        this.baitTray.add(knobNut);

        // Đĩa mồi câu chính (Tầng 1): Thành bo viền vát CNC + Lòng đĩa từ + Tâm nam châm tròn hút lưỡi câu
        this.baitTrayRimMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.92, roughness: 0.14 });
        const rimRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.172, 0.0125, 12, 36),
            this.baitTrayRimMat
        );
        rimRing.rotation.x = Math.PI / 2;
        rimRing.position.y = 0.012;
        this.baitTray.add(rimRing);

        const trayBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.174, 0.162, 0.018, 36),
            this.baitTrayRimMat
        );
        trayBase.position.y = -0.002;
        this.baitTray.add(trayBase);

        this.baitTrayInnerMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.26, metalness: 0.38 });
        const innerDisc = new THREE.Mesh(
            new THREE.CylinderGeometry(0.164, 0.164, 0.012, 36),
            this.baitTrayInnerMat
        );
        innerDisc.position.y = 0.006;
        this.baitTray.add(innerDisc);

        // Đĩa nam châm Inox sáng bóng ở tâm khay để hút đôi lưỡi câu dự phòng
        const magnetCore = new THREE.Mesh(
            new THREE.CylinderGeometry(0.044, 0.044, 0.004, 24),
            cncInoxMat
        );
        magnetCore.position.set(0, 0.013, 0);
        this.baitTray.add(magnetCore);

        const hookGoldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.95, roughness: 0.12 });
        [-1, 1].forEach((s) => {
            const spareHook = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0016, 6, 14, Math.PI * 1.35), hookGoldMat);
            spareHook.rotation.x = Math.PI / 2;
            spareHook.rotation.z = s * 0.6;
            spareHook.position.set(s * 0.014, 0.016, s * 0.006);
            this.baitTray.add(spareHook);
        });

        // CỐC NƯỚC TRONG SUỐT CHẤM TAY VÊ MỒI (Gắn rìa phải khay mồi — chi tiết chuẩn cần thủ câu đài!)
        const waterCupGroup = new THREE.Group();
        const cupHolderRing = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.004, 8, 20), cncInoxMat);
        cupHolderRing.rotation.x = Math.PI / 2;
        cupHolderRing.position.y = 0.012;
        waterCupGroup.add(cupHolderRing);

        const cupGlass = new THREE.Mesh(
            new THREE.CylinderGeometry(0.040, 0.032, 0.052, 20, 1, true),
            new THREE.MeshPhysicalMaterial({
                color: 0xe0f2fe,
                transparent: true,
                opacity: 0.42,
                roughness: 0.08,
                clearcoat: 1.0,
                side: THREE.DoubleSide
            })
        );
        cupGlass.position.y = -0.006;
        waterCupGroup.add(cupGlass);

        const cupWater = new THREE.Mesh(
            new THREE.CylinderGeometry(0.037, 0.031, 0.034, 20),
            new THREE.MeshPhysicalMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.68,
                roughness: 0.05
            })
        );
        cupWater.position.y = -0.011;
        waterCupGroup.add(cupWater);
        waterCupGroup.position.set(0.205, 0.006, -0.035);
        this.baitTray.add(waterCupGroup);

        // Khay mồi xả (Tô mồi xả xoay lệch bên phải — luôn hiển thị trực quan lượng mồi xả ổ còn lại!)
        this.baitTrayLowerBowl = new THREE.Group();
        const lowerBowlShell = new THREE.Mesh(
            new THREE.CylinderGeometry(0.138, 0.116, 0.044, 28),
            darkCarbonMat
        );
        this.baitTrayLowerBowl.add(lowerBowlShell);
        const lowerBowlRim = new THREE.Mesh(
            new THREE.TorusGeometry(0.138, 0.0065, 8, 28),
            cncInoxMat
        );
        lowerBowlRim.rotation.x = Math.PI / 2;
        lowerBowlRim.position.y = 0.021;
        this.baitTrayLowerBowl.add(lowerBowlRim);
        this.baitTrayLowerBowl.position.set(0.135, -0.042, 0.115);
        this.baitTray.add(this.baitTrayLowerBowl);

        // Ụ mồi xả tơi phồng 3D (có hạt ngô / ốc lấm tấm trên mặt, vơi dần chiều cao khi bấm F xả ổ!)
        this.crumbMoundMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.92 });
        const crumbMound = new THREE.Group();
        const moundCore = new THREE.Mesh(
            new THREE.SphereGeometry(0.124, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
            this.crumbMoundMat
        );
        moundCore.scale.set(1.0, 0.34, 1.0);
        crumbMound.add(moundCore);

        this.crumbGrainMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45 });
        this.crumbGrains = [];
        for (let g = 0; g < 10; g++) {
            const ang = (g / 10) * Math.PI * 2 + (g % 2) * 0.25;
            const rad = 0.032 + (g % 3) * 0.028;
            const grain = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 8, 8), this.crumbGrainMat);
            grain.scale.set(1.15, 0.75, 0.95);
            grain.position.set(Math.cos(ang) * rad, 0.028 - rad * 0.12, Math.sin(ang) * rad);
            crumbMound.add(grain);
            this.crumbGrains.push(grain);
        }
        crumbMound.position.set(0, 0.008, 0);
        crumbMound.visible = false;
        this.crumbSurfaceMesh = crumbMound;
        this.baitTrayLowerBowl.add(crumbMound);

        // Khay mồi tầng 3 Inox đựng bột tơ nhện / mồi vuốt (hiện từ Lv.3 trở lên)
        this.baitTrayThirdBowl = new THREE.Group();
        const thirdShell = new THREE.Mesh(
            new THREE.CylinderGeometry(0.105, 0.092, 0.028, 24),
            cncInoxMat
        );
        this.baitTrayThirdBowl.add(thirdShell);
        const glutenPowder = new THREE.Mesh(
            new THREE.CylinderGeometry(0.096, 0.096, 0.008, 24),
            new THREE.MeshStandardMaterial({ color: 0xfefce8, roughness: 0.95 })
        );
        glutenPowder.position.y = 0.012;
        this.baitTrayThirdBowl.add(glutenPowder);
        this.baitTrayThirdBowl.position.set(-0.145, -0.038, 0.115);
        this.baitTrayThirdBowl.visible = false;
        this.baitTray.add(this.baitTrayThirdBowl);

        // Vành chắn nắng & cản gió Carbon mạ vàng VIP (hiện ở Lv.4)
        this.baitTrayCover = new THREE.Group();
        const goldHoodRim = new THREE.Mesh(
            new THREE.TorusGeometry(0.180, 0.008, 10, 32, Math.PI * 1.18),
            new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.92, roughness: 0.14 })
        );
        goldHoodRim.rotation.x = Math.PI / 2;
        goldHoodRim.rotation.z = -0.35;
        goldHoodRim.position.y = 0.048;
        this.baitTrayCover.add(goldHoodRim);

        const windShieldWall = new THREE.Mesh(
            new THREE.CylinderGeometry(0.180, 0.176, 0.042, 28, 1, true, -0.35, Math.PI * 1.18),
            new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.65, roughness: 0.25, side: THREE.DoubleSide })
        );
        windShieldWall.position.y = 0.028;
        this.baitTrayCover.add(windShieldWall);
        this.baitTrayCover.visible = false;
        this.baitTray.add(this.baitTrayCover);

        // 16 VIÊN MỒI CÂU 3D XẾP ĐỒNG TÂM TRÊN ĐĨA TỪ (Tự đổi hình thái Cám Vê / Ốc Xoắn / Hạt Ngô Vàng & vơi dần theo từng nhát câu!)
        this.baitTrayBalls = [];
        this.baitBallPrimaryMat = new THREE.MeshPhysicalMaterial({ color: 0xd97706, roughness: 0.72, clearcoat: 0.15 });
        this.baitBallAccentMat = new THREE.MeshPhysicalMaterial({ color: 0x92400e, roughness: 0.55, clearcoat: 0.35 });

        const ringPositions = [];
        // Vòng trong 6 viên quanh đĩa nam châm
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + 0.2;
            ringPositions.push([Math.cos(a) * 0.076, 0.022, Math.sin(a) * 0.076, a]);
        }
        // Vòng ngoài 10 viên sát thành khay
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            ringPositions.push([Math.cos(a) * 0.126, 0.022, Math.sin(a) * 0.126, a]);
        }

        const unitSphereGeo = new THREE.SphereGeometry(0.0175, 12, 10);
        const snailSpireGeo = new THREE.ConeGeometry(0.0125, 0.022, 9);
        for (let i = 0; i < ringPositions.length; i++) {
            const [bx, by, bz, bang] = ringPositions[i];
            const itemGrp = new THREE.Group();
            const mainPiece = new THREE.Mesh(unitSphereGeo, this.baitBallPrimaryMat);
            itemGrp.add(mainPiece);

            // Chóp xoắn vỏ ốc (chỉ bật khi chọn Câu Ốc!)
            const snailTip = new THREE.Mesh(snailSpireGeo, this.baitBallAccentMat);
            snailTip.position.set(0.006, 0.010, 0.004);
            snailTip.rotation.z = -0.55;
            snailTip.visible = false;
            itemGrp.add(snailTip);

            itemGrp.position.set(bx, by, bz);
            itemGrp.rotation.y = bang * 1.7;
            itemGrp.visible = false;
            itemGrp.userData = { mainPiece, snailTip, baseY: by, idx: i };
            this.baitTrayBalls.push(itemGrp);
            this.baitTray.add(itemGrp);
        }

        // Khăn lau tay cần thủ mềm mại vắt qua thanh treo Inox bên trái khay (thay khối hộp thô cứng cũ!)
        const towelBar = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.12, 8), cncInoxMat);
        towelBar.rotation.x = Math.PI / 2;
        towelBar.position.set(-0.188, 0.004, -0.03);
        this.baitTray.add(towelBar);

        this.baitTowelMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.88, side: THREE.DoubleSide });
        const towelTop = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.105, 10, 1, false, 0, Math.PI), this.baitTowelMat);
        towelTop.rotation.x = Math.PI / 2;
        towelTop.position.set(-0.188, 0.006, -0.03);
        this.baitTray.add(towelTop);

        const towelDrape1 = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.11, 0.102), this.baitTowelMat);
        towelDrape1.position.set(-0.194, -0.048, -0.03);
        towelDrape1.rotation.z = 0.08;
        this.baitTray.add(towelDrape1);

        const towelDrape2 = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.095, 0.098), this.baitTowelMat);
        towelDrape2.position.set(-0.182, -0.042, -0.028);
        towelDrape2.rotation.z = -0.06;
        this.baitTray.add(towelDrape2);

        this.baitTray.position.set(-0.35, -0.32, -0.66);
        this.baitTray.rotation.x = Math.PI / 4.8;
        this.baitTray.rotation.z = Math.PI / 14;
        this.fpvRig.add(this.baitTray);

        // 2. CÂY GÁC CẦN ĐÀI CARBON + NGÀM CON LĂN SILICON ĐÔI SỪNG HƯƠU + RỌNG CÁ ĐA ĐAI NỔI
        this.rodRestSupport = new THREE.Group();

        // Ngàm đỡ hợp kim nhôm CNC + 2 con lăn silicon mềm chống xước lóng cần
        this.rodRestHeadMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.22, metalness: 0.65 });
        const vHead = new THREE.Mesh(
            new THREE.TorusGeometry(0.040, 0.0068, 12, 24, Math.PI),
            this.rodRestHeadMat
        );
        vHead.rotation.z = Math.PI;
        vHead.position.set(0.15, -0.05, -1.18);
        this.rodRestSupport.add(vHead);

        const rollerMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.35, metalness: 0.15 });
        for (const side of [-1, 1]) {
            const roller = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0085, 0.0065, 0.036, 14),
                rollerMat
            );
            roller.position.set(0.15 + side * 0.021, -0.068, -1.18);
            roller.rotation.z = side * 0.52;
            this.rodRestSupport.add(roller);
        }

        // Hai nhánh sừng hươu mở rộng có núm hợp kim vàng chống gió thổi bay cần
        this.rodRestTipMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.92, roughness: 0.14 });
        for (const side of [-1, 1]) {
            const hornTip = new THREE.Mesh(
                new THREE.SphereGeometry(0.0115, 12, 12),
                this.rodRestTipMat
            );
            hornTip.position.set(0.15 + side * 0.040, -0.046, -1.18);
            this.rodRestSupport.add(hornTip);
        }

        // Khớp gật gù đồng thau & trục đứng đỡ ngàm chữ V
        const brassJointMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.92, roughness: 0.18 });
        const stemSupport = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0065, 0.0085, 0.16, 12),
            cncInoxMat
        );
        stemSupport.position.set(0.15, -0.15, -1.18);
        this.rodRestSupport.add(stemSupport);

        const lockNut = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.022, 12), brassJointMat);
        lockNut.position.set(0.15, -0.095, -1.18);
        this.rodRestSupport.add(lockNut);

        // Thân cây gác cần rút lóng carbon có khóa đồng vươn từ thùng câu đài ra phía trước
        this.rodRestBoomMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.82, roughness: 0.16 });
        const mainRestBoom = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0085, 0.0135, 1.05, 14),
            this.rodRestBoomMat
        );
        mainRestBoom.rotation.x = THREE.MathUtils.degToRad(-76);
        mainRestBoom.position.set(0.15, -0.34, -0.72);
        this.rodRestSupport.add(mainRestBoom);

        const boomCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.0142, 0.0142, 0.028, 14), brassJointMat);
        boomCollar.rotation.x = THREE.MathUtils.degToRad(-76);
        boomCollar.position.set(0.15, -0.29, -0.92);
        this.rodRestSupport.add(boomCollar);

        // 2B. THÙNG CÂU ĐÀI 3D CHUYÊN NGHIỆP (Có Đệm Mút EVA Êm Ái, Tựa Lưng, Khóa Gài Inox & 4 Chân Địa Hình Có Bát Chống Lún)
        this.fishingBoxGroup = new THREE.Group();
        this.fishingBoxBodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.32, metalness: 0.38 });
        this.fishingBoxAccentMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.20 });

        const boxBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.23, 0.25), this.fishingBoxBodyMat);
        this.fishingBoxGroup.add(boxBody);

        const boxLid = new THREE.Mesh(new THREE.BoxGeometry(0.355, 0.032, 0.265), this.fishingBoxAccentMat);
        boxLid.position.set(0, 0.125, 0);
        this.fishingBoxGroup.add(boxLid);

        // Đệm mút ngồi EVA chia 3 múi chống mỏi lưng trên nắp thùng
        const evaMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.78 });
        for (let c = -1; c <= 1; c++) {
            const cushionRib = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.018, 0.22), evaMat);
            cushionRib.position.set(c * 0.102, 0.148, 0);
            this.fishingBoxGroup.add(cushionRib);
        }

        // Tựa lưng gập phía sau thùng + Khóa lẫy Inox mặt trước + Pat kẹp phụ kiện bên hông
        const backRest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.022), this.fishingBoxAccentMat);
        backRest.position.set(0, 0.195, 0.122);
        backRest.rotation.x = 0.18;
        this.fishingBoxGroup.add(backRest);

        for (const lx of [-0.09, 0.09]) {
            const latch = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.055, 0.012), cncInoxMat);
            latch.position.set(lx, 0.085, -0.128);
            this.fishingBoxGroup.add(latch);
        }

        // 4 chân địa hình Inox rút cao thấp có bát xoay chống lún (hiện từ Lv.2 trở lên)
        this.fishingBoxLegs = new THREE.Group();
        for (const lx of [-0.155, 0.155]) {
            for (const lz of [-0.11, 0.11]) {
                const leg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.0125, 0.0125, 0.30, 10),
                    cncInoxMat
                );
                leg.position.set(lx, -0.045, lz);
                this.fishingBoxLegs.add(leg);

                const mudFoot = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.026, 0.030, 0.012, 12),
                    this.fishingBoxAccentMat
                );
                mudFoot.position.set(lx, -0.195, lz);
                this.fishingBoxLegs.add(mudFoot);
            }
        }
        this.fishingBoxGroup.add(this.fishingBoxLegs);
        this.fishingBoxGroup.position.set(-0.52, -0.50, -0.58);
        this.fishingBoxGroup.rotation.y = 0.28;
        this.fpvRig.add(this.fishingBoxGroup);

        // 2C. Ô CHE NẮNG CÂU ĐÀI 3D VÒM PARABOL 12 MÚI + 12 NAN SỢI THỦY TINH + DIỀM RỦ + KHỚP LÒ XO NGHIÊNG CỔ Ô (PHÍM O)
        this.umbrellaPose = 'OPEN'; // 'OPEN' | 'TILT' | 'FOLD'
        this.umbrellaGroup = new THREE.Group();

        this.umbrellaCanopyMat = new THREE.MeshStandardMaterial({
            color: 0x0369a1,
            roughness: 0.48,
            metalness: 0.14,
            side: THREE.FrontSide
        });
        // Lớp tráng bạc / Vinyl đen chống tia UV mát dịu bên dưới vòm ô khi ngước mắt nhìn lên!
        this.umbrellaUnderCoatMat = new THREE.MeshStandardMaterial({
            color: 0xcbd5e1,
            roughness: 0.32,
            metalness: 0.68,
            side: THREE.BackSide
        });
        this.umbrellaTrimMat = new THREE.MeshStandardMaterial({
            color: 0xbae6fd,
            metalness: 0.65,
            roughness: 0.24,
            side: THREE.DoubleSide
        });

        // Trục dưới cắm vào pat sau Thùng Câu Đài + Khớp lò xo Inox bẻ góc cổ ô
        const lowerPole = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.78, 12), cncInoxMat);
        lowerPole.position.set(-0.56, -0.22, -0.46);
        this.umbrellaGroup.add(lowerPole);

        const springJoint = new THREE.Mesh(
            new THREE.CylinderGeometry(0.020, 0.020, 0.068, 12),
            new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.88, roughness: 0.2 })
        );
        springJoint.position.set(-0.56, 0.18, -0.46);
        this.umbrellaGroup.add(springJoint);

        // Cụm Đỉnh Tán Ô có thể nghiêng quanh khớp lò xo (umbrellaHeadPivot)
        this.umbrellaHeadPivot = new THREE.Group();
        this.umbrellaHeadPivot.position.set(-0.56, 0.18, -0.46);

        // Thanh giằng cổ ô vươn che đúng trên đầu người chơi (offset +0.52, +0.58, +0.16)
        const upperPole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.72, 12), cncInoxMat);
        upperPole.position.set(0.26, 0.28, 0.08);
        upperPole.rotation.z = -0.66;
        upperPole.rotation.x = 0.22;
        this.umbrellaHeadPivot.add(upperPole);

        this.umbrellaCanopyHolder = new THREE.Group();
        this.umbrellaCanopyHolder.position.set(0.52, 0.56, 0.16);

        // Biên dạng vòm cong Parabol 12 múi chuẩn ô câu đài ngoài đời thực
        const domeLathePts = [];
        const maxR = 1.26;
        const domeH = 0.34;
        for (let s = 0; s <= 12; s++) {
            const u = s / 12; // 0 (đỉnh ô) -> 1 (mép rìa ô)
            const r = u * maxR;
            const y = domeH * (1.0 - Math.pow(u, 1.72));
            domeLathePts.push(new THREE.Vector2(r, y));
        }
        const domeGeo = new THREE.LatheGeometry(domeLathePts, 12);

        const canopyOuter = new THREE.Mesh(domeGeo, this.umbrellaCanopyMat);
        this.umbrellaCanopyHolder.add(canopyOuter);

        const canopyInner = new THREE.Mesh(domeGeo, this.umbrellaUnderCoatMat);
        canopyInner.scale.set(0.996, 0.994, 0.996);
        this.umbrellaCanopyHolder.add(canopyInner);

        // Diềm ô rủ xung quanh mép tán (Valance Skirt) che nắng chói tầm mắt + Viền kim tuyến
        this.umbrellaValance = new THREE.Mesh(
            new THREE.CylinderGeometry(maxR, maxR * 1.015, 0.072, 12, 1, true),
            this.umbrellaCanopyMat
        );
        this.umbrellaValance.position.y = -0.034;
        this.umbrellaCanopyHolder.add(this.umbrellaValance);

        const trimRibbon = new THREE.Mesh(
            new THREE.CylinderGeometry(maxR * 1.016, maxR * 1.018, 0.015, 12, 1, true),
            this.umbrellaTrimMat
        );
        trimRibbon.position.y = -0.064;
        this.umbrellaCanopyHolder.add(trimRibbon);

        // Hệ khung 12 Nan Xương Sợi Thủy Tinh + Con Trượt Khóa Lẫy + 12 Nan Chống Chéo nhìn rõ từ dưới ghế câu!
        const fibreglassRibMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.65, roughness: 0.28 });
        const runnerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.045, 12), darkCarbonMat);
        runnerHub.position.y = 0.04;
        this.umbrellaCanopyHolder.add(runnerHub);

        const centerMastStub = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 10), cncInoxMat);
        centerMastStub.position.y = 0.18;
        this.umbrellaCanopyHolder.add(centerMastStub);

        for (let k = 0; k < 12; k++) {
            const ang = (k / 12) * Math.PI * 2;
            const ribGroup = new THREE.Group();
            ribGroup.rotation.y = ang;

            // Nan chính chạy sát vòm ô ra tận đầu múi + đầu bọc kim loại
            const mainRib = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0032, 1.29, 6), fibreglassRibMat);
            mainRib.position.set(0.63, 0.165, 0);
            mainRib.rotation.z = -(Math.PI / 2 - 0.265);
            ribGroup.add(mainRib);

            // Nan chống chéo từ con trượt (runnerHub) lên giữa nan chính
            const stretcher = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.62, 6), cncInoxMat);
            stretcher.position.set(0.30, 0.125, 0);
            stretcher.rotation.z = -(Math.PI / 2 - 0.29);
            ribGroup.add(stretcher);

            const ribCap = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 8, 8), this.umbrellaTrimMat);
            ribCap.position.set(maxR * 1.01, -0.068, 0);
            ribGroup.add(ribCap);

            this.umbrellaCanopyHolder.add(ribGroup);
        }

        // Tầng thông gió chống lật số 2 (hiện từ Lv.3 trở lên) + Chóp thu lôi CNC trên đỉnh
        const ventLathePts = [];
        for (let s = 0; s <= 8; s++) {
            const u = s / 8;
            ventLathePts.push(new THREE.Vector2(u * 0.62, 0.18 * (1.0 - Math.pow(u, 1.65))));
        }
        this.umbrellaSecondLayer = new THREE.Mesh(
            new THREE.LatheGeometry(ventLathePts, 12),
            this.umbrellaTrimMat
        );
        this.umbrellaSecondLayer.position.y = 0.25;
        this.umbrellaSecondLayer.visible = false;
        this.umbrellaCanopyHolder.add(this.umbrellaSecondLayer);

        const lightningFinial = new THREE.Mesh(
            new THREE.ConeGeometry(0.024, 0.085, 12),
            this.umbrellaTrimMat
        );
        lightningFinial.position.y = 0.44;
        this.umbrellaCanopyHolder.add(lightningFinial);

        this.umbrellaHeadPivot.add(this.umbrellaCanopyHolder);
        this.umbrellaGroup.add(this.umbrellaHeadPivot);
        this.umbrellaGroup.visible = true; // Có sẵn Ô che nắng 1.8m từ Lv.1 (bấm O để Nghiêng/Gập tùy ý!)
        this.fpvRig.add(this.umbrellaGroup);

        // 2D. RỌNG CÁ NGÂM NƯỚC ĐA ĐAI NỔI (Vành hợp kim Anod xanh + Khớp cắm bờ + 3 Vòng đai giữ form dưới nước)
        this.keepnetGroup = new THREE.Group();
        const anodBlueMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.88, roughness: 0.18 });

        const keepnetBracket = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.34, 8), cncInoxMat);
        keepnetBracket.rotation.x = THREE.MathUtils.degToRad(-55);
        keepnetBracket.position.set(-0.48, -0.42, -1.08);
        this.keepnetGroup.add(keepnetBracket);

        const keepnetRim = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.0115, 10, 32), anodBlueMat);
        keepnetRim.rotation.x = Math.PI / 2.35;
        keepnetRim.position.set(-0.48, -0.45, -1.32);
        this.keepnetGroup.add(keepnetRim);

        for (let rIdx = 1; rIdx <= 2; rIdx++) {
            const subHoop = new THREE.Mesh(
                new THREE.TorusGeometry(0.215 - rIdx * 0.012, 0.0075, 8, 28),
                anodBlueMat
            );
            subHoop.rotation.x = Math.PI / 2.35;
            subHoop.position.set(-0.48, -0.45 - rIdx * 0.15, -1.32 - rIdx * 0.065);
            this.keepnetGroup.add(subHoop);
        }

        const keepnetMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.185, 0.52, 22, 5, true),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.52 })
        );
        keepnetMesh.rotation.x = 0.32;
        keepnetMesh.position.set(-0.48, -0.68, -1.43);
        this.keepnetGroup.add(keepnetMesh);

        // Ngăn chứa Cá Sống 3D bơi lấp ló & quẫy nhẹ bên trong Rọng Cá khi đã câu được cá!
        this.keepnetFishContainer = new THREE.Group();
        this.keepnetFishContainer.position.set(-0.48, -0.58, -1.36);
        this.keepnetGroup.add(this.keepnetFishContainer);

        this.rodRestSupport.add(this.keepnetGroup);

        // 2E. ĐÈN SOI PHAO CÂU ĐÀI BAN ĐÊM KẸP THÙNG (Ánh xanh lam dịu chiếu dọc thân cần ra mặt nước từ 18:00 tối!)
        this.nightLampGroup = new THREE.Group();
        const lampBody = new THREE.Mesh(
            new THREE.CylinderGeometry(0.022, 0.026, 0.095, 14),
            darkCarbonMat
        );
        lampBody.rotation.x = Math.PI / 2.15;
        this.nightLampGroup.add(lampBody);

        const lampRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.023, 0.0035, 8, 18),
            anodBlueMat
        );
        lampRing.position.set(0, 0.004, -0.046);
        this.nightLampGroup.add(lampRing);

        this.nightLampLensMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
        const lampLens = new THREE.Mesh(new THREE.CircleGeometry(0.021, 16), this.nightLampLensMat);
        lampLens.rotation.y = Math.PI;
        lampLens.position.set(0, 0.004, -0.048);
        this.nightLampGroup.add(lampLens);

        // Luồng tia sáng xanh tím mảnh rọi từ đèn kẹp thùng hướng ra điểm phao câu ban đêm
        const beamGeo = new THREE.CylinderGeometry(0.018, 0.24, 5.2, 16, 1, true);
        beamGeo.translate(0, -2.6, 0);
        beamGeo.rotateX(Math.PI / 2);
        this.nightLampBeamMesh = new THREE.Mesh(
            beamGeo,
            new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.065,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            })
        );
        this.nightLampBeamMesh.position.set(0, 0.004, -0.05);
        this.nightLampBeamMesh.rotation.x = -0.065;
        this.nightLampBeamMesh.rotation.y = 0.04;
        this.nightLampBeamMesh.visible = false;
        this.nightLampGroup.add(this.nightLampBeamMesh);

        this.nightLampGroup.position.set(-0.14, -0.34, -0.78);
        this.rodRestSupport.add(this.nightLampGroup);

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

        const rodMat = new THREE.MeshPhysicalMaterial({
            map: carbonTex,
            vertexColors: true,
            metalness: 0.45,
            roughness: 0.22,
            clearcoat: 1.0,
            clearcoatRoughness: 0.08
        });

        this.rodMesh = new THREE.Mesh(this.rodGeo, rodMat);
        this.rodMesh.frustumCulled = false;
        this.rodRootGroup.add(this.rodMesh);

        // 4 Đai kim loại chống nổ lóng CNC (Anti-burst Metal Ferrule Rings) trượt & uốn khớp 1:1 theo 4 cổ lóng cần
        this.rodFerruleRings = [];
        const ferruleJointTs = [0.22, 0.42, 0.62, 0.82];
        const ferruleMat = new THREE.MeshStandardMaterial({
            color: 0xfef08a,
            metalness: 0.96,
            roughness: 0.12
        });
        for (const jt of ferruleJointTs) {
            const ringIdx = Math.round(jt * rings);
            const rAtJoint = this.rodRingRadii[ringIdx] || 0.008;
            const fRing = new THREE.Mesh(
                new THREE.CylinderGeometry(rAtJoint * 1.09, rAtJoint * 1.13, 0.018, 16),
                ferruleMat
            );
            this.rodRootGroup.add(fRing);
            this.rodFerruleRings.push({ mesh: fRing, ringIdx });
        }

        // Đầu xoay chống xoắn 360° mạ bạc + Dây dù đỏ đầu cần (Red Lillian Cord) gắn nơi chóp đọt cần
        this.rodTipSwivelGroup = new THREE.Group();
        const tipCapMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0020, 0.0024, 0.018, 10),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.12 })
        );
        tipCapMesh.position.y = 0.007;
        this.rodTipSwivelGroup.add(tipCapMesh);

        const lillianCord = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0012, 0.0010, 0.036, 8),
            new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.75 })
        );
        lillianCord.position.set(0, 0.030, -0.003);
        lillianCord.rotation.x = -0.18;
        this.rodTipSwivelGroup.add(lillianCord);

        const lillianKnot = new THREE.Mesh(
            new THREE.SphereGeometry(0.0022, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.65 })
        );
        lillianKnot.position.set(0, 0.047, -0.006);
        this.rodTipSwivelGroup.add(lillianKnot);

        this.rodLillianAnchor = new THREE.Object3D();
        this.rodLillianAnchor.position.set(0, 0.047, -0.006);
        this.rodTipSwivelGroup.add(this.rodLillianAnchor);
        this.rodRootGroup.add(this.rodTipSwivelGroup);

        // Tay cầm cuốn chỉ dù / màng co nhiệt gân nổi + Đai đồng phân cách + Đối trọng inox + Khuyên D dây bảo hiểm
        const gripGeo = new THREE.CylinderGeometry(0.0196, 0.0212, 0.54, 20);
        this.rodGripMat = new THREE.MeshStandardMaterial({ map: gripTex, roughness: 0.72, metalness: 0.16 });
        const gripMesh = new THREE.Mesh(gripGeo, this.rodGripMat);
        gripMesh.position.set(0, 0.28, 0);
        this.rodRootGroup.add(gripMesh);

        const foreGripTrim = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0192, 0.0202, 0.018, 18),
            goldFerruleMat
        );
        foreGripTrim.position.set(0, 0.555, 0);
        this.rodRootGroup.add(foreGripTrim);

        const buttStainlessMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.96, roughness: 0.12 });
        const buttCap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0218, 0.0205, 0.034, 20),
            buttStainlessMat
        );
        buttCap.position.set(0, 0.012, 0);
        this.rodRootGroup.add(buttCap);

        const buttGoldTrim = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0220, 0.0220, 0.008, 20),
            goldFerruleMat
        );
        buttGoldTrim.position.set(0, 0.028, 0);
        this.rodRootGroup.add(buttGoldTrim);

        // Khuyên chữ D móc dây thun bảo hiểm ở đít cần
        const safetyDRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.0095, 0.0018, 8, 16, Math.PI * 1.3),
            goldFerruleMat
        );
        safetyDRing.position.set(0, -0.006, 0);
        safetyDRing.rotation.z = Math.PI * 0.85;
        this.rodRootGroup.add(safetyDRing);

        this.rodSiliconRingMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.35, metalness: 0.1 });
        const siliconRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.0218, 0.0046, 12, 24),
            this.rodSiliconRingMat
        );
        siliconRing.position.set(0, 0.50, 0);
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

        this.fpvArmGroup = armGroup;
        this.rodRootGroup.add(armGroup);

        // 2 Điểm neo bàn tay chuẩn xác dọc cán cần để Nhân Vật Cần Thủ 3D (TPV) nắm khớp 2 tay vào đúng cán EVA & đối trọng gốc cần!
        this.rodFrontGripAnchor = new THREE.Object3D();
        this.rodFrontGripAnchor.position.set(0, 0.30, 0);
        this.rodRootGroup.add(this.rodFrontGripAnchor);

        this.rodButtGripAnchor = new THREE.Object3D();
        this.rodButtGripAnchor.position.set(0, 0.055, 0);
        this.rodRootGroup.add(this.rodButtGripAnchor);

        this.fpvRig.add(this.rodRootGroup);

        // NHÂN VẬT CẦN THỦ 3D TOÀN THÂN (HIỆN LÊN KHI CAMERA CHUYỂN RA GÓC NHÌN THỨ 3 BO CÁ)
        this.tpvAnglerGroup = createRealisticHumanCharacter({
            pose: 'STANDING',
            shirtColor: 0x0284c7,
            sleeveColor: 0xf1f5f9,
            vestColor: 0x0f172a,
            pantsColor: 0x1e293b,
            hatColor: 0x0f172a,
            hatType: 'CAP',
            wearGlasses: true,
            hasVest: true
        });
        this.tpvAnglerGroup.visible = false;
        this.tpvAnglerGroup.scale.setScalar(0.98);
        this.tpvAnglerGroup.position.set(0.02, -0.86, -0.02);
        this.tpvAnglerGroup.rotation.y = Math.PI;
        this.fpvRig.add(this.tpvAnglerGroup);

        this.applyArticulatedRodPose(1.0);
    }

    // Đồng bộ tọa độ mắt & hướng nhìn chuẩn của ghế ngồi từ Camera (trước khi dịch Camera ra góc nhìn thứ 3)
    syncSeatAnchorFromCamera() {
        this.seatEyePos.copy(this.camera.position);
        this.seatBaseQuat.copy(this.camera.quaternion);
        this.camera.getWorldDirection(this.seatForward);
        this.seatForward.y = 0;
        if (this.seatForward.lengthSq() < 0.0001) {
            this.seatForward.set(0, 0, -1);
        } else {
            this.seatForward.normalize();
        }
        this.seatRight.set(-this.seatForward.z, 0, this.seatForward.x);
        const flatYaw = Math.atan2(-this.seatForward.x, -this.seatForward.z);
        this.seatLevelQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), flatYaw);
        this.hasSeatAnchor = true;
    }

    // Giải động học ngược 2 khớp xương tay (2-Bone Analytical IK) giúp 2 bàn tay cần thủ luôn ôm khít cán cần câu 3D!
    solveTwoBoneArmIK(arm, upperBody, targetWorldPos, poleLocalDir) {
        if (!arm || !upperBody || !targetWorldPos) return;
        const L1 = 0.26;
        const L2 = 0.255;
        const pShoulder = arm.shoulderPivot.position;
        const pTarget = upperBody.worldToLocal(targetWorldPos.clone());
        const toTarget = pTarget.sub(pShoulder);
        const rawDist = toTarget.length();
        if (rawDist < 0.04) return;

        const d = THREE.MathUtils.clamp(rawDist, 0.12, L1 + L2 - 0.004);
        const dir = toTarget.normalize();

        const cosShoulder = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
        const sinShoulder = Math.sqrt(Math.max(0, 1 - cosShoulder * cosShoulder));
        const cosElbow = THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
        const elbowBend = Math.PI - Math.acos(cosElbow);

        // Vector hướng khuỷu tay (hạ tự nhiên xuống dưới & mở nhẹ sang hai bên sườn)
        const perp = poleLocalDir.clone().addScaledVector(dir, -poleLocalDir.dot(dir));
        if (perp.lengthSq() < 0.0001) {
            perp.set(0, -1, 0).addScaledVector(dir, -dir.y);
        }
        perp.normalize();

        const upperArmDir = dir.clone().multiplyScalar(cosShoulder).addScaledVector(perp, sinShoulder).normalize();
        const elbowLocalPos = upperArmDir.clone().multiplyScalar(L1);
        const forearmDir = dir.clone().multiplyScalar(d).sub(elbowLocalPos).normalize();

        const xAxis = forearmDir.clone().cross(upperArmDir);
        if (xAxis.lengthSq() < 0.00001) {
            xAxis.copy(perp).cross(upperArmDir);
        }
        xAxis.normalize();
        const yAxis = upperArmDir.clone().negate();
        const zAxis = xAxis.clone().cross(yAxis).normalize();

        const rotMat = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
        arm.shoulderPivot.quaternion.setFromRotationMatrix(rotMat);
        arm.elbowPivot.rotation.set(-elbowBend, 0, 0);
    }

    // CẬP NHẬT ĐƯỜNG CONG PARABOL & VẬT LÝ GIẬT CẦN / NGHIÊNG TRÁI PHẢI BO CÁ (CONTINUOUS SMOOTH CURVED ROD PHYSICS)
    applyArticulatedRodPose(delta) {
        let targetPitch = -74; // Góc hạ cần trên gác chữ V
        let targetYaw = 6;     // Chếch nhẹ tự nhiên từ tay phải hướng ra điểm câu
        let targetRoll = 0;
        let targetBendDown = 0.02; // Độ võng tự nhiên cực nhẹ của cần 5.4m
        let targetBendSide = 0.0;
        let sidePosShiftX = 0.0;
        let sidePosShiftY = 0.0;

        // Xung lực vút cổ tay khi bấm GIẬT CẦN (Hoạt động cho cả đóng trúng cá lẫn giật hụt!)
        if (this.strikeWhipTimer > 0) {
            this.strikeWhipTimer = Math.max(0, this.strikeWhipTimer - delta);
        }
        if (this.twitchRodAnimTimer > 0) {
            this.twitchRodAnimTimer = Math.max(0, this.twitchRodAnimTimer - delta);
        }
        if (this.twitchCooldownTimer > 0) {
            this.twitchCooldownTimer = Math.max(0, this.twitchCooldownTimer - delta);
        }
        if (this.headShakeImpulse > 0) {
            this.headShakeImpulse = Math.max(0, this.headShakeImpulse - delta * 2.6);
        }

        if (this.state === FISHING_STATES.CASTING) {
            if (this.castElapsed < 0.35) {
                // Vung cần bổ mồi ra ổ câu
                targetPitch = -42;
                targetYaw = 8;
                targetBendDown = 0.32;
            } else {
                // Đã hạ cần xuống gác chữ V
                targetPitch = -74;
                targetYaw = 6;
                targetBendDown = 0.025;
            }
        } else if (this.strikeWhipTimer > 0 && !this.strikeWhipHit) {
            // GIẬT HỤT / THU MỒI: Cổ tay hất vút ngọn cần lên cao rồi hạ êm xuống gác chữ V
            const p = 1.0 - (this.strikeWhipTimer / this.strikeWhipDuration); // 0 -> 1
            const snapArc = Math.sin(p * Math.PI);
            targetPitch = -74 + snapArc * 38;
            targetYaw = 6;
            targetBendDown = p < 0.32 ? -0.22 * Math.sin((p / 0.32) * Math.PI) : 0.14 * (1 - p);
        } else if (this.twitchRodAnimTimer > 0 && this.state === FISHING_STATES.FLOAT_WAIT) {
            // ĐỘNG TÁC KÍCH MỒI: Nhấc nhử nhẹ đọt cần lên ~8 độ rồi hạ êm ái xuống gác chữ V
            const pTw = 1.0 - (this.twitchRodAnimTimer / 0.68);
            const liftArc = Math.sin(pTw * Math.PI);
            targetPitch = -74 + liftArc * 8.5;
            targetYaw = 6;
            targetBendDown = 0.02 + liftArc * 0.06;
        } else if (this.state === FISHING_STATES.BITING && this.biteType === BITE_TYPES.ROD_PULL) {
            targetPitch = -79;
            targetBendDown = 0.42;
        } else if (this.state === FISHING_STATES.FIGHTING && this.hookedFish) {
            // Khi bo cá: Thân cần nghiêng đảo Trái/Phải thực sự theo tay người chơi (playerRodLean)
            // trong khi đọt cần bị cá kéo cong về phía cá (fishPullDir) + rung bần bật khi cá lắc đầu!
            const tension = this.lineTension;
            this.headShakeTime += delta * (12 + tension * 11 + this.headShakeImpulse * 14);
            const joltMul = 1.0 + this.headShakeImpulse * 2.1;
            const shake = (
                Math.sin(this.headShakeTime) +
                Math.cos(this.headShakeTime * 2.3) * 0.48 +
                Math.sin(this.headShakeTime * 4.1) * 0.22
            ) * 0.036 * tension * joltMul;

            const lean = this.playerRodLean || 0; // -1 (Bo Trái) .. +1 (Bo Phải)
            const vert = this.playerRodVert || 0; // -1 (Hạ cần nhả lực) .. +1 (Ghì dựng cần)
            const pull = this.fishPullDir || 0;   // -1 (Cá lôi Trái) .. +1 (Cá lôi Phải)
            const weightFactor = THREE.MathUtils.clamp((this.hookedFish.weight || 3) / 10.0, 0.45, 1.35);

            // Cú sốc 0.16s đầu tiên ngay khi đóng lưỡi ngập hàm cá: vút dựng cổ tay rồi khựng cong chữ C!
            const inStrikeSnap = (this.strikeWhipTimer > 0 && this.strikeWhipHit);
            const snapProgress = inStrikeSnap ? (1.0 - this.strikeWhipTimer / this.strikeWhipDuration) : 1.0;

            if (inStrikeSnap && snapProgress < 0.32) {
                targetPitch = -32;
                targetYaw = 6;
                targetBendDown = 0.45 + snapProgress * 2.4;
                targetBendSide = pull * 0.25;
            } else if (this.stakeHazard) {
                const bSide = (this.stakeHazard.side === 'LEFT' ? -0.62 : 0.62);
                targetPitch = -48 + vert * 12;
                targetYaw = 6 - lean * 18;
                targetRoll = -lean * 24 + (this.stakeHazard.side === 'LEFT' ? -6 : 6);
                targetBendDown = 1.24 + tension * 0.22 + vert * 0.14 + shake * 1.5;
                targetBendSide = bSide - lean * 0.16;
                sidePosShiftX = lean * 0.085;
                sidePosShiftY = vert * 0.04;
            } else if (this.fightPhase === FIGHT_PHASES.UNDER_PIER) {
                targetPitch = -54 + Math.max(-0.5, vert) * 20;
                targetYaw = 6 - lean * 10;
                targetRoll = -lean * 12;
                targetBendDown = (this.isCounteringCorrectly ? 1.28 : 0.92) + vert * 0.16 + shake * 1.3;
                targetBendSide = pull * 0.25;
                sidePosShiftY = vert * 0.045;
            } else if (this.fightPhase === FIGHT_PHASES.PIN_SURFACE) {
                targetPitch = -52 + vert * 14;
                targetYaw = 6 - lean * 12;
                targetRoll = -lean * 14;
                targetBendDown = (this.isCounteringCorrectly ? 1.02 : 0.68) + vert * 0.15 + shake * 0.65;
                targetBendSide = pull * 0.22 - lean * 0.12;
                sidePosShiftX = lean * 0.05;
                sidePosShiftY = vert * 0.04;
            } else if (this.fightPhase === FIGHT_PHASES.TAP_TO_NET) {
                targetPitch = -48 + vert * 10;
                targetYaw = 8 - lean * 8;
                targetRoll = -lean * 8;
                targetBendDown = 0.74;
                targetBendSide = -0.06;
            } else {
                // PHA DÒNG CÁ 4 HƯỚNG (LÊN GHÌ • XUỐNG NHẢ • TRÁI/PHẢI MỞ BÁT):
                // Kéo Lên (+1) dựng cần cong chữ C • Kéo Xuống (-1) hạ đọt nhả căng • Kéo Trái/Phải đảo cần mở bát!
                targetPitch = -55 + vert * 18 + Math.abs(lean) * 3;
                targetYaw = 6 - lean * 19;      // Nghiêng cần Trái (-1) -> Yaw +25°, Nghiêng Phải (+1) -> Yaw -13°
                targetRoll = -lean * 25;        // Xoay cổ tay lật nghiêng mặt phẳng cong của cần
                targetBendDown = Math.max(0.32, (0.76 + tension * 0.48 * weightFactor + vert * 0.22) + shake * 1.25);
                targetBendSide = THREE.MathUtils.clamp(pull * 0.56 - lean * 0.15 + shake * 0.35, -0.72, 0.72);
                sidePosShiftX = lean * 0.095;
                sidePosShiftY = vert * 0.05 - Math.abs(lean) * 0.03;
            }
        }

        // Chuyển đổi mượt mà Vị Trí Gốc Cần, Tỷ Lệ Scale và Camera FOV giữa Ngồi thường vs Bo Cá Góc Nhìn Thứ 3
        const isFightingMode = (this.state === FISHING_STATES.FIGHTING && this.hookedFish);
        const targetScale = isFightingMode ? 0.94 : 1.0;
        const baseTargetPos = isFightingMode ? this.fightRodPos : this.baseRodPos;
        const targetFov = isFightingMode ? this.fightFov : this.normalFov;

        const transRate = Math.min(1.0, delta * 5.6);
        this.rodCurrentScale += (targetScale - this.rodCurrentScale) * transRate;
        this.currentRodPos.lerp(baseTargetPos, transRate);
        this.rodRootGroup.position.set(
            this.currentRodPos.x + sidePosShiftX,
            this.currentRodPos.y + sidePosShiftY,
            this.currentRodPos.z
        );
        this.rodRootGroup.scale.set(this.rodCurrentScale, this.rodCurrentScale, this.rodCurrentScale);

        // Hiệu ứng 3D Chiêu Thức Bo Cá: 🐉 NGỰ LONG (Xoáy cần vòng tròn) & 🌊 HẠ NGƯ (Dìm cần xuống nước)
        if (isFightingMode && this.activeFightSkill && this.activeFightSkill.timer > 0) {
            this.activeFightSkill.elapsed += delta;
            this.activeFightSkill.timer -= delta;
            const t = this.activeFightSkill.elapsed;
            if (this.activeFightSkill.type === 'NGU_LONG') {
                this.rodRootGroup.position.x += Math.cos(t * 14.0) * 0.13;
                this.rodRootGroup.position.y += Math.sin(t * 14.0) * 0.11;
                this.rodRootGroup.rotation.z += Math.sin(t * 14.0) * 0.22;
            } else if (this.activeFightSkill.type === 'HA_NGU') {
                const dipFactor = Math.sin(Math.min(1, t / 1.55) * Math.PI);
                this.rodRootGroup.position.y -= 0.28 * dipFactor;
                this.rodRootGroup.rotation.x -= 0.45 * dipFactor;
            } else if (this.activeFightSkill.type === 'SAFETY_LEASH') {
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

        // Nội suy đàn hồi mượt mà góc cổ tay
        const lerpRate = Math.min(1.0, delta * 9.5);
        this.currentPitchDeg += (targetPitch - this.currentPitchDeg) * lerpRate;
        this.currentYawDeg += (targetYaw - this.currentYawDeg) * lerpRate;
        this.currentRollDeg += (targetRoll - this.currentRollDeg) * lerpRate;

        // Lò xo giảm chấn bậc 2 cho cả độ uốn dọc và độ uốn ngang của 5 lóng cần
        const forceDown = (targetBendDown - this.currentBendDown) * 96.0;
        this.bendVelocity += forceDown * delta;
        this.bendVelocity *= Math.max(0, 1.0 - 11.2 * delta);
        this.currentBendDown += this.bendVelocity * delta;

        const forceSide = (targetBendSide - this.currentBendSide) * 82.0;
        this.sideBendVelocity += forceSide * delta;
        this.sideBendVelocity *= Math.max(0, 1.0 - 10.5 * delta);
        this.currentBendSide += this.sideBendVelocity * delta;

        // Đặt góc cho gốc cần
        this.rodRootGroup.rotation.order = 'YXZ';
        this.rodRootGroup.rotation.x = THREE.MathUtils.degToRad(this.currentPitchDeg);
        this.rodRootGroup.rotation.y = THREE.MathUtils.degToRad(this.currentYawDeg);
        this.rodRootGroup.rotation.z = THREE.MathUtils.degToRad(this.currentRollDeg);

        // Cập nhật tọa độ đỉnh 64 vòng của lưới ống cần liền khối + 4 đai chống nổ lóng + đầu xoay dây dù đỏ
        if (this.rodGeo) {
            const rings = this.ROD_RINGS;
            const radial = this.ROD_RADIAL;
            const dL = this.ROD_LENGTH / rings;
            const posAttr = this.rodGeo.attributes.position;
            const normAttr = this.rodGeo.attributes.normal;
            const upAxis = new THREE.Vector3(0, 1, 0);
            const tmpTan = new THREE.Vector3();

            let cx = 0;
            let cy = 0;
            let cz = 0;
            let pitchAngle = 0;
            let sideAngle = 0;

            for (let r = 0; r <= rings; r++) {
                const t = r / rings;
                if (r > 0) {
                    const flexWeight = Math.pow(t, 1.65) * 0.042;
                    pitchAngle += this.currentBendDown * flexWeight;
                    sideAngle += this.currentBendSide * flexWeight;

                    const txStep = Math.sin(sideAngle) * Math.cos(pitchAngle);
                    const tyStep = Math.cos(sideAngle) * Math.cos(pitchAngle);
                    const tzStep = -Math.sin(pitchAngle);

                    cx += txStep * dL;
                    cy += tyStep * dL;
                    cz += tzStep * dL;
                }

                const tx = Math.sin(sideAngle) * Math.cos(pitchAngle);
                const ty = Math.cos(sideAngle) * Math.cos(pitchAngle);
                const tz = -Math.sin(pitchAngle);

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

                // Khớp chính xác 4 đai kim loại chống nổ lóng bám dọc đường cong thực tế
                if (this.rodFerruleRings && this.rodFerruleRings.length > 0) {
                    for (let f = 0; f < this.rodFerruleRings.length; f++) {
                        if (this.rodFerruleRings[f].ringIdx === r) {
                            const fm = this.rodFerruleRings[f].mesh;
                            fm.position.set(cx, cy, cz);
                            tmpTan.set(tx, ty, tz).normalize();
                            fm.quaternion.setFromUnitVectors(upAxis, tmpTan);
                        }
                    }
                }

                if (r === rings) {
                    this.rodTipLocalPos.set(cx, cy, cz);
                    if (this.rodTipSwivelGroup) {
                        this.rodTipSwivelGroup.position.set(cx, cy, cz);
                        tmpTan.set(tx, ty, tz).normalize();
                        this.rodTipSwivelGroup.quaternion.setFromUnitVectors(upAxis, tmpTan);
                    }
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

    // Tạo đường cong biên dạng mượt mà 40 điểm cho từng dáng Bầu Phao Câu Đài thực tế (không bị gãy khúc đa giác!)
    buildSmoothFloatLathePoints(shape = 'DIAMOND') {
        const steps = 40;
        const pts = [];
        let bottomY = -0.225;
        const topY = -0.004;

        if (shape === 'SLIM_REED') bottomY = -0.265;
        else if (shape === 'PEACOCK_LONG') bottomY = -0.255;
        else if (shape === 'SHORT_HEAVY') bottomY = -0.175;
        else if (shape === 'TEARDROP') bottomY = -0.235;

        const len = topY - bottomY;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps; // 0 (đáy bầu nối chân carbon) -> 1 (cổ vai nối tăm phao)
            const y = bottomY + t * len;
            let r = 0.0028;

            if (shape === 'DIAMOND') {
                // Bầu Quả Trám thuôn thanh lịch: phình cân đối ở 52% chiều cao (đường kính ~2.5cm)
                const env = Math.sin(Math.pow(t, 0.92) * Math.PI);
                r = 0.0022 + Math.pow(env, 1.18) * 0.0128;
            } else if (shape === 'TEARDROP') {
                // Bầu Giọt Nước Sa Phạm: vai bầu đầy ở 68% trên, vuốt thuôn dài xuống chân (đường kính ~2.8cm)
                const env = Math.sin(Math.pow(t, 1.48) * Math.PI);
                r = 0.0022 + Math.pow(env, 0.95) * 0.0142;
            } else if (shape === 'SLIM_REED') {
                // Bầu Cỏ Sậy tự nhiên: thân siêu mảnh thuôn dài chuyên bắt cá bể nhát (đường kính ~1.8cm)
                const env = Math.sin(Math.pow(t, 0.95) * Math.PI);
                r = 0.0020 + Math.pow(env, 0.82) * 0.0086;
            } else if (shape === 'PEACOCK_LONG') {
                // Bầu Lông Công Khổng Tước: thân bầu trụ thon dài sang trọng (đường kính ~2.2cm)
                const env = Math.sin(Math.pow(t, 0.88) * Math.PI);
                r = 0.0022 + Math.pow(env, 0.72) * 0.0112;
            } else {
                // SHORT_HEAVY: Bầu Hố Đấu trọng tâm thấp chống sóng gió (đường kính ~3.1cm)
                const env = Math.sin(Math.pow(t, 0.85) * Math.PI);
                r = 0.0025 + Math.pow(env, 0.92) * 0.0156;
            }
            pts.push(new THREE.Vector2(r, y));
        }
        return { pts, bottomY };
    }

    getFloatShapeTexture(shape = 'DIAMOND') {
        if (!this.floatTexCache) this.floatTexCache = {};
        if (!this.floatTexCache[shape]) {
            this.floatTexCache[shape] = createFloatBodyTexture(shape);
        }
        return this.floatTexCache[shape];
    }

    // XÂY DỰNG PHAO ĐÀI CHÂN THỰC CAO CẤP (SƠN MÀI BÓNG PIANO CLEARCOAT + CỔ KEO CHỈ DÙ + CHÂN CARBON + CHÂN CẮM SILICON 3 NGẤN & KHÓA ĐỒNG + TĂM QUANG HỌC)
    initFloatModel() {
        this.floatGroup = new THREE.Group();
        this.floatGroup.visible = false;

        // Quy ước tọa độ local Y chuẩn xác từng milimet:
        // y = 0.000 : Đỉnh cổ bầu phao (Ranh giới nơi bầu phao chìm khuất hoàn toàn dưới mặt nước -> "mất bầu phao")
        // y = bottomY .. -0.004 : Thân Bầu Phao sơn mài bóng 8 lớp mượt mà
        // y = -0.455 .. bottomY : Chân Phao Carbon đặc thuôn côn + Chân cắm phao silicon 3 ngấn & khóa đồng xoay
        // y = 0.000 .. +0.352 : Tăm Phao Quang Học dạ quang sắc nét có chóp bo tròn chống lóa

        const floatBodyTex = this.getFloatShapeTexture('DIAMOND');
        const { pts: bodyPoints } = this.buildSmoothFloatLathePoints('DIAMOND');

        const bodyGeo = new THREE.LatheGeometry(bodyPoints, 36);
        this.floatBodyMat = this.applyFloatWaterlineShader(new THREE.MeshPhysicalMaterial({
            map: floatBodyTex,
            color: 0xffffff,
            metalness: 0.08,
            roughness: 0.14,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05
        }));
        this.floatBodyMesh = new THREE.Mesh(bodyGeo, this.floatBodyMat);
        this.floatGroup.add(this.floatBodyMesh);

        const goldRingMat = this.applyFloatWaterlineShader(new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            metalness: 0.94,
            roughness: 0.14
        }));

        // 2. CỔ KEO CHỈ DÙ GIA CƯỜNG CHÂN TĂM (Chống thấm nước vào bầu phao tại y = -0.005 -> +0.004)
        const collarThreadMat = this.applyFloatWaterlineShader(new THREE.MeshPhysicalMaterial({
            color: 0xb91c1c,
            roughness: 0.18,
            clearcoat: 1.0
        }));
        const collar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0026, 0.0042, 0.011, 20),
            collarThreadMat
        );
        collar.position.y = -0.001;
        this.floatGroup.add(collar);

        const collarGoldRing = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0043, 0.0045, 0.003, 20),
            goldRingMat
        );
        collarGoldRing.position.y = -0.006;
        this.floatGroup.add(collarGoldRing);

        // 3. CHÂN PHAO CARBON ĐẶC VUỐT CÔN MẢNH + CHÂN CẮM PHAO SILICON 3 NGẤN & KHÓA LINK ĐỒNG XOAY
        const legMat = this.applyFloatWaterlineShader(new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            metalness: 0.45,
            roughness: 0.22
        }));
        this.floatCarbonLeg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0022, 0.0013, 0.25, 14),
            legMat
        );
        this.floatCarbonLeg.position.y = -0.32;
        this.floatGroup.add(this.floatCarbonLeg);

        // Chân cắm phao silicon trong mờ màu ngọc bích/đỏ đô có 3 ngấn giữ chặt chân phao
        const siliconePlugMat = this.applyFloatWaterlineShader(new THREE.MeshPhysicalMaterial({
            color: 0xdc2626,
            roughness: 0.28,
            transmission: 0.25,
            transparent: true,
            opacity: 0.92
        }));
        const siliconeSleeve = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0026, 0.0030, 0.028, 14),
            siliconePlugMat
        );
        siliconeSleeve.position.y = -0.438;
        this.floatGroup.add(siliconeSleeve);

        for (const ribY of [-0.428, -0.438, -0.448]) {
            const rib = new THREE.Mesh(new THREE.TorusGeometry(0.0031, 0.0007, 8, 16), siliconePlugMat);
            rib.rotation.x = Math.PI / 2;
            rib.position.y = ribY;
            this.floatGroup.add(rib);
        }

        // Trục đồng xoay & khoen chạy dây trục ở đáy chân cắm phao
        const barrelSwivel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0018, 0.0018, 0.007, 12),
            goldRingMat
        );
        barrelSwivel.position.y = -0.455;
        this.floatGroup.add(barrelSwivel);

        const footSwivel = new THREE.Mesh(
            new THREE.TorusGeometry(0.0028, 0.00085, 8, 16),
            goldRingMat
        );
        footSwivel.position.y = -0.461;
        this.floatGroup.add(footSwivel);

        this.floatFootAnchor = new THREE.Object3D();
        this.floatFootAnchor.position.set(0, -0.461, 0);
        this.floatGroup.add(this.floatFootAnchor);

        // 4. TĂM PHAO SỢI QUANG HỌC DẠ QUANG SẮC NÉT (Đặt trong Group riêng, đồng bộ chuẩn mực nước 0.352m)
        this.floatTipsGroup = new THREE.Group();
        this.floatGroup.add(this.floatTipsGroup);
        this.floatBlackSpacerMat = this.applyFloatWaterlineShader(new THREE.MeshBasicMaterial({ color: 0x09090b }));
        this.floatTipMats = [];
        this.floatOriginalTipColors = [];

        this.rebuildFloat3DGeometry({
            shape: 'DIAMOND',
            tipMarks: 11,
            tipRadius: 0.0034,
            ledBiteColor: false
        });

        // 5. VÒNG SỨC CĂNG BỀ MẶT NƯỚC MẢNH TINH TẾ + QUẦNG PHẢN QUANG PHAO ĐÊM OLED (Nằm phẳng trên mặt nước)
        this.floatMeniscusRing = new THREE.Mesh(
            new THREE.RingGeometry(0.0035, 0.026, 32),
            new THREE.MeshBasicMaterial({
                color: 0xe0f2fe,
                transparent: true,
                opacity: 0.52,
                side: THREE.DoubleSide
            })
        );
        this.floatMeniscusRing.rotation.x = -Math.PI / 2;
        this.floatMeniscusRing.position.y = 0.004;
        this.floatMeniscusRing.visible = false;
        this.scene.add(this.floatMeniscusRing);

        // Vòng ren pin Lithium phát quang xanh băng ở đỉnh cổ bầu phao điện OLED
        this.floatOledCollarGlow = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0052, 0.0058, 0.010, 20),
            this.applyFloatWaterlineShader(new THREE.MeshBasicMaterial({
                color: 0x00ffd5,
                transparent: true,
                opacity: 0.0
            }))
        );
        this.floatOledCollarGlow.position.y = 0.001;
        this.floatGroup.add(this.floatOledCollarGlow);

        // Quầng phản chiếu ánh đèn Phao Đêm OLED lung linh trên mặt nước quanh chân tăm (chỉ sáng từ 18:00 tối!)
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 128;
        glowCanvas.height = 128;
        const gctx = glowCanvas.getContext('2d');
        const radG = gctx.createRadialGradient(64, 64, 2, 64, 64, 62);
        radG.addColorStop(0.0, 'rgba(0, 255, 213, 0.92)');
        radG.addColorStop(0.32, 'rgba(0, 225, 255, 0.42)');
        radG.addColorStop(0.7, 'rgba(16, 185, 129, 0.12)');
        radG.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        gctx.fillStyle = radG;
        gctx.fillRect(0, 0, 128, 128);
        const waterGlowTex = new THREE.CanvasTexture(glowCanvas);

        this.floatNightWaterGlowMat = new THREE.MeshBasicMaterial({
            map: waterGlowTex,
            color: 0x00ffd5,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.floatNightWaterGlow = new THREE.Mesh(
            new THREE.PlaneGeometry(0.26, 0.26),
            this.floatNightWaterGlowMat
        );
        this.floatNightWaterGlow.rotation.x = -Math.PI / 2;
        this.floatNightWaterGlow.position.y = 0.0055;
        this.floatNightWaterGlow.visible = false;
        this.scene.add(this.floatNightWaterGlow);

        this.floatNightPointLight = new THREE.PointLight(0x00ffd5, 0, 2.6, 1.8);
        this.floatNightPointLight.position.set(0, 0.16, 0);
        this.floatGroup.add(this.floatNightPointLight);

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

        // 5. Pad / Khay đựng mồi (Ẩn/hiện tầng 2, tầng 3, vành chắn nắng, đổi màu inox/vàng)
        if (this.baitTrayRimMat && baitPad) this.baitTrayRimMat.color.setHex(baitPad.rimColor);
        if (this.baitTrayInnerMat && baitPad) this.baitTrayInnerMat.color.setHex(baitPad.innerColor);
        if (this.baitTowelMat && baitPad) this.baitTowelMat.color.setHex(baitPad.towelColor);
        if (this.baitTrayLowerBowl && baitPad) {
            const hasGround = !!(this.activeGroundBait && this.activeGroundBait.charges > 0);
            this.baitTrayLowerBowl.visible = (baitPad.trayLayers >= 2) || hasGround;
        }
        if (this.baitTrayThirdBowl && baitPad) this.baitTrayThirdBowl.visible = baitPad.trayLayers >= 3;
        if (this.baitTrayCover && baitPad) this.baitTrayCover.visible = !!baitPad.hasCover;

        // 6. Thùng câu đài 3D
        if (this.fishingBoxBodyMat && box) this.fishingBoxBodyMat.color.setHex(box.boxColor);
        if (this.fishingBoxAccentMat && box) this.fishingBoxAccentMat.color.setHex(box.accentColor);
        if (this.fishingBoxLegs && box) this.fishingBoxLegs.visible = !!box.hasLegs;

        // 7. Ô che nắng câu đài 3D (Hỗ trợ vòm rộng theo cấp Lv.1 -> Lv.4, lớp lót Vinyl đen/bạc UV & tầng thoáng gió 2)
        if (this.umbrellaGroup && umbrella) {
            this.umbrellaGroup.visible = (!!umbrella.visible) && (this.umbrellaPose !== 'FOLD');
            if (this.umbrellaCanopyMat) this.umbrellaCanopyMat.color.setHex(umbrella.canopyColor);
            if (this.umbrellaTrimMat) this.umbrellaTrimMat.color.setHex(umbrella.trimColor);
            if (this.umbrellaUnderCoatMat) {
                // Lv.4 phủ Vinyl đen chống nóng tuyệt đối bên trong, Lv.1-3 phủ Bạc UV sáng dịu
                this.umbrellaUnderCoatMat.color.setHex(umbrella.level >= 4 ? 0x1e293b : 0xcbd5e1);
            }
            if (this.umbrellaCanopyHolder) {
                const cScale = umbrella.canopyScale || 1.0;
                this.umbrellaCanopyHolder.scale.set(cScale, 1.0, cScale);
            }
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
        // 1. Dựng đúng hình dáng Bầu Phao 3D trơn mượt 40 phân đoạn & thay đúng Texture sơn mài chất liệu thật
        if (this.floatBodyMesh) {
            const shape = flt.shape || 'DIAMOND';
            const { pts: lathePts } = this.buildSmoothFloatLathePoints(shape);
            if (this.floatBodyMesh.geometry) this.floatBodyMesh.geometry.dispose();
            this.floatBodyMesh.geometry = new THREE.LatheGeometry(lathePts, 36);
            if (this.floatBodyMat) {
                this.floatBodyMat.map = this.getFloatShapeTexture(shape);
                this.floatBodyMat.color.setHex(0xffffff);
                this.floatBodyMat.needsUpdate = true;
            }
        }

        // 2. Dựng lại Tăm Phao Quang Học theo đúng độ mảnh/rỗng, số nấc (9/11/13) & chóp bo tròn chống lóa
        if (this.floatTipsGroup) {
            while (this.floatTipsGroup.children.length > 0) {
                const c = this.floatTipsGroup.children[0];
                if (c.geometry) c.geometry.dispose();
                this.floatTipsGroup.remove(c);
            }
            const count = flt.tipMarks || 11;
            const rawR = flt.tipRadius || 0.0046;
            // Tỷ lệ đường kính tăm phao thanh mảnh chân thực (2.6mm - 5.2mm, mắt ngọn phình nhẹ chống lóa)
            const baseR = THREE.MathUtils.clamp(rawR * 0.62, 0.0018, 0.0046);
            const markH = 0.352 / count;
            this.floatTipMats = [];
            this.floatOriginalTipColors = [];
            this.floatOledSheathMats = [];
            this.floatOledNightColors = [];

            for (let i = 0; i < count; i++) {
                const isTopEye = (i >= count - 2);
                const taper = THREE.MathUtils.lerp(1.06, 0.92, i / Math.max(1, count - 1));
                const radius = isTopEye ? baseR * 1.48 : baseR * taper;

                let markColor = 0xff2200;
                if (flt.ledBiteColor) {
                    markColor = (i % 2 === 0) ? 0x00ffaa : 0x38bdf8;
                } else {
                    if (i % 3 === 1) markColor = 0xffe600;
                    if (i % 3 === 2) markColor = 0x00ff66;
                    if (i === count - 1) markColor = 0xff2a00;
                }

                // Bảng màu Phao Đêm OLED siêu tương phản khi câu tối từ 18:00 trở đi (Ngọn Cam Đỏ Neon • Thân Xanh Ngọc OLED / Vàng Chanh Quang Học)
                let oledNightHex = 0x00ffd5;
                if (i >= count - 2) oledNightHex = 0xff2a55;
                else if (i % 2 === 1) oledNightHex = 0xffee00;

                const segMat = this.applyFloatWaterlineShader(new THREE.MeshBasicMaterial({ color: markColor }));
                this.floatTipMats.push(segMat);
                this.floatOriginalTipColors.push(markColor);
                this.floatOledNightColors.push(oledNightHex);

                const seg = new THREE.Mesh(
                    new THREE.CylinderGeometry(radius * 0.97, radius, markH * 0.84, 16),
                    segMat
                );
                const yPos = (markH * 0.5) + i * markH;
                seg.position.y = yPos;
                this.floatTipsGroup.add(seg);

                // Lớp vỏ hào quang OLED phát sáng rực rỡ bọc ngoài mỗi vạch tăm phao vào ban đêm (Additive Glow)
                const sheathMat = this.applyFloatWaterlineShader(new THREE.MeshBasicMaterial({
                    color: oledNightHex,
                    transparent: true,
                    opacity: 0.0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                }));
                this.floatOledSheathMats.push(sheathMat);
                const oledSheath = new THREE.Mesh(
                    new THREE.CylinderGeometry(radius * 2.15, radius * 2.25, markH * 0.90, 14),
                    sheathMat
                );
                oledSheath.position.y = yPos;
                this.floatTipsGroup.add(oledSheath);

                const spacer = new THREE.Mesh(
                    new THREE.CylinderGeometry(radius * 0.90, radius * 0.90, markH * 0.16, 14),
                    this.floatBlackSpacerMat
                );
                spacer.position.y = yPos - markH * 0.5;
                this.floatTipsGroup.add(spacer);

                // Đỉnh chóp tăm phao bo tròn chống lóa mắt ngoài nắng + bọc hào quang OLED đêm
                if (i === count - 1) {
                    const topDome = new THREE.Mesh(
                        new THREE.SphereGeometry(radius * 1.02, 14, 10),
                        segMat
                    );
                    topDome.position.y = yPos + markH * 0.42;
                    this.floatTipsGroup.add(topDome);

                    const topGlowDome = new THREE.Mesh(
                        new THREE.SphereGeometry(radius * 2.35, 12, 10),
                        sheathMat
                    );
                    topGlowDome.position.y = yPos + markH * 0.42;
                    this.floatTipsGroup.add(topGlowDome);
                }
            }
        }
    }

    // Kiểm tra có đang trong khung giờ Câu Đêm từ 18:00 (6h tối) trở đi hay không
    isNightFloatTime() {
        const rawH = (this.environment && typeof this.environment.currentHour === 'number')
            ? this.environment.currentHour
            : 9.0;
        const h24 = ((rawH % 24) + 24) % 24;
        return (h24 >= 18.0 || h24 < 5.8);
    }

    updateFloatLedGlow(isBiteTake = false) {
        if (!this.floatTipMats || !this.floatOriginalTipColors) return;
        const nightOled = this.isNightFloatTime();
        this.isNightOledActive = nightOled;
        const useDayLed = this.equipBonuses && this.equipBonuses.ledBiteColor;
        const pulse = 0.88 + Math.sin(performance.now() * 0.008) * 0.12;

        for (let i = 0; i < this.floatTipMats.length; i++) {
            if (nightOled) {
                // PHAO ĐÊM OLED PHÁT SÁNG TỪ 18:00 TỐI: Đổi đỏ hồng cảm biến trọng lực khi cá ăn vào nhịp đóng!
                const cHex = isBiteTake ? 0xff1744 : (this.floatOledNightColors[i] || 0x00ffd5);
                this.floatTipMats[i].color.setHex(cHex);
                if (this.floatOledSheathMats && this.floatOledSheathMats[i]) {
                    this.floatOledSheathMats[i].color.setHex(cHex);
                    this.floatOledSheathMats[i].opacity = (isBiteTake ? 0.62 : 0.44) * pulse;
                }
            } else {
                if (useDayLed && isBiteTake) {
                    this.floatTipMats[i].color.setHex(0xff1100);
                } else {
                    this.floatTipMats[i].color.setHex(this.floatOriginalTipColors[i]);
                }
                if (this.floatOledSheathMats && this.floatOledSheathMats[i]) {
                    this.floatOledSheathMats[i].opacity = 0.0;
                }
            }
        }

        if (this.floatOledCollarGlow && this.floatOledCollarGlow.material) {
            this.floatOledCollarGlow.material.opacity = nightOled ? 0.88 : 0.0;
            this.floatOledCollarGlow.material.color.setHex(isBiteTake ? 0xff1744 : 0x00ffd5);
        }

        const floatVisibleOnWater = !!(
            this.floatGroup &&
            this.floatGroup.visible &&
            (this.state === FISHING_STATES.CASTING || this.state === FISHING_STATES.FLOAT_WAIT || this.state === FISHING_STATES.BITING)
        );
        if (this.floatNightPointLight) {
            this.floatNightPointLight.intensity = (nightOled && floatVisibleOnWater) ? (isBiteTake ? 1.55 : 1.05) : 0.0;
            this.floatNightPointLight.color.setHex(isBiteTake ? 0xff1744 : 0x00ffd5);
        }
        if (this.floatNightWaterGlow && this.floatNightWaterGlowMat) {
            const showWaterGlow = nightOled && floatVisibleOnWater && (this.floatGroup.position.y > -0.34);
            this.floatNightWaterGlow.visible = showWaterGlow;
            if (showWaterGlow) {
                this.floatNightWaterGlow.position.set(this.floatGroup.position.x, 0.0055, this.floatGroup.position.z);
                const gScale = (isBiteTake ? 1.28 : 0.96) * pulse;
                this.floatNightWaterGlow.scale.set(gScale, gScale, 1);
                this.floatNightWaterGlowMat.color.setHex(isBiteTake ? 0xff1744 : 0x00ffd5);
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

        // ==================== TEXTURE BỌT NƯỚC THỦY ĐỘNG LỰC HỌC MỀM MẠI (KHÔNG VIỀN CỨNG) ====================
        const makeWakeStreakTex = () => {
            const c = document.createElement('canvas');
            c.width = 128;
            c.height = 256;
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, 128, 256);
            // Đáy ảnh (y=255, v=0) tương ứng ĐẦU MŨI SÓNG (+Z), Đỉnh ảnh (y=0, v=1) tương ứng ĐUÔI SÓNG TAN DẦN (-Z)
            for (let y = 0; y < 256; y++) {
                const tFromNose = 1.0 - (y / 255); // 0 ở mũi -> 1 ở đuôi
                const longAlpha = Math.sin(Math.min(1, tFromNose * 5.2) * Math.PI * 0.5) * Math.pow(1.0 - tFromNose, 1.35);
                const halfW = 18 + tFromNose * 38;
                const grad = ctx.createLinearGradient(64 - halfW, y, 64 + halfW, y);
                grad.addColorStop(0.0, 'rgba(224, 242, 254, 0)');
                grad.addColorStop(0.28, `rgba(186, 230, 253, ${(longAlpha * 0.52).toFixed(3)})`);
                grad.addColorStop(0.50, `rgba(255, 255, 255, ${(longAlpha * 0.96).toFixed(3)})`);
                grad.addColorStop(0.72, `rgba(186, 230, 253, ${(longAlpha * 0.52).toFixed(3)})`);
                grad.addColorStop(1.0, 'rgba(224, 242, 254, 0)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, y, 128, 1);
            }
            const tex = new THREE.CanvasTexture(c);
            tex.needsUpdate = true;
            return tex;
        };

        const makeSoftFoamPatchTex = () => {
            const c = document.createElement('canvas');
            c.width = 128;
            c.height = 128;
            const ctx = c.getContext('2d');
            const rg = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
            rg.addColorStop(0.0, 'rgba(255, 255, 255, 0.92)');
            rg.addColorStop(0.38, 'rgba(224, 242, 254, 0.65)');
            rg.addColorStop(0.72, 'rgba(186, 230, 253, 0.24)');
            rg.addColorStop(1.0, 'rgba(186, 230, 253, 0.0)');
            ctx.fillStyle = rg;
            ctx.fillRect(0, 0, 128, 128);
            // Các hạt bọt khí li ti sủi trong vệt rẽ nước
            for (let i = 0; i < 36; i++) {
                const a = (i * 2.39996);
                const r = 6 + (i / 36) * 44;
                const bx = 64 + Math.cos(a) * r;
                const by = 64 + Math.sin(a) * r;
                ctx.fillStyle = `rgba(255,255,255,${(0.55 * (1 - r / 56)).toFixed(2)})`;
                ctx.beginPath();
                ctx.arc(bx, by, 1.4 + (i % 3) * 0.9, 0, Math.PI * 2);
                ctx.fill();
            }
            const tex = new THREE.CanvasTexture(c);
            tex.needsUpdate = true;
            return tex;
        };

        const makeRoosterSprayTex = () => {
            const c = document.createElement('canvas');
            c.width = 128;
            c.height = 128;
            const ctx = c.getContext('2d');
            // Đáy ảnh (y=127) sát mặt nước trắng đục, vọt chéo lên trên tan thành sương nước
            const lg = ctx.createLinearGradient(64, 127, 64, 8);
            lg.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
            lg.addColorStop(0.45, 'rgba(224, 242, 254, 0.62)');
            lg.addColorStop(1.0, 'rgba(224, 242, 254, 0.0)');
            ctx.fillStyle = lg;
            ctx.beginPath();
            ctx.moveTo(54, 127);
            ctx.quadraticCurveTo(36, 52, 8, 10);
            ctx.quadraticCurveTo(64, 26, 92, 54);
            ctx.quadraticCurveTo(84, 96, 74, 127);
            ctx.closePath();
            ctx.fill();
            const tex = new THREE.CanvasTexture(c);
            tex.needsUpdate = true;
            return tex;
        };

        const wakeStreakTex = makeWakeStreakTex();
        const softFoamTex = makeSoftFoamPatchTex();
        const roosterSprayTex = makeRoosterSprayTex();

        this.waterEntrySpray.material.map = softFoamTex;
        this.waterEntrySpray.material.depthWrite = false;

        // VỆT SÓNG KELVIN CHỮ V ĐA TẦNG CÁ CHẠY RẼ NƯỚC CHUẨN THỦY ĐỘNG LỰC HỌC (KELVIN V-WAKE & BOW WAVE)
        this.vWakeGroup = new THREE.Group();
        this.vWakeGroup.visible = false;
        const wakeOuterMat = new THREE.MeshBasicMaterial({
            map: wakeStreakTex,
            color: 0xe0f2fe,
            transparent: true,
            opacity: 0.88,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const wakeInnerFoamMat = new THREE.MeshBasicMaterial({
            map: wakeStreakTex,
            color: 0xffffff,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        // 2 Cánh sóng Kelvin ngoài (mở góc V chuẩn xác loe rộng về phía sau đuôi cá: Left zRot=+0.42, Right zRot=-0.42)
        const leftWakeWing = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 1.85), wakeOuterMat);
        leftWakeWing.rotation.x = -Math.PI / 2;
        leftWakeWing.rotation.z = 0.42;
        leftWakeWing.position.set(-0.37, 0.019, -0.76);
        this.vWakeGroup.add(leftWakeWing);

        const rightWakeWing = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 1.85), wakeOuterMat);
        rightWakeWing.rotation.x = -Math.PI / 2;
        rightWakeWing.rotation.z = -0.42;
        rightWakeWing.position.set(0.37, 0.019, -0.76);
        this.vWakeGroup.add(rightWakeWing);

        // 2 Dải bọt sủi tốc độ cao lớp trong (góc hẹp ±0.22 rad)
        const leftInnerWake = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 1.35), wakeInnerFoamMat);
        leftInnerWake.rotation.x = -Math.PI / 2;
        leftInnerWake.rotation.z = 0.22;
        leftInnerWake.position.set(-0.15, 0.023, -0.58);
        this.vWakeGroup.add(leftInnerWake);

        const rightInnerWake = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 1.35), wakeInnerFoamMat);
        rightInnerWake.rotation.x = -Math.PI / 2;
        rightInnerWake.rotation.z = -0.22;
        rightInnerWake.position.set(0.15, 0.023, -0.58);
        this.vWakeGroup.add(rightInnerWake);

        // Dải bọt xoáy trục giữa do vây đuôi cá quạt nước đẩy đi
        const centerFoamSpine = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 1.45), wakeInnerFoamMat);
        centerFoamSpine.rotation.x = -Math.PI / 2;
        centerFoamSpine.position.set(0, 0.025, -0.64);
        this.vWakeGroup.add(centerFoamSpine);

        // Gờ sóng mũi uốn cong hình bán nguyệt (3D Raised Bow Wave Crest) đội nước vồng lên trước đầu cá!
        const bowArcGeo = new THREE.CylinderGeometry(0.20, 0.28, 0.085, 16, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
        const bowCrest = new THREE.Mesh(
            bowArcGeo,
            new THREE.MeshBasicMaterial({
                map: softFoamTex,
                color: 0xffffff,
                transparent: true,
                opacity: 0.90,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        );
        bowCrest.position.set(0, 0.036, 0.02);
        this.vWakeGroup.add(bowCrest);
        this.bowCrestMesh = bowCrest;
        this.scene.add(this.vWakeGroup);

        // DẢI BỌT TRẮNG LƯU DẤU QUỸ ĐẠO CÁ CHẠY TRÊN MẶT HỒ (PERSISTENT CURVED FOAM WAKE TRAIL — 24 NODES)
        this.wakeTrailNodes = [];
        this.wakeTrailSpawnDist = 0;
        this.lastTrailSpawnPos = new THREE.Vector3();
        const trailGeo = new THREE.PlaneGeometry(0.46, 0.62);
        for (let i = 0; i < 24; i++) {
            const tMat = new THREE.MeshBasicMaterial({
                map: softFoamTex,
                color: 0xf0f9ff,
                transparent: true,
                opacity: 0.0,
                depthWrite: false
            });
            const tMesh = new THREE.Mesh(trailGeo, tMat);
            tMesh.rotation.x = -Math.PI / 2;
            tMesh.visible = false;
            this.scene.add(tMesh);
            this.wakeTrailNodes.push({
                mesh: tMesh,
                mat: tMat,
                life: 0,
                maxLife: 1.35,
                baseScale: 1.0
            });
        }

        // QUẦNG NƯỚC XOÁY & BÙN CUỘN TỪ ĐÁY LÊN KHI CÁ TO ĐỘNG NƯỚC QUẪY ĐUÔI
        this.fishMudBoil = new THREE.Mesh(
            new THREE.PlaneGeometry(0.95, 0.95),
            new THREE.MeshBasicMaterial({
                map: softFoamTex,
                color: 0x4a3520,
                transparent: true,
                opacity: 0.42,
                depthWrite: false
            })
        );
        this.fishMudBoil.rotation.x = -Math.PI / 2;
        this.fishMudBoil.position.y = 0.008;
        this.fishMudBoil.visible = false;
        this.scene.add(this.fishMudBoil);

        // VỆT SÓNG TRẮNG & LƯỠI NƯỚC BẮN VỌT LÊN TẠI ĐIỂM DÂY CƯỚC XÉ NGANG MẶT HỒ (3D LINE-SLICE & ROOSTER TAIL)
        this.lineCutWakeGroup = new THREE.Group();
        this.lineCutWakeGroup.visible = false;
        const cutFoamMat = new THREE.MeshBasicMaterial({
            map: wakeStreakTex,
            color: 0xffffff,
            transparent: true,
            opacity: 0.94,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const cutLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.72), cutFoamMat);
        cutLeft.rotation.x = -Math.PI / 2;
        cutLeft.rotation.z = 0.30;
        cutLeft.position.set(-0.10, 0.018, -0.30);
        this.lineCutWakeGroup.add(cutLeft);

        const cutRight = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.72), cutFoamMat);
        cutRight.rotation.x = -Math.PI / 2;
        cutRight.rotation.z = -0.30;
        cutRight.position.set(0.10, 0.018, -0.30);
        this.lineCutWakeGroup.add(cutRight);

        const cutBead = new THREE.Mesh(
            new THREE.PlaneGeometry(0.18, 0.18),
            new THREE.MeshBasicMaterial({
                map: softFoamTex,
                color: 0xffffff,
                transparent: true,
                opacity: 0.95,
                depthWrite: false
            })
        );
        cutBead.rotation.x = -Math.PI / 2;
        cutBead.position.set(0, 0.021, 0.02);
        this.lineCutWakeGroup.add(cutBead);

        // Lưỡi nước dựng đứng (Rooster-Tail Fin) bắn vọt ngược chiều dây cước xé mặt hồ!
        this.lineRoosterTail = new THREE.Mesh(
            new THREE.PlaneGeometry(0.32, 0.28),
            new THREE.MeshBasicMaterial({
                map: roosterSprayTex,
                color: 0xffffff,
                transparent: true,
                opacity: 0.88,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        );
        this.lineRoosterTail.rotation.y = Math.PI / 2; // Đặt dọc theo mặt phẳng YZ (hướng ngược chiều cắt -Z)
        this.lineRoosterTail.position.set(0, 0.13, -0.11);
        this.lineCutWakeGroup.add(this.lineRoosterTail);
        this.scene.add(this.lineCutWakeGroup);

        // HỆ THỐNG 48 HẠT NƯỚC BẮN TUNG TÓE KHI CƯỚC XÉ NƯỚC, CÁ QUẪY ĐUÔI & NHẢY SANTO
        this.waterSprayDrops = [];
        const dropGeo = new THREE.SphereGeometry(0.028, 7, 7);
        const dropMat = new THREE.MeshBasicMaterial({
            color: 0xf0f9ff,
            transparent: true,
            opacity: 0.92
        });
        for (let i = 0; i < 48; i++) {
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

        // Cán vợt hớt cá Carbon đan chéo có bọc EVA nhám + Khớp ốc đồng chữ Y + Vành Anod xanh + Lưới mắt cáo sâu
        const netCarbonTex = createCarbonWeaveTexture();
        const handle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0115, 0.0165, 2.92, 14),
            new THREE.MeshStandardMaterial({ map: netCarbonTex, color: 0x1e293b, metalness: 0.72, roughness: 0.22 })
        );
        handle.rotation.x = THREE.MathUtils.degToRad(-78);
        handle.position.set(-0.22, -0.34, -1.25);
        this.landingNetGroup.add(handle);

        this.landingNetGripAnchor = new THREE.Object3D();
        this.landingNetGripAnchor.position.set(-0.22, 0.02, -0.14);
        this.landingNetGroup.add(this.landingNetGripAnchor);

        const ySpreader = new THREE.Mesh(
            new THREE.CylinderGeometry(0.016, 0.014, 0.08, 12),
            new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.92, roughness: 0.16 })
        );
        ySpreader.rotation.x = THREE.MathUtils.degToRad(-78);
        ySpreader.position.set(-0.145, -0.09, -2.32);
        this.landingNetGroup.add(ySpreader);

        const hoop = new THREE.Mesh(
            new THREE.TorusGeometry(0.36, 0.0115, 12, 36),
            new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.88, roughness: 0.16 })
        );
        hoop.rotation.x = Math.PI / 2.2;
        hoop.position.set(-0.12, -0.05, -2.68);
        this.landingNetGroup.add(hoop);

        const meshNet = new THREE.Mesh(
            new THREE.CylinderGeometry(0.355, 0.19, 0.48, 24, 5, true),
            new THREE.MeshBasicMaterial({
                color: 0xe0f2fe,
                wireframe: true,
                transparent: true,
                opacity: 0.72
            })
        );
        meshNet.position.set(-0.12, -0.28, -2.68);
        this.landingNetGroup.add(meshNet);

        const netFlatBottom = new THREE.Mesh(
            new THREE.CircleGeometry(0.19, 20),
            new THREE.MeshBasicMaterial({
                color: 0xbae6fd,
                wireframe: true,
                transparent: true,
                opacity: 0.65,
                side: THREE.DoubleSide
            })
        );
        netFlatBottom.rotation.x = Math.PI / 2;
        netFlatBottom.position.set(-0.12, -0.52, -2.68);
        this.landingNetGroup.add(netFlatBottom);

        this.fpvRig.add(this.landingNetGroup);
    }

    seatAtPosition(pos, lake, spotName = 'Bến Câu Đài') {
        this.currentLake = lake;
        this.currentSpotName = spotName;
        this.playerSeatPos = pos.clone();
        this.state = FISHING_STATES.SEATED;

        this.fpvRig.visible = true;
        this.tpvBlend = 0;
        this.tpvCamInitialized = false;
        this.syncSeatAnchorFromCamera();
        this.fpvRig.position.copy(this.seatEyePos);
        this.fpvRig.quaternion.copy(this.seatBaseQuat);
        if (this.fpvArmGroup) this.fpvArmGroup.visible = true;
        if (this.tpvAnglerGroup) this.tpvAnglerGroup.visible = false;
        if (this.umbrellaGroup) this.umbrellaGroup.position.set(0, 0, 0);
        this.rodRestSupport.visible = true;
        this.landingNetGroup.visible = false;
        this.fish3DGroup.visible = false;
        this.waterEntrySpray.visible = false;
        if (this.vWakeGroup) this.vWakeGroup.visible = false;
        this.hideAllWaterSpray();
        this.floatGroup.visible = false;
        if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
        if (this.floatNightWaterGlow) this.floatNightWaterGlow.visible = false;
        if (this.floatNightPointLight) this.floatNightPointLight.intensity = 0;
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
        this.tpvBlend = 0;
        this.tpvCamInitialized = false;
        this.hasSeatAnchor = false;
        if (this.fpvArmGroup) this.fpvArmGroup.visible = true;
        if (this.tpvAnglerGroup) this.tpvAnglerGroup.visible = false;
        if (this.umbrellaGroup) this.umbrellaGroup.position.set(0, 0, 0);
        this.fpvRig.visible = false;
        this.floatGroup.visible = false;
        if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
        if (this.floatNightWaterGlow) this.floatNightWaterGlow.visible = false;
        if (this.floatNightPointLight) this.floatNightPointLight.intensity = 0;
        this.fishingLine.visible = false;
        this.fish3DGroup.visible = false;
        this.waterEntrySpray.visible = false;
        this.landingNetGroup.visible = false;
        return true;
    }

    // Đồng bộ trực quan 3D Khay Mồi theo đúng Loại Mồi (Cám Vê / Ốc Xoắn / Hạt Ngô Vàng) & Số Lượng Mồi Vê Còn Lại!
    updateBaitTrayVisuals() {
        const hb = this.activeHookBait;
        const gb = this.activeGroundBait;
        const hookCharges = (hb && typeof hb.charges === 'number') ? hb.charges : (hb ? 16 : 0);
        const maxHook = (hb && typeof hb.maxCharges === 'number' && hb.maxCharges > 0) ? hb.maxCharges : Math.max(16, hookCharges);
        const groundCharges = (gb && typeof gb.charges === 'number') ? gb.charges : (gb ? 8 : 0);
        const maxGround = (gb && typeof gb.maxCharges === 'number' && gb.maxCharges > 0) ? gb.maxCharges : Math.max(10, groundCharges);

        const mode = (hb && hb.fishingMode) || (gb && gb.fishingMode) || 'CAM';

        // 1. Khay mồi xả tầng dưới: bật khay xả khi có mồi xả, hạ dần độ phồng ụ mồi theo tỷ lệ còn lại
        if (this.baitTrayLowerBowl) {
            const padLv = (this.equipLevels && this.equipLevels.baitPad) || 1;
            this.baitTrayLowerBowl.visible = (padLv >= 2) || (groundCharges > 0);
        }
        if (this.crumbSurfaceMesh) {
            this.crumbSurfaceMesh.visible = groundCharges > 0;
            const fillRatio = THREE.MathUtils.clamp(groundCharges / maxGround, 0.18, 1.0);
            this.crumbSurfaceMesh.scale.set(1.0, 0.35 + fillRatio * 0.85, 1.0);

            if (this.crumbMoundMat && this.crumbGrainMat) {
                if (mode === 'CORN') {
                    this.crumbMoundMat.color.setHex(0xca8a04);
                    this.crumbGrainMat.color.setHex(0xfef08a);
                } else if (mode === 'SNAIL') {
                    this.crumbMoundMat.color.setHex(0x57534e);
                    this.crumbGrainMat.color.setHex(0x1c1917);
                } else {
                    this.crumbMoundMat.color.setHex(0xb45309);
                    this.crumbGrainMat.color.setHex(0xfbbf24);
                }
            }
        }

        // 2. 16 Phần tử mồi câu trên Đĩa Từ: đổi hình thái & số lượng hiển thị mượt mà
        if (this.baitTrayBalls && this.baitTrayBalls.length > 0) {
            const totalSlots = this.baitTrayBalls.length; // 16 vị trí đồng tâm
            let visibleCount = 0;
            if (hookCharges > 0) {
                if (hookCharges <= totalSlots) {
                    visibleCount = hookCharges; // Khi còn <= 16 viên: hiển thị chuẩn từng viên một tới viên cuối cùng!
                } else {
                    visibleCount = Math.max(1, Math.min(totalSlots, Math.ceil((hookCharges / maxHook) * totalSlots)));
                }
            }

            if (this.baitBallPrimaryMat && this.baitBallAccentMat) {
                if (mode === 'SNAIL') {
                    this.baitBallPrimaryMat.color.setHex(0x292524);
                    this.baitBallPrimaryMat.roughness = 0.25;
                    this.baitBallAccentMat.color.setHex(0x44403c);
                } else if (mode === 'CORN') {
                    this.baitBallPrimaryMat.color.setHex(0xfacc15);
                    this.baitBallPrimaryMat.roughness = 0.22;
                    this.baitBallAccentMat.color.setHex(0xeab308);
                } else {
                    const isSoft = hb && hb.baitFirmness === 'SOFT';
                    this.baitBallPrimaryMat.color.setHex(isSoft ? 0xea580c : 0xd97706);
                    this.baitBallPrimaryMat.roughness = 0.78;
                    this.baitBallAccentMat.color.setHex(0x92400e);
                }
            }

            this.baitTrayBalls.forEach((grp, idx) => {
                const show = idx < visibleCount;
                grp.visible = show;
                if (!show || !grp.userData) return;
                const { mainPiece, snailTip, baseY } = grp.userData;
                if (mode === 'SNAIL') {
                    mainPiece.scale.set(0.95, 0.92, 1.05);
                    snailTip.visible = true;
                    grp.position.y = baseY;
                } else if (mode === 'CORN') {
                    mainPiece.scale.set(1.16, 0.74, 0.92);
                    snailTip.visible = false;
                    grp.position.y = baseY - 0.003;
                } else {
                    const firmScale = (hb && hb.baitFirmness === 'SOFT') ? 1.12 : ((hb && hb.baitFirmness === 'HARD') ? 0.88 : 1.0);
                    mainPiece.scale.set(firmScale, firmScale * 0.88, firmScale);
                    snailTip.visible = false;
                    grp.position.y = baseY;
                }
            });
        }
    }

    // Chuyển đổi 3 tư thế Ô Che Nắng Câu Đài (Mở Thẳng ➔ Bẻ Khớp Lò Xo Nghiêng 45° Chắn Nắng Xiên ➔ Thu Gọn Ô)
    cycleUmbrellaPose() {
        const order = ['OPEN', 'TILT', 'FOLD'];
        const curIdx = order.indexOf(this.umbrellaPose || 'OPEN');
        this.umbrellaPose = order[(curIdx + 1) % order.length];

        if (this.umbrellaGroup) {
            this.umbrellaGroup.visible = (this.umbrellaPose !== 'FOLD');
        }
        if (this.umbrellaPose === 'OPEN') {
            return {
                pose: 'OPEN',
                shortBtn: '⛱️ Ô: Mở',
                message: '⛱️ Đã dựng thẳng Ô Câu Đài che mát đỉnh đầu & giảm bóng lóa mặt nước!'
            };
        }
        if (this.umbrellaPose === 'TILT') {
            return {
                pose: 'TILT',
                shortBtn: '⛱️ Ô: Nghiêng',
                message: '⛱️ Đã bẻ khớp lò xo nghiêng cổ ô chắn nắng xiên & mưa tạt ngang chuẩn đài thủ!'
            };
        }
        return {
            pose: 'FOLD',
            shortBtn: '⛱️ Ô: Gập',
            message: '🌤️ Đã thu gọn Ô Câu Đài để ngắm trọn bầu trời hồ câu (Bấm O để mở lại ô).'
        };
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

    // Cấp mới số lượt Kích Mồi hiệu quả ngẫu nhiên cho ca câu (Mỗi 1 ca 5 tiếng random từ 5 đến 15 lần hiệu quả!)
    resetTwitchShiftQuota(packageHours = 5) {
        const shifts5h = Math.max(1, Math.round((packageHours || 5) / 5));
        let total = 0;
        for (let i = 0; i < shifts5h; i++) {
            total += 5 + Math.floor(Math.random() * 11); // 5..15 lần cho mỗi ca 5 tiếng
        }
        this.twitchEffectiveLeft = total;
        this.twitchEffectiveMax = total;
        this.twitchBiteCountdown = 0;
        this.twitchBubbleHintSpawned = false;
        return { left: this.twitchEffectiveLeft, max: this.twitchEffectiveMax };
    }

    // NÚT KÍCH MỒI (Phím K): Nhấc nhử nhẹ đọt cần làm mồi nhúc nhích rụng sương
    // - Mỗi ca 5 tiếng có 5-15 lần hiệu quả random
    // - Khi còn lượt hiệu quả: 30% tỷ lệ cá ăn ngay sau đúng 5 giây (Bấm 2-3 vạch phao và giữ nguyên 3-5 giây)
    twitchBait() {
        if (this.state !== FISHING_STATES.FLOAT_WAIT) {
            if (this.state === FISHING_STATES.CASTING) {
                return { success: false, message: '⏳ Phao đang xuống nước — đợi phao đứng mục ổn định rồi hãy bấm Kích Mồi!' };
            }
            if (this.state === FISHING_STATES.BITING) {
                return { success: false, message: '⚡ Phao đang có tín hiệu cá ăn rồi — canh nhịp GIẬT CẦN ngay!' };
            }
            return { success: false, message: '🎣 Hãy Vung Cần Ra Ổ Câu đợi phao đứng mục rồi mới bấm Kích Mồi!' };
        }
        if (this.isBareHook) {
            return { success: false, message: '⚠️ Mồi trên lưỡi đã tan hết (Trơ lưỡi sắt)! Hãy thu cần vê mồi mới trước khi Kích Mồi!' };
        }
        if (this.twitchBiteCountdown > 0 || this.twitchCooldownTimer > 0) {
            return { success: false, message: '⏳ Bạn vừa Kích Mồi xong — hãy giữ im cần và soi kỹ vạch phao trong 5 giây tới!' };
        }

        // Động tác vật lý nhấc nhử nhẹ đọt cần + tăm phao nhô nhẹ ~1.4 vạch rồi êm dần về mực câu
        this.twitchRodAnimTimer = 0.68;
        this.twitchCooldownTimer = 1.65;
        this.floatVerticalOffset = 0.044;
        this.hookBaitIntegrity = Math.max(0.06, this.hookBaitIntegrity - 0.06);
        if (this.lastHookTargetInfo) {
            this.lastHookTargetInfo.baitIntegrity = this.hookBaitIntegrity;
        }
        soundManager.playWaterSplash(0.32);
        this.bubbleSystem.spawnRipple(this.floatTargetPos.x, this.floatTargetPos.z, 0.44);

        // Kiểm tra quota 5-15 lần hiệu quả của ca câu 5h hiện tại
        if (this.twitchEffectiveLeft <= 0) {
            return {
                success: true,
                exhausted: true,
                left: 0,
                max: this.twitchEffectiveMax,
                message: `🫧 Đã nhấc nhử mồi, nhưng ca này đã hết lượt Kích Mồi hiệu quả (0/${this.twitchEffectiveMax}) — cá dưới ổ đã quen bài nhử, hãy chờ cá ăn tự nhiên hoặc sang ca mới!`
            };
        }

        this.twitchEffectiveLeft = Math.max(0, this.twitchEffectiveLeft - 1);

        // 30% tỷ lệ cá sẽ ăn ngay sau đúng 5 giây!
        const hit30Percent = Math.random() < 0.30;
        if (hit30Percent) {
            this.twitchBiteCountdown = 5.0;
            this.twitchBubbleHintSpawned = false;
        } else {
            // 70% chưa đớp ngay: Bụi mồi rụng xuống giúp rút ngắn thời gian chờ cá tự nhiên
            this.waitFishTimer = Math.max(2.0, this.waitFishTimer * 0.78);
        }

        return {
            success: true,
            triggered: hit30Percent,
            left: this.twitchEffectiveLeft,
            max: this.twitchEffectiveMax,
            message: `⚡ Đã KÍCH MỒI (Còn ${this.twitchEffectiveLeft}/${this.twitchEffectiveMax} lần hiệu quả trong ca)! Chờ 5 giây soi kỹ: nếu phao BẤM 2–3 VẠCH giữ im 3–5s thì GIẬT NGAY là lụm cá!`
        };
    }

    // Kích hoạt nhịp cá ăn đặc trưng sau 5 giây Kích Mồi: Bấm 2-3 vạch phao và giữ nguyên 3-5 giây!
    startTwitchHoldBite() {
        if (this.state !== FISHING_STATES.FLOAT_WAIT || this.isBareHook) return;
        this.bubbleSystem.clearHookBaitTarget();

        // Tìm con cá AI đang bơi gần ổ phao nhất để đồng bộ loài & cân nặng thực tế
        let nearestFish = null;
        let bestDist = 14.0;
        if (this.bubbleSystem && Array.isArray(this.bubbleSystem.fishSchools)) {
            for (const f of this.bubbleSystem.fishSchools) {
                if (!f || f.isHooked) continue;
                const d = Math.hypot(f.x - this.floatTargetPos.x, f.z - this.floatTargetPos.z);
                if (d < bestDist) {
                    bestDist = d;
                    nearestFish = f;
                }
            }
        }

        this.pendingAIFish = nearestFish;
        this.state = FISHING_STATES.BITING;
        this.fishApproaching = false;
        this.twitchBiteCountdown = 0;

        this.bubbleSystem.spawnCarpBubbles(this.floatTargetPos.x, this.floatTargetPos.z, true, true);
        this.bubbleSystem.spawnRipple(this.floatTargetPos.x, this.floatTargetPos.z, 0.68);

        const tipMarks = (this.equipBonuses && this.equipBonuses.float && this.equipBonuses.float.tipMarks)
            ? this.equipBonuses.float.tipMarks
            : 11;
        const markH = 0.352 / tipMarks;
        const pressedMarks = Number((2.0 + Math.random() * 1.0).toFixed(1)); // Bấm đúng 2.0 - 3.0 vạch phao!
        const pressDepth = pressedMarks * markH;
        const holdDuration = Number((3.0 + Math.random() * 2.0).toFixed(2)); // Giữ nguyên vạch 3.0 - 5.0 giây!
        const key = (nearestFish && nearestFish.speciesKey) ? nearestFish.speciesKey : 'CARP';

        this.biteScript = {
            scenario: 'TWITCH_HOLD',
            stageIndex: 0,
            stages: [
                { name: 'PRESS_DOWN', duration: 0.18 },
                { name: 'HOLD_BARS', duration: holdDuration }
            ],
            stageTime: 0,
            willCommit: true,
            isTakeWindow: false,
            speciesKey: key,
            pressedMarks,
            pressDepth,
            holdDuration,
            driftX: 0,
            driftZ: 0,
            rippleTimer: 0,
            flavorDrops: 0,
            flavorSummary: '',
            isFlavorOverdose: false
        };

        this.biteType = BITE_TYPES.QUICK_TAP;
        this.biteMaxTime = holdDuration;
        this.biteTimer = holdDuration;
        this.bitePromptText = '';
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

        // Sinh nắm mồi xả 3D (Cám / Ốc / Ngô) bay vút vòng cung từ Khay Mồi của cần thủ ra đúng ổ câu!
        const right = new THREE.Vector3(-forward.z, 0, forward.x);
        const startPos = new THREE.Vector3()
            .copy(this.camera.position)
            .addScaledVector(right, -0.32)
            .addScaledVector(forward, 0.55);
        startPos.y -= 0.25;

        const mode = (this.activeGroundBait && this.activeGroundBait.fishingMode) || 'CAM';
        const lumpColor = mode === 'CORN' ? 0xfacc15 : (mode === 'SNAIL' ? 0x44403c : 0xb45309);
        const lumpGroup = new THREE.Group();
        const coreBall = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.052, 1),
            new THREE.MeshStandardMaterial({ color: lumpColor, roughness: 0.88 })
        );
        lumpGroup.add(coreBall);
        for (let k = 0; k < 4; k++) {
            const subGrain = new THREE.Mesh(
                new THREE.SphereGeometry(0.016, 6, 6),
                new THREE.MeshStandardMaterial({ color: mode === 'SNAIL' ? 0x1c1917 : 0xfde047, roughness: 0.5 })
            );
            const a = (k / 4) * Math.PI * 2;
            subGrain.position.set(Math.cos(a) * 0.036, (k % 2) * 0.018, Math.sin(a) * 0.036);
            lumpGroup.add(subGrain);
        }
        lumpGroup.position.copy(startPos);
        this.scene.add(lumpGroup);

        const groundBaitRef = { ...this.activeGroundBait };
        this.groundBaitProjectiles.push({
            mesh: lumpGroup,
            start: startPos,
            end: new THREE.Vector3(baitSpotX, 0.02, baitSpotZ),
            elapsed: 0,
            duration: 0.56,
            baitData: groundBaitRef
        });

        this.groundBaitsCastCount += 1;
        // Xả mồi giúp trấn an đàn cá và hồi phục ổ nhanh chóng sau khi giật trượt
        this.consecutiveMisses = Math.max(0, this.consecutiveMisses - 1);
        if (this.state === FISHING_STATES.FLOAT_WAIT) {
            this.waitFishTimer = Math.min(this.waitFishTimer, 8.0);
        }

        const uG = this.activeGroundBait.unitLabel || 'nắm xả';
        const rem = typeof this.activeGroundBait.charges === 'number' ? ` (Còn ${this.activeGroundBait.charges} ${uG})` : '';
        return {
            success: true,
            message: `🥣 Đã ném [${this.activeGroundBait.name}] bay ra ổ${rem}! Mùi thơm lan tỏa trấn an đàn cá, dẫn dụ cá vào ổ!`
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
        this.twitchBiteCountdown = 0;
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
        if (this.hasSeatAnchor) {
            forward.copy(this.seatForward);
        } else {
            this.camera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();
        }
        const originPos = this.hasSeatAnchor ? this.seatEyePos : this.camera.position;

        const castDist = this.getCastDistance();
        this.floatTargetPos.set(
            originPos.x + forward.x * castDist,
            0.0,
            originPos.z + forward.z * castDist
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
            // Tạo hiệu ứng giật cổ tay vút cần thu chì/phao lên mặt nước kèm gợn sóng nhỏ
            if (this.floatGroup && this.floatGroup.visible) {
                this.bubbleSystem.spawnRipple(this.floatGroup.position.x, this.floatGroup.position.z, 0.45);
                this.spawnWaterSprayBurst(this.floatGroup.position.x, this.floatGroup.position.z, 5, 1.8, 0.9);
            }
            this.strikeWhipTimer = this.strikeWhipDuration;
            this.strikeWhipHit = false;
            this.bendVelocity = -2.4;

            this.bubbleSystem.clearHookBaitTarget();
            this.twitchBiteCountdown = 0;
            this.updateFloatLedGlow(false);
            this.state = FISHING_STATES.SEATED;
            this.floatGroup.visible = false;
            if (this.floatMeniscusRing) this.floatMeniscusRing.visible = false;
            if (this.floatNightWaterGlow) this.floatNightWaterGlow.visible = false;
            this.fishingLine.visible = false;
            this.fish3DGroup.visible = false;
            this.hideAllWaterSpray();
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
        this.twitchBiteCountdown = 0;
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
        const flavorSummary = (this.activeHookBait && this.activeHookBait.flavorSummary)
            ? this.activeHookBait.flavorSummary
            : `${flavorDrops} giọt`;
        const isSunny = !this.environment || this.environment.weather === 'SUNNY';
        const isFlavorOverdose = (this.activeHookBait && typeof this.activeHookBait.isFlavorOverdose === 'boolean')
            ? this.activeHookBait.isFlavorOverdose
            : (flavorDrops >= (isSunny ? 8 : 10));

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
            flavorSummary,
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
            const fSummary = this.biteScript ? (this.biteScript.flavorSummary || `${this.biteScript.flavorDrops || 'nhiều'} giọt`) : 'quá liều';
            this.biteScript = null;
            this.pendingAIFish = null;
            this.state = FISHING_STATES.FLOAT_WAIT;
            this.floatVerticalOffset = 0;
            this.waitFishTimer = 3.0 + Math.random() * 4.0;
            if (this.lastHookTargetInfo) {
                this.bubbleSystem.setHookBaitTarget(this.lastHookTargetInfo);
            }
            const msg = `💡 ĐÈ PHAO (NẶNG MÙI: ${fSummary}): Cá sặc mùi cày nhiều tăm & quẹt vây đè phao chìm từ từ rồi nổi lên! Bạn đã kiên nhẫn không giật bậy, giữ trọn ổ câu!`;
            window.dispatchEvent(new CustomEvent('player_fishing_event', { detail: { type: 'INFO', text: msg } }));
            return;
        }

        const keyName = this.biteScript ? (SPECIES[this.biteScript.speciesKey] || SPECIES.CARP).name : 'Cá';
        const wasTwitchHold = !!(this.biteScript && this.biteScript.scenario === 'TWITCH_HOLD');
        const twMarks = wasTwitchHold ? this.biteScript.pressedMarks : 2.5;
        const twHold = wasTwitchHold ? this.biteScript.holdDuration : 4.0;
        this.biteScript = null;
        this.pendingAIFish = null;
        this.state = FISHING_STATES.FLOAT_WAIT;
        // Nếu cá nhả mồi sau khi bấm giữ 2-3 vạch từ Kích Mồi -> phao nảy nhẹ trồi trả lại mực cân ban đầu!
        this.floatVerticalOffset = wasTwitchHold ? 0.014 : 0;
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
        if (wasTwitchHold) {
            msg = `💨 Cá ăn sau KÍCH MỒI (đã bấm giữ ${twMarks} vạch phao suốt ${twHold.toFixed(1)}s) nhưng không giật nên cá đã NHẢ MỒI trồi phao lại!`;
            evtType = 'MISSED';
        } else if (reason === 'MOM_END') {
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
                earlyMsg = `⚠️ GIẬT HỤT DO ĐÈ PHAO: Mồi quá nặng mùi (${s.flavorSummary || 'quá liều hương liệu'})! Cá sặc mùi cày tăm & chỉ quẹt vây đè phao chìm dần rồi nổi lên chứ không ăn — ${scared} con cá tản ổ! Hãy pha đúng tỷ lệ vàng (Ốc: 5–10 giọt Rượu Thuốc Bắc/1kg cám • Ngô: 5–10ml Nước Xanh/10 bắp)!`;
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
        } else if (s.scenario === 'TWITCH_HOLD') {
            praiseText = `⚡ KÍCH MỒI LỤM CÁ! Cá bấm ${s.pressedMarks || 2.5} vạch giữ im — Đóng chuẩn 100% ngập hàm!`;
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
        this.strikeWhipTimer = this.strikeWhipDuration;
        this.strikeWhipHit = true;
        this.headShakeImpulse = 0.85;
        this.initFishFight();
        soundManager.playHooksetSuccess(this.hookedFish ? this.hookedFish.weight : 3.0);
        this.bendVelocity = 4.6;

        // Cột nước bùng lên & sóng động ổ ngay khoảnh khắc đóng lưỡi trúng hàm cá!
        this.bubbleSystem.spawnRipple(this.floatTargetPos.x, this.floatTargetPos.z, 1.55);
        this.bubbleSystem.spawnCarpBubbles(this.floatTargetPos.x, this.floatTargetPos.z, true, true);
        this.spawnWaterSprayBurst(this.floatTargetPos.x, this.floatTargetPos.z, 14, 3.2, 1.9);

        window.dispatchEvent(new CustomEvent('fish_hooked_net', {
            detail: { fish: this.hookedFish }
        }));

        return {
            success: true,
            hit: true,
            message: `🎯 ĐÓNG DÍNH [${this.hookedFish.name} ${this.hookedFish.weight}kg]! ${praiseText}`
        };
    }

    // Dựng lại mô hình cá bị đóng theo đúng loài (chép / chép củ / trắm đen / trắm cỏ / rô phi + khuyên vàng 3D nếu trúng cá giải!)
    setFightFishModel(speciesKey, weight, isTaggedPrize = false) {
        while (this.fish3DGroup.children.length > 0) {
            this.fish3DGroup.remove(this.fish3DGroup.children[0]);
        }
        const model = buildRealisticFish(speciesKey, weight, { noScale: true, isTaggedPrize });
        const holder = new THREE.Group();
        holder.rotation.y = Math.PI; // Mô hình mũi +Z -> cá đang bơi mũi hướng -Z theo quy ước của hệ cá bị đóng
        holder.add(model);
        this.fish3DGroup.add(holder);
        this.fishHolderGroup = holder;
        this.fishTailMesh = model.userData.tailPivot;
        this.fishLeftFin = model.userData.leftFin;
        this.fishRightFin = model.userData.rightFin;
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
        this.fightElapsedTime = 0;

        // Cá càng to bo càng lâu: Rô phi ~9-12s • Cá 5kg ~25s • Cá 10kg ~42s • Cá HUGO khủng (15-18kg) tối đa đúng 60 giây (1 phút)!
        this.fightWeightNorm = THREE.MathUtils.clamp((finalWeight - 0.8) / 15.2, 0.0, 1.0);
        this.expectedRunSeconds = THREE.MathUtils.lerp(7.5, 53.5, Math.pow(this.fightWeightNorm, 0.90));

        // Chỉ bật màu hướng dẫn cách bo trên các nút cho ĐÚNG 1 LẦN ĐẦU TIÊN người chơi bo cá!
        let doneFirstGuide = false;
        try {
            doneFirstGuide = localStorage.getItem('vn_carp_first_fight_done_v1') === '1';
            if (!doneFirstGuide) {
                localStorage.setItem('vn_carp_first_fight_done_v1', '1');
            }
        } catch (e) {}
        this.showFightButtonGuide = !doneFirstGuide;

        // Khởi tạo Thanh Cân Bằng Lực Bo Trái/Phải (Cá vừa dính lưỡi sẽ lập tức tạt đầu sang một bên!)
        const initDir = isFoulHooked ? -1 : (Math.random() < 0.5 ? -1 : 1);
        this.fightPhase = isFoulHooked
            ? FIGHT_PHASES.RUN_LEFT
            : (Math.random() < 0.65 ? (initDir < 0 ? FIGHT_PHASES.RUN_LEFT : FIGHT_PHASES.RUN_RIGHT) : FIGHT_PHASES.RUN_OUT);
        this.forceBalance = initDir * (isFoulHooked ? 0.32 : 0.16);
        this.playerRodLean = 0.0;
        this.playerRodVert = 0.0;
        this.fightPadVector = { x: 0, y: 0, active: false };
        this.fishPullDir = initDir * 0.45;
        this.fishPullTarget = initDir * 0.65;
        this.fishWeavePhase = Math.random() * Math.PI * 2;
        this.headShakeCooldown = 1.35;
        this.lineCutSpeed = 0;

        this.phaseTimer = 6.2;
        this.phaseGraceTimer = 1.8;
        this.isSantoJumping = false;
        this.santoProgress = 0;
        this.santoCooldown = isFoulHooked ? 1.8 : 2.8;

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
        if (this.floatNightWaterGlow) this.floatNightWaterGlow.visible = false;
        if (this.floatNightPointLight) this.floatNightPointLight.intensity = 0;
        this.rodRestSupport.visible = false;
        this.landingNetGroup.visible = false;
        this.fish3DGroup.visible = true;
        this.waterEntrySpray.visible = true;
        if (this.vWakeGroup) this.vWakeGroup.visible = true;
        if (this.lineCutWakeGroup) this.lineCutWakeGroup.visible = true;
        if (this.fishMudBoil) this.fishMudBoil.visible = (finalWeight >= 2.5);
        this.lastLineCutPos.copy(this.floatTargetPos);
        this.lastTrailSpawnPos.copy(this.floatTargetPos);
        this.wakeTrailSpawnDist = 0;
        this.hardRunScreamCooldown = 1.6;

        // Tiếng cước rít gió bùng lên ngay cú bứt tốc đầu tiên khi cá dính lưỡi phóng đi!
        if (soundManager.playHardRunScream && (finalWeight >= 1.8 || isFoulHooked)) {
            const firstSurge = THREE.MathUtils.clamp(0.45 + (finalWeight / 12.0) * 0.55 + (isFoulHooked ? 0.25 : 0), 0.45, 1.25);
            soundManager.playHardRunScream(firstSurge, finalWeight);
        }

        const fScale = THREE.MathUtils.clamp(0.7 + this.hookedFish.weight / 14.0, 0.8, 1.75);
        this.fish3DGroup.scale.set(fScale, fScale, fScale);
        this.setFightFishModel(this.hookedFish.speciesKey, this.hookedFish.weight, !!this.hookedFish.isTaggedPrize);
    }

    hideAllWaterSpray() {
        if (this.lineCutWakeGroup) this.lineCutWakeGroup.visible = false;
        if (this.fishMudBoil) this.fishMudBoil.visible = false;
        if (this.vWakeGroup) this.vWakeGroup.visible = false;
        if (this.waterEntrySpray) this.waterEntrySpray.visible = false;
        if (this.wakeTrailNodes) {
            this.wakeTrailNodes.forEach(tn => {
                tn.life = 0;
                tn.mesh.visible = false;
            });
        }
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
        this.nguLongCooldown = 7.5;
        this.activeFightSkill = { type: 'NGU_LONG', timer: 1.5, elapsed: 0 };
        const isRunOut = (this.fightPhase === FIGHT_PHASES.RUN_OUT);
        const wNorm = this.fightWeightNorm || 0;
        const skillDrain = THREE.MathUtils.lerp(0.11, 0.032, wNorm) * (isRunOut ? 1.15 : 0.75);
        this.lineTension = Math.max(0.26, this.lineTension - (isRunOut ? 0.26 : 0.16));
        this.fishStamina = Math.max(0.04, this.fishStamina - skillDrain);
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
        this.haNguCooldown = 8.5;
        this.activeFightSkill = { type: 'HA_NGU', timer: 1.6, elapsed: 0 };
        const isRunOut = (this.fightPhase === FIGHT_PHASES.RUN_OUT);
        const wNorm = this.fightWeightNorm || 0;
        this.lineTension = Math.max(0.22, this.lineTension - (isRunOut ? 0.34 : 0.22));
        this.fishStamina = Math.max(0.04, this.fishStamina - THREE.MathUtils.lerp(0.09, 0.028, wNorm));
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
        this.fishStamina = Math.max(0.04, this.fishStamina - THREE.MathUtils.lerp(0.12, 0.04, this.fightWeightNorm || 0));
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
        if (this.fishStamina <= 0.08) {
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
            if (soundManager.playHardRunScream && this.hookedFish) {
                soundManager.playHardRunScream(1.05, this.hookedFish.weight || 4.0);
            }
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
        if (soundManager.playHardRunScream && this.hookedFish) {
            const surge = THREE.MathUtils.clamp(0.55 + (this.hookedFish.fightPower || 0.5) * 0.55, 0.5, 1.2);
            soundManager.playHardRunScream(surge, this.hookedFish.weight || 3.5);
        }
        this.bendVelocity += 1.4;
    }

    // Nhận vector 2 chiều liên tục từ Nút Hình Tròn Ghì & Bo Cá (x: -1 Trái .. +1 Phải, y: +1 Ghì Lên .. -1 Hạ Nhả)
    setFightPadInput(x = 0, y = 0, active = false) {
        this.fightPadVector = {
            x: THREE.MathUtils.clamp(Number(x) || 0, -1, 1),
            y: THREE.MathUtils.clamp(Number(y) || 0, -1, 1),
            active: !!active
        };
    }

    updateFight(delta, keys) {
        if (this.state !== FISHING_STATES.FIGHTING || !this.hookedFish) return null;
        if (this.isNettingAnim) return { finished: false };

        this.syncSeatAnchorFromCamera();
        this.fightElapsedTime = (this.fightElapsedTime || 0) + delta;
        const wNorm = this.fightWeightNorm || 0;

        if (this.nguLongCooldown > 0) this.nguLongCooldown = Math.max(0, this.nguLongCooldown - delta);
        if (this.haNguCooldown > 0) this.haNguCooldown = Math.max(0, this.haNguCooldown - delta);

        const power = this.hookedFish.fightPower;
        const pad = this.fightPadVector || { x: 0, y: 0, active: false };
        const kbX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        const kbY = ((keys.forward || (!pad.active && keys.isMouseDown)) ? 1 : 0) - (keys.backward ? 1 : 0);

        const leanInput = pad.active ? THREE.MathUtils.clamp(pad.x + kbX, -1, 1) : kbX;
        const vertInput = pad.active ? THREE.MathUtils.clamp(pad.y + kbY, -1, 1) : kbY;

        const keyUp = vertInput > 0.22;
        const keyDown = vertInput < -0.22;
        const keyLeft = leanInput < -0.22;
        const keyRight = leanInput > 0.22;

        // ==================== CƠ CHẾ BO CẦN 4 HƯỚNG (TRÁI / PHẢI / LÊN / XUỐNG) & VẠCH CÂN BẰNG ====================
        this.playerRodLean += (leanInput - this.playerRodLean) * Math.min(1.0, delta * 8.4);
        this.playerRodVert = (this.playerRodVert || 0) + (vertInput - (this.playerRodVert || 0)) * Math.min(1.0, delta * 8.4);
        this.fishWeavePhase += delta * (1.55 + power * 1.15);

        if (this.stakeHazard) {
            this.fishPullTarget = (this.stakeHazard.side === 'LEFT' ? -0.92 : 0.92);
        } else if (this.fightPhase === FIGHT_PHASES.RUN_LEFT) {
            this.fishPullTarget = -(0.54 + power * 0.28) + Math.sin(this.fishWeavePhase * 1.3) * 0.12;
        } else if (this.fightPhase === FIGHT_PHASES.RUN_RIGHT) {
            this.fishPullTarget = +(0.54 + power * 0.28) + Math.sin(this.fishWeavePhase * 1.3) * 0.12;
        } else if (this.fightPhase === FIGHT_PHASES.RUN_OUT) {
            this.fishPullTarget = Math.sin(this.fishWeavePhase) * (0.42 + power * 0.18);
        } else if (this.fightPhase === FIGHT_PHASES.UNDER_PIER || this.fightPhase === FIGHT_PHASES.PIN_SURFACE) {
            this.fishPullTarget = Math.sin(this.fishWeavePhase * 0.75) * 0.20;
        } else {
            this.fishPullTarget = 0;
        }
        this.fishPullDir += (this.fishPullTarget - this.fishPullDir) * Math.min(1.0, delta * 3.4);

        // Cập nhật vị trí kim Vạch Cân Bằng Lực (-1.0 Trái .. 0.0 Giữa Xanh .. +1.0 Phải):
        // Cá kéo sang hướng fishPullDir -> Người chơi nghiêng cần hướng ngược lại để kéo vạch về Vùng Xanh Giữa [-0.36, +0.36]!
        const fishDrift = this.fishPullDir * (0.56 + power * 0.24);
        const playerPush = leanInput * 1.18;
        const skillCenterAssist = (this.activeFightSkill && this.activeFightSkill.timer > 0) ? (-this.forceBalance * 2.6) : 0;
        const naturalDamping = -this.forceBalance * (this.fightPhase === FIGHT_PHASES.TAP_TO_NET ? 3.5 : 0.24);
        this.forceBalance = THREE.MathUtils.clamp(
            this.forceBalance + (fishDrift + playerPush + skillCenterAssist + naturalDamping) * delta,
            -1.0,
            1.0
        );

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
                if (soundManager.playHardRunScream && this.hookedFish) {
                    soundManager.playHardRunScream(1.30, this.hookedFish.weight || 5.0);
                }
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
                    this.fishStamina = Math.max(0.04, this.fishStamina - THREE.MathUtils.lerp(0.14, 0.045, wNorm));
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

            // Tốc độ bào sức cá tỉ lệ chuẩn theo cân nặng (Rô phi ~9-12s, cá vừa ~20-30s, cá củ ~40-48s, HUGO ~55-60s tối đa 1 phút!)
            const expectedRunSec = Math.max(7.5, this.expectedRunSeconds || 22.0);
            const optimalDrainRate = (0.92 / expectedRunSec) * rodDrainMul;

            // Độ bền cần câu (0–100%): Chỉ hao mòn đáng kể khi để dây căng đỏ (> 82%) hoặc quá tải nặng!
            if (this.rigConfig && (this.lineTension > 0.82 || (fishW > rodLimit * 1.35 && this.lineTension > 0.70))) {
                const curDur = typeof this.rigConfig.rodDurability === 'number' ? this.rigConfig.rodDurability : 100;
                const wearRate = (this.lineTension > 0.88 ? 2.4 : 0.85) * (fishW > rodLimit ? 1.35 : 1.0);
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
            const absBal = Math.abs(this.forceBalance);
            const inSweetSpot = absBal <= 0.36;
            const inDangerEdge = absBal >= 0.74;

            // Nhịp Cá Lắc Đầu Giật Cục & Đập Đuôi Động Nước (Head-Shake Jolt)
            this.headShakeCooldown -= delta;
            if (this.headShakeCooldown <= 0) {
                this.headShakeCooldown = 1.55 + Math.random() * 1.15;
                this.headShakeImpulse = 0.75 + power * 0.45;
                this.bendVelocity += 1.6 + power * 1.2;
                const joltDir = this.fishPullDir !== 0 ? Math.sign(this.fishPullDir) : (Math.random() < 0.5 ? -1 : 1);
                this.forceBalance = THREE.MathUtils.clamp(this.forceBalance + joltDir * 0.09, -1.0, 1.0);
                soundManager.playHeadShake(0.55 + power * 0.75);
                if (this.fish3DGroup && this.fish3DGroup.visible) {
                    const fp = this.fish3DGroup.position;
                    this.bubbleSystem.spawnRipple(fp.x, fp.z, 1.35 + power * 0.5);
                    this.spawnWaterSprayBurst(fp.x, fp.z, 7, 2.5, 1.5);
                }
            }

            // Vật lý vị trí ngang của cá theo hướng chạy & góc đảo cần của cần thủ
            this.fishLateralX = THREE.MathUtils.clamp(
                this.fishLateralX + (this.fishPullDir * (0.88 + power * 0.32) + this.playerRodLean * 0.82) * delta,
                -4.2,
                4.2
            );

            // KỸ THUẬT HẠ CẦN NHẢ LỰC (KÉO XUỐNG ▼): Khi cước căng cao (>72%) hoặc cá nhảy Santo, hạ đọt cần giúp xả căng tức thì!
            if (keyDown) {
                const dropStrength = Math.abs(vertInput);
                this.lineTension = Math.max(0.24, this.lineTension - (0.28 + dropStrength * 0.14) * delta);
                this.fishDistance = Math.min(12.0, this.fishDistance + 0.34 * delta);
                if (this.isSantoJumping || this.lineTension > 0.65) {
                    isCounteringCorrectly = true;
                }
                actionFeedback = this.isSantoJumping
                    ? '🌊 HẠ CẦN CHỐNG SANTO CHUẨN! Xả sốc dây thành công!'
                    : '⬇️ Đang hạ cần nhả lực — Dây cước dịu nhanh chống nổ thẻo!';
            } else if (this.lineTension > 0.80 && keyUp) {
                // Cước đã căng đỏ (>80%) mà vẫn cố kéo ghì lên mạnh -> nguy cơ nổ thẻo cao hơn, nhắc người chơi hạ cần nhả lực!
                this.lineTension += 0.085 * Math.max(0.4, vertInput) * delta;
            }

            if (!keyDown && this.fightPhase === FIGHT_PHASES.RUN_OUT) {
                const pullScale = keyUp ? (0.72 + 0.36 * Math.max(0.25, vertInput)) : 0;
                if (inSweetSpot && keyUp) {
                    isCounteringCorrectly = true;
                    this.fishStamina -= optimalDrainRate * pullScale * delta;
                    this.fishDistance = Math.max(2.3, this.fishDistance - THREE.MathUtils.lerp(0.62, 0.24, wNorm) * pullScale * delta);
                    if (this.lineTension <= 0.80) {
                        this.lineTension += (0.52 - this.lineTension) * delta * 3.6;
                    }
                    actionFeedback = '✅ CÂN BẰNG LỰC CHUẨN + GHÌ LÊN ▲! Cá đang mỏi dần!';
                } else if (inSweetSpot) {
                    isCounteringCorrectly = true;
                    this.fishStamina -= optimalDrainRate * 0.65 * delta;
                    this.fishDistance = Math.min(11.5, this.fishDistance + 0.10 * delta);
                    this.lineTension += (0.46 - this.lineTension) * delta * 3.0;
                    actionFeedback = '⚖️ Cân bằng tốt!';
                } else if (inDangerEdge) {
                    this.fishStamina -= optimalDrainRate * 0.18 * delta;
                    this.fishDistance = Math.min(12.0, this.fishDistance + (0.55 + power * 0.25) * delta);
                    this.lineTension += (tensionClimbRate * 1.55 + 0.05) * delta;
                    actionFeedback = '🚨 LỆCH CÂN BẰNG NẶNG!';
                } else {
                    this.fishStamina -= optimalDrainRate * (keyUp ? 0.50 : 0.28) * delta;
                    this.fishDistance = Math.min(11.5, this.fishDistance + (keyUp ? -0.12 : 0.30) * delta);
                    this.lineTension += tensionClimbRate * 0.75 * delta;
                    actionFeedback = '⚖️ Đang giằng co lực...';
                }
            } else if (!keyDown && (this.fightPhase === FIGHT_PHASES.RUN_LEFT || this.fightPhase === FIGHT_PHASES.RUN_RIGHT)) {
                const isActivelyCounterLeaning = (this.forceBalance < -0.20 && keyRight) || (this.forceBalance > 0.20 && keyLeft);
                if (inSweetSpot) {
                    isCounteringCorrectly = true;
                    const liftMul = keyUp ? 1.12 : 0.90;
                    this.fishStamina -= optimalDrainRate * liftMul * delta;
                    this.fishDistance = Math.max(2.3, this.fishDistance - THREE.MathUtils.lerp(0.58, 0.22, wNorm) * (keyUp ? 1.0 : 0.7) * delta);
                    if (this.lineTension <= 0.80) {
                        this.lineTension += ((keyUp ? 0.52 : 0.45) - this.lineTension) * delta * 3.8;
                    }
                    actionFeedback = '🎯 CÂN BẰNG LỰC HOÀN HẢO!';
                } else if (isActivelyCounterLeaning) {
                    isCounteringCorrectly = true;
                    this.fishStamina -= optimalDrainRate * 0.76 * delta;
                    this.fishDistance = Math.max(2.3, this.fishDistance - THREE.MathUtils.lerp(0.32, 0.14, wNorm) * delta);
                    if (this.lineTension <= 0.80) {
                        this.lineTension += (0.56 - this.lineTension) * delta * 3.0;
                    }
                    actionFeedback = '✊ Đang mở bát ghì cần dìu đầu cá!';
                } else if (inDangerEdge) {
                    this.fishStamina -= optimalDrainRate * 0.18 * delta;
                    this.fishDistance = Math.min(12.0, this.fishDistance + (0.48 + power * 0.25) * delta);
                    this.lineTension += (tensionClimbRate * 1.65 + 0.055) * delta;
                    actionFeedback = '🚨 CẦN ĐANG BỊ LÔI THẲNG!';
                } else {
                    this.fishStamina -= optimalDrainRate * 0.32 * delta;
                    this.lineTension += tensionClimbRate * 0.90 * delta;
                    actionFeedback = '⚖️ Đang giằng co ngang...';
                }
            }

            // Trần thời gian bo tối đa cho cá HUGO là 1 phút (60 giây): Từ giây 54 trở đi cá kiệt sức hẳn để kịp ngửa bụng ở mốc <= 60s!
            if (this.fightElapsedTime >= 54.0) {
                this.fishStamina -= 0.18 * delta;
            }
            if (this.fightElapsedTime >= 58.5) {
                this.fishStamina = Math.min(this.fishStamina, 0.06);
            }

            if (this.fishStamina <= 0.08) {
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
                    this.fishStamina = Math.max(0.05, this.fishStamina - THREE.MathUtils.lerp(0.12, 0.04, wNorm));
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
            this.fishStamina = Math.max(0.0, this.fishStamina - 0.03 * delta);
            this.fishLateralX += (0 - this.fishLateralX) * delta * 2.5;
            this.fishDistance += (2.35 - this.fishDistance) * delta * 2.2;
            const surfRate = this.fightElapsedTime >= 59.0 ? 0.95 : THREE.MathUtils.lerp(0.50, 0.175, wNorm);

            if (keyUp || this.fightElapsedTime >= 60.0) {
                isCounteringCorrectly = true;
                this.surfaceProgress = Math.min(1.0, this.surfaceProgress + surfRate * delta);
                this.lineTension += (0.56 - this.lineTension) * delta * 4.0;
                actionFeedback = `🌊 Đang ghì cá nổi lên mặt nước... (${Math.round(this.surfaceProgress * 100)}%)`;

                if (this.surfaceProgress >= 1.0 || this.fightElapsedTime >= 60.5) {
                    this.surfaceProgress = 1.0;
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
            runIntensity + Math.abs(this.forceBalance) * 0.25,
            this.hookedFish ? this.hookedFish.weight : 3.0,
            soundPhase,
            this.lineCutSpeed || 0
        );

        // Tiếng cước xé mặt nước ("xèèè") liên tục đồng bộ với tốc độ cá chạy rẽ nước & độ căng cước
        if (soundManager.updateWaterCutLoop) {
            const cutNorm = THREE.MathUtils.clamp((this.lineCutSpeed / 2.6) + (isFastRun ? 0.35 : 0.08), 0, 1);
            const splashy = this.isSantoJumping ? 1.0 : (this.headShakeImpulse * 0.6 + this.lineTension * 0.35);
            soundManager.updateWaterCutLoop(cutNorm, splashy);
        }

        // Bùng tiếng cước rít gió cao vút ("VÚÚÚT... ZÍÍÍTTT!") mỗi khi cá bứt tốc chạy rẽ nước nhanh hoặc kéo căng cước
        this.hardRunScreamCooldown = Math.max(0, (this.hardRunScreamCooldown || 0) - delta);
        if (
            this.hardRunScreamCooldown <= 0 &&
            soundManager.playHardRunScream &&
            isFastRun &&
            (this.lineCutSpeed > 1.35 || (this.lineTension > 0.74 && !isCounteringCorrectly))
        ) {
            const w = this.hookedFish ? (this.hookedFish.weight || 3.5) : 3.5;
            const burstInt = THREE.MathUtils.clamp(0.55 + (this.lineCutSpeed / 3.2) * 0.5 + this.lineTension * 0.3, 0.55, 1.35);
            soundManager.playHardRunScream(burstInt, w);
            this.hardRunScreamCooldown = 2.35 + Math.random() * 0.95;
        }

        // Thêm tiếng rít xé nước đột ngột khi cá phi cực gắt hoặc mất cân bằng cước căng > 70%
        if (this.singSoundCooldown <= 0 && (this.lineTension > 0.70 || Math.abs(this.forceBalance) > 0.68 || (isFastRun && !isCounteringCorrectly))) {
            soundManager.playLineSing(this.lineTension, isFastRun);
            this.singSoundCooldown = isFastRun ? 0.32 : 0.44;
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
            stakeHazard: this.stakeHazard,
            forceBalance: this.forceBalance,
            playerRodLean: this.playerRodLean,
            fishPullDir: this.fishPullDir
        };
    }

    updateFish3DPosition(delta) {
        if (!this.fish3DGroup) return;

        // Neo tọa độ cá theo đúng hướng ghế ngồi bến câu (không bị trôi khi Camera lùi ra góc nhìn thứ 3!)
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();
        if (this.hasSeatAnchor) {
            forward.copy(this.seatForward);
            right.copy(this.seatRight);
        } else {
            this.camera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();
            right.set(-forward.z, 0, forward.x);
        }
        const seatOrigin = this.hasSeatAnchor ? this.seatEyePos : this.camera.position;

        const fishWorldPos = new THREE.Vector3()
            .copy(seatOrigin)
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
                this.spawnWaterSprayBurst(fishWorldPos.x, fishWorldPos.z, 16, 3.8, 2.3);
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
                this.spawnWaterSprayBurst(fishWorldPos.x, fishWorldPos.z, 22, 4.4, 2.9);
                this.bendVelocity += 2.8;
            } else {
                // Quỹ đạo vọt cao 1.25m trên mặt nước
                jumpArcY = Math.sin(this.santoProgress * Math.PI) * 1.25;
                if (Math.random() < 0.45) {
                    this.spawnWaterSprayBurst(fishWorldPos.x, fishWorldPos.z, 2, 1.8, 1.2);
                }
            }
        }

        this.lastJumpArcY = jumpArcY;

        // Độ sâu chân thực: Khi cá còn khỏe cá ghì sâu dưới nước (-0.20m..-0.09m) tạo xoáy động nước, khi mệt mới nổi dần lên mặt hồ
        const submergeByStamina = -0.20 + (1.0 - this.fishStamina) * 0.12;
        const depthY = this.isSantoJumping
            ? (0.08 + jumpArcY)
            : (submergeByStamina + this.surfaceProgress * 0.14);
        fishWorldPos.y = depthY;

        // Tính vector vận tốc chạy rẽ nước để xoay vệt sóng chữ V (V-Wake)
        const moveDx = fishWorldPos.x - this.lastFishWorldPos.x;
        const moveDz = fishWorldPos.z - this.lastFishWorldPos.z;
        const stepDist = Math.hypot(moveDx, moveDz);
        const moveSpeed = stepDist / Math.max(0.001, delta);
        this.lastFishWorldPos.copy(fishWorldPos);

        this.fish3DGroup.position.copy(fishWorldPos);
        this.fish3DGroup.visible = true;

        const fishW = this.hookedFish ? (this.hookedFish.weight || 3.0) : 3.0;
        const weightWakeMul = THREE.MathUtils.clamp(0.82 + (fishW / 14.0) * 0.68, 0.82, 1.55);

        if (this.waterEntrySpray) {
            this.waterEntrySpray.position.set(fishWorldPos.x, 0.020, fishWorldPos.z);
            const s = (this.isSantoJumping ? 1.65 : (0.90 + Math.min(0.85, moveSpeed * 0.26))) * weightWakeMul + Math.sin(performance.now() * 0.032) * 0.18;
            this.waterEntrySpray.scale.set(s, s, 1);
            this.waterEntrySpray.visible = true;
        }

        // Quầng bùn & nước cuộn sục lên từ đáy hồ khi chép cụ / trắm đen quẫy mạnh
        if (this.fishMudBoil) {
            const showBoil = !this.isSantoJumping && this.hookedFish && this.hookedFish.weight >= 2.2 && this.fightPhase !== FIGHT_PHASES.TAP_TO_NET;
            this.fishMudBoil.visible = showBoil;
            if (showBoil) {
                this.fishMudBoil.position.set(fishWorldPos.x, 0.007, fishWorldPos.z);
                const boilScale = (0.95 + (this.hookedFish.weight / 14.0) * 0.75) * (0.92 + Math.sin(performance.now() * 0.018) * 0.14);
                this.fishMudBoil.scale.set(boilScale, boilScale, 1);
            }
        }

        // Cập nhật Vệt Sóng Kelvin Chữ V Cá Chạy Rẽ Nước Đa Tầng & Dải Bọt Trắng Lưu Dấu Trên Mặt Hồ
        const baseYaw = Math.atan2(forward.x, forward.z);
        let wakeYaw = baseYaw;
        if (moveSpeed > 0.28) wakeYaw = Math.atan2(moveDx, moveDz);
        else if (this.fightPhase === FIGHT_PHASES.RUN_LEFT) wakeYaw = baseYaw + Math.PI / 2;
        else if (this.fightPhase === FIGHT_PHASES.RUN_RIGHT) wakeYaw = baseYaw - Math.PI / 2;

        if (this.vWakeGroup) {
            const showVWake = !this.isSantoJumping && (this.fightPhase !== FIGHT_PHASES.TAP_TO_NET);
            this.vWakeGroup.visible = showVWake;
            this.vWakeGroup.position.set(fishWorldPos.x, 0.016, fishWorldPos.z);
            this.vWakeGroup.rotation.y = wakeYaw;

            const wakePulse = 0.94 + Math.sin(performance.now() * 0.030) * 0.14;
            const speedWidth = (0.88 + Math.min(0.55, moveSpeed * 0.16)) * weightWakeMul * wakePulse;
            const speedLength = (0.95 + Math.min(1.45, moveSpeed * 0.38)) * (0.88 + weightWakeMul * 0.22);
            this.vWakeGroup.scale.set(speedWidth, 1.0, speedLength);

            if (this.bowCrestMesh) {
                const bowH = 0.75 + Math.min(1.35, moveSpeed * 0.36) * weightWakeMul;
                this.bowCrestMesh.scale.set(1.0, bowH, 1.0);
            }
        }

        // Sinh & cập nhật Dải Bọt Sóng Lưu Dấu Quỹ Đạo Cá Chạy (24 Nodes nở rộng & tan dần tự nhiên trên mặt nước!)
        if (this.wakeTrailNodes) {
            if (!this.isSantoJumping && this.fightPhase !== FIGHT_PHASES.TAP_TO_NET && stepDist < 2.5) {
                this.wakeTrailSpawnDist += stepDist + (moveSpeed > 0.45 ? delta * 0.35 : 0);
                if (this.wakeTrailSpawnDist >= 0.24) {
                    this.wakeTrailSpawnDist = 0;
                    for (let i = 0; i < this.wakeTrailNodes.length; i++) {
                        const tn = this.wakeTrailNodes[i];
                        if (tn.life <= 0) {
                            tn.maxLife = 1.15 + Math.min(0.55, moveSpeed * 0.16);
                            tn.life = tn.maxLife;
                            tn.baseScale = (0.68 + Math.min(0.65, moveSpeed * 0.18)) * weightWakeMul;
                            tn.mesh.position.set(
                                fishWorldPos.x + (Math.random() - 0.5) * 0.08,
                                0.013 + (i % 4) * 0.0005,
                                fishWorldPos.z + (Math.random() - 0.5) * 0.08
                            );
                            tn.mesh.rotation.z = -wakeYaw + (Math.random() - 0.5) * 0.25;
                            tn.mesh.scale.set(tn.baseScale, tn.baseScale * 1.15, 1);
                            tn.mat.opacity = 0.72;
                            tn.mesh.visible = true;
                            break;
                        }
                    }
                }
            }

            for (let i = 0; i < this.wakeTrailNodes.length; i++) {
                const tn = this.wakeTrailNodes[i];
                if (tn.life > 0) {
                    tn.life -= delta;
                    if (tn.life <= 0) {
                        tn.life = 0;
                        tn.mesh.visible = false;
                    } else {
                        const age = 1.0 - (tn.life / tn.maxLife); // 0 -> 1
                        const spreadX = tn.baseScale * (1.0 + age * 1.45);
                        const spreadY = tn.baseScale * (1.15 + age * 0.85);
                        tn.mesh.scale.set(spreadX, spreadY, 1);
                        tn.mat.opacity = Math.pow(1.0 - age, 1.45) * 0.68;
                    }
                }
            }
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
            const nowMs = performance.now();
            const tailSpeed = this.isSantoJumping ? 0.055 : ((this.fightPhase === FIGHT_PHASES.TAP_TO_NET) ? 0.006 : 0.032);
            const beat = Math.sin(nowMs * tailSpeed);
            this.fishTailMesh.rotation.y = beat * (this.isSantoJumping ? 0.72 : 0.54);
            // Uốn lắc toàn thân ngược pha nhẹ với cuống đuôi tạo sóng bơi S-wave cực sống động
            if (this.fishHolderGroup) {
                const bodyAmp = (this.fightPhase === FIGHT_PHASES.TAP_TO_NET) ? 0.03 : 0.14;
                this.fishHolderGroup.rotation.y = Math.PI - beat * bodyAmp;
            }
            if (this.fishLeftFin && this.fishRightFin) {
                const finBeat = Math.sin(nowMs * (tailSpeed * 0.85) + 0.8) * 0.28;
                this.fishLeftFin.rotation.y = 0.26 + finBeat;
                this.fishRightFin.rotation.y = -0.26 - finBeat;
            }
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
        if (this.floatNightWaterGlow) this.floatNightWaterGlow.visible = false;
        if (this.floatNightPointLight) this.floatNightPointLight.intensity = 0;
        this.fishingLine.visible = false;
        this.fish3DGroup.visible = false;
        this.waterEntrySpray.visible = false;
        if (this.vWakeGroup) this.vWakeGroup.visible = false;
        this.hideAllWaterSpray();
        this.landingNetGroup.visible = false;
        this.rodRestSupport.visible = true;
        this.isNettingAnim = false;
        this.addFishToKeepnetVisual(resultFish.speciesKey || 'CARP', resultFish.weight || 3.5);

        return {
            success: true,
            fish: resultFish
        };
    }

    // Thả thêm mô hình Cá 3D bơi lấp ló bên trong Rọng Cá Ngâm Nước góc trái sau khi hớt vợt thành công
    addFishToKeepnetVisual(speciesKey = 'CARP', weight = 3.5) {
        if (!this.keepnetFishContainer) return;
        // Hiển thị tối đa 4 con cá tiêu biểu trong lòng rọng để mượt 60 FPS
        if (this.keepnetFishList.length >= 4) {
            const oldest = this.keepnetFishList.shift();
            if (oldest && oldest.mesh) this.keepnetFishContainer.remove(oldest.mesh);
        }
        const idx = this.keepnetFishList.length;
        const fishMesh = buildRealisticFish(speciesKey, weight, { noScale: true });
        const sc = THREE.MathUtils.clamp(0.22 + (weight / 18.0) * 0.14, 0.20, 0.36);
        fishMesh.scale.setScalar(sc);
        fishMesh.position.set(0, -0.04 - idx * 0.055, 0);
        this.keepnetFishContainer.add(fishMesh);
        this.keepnetFishList.push({
            mesh: fishMesh,
            tailPivot: fishMesh.userData ? fishMesh.userData.tailPivot : null,
            phase: Math.random() * Math.PI * 2,
            speed: 1.4 + Math.random() * 0.9,
            depthOffset: -0.03 - idx * 0.055
        });
    }

    clearKeepnetVisuals() {
        if (!this.keepnetFishContainer) return;
        while (this.keepnetFishContainer.children.length > 0) {
            this.keepnetFishContainer.remove(this.keepnetFishContainer.children[0]);
        }
        this.keepnetFishList = [];
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

        // 0. Đồng bộ mỏ neo ghế ngồi từ Camera (do PlayerController vừa cập nhật đầu frame) & Nội suy góc nhìn thứ 3 (TPV)
        this.syncSeatAnchorFromCamera();
        const isFightingNow = (this.state === FISHING_STATES.FIGHTING && !!this.hookedFish);
        const targetTpv = isFightingNow ? 1.0 : 0.0;
        const tpvRate = targetTpv > this.tpvBlend ? Math.min(1, delta * 3.8) : Math.min(1, delta * 4.6);
        this.tpvBlend += (targetTpv - this.tpvBlend) * tpvRate;
        if (Math.abs(targetTpv - this.tpvBlend) < 0.002) {
            this.tpvBlend = targetTpv;
        }
        if (this.tpvBlend <= 0.002) {
            this.tpvCamInitialized = false;
        }

        // Giữ fpvRig cố định ngay tại ghế bến câu (phẳng ngang mặt sàn bê tông khi chuyển sang TPV)
        this.fpvRig.position.copy(this.seatEyePos);
        this.fpvRig.quaternion.copy(this.seatBaseQuat).slerp(this.seatLevelQuat, this.tpvBlend);

        // Dịch gọn Ô Che Nắng sang rìa trái bến khi bo cá để không che khuất góc nhìn thứ 3 từ sau lưng
        if (this.umbrellaGroup) {
            this.umbrellaGroup.position.set(-1.38 * this.tpvBlend, 0, 0.38 * this.tpvBlend);
        }
        if (this.landingNetGroup) {
            this.landingNetGroup.rotation.x = -0.44 * this.tpvBlend;
            this.landingNetGroup.position.y = -0.05 * this.tpvBlend;
        }
        if (this.fpvArmGroup) {
            this.fpvArmGroup.visible = (this.tpvBlend < 0.22);
        }
        if (this.tpvAnglerGroup) {
            this.tpvAnglerGroup.visible = (this.tpvBlend >= 0.14);
        }

        // Đồng bộ màu nước & độ đục thực tế vào Shader cắt mặt nước của Phao Đài
        if (this.environment && this.floatShaderUniforms) {
            this.floatShaderUniforms.uWaterTint.value.copy(this.environment.currentWaterColor).multiplyScalar(0.65);
            const turbidity = this.environment.waterTurbidity || 0.18;
            // Nước mưa đục phù sa làm bầu phao khuất nhanh hơn (2.4cm), nước nắng trong xanh nhìn sâu hơn (3.8cm)
            this.floatShaderUniforms.uSubmergeDepth.value = THREE.MathUtils.lerp(0.038, 0.024, turbidity);
        }

        // 1. Cập nhật đường cong Parabol liền mạch của thân cần câu đài & chuyển động khớp lò xo Ô Che Nắng
        this.applyArticulatedRodPose(delta);

        // 1A. Diễn hoạt vật lý Nhân Vật Cần Thủ 3D (Đứng tấn ghì cần, ngả lưng, xoay hông mở bát Trái/Phải & 2 tay ôm cán cần!)
        if (this.tpvAnglerGroup && this.tpvAnglerGroup.visible && this.tpvAnglerGroup.userData) {
            const bones = this.tpvAnglerGroup.userData;
            const lean = isFightingNow ? (this.playerRodLean || 0) : 0;
            const vert = isFightingNow ? (this.playerRodVert || 0) : 0;
            const tension = isFightingNow ? (this.lineTension || 0.4) : 0.2;
            const jolt = isFightingNow ? (this.headShakeImpulse || 0) * Math.sin(performance.now() * 0.048) * 0.035 : 0;
            const isHaNgu = !!(this.activeFightSkill && this.activeFightSkill.type === 'HA_NGU');

            // Bước chân & dồn trọng tâm hông sang Trái / Phải theo hướng người chơi bo cá
            this.tpvAnglerGroup.position.set(
                0.02 + lean * 0.18,
                -0.86 - Math.max(0, tension - 0.5) * 0.04,
                -0.02 + Math.max(0, vert) * 0.06
            );
            this.tpvAnglerGroup.rotation.y = Math.PI - lean * 0.26;

            // Thân trên: Ngả lưng ra sau vững chãi khi Ghì Lên (+vert), cúi dìm đọt khi Hạ Nhả (-vert / Hạ Ngư)
            if (bones.upperBody) {
                const torsoPitch = isHaNgu
                    ? 0.28
                    : (vert >= 0
                        ? (-0.12 - vert * 0.17 - tension * 0.09 + jolt)
                        : (0.04 + Math.abs(vert) * 0.18));
                bones.upperBody.position.set(0, 0.81, 0);
                bones.upperBody.rotation.set(torsoPitch, -lean * 0.20, lean * 0.09);
            }

            // Đầu & mũ lưỡi trai dõi mắt nhìn theo vị trí con cá đang rẽ nước
            if (bones.headGroup) {
                const fishYawTrack = THREE.MathUtils.clamp(-(this.fishLateralX || 0) * 0.075 + lean * 0.22, -0.46, 0.46);
                bones.headGroup.rotation.set(0.16 - vert * 0.08, fishYawTrack, 0);
            }

            // Hai chân đứng tấn vững chãi trên sàn bê tông bến câu (chân trái bước nhẹ lên trước, chân phải trụ sau)
            if (bones.leftLeg && bones.rightLeg) {
                const kneeFlex = 0.22 + tension * 0.12 + Math.abs(lean) * 0.08;
                bones.leftLeg.hipPivot.position.set(0.115, 0.84, 0.04);
                bones.leftLeg.hipPivot.rotation.set(-kneeFlex * 0.68, 0, 0.07 - lean * 0.06);
                bones.leftLeg.kneePivot.rotation.set(kneeFlex * 1.15, 0, 0);

                bones.rightLeg.hipPivot.position.set(-0.115, 0.84, -0.05);
                bones.rightLeg.hipPivot.rotation.set(0.08 - kneeFlex * 0.35, 0, -0.07 - lean * 0.06);
                bones.rightLeg.kneePivot.rotation.set(kneeFlex * 0.95, 0, 0);
            }

            // Khóa 2 bàn tay vào đúng cán cần Carbon (hoặc tay trái cầm cán Vợt Carbon khi cá đã ngửa bụng!)
            this.fpvRig.updateMatrixWorld(true);
            if (bones.upperBody && bones.rightArm && this.rodFrontGripAnchor) {
                const rightTarget = new THREE.Vector3();
                this.rodFrontGripAnchor.getWorldPosition(rightTarget);
                this.solveTwoBoneArmIK(
                    bones.rightArm,
                    bones.upperBody,
                    rightTarget,
                    new THREE.Vector3(-0.48, -0.82, -0.25)
                );
            }
            if (bones.upperBody && bones.leftArm) {
                const leftTarget = new THREE.Vector3();
                if (this.landingNetGroup && this.landingNetGroup.visible && this.landingNetGripAnchor) {
                    this.landingNetGripAnchor.getWorldPosition(leftTarget);
                } else if (this.rodButtGripAnchor) {
                    this.rodButtGripAnchor.getWorldPosition(leftTarget);
                }
                this.solveTwoBoneArmIK(
                    bones.leftArm,
                    bones.upperBody,
                    leftTarget,
                    new THREE.Vector3(0.48, -0.82, -0.25)
                );
            }
        }

        if (this.umbrellaHeadPivot && this.umbrellaGroup && this.umbrellaGroup.visible) {
            const isRain = this.environment && this.environment.weather === 'RAINY';
            const windAmp = isRain ? 0.022 : 0.008;
            const nowS = performance.now() * 0.0018;
            const targetTiltX = this.umbrellaPose === 'TILT' ? 0.34 : 0.04;
            const targetTiltZ = this.umbrellaPose === 'TILT' ? -0.22 : 0.0;
            const lerpU = Math.min(1, delta * 6.5);
            this.umbrellaHeadPivot.rotation.x += (targetTiltX + Math.sin(nowS) * windAmp - this.umbrellaHeadPivot.rotation.x) * lerpU;
            this.umbrellaHeadPivot.rotation.z += (targetTiltZ + Math.cos(nowS * 1.3) * windAmp - this.umbrellaHeadPivot.rotation.z) * lerpU;
        }

        // 1B. Cập nhật Đèn Soi Phao Câu Đêm Kẹp Thùng (Tự bật ánh xanh lam dịu từ 18:00 tối!)
        const isNightNow = this.isNightFloatTime();
        if (this.nightLampBeamMesh && this.nightLampLensMat) {
            const lampOn = isNightNow && (
                this.state === FISHING_STATES.SEATED ||
                this.state === FISHING_STATES.CASTING ||
                this.state === FISHING_STATES.FLOAT_WAIT ||
                this.state === FISHING_STATES.BITING
            );
            this.nightLampBeamMesh.visible = lampOn;
            this.nightLampLensMat.color.setHex(lampOn ? 0x38bdf8 : 0x1e293b);
        }

        // 1C. Cập nhật các Nắm Mồi Xả 3D đang bay vòng cung ra ổ câu
        if (this.groundBaitProjectiles && this.groundBaitProjectiles.length > 0) {
            for (let i = this.groundBaitProjectiles.length - 1; i >= 0; i--) {
                const prj = this.groundBaitProjectiles[i];
                prj.elapsed += delta;
                const p = Math.min(1.0, prj.elapsed / prj.duration);
                prj.mesh.position.lerpVectors(prj.start, prj.end, p);
                prj.mesh.position.y += Math.sin(p * Math.PI) * 1.15;
                prj.mesh.rotation.x += delta * 6.5;
                prj.mesh.rotation.z += delta * 4.2;

                if (p >= 1.0) {
                    this.scene.remove(prj.mesh);
                    soundManager.playWaterSplash(0.88);
                    this.bubbleSystem.spawnRipple(prj.end.x, prj.end.z, 1.35);
                    this.spawnWaterSprayBurst(prj.end.x, prj.end.z, 9, 2.2, 1.35);
                    this.bubbleSystem.addGroundBaitSpot(prj.end.x, prj.end.z, prj.baitData);
                    this.groundBaitProjectiles.splice(i, 1);
                }
            }
        }

        // 1D. Cập nhật đàn Cá 3D bơi lượn & vẫy đuôi bên trong Rọng Cá Ngâm Nước
        if (this.keepnetFishList && this.keepnetFishList.length > 0) {
            const tSec = performance.now() * 0.001;
            for (let i = 0; i < this.keepnetFishList.length; i++) {
                const kf = this.keepnetFishList[i];
                const ang = tSec * kf.speed + kf.phase;
                kf.mesh.position.x = Math.cos(ang) * 0.068;
                kf.mesh.position.z = Math.sin(ang) * 0.068;
                kf.mesh.position.y = kf.depthOffset + Math.sin(ang * 1.7) * 0.014;
                kf.mesh.rotation.y = -ang;
                if (kf.tailPivot) {
                    kf.tailPivot.rotation.y = Math.sin(tSec * 11.0 + kf.phase) * 0.36;
                }
            }
        }

        const fPos = this.floatTargetPos;
        const toCam = new THREE.Vector3()
            .subVectors(this.camera.position, fPos)
            .setY(0)
            .normalize();
        const baseFloatYaw = Math.atan2(toCam.x, toCam.z);

        // 2. CẬP NHẬT VẬT LÝ HẠ THỦY 3 GIAI ĐOẠN & TÍN HIỆU BÁO CÁ CỦA PHAO ĐÀI THÂN BẦU
        if (this.state === FISHING_STATES.CASTING) {
            this.castElapsed += delta;
            this.updateFloatLedGlow(false);
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
                const normDose = this.activeHookBait && typeof this.activeHookBait.normalizedFlavorDose === 'number'
                    ? this.activeHookBait.normalizedFlavorDose
                    : (this.activeHookBait && typeof this.activeHookBait.totalFlavorDrops === 'number' ? this.activeHookBait.totalFlavorDrops : 5);
                const forceOverdose = (this.activeHookBait && typeof this.activeHookBait.isFlavorOverdose === 'boolean')
                    ? this.activeHookBait.isFlavorOverdose
                    : null;
                const waterEffect = BaitMixingSystem.getWaterFlavorEffect(normDose, weather, forceOverdose);
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
            this.updateFloatLedGlow(false);

            // ĐẾM NGƯỢC 5 GIÂY SAU KHI KÍCH MỒI TRÚNG 30%: Đúng 5s cá sẽ vào bấm giữ 2-3 vạch phao!
            if (this.twitchBiteCountdown > 0 && !this.isBareHook) {
                this.twitchBiteCountdown -= delta;
                if (!this.twitchBubbleHintSpawned && this.twitchBiteCountdown <= 1.6) {
                    this.twitchBubbleHintSpawned = true;
                    this.bubbleSystem.spawnCarpBubbles(fPos.x, fPos.z, true, false);
                }
                if (this.twitchBiteCountdown <= 0) {
                    this.twitchBiteCountdown = 0;
                    this.startTwitchHoldBite();
                    return;
                }
            }

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

                // 0. Kịch bản ĐẶC TRƯNG KÍCH MỒI: CÁ BẤM 2-3 VẠCH PHAO & GIỮ NGUYÊN VẠCH 3-5 GIÂY (Giật là lụm 100%, không giật cá nhả mồi!)
                if (s.scenario === 'TWITCH_HOLD') {
                    const depth = s.pressDepth || 0.08;
                    if (stageName === 'PRESS_DOWN') {
                        // Cá hút gọn viên mồi vừa nhử -> phao sập gọn đúng 2-3 vạch!
                        y = eq - depth * k;
                        rotZ = -0.04 * k;
                        s.isTakeWindow = (s.stageTime >= 0.06);
                    } else if (stageName === 'HOLD_BARS') {
                        // Giữ nguyên đứng im ở vạch đã bấm suốt 3-5 giây chờ cần thủ giật!
                        y = eq - depth;
                        rotZ = 0;
                        s.isTakeWindow = true;
                    }
                }
                // 1. Kịch bản: PHAO BỀNH CẢ CỦ (LIFT — Tỷ lệ dính cá 100%!)
                else if (s.scenario === 'LIFT') {
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

        // 3. Cập nhật dây cước trục mảnh nối từ nút dây dù đỏ Lillian đầu cần tới chân phao (hoặc cá) + Vệt cước xé mặt nước
        if (this.fishingLine && this.fishingLine.visible && this.rodRootGroup) {
            this.rodRootGroup.updateMatrixWorld();
            const worldTip = new THREE.Vector3();
            if (this.rodLillianAnchor) {
                this.rodLillianAnchor.getWorldPosition(worldTip);
            } else {
                worldTip.copy(this.rodTipLocalPos);
                this.rodRootGroup.localToWorld(worldTip);
            }

            let endPoint = new THREE.Vector3();
            let sagAmount = 0.045;

            if (this.state === FISHING_STATES.FIGHTING && this.fish3DGroup) {
                endPoint.copy(this.fish3DGroup.position);
                endPoint.y += 0.02;
                sagAmount = Math.max(0.0, (0.55 - this.lineTension) * 0.025);

                // Tính chính xác điểm Dây Cước Cắt Mặt Nước (y = 0) để vẽ vệt bọt trắng xé nước!
                if (this.lineCutWakeGroup) {
                    if (!this.isSantoJumping && worldTip.y > 0.02 && endPoint.y < 0.01) {
                        const denom = Math.max(0.001, worldTip.y - endPoint.y);
                        const tWater = THREE.MathUtils.clamp(worldTip.y / denom, 0.05, 0.98);
                        const cutX = THREE.MathUtils.lerp(worldTip.x, endPoint.x, tWater);
                        const cutZ = THREE.MathUtils.lerp(worldTip.z, endPoint.z, tWater);

                        const cdx = cutX - this.lastLineCutPos.x;
                        const cdz = cutZ - this.lastLineCutPos.z;
                        const instSpeed = Math.hypot(cdx, cdz) / Math.max(0.001, delta);
                        this.lineCutSpeed = THREE.MathUtils.lerp(this.lineCutSpeed, Math.min(8.0, instSpeed), Math.min(1, delta * 8));
                        this.lastLineCutPos.set(cutX, 0.012, cutZ);

                        this.lineCutWakeGroup.visible = true;
                        this.lineCutWakeGroup.position.set(cutX, 0.012, cutZ);
                        if (instSpeed > 0.18) {
                            this.lineCutWakeGroup.rotation.y = Math.atan2(cdx, cdz);
                        }
                        const sScale = 0.78 + Math.min(1.15, this.lineCutSpeed * 0.34) + this.lineTension * 0.28;
                        this.lineCutWakeGroup.scale.set(sScale, 1.0, sScale * 1.22);

                        // Lưỡi nước dựng đứng (Rooster-Tail Spray) bắn vọt cao theo vận tốc cước xé mặt hồ!
                        if (this.lineRoosterTail) {
                            const roosterPower = THREE.MathUtils.clamp(this.lineCutSpeed * (0.45 + this.lineTension * 0.65), 0, 2.4);
                            this.lineRoosterTail.visible = (roosterPower > 0.14);
                            const rH = 0.45 + roosterPower * 0.88;
                            const rLen = 0.65 + roosterPower * 0.55;
                            this.lineRoosterTail.scale.set(rLen, rH, 1.0);
                            this.lineRoosterTail.position.set(0, 0.09 * rH, -0.10 * rLen);
                            this.lineRoosterTail.material.opacity = THREE.MathUtils.clamp(0.32 + roosterPower * 0.38, 0.25, 0.94);
                        }

                        this.lineCutRippleCooldown -= delta;
                        if (this.lineCutRippleCooldown <= 0 && (this.lineCutSpeed > 0.38 || this.lineTension > 0.60)) {
                            this.lineCutRippleCooldown = this.lineCutSpeed > 1.3 ? 0.075 : 0.14;
                            if (this.bubbleSystem.spawnMicroRipple) {
                                this.bubbleSystem.spawnMicroRipple(cutX, cutZ, 1.45);
                            }
                            if (this.lineCutSpeed > 0.65) {
                                const dropCnt = this.lineCutSpeed > 1.8 ? 4 : 2;
                                this.spawnWaterSprayBurst(cutX, cutZ, dropCnt, 1.4 + this.lineCutSpeed * 0.28, 0.85 + this.lineCutSpeed * 0.2);
                            }
                        }
                    } else {
                        this.lineCutWakeGroup.visible = false;
                        this.lineCutSpeed *= 0.85;
                    }
                }
            } else if (this.floatFootAnchor) {
                if (this.lineCutWakeGroup) this.lineCutWakeGroup.visible = false;
                this.floatGroup.updateMatrixWorld();
                endPoint.set(0, 0, 0);
                this.floatFootAnchor.localToWorld(endPoint);
                if (endPoint.y >= 0.001) {
                    sagAmount = 0.010;
                }
            } else {
                if (this.lineCutWakeGroup) this.lineCutWakeGroup.visible = false;
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

        // 4. CHUYỂN ĐỔI MƯỢT MÀ CAMERA SANG GÓC NHÌN THỨ 3 ĐIỆN ẢNH KHI BO CÁ (OVER-THE-SHOULDER 3RD-PERSON ACTION CAM)
        if (this.tpvBlend > 0.001) {
            const lean = isFightingNow ? (this.playerRodLean || 0) : 0;
            const vert = isFightingNow ? (this.playerRodVert || 0) : 0;
            const fishDist = isFightingNow ? THREE.MathUtils.clamp(this.fishDistance || 5.5, 2.0, 12.5) : 5.5;
            const fishLat = isFightingNow ? (this.fishLateralX || 0) : 0;
            const jumpY = isFightingNow ? (this.lastJumpArcY || 0) : 0;

            // Đặt Camera chếch sau vai phải trên cao (~2.08m), nhìn bao quát cả Cần Thủ 3D đứng bo cần, cây cần cong chữ C và vệt cá chạy rẽ nước!
            this.tpvCamPos
                .copy(this.seatEyePos)
                .addScaledVector(this.seatForward, -2.42 + vert * 0.14)
                .addScaledVector(this.seatRight, 1.18 + lean * 0.26);
            this.tpvCamPos.y = this.seatEyePos.y + 0.84 - vert * 0.06;

            // Điểm hội tụ ánh nhìn giữa thân cần đang uốn cong và vị trí cá quẫy rẽ nước trước bến
            const lookForwardDist = 2.55 + fishDist * 0.36;
            const lookLateral = fishLat * 0.44 + lean * 0.16;
            this.tpvLookTarget
                .copy(this.seatEyePos)
                .addScaledVector(this.seatForward, lookForwardDist)
                .addScaledVector(this.seatRight, lookLateral);
            this.tpvLookTarget.y = 0.42 + jumpY * 0.42 + Math.max(0, vert) * 0.14;

            if (!this.tpvCamInitialized) {
                this.smoothedTpvCamPos.copy(this.tpvCamPos);
                this.smoothedTpvLook.copy(this.tpvLookTarget);
                this.tpvCamInitialized = true;
            } else {
                const followRate = Math.min(1.0, delta * 6.8);
                this.smoothedTpvCamPos.lerp(this.tpvCamPos, followRate);
                this.smoothedTpvLook.lerp(this.tpvLookTarget, followRate);
            }

            // Rung chấn vật lý chân thực lên ống kính khi cá quẫy lắc đầu mạnh hoặc dây căng đỏ > 80%
            const shakeAmp = isFightingNow
                ? ((this.headShakeImpulse || 0) * 0.016 + Math.max(0, (this.lineTension || 0) - 0.78) * 0.028)
                : 0;
            const camFinalTpv = this.smoothedTpvCamPos.clone();
            if (shakeAmp > 0.0005) {
                const tNow = performance.now() * 0.042;
                camFinalTpv.x += Math.sin(tNow * 1.7) * shakeAmp;
                camFinalTpv.y += Math.cos(tNow * 2.3) * shakeAmp * 0.85;
            }

            const lookMat = new THREE.Matrix4().lookAt(camFinalTpv, this.smoothedTpvLook, new THREE.Vector3(0, 1, 0));
            const tpvQuat = new THREE.Quaternion().setFromRotationMatrix(lookMat);
            const easeTpv = this.tpvBlend * this.tpvBlend * (3.0 - 2.0 * this.tpvBlend);

            this.camera.position.copy(this.seatEyePos).lerp(camFinalTpv, easeTpv);
            this.camera.quaternion.copy(this.seatBaseQuat).slerp(tpvQuat, easeTpv);
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
