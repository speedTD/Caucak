import * as THREE from 'three';

/**
 * BỘ DỰNG NHÂN VẬT CẦN THỦ & BẠN CÂU 3D CHÂN THỰC CAO CẤP (REALISTIC ARTICULATED 3D HUMAN V2)
 * Nâng cấp chi tiết giải phẫu & trang phục đời thực:
 * - Khuôn mặt có quai hàm, cằm, sống mũi, mắt (lòng trắng + con ngươi), lông mày, khuôn miệng, vành tai.
 * - Đa dạng kiểu mũ & tóc: Mũ lưỡi trai thể thao (CAP), Mũ tai bèo câu đài (BUCKET), Nón lá/cối (CONICAL), hoặc Tóc nam gọn gàng (NONE).
 * - Thân hình giải phẫu tự nhiên: Cơ ngực, vai, eo, thắt lưng khóa kim loại, áo Polo có cổ bẻ, tay áo chống nắng, đồng hồ cổ tay.
 * - Bàn tay có ngón cái và khối ngón tay nắm cần câu tự nhiên.
 * - Hỗ trợ đầy đủ khớp xương (userData) để diễn hoạt thở, quay đầu nhìn phao, vung cần, gồng mình dòng cá.
 */
export function createRealisticHumanCharacter(options = {}) {
    const {
        shirtColor = 0x1d4ed8,
        sleeveColor = null,
        vestColor = 0x1e293b,
        pantsColor = 0x0f172a,
        hatColor = 0x1e3a8a,
        hatType = 'CAP', // 'CAP' | 'BUCKET' | 'CONICAL' | 'NONE'
        wearGlasses = true,
        skinColor = 0xe5b887,
        shoeColor = 0x18181b,
        pose = 'SEATED_FISHING', // 'SEATED_FISHING' | 'STANDING' | 'WALKING'
        hasVest = false
    } = options;

    const human = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.58, metalness: 0.04 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.72 });
    const armSleeveMat = new THREE.MeshStandardMaterial({
        color: sleeveColor !== null ? sleeveColor : shirtColor,
        roughness: 0.65
    });
    const vestMat = new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.78 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.82 });
    const hatMat = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.7, side: THREE.DoubleSide });
    const shoeMat = new THREE.MeshStandardMaterial({ color: shoeColor, roughness: 0.45 });
    const soleMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
    const glassesMat = new THREE.MeshStandardMaterial({ color: 0x09090b, metalness: 0.92, roughness: 0.08 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.85 });
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
    const lipMat = new THREE.MeshStandardMaterial({ color: 0xb96b59, roughness: 0.6 });
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.4, metalness: 0.3 });
    const buckleMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.15 });

    // ==================== 1. THÂN TRÊN (HÔNG, THẮT LƯNG, BỤNG, NGỰC, VAI & CỔ ÁO) ====================
    const upperBody = new THREE.Group();

    // Hông quần & Thắt lưng da
    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.146, 0.17, 16), pantsMat);
    pelvis.scale.set(1.16, 1.0, 0.82);
    pelvis.position.y = 0.085;
    pelvis.castShadow = true;
    upperBody.add(pelvis);

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.156, 0.155, 0.036, 16), beltMat);
    belt.scale.set(1.16, 1.0, 0.83);
    belt.position.y = 0.165;
    upperBody.add(belt);

    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.04, 0.02), buckleMat);
    buckle.position.set(0, 0.165, 0.13);
    upperBody.add(buckle);

    // Bụng dưới & Eo áo
    const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.152, 0.24, 16), shirtMat);
    abdomen.scale.set(1.15, 1.0, 0.80);
    abdomen.position.y = 0.28;
    abdomen.castShadow = true;
    upperBody.add(abdomen);

    // Lồng ngực & Cơ vai chữ V tự nhiên
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.192, 0.168, 0.28, 16), shirtMat);
    chest.scale.set(1.20, 1.0, 0.80);
    chest.position.y = 0.51;
    chest.castShadow = true;
    upperBody.add(chest);

    // Cầu vai tròn mượt nối sang hai tay
    const shoulderBridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.34, 8, 14), shirtMat);
    shoulderBridge.rotation.z = Math.PI / 2;
    shoulderBridge.scale.set(1.0, 1.0, 0.88);
    shoulderBridge.position.set(0, 0.60, -0.005);
    upperBody.add(shoulderBridge);

    // Áo ghi-lê câu đài chuyên nghiệp (nếu có)
    if (hasVest) {
        const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.196, 0.162, 0.44, 16), vestMat);
        vest.scale.set(1.20, 1.0, 0.82);
        vest.position.y = 0.42;
        upperBody.add(vest);

        [-0.082, 0.082].forEach(px => {
            const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.095, 0.028), vestMat);
            pocket.position.set(px, 0.45, 0.148);
            upperBody.add(pocket);
        });
    }

    // Cổ áo Polo bẻ lịch sự & Hàng cúc ngực
    const collarRing = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.098, 0.065, 16), shirtMat);
    collarRing.position.y = 0.655;
    upperBody.add(collarRing);

    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.13, 0.015), soleMat);
    placket.position.set(0, 0.56, 0.148);
    upperBody.add(placket);

    // ==================== 2. ĐẦU, KHUÔN MẶT CHI TIẾT, TÓC & MŨ CẦN THỦ ====================
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.68, 0);

    // Cổ người thật (hơi nghiêng nhẹ về trước)
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.066, 0.11, 14), skinMat);
    neck.position.set(0, 0.045, 0.006);
    headGroup.add(neck);

    // Hộp sọ trên & Quai hàm dưới tạo gương mặt góc cạnh tự nhiên
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.118, 20, 18), skinMat);
    cranium.scale.set(0.94, 1.08, 1.0);
    cranium.position.set(0, 0.18, 0);
    cranium.castShadow = true;
    headGroup.add(cranium);

    const jawChin = new THREE.Mesh(new THREE.SphereGeometry(0.092, 16, 14), skinMat);
    jawChin.scale.set(0.90, 0.95, 0.96);
    jawChin.position.set(0, 0.125, 0.022);
    headGroup.add(jawChin);

    // Mái tóc nam có tóc gáy, tóc mai 2 bên & mái trước
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.123, 16, 14), hairMat);
    hairBack.scale.set(0.96, 1.04, 1.02);
    hairBack.position.set(0, 0.195, -0.018);
    headGroup.add(hairBack);

    [-0.102, 0.102].forEach(sx => {
        const sideburn = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.065, 0.045), hairMat);
        sideburn.position.set(sx, 0.175, 0.02);
        headGroup.add(sideburn);
    });

    // Hai vành tai
    [-0.112, 0.112].forEach(ex => {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), skinMat);
        ear.scale.set(0.48, 1.15, 0.78);
        ear.position.set(ex, 0.168, -0.004);
        headGroup.add(ear);
    });

    // Đôi mắt (Lòng trắng + Con ngươi đen) & Lông mày
    [-0.042, 0.042].forEach(eyeX => {
        const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 10), eyeWhiteMat);
        eyeWhite.scale.set(1.15, 0.78, 0.6);
        eyeWhite.position.set(eyeX, 0.182, 0.106);
        headGroup.add(eyeWhite);

        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 8, 8), pupilMat);
        pupil.position.set(eyeX, 0.182, 0.114);
        headGroup.add(pupil);

        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.007, 0.012), hairMat);
        brow.position.set(eyeX, 0.202, 0.110);
        brow.rotation.z = eyeX < 0 ? -0.06 : 0.06;
        headGroup.add(brow);
    });

    // Sống mũi & Chóp mũi
    const noseBridge = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.048, 8), skinMat);
    noseBridge.rotation.x = Math.PI / 2.35;
    noseBridge.position.set(0, 0.162, 0.122);
    headGroup.add(noseBridge);

    // Khuôn miệng tự nhiên
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.009, 0.012), lipMat);
    mouth.position.set(0, 0.122, 0.112);
    headGroup.add(mouth);

    // Kính râm phân cực thể thao (Tùy chọn)
    if (wearGlasses) {
        const glassesGroup = new THREE.Group();
        [-0.042, 0.042].forEach(lx => {
            const lens = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.036, 0.012), glassesMat);
            lens.position.set(lx, 0.182, 0.118);
            lens.rotation.y = lx < 0 ? 0.12 : -0.12;
            glassesGroup.add(lens);
        });
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.007, 0.01), glassesMat);
        bridge.position.set(0, 0.188, 0.122);
        glassesGroup.add(bridge);
        headGroup.add(glassesGroup);
    }

    // Mũ đội đầu đa dạng cho từng bạn câu
    if (hatType === 'CAP') {
        // Mũ lưỡi trai thể thao (Baseball / Fishing Cap)
        const capDome = new THREE.Mesh(
            new THREE.SphereGeometry(0.122, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
            hatMat
        );
        capDome.position.set(0, 0.20, 0);
        headGroup.add(capDome);

        const visor = new THREE.Mesh(
            new THREE.CylinderGeometry(0.118, 0.118, 0.01, 16, 1, false, -Math.PI * 0.38, Math.PI * 0.76),
            hatMat
        );
        visor.scale.set(1.0, 1.0, 1.45);
        visor.position.set(0, 0.215, 0.055);
        visor.rotation.x = 0.14;
        headGroup.add(visor);
    } else if (hatType === 'BUCKET') {
        // Mũ tai bèo vành rộng cần thủ
        const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.126, 0.10, 18), hatMat);
        hatCrown.position.set(0, 0.27, 0);
        headGroup.add(hatCrown);

        const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.245, 0.01, 22), hatMat);
        hatBrim.position.set(0, 0.222, 0.008);
        hatBrim.rotation.x = 0.05;
        headGroup.add(hatBrim);
    } else if (hatType === 'CONICAL') {
        // Mũ cối / Nón rộng vành truyền thống
        const coneHat = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.15, 20), hatMat);
        coneHat.position.set(0, 0.28, 0);
        headGroup.add(coneHat);
    }

    upperBody.add(headGroup);

    // ==================== 3. HAI CÁNH TAY PHÂN KHỚP + BÀN TAY CÓ NGÓN & ĐỒNG HỒ ====================
    const buildArm = (isRight) => {
        const side = isRight ? -1 : 1;
        const shoulderPivot = new THREE.Group();
        shoulderPivot.position.set(side * 0.225, 0.58, 0);

        const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 12), shirtMat);
        shoulderPivot.add(shoulder);

        // Tay áo trên
        const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.042, 0.26, 14), shirtMat);
        upperArm.position.y = -0.13;
        upperArm.castShadow = true;
        shoulderPivot.add(upperArm);

        // Khớp khuỷu tay
        const elbowPivot = new THREE.Group();
        elbowPivot.position.set(0, -0.26, 0);
        const elbowSphere = new THREE.Mesh(new THREE.SphereGeometry(0.040, 10, 10), sleeveColor ? armSleeveMat : skinMat);
        elbowPivot.add(elbowSphere);

        // Cẳng tay (Có thể mặc ống tay chống nắng hoặc để trần)
        const forearm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.040, 0.031, 0.24, 14),
            sleeveColor ? armSleeveMat : skinMat
        );
        forearm.position.y = -0.12;
        forearm.castShadow = true;
        elbowPivot.add(forearm);

        // Đồng hồ thể thao ở cổ tay trái
        if (!isRight) {
            const watch = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.022, 12), glassesMat);
            watch.position.y = -0.215;
            elbowPivot.add(watch);
        }

        // Bàn tay có lòng bàn tay, ngón cái & khối 4 ngón tay nắm tự nhiên
        const handGroup = new THREE.Group();
        handGroup.position.set(0, -0.255, 0);

        const palm = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.055, 0.048), skinMat);
        handGroup.add(palm);

        const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.038, 0.044), skinMat);
        fingers.position.set(side * -0.008, -0.034, 0.008);
        fingers.rotation.z = side * -0.35;
        handGroup.add(fingers);

        const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.028, 4, 8), skinMat);
        thumb.position.set(side * -0.015, -0.01, 0.028);
        thumb.rotation.x = 0.45;
        handGroup.add(thumb);

        elbowPivot.add(handGroup);
        shoulderPivot.add(elbowPivot);
        return { shoulderPivot, elbowPivot, handGroup };
    };

    const rightArm = buildArm(true);
    const leftArm = buildArm(false);
    upperBody.add(rightArm.shoulderPivot);
    upperBody.add(leftArm.shoulderPivot);

    // ==================== 4. HAI CHÂN PHÂN KHỚP + TẤT & GIÀY SNEAKER ĐẾ TRẮNG ====================
    const buildLeg = (isRight) => {
        const side = isRight ? -1 : 1;
        const hipPivot = new THREE.Group();
        hipPivot.position.set(side * 0.105, 0.06, 0);

        const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.058, 0.42, 14), pantsMat);
        thigh.position.y = -0.21;
        thigh.castShadow = true;
        hipPivot.add(thigh);

        const kneePivot = new THREE.Group();
        kneePivot.position.set(0, -0.42, 0);
        const knee = new THREE.Mesh(new THREE.SphereGeometry(0.056, 12, 12), pantsMat);
        kneePivot.add(knee);

        const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.042, 0.38, 14), pantsMat);
        calf.position.y = -0.19;
        calf.castShadow = true;
        kneePivot.add(calf);

        // Cổ chân & tất trắng
        const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.05, 12), soleMat);
        sock.position.y = -0.385;
        kneePivot.add(sock);

        // Giày thể thao
        const shoeGroup = new THREE.Group();
        shoeGroup.position.set(0, -0.415, 0.045);
        const shoeUpper = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.062, 0.215), shoeMat);
        shoeGroup.add(shoeUpper);
        const shoeSole = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.025, 0.228), soleMat);
        shoeSole.position.y = -0.032;
        shoeGroup.add(shoeSole);
        kneePivot.add(shoeGroup);

        hipPivot.add(kneePivot);
        return { hipPivot, kneePivot };
    };

    const rightLeg = buildLeg(true);
    const leftLeg = buildLeg(false);

    // ==================== 5. ĐẶT TƯ THẾ CHUẨN ====================
    if (pose === 'SEATED_FISHING') {
        upperBody.position.set(0, 0.50, -0.35);
        upperBody.rotation.x = 0.12;

        rightLeg.hipPivot.position.set(-0.11, 0.52, -0.32);
        leftLeg.hipPivot.position.set(0.11, 0.52, -0.32);
        rightLeg.hipPivot.rotation.x = -Math.PI / 2 + 0.08;
        leftLeg.hipPivot.rotation.x = -Math.PI / 2 + 0.08;
        rightLeg.hipPivot.rotation.z = -0.08;
        leftLeg.hipPivot.rotation.z = 0.08;

        rightLeg.kneePivot.rotation.x = Math.PI / 2 - 0.12;
        leftLeg.kneePivot.rotation.x = Math.PI / 2 - 0.12;

        rightArm.shoulderPivot.rotation.x = -0.85;
        rightArm.shoulderPivot.rotation.z = 0.18;
        rightArm.elbowPivot.rotation.x = -0.75;

        leftArm.shoulderPivot.rotation.x = -0.55;
        leftArm.shoulderPivot.rotation.z = -0.15;
        leftArm.elbowPivot.rotation.x = -0.85;
    } else {
        upperBody.position.set(0, 0.84, 0);
        rightLeg.hipPivot.position.set(-0.105, 0.86, 0);
        leftLeg.hipPivot.position.set(0.105, 0.86, 0);

        rightArm.shoulderPivot.rotation.x = -0.22;
        rightArm.elbowPivot.rotation.x = -0.58;
        leftArm.shoulderPivot.rotation.x = -0.22;
        leftArm.elbowPivot.rotation.x = -0.58;
    }

    human.add(upperBody);
    human.add(rightLeg.hipPivot);
    human.add(leftLeg.hipPivot);

    human.userData = {
        upperBody,
        headGroup,
        rightArm,
        leftArm,
        rightLeg,
        leftLeg
    };

    return human;
}
