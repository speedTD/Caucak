import * as THREE from 'three';
import {
    createWaterNormalTexture,
    createWoodDeckTexture,
    createStoneWallTexture,
    createGrassGroundTexture,
    createTreeBarkTexture,
    createFoliageClusterTexture,
    createWillowFrondTexture,
    createGrassReedTexture,
    createSoftCloudPuffTexture,
    createRicePaddyFieldTexture,
    createConcreteGroundTexture,
    createAsphaltRoadTexture
} from './TextureGenerator.js';
import { createRealisticHumanCharacter } from './HumanCharacterBuilder.js';

export class Environment {
    constructor(scene) {
        this.scene = scene;
        this.lakeGroup = new THREE.Group();
        this.waterMesh = null;
        this.waterMaterial = null;
        this.waterNormalTex = null;
        // Hồ câu đài dịch vụ Hình Chữ Nhật dài hẹp chuẩn Việt Nam: Dài 170m (X: -85..+85) x Rộng 44m (Z: -22..+22)
        // Chiều rộng hồ thu gọn 44m giúp người ngồi bờ bên này nhìn thấy rõ mồn một các cần thủ và bến câu bên bờ đối diện!
        this.lakeHalfW = 85;
        this.lakeHalfD = 22;
        this.lakeRadius = 22;
        this.fishingSpots = [];
        this.cloudsGroup = new THREE.Group();
        this.aerators = [];      // Các guồng quạt nước oxy đang quay
        this.willowBranches = []; // Cành liễu đung đưa theo gió
        this.foamParticles = [];
        this.flyingBirds = [];   // Đàn cò trắng bay lượn trên mặt hồ
        this.tournamentFlags = []; // Cờ phướn câu đài tung bay
        this.walkingStaff = null;
        this.walkingAngle = 0.35;
        this.staffTargetPos = null;
        this.staffOnArrived = null;
        this.staffWaitAtSpotTimer = 0;

        // CỔNG HỒ CÂU ĐÀI (Bờ Nam tại Z = 26.8m) & KHU LÁN TRẠI TẬP TRUNG NGHỈ ĐÊM
        this.gatePosition = new THREE.Vector3(-8.0, 0.42, 26.8);
        this.campPosition = new THREE.Vector3(-18.0, 1.7, 36.0);
        this.campFireLight = null;
        this.campFireFlame = null;
        this.isGateOpen = true;
        this.gateOpenProgress = 1;
        this.gateLeftDoor = null;
        this.gateRightDoor = null;
        this.gateOwner = null;
        this.lakeHour = 5.92; // 05:55 sáng chờ mở cổng

        // HỆ THỐNG THỜI TIẾT & ĐỘ ĐỤC NƯỚC HỒ THỜI GIAN THỰC:
        // 'SUNNY': Trời nắng đẹp -> Nước trong xanh ngọc bích (turbidity = 0.18)
        // 'RAINY': Trời mưa rào -> Nước đục phù sa bùn đất (turbidity = 0.90)
        this.weather = 'SUNNY';
        this.waterTurbidity = 0.18;
        this.targetTurbidity = 0.18;
        this.currentHour = 9.0; // Giờ trong ngày (5.9 -> 21.0) điều khiển Bình Minh / Trưa / Hoàng Hôn / Câu Đêm
        this.sunnyWaterColor = new THREE.Color(0x0d6b58); // Trong xanh ngọc bích khi trời nắng
        this.rainyWaterColor = new THREE.Color(0x5c4928); // Đục phù sa nâu vàng khi trời mưa
        this.currentWaterColor = new THREE.Color(0x0d6b58);
        this.rainSystem = null;
        this.rainDropCount = 1600;
        this.rainRippleCooldown = 0;
        // Chu kỳ tự động đổi thời tiết Nắng <-> Mưa (45s - 65s mỗi chu kỳ)
        this.autoWeatherTimer = 48.0;

        this.woodTex = createWoodDeckTexture();
        this.stoneTex = createStoneWallTexture();
        this.grassTex = createGrassGroundTexture();
        this.barkTex = createTreeBarkTexture();
        this.foliageTex = createFoliageClusterTexture();
        this.willowTex = createWillowFrondTexture();
        this.grassReedTex = createGrassReedTexture();
        this.cloudPuffTex = createSoftCloudPuffTexture();
        this.riceLushTex = createRicePaddyFieldTexture('LUSH_GREEN');
        this.riceYoungTex = createRicePaddyFieldTexture('YOUNG_GREEN');
        this.riceGoldTex = createRicePaddyFieldTexture('GOLDEN_RIPE');
        this.concreteTex = createConcreteGroundTexture();
        this.asphaltTex = createAsphaltRoadTexture();
        this.cloudSpriteMaterials = [];

        // HỆ THỐNG MẶT NỀN HỒ CÂU ĐÀI VIỆT NAM (Thảm Nhựa Asphalt đen nhám / Bê tông xoa phẳng có khe co giãn)
        this.groundPavementMode = 'ASPHALT_VIETNAM'; // 'ASPHALT_VIETNAM' | 'ALL_CONCRETE' | 'ALL_ASPHALT'
        this.pavementMeshes = [];

        this.initAtmosphericSky();
        this.initLighting();
        this.initRainSystem();
        this.scene.add(this.lakeGroup);
        this.scene.add(this.cloudsGroup);
    }

