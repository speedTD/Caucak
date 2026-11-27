import * as THREE from 'three';

export class PlayerController {
    constructor(camera, domElement, environment) {
        this.camera = camera;
        this.domElement = domElement;
        this.environment = environment;

        // Vị trí người chơi bắt đầu tại Bến Câu #1 (Bờ Nam hồ chữ nhật 170m x 110m)
        this.position = new THREE.Vector3(0, 1.7, 18.0);
        this.moveSpeed = 9.5;
        this.runMultiplier = 1.65;

        // Góc quay camera: yaw = 0 nhìn thẳng ra tâm hồ (0, 0, 0)
        this.pitch = -0.06;
        this.yaw = 0.0;

        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            shift: false,
            isMouseDown: false
        };

        this.isPointerLocked = false;
        this.isRightMouseDown = false;
        this.isSeated = false;
        this.isZoomed = false;
        this.normalFov = 70;
        this.zoomFov = 24;

        // Trạng thái chạy chỗ từ Cổng Hồ vào Bến Câu lúc 06:00 sáng
        this.rushAnim = null;

        this.initControls();
    }

    initControls() {
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

        this.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 2) { // Chuột phải
                this.isRightMouseDown = true;
            }
            if (e.button === 0) {
                this.keys.isMouseDown = true;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                this.isRightMouseDown = false;
            }
            if (e.button === 0) {
                this.keys.isMouseDown = false;
            }
        });

        // Click để khoá chuột nếu muốn
        this.domElement.addEventListener('click', () => {
            if (!this.isPointerLocked && !this.isSeated) {
                this.domElement.requestPointerLock().catch(() => {});
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = (document.pointerLockElement === this.domElement);
        });

        // Xoay chuột
        window.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked || this.isRightMouseDown) {
                const sensitivity = this.isZoomed ? 0.001 : 0.0028;
                this.yaw -= e.movementX * sensitivity;
                this.pitch -= e.movementY * sensitivity;

                this.pitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, this.pitch));
            }
        });

        window.addEventListener('keydown', (e) => {
            switch (e.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.keys.forward = true;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.keys.backward = true;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = true;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = true;
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.shift = true;
                    break;
                case 'KeyZ':
                    this.toggleZoom();
                    break;
            }
        });

        window.addEventListener('keyup', (e) => {
            switch (e.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.keys.forward = false;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.keys.backward = false;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = false;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = false;
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.shift = false;
                    break;
            }
        });
    }

    toggleZoom() {
        this.isZoomed = !this.isZoomed;
        this.camera.fov = this.isZoomed ? this.zoomFov : this.normalFov;
        this.camera.updateProjectionMatrix();
    }

    // Ngồi vào bến câu
    setSeated(seated, seatPos, targetLook = null) {
        this.isSeated = seated;
        if (seated && seatPos) {
            this.position.copy(seatPos);
            // Tiến vị trí ngồi sát ra mép trước sàn cầu (+1.85m hướng ra lòng hồ) để thò gác cần & rọng sát mặt nước
            if (targetLook) {
                const fwd = new THREE.Vector3(targetLook.x - seatPos.x, 0, targetLook.z - seatPos.z);
                if (fwd.lengthSq() > 0.01) {
                    fwd.normalize();
                    this.position.x += fwd.x * 1.85;
                    this.position.z += fwd.z * 1.85;
                }
            }
            this.position.y = 1.25; // Tầm mắt chuẩn khi ngồi ghế đài

            // Tự động xoay camera nhìn thẳng vuông góc ra mặt hồ chữ nhật
            let lookX = 0;
            let lookZ = 0;
            if (targetLook) {
                lookX = targetLook.x;
                lookZ = targetLook.z;
            } else if (Math.abs(seatPos.z) >= 48) {
                lookX = seatPos.x;
                lookZ = 0;
            } else if (Math.abs(seatPos.x) >= 78) {
                lookX = 0;
                lookZ = seatPos.z;
            }
            const dx = lookX - seatPos.x;
            const dz = lookZ - seatPos.z;
            this.yaw = Math.atan2(-dx, -dz);
            this.pitch = -0.06; // Hơi chúc xuống mặt nước nhìn ngọn phao
        } else {
            this.position.y = 1.7; // Đứng dậy
        }
    }

    // Đứng ngoài Cổng Hồ Câu lúc 05:55 sáng cùng anh em cần thủ chờ Chủ Hồ mở cửa
    standAtGateWaiting() {
        this.isSeated = false;
        this.rushAnim = null;
        const gateZ = this.environment && this.environment.gatePosition ? this.environment.gatePosition.z : 59.8;
        const gateX = this.environment && this.environment.gatePosition ? this.environment.gatePosition.x : -8.0;
        this.position.set(gateX, 1.7, gateZ + 3.6);
        this.yaw = 0.0;
        this.pitch = -0.02;
        const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(euler);
        this.camera.position.copy(this.position);
    }

    // Hoạt ảnh người chơi chạy chỗ từ Cổng Hồ ra Bến Câu đẹp khi Chủ Hồ vừa mở cửa
    rushToSpot(spot, onArrivedCallback) {
        this.isSeated = false;
        const startPos = this.position.clone();
        const endPos = spot.pos.clone();
        endPos.y = 1.7;
        const dist = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);

        // Nếu đang đứng rất gần bến thì ngồi ngay
        if (dist < 4.5) {
            this.teleportToSpot(spot);
            if (onArrivedCallback) onArrivedCallback(spot);
            return;
        }

        // Tạo điểm trung gian dọc bờ Nam để chạy vòng theo bờ hồ chứ không băng qua mặt nước
        const midPos = new THREE.Vector3(
            endPos.x,
            1.7,
            startPos.z > 50 ? 56.2 : endPos.z
        );

        this.rushAnim = {
            spot,
            startPos,
            midPos,
            endPos,
            elapsed: 0,
            duration: THREE.MathUtils.clamp(dist / 36.0, 1.05, 1.85),
            onArrivedCallback
        };
    }

    // Dịch chuyển tức thời đến một bến câu
    teleportToSpot(spot) {
        this.rushAnim = null;
        this.position.copy(spot.pos);
        this.position.y = 1.7;
        const lookTarget = spot.targetLook || new THREE.Vector3(0, 0, 0);
        const dx = lookTarget.x - spot.pos.x;
        const dz = lookTarget.z - spot.pos.z;
        this.yaw = Math.atan2(-dx, -dz);
        this.pitch = -0.06;
    }

    // Tìm bến câu gần nhất
    getNearestFishingSpot() {
        if (!this.environment || !this.environment.fishingSpots) return null;

        let nearest = null;
        let minDist = 999;

        this.environment.fishingSpots.forEach(spot => {
            const dist = Math.hypot(this.position.x - spot.pos.x, this.position.z - spot.pos.z);
            if (dist < minDist) {
                minDist = dist;
                nearest = spot;
            }
        });

        return {
            spot: nearest,
            distance: minDist,
            canSit: minDist <= 5.0
        };
    }

    update(delta) {
        // Xử lý hoạt ảnh Chạy Chỗ từ Cổng Hồ ra Bến Câu
        if (this.rushAnim) {
            this.rushAnim.elapsed += delta;
            const t = Math.min(1.0, this.rushAnim.elapsed / this.rushAnim.duration);
            const curPos = new THREE.Vector3();
            if (t < 0.55) {
                curPos.lerpVectors(this.rushAnim.startPos, this.rushAnim.midPos, t / 0.55);
            } else {
                curPos.lerpVectors(this.rushAnim.midPos, this.rushAnim.endPos, (t - 0.55) / 0.45);
            }

            // Nhịp bước chạy chân thực của góc nhìn thứ nhất
            const runBob = Math.sin(this.rushAnim.elapsed * 26.0) * 0.085;
            this.position.copy(curPos);
            this.position.y = 1.7 + runBob;

            const lookTarget = t < 0.55 ? this.rushAnim.midPos : (this.rushAnim.spot.targetLook || this.rushAnim.endPos);
            const dx = lookTarget.x - this.position.x;
            const dz = lookTarget.z - this.position.z;
            if (Math.hypot(dx, dz) > 0.2) {
                const targetYaw = Math.atan2(-dx, -dz);
                let diff = targetYaw - this.yaw;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                this.yaw += diff * Math.min(1.0, delta * 9.0);
            }
            this.pitch = -0.05;

            const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
            this.camera.quaternion.setFromEuler(euler);
            this.camera.position.copy(this.position);

            if (t >= 1.0) {
                const finishedAnim = this.rushAnim;
                this.rushAnim = null;
                if (finishedAnim.onArrivedCallback) {
                    finishedAnim.onArrivedCallback(finishedAnim.spot);
                }
            }
            return;
        }

        // Cập nhật hướng xoay Camera
        const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(euler);

        // Nếu đang ngồi câu đài thì khoá vị trí chân
        if (this.isSeated) {
            this.camera.position.copy(this.position);
            return;
        }

        // Di chuyển trên bờ hồ
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

        const moveDir = new THREE.Vector3();
        if (this.keys.forward) moveDir.add(forward);
        if (this.keys.backward) moveDir.sub(forward);
        if (this.keys.right) moveDir.add(right);
        if (this.keys.left) moveDir.sub(right);

        if (moveDir.lengthSq() > 0) {
            moveDir.normalize();
            const currentSpeed = this.moveSpeed * (this.keys.shift ? this.runMultiplier : 1.0);
            this.position.addScaledVector(moveDir, currentSpeed * delta);
        }

        // Nếu Chủ Hồ chưa mở cổng (isGateOpen === false), cho phép đi tự do quanh ngoài Cổng Hồ • Khu Lán Trại • Cửa Hàng Đồ Câu!
        if (this.environment && !this.environment.isGateOpen) {
            const gateZ = this.environment.gatePosition ? this.environment.gatePosition.z : 59.8;
            this.position.z = THREE.MathUtils.clamp(this.position.z, gateZ + 0.7, gateZ + 22.0);
            this.position.x = THREE.MathUtils.clamp(this.position.x, -32.0, 6.0);
            this.position.y = 1.7;
            this.camera.position.copy(this.position);
            return;
        }

        // Giới hạn di chuyển dọc 4 bờ kè hồ chữ nhật động theo kích thước hồ
        const hw = this.environment ? this.environment.lakeHalfW : 85;
        const hd = this.environment ? this.environment.lakeHalfD : 22;
        const innerW = hw - 4.5;
        const innerD = hd - 4.5;
        if (Math.abs(this.position.x) < innerW && Math.abs(this.position.z) < innerD) {
            // Đẩy người chơi ra bờ kè gần nhất để không lội xuống lòng hồ sâu
            const penX = innerW - Math.abs(this.position.x);
            const penZ = innerD - Math.abs(this.position.z);
            if (penX < penZ) {
                this.position.x = Math.sign(this.position.x || 1) * innerW;
            } else {
                this.position.z = Math.sign(this.position.z || 1) * innerD;
            }
        }

        // Giới hạn biên ngoài đường dạo quanh hồ chữ nhật & mở rộng phía Nam sang Khu Lán Trại + Cửa Hàng Đồ Câu
        this.position.x = THREE.MathUtils.clamp(this.position.x, -(hw + 24.0), (hw + 24.0));
        this.position.z = THREE.MathUtils.clamp(this.position.z, -(hd + 21.0), (hd + 26.0));

        this.position.y = 1.7;
        this.camera.position.copy(this.position);
    }

    // Kiểm tra người chơi có đang đứng gần Quầy Cửa Hàng Đồ Câu bên cạnh Lán Trại hay không
    isNearTackleShop(maxDist = 5.8) {
        if (!this.environment || !this.environment.tackleShopPos) {
            return { near: false, dist: Infinity };
        }
        const sp = this.environment.tackleShopPos;
        const dist = Math.hypot(this.position.x - sp.x, this.position.z - sp.z);
        return { near: dist <= maxDist, dist };
    }

    // Đưa người chơi ra đứng ngay trước Quầy Cửa Hàng Đồ Câu bên Lán Trại và hướng mắt nhìn thẳng vào tiệm
    moveToTackleShop() {
        if (!this.environment || !this.environment.tackleShopStandPos) return;
        this.isSeated = false;
        this.rushAnim = null;
        this.position.copy(this.environment.tackleShopStandPos);
        this.position.y = 1.7;
        if (this.environment.tackleShopLookTarget) {
            const dx = this.environment.tackleShopLookTarget.x - this.position.x;
            const dz = this.environment.tackleShopLookTarget.z - this.position.z;
            this.yaw = Math.atan2(-dx, -dz);
            this.pitch = 0.02;
        }
        const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(euler);
        this.camera.position.copy(this.position);
    }

    isNearWaterBank() {
        const hw = this.environment ? this.environment.lakeHalfW : 85;
        const hd = this.environment ? this.environment.lakeHalfD : 22;
        const ax = Math.abs(this.position.x);
        const az = Math.abs(this.position.z);
        const nearNorthSouth = (az >= hd - 5.5 && az <= hd + 3.0 && ax <= hw + 2.0);
        const nearEastWest = (ax >= hw - 5.5 && ax <= hw + 3.0 && az <= hd + 2.0);
        return nearNorthSouth || nearEastWest;
    }
}