    createConcreteMaterial(repeatX = 4, repeatY = 4) {
        const tex = this.concreteTex.clone();
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);
        tex.needsUpdate = true;
        return new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.82,
            metalness: 0.04
        });
    }

    createAsphaltMaterial(repeatX = 4, repeatY = 4) {
        const tex = this.asphaltTex.clone();
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);
        tex.needsUpdate = true;
        return new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.86,
            metalness: 0.06
        });
    }

    setPavementMode(mode) {
        this.groundPavementMode = mode;
        this.pavementMeshes.forEach(mesh => {
            const type = mesh.userData.pavementType;
            if (mode === 'ALL_CONCRETE') {
                if (type === 'ROAD_NORTH_SOUTH') mesh.material = this.createConcreteMaterial(56, 1.4);
                else if (type === 'ROAD_EAST_WEST') mesh.material = this.createConcreteMaterial(1.4, 36);
                else if (type === 'DECK') mesh.material = this.createConcreteMaterial(2, 3);
                else if (type === 'WALKWAY') mesh.material = this.createConcreteMaterial(1.4, 3);
                else if (type === 'CURB') mesh.material = this.createConcreteMaterial(12, 1);
                else if (type === 'APRON_NORTH_SOUTH') mesh.material = this.createConcreteMaterial(48, 1.2);
                else if (type === 'APRON_EAST_WEST') mesh.material = this.createConcreteMaterial(1.2, 32);
            } else if (mode === 'ALL_ASPHALT') {
                if (type === 'ROAD_NORTH_SOUTH') mesh.material = this.createAsphaltMaterial(56, 1.4);
                else if (type === 'ROAD_EAST_WEST') mesh.material = this.createAsphaltMaterial(1.4, 36);
                else if (type === 'DECK') mesh.material = this.createAsphaltMaterial(2, 3);
                else if (type === 'WALKWAY') mesh.material = this.createAsphaltMaterial(1.4, 3);
                else if (type === 'CURB') mesh.material = this.createConcreteMaterial(12, 1);
                else if (type === 'APRON_NORTH_SOUTH') mesh.material = this.createAsphaltMaterial(48, 1.2);
                else if (type === 'APRON_EAST_WEST') mesh.material = this.createAsphaltMaterial(1.2, 32);
            } else {
                // Mặc định 'ASPHALT_VIETNAM': Đường dạo thảm nhựa Asphalt + Bệ câu đài & viền kè Bê tông đổ mẻ
                if (type === 'ROAD_NORTH_SOUTH') mesh.material = this.createAsphaltMaterial(56, 1.4);
                else if (type === 'ROAD_EAST_WEST') mesh.material = this.createAsphaltMaterial(1.4, 36);
                else if (type === 'DECK') mesh.material = this.createConcreteMaterial(2, 3);
                else if (type === 'WALKWAY') mesh.material = this.createConcreteMaterial(1.4, 3);
                else if (type === 'CURB') mesh.material = this.createConcreteMaterial(12, 1);
                else if (type === 'APRON_NORTH_SOUTH') mesh.material = this.createConcreteMaterial(48, 1.2);
                else if (type === 'APRON_EAST_WEST') mesh.material = this.createConcreteMaterial(1.2, 32);
            }
        });
        return this.getPavementModeInfo();
    }

    togglePavementMode() {
        if (this.groundPavementMode === 'ASPHALT_VIETNAM') {
            return this.setPavementMode('ALL_CONCRETE');
        } else if (this.groundPavementMode === 'ALL_CONCRETE') {
            return this.setPavementMode('ALL_ASPHALT');
        } else {
            return this.setPavementMode('ASPHALT_VIETNAM');
        }
    }

    getPavementModeInfo() {
        if (this.groundPavementMode === 'ALL_CONCRETE') {
            return {
                mode: 'ALL_CONCRETE',
                label: '🧱 Bê Tông Xoa Phẳng',
                desc: 'Đổ toàn bộ bê tông xi măng xoa phẳng chia ô kẻ chỉ chống nứt'
            };
        } else if (this.groundPavementMode === 'ALL_ASPHALT') {
            return {
                mode: 'ALL_ASPHALT',
                label: '🛣️ Thảm Nhựa Asphalt',
                desc: 'Trải thảm nhựa bitum atphan màu than xám nhám mịn chống trượt'
            };
        } else {
            return {
                mode: 'ASPHALT_VIETNAM',
                label: '🛣️ Thảm Asphalt & Bê Tông VN',
                desc: 'Đường dạo thảm nhựa Asphalt + Bệ câu đài Bê tông xoa phẳng kiên cố'
            };
        }
    }

    initAtmosphericSky() {
        const vertexShader = `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `;

        // Shader Bầu Trời & Mây Volumetric FBM Nhiều Tầng Chân Thực (Có viền bạc ánh nắng Mặt Trời & Bóng râm đáy mây)
        const fragmentShader = `
            uniform vec3 topColor;
            uniform vec3 midColor;
            uniform vec3 bottomColor;
            uniform vec3 sunDir;
            uniform float uTime;
            uniform float uRainFactor;
            varying vec3 vWorldPosition;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
                    u.y
                );
            }

            float fbm(vec2 p) {
                float v = 0.0;
                float a = 0.5;
                mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
                for (int i = 0; i < 5; i++) {
                    v += a * noise(p);
                    p = rot * p * 2.03 + vec2(1.7, 9.2);
                    a *= 0.5;
                }
                return v;
            }

            void main() {
                vec3 dir = normalize(vWorldPosition);
                float h = clamp(dir.y, 0.0, 1.0);
                vec3 col = mix(bottomColor, midColor, smoothstep(0.0, 0.22, h));
                col = mix(col, topColor, smoothstep(0.22, 0.85, h));

                vec3 sDir = normalize(sunDir);
                float sunAmt = max(dot(dir, sDir), 0.0);

                // Quầng sáng mặt trời ấm áp (Giảm khi trời mưa)
                float sunnyVis = 1.0 - uRainFactor * 0.82;
                col += vec3(1.0, 0.92, 0.75) * pow(sunAmt, 28.0) * 0.55 * sunnyVis;
                col += vec3(1.0, 0.98, 0.9) * smoothstep(0.9985, 0.9998, sunAmt) * sunnyVis;

                // Tầng mây Volumetric FBM trôi tự nhiên trên vòm trời
                if (dir.y > 0.03) {
                    vec2 uv = dir.xz / (dir.y + 0.16);
                    vec2 wind = vec2(uTime * 0.018, uTime * 0.009);

                    float n1 = fbm(uv * 1.15 + wind);
                    float n2 = fbm(uv * 2.45 - wind * 0.6 + n1 * 0.45);
                    float cloudVal = n1 * 0.62 + n2 * 0.38;

                    float coverage = mix(0.46, 0.28, uRainFactor);
                    float density = smoothstep(coverage, coverage + 0.32, cloudVal);
                    float horizonFade = smoothstep(0.03, 0.22, dir.y);
                    density *= horizonFade;

                    // Ánh sáng xuyên mây & bóng râm dưới đáy mây
                    float topLight = smoothstep(coverage, coverage + 0.26, n1);
                    vec3 cloudBright = mix(vec3(0.99, 0.99, 1.0), vec3(0.68, 0.73, 0.80), uRainFactor);
                    vec3 cloudDark = mix(vec3(0.74, 0.81, 0.90), vec3(0.32, 0.38, 0.46), uRainFactor);
                    vec3 cloudCol = mix(cloudDark, cloudBright, topLight);

                    // Viền mây ánh vàng bạc gần mặt trời (Silver lining)
                    cloudCol += vec3(1.0, 0.90, 0.72) * pow(sunAmt, 10.0) * 0.38 * (1.0 - density * 0.5) * sunnyVis;

                    col = mix(col, cloudCol, density * 0.88);
                }

                gl_FragColor = vec4(col, 1.0);
            }
        `;

        const uniforms = {
            topColor: { value: new THREE.Color(0x2563eb) },
            midColor: { value: new THREE.Color(0x7dd3fc) },
            bottomColor: { value: new THREE.Color(0xeff6ff) },
            sunDir: { value: new THREE.Vector3(60, 42, -90) },
            uTime: { value: 0.0 },
            uRainFactor: { value: 0.0 }
        };

        const skyGeo = new THREE.SphereGeometry(480, 32, 24);
        const skyMat = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms,
            side: THREE.BackSide
        });

        this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.skyMesh);

        // Các dải mây Cumulus mềm mại bồng bềnh (Sử dụng Sprite viền mờ nhiều lớp thay vì khối đa diện cứng)
        for (let i = 0; i < 22; i++) {
            const cluster = new THREE.Group();
            const puffCount = 4 + (i % 3);
            for (let p = 0; p < puffCount; p++) {
                const spriteMat = new THREE.SpriteMaterial({
                    map: this.cloudPuffTex,
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.62 - (p % 2) * 0.10,
                    depthWrite: false
                });
                this.cloudSpriteMaterials.push(spriteMat);

                const sprite = new THREE.Sprite(spriteMat);
                const w = 44 + (p % 3) * 16;
                const h = w * 0.54;
                sprite.scale.set(w, h, 1);
                sprite.position.set(
                    (p - puffCount / 2) * 14,
                    (p % 2) * 3.5,
                    (Math.sin(i + p) * 6)
                );
                cluster.add(sprite);
            }
            const angle = (i / 22) * Math.PI * 2;
            const dist = 195 + (i % 3) * 45;
            cluster.position.set(
                Math.cos(angle) * dist,
                76 + (i % 4) * 12,
                Math.sin(angle) * dist
            );
            this.cloudsGroup.add(cluster);
        }
    }

    initLighting() {
        this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x2d4c2b, 0.95);
        this.hemiLight.position.set(0, 120, 0);
        this.scene.add(this.hemiLight);

        this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.55);
        this.sunLight.position.set(60, 75, -85);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 10;
        this.sunLight.shadow.camera.far = 240;
        const d = 65;
        this.sunLight.shadow.camera.left = -d;
        this.sunLight.shadow.camera.right = d;
        this.sunLight.shadow.camera.top = d;
        this.sunLight.shadow.camera.bottom = -d;
        this.scene.add(this.sunLight);

        this.fillLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
        this.fillLight.position.set(-50, 40, 60);
        this.scene.add(this.fillLight);
    }

    // Hệ thống hạt mưa rào 3D rơi xuống mặt hồ hình chữ nhật mở rộng
    initRainSystem() {
        const positions = new Float32Array(this.rainDropCount * 6);
        for (let i = 0; i < this.rainDropCount; i++) {
            const x = (Math.random() - 0.5) * (this.lakeHalfW * 2.1);
            const y = Math.random() * 42;
            const z = (Math.random() - 0.5) * (this.lakeHalfD * 2.1);
            const idx = i * 6;
            positions[idx] = x;
            positions[idx + 1] = y;
            positions[idx + 2] = z;
            positions[idx + 3] = x - 0.15;
            positions[idx + 4] = y - 1.35;
            positions[idx + 5] = z + 0.1;
        }
        const rainGeo = new THREE.BufferGeometry();
        rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const rainMat = new THREE.LineBasicMaterial({
            color: 0xcbd5e1,
            transparent: true,
            opacity: 0.52
        });
        this.rainSystem = new THREE.LineSegments(rainGeo, rainMat);
        this.rainSystem.visible = false;
        this.scene.add(this.rainSystem);
    }

    // Hàm lấy tọa độ dọc theo chu vi Hồ Hình Chữ Nhật (u: 0..1, offset > 0 là trên bờ, offset < 0 là dưới lòng hồ)
    getRectPerimeterPoint(u, offset = 0) {
        const normU = ((u % 1) + 1) % 1;
        const hw = this.lakeHalfW + offset;
        const hd = this.lakeHalfD + offset;
        const w = hw * 2;
        const d = hd * 2;
        const totalPerim = 2 * (w + d);
        let dist = normU * totalPerim;

        if (dist < w) {
            // Bờ Nam (z = +hd, chạy từ Tây sang Đông, nhìn thẳng về hướng Bắc -Z)
            const x = -hw + dist;
            const z = hd;
            return { x, z, lookX: x, lookZ: z - 20, nx: 0, nz: -1, side: 'SOUTH' };
        }
        dist -= w;
        if (dist < d) {
            // Bờ Đông (x = +hw, chạy từ Nam lên Bắc, nhìn thẳng về hướng Tây -X)
            const x = hw;
            const z = hd - dist;
            return { x, z, lookX: x - 20, lookZ: z, nx: -1, nz: 0, side: 'EAST' };
        }
        dist -= d;
        if (dist < w) {
            // Bờ Bắc (z = -hd, chạy từ Đông sang Tây, nhìn thẳng về hướng Nam +Z)
            const x = hw - dist;
            const z = -hd;
            return { x, z, lookX: x, lookZ: z + 20, nx: 0, nz: 1, side: 'NORTH' };
        }
        dist -= w;
        // Bờ Tây (x = -hw, chạy từ Bắc xuống Nam, nhìn thẳng về hướng Đông +X)
        const x = -hw;
        const z = -hd + dist;
        return { x, z, lookX: x + 20, lookZ: z, nx: 1, nz: 0, side: 'WEST' };
    }

    setWeather(mode, isAuto = false) {
        if (mode === 'RAINY') this.weather = 'RAINY';
        else if (mode === 'CLOUDY') this.weather = 'CLOUDY';
        else this.weather = 'SUNNY';

        this.targetTurbidity = this.weather === 'RAINY' ? 0.90 : (this.weather === 'CLOUDY' ? 0.42 : 0.18);
        if (this.rainSystem) {
            this.rainSystem.visible = (this.weather === 'RAINY');
        }
        window.dispatchEvent(new CustomEvent('weather_changed', {
            detail: {
                weather: this.weather,
                waterTurbidity: this.targetTurbidity,
                isAuto
            }
        }));
    }

    toggleWeather() {
        const order = ['SUNNY', 'CLOUDY', 'RAINY'];
        const idx = order.indexOf(this.weather);
        const next = order[(idx + 1) % order.length];
        this.setWeather(next);
        return this.weather;
    }

    loadLake(lakeData) {
        while (this.lakeGroup.children.length > 0) {
            this.lakeGroup.remove(this.lakeGroup.children[0]);
        }
        if (lakeData) {
            this.currentLakeData = lakeData;
            if (lakeData.halfW) this.lakeHalfW = lakeData.halfW;
            if (lakeData.halfD) this.lakeHalfD = lakeData.halfD;
            this.gatePosition.set(-8.0, 0.42, this.lakeHalfD + 4.8);
        }
        this.aerators = [];
        this.willowBranches = [];
        this.foamParticles = [];
        this.flyingBirds = [];
        this.tournamentFlags = [];

        this.scene.fog = new THREE.FogExp2(0xdbeafe, 0.0022);

        const baseWaterColorHex = lakeData && lakeData.waterColor ? lakeData.waterColor : 0x228b7b;
        this.sunnyWaterColor.setHex(baseWaterColorHex);
        // Pha xanh ngọc lục bảo tươi dịu mắt chuẩn hồ câu dịch vụ Việt Nam (tương phản rõ tăm phao đỏ/vàng/xanh)
        this.sunnyWaterColor.lerp(new THREE.Color(0x239688), 0.62);
        // Màu nước phù sa ấm sáng khi trời mưa (không bị tối đen)
        this.rainyWaterColor.setHex(0x6e6243);

        this.currentWaterColor.copy(
            this.weather === 'RAINY' ? this.rainyWaterColor : this.sunnyWaterColor
        );

        // 1. MẶT NƯỚC HỒ CÂU ĐÀI SÁNG DỊU, ĐỘ TƯƠNG PHẢN CAO DỄ NHÌN PHAO & TĂM CÁ
        const waterW = this.lakeHalfW * 2;
        const waterD = this.lakeHalfD * 2;
        const waterGeo = new THREE.PlaneGeometry(waterW, waterD, 64, 48);
        this.waterNormalTex = createWaterNormalTexture();
        this.waterNormalTex.repeat.set(16, 10);

        this.waterMaterial = new THREE.MeshStandardMaterial({
            color: this.currentWaterColor,
            emissive: new THREE.Color(this.weather === 'RAINY' ? 0x262116 : 0x104642),
            emissiveIntensity: 0.38,
            roughness: 0.24,
            metalness: 0.12,
            normalMap: this.waterNormalTex,
            normalScale: new THREE.Vector2(0.13, 0.13),
            transparent: true,
            opacity: 0.94
        });

        this.waterMesh = new THREE.Mesh(waterGeo, this.waterMaterial);
        this.waterMesh.rotation.x = -Math.PI / 2;
        this.waterMesh.position.y = 0.0;
        this.waterMesh.receiveShadow = true;
        this.lakeGroup.add(this.waterMesh);

        // Đáy hồ sâu hình chữ nhật tạo chiều sâu nước
        const bedGeo = new THREE.PlaneGeometry(waterW, waterD);
        const bedMat = new THREE.MeshBasicMaterial({ color: 0x091e18 });
        const bedMesh = new THREE.Mesh(bedGeo, bedMat);
        bedMesh.rotation.x = -Math.PI / 2;
        bedMesh.position.y = -1.8;
        this.lakeGroup.add(bedMesh);

        // 2. BỜ KÈ ĐÁ HỘC BAO QUANH LÒNG HỒ & ĐƯỜNG DẠO VEN HỒ
        this.createEmbankmentAndTerrain();

        // 3. CÁNH ĐỒNG LÚA QUÊ VIỆT NAM BÁT NGÁT XUNG QUANH HỒ (Thay cho núi: Ô ruộng lúa xanh/chín vàng, bờ đê, trâu ăn cỏ, bù nhìn rơm & xóm làng xa xa)
        this.createVietnameseRicePaddyFields();

        // 4. NHÀ ĐIỀU HÀNH HỒ CÂU & CĂN-TIN CẦN THỦ (BỜ BẮC ĐỐI DIỆN)
        this.createClubhouseBuilding(lakeData ? lakeData.name : 'HỒ CÂU CỦ GẤU');

        // 5. QUẠT NƯỚC TẠO OXY ĐANG QUAY TUNG BỌT TRẮNG XÓA (ĐẶC TRƯNG HỒ DỊCH VỤ)
        this.createSpinningAerators();

        // 6. HỆ THỰC VẬT VIỆT NAM: CÂY LIỄU RỦ, BỤI TRE TRÚC, ĐẦM SEN SÚNG & BÃI LAU SẬY
        this.createVietnameseFlora();

        // 7. CẢNH QUAN NÂNG CẤP VEN HỒ: CHÒI LÁ NGHỈ MÁT, GHỀNH ĐÁ RÊU PHONG, CỜ PHƯỚN & ĐÀN CÒ TRẮNG
        this.createUpgradedLakesideScenery();

        // 8. CÁC BẾN CÂU ĐÀI CHÍNH & Ô DÙ CẦN THỦ QUANH HỒ
        this.createPiersAndPegs();

        // 9. ĐỊA HÌNH MAP 3D RIÊNG BIỆT (5 ĐỊA HÌNH RANDOM VÀO CÁC HỒ)
        this.buildUniqueMapTerrain(lakeData && lakeData.terrainId ? lakeData.terrainId : 'ISLAND_LAGOON');

        // 10. KHU LÁN TRẠI TẬP TRUNG NGHỈ ĐÊM (Nơi cần thủ truyền tống ra lúc 21:00, nghỉ 5 phút trò chuyện & đi Chợ Thế Giới)
        this.createNightCampHub();
    }

    createNightCampHub() {
        const cx = -18.0;
        const cz = this.lakeHalfD + 14.5;
        this.campPosition.set(cx, 1.7, cz + 3.2);

        const campGroup = new THREE.Group();
        campGroup.position.set(cx, 0, cz);

        // Nền sân lán trại rộng 16m x 12m
        const padMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
        const pad = new THREE.Mesh(new THREE.BoxGeometry(16, 0.16, 12), padMat);
        pad.position.set(0, 0.08, 0);
        pad.receiveShadow = true;
        campGroup.add(pad);

        // Nhà Lán mái xanh rộng che mưa nắng phía sau đống lửa
        const postMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.6 });
        for (const px of [-5.5, 0, 5.5]) {
            for (const pz of [-4.5, -1.2]) {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 8), postMat);
                post.position.set(px, 1.65, pz);
                campGroup.add(post);
            }
        }
        const roof = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.18, 4.4), roofMat);
        roof.position.set(0, 3.3, -2.85);
        roof.rotation.x = 0.08;
        campGroup.add(roof);

        // Đống lửa trại ấm cúng ở trung tâm sân
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.95 });
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMat);
            st.position.set(Math.cos(a) * 0.72, 0.24, 1.0 + Math.sin(a) * 0.72);
            campGroup.add(st);
        }
        const logMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
        for (let i = 0; i < 3; i++) {
            const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.1, 6), logMat);
            log.position.set(0, 0.28, 1.0);
            log.rotation.z = Math.PI / 2.2;
            log.rotation.y = (i / 3) * Math.PI;
            campGroup.add(log);
        }

        const flameMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
        this.campFireFlame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.95, 7), flameMat);
        this.campFireFlame.position.set(0, 0.72, 1.0);
        campGroup.add(this.campFireFlame);

        this.campFireLight = new THREE.PointLight(0xff922b, 2.8, 18);
        this.campFireLight.position.set(0, 1.6, 1.0);
        campGroup.add(this.campFireLight);

        // 3 Ghế băng gỗ quanh lửa trại + 3 cần thủ tụ tập trò chuyện
        const benchMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.85 });
        [
            { x: -2.4, z: 1.0, ry: Math.PI / 2 },
            { x: 2.4, z: 1.0, ry: -Math.PI / 2 },
            { x: 0, z: -0.9, ry: 0 }
        ].forEach((b, idx) => {
            const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.45), benchMat);
            bench.position.set(b.x, 0.52, b.z);
            bench.rotation.y = b.ry;
            campGroup.add(bench);

            const npc = createRealisticHumanCharacter({
                shirtColor: [0x0284c7, 0xd97706, 0x059669][idx % 3],
                pantsColor: 0x1e293b,
                hatColor: 0xfacc15,
                isSeated: true
            });
            npc.position.set(b.x, 0.16, b.z);
            npc.rotation.y = b.ry;
            campGroup.add(npc);
        });

        // Dây đèn lồng vàng treo trước mái lán
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
        for (let bx = -5.5; bx <= 5.5; bx += 1.8) {
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), bulbMat);
            bulb.position.set(bx, 3.05, -0.75);
            campGroup.add(bulb);
        }

        this.lakeGroup.add(campGroup);
    }

    buildUniqueMapTerrain(terrainId) {
        const group = new THREE.Group();
        const hw = this.lakeHalfW;
        const hd = this.lakeHalfD;

        if (terrainId === 'ISLAND_LAGOON') {
            // 1. ĐỊA HÌNH ĐẢO GIỮA HỒ & CẦU GỖ VỌNG CẢNH
            const islandPositions = [
                { x: -28, z: -2.5, rx: 8.5, rz: 5.5, hasPavilion: true },
                { x: 30, z: -3.0, rx: 7.2, rz: 4.8, hasPavilion: false }
            ];
            const dirtMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.92 });
            const grassMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.85 });
            const woodMat = new THREE.MeshStandardMaterial({ map: this.woodTex, roughness: 0.78 });
            const roofMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.55 });
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.9 });
            const leafMat = new THREE.MeshStandardMaterial({ color: 0x40916c, roughness: 0.8 });

            islandPositions.forEach(isl => {
                // Đế đảo nhô khỏi mặt nước
                const base = new THREE.Mesh(new THREE.CylinderGeometry(isl.rx * 0.88, isl.rx, 1.35, 18), dirtMat);
                base.scale.set(1, 1, isl.rz / isl.rx);
                base.position.set(isl.x, 0.2, isl.z);
                group.add(base);

                const topGrass = new THREE.Mesh(new THREE.CylinderGeometry(isl.rx * 0.86, isl.rx * 0.90, 0.22, 18), grassMat);
                topGrass.scale.set(1, 1, isl.rz / isl.rx);
                topGrass.position.set(isl.x, 0.92, isl.z);
                group.add(topGrass);

                if (isl.hasPavilion) {
                    // Chòi vọng cảnh lục giác trên đảo
                    for (let i = 0; i < 6; i++) {
                        const a = (i / 6) * Math.PI * 2;
                        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 3.0, 8), woodMat);
                        p.position.set(isl.x + Math.cos(a) * 2.4, 2.4, isl.z + Math.sin(a) * 2.4);
                        group.add(p);
                    }
                    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.6, 6), roofMat);
                    roof.position.set(isl.x, 4.6, isl.z);
                    group.add(roof);

                    // Cầu gỗ nối từ bờ Bắc ra đảo
                    const bridgeLen = Math.abs(-hd - isl.z) - isl.rz * 0.6;
                    if (bridgeLen > 2) {
                        const deck = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.18, bridgeLen), woodMat);
                        deck.position.set(isl.x, 0.65, (-hd + isl.z) * 0.5 - 1.2);
                        group.add(deck);
                    }
                } else {
                    // Cụm cây liễu xanh trên đảo phụ
                    for (let t = 0; t < 3; t++) {
                        const ox = isl.x + (t - 1) * 2.6;
                        const oz = isl.z + (t % 2 === 0 ? 0.8 : -0.8);
                        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 3.6, 8), trunkMat);
                        trunk.position.set(ox, 2.6, oz);
                        group.add(trunk);
                        const crown = new THREE.Mesh(new THREE.SphereGeometry(2.0, 10, 10), leafMat);
                        crown.scale.set(1.2, 0.85, 1.2);
                        crown.position.set(ox, 4.6, oz);
                        group.add(crown);
                    }
                }
            });

        } else if (terrainId === 'LOTUS_VILLAGE') {
            // 2. ĐỊA HÌNH ĐẦM SEN LÀNG QUÊ & LŨY TRE VEN BỜ
            const padMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.7, side: THREE.DoubleSide });
            const flowerMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, emissive: 0x831843, emissiveIntensity: 0.25, roughness: 0.4 });
            const bambooMat = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.65 });
            const stakeMat = new THREE.MeshStandardMaterial({ color: 0x713f12, roughness: 0.9 });

            // 4 cụm đầm sen hồng rộng ở 4 góc mặt hồ
            const lotusZones = [
                { cx: -hw + 14, cz: -hd + 6 },
                { cx: hw - 14, cz: -hd + 6 },
                { cx: -hw + 16, cz: hd - 6 },
                { cx: hw - 16, cz: hd - 6 }
            ];
            lotusZones.forEach(z => {
                for (let i = 0; i < 22; i++) {
                    const lx = z.cx + (Math.random() - 0.5) * 18;
                    const lz = z.cz + (Math.random() - 0.5) * 8;
                    const r = 0.45 + Math.random() * 0.42;
                    const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 12), padMat);
                    pad.rotation.x = -Math.PI / 2;
                    pad.position.set(lx, 0.03, lz);
                    group.add(pad);

                    if (i % 3 === 0) {
                        const flower = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.34, 7), flowerMat);
                        flower.rotation.x = Math.PI;
                        flower.position.set(lx, 0.26, lz);
                        group.add(flower);
                    }
                }
            });

            // Lũy tre làng dày dọc bờ Đông & Tây và hàng cọc tre chắn mép nước
            for (let side of [-1, 1]) {
                for (let k = -hd + 2; k <= hd - 2; k += 2.6) {
                    const bx = side * (hw + 2.2 + Math.random() * 1.5);
                    const h = 7.5 + Math.random() * 4.5;
                    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, h, 6), bambooMat);
                    stalk.position.set(bx, h * 0.5, k);
                    stalk.rotation.z = side * -0.08;
                    group.add(stalk);
                }
            }
            for (let x = -hw + 8; x <= hw - 8; x += 12) {
                const st = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.4, 6), stakeMat);
                st.position.set(x, 0.35, -hd + 1.1);
                group.add(st);
            }

        } else if (terrainId === 'COMPETITION_ARENA') {
            // 3. ĐỊA HÌNH ĐẤU TRƯỜNG BÊ TÔNG VIP (ĐÈN CAO ÁP + BĂNG RÔN + PHAO PHÂN LÀN)
            const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });
            const lampMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
            const bannerMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45 });
            const buoyRed = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35 });
            const buoyWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });

            // 8 Cột đèn cao áp sân vận động dọc bờ Bắc & Nam
            for (const x of [-58, -22, 22, 58]) {
                for (const sz of [-1, 1]) {
                    const pz = sz * (hd + 3.2);
                    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, 10.5, 8), poleMat);
                    pole.position.set(x, 5.25, pz);
                    group.add(pole);

                    const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.35), lampMat);
                    head.position.set(x, 10.4, pz - sz * 0.4);
                    group.add(head);
                }
            }

            // Hàng phao phân làn thi đấu chạy thẳng giữa lòng hồ (z = 0)
            for (let x = -hw + 6; x <= hw - 6; x += 5.5) {
                const buoy = new THREE.Mesh(
                    new THREE.SphereGeometry(0.24, 10, 10),
                    (Math.round(x) % 2 === 0) ? buoyRed : buoyWhite
                );
                buoy.position.set(x, 0.05, 0);
                group.add(buoy);
            }

            // Cổng băng-rôn giải đấu lớn ở 2 đầu bờ Đông & Tây
            for (const side of [-1, 1]) {
                const bx = side * (hw + 1.5);
                const board = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 14), bannerMat);
                board.position.set(bx, 2.4, 0);
                group.add(board);
            }

        } else if (terrainId === 'HILL_VALLEY') {
            // 4. ĐỊA HÌNH THUNG LŨNG ĐỒI NÚI TỰ NHIÊN & RỪNG THÔNG
            const hillMat1 = new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.95 });
            const hillMat2 = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.92 });
            const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 });
            const pineMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.85 });
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });

            // Dãy đồi núi hùng vĩ bao quanh bờ Bắc, Đông, Tây
            const hills = [
                { x: -95, z: -65, r: 38, h: 28 }, { x: -42, z: -72, r: 44, h: 36 },
                { x: 18, z: -76, r: 48, h: 42 },  { x: 78, z: -68, r: 40, h: 32 },
                { x: -128, z: -12, r: 36, h: 26 }, { x: -130, z: 32, r: 34, h: 22 },
                { x: 128, z: -15, r: 38, h: 30 },  { x: 132, z: 28, r: 32, h: 24 }
            ];
            hills.forEach((hl, i) => {
                const hill = new THREE.Mesh(
                    new THREE.ConeGeometry(hl.r, hl.h, 9),
                    i % 2 === 0 ? hillMat1 : hillMat2
                );
                hill.position.set(hl.x, hl.h * 0.45, hl.z);
                group.add(hill);
            });

            // Ghềnh đá tảng tự nhiên ven bờ Bắc & rừng thông cao
            for (let x = -hw + 6; x <= hw - 6; x += 14) {
                const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3 + Math.random() * 1.1, 0), rockMat);
                rock.scale.set(1.4, 0.75, 1.1);
                rock.position.set(x, 0.55, -hd - 1.2);
                group.add(rock);

                // Cây thông 2 tầng
                const tx = x + 4;
                const tz = -hd - 5.5 - Math.random() * 5;
                const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 2.6, 6), trunkMat);
                tr.position.set(tx, 1.3, tz);
                group.add(tr);
                const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.7, 4.2, 7), pineMat);
                c1.position.set(tx, 4.0, tz);
                group.add(c1);
                const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.2, 7), pineMat);
                c2.position.set(tx, 6.2, tz);
                group.add(c2);
            }

        } else if (terrainId === 'NIGHT_CANAL_LANTERN') {
            // 5. ĐỊA HÌNH KÊNH DÀI LÁN TÔN & ĐÈN LỒNG RỰC RỠ
            const steelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });
            const roofBlueMat = new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.5, metalness: 0.3 });
            const lanternRed = new THREE.MeshBasicMaterial({ color: 0xef4444 });
            const lanternGold = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

            // Dãy lán tôn che mưa nắng dọc bờ Bắc
            for (let x = -60; x <= 60; x += 24) {
                if (Math.abs(x) < 14) continue; // Tránh nhà điều hành chính giữa
                const lz = -hd - 2.6;
                for (const dx of [-3.5, 3.5]) {
                    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), steelMat);
                    p.position.set(x + dx, 1.6, lz);
                    group.add(p);
                }
                const roof = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.14, 3.6), roofBlueMat);
                roof.rotation.x = 0.12;
                roof.position.set(x, 3.25, lz);
                group.add(roof);
            }

            // Hàng dây đèn lồng đỏ-vàng rực rỡ giăng dọc cả bờ Bắc và hai đầu Đông - Tây
            for (let x = -hw + 4; x <= hw - 4; x += 8) {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.5, 6), steelMat);
                post.position.set(x, 1.75, -hd - 0.6);
                group.add(post);

                const lantern = new THREE.Mesh(
                    new THREE.SphereGeometry(0.28, 10, 10),
                    (Math.round(x / 8) % 2 === 0) ? lanternRed : lanternGold
                );
                lantern.scale.set(1, 1.25, 1);
                lantern.position.set(x, 3.3, -hd - 0.2);
                group.add(lantern);
            }
        }

        this.lakeGroup.add(group);
    }

    createEmbankmentAndTerrain() {
        const hw = this.lakeHalfW; // 85m
        const hd = this.lakeHalfD; // 55m
        const wallH = 0.68;
        const wallMat = new THREE.MeshStandardMaterial({
            map: this.stoneTex,
            roughness: 0.85,
            side: THREE.DoubleSide
        });

        // 4 Bờ kè đá hộc thẳng đứng bao quanh 4 cạnh mặt hồ chữ nhật (170m x 110m)
        const wallNorth = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.6, wallH, 0.35), wallMat);
        wallNorth.position.set(0, 0.12, -hd);
        this.lakeGroup.add(wallNorth);

        const wallSouth = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.6, wallH, 0.35), wallMat);
        wallSouth.position.set(0, 0.12, hd);
        this.lakeGroup.add(wallSouth);

        const wallEast = new THREE.Mesh(new THREE.BoxGeometry(0.35, wallH, hd * 2 + 0.6), wallMat);
        wallEast.position.set(hw, 0.12, 0);
        this.lakeGroup.add(wallEast);

        const wallWest = new THREE.Mesh(new THREE.BoxGeometry(0.35, wallH, hd * 2 + 0.6), wallMat);
        wallWest.position.set(-hw, 0.12, 0);
        this.lakeGroup.add(wallWest);

        // Viền bê tông đúc bo mép 4 cạnh bờ kè hồ chữ nhật (có khe co giãn và rêu chân kè)
        const curbW = 0.72;
        [
            { w: hw * 2 + curbW * 2, d: curbW, x: 0, z: -hd - curbW * 0.3, type: 'CURB', repX: 42, repY: 1 },
            { w: hw * 2 + curbW * 2, d: curbW, x: 0, z: hd + curbW * 0.3, type: 'CURB', repX: 42, repY: 1 },
            { w: curbW, d: hd * 2 + curbW * 2, x: hw + curbW * 0.3, z: 0, type: 'CURB', repX: 1, repY: 28 },
            { w: curbW, d: hd * 2 + curbW * 2, x: -hw - curbW * 0.3, z: 0, type: 'CURB', repX: 1, repY: 28 }
        ].forEach(c => {
            const curbMat = this.createConcreteMaterial(c.repX, c.repY);
            const curb = new THREE.Mesh(new THREE.BoxGeometry(c.w, 0.08, c.d), curbMat);
            curb.position.set(c.x, 0.44, c.z);
            curb.receiveShadow = true;
            curb.userData.pavementType = 'CURB';
            this.pavementMeshes.push(curb);
            this.lakeGroup.add(curb);
        });

        // Thảm cỏ xanh tự nhiên bao quanh 4 phía ngoài hồ chữ nhật (tiếp giáp ra cánh đồng lúa quê rộng mênh mông)
        const terrainMat = new THREE.MeshStandardMaterial({
            map: this.grassTex,
            roughness: 0.92,
            metalness: 0.02
        });
        const grassStripW = 280;
        [
            { w: (hw + grassStripW) * 2, d: grassStripW, x: 0, z: -hd - grassStripW / 2 - 0.3 },
            { w: (hw + grassStripW) * 2, d: grassStripW, x: 0, z: hd + grassStripW / 2 + 0.3 },
            { w: grassStripW, d: hd * 2 + 0.8, x: hw + grassStripW / 2 + 0.3, z: 0 },
            { w: grassStripW, d: hd * 2 + 0.8, x: -hw - grassStripW / 2 - 0.3, z: 0 }
        ].forEach(g => {
            const strip = new THREE.Mesh(new THREE.PlaneGeometry(g.w, g.d), terrainMat);
            strip.rotation.x = -Math.PI / 2;
            strip.position.set(g.x, 0.42, g.z);
            strip.receiveShadow = true;
            this.lakeGroup.add(strip);
        });

        // Dải sân bãi đệm Bê Tông Xoa Phẳng ven bờ kè (rộng 2.5m) cho cần thủ hạ ô câu, ghế dù & thùng câu đài
        const apronW = 2.5;
        const apronOff = 1.7;
        [
            { w: (hw + apronOff + apronW / 2) * 2, d: apronW, x: 0, z: -hd - apronOff, type: 'APRON_NORTH_SOUTH', repX: 48, repY: 1.2 },
            { w: (hw + apronOff + apronW / 2) * 2, d: apronW, x: 0, z: hd + apronOff, type: 'APRON_NORTH_SOUTH', repX: 48, repY: 1.2 },
            { w: apronW, d: (hd + apronOff - apronW / 2) * 2, x: hw + apronOff, z: 0, type: 'APRON_EAST_WEST', repX: 1.2, repY: 32 },
            { w: apronW, d: (hd + apronOff - apronW / 2) * 2, x: -hw - apronOff, z: 0, type: 'APRON_EAST_WEST', repX: 1.2, repY: 32 }
        ].forEach(a => {
            const apronMat = this.createConcreteMaterial(a.repX, a.repY);
            const apronMesh = new THREE.Mesh(new THREE.PlaneGeometry(a.w, a.d), apronMat);
            apronMesh.rotation.x = -Math.PI / 2;
            apronMesh.position.set(a.x, 0.434, a.z);
            apronMesh.receiveShadow = true;
            apronMesh.userData.pavementType = a.type;
            this.pavementMeshes.push(apronMesh);
            this.lakeGroup.add(apronMesh);
        });

        // Đường dạo trải Thảm Nhựa Đường Asphalt (Atphan) nhám đen than quanh hồ cho cần thủ kéo thùng và xe di chuyển (rộng 4.2m)
        const pathW = 4.2;
        const pathOff = 5.0;
        [
            { w: (hw + pathOff + pathW / 2) * 2, d: pathW, x: 0, z: -hd - pathOff, type: 'ROAD_NORTH_SOUTH', repX: 56, repY: 1.4 },
            { w: (hw + pathOff + pathW / 2) * 2, d: pathW, x: 0, z: hd + pathOff, type: 'ROAD_NORTH_SOUTH', repX: 56, repY: 1.4 },
            { w: pathW, d: (hd + pathOff - pathW / 2) * 2, x: hw + pathOff, z: 0, type: 'ROAD_EAST_WEST', repX: 1.4, repY: 36 },
            { w: pathW, d: (hd + pathOff - pathW / 2) * 2, x: -hw - pathOff, z: 0, type: 'ROAD_EAST_WEST', repX: 1.4, repY: 36 }
        ].forEach(p => {
            const pathMat = this.createAsphaltMaterial(p.repX, p.repY);
            const pathMesh = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), pathMat);
            pathMesh.rotation.x = -Math.PI / 2;
            pathMesh.position.set(p.x, 0.436, p.z);
            pathMesh.receiveShadow = true;
            pathMesh.userData.pavementType = p.type;
            this.pavementMeshes.push(pathMesh);
            this.lakeGroup.add(pathMesh);
        });

        // Hàng rào gỗ ven lối đi & cột đèn cao áp dọc chu vi hồ chữ nhật
        const postMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.8 });
        const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 });
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

        for (let i = 0; i < 56; i++) {
            const pt = this.getRectPerimeterPoint(i / 56, 5.2);

            const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.85, 0.14), postMat);
            post.position.set(pt.x, 0.82, pt.z);
            post.lookAt(pt.lookX, 0.82, pt.lookZ);
            this.lakeGroup.add(post);

            // Cột đèn cao áp mỗi 4 cọc
            if (i % 4 === 0) {
                const pole = new THREE.Group();
                const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5.4, 8), lampPoleMat);
                shaft.position.y = 2.7;
                pole.add(shaft);

                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.3, 6), lampPoleMat);
                arm.rotation.x = Math.PI / 2.5;
                arm.position.set(0, 5.15, 0.48);
                pole.add(arm);

                const lampHead = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), bulbMat);
                lampHead.position.set(0, 4.92, 0.98);
                pole.add(lampHead);

                pole.position.set(pt.x, 0.42, pt.z);
                pole.lookAt(pt.lookX, 0.42, pt.lookZ);
                this.lakeGroup.add(pole);
            }
        }
    }

    // XÂY DỰNG CÁNH ĐỒNG LÚA QUÊ VIỆT NAM BÁT NGÁT XUNG QUANH HỒ CÂU (Ô ruộng lúa xanh mướt & lúa chín vàng, bờ mẫu, mương nước, đàn trâu gặm cỏ, bù nhìn rơm & xóm làng xa xa)
    createVietnameseRicePaddyFields() {
        const paddyGroup = new THREE.Group();

        const lushMat = new THREE.MeshStandardMaterial({ map: this.riceLushTex, roughness: 0.88 });
        const youngMat = new THREE.MeshStandardMaterial({ map: this.riceYoungTex, roughness: 0.86 });
        const goldMat = new THREE.MeshStandardMaterial({ map: this.riceGoldTex, roughness: 0.85 });
        const paddyMats = [lushMat, youngMat, goldMat, lushMat];

        const dikeMat = new THREE.MeshStandardMaterial({ color: 0x4d6b35, roughness: 0.92 });
        const canalWaterMat = new THREE.MeshStandardMaterial({
            color: 0x0e7490,
            roughness: 0.15,
            metalness: 0.75
        });

        // 1. CÁC THỬA RUỘNG LÚA CHIA Ô BÀN CỜ BAO QUANH 4 PHÍA NGOÀI HỒ CÂU CHỮ NHẬT
        const plotW = 48;
        const plotD = 38;
        const gap = 2.4; // Bờ mẫu đất ngăn giữa các thửa ruộng

        let plotIdx = 0;
        for (let gx = -5; gx <= 5; gx++) {
            for (let gz = -5; gz <= 5; gz++) {
                const px = gx * (plotW + gap);
                const pz = gz * (plotD + gap);

                // Bỏ qua phần diện tích lòng hồ chữ nhật và đường dạo quanh hồ (|x| < 112 && |z| < 82)
                if (Math.abs(px) < 112 && Math.abs(pz) < 82) continue;
                // Giới hạn trong bán kính đồng ruộng 285m
                if (Math.abs(px) > 275 || Math.abs(pz) > 235) continue;

                const mat = paddyMats[(plotIdx * 3 + Math.abs(gx + gz)) % paddyMats.length];
                plotIdx++;

                // Mặt ruộng lúa
                const paddyPlot = new THREE.Mesh(new THREE.PlaneGeometry(plotW, plotD), mat);
                paddyPlot.rotation.x = -Math.PI / 2;
                paddyPlot.position.set(px, 0.44, pz);
                paddyPlot.receiveShadow = true;
                paddyGroup.add(paddyPlot);

                // Bờ mẫu đất đắp nổi bao quanh thửa ruộng
                const bundN = new THREE.Mesh(new THREE.BoxGeometry(plotW + gap, 0.18, gap * 0.75), dikeMat);
                bundN.position.set(px, 0.49, pz - plotD / 2 - gap * 0.4);
                paddyGroup.add(bundN);

                const bundW = new THREE.Mesh(new THREE.BoxGeometry(gap * 0.75, 0.18, plotD + gap), dikeMat);
                bundW.position.set(px - plotW / 2 - gap * 0.4, 0.49, pz);
                paddyGroup.add(bundW);
            }
        }

        // 2. MƯƠNG THỦY LỢI DẪN NƯỚC TƯỚI TIÊU CHẠY DỌC CÁNH ĐỒNG
        [-118, 118].forEach(cx => {
            const canal = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 420), canalWaterMat);
            canal.rotation.x = -Math.PI / 2;
            canal.position.set(cx, 0.45, 0);
            paddyGroup.add(canal);
        });

        // 3. ĐÀN TRÂU QUÊ VIỆT NAM ĐANG ĐỦNG ĐỈNH GẶM CỎ TRÊN BỜ ĐÊ & BỜ RUỘNG (6 CON TRÂU 3D)
        const buffaloMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.78 });
        const hornMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.5 });
        const buffaloSpots = [
            { x: -102, z: 68, rot: 0.6 },
            { x: -108, z: 74, rot: 1.1 },
            { x: 104, z: 64, rot: -0.8 },
            { x: 112, z: -48, rot: 2.2 },
            { x: -105, z: -52, rot: -1.4 },
            { x: 35, z: 86, rot: 0.3 }
        ];

        buffaloSpots.forEach(bs => {
            const buf = new THREE.Group();
            // Thân trâu tròn trịa
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.68, 12, 10), buffaloMat);
            torso.scale.set(0.85, 0.92, 1.65);
            torso.position.set(0, 1.05, 0);
            buf.add(torso);

            // Đầu trâu cúi gặm cỏ + cặp sừng cong hình cánh cung
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.68), buffaloMat);
            head.position.set(0, 0.92, 1.12);
            head.rotation.x = 0.42;
            buf.add(head);

            [-0.28, 0.28].forEach(hx => {
                const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.55, 8), hornMat);
                horn.position.set(hx, 1.12, 1.05);
                horn.rotation.z = hx > 0 ? -1.15 : 1.15;
                horn.rotation.x = -0.3;
                buf.add(horn);
            });

            // 4 Chân trâu
            [[-0.34, -0.65], [0.34, -0.65], [-0.34, 0.65], [0.34, 0.65]].forEach(([lx, lz]) => {
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.85, 8), buffaloMat);
                leg.position.set(lx, 0.42, lz);
                buf.add(leg);
            });

            buf.position.set(bs.x, 0.44, bs.z);
            buf.rotation.y = bs.rot;
            paddyGroup.add(buf);
        });

        // 4. BÙ NHÌN RƠM ĐỘI NÓN LÁ ĐỨNG GIỮA ĐỒNG LÚA ĐUỔI CHIM
        const strawMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.9 });
        const shirtScareMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.85 });
        const scarecrowSpots = [
            { x: -62, z: 88 },
            { x: 65, z: 92 },
            { x: -128, z: 18 },
            { x: 132, z: -15 }
        ];
        scarecrowSpots.forEach(sc => {
            const scGroup = new THREE.Group();
            const vStick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6), strawMat);
            vStick.position.y = 1.2;
            scGroup.add(vStick);

            const hStick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), strawMat);
            hStick.rotation.z = Math.PI / 2;
            hStick.position.y = 1.75;
            scGroup.add(hStick);

            const coat = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.95, 7), shirtScareMat);
            coat.position.y = 1.55;
            scGroup.add(coat);

            const headBall = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), strawMat);
            headBall.position.y = 2.15;
            scGroup.add(headBall);

            const hat = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.28, 12), strawMat);
            hat.position.y = 2.35;
            scGroup.add(hat);

            scGroup.position.set(sc.x, 0.44, sc.z);
            scGroup.lookAt(0, 0.44, 0);
            paddyGroup.add(scGroup);
        });

        // 5. HÀNG CỘT ĐIỆN BÊ TÔNG & XÓM LÀNG MÁI NGÓI ĐỎ THẤP THOÁNG CUỐI CÁNH ĐỒNG (KHÔNG CÒN NÚI NHỌN)
        const poleConcMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 });
        for (let p = -4; p <= 4; p++) {
            const pole = new THREE.Group();
            const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 9.5, 8), poleConcMat);
            col.position.y = 4.75;
            pole.add(col);

            const crossBar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.12), poleConcMat);
            crossBar.position.y = 8.9;
            pole.add(crossBar);

            pole.position.set(p * 42, 0.44, 112);
            paddyGroup.add(pole);
        }

        // Lũy tre làng & nhà mái ngói đỏ thấp thoáng phía chân trời xa (khoảng cách 195m - 230m)
        const houseWallMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.85 });
        const houseRoofMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7 });
        const villageCrownMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.9 });

        for (let v = 0; v < 24; v++) {
            const ang = (v / 24) * Math.PI * 2;
            const distX = 210 + (v % 3) * 18;
            const distZ = 165 + (v % 3) * 16;
            const vx = Math.cos(ang) * distX;
            const vz = Math.sin(ang) * distZ;

            const hamlet = new THREE.Group();
            // Mái nhà ngói đỏ truyền thống giữa đồng
            const walls = new THREE.Mesh(new THREE.BoxGeometry(7.5, 3.6, 5.2), houseWallMat);
            walls.position.y = 1.8;
            hamlet.add(walls);

            const roof = new THREE.Mesh(new THREE.ConeGeometry(6.2, 2.4, 4), houseRoofMat);
            roof.rotation.y = Math.PI / 4;
            roof.scale.set(1.25, 1.0, 0.88);
            roof.position.y = 4.7;
            hamlet.add(roof);

            // Lũy cây xanh / rặng nhãn, tre bao quanh nhà
            for (let t = -1; t <= 1; t += 2) {
                const grove = new THREE.Mesh(new THREE.SphereGeometry(3.8, 10, 8), villageCrownMat);
                grove.scale.set(1.3, 0.95, 1.1);
                grove.position.set(t * 5.8, 3.2, -1.5);
                hamlet.add(grove);
            }

            hamlet.position.set(vx, 0.44, vz);
            hamlet.lookAt(0, 0.44, 0);
            paddyGroup.add(hamlet);
        }

        this.lakeGroup.add(paddyGroup);
    }

    createClubhouseBuilding(lakeTitle) {
        const club = new THREE.Group();

        // Sân bê tông xoa phẳng nhà điều hành nhô ra mép bờ Bắc (z = -lakeHalfD - 3.4)
        const deckMat = this.createConcreteMaterial(8, 4);
        const deck = new THREE.Mesh(
            new THREE.BoxGeometry(20, 0.35, 9.5),
            deckMat
        );
        deck.position.set(0, 0.55, 0);
        deck.receiveShadow = true;
        deck.userData.pavementType = 'DECK';
        this.pavementMeshes.push(deck);
        club.add(deck);

        // Thân nhà chính tường sơn vàng kem truyền thống
        const mainWall = new THREE.Mesh(
            new THREE.BoxGeometry(15, 4.2, 6),
            new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.85 })
        );
        mainWall.position.set(0, 2.65, -0.8);
        club.add(mainWall);

        // Cửa kính lớn & khung gỗ
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(4.2, 2.8, 0.15),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.15 })
        );
        door.position.set(0, 2.0, 2.22);
        club.add(door);

        // Mái ngói đỏ 2 tầng cong truyền thống
        const roofMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.65 });
        const roof1 = new THREE.Mesh(new THREE.ConeGeometry(12.2, 2.6, 4), roofMat);
        roof1.rotation.y = Math.PI / 4;
        roof1.scale.set(1.38, 1.0, 0.78);
        roof1.position.set(0, 5.8, -0.6);
        club.add(roof1);

        const roof2 = new THREE.Mesh(new THREE.ConeGeometry(8.2, 2.0, 4), roofMat);
        roof2.rotation.y = Math.PI / 4;
        roof2.scale.set(1.38, 1.0, 0.78);
        roof2.position.set(0, 7.4, -0.6);
        club.add(roof2);

        // Cột gỗ hiên nhà & Đèn lồng đỏ
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x451a03 });
        const lanternMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        [-6.5, -2.5, 2.5, 6.5].forEach(px => {
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 4.2, 10), pillarMat);
            pillar.position.set(px, 2.6, 3.2);
            club.add(pillar);

            const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), lanternMat);
            lantern.scale.set(1, 1.25, 1);
            lantern.position.set(px, 4.1, 3.6);
            club.add(lantern);
        });

        // Biển hiệu lớn trên nóc hiên nhà (Canvas Texture)
        const signCanvas = document.createElement('canvas');
        signCanvas.width = 1024;
        signCanvas.height = 192;
        const sCtx = signCanvas.getContext('2d');
        sCtx.fillStyle = '#0f172a';
        sCtx.fillRect(0, 0, 1024, 192);
        sCtx.strokeStyle = '#facc15';
        sCtx.lineWidth = 10;
        sCtx.strokeRect(8, 8, 1008, 176);
        sCtx.fillStyle = '#facc15';
        sCtx.font = 'bold 64px "Segoe UI", sans-serif';
        sCtx.textAlign = 'center';
        sCtx.fillText(`🎣 ${lakeTitle.toUpperCase()}`, 512, 92);
        sCtx.fillStyle = '#38bdf8';
        sCtx.font = 'bold 40px "Segoe UI", sans-serif';
        sCtx.fillText('ĐẤU TRƯỜNG CHỮ NHẬT 170M - SĂN HÀNG CHÉP CỦ AI', 512, 152);

        const signTex = new THREE.CanvasTexture(signCanvas);
        const signBoard = new THREE.Mesh(
            new THREE.BoxGeometry(10.2, 1.65, 0.2),
            new THREE.MeshBasicMaterial({ map: signTex })
        );
        signBoard.position.set(0, 5.1, 3.3);
        club.add(signBoard);

        // Chủ hồ đứng ở hiên nhà điều hành quan sát mặt hồ & cần thủ ngồi bàn uống trà đá
        const owner = createRealisticHumanCharacter({
            shirtColor: 0xb91c1c,
            vestColor: 0x1e293b,
            pantsColor: 0x0f172a,
            hatColor: 0x78350f,
            pose: 'STANDING',
            hasVest: true
        });
        owner.position.set(0, 0.72, 3.4);
        club.add(owner);

        // Bàn trà đá cần thủ trên hiên gỗ
        const table = new THREE.Mesh(
            new THREE.CylinderGeometry(0.65, 0.65, 0.68, 14),
            new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 })
        );
        table.position.set(-4.2, 1.05, 2.8);
        club.add(table);

        const guest = createRealisticHumanCharacter({
            shirtColor: 0x047857,
            pantsColor: 0x1e293b,
            hatColor: 0x365314,
            pose: 'SEATED_FISHING',
            hasVest: false
        });
        guest.position.set(-4.2, 0.72, 2.2);
        club.add(guest);

        club.position.set(0, 0, -this.lakeHalfD - 3.4);
        this.lakeGroup.add(club);

        // Nhân viên hồ câu đi thu vé & đi tuần dọc đường dạo chữ nhật ven hồ (Animated Walking Human)
        this.walkingStaff = createRealisticHumanCharacter({
            shirtColor: 0xf59e0b,
            vestColor: 0x1e293b,
            pantsColor: 0x1e293b,
            hatColor: 0x365314,
            pose: 'WALKING',
            hasVest: true
        });
        this.walkingStaff.position.set(-4.5, 0.44, this.lakeHalfD + 3.1);

        // Biển tên nổi trên đầu Nhân Viên Thu Vé
        const staffCanvas = document.createElement('canvas');
        staffCanvas.width = 512;
        staffCanvas.height = 112;
        const stCtx = staffCanvas.getContext('2d');
        stCtx.fillStyle = 'rgba(15, 23, 42, 0.90)';
        stCtx.fillRect(0, 0, 512, 112);
        stCtx.strokeStyle = '#facc15';
        stCtx.lineWidth = 6;
        stCtx.strokeRect(4, 4, 504, 104);
        stCtx.fillStyle = '#fde047';
        stCtx.font = 'bold 34px "Segoe UI", sans-serif';
        stCtx.textAlign = 'center';
        stCtx.fillText('🎫 NHÂN VIÊN THU VÉ HỒ CÂU', 256, 48);
        stCtx.fillStyle = '#38bdf8';
        stCtx.font = 'bold 26px "Segoe UI", sans-serif';
        stCtx.fillText('Thu vé Ca 5h • 10h • 15h & Bấm giờ câu', 256, 88);

        const staffBadgeTex = new THREE.CanvasTexture(staffCanvas);
        const staffSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: staffBadgeTex, transparent: true }));
        staffSprite.position.set(0, 2.25, 0);
        staffSprite.scale.set(2.9, 0.65, 1);
        this.walkingStaff.add(staffSprite);
        this.lakeGroup.add(this.walkingStaff);

        // CỔNG CHÍNH HỒ CÂU ĐÀI DỊCH VỤ (Bờ Nam tại x = -8.0, z = 26.8) - Nơi mọi người đứng chờ Chủ Hồ ra mở cửa lúc 06:00 sáng
        this.createLakeEntranceGate(lakeTitle);
    }

    createLakeEntranceGate(lakeTitle) {
        const gateGroup = new THREE.Group();
        gateGroup.position.copy(this.gatePosition);

        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.78 });
        const trimMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.6, roughness: 0.3 });
        const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 });

        // 2 Trụ cổng gạch lớn 2 bên lối vào
        [-2.7, 2.7].forEach(px => {
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.68, 3.8, 0.68), pillarMat);
            pillar.position.set(px, 1.9, 0);
            pillar.castShadow = true;
            gateGroup.add(pillar);

            const cap = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.22, 0.84), trimMat);
            cap.position.set(px, 3.85, 0);
            gateGroup.add(cap);
        });

        // Hàng rào sắt nối dài 2 bên cổng để tạo khu vực đứng chờ ngoài cổng hồ
        [-7.2, 7.2].forEach(fx => {
            const fenceWall = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.85, 0.14), ironMat);
            fenceWall.position.set(fx, 0.95, 0);
            gateGroup.add(fenceWall);
        });

        // Bảng hiệu vòm cổng chính
        const archCanvas = document.createElement('canvas');
        archCanvas.width = 1024;
        archCanvas.height = 192;
        const aCtx = archCanvas.getContext('2d');
        aCtx.fillStyle = '#0f172a';
        aCtx.fillRect(0, 0, 1024, 192);
        aCtx.strokeStyle = '#facc15';
        aCtx.lineWidth = 10;
        aCtx.strokeRect(6, 6, 1012, 180);
        aCtx.fillStyle = '#fde047';
        aCtx.font = 'bold 54px "Segoe UI", sans-serif';
        aCtx.textAlign = 'center';
        aCtx.fillText(`⛩️ CỔNG VÀO ${lakeTitle.toUpperCase()}`, 512, 82);
        aCtx.fillStyle = '#34d399';
        aCtx.font = 'bold 36px "Segoe UI", sans-serif';
        aCtx.fillText('MỞ CỬA: 06:00 SÁNG • ĐÓNG CỬA: 21:00 TỐI (CA 5H / 10H / 15H)', 512, 146);

        const archTex = new THREE.CanvasTexture(archCanvas);
        const archBoard = new THREE.Mesh(
            new THREE.BoxGeometry(6.2, 1.15, 0.24),
            new THREE.MeshBasicMaterial({ map: archTex })
        );
        archBoard.position.set(0, 4.35, 0);
        gateGroup.add(archBoard);

        // 2 Cánh cổng sắt hoa văn có bản lề mở ra / đóng vào
        const buildGateLeaf = (isLeft) => {
            const pivot = new THREE.Group();
            pivot.position.set(isLeft ? -2.35 : 2.35, 0.15, 0);
            const leafW = 2.30;
            const dir = isLeft ? 1 : -1;

            // Khung ngang trên & dưới
            [0.2, 1.3, 2.5].forEach(ry => {
                const bar = new THREE.Mesh(new THREE.BoxGeometry(leafW, 0.07, 0.07), ironMat);
                bar.position.set(dir * (leafW / 2), ry, 0);
                pivot.add(bar);
            });
            // Các thanh song sắt đứng + mũi giáo vàng
            for (let b = 1; b <= 7; b++) {
                const bx = dir * (b / 8) * leafW;
                const picket = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.55, 8), ironMat);
                picket.position.set(bx, 1.35, 0);
                pivot.add(picket);

                const spear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), trimMat);
                spear.position.set(bx, 2.68, 0);
                pivot.add(spear);
            }
            return pivot;
        };

        this.gateLeftDoor = buildGateLeaf(true);
        this.gateRightDoor = buildGateLeaf(false);
        gateGroup.add(this.gateLeftDoor);
        gateGroup.add(this.gateRightDoor);

        // Chủ hồ đứng cạnh cổng cầm chìa khóa mở cổng lúc 6h sáng
        const ownerData = (this.currentLakeData && this.currentLakeData.owner) ? this.currentLakeData.owner : {
            name: 'Bác Chủ Hồ',
            title: 'Chủ Hồ',
            avatar: '🔑',
            shirtColor: 0xdc2626,
            pantsColor: 0x0f172a,
            hatColor: 0x78350f,
            hasVest: true
        };

        this.gateOwner = createRealisticHumanCharacter({
            shirtColor: ownerData.shirtColor || 0xdc2626,
            vestColor: 0x1e293b,
            pantsColor: ownerData.pantsColor || 0x0f172a,
            hatColor: ownerData.hatColor || 0x78350f,
            hatType: 'BUCKET',
            pose: 'STANDING',
            hasVest: ownerData.hasVest !== false
        });
        this.gateOwner.position.set(3.45, 0.02, -0.85);
        this.gateOwner.rotation.y = -0.35;

        const ownerCanvas = document.createElement('canvas');
        ownerCanvas.width = 512;
        ownerCanvas.height = 112;
        const oCtx = ownerCanvas.getContext('2d');
        oCtx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        oCtx.fillRect(0, 0, 512, 112);
        oCtx.strokeStyle = '#38bdf8';
        oCtx.lineWidth = 6;
        oCtx.strokeRect(4, 4, 504, 104);
        oCtx.fillStyle = '#fde047';
        oCtx.font = 'bold 32px "Segoe UI", sans-serif';
        oCtx.textAlign = 'center';
        oCtx.fillText(`${ownerData.avatar} ${ownerData.name.toUpperCase()}`, 256, 46);
        oCtx.fillStyle = '#38bdf8';
        oCtx.font = 'bold 24px "Segoe UI", sans-serif';
        oCtx.fillText(`${ownerData.title} • 06:00 Mở Cổng`, 256, 86);

        const ownerSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(ownerCanvas), transparent: true })
        );
        ownerSprite.position.set(0, 2.25, 0);
        ownerSprite.scale.set(2.8, 0.64, 1);
        this.gateOwner.add(ownerSprite);
        gateGroup.add(this.gateOwner);

        this.lakeGroup.add(gateGroup);
    }

    setGateOpen(isOpen) {
        this.isGateOpen = isOpen;
    }

    // Điều nhân viên hồ câu đi bộ trực tiếp ra bến của người chơi để thu tiền vé (Ca 5h / 10h / 15h)
    sendStaffToCollectTicket(spotPos, onArrivedCallback) {
        if (!this.walkingStaff || !spotPos) {
            if (onArrivedCallback) onArrivedCallback();
            return;
        }
        // Đặt nhân viên xuất phát ở đường dạo cách bến người chơi ~7.5m để người chơi nhìn thấy nhân viên đi bộ lại gần thu vé
        const approachOffset = spotPos.x >= 0 ? -7.2 : 7.2;
        const startX = THREE.MathUtils.clamp(spotPos.x + approachOffset, -this.lakeHalfW - 2, this.lakeHalfW + 2);
        const startZ = spotPos.z > 0 ? (this.lakeHalfD + 3.1) : (spotPos.z < -40 ? (-this.lakeHalfD - 3.1) : spotPos.z);
        this.walkingStaff.position.set(startX, 0.44, startZ);

        // Điểm dừng ngay cạnh thùng câu của người chơi
        this.staffTargetPos = new THREE.Vector3(
            spotPos.x + (spotPos.x >= 0 ? -1.65 : 1.65),
            0.44,
            spotPos.z + (spotPos.z > 0 ? 1.8 : -1.8)
        );
        this.staffOnArrived = onArrivedCallback;
        this.staffWaitAtSpotTimer = 0;
    }

    createSpinningAerators() {
        // 4 Máy quạt nước oxy phân bố dọc tim hồ chữ nhật hẹp (Z = 0)
        const positions = [
            new THREE.Vector3(-55, 0.05, 0),
            new THREE.Vector3(-18, 0.05, 0),
            new THREE.Vector3(18, 0.05, 0),
            new THREE.Vector3(55, 0.05, 0)
        ];

        const floatMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 });
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 });
        const paddleMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
        const foamMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.75
        });

        positions.forEach(pos => {
            const aerator = new THREE.Group();

            // 2 Phao nổi màu xanh đỡ máy quạt oxy
            [-0.9, 0.9].forEach(zOff => {
                const pontoon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 12), floatMat);
                pontoon.rotation.z = Math.PI / 2;
                pontoon.position.set(0, 0.08, zOff);
                aerator.add(pontoon);
            });

            // Motor ở giữa
            const motor = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.5, 0.65), frameMat);
            motor.position.set(0, 0.38, 0);
            aerator.add(motor);

            // Trục quay & các cánh quạt oxy
            const wheelPivot = new THREE.Group();
            wheelPivot.position.set(0, 0.22, 0);
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), frameMat);
            shaft.rotation.x = Math.PI / 2;
            wheelPivot.add(shaft);

            for (let side of [-0.65, 0.65]) {
                for (let b = 0; b < 6; b++) {
                    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.35), paddleMat);
                    blade.rotation.z = (b / 6) * Math.PI;
                    blade.position.z = side;
                    wheelPivot.add(blade);
                }
            }
            aerator.add(wheelPivot);
            this.aerators.push(wheelPivot);

            // Vệt bọt nước trắng xóa phía sau quạt oxy
            for (let f = 0; f < 10; f++) {
                const foam = new THREE.Mesh(
                    new THREE.CircleGeometry(0.35 + f * 0.12, 10),
                    foamMat.clone()
                );
                foam.rotation.x = -Math.PI / 2;
                foam.position.set(0.8 + f * 0.55, 0.02, (Math.random() - 0.5) * 1.1);
                aerator.add(foam);
                this.foamParticles.push({
                    mesh: foam,
                    baseX: 0.8 + f * 0.55,
                    phase: f * 0.6
                });
            }

            aerator.position.copy(pos);
            this.lakeGroup.add(aerator);
        });
    }

    createVietnameseFlora() {
        const floraGroup = new THREE.Group();

        // Vật liệu thân cây có vân vỏ cây rêu phong & lá cây chi tiết Alpha-Tested
        const barkMat = new THREE.MeshStandardMaterial({
            map: this.barkTex,
            roughness: 0.92
        });
        const leafCardMat = new THREE.MeshStandardMaterial({
            map: this.foliageTex,
            alphaTest: 0.32,
            transparent: true,
            side: THREE.DoubleSide,
            roughness: 0.72
        });
        const willowCurtainMat = new THREE.MeshStandardMaterial({
            map: this.willowTex,
            alphaTest: 0.28,
            transparent: true,
            side: THREE.DoubleSide,
            roughness: 0.68
        });
        const grassTuftMat = new THREE.MeshStandardMaterial({
            map: this.grassReedTex,
            alphaTest: 0.30,
            transparent: true,
            side: THREE.DoubleSide,
            roughness: 0.8
        });
        const bambooMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.45 });
        const bambooNodeMat = new THREE.MeshStandardMaterial({ color: 0xd9f99d, roughness: 0.6 });

        const createLeafClusterNode = (radius) => {
            const cluster = new THREE.Group();
            for (let p = 0; p < 4; p++) {
                const plane = new THREE.Mesh(
                    new THREE.PlaneGeometry(radius * 2.1, radius * 1.9),
                    leafCardMat
                );
                plane.rotation.y = (p / 4) * Math.PI;
                plane.rotation.x = (p % 2 === 0 ? 0.25 : -0.25);
                cluster.add(plane);
            }
            return cluster;
        };

        // 1. CÂY LIỄU RỦ, KHÓM TRE TRÚC & CÂY CỔ THỤ PHÂN CÀNH DỌC 4 BỜ HỒ CHỮ NHẬT (56 cụm cây)
        for (let i = 0; i < 56; i++) {
            const u = i / 56;
            const pt = this.getRectPerimeterPoint(u, 6.4 + (i % 3) * 3.2);
            // Chừa khoảng trống trước cổng nhà điều hành (Bờ Bắc x ~ 0) và Bến chính #1 (Bờ Nam x ~ 0)
            if (Math.abs(pt.x) < 15 && Math.abs(pt.z) > 48) continue;

            const x = pt.x;
            const z = pt.z;

            if (i % 3 === 0) {
                // CÂY LIỄU RỦ VEN HỒ
                const willow = new THREE.Group();
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.46, 4.4, 10), barkMat);
                trunk.position.y = 2.2;
                trunk.rotation.z = 0.14;
                willow.add(trunk);

                for (let b = 0; b < 4; b++) {
                    const bAng = (b / 4) * Math.PI * 2;
                    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.20, 2.6, 7), barkMat);
                    limb.position.set(Math.cos(bAng) * 0.85, 4.6, Math.sin(bAng) * 0.85);
                    limb.rotation.z = -Math.cos(bAng) * 0.55;
                    limb.rotation.x = Math.sin(bAng) * 0.55;
                    willow.add(limb);

                    const topCrown = createLeafClusterNode(1.8);
                    topCrown.position.set(Math.cos(bAng) * 1.5, 5.4, Math.sin(bAng) * 1.5);
                    willow.add(topCrown);
                }

                for (let v = 0; v < 14; v++) {
                    const vAng = (v / 14) * Math.PI * 2;
                    const rDist = 1.6 + (v % 2) * 0.85;
                    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.8), willowCurtainMat);
                    curtain.position.set(Math.cos(vAng) * rDist, 3.3, Math.sin(vAng) * rDist);
                    curtain.rotation.y = vAng + Math.PI / 2;
                    willow.add(curtain);
                    this.willowBranches.push({ mesh: curtain, phase: i + v * 0.4 });
                }

                willow.position.set(x, 0.4, z);
                willow.lookAt(pt.lookX, 0.4, pt.lookZ);
                floraGroup.add(willow);

            } else if (i % 3 === 1) {
                // KHÓM TRE TRÚC VIỆT NAM
                const bambooCluster = new THREE.Group();
                for (let s = 0; s < 8; s++) {
                    const h = 6.2 + (s % 3) * 1.9;
                    const stalkGroup = new THREE.Group();
                    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, h, 8), bambooMat);
                    stalk.position.y = h / 2;
                    stalkGroup.add(stalk);

                    for (let ny = 1.0; ny < h - 0.5; ny += 0.95) {
                        const nodeRing = new THREE.Mesh(
                            new THREE.TorusGeometry(0.072, 0.012, 6, 12),
                            bambooNodeMat
                        );
                        nodeRing.rotation.x = Math.PI / 2;
                        nodeRing.position.y = ny;
                        stalkGroup.add(nodeRing);
                    }

                    const leafSpray = createLeafClusterNode(1.35);
                    leafSpray.position.y = h - 0.4;
                    stalkGroup.add(leafSpray);

                    stalkGroup.position.set((Math.random() - 0.5) * 1.4, 0, (Math.random() - 0.5) * 1.4);
                    stalkGroup.rotation.z = (Math.random() - 0.5) * 0.22;
                    stalkGroup.rotation.x = (Math.random() - 0.5) * 0.22;
                    bambooCluster.add(stalkGroup);
                }
                bambooCluster.position.set(x, 0.4, z);
                floraGroup.add(bambooCluster);

            } else {
                // CÂY CỔ THỤ TÁN LÁ CHI TIẾT
                const tree = new THREE.Group();
                const h = 8.5 + (i % 4) * 2.0;
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.54, h * 0.48, 10), barkMat);
                trunk.position.y = h * 0.24;
                tree.add(trunk);

                for (let b = 0; b < 3; b++) {
                    const bAng = (b / 3) * Math.PI * 2 + i;
                    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 3.0, 8), barkMat);
                    branch.position.set(Math.cos(bAng) * 0.9, h * 0.48, Math.sin(bAng) * 0.9);
                    branch.rotation.z = -Math.cos(bAng) * 0.5;
                    branch.rotation.x = Math.sin(bAng) * 0.5;
                    tree.add(branch);

                    const canopy = createLeafClusterNode(2.4);
                    canopy.position.set(Math.cos(bAng) * 1.8, h * 0.62 + (b % 2) * 0.7, Math.sin(bAng) * 1.8);
                    tree.add(canopy);
                }

                const centerCanopy = createLeafClusterNode(2.8);
                centerCanopy.position.set(0, h * 0.74, 0);
                tree.add(centerCanopy);

                tree.position.set(x, 0.4, z);
                floraGroup.add(tree);
            }
        }

        // 2. BỤI CỎ DẠI 3D & BÔNG LAU TRẮNG MỌC DỌC BỜ KÈ ĐÁ VÀ LỐI ĐI CHỮ NHẬT (200 khóm cỏ 3D)
        for (let g = 0; g < 200; g++) {
            const isOuter = (g % 2 === 0);
            const offset = isOuter ? (5.0 + Math.random() * 2.8) : 0.4;
            const pt = this.getRectPerimeterPoint(g / 200, offset);
            if (Math.abs(pt.x) < 6 && Math.abs(pt.z) > 48) continue;

            const tuft = new THREE.Group();
            const hTuft = isOuter ? (0.85 + Math.random() * 0.55) : (0.55 + Math.random() * 0.35);
            for (let p = 0; p < 2; p++) {
                const bladePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.95, hTuft), grassTuftMat);
                bladePlane.position.y = hTuft * 0.48;
                bladePlane.rotation.y = (p * Math.PI) / 2 + g;
                tuft.add(bladePlane);
            }
            tuft.position.set(pt.x, 0.42, pt.z);
            floraGroup.add(tuft);
        }

        // 3. ĐẦM SEN HỒNG & LÁ SÚNG VEN 4 GÓC BỜ HỒ CHỮ NHẬT
        const padMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6, side: THREE.DoubleSide });
        const flowerMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.4 });
        const pistilMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

        for (let i = 0; i < 120; i++) {
            const pt = this.getRectPerimeterPoint(i / 120, -1.3 - (i % 5) * 0.68);
            if (Math.abs(pt.x) < 12 && pt.z > 0) continue; // Chừa khu vực bến chính

            const lx = pt.x;
            const lz = pt.z;

            const pad = new THREE.Mesh(
                new THREE.CircleGeometry(0.28 + (i % 3) * 0.12, 12, 0, Math.PI * 1.9),
                padMat
            );
            pad.rotation.x = -Math.PI / 2;
            pad.rotation.z = i * 1.1;
            pad.position.set(lx, 0.015, lz);
            floraGroup.add(pad);

            if (i % 4 === 0) {
                const lotus = new THREE.Group();
                const petals = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 7), flowerMat);
                petals.rotation.x = Math.PI;
                petals.position.y = 0.11;
                lotus.add(petals);

                const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), pistilMat);
                core.position.y = 0.16;
                lotus.add(core);

                lotus.position.set(lx + 0.08, 0.02, lz + 0.05);
                floraGroup.add(lotus);
            }
        }

        this.lakeGroup.add(floraGroup);
    }

    createPiersAndPegs() {
        // 6 BẾN CÂU ĐÀI BỐ TRÍ QUANH HỒ CHỮ NHẬT DÀI HẸP (170m x 44m) - NGỒI BỜ NÀY THẤY RÕ BỜ KIA
        this.fishingSpots = [
            {
                id: 'spot_1',
                name: 'Bến Đài Chính #01 (Bờ Nam Giữa)',
                desc: 'Tầm nhìn trực diện bến VIP bờ Bắc & hàng quạt nước tim hồ, cá AI lội giữa tim hồ',
                pos: new THREE.Vector3(0, 0.1, 18.0),
                targetLook: new THREE.Vector3(0, 0, -22)
            },
            {
                id: 'spot_2',
                name: 'Bến Rặng Tre Xanh #02 (Bờ Đông Nam)',
                desc: 'Góc Đông bờ Nam, nhìn thẳng sang chòi lá bờ đối diện, chép củ AI sục bùn mép quạt',
                pos: new THREE.Vector3(44.0, 0.1, 18.0),
                targetLook: new THREE.Vector3(44.0, 0, -22)
            },
            {
                id: 'spot_3',
                name: 'Bến Bờ Đông Săn Hàng #03 (Đầu Hồi Phải)',
                desc: 'Đánh dọc rãnh nước sâu đầu hồi phía Đông, chuyên săn trắm đen & chép cụ AI > 10kg',
                pos: new THREE.Vector3(81.0, 0.1, 0.0),
                targetLook: new THREE.Vector3(-20, 0, 0)
            },
            {
                id: 'spot_4',
                name: 'Bến Vịnh Sen Củ Gấu #04 (Bờ Tây Nam)',
                desc: 'Nằm phía Tây bờ Nam, mặt nước phẳng lặng, nhìn rõ cần thủ bờ đối diện giật cá',
                pos: new THREE.Vector3(-44.0, 0.1, 18.0),
                targetLook: new THREE.Vector3(-44.0, 0, -22)
            },
            {
                id: 'spot_5',
                name: 'Bến Bờ Tây Cội Liễu #05 (Đầu Hồi Trái)',
                desc: 'Bóng liễu rủ mát rượi đầu hồi phía Tây, đàn rô phi & diếc cụ AI quẫy kiếm ăn',
                pos: new THREE.Vector3(-81.0, 0.1, 0.0),
                targetLook: new THREE.Vector3(20, 0, 0)
            },
            {
                id: 'spot_6',
                name: 'Bến Bờ Bắc VIP #06 (Đối Diện Bến Chính)',
                desc: 'Bến VIP bờ Bắc, nhìn trực diện toàn bộ cần thủ bờ Nam, cá lớn đi ăn dọc mép kè',
                pos: new THREE.Vector3(42.0, 0.1, -18.0),
                targetLook: new THREE.Vector3(42.0, 0, 22)
            }
        ];

        const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.82 });
        const keepnetMat = new THREE.MeshBasicMaterial({ color: 0x0284c7, wireframe: true, transparent: true, opacity: 0.55 });
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.25 });
        const rubberMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.95 });

        this.fishingSpots.forEach((spot) => {
            const pierGroup = new THREE.Group();

            // 1. SÀN BÊ TÔNG ĐÀI THỦ ĐỔ MẺ KIÊN CỐ (Rộng 3.8m x Dài 5.6m, có khe co giãn)
            const deckMat = this.createConcreteMaterial(2, 3);
            const mainDeck = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.22, 5.6), deckMat);
            mainDeck.position.set(0, 0.24, 0);
            mainDeck.receiveShadow = true;
            mainDeck.userData.pavementType = 'DECK';
            this.pavementMeshes.push(mainDeck);
            pierGroup.add(mainDeck);

            // Gờ nẹp nhôm Inox bo viền mép bệ bê tông để kẹp bát khay mồi & gác cần đài
            const edgeFront = new THREE.Mesh(new THREE.BoxGeometry(3.84, 0.06, 0.06), frameMat);
            edgeFront.position.set(0, 0.35, 2.8);
            pierGroup.add(edgeFront);

            const edgeBack = new THREE.Mesh(new THREE.BoxGeometry(3.84, 0.06, 0.06), frameMat);
            edgeBack.position.set(0, 0.35, -2.8);
            pierGroup.add(edgeBack);

            // Thảm cao su chống trượt câu đài chuyên dụng trên mặt sàn bê tông
            const rubberPad = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.8), rubberMat);
            rubberPad.rotation.x = -Math.PI / 2;
            rubberPad.position.set(0, 0.352, -0.3);
            pierGroup.add(rubberPad);

            // 2. CẦU DẪN BÊ TÔNG NỐI THẲNG TỪ ĐƯỜNG DẠO VEN HỒ RA BỆ CÂU
            const walkMat = this.createConcreteMaterial(1.4, 3);
            const walkway = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 4.6), walkMat);
            walkway.position.set(0, 0.34, -4.2);
            walkway.receiveShadow = true;
            walkway.userData.pavementType = 'WALKWAY';
            this.pavementMeshes.push(walkway);
            pierGroup.add(walkway);

            // Cọc trụ bê tông đúc cắm sâu đáy hồ
            for (let px = -1.6; px <= 1.6; px += 3.2) {
                for (let pz = -2.2; pz <= 2.2; pz += 2.2) {
                    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.6, 12), postMat);
                    post.position.set(px, -0.6, pz);
                    pierGroup.add(post);
                }
            }

            // Rọng cá ngâm dưới nước bên hông sàn câu
            const keepnet = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.8, 12, 4, true), keepnetMat);
            keepnet.rotation.x = Math.PI / 3;
            keepnet.position.set(-1.35, -0.15, 2.2);
            pierGroup.add(keepnet);

            // Cọc biển số Ô Câu Đài
            const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), postMat);
            signPost.position.set(1.65, 0.85, -1.8);
            pierGroup.add(signPost);

            // Vòng định vị phát sáng nhẹ trên mặt sàn
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(0.75, 0.98, 28),
                new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(0, 0.34, 0.2);
            pierGroup.add(ring);

            pierGroup.position.copy(spot.pos);
            const look = spot.targetLook.clone().sub(spot.pos);
            pierGroup.rotation.y = Math.atan2(look.x, look.z);

            this.lakeGroup.add(pierGroup);
        });
    }

    // NÂNG CẤP CẢNH QUAN XUNG QUANH HỒ CÂU CHỮ NHẬT: 6 CHÒI LÁ NGHỈ MÁT, GHỀNH ĐÁ RÊU PHONG, CỜ GIẢI ĐẤU, XE CẦN THỦ & ĐÀN CÒ TRẮNG
    createUpgradedLakesideScenery() {
        const sceneryGroup = new THREE.Group();

        // 1. 6 CHÒI LÁ / LỀU TRE NGHỈ MÁT VEN HỒ CHỮ NHẬT
        const thatchMat = new THREE.MeshStandardMaterial({ color: 0xa16207, roughness: 0.92, side: THREE.DoubleSide });
        const bambooPillarMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.65 });
        const floorWoodMat = new THREE.MeshStandardMaterial({ map: this.woodTex, roughness: 0.78 });
        const lanternGlowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

        const gazeboPerimeterParams = [0.06, 0.24, 0.34, 0.44, 0.66, 0.84];
        gazeboPerimeterParams.forEach((u) => {
            const gz = new THREE.Group();
            const pt = this.getRectPerimeterPoint(u, 9.2);

            // Sàn gỗ lục giác
            const floor = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.9, 0.25, 6), floorWoodMat);
            floor.position.y = 0.55;
            floor.receiveShadow = true;
            gz.add(floor);

            // 6 Cột tre & Lan can gỗ
            for (let p = 0; p < 6; p++) {
                const pAng = (p / 6) * Math.PI * 2;
                const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.7, 8), bambooPillarMat);
                pillar.position.set(Math.cos(pAng) * 2.4, 1.9, Math.sin(pAng) * 2.4);
                pillar.castShadow = true;
                gz.add(pillar);
            }

            // Mái lá cọ 2 tầng truyền thống
            const roofLower = new THREE.Mesh(new THREE.ConeGeometry(3.5, 1.35, 6), thatchMat);
            roofLower.position.y = 3.65;
            roofLower.castShadow = true;
            gz.add(roofLower);

            const roofUpper = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.95, 6), thatchMat);
            roofUpper.position.y = 4.45;
            gz.add(roofUpper);

            // Bàn đá uống trà giữa chòi & đèn lồng ấm áp
            const stoneTable = new THREE.Mesh(
                new THREE.CylinderGeometry(0.75, 0.55, 0.65, 12),
                new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 })
            );
            stoneTable.position.y = 0.98;
            gz.add(stoneTable);

            const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), lanternGlowMat);
            lantern.position.y = 3.05;
            gz.add(lantern);

            gz.position.set(pt.x, 0, pt.z);
            gz.lookAt(pt.lookX, 0, pt.lookZ);
            sceneryGroup.add(gz);
        });

        // 2. GHỀNH ĐÁ TẢNG RÊU PHONG VEN MÉP NƯỚC HỒ CHỮ NHẬT
        const rockMat = new THREE.MeshStandardMaterial({
            map: this.stoneTex,
            color: 0x64748b,
            roughness: 0.88,
            flatShading: true
        });
        for (let r = 0; r < 38; r++) {
            const pt = this.getRectPerimeterPoint((r + 0.3) / 38, -0.35 + (r % 3) * 0.22);
            if (Math.abs(pt.x) < 12 && Math.abs(pt.z) > 48) continue;

            const boulder = new THREE.Mesh(
                new THREE.DodecahedronGeometry(0.45 + (r % 4) * 0.22, 1),
                rockMat
            );
            boulder.scale.set(1.35, 0.72, 1.15);
            boulder.position.set(pt.x, 0.12, pt.z);
            boulder.rotation.set(r * 0.4, r * 1.1, 0);
            sceneryGroup.add(boulder);
        }

        // 3. CỜ PHƯỚN GIẢI ĐẤU CÂU ĐÀI TUNG BAY QUANH ĐƯỜNG DẠO HỒ CHỮ NHẬT
        const flagColors = [0xef4444, 0xfacc15, 0x0284c7, 0x10b981];
        const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8 });
        for (let f = 0; f < 24; f++) {
            const pt = this.getRectPerimeterPoint((f + 0.5) / 24, 5.5);

            const fGroup = new THREE.Group();
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 3.8, 8), poleMat);
            pole.position.y = 1.9;
            fGroup.add(pole);

            const banner = new THREE.Mesh(
                new THREE.PlaneGeometry(0.65, 1.65, 4, 2),
                new THREE.MeshStandardMaterial({
                    color: flagColors[f % flagColors.length],
                    side: THREE.DoubleSide,
                    roughness: 0.6
                })
            );
            banner.position.set(0.34, 2.85, 0);
            fGroup.add(banner);
            this.tournamentFlags.push({ mesh: banner, phase: f * 0.7 });

            fGroup.position.set(pt.x, 0.42, pt.z);
            fGroup.lookAt(pt.lookX, 0.42, pt.lookZ);
            sceneryGroup.add(fGroup);
        }

        // 4. BÃI ĐỖ XE CẦN THỦ CẠNH NHÀ ĐIỀU HÀNH (2 Ô TÔ SUV SĂN HÀNG)
        const carColors = [0x1e293b, 0x991b1b];
        [-16.0, 16.0].forEach((cx, idx) => {
            const car = new THREE.Group();
            const bodyMat = new THREE.MeshStandardMaterial({
                color: carColors[idx],
                metalness: 0.75,
                roughness: 0.2
            });
            const glassMat = new THREE.MeshStandardMaterial({
                color: 0x0f172a,
                metalness: 0.9,
                roughness: 0.1
            });
            const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.4), bodyMat);
            chassis.position.y = 0.65;
            chassis.castShadow = true;
            car.add(chassis);

            const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.65, 2.5), bodyMat);
            cabin.position.set(0, 1.32, -0.2);
            car.add(cabin);

            const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.52, 2.3), glassMat);
            windshield.position.set(0, 1.32, -0.2);
            car.add(windshield);

            // Bao đựng cần câu đài buộc trên giá nóc xe SUV
            const rodCase = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.12, 2.2, 10),
                new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 })
            );
            rodCase.rotation.x = Math.PI / 2;
            rodCase.position.set(0, 1.75, -0.2);
            car.add(rodCase);

            car.position.set(cx, 0.42, -this.lakeHalfD - 5.2);
            car.rotation.y = idx === 0 ? 0.35 : -0.35;
            sceneryGroup.add(car);
        });

        // 5. ĐÀN CÒ TRẮNG 3D BAY LƯỢN TRÊN BẦU TRỜI HỒ CÂU
        const birdMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide });
        for (let b = 0; b < 10; b++) {
            const bird = new THREE.Group();
            const body = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.65, 6), birdMat);
            body.rotation.x = Math.PI / 2;
            bird.add(body);

            const leftWing = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.28), birdMat);
            leftWing.position.set(-0.35, 0, 0);
            leftWing.rotation.x = -Math.PI / 2;
            bird.add(leftWing);

            const rightWing = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.28), birdMat);
            rightWing.position.set(0.35, 0, 0);
            rightWing.rotation.x = -Math.PI / 2;
            bird.add(rightWing);

            this.lakeGroup.add(bird);
            this.flyingBirds.push({
                group: bird,
                leftWing,
                rightWing,
                angle: (b / 10) * Math.PI * 2,
                radius: 42 + (b % 3) * 14,
                height: 16 + (b % 4) * 3.5,
                speed: 0.18 + (b % 2) * 0.05,
                phase: b * 0.9
            });
        }

        this.lakeGroup.add(sceneryGroup);
    }

    update(delta, bubbleSystem = null) {
        // 0. Thời tiết ổn định theo nhiều ngày thật (được điều phối tự nhiên từ LakeOperations theo từng ngày, không đổi loạn xạ mỗi phút)
        if (this.cloudsGroup) {
            const cloudSpd = this.weather === 'RAINY' ? 0.008 : (this.weather === 'CLOUDY' ? 0.005 : 0.0025);
            this.cloudsGroup.rotation.y += delta * cloudSpd;
        }

        // 1. NỘI SUY MÀU NƯỚC HỒ & ĐỘ ĐỤC (NẮNG TRONG XANH / NHIỀU MÂY XANH TRẦM / MƯA ĐỤC PHÙ SA)
        const lerpWeather = Math.min(1.0, delta * 1.6);
        this.waterTurbidity += (this.targetTurbidity - this.waterTurbidity) * lerpWeather;

        let targetWaterCol = this.sunnyWaterColor;
        if (this.weather === 'RAINY') {
            targetWaterCol = this.rainyWaterColor;
        } else if (this.weather === 'CLOUDY') {
            targetWaterCol = this.sunnyWaterColor.clone().lerp(new THREE.Color(0x2d5a58), 0.45);
        }
        this.currentWaterColor.lerp(targetWaterCol, lerpWeather);

        if (this.waterMaterial) {
            this.waterMaterial.color.copy(this.currentWaterColor);
            // Nước giữ độ sáng dịu tự nhiên (không tối đen như kim loại), dễ soi tăm phao cả trời nắng, nhiều mây lẫn mưa
            const targetEmissive = this.weather === 'RAINY'
                ? new THREE.Color(0x282316)
                : (this.weather === 'CLOUDY' ? new THREE.Color(0x16383b) : new THREE.Color(0x104642));
            this.waterMaterial.emissive.lerp(targetEmissive, lerpWeather);
            this.waterMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.36, 0.42, this.waterTurbidity);
            this.waterMaterial.roughness = THREE.MathUtils.lerp(0.22, 0.36, this.waterTurbidity);
            this.waterMaterial.metalness = THREE.MathUtils.lerp(0.14, 0.06, this.waterTurbidity);
            const nScale = THREE.MathUtils.lerp(0.12, 0.22, this.waterTurbidity);
            this.waterMaterial.normalScale.set(nScale, nScale);
        }

        // Cập nhật bầu trời, mây Volumetric FBM và ánh sáng theo Thời Tiết + Giờ Trong Ngày (Bình Minh / Trưa / Hoàng Hôn / Câu Đêm)
        const h = this.currentHour || 9.0;
        const isDawn = h < 7.4;
        const isSunset = h >= 16.5 && h < 18.6;
        const isNight = h >= 18.6;

        if (this.skyMesh && this.skyMesh.material && this.skyMesh.material.uniforms) {
            const u = this.skyMesh.material.uniforms;
            let topHex = 0x2563eb, midHex = 0x7dd3fc, botHex = 0xeff6ff;
            if (isNight) {
                topHex = 0x091326; midHex = 0x162a4a; botHex = 0x274066;
            } else if (isSunset) {
                topHex = 0x3b2d5e; midHex = 0xd97742; botHex = 0xfdba74;
            } else if (isDawn) {
                topHex = 0x3b6cb7; midHex = 0x93c5fd; botHex = 0xfed7aa;
            }
            if (this.weather === 'RAINY') {
                topHex = isNight ? 0x070d19 : 0x1e293b;
                midHex = isNight ? 0x111d33 : 0x475569;
                botHex = isNight ? 0x1e2d45 : 0x94a3b8;
            } else if (this.weather === 'CLOUDY') {
                topHex = isNight ? 0x0b1424 : 0x475569;
                midHex = isNight ? 0x18263d : 0x8ea0b5;
                botHex = isNight ? 0x243652 : 0xcbd5e1;
            }
            u.topColor.value.lerp(new THREE.Color(topHex), lerpWeather);
            u.midColor.value.lerp(new THREE.Color(midHex), lerpWeather);
            u.bottomColor.value.lerp(new THREE.Color(botHex), lerpWeather);
            if (u.uTime) u.uTime.value += delta;
            if (u.uRainFactor) {
                const targetRain = this.weather === 'RAINY' ? 1.0 : (this.weather === 'CLOUDY' ? 0.55 : 0.0);
                u.uRainFactor.value += (targetRain - u.uRainFactor.value) * lerpWeather;
            }
        }

        if (this.cloudSpriteMaterials && this.cloudSpriteMaterials.length > 0) {
            let cloudHex = this.weather === 'RAINY' ? 0x64748b : (this.weather === 'CLOUDY' ? 0xb4c2d0 : 0xffffff);
            if (isSunset) cloudHex = 0xfdba74;
            else if (isDawn) cloudHex = 0xffedd5;
            else if (isNight) cloudHex = 0x334155;
            const targetCloudTint = new THREE.Color(cloudHex);
            this.cloudSpriteMaterials.forEach(mat => {
                mat.color.lerp(targetCloudTint, lerpWeather);
            });
        }

        if (this.sunLight && this.hemiLight) {
            // Ngọn lửa trại tại Lán Trại bập bùng tự nhiên
            if (this.campFireFlame && this.campFireLight) {
                const flick = 0.88 + Math.sin(performance.now() * 0.014) * 0.15;
                this.campFireFlame.scale.set(flick, 0.85 + Math.sin(performance.now() * 0.021) * 0.22, flick);
                this.campFireLight.intensity = 2.4 + Math.sin(performance.now() * 0.018) * 0.65;
            }
            let targetSunInt = this.weather === 'RAINY' ? 0.55 : (this.weather === 'CLOUDY' ? 0.95 : 1.55);
            let targetHemiInt = this.weather === 'RAINY' ? 0.62 : (this.weather === 'CLOUDY' ? 0.82 : 0.95);
            let sunColorHex = this.weather === 'CLOUDY' ? 0xe2e8f0 : 0xfffbeb;
            if (isNight) {
                targetSunInt = 0.32;
                targetHemiInt = 0.55; // Vẫn đủ sáng dịu để nhìn rõ bờ đối diện & tăm phao câu đêm
                sunColorHex = 0x93c5fd;
            } else if (isSunset) {
                targetSunInt = this.weather === 'RAINY' ? 0.5 : (this.weather === 'CLOUDY' ? 0.82 : 1.25);
                targetHemiInt = 0.78;
                sunColorHex = 0xfb923c;
            } else if (isDawn) {
                targetSunInt = this.weather === 'RAINY' ? 0.52 : (this.weather === 'CLOUDY' ? 0.85 : 1.18);
                targetHemiInt = 0.82;
                sunColorHex = 0xfde68a;
            }
            this.sunLight.intensity += (targetSunInt - this.sunLight.intensity) * lerpWeather;
            this.hemiLight.intensity += (targetHemiInt - this.hemiLight.intensity) * lerpWeather;
            this.sunLight.color.lerp(new THREE.Color(sunColorHex), lerpWeather);

            // Di chuyển góc mặt trời từ Đông sang Tây theo giờ hồ (6h -> 18h)
            const dayProgress = THREE.MathUtils.clamp((h - 6.0) / 12.0, 0, 1);
            const sunAngle = dayProgress * Math.PI;
            this.sunLight.position.set(
                Math.cos(sunAngle) * 85,
                Math.max(18, Math.sin(sunAngle) * 85),
                -70
            );
        }

        if (this.scene.fog) {
            let fogHex = this.weather === 'RAINY' ? 0x64748b : (this.weather === 'CLOUDY' ? 0x9fb0c4 : 0xdbeafe);
            if (isNight) fogHex = 0x17253d;
            else if (isSunset) fogHex = 0xd99b78;
            else if (isDawn) fogHex = 0xe8d5c4;
            this.scene.fog.color.lerp(new THREE.Color(fogHex), lerpWeather);
            const targetDensity = this.weather === 'RAINY' ? 0.0038 : (this.weather === 'CLOUDY' ? 0.0024 : (isNight ? 0.0024 : 0.0016));
            this.scene.fog.density += (targetDensity - this.scene.fog.density) * lerpWeather;
        }

        // 2. CẬP NHẬT HẠT MƯA RÀO 3D & GỢN SÓNG MƯA RƠI TRÊN MẶT HỒ CHỮ NHẬT
        if (this.rainSystem && this.rainSystem.visible) {
            const posAttr = this.rainSystem.geometry.attributes.position;
            const arr = posAttr.array;
            const fallDist = delta * 34.0;
            for (let i = 0; i < this.rainDropCount; i++) {
                const idx = i * 6;
                arr[idx + 1] -= fallDist;
                arr[idx + 4] -= fallDist;
                if (arr[idx + 4] < 0) {
                    const newY = 38 + Math.random() * 6;
                    arr[idx + 1] = newY;
                    arr[idx + 4] = newY - 1.35;
                }
            }
            posAttr.needsUpdate = true;

            if (bubbleSystem) {
                this.rainRippleCooldown -= delta;
                if (this.rainRippleCooldown <= 0) {
                    this.rainRippleCooldown = 0.05;
                    const rx = (Math.random() - 0.5) * (this.lakeHalfW * 1.9);
                    const rz = (Math.random() - 0.5) * (this.lakeHalfD * 1.9);
                    bubbleSystem.spawnRipple(rx, rz, 0.35);
                }
            }
        }

        if (this.waterNormalTex) {
            const waveSpeed = this.weather === 'RAINY' ? 1.65 : 1.0;
            this.waterNormalTex.offset.x += delta * 0.016 * waveSpeed;
            this.waterNormalTex.offset.y += delta * 0.011 * waveSpeed;
        }

        // 3. Quay các guồng quạt nước oxy & làm bọt nước dập dềnh
        const now = performance.now() * 0.001;
        this.aerators.forEach(wheel => {
            wheel.rotation.z -= delta * 6.5;
        });

        this.foamParticles.forEach(fp => {
            const wave = (now * 1.8 + fp.phase) % 1.0;
            fp.mesh.position.x = fp.baseX + wave * 1.4;
            fp.mesh.material.opacity = (1.0 - wave) * 0.65;
        });

        // 4. Cành liễu & Cờ giải đấu đung đưa theo gió
        const windAmp = this.weather === 'RAINY' ? 1.85 : 1.0;
        this.willowBranches.forEach(wb => {
            wb.mesh.rotation.z = Math.sin(now * 1.6 + wb.phase) * 0.08 * windAmp;
            wb.mesh.rotation.x = Math.cos(now * 1.2 + wb.phase) * 0.05 * windAmp;
        });

        this.tournamentFlags.forEach(fl => {
            fl.mesh.rotation.y = Math.sin(now * 4.5 + fl.phase) * 0.25 * windAmp;
        });

        // 5. Đàn cò trắng bay lượn trên bầu trời hồ câu
        this.flyingBirds.forEach(b => {
            b.angle += delta * b.speed;
            const bx = Math.cos(b.angle) * b.radius * 1.25;
            const bz = Math.sin(b.angle) * b.radius * 0.85;
            const nextX = Math.cos(b.angle + 0.05) * b.radius * 1.25;
            const nextZ = Math.sin(b.angle + 0.05) * b.radius * 0.85;
            b.group.position.set(bx, b.height + Math.sin(now * 1.5 + b.phase) * 0.6, bz);
            b.group.lookAt(nextX, b.group.position.y, nextZ);

            const flap = Math.sin(now * 7.5 + b.phase) * 0.48;
            b.leftWing.rotation.z = flap;
            b.rightWing.rotation.z = -flap;
        });

        // 5.5. Hoạt ảnh mở / đóng 2 cánh cổng sắt Hồ Câu lúc 06:00 Sáng & 21:00 Tối
        const targetGate = this.isGateOpen ? 1.0 : 0.0;
        this.gateOpenProgress += (targetGate - this.gateOpenProgress) * Math.min(1.0, delta * 3.2);
        if (this.gateLeftDoor && this.gateRightDoor) {
            this.gateLeftDoor.rotation.y = -this.gateOpenProgress * Math.PI * 0.56;
            this.gateRightDoor.rotation.y = this.gateOpenProgress * Math.PI * 0.56;
        }
        if (this.gateOwner && this.gateOwner.userData && this.gateOwner.userData.rightArm) {
            // Chủ hồ vẫy tay mời anh em cần thủ vào chạy chỗ khi cổng mở
            const wave = this.isGateOpen ? (-0.95 + Math.sin(now * 6.0) * 0.28) : -0.15;
            this.gateOwner.userData.rightArm.shoulderPivot.rotation.x = wave;
        }

        // 6. Hoạt ảnh bước đi của nhân viên hồ câu (Đi ra bến thu tiền vé Ca 5h/10h/15h hoặc đi tuần quanh hồ)
        if (this.walkingStaff) {
            let isMoving = true;
            if (this.staffTargetPos) {
                const dx = this.staffTargetPos.x - this.walkingStaff.position.x;
                const dz = this.staffTargetPos.z - this.walkingStaff.position.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0.35) {
                    const step = Math.min(dist, delta * 3.8);
                    this.walkingStaff.position.x += (dx / dist) * step;
                    this.walkingStaff.position.z += (dz / dist) * step;
                    this.walkingStaff.position.y = 0.44;
                    this.walkingStaff.lookAt(this.staffTargetPos.x, 0.44, this.staffTargetPos.z);
                } else {
                    isMoving = false;
                    // Đã đi bộ tới ngay cạnh thùng câu của người chơi -> Mở bảng thu tiền vé!
                    if (this.staffOnArrived) {
                        const cb = this.staffOnArrived;
                        this.staffOnArrived = null;
                        this.staffWaitAtSpotTimer = 6.0;
                        cb();
                    }
                    this.staffWaitAtSpotTimer -= delta;
                    if (this.staffWaitAtSpotTimer <= 0) {
                        this.staffTargetPos = null;
                    }
                }
            } else {
                this.walkingAngle = (this.walkingAngle + delta * 0.008) % 1.0;
                const ptNow = this.getRectPerimeterPoint(this.walkingAngle, 3.1);
                const ptNext = this.getRectPerimeterPoint((this.walkingAngle + 0.004) % 1.0, 3.1);

                this.walkingStaff.position.set(ptNow.x, 0.44, ptNow.z);
                this.walkingStaff.lookAt(ptNext.x, 0.44, ptNext.z);
            }

            const ud = this.walkingStaff.userData;
            if (ud && ud.rightLeg && ud.leftLeg && ud.rightArm && ud.leftArm) {
                const stride = isMoving ? Math.sin(now * 6.2) * 0.48 : 0;
                ud.rightLeg.hipPivot.rotation.x = stride;
                ud.leftLeg.hipPivot.rotation.x = -stride;
                ud.rightLeg.kneePivot.rotation.x = Math.max(0, -stride * 0.7);
                ud.leftLeg.kneePivot.rotation.x = Math.max(0, stride * 0.7);
                ud.rightArm.shoulderPivot.rotation.x = isMoving ? (-stride * 0.65) : -0.45;
                ud.leftArm.shoulderPivot.rotation.x = stride * 0.65;
            }
        }
    }
}
