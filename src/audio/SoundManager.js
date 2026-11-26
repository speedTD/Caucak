// Hệ thống tạo và tổng hợp âm thanh chân thực bằng Web Audio API
// Không cần tải file mp3 bên ngoài, hoạt động 100% độc lập, mượt mà và cực kỳ sống động!

class SoundManager {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
        this.ambientGain = null;
        this.waterGain = null;
        this.reelOsc = null;
        this.lineSingLoop = null;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.setupAmbient();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            this.stopLineSingLoop();
            this.stopWaterCutLoop();
        }
        if (this.ambientGain && this.ctx) {
            this.ambientGain.gain.setTargetAtTime(this.isMuted ? 0.0 : 0.06, this.ctx.currentTime, 0.05);
        }
        return this.isMuted;
    }

    setupAmbient() {
        if (!this.ctx) return;

        // Tiếng gió và sóng nước nền nhẹ nhàng
        const bufferSize = this.ctx.sampleRate * 2;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(320, this.ctx.currentTime);

        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.setValueAtTime(0.06, this.ctx.currentTime);

        whiteNoise.connect(filter);
        filter.connect(this.ambientGain);
        this.ambientGain.connect(this.ctx.destination);

        whiteNoise.start();
    }

    // Tiếng bõm ném mồi / mồi xả chạm nước
    playWaterSplash(strength = 1.0) {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        // Tần số dao động nước
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(260 * strength, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.35);

        gain.gain.setValueAtTime(0.35 * strength, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.4);

        // Thêm tiếng bọt nước văng
        const noiseLength = 0.25;
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * noiseLength, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.08));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(800, now);
        noiseFilter.Q.setValueAtTime(3.0, now);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.2 * strength, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseLength);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);

        noise.start(now);
    }

    // Tiếng sủi bọt tăm siêu nhẹ thoang thoảng (gần như không nghe thấy)
    playFishBubble() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
            const timeOffset = now + i * 0.09 + Math.random() * 0.04;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            const startFreq = 420 + Math.random() * 280;
            const endFreq = startFreq + 200 + Math.random() * 120;
            osc.frequency.setValueAtTime(startFreq, timeOffset);
            osc.frequency.exponentialRampToValueAtTime(endFreq, timeOffset + 0.08);

            gain.gain.setValueAtTime(0.007, timeOffset);
            gain.gain.exponentialRampToValueAtTime(0.0005, timeOffset + 0.085);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(timeOffset);
            osc.stop(timeOffset + 0.09);
        }
    }

    // Tiếng đanh dứt khoát + vụt gió cần carbon + cước rít bật căng khi giật trúng miệng cá (Hookset)
    playHooksetSuccess(fishWeight = 3.0) {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const weightFactor = Math.min(1.5, 0.75 + (fishWeight / 10));

        // 1. Tiếng vụt cần carbon xé gió (Whip Whoosh)
        const whipDur = 0.22;
        const whipBuf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * whipDur), this.ctx.sampleRate);
        const wData = whipBuf.getChannelData(0);
        for (let i = 0; i < wData.length; i++) {
            const t = i / wData.length;
            wData[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI);
        }
        const whipNoise = this.ctx.createBufferSource();
        whipNoise.buffer = whipBuf;

        const whipFilter = this.ctx.createBiquadFilter();
        whipFilter.type = 'bandpass';
        whipFilter.frequency.setValueAtTime(520, now);
        whipFilter.frequency.exponentialRampToValueAtTime(2400 * weightFactor, now + 0.09);
        whipFilter.frequency.exponentialRampToValueAtTime(750, now + whipDur);
        whipFilter.Q.setValueAtTime(2.6, now);

        const whipGain = this.ctx.createGain();
        whipGain.gain.setValueAtTime(0.32, now);
        whipGain.gain.exponentialRampToValueAtTime(0.001, now + whipDur);

        whipNoise.connect(whipFilter);
        whipFilter.connect(whipGain);
        whipGain.connect(this.ctx.destination);
        whipNoise.start(now);

        // 2. Tiếng "ĐANH" đóng lưỡi găm hàm cá
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(620, now + 0.07);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.24);

        gain.gain.setValueAtTime(0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.3);

        // 3. Tiếng cước bật căng rít gió tức thì "ZÍTTTTT!" ngay khi đóng dính cá
        setTimeout(() => {
            this.playLineSing(Math.min(1.0, 0.55 + fishWeight * 0.045), true);
        }, 55);

        this.playWaterSplash(Math.min(1.5, 1.0 + fishWeight * 0.06));
    }

    // Tiếng giật trượt / hụt mồi
    playHooksetMiss() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.2);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.25);
    }

    // Tiếng cước đài căng rít xé nước & xé gió "ZÍTTTTT... XÈÈÈÈ..." chân thực khi cá lớn chạy rẽ nước
    playLineSing(tensionRatio = 0.5, isFastSlice = false) {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const dur = isFastSlice ? 0.34 : 0.25;

        // 1. Âm rít dây cước căng tần số cao (Dual Harmonic Whine - dây trục cắt gió)
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const toneGain = this.ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'triangle';

        const baseFreq = 920 + tensionRatio * 1450 + (isFastSlice ? 280 : 0);
        const targetFreq = baseFreq + 220 + Math.random() * 140;

        osc1.frequency.setValueAtTime(baseFreq, now);
        osc1.frequency.exponentialRampToValueAtTime(targetFreq, now + dur * 0.75);
        osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.92, now + dur);

        // Hòa âm bậc 2 lệch nhẹ tạo độ ngân kim loại của dây cước căng cứng
        osc2.frequency.setValueAtTime(baseFreq * 1.498, now);
        osc2.frequency.exponentialRampToValueAtTime(targetFreq * 1.502, now + dur * 0.75);

        const toneFilter = this.ctx.createBiquadFilter();
        toneFilter.type = 'bandpass';
        toneFilter.frequency.setValueAtTime(baseFreq * 1.25, now);
        toneFilter.Q.setValueAtTime(6.5, now);

        const vol = (0.09 + tensionRatio * 0.16) * (isFastSlice ? 1.3 : 1.0);
        toneGain.gain.setValueAtTime(0.001, now);
        toneGain.gain.linearRampToValueAtTime(vol, now + 0.03);
        toneGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc1.connect(toneFilter);
        osc2.connect(toneFilter);
        toneFilter.connect(toneGain);
        toneGain.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + dur + 0.02);
        osc2.stop(now + dur + 0.02);

        // 2. Âm thanh dây cước rẽ mặt nước xèo xèo (Water-Splitting Hiss)
        const bufferSize = Math.floor(this.ctx.sampleRate * dur);
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            const env = Math.sin((i / bufferSize) * Math.PI);
            data[i] = (Math.random() * 2 - 1) * env;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const sliceFilter = this.ctx.createBiquadFilter();
        sliceFilter.type = 'bandpass';
        sliceFilter.frequency.setValueAtTime(2400 + tensionRatio * 1600, now);
        sliceFilter.frequency.linearRampToValueAtTime(3600 + tensionRatio * 1200, now + dur);
        sliceFilter.Q.setValueAtTime(3.2, now);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime((0.08 + tensionRatio * 0.14) * (isFastSlice ? 1.4 : 1.0), now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        noise.connect(sliceFilter);
        sliceFilter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);

        noise.start(now);
    }

    // ==================== HỆ THỐNG CƯỚC RÍT LIÊN TỤC ĐỘNG THEO CÁ CHẠY ====================
    startLineSingLoop() {
        if (!this.ctx || this.isMuted || this.lineSingLoop) return;
        const now = this.ctx.currentTime;

        // 1. Hai bộ dao động hòa âm dây cước căng (Singing Monofilament / Carbon Line)
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'triangle';
        lfo.type = 'sine';

        osc1.frequency.setValueAtTime(860, now);
        osc2.frequency.setValueAtTime(860 * 1.503, now);
        lfo.frequency.setValueAtTime(7.5, now);
        lfoGain.gain.setValueAtTime(22, now);

        // Rung nhẹ tần số tạo độ rung tự nhiên của dây cước xé gió
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);

        const toneFilter = this.ctx.createBiquadFilter();
        toneFilter.type = 'bandpass';
        toneFilter.frequency.setValueAtTime(1250, now);
        toneFilter.Q.setValueAtTime(5.5, now);

        const toneGain = this.ctx.createGain();
        toneGain.gain.setValueAtTime(0.0001, now);

        osc1.connect(toneFilter);
        osc2.connect(toneFilter);
        toneFilter.connect(toneGain);
        toneGain.connect(this.ctx.destination);

        // 2. Tiếng dây cước cắt mặt nước liên tục (Water Slicing Hiss)
        const bufSize = this.ctx.sampleRate * 2;
        const noiseBuf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = noiseBuf;
        noiseSrc.loop = true;

        const sliceFilter = this.ctx.createBiquadFilter();
        sliceFilter.type = 'bandpass';
        sliceFilter.frequency.setValueAtTime(2600, now);
        sliceFilter.Q.setValueAtTime(2.8, now);

        const sliceGain = this.ctx.createGain();
        sliceGain.gain.setValueAtTime(0.0001, now);

        noiseSrc.connect(sliceFilter);
        sliceFilter.connect(sliceGain);
        sliceGain.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        lfo.start(now);
        noiseSrc.start(now);

        this.lineSingLoop = {
            osc1, osc2, lfo, lfoGain, toneFilter, toneGain,
            noiseSrc, sliceFilter, sliceGain
        };
    }

    // Cập nhật realtime cao độ & âm lượng cước rít theo lực căng, tốc độ chạy, trọng lượng cá & pha chạy
    updateLineSingLoop(tension = 0.5, runIntensity = 1.0, fishWeight = 3.0, phase = 'RUN_OUT') {
        if (!this.ctx || this.isMuted) return;
        const clampedTension = Math.max(0, Math.min(1, tension));
        const activeLevel = clampedTension * 0.68 + Math.min(1.5, runIntensity) * 0.32;

        if (activeLevel < 0.16) {
            if (this.lineSingLoop) {
                const now = this.ctx.currentTime;
                this.lineSingLoop.toneGain.gain.setTargetAtTime(0.0001, now, 0.08);
                this.lineSingLoop.sliceGain.gain.setTargetAtTime(0.0001, now, 0.08);
            }
            return;
        }

        if (!this.lineSingLoop) {
            this.startLineSingLoop();
            if (!this.lineSingLoop) return;
        }

        const now = this.ctx.currentTime;
        const loop = this.lineSingLoop;

        // Trọng lượng cá ảnh hưởng độ trầm/dày và lực xé nước
        const weightFactor = Math.min(1.45, 0.8 + fishWeight * 0.055);
        // Pha chạy ảnh hưởng sắc thái: lao ngang rẽ nước mạnh hơn, lao thẳng rít cao hơn
        let phasePitchMul = 1.0;
        let sliceMul = 1.0;
        if (phase === 'RUN_OUT') {
            phasePitchMul = 1.12;
            sliceMul = 1.15;
        } else if (phase === 'RUN_LEFT' || phase === 'RUN_RIGHT') {
            phasePitchMul = 1.04;
            sliceMul = 1.38; // Chạy ngang cắt mặt nước xè xè cực rõ
        } else if (phase === 'HAZARD') {
            phasePitchMul = 1.28; // Lao cọc rít gắt cảnh báo
            sliceMul = 1.5;
        } else if (phase === 'PIN_SURFACE') {
            phasePitchMul = 0.78;
            sliceMul = 0.55;
        } else if (phase === 'TAP_TO_NET') {
            phasePitchMul = 0.65;
            sliceMul = 0.25;
        }

        // Tần số dây cước rít: từ ~720Hz đến ~2550Hz theo lực căng & tốc độ chạy
        const targetFreq = Math.min(2650, (700 + clampedTension * 1380 + runIntensity * 260) * phasePitchMul / Math.pow(weightFactor, 0.25));
        loop.osc1.frequency.setTargetAtTime(targetFreq, now, 0.06);
        loop.osc2.frequency.setTargetAtTime(targetFreq * 1.503, now, 0.06);
        loop.toneFilter.frequency.setTargetAtTime(targetFreq * 1.22, now, 0.06);
        loop.lfo.frequency.setTargetAtTime(6.0 + clampedTension * 7.5 + runIntensity * 2.5, now, 0.08);
        loop.lfoGain.gain.setTargetAtTime(14 + clampedTension * 32, now, 0.08);

        // Âm lượng dây rít & tiếng xé nước
        const targetToneVol = Math.min(0.24, (0.025 + Math.pow(clampedTension, 1.3) * 0.16) * (0.65 + runIntensity * 0.38));
        const targetSliceVol = Math.min(0.22, (0.018 + clampedTension * 0.09) * runIntensity * sliceMul * weightFactor);

        loop.toneGain.gain.setTargetAtTime(targetToneVol, now, 0.05);
        loop.sliceFilter.frequency.setTargetAtTime(2100 + clampedTension * 1900 + runIntensity * 500, now, 0.06);
        loop.sliceGain.gain.setTargetAtTime(targetSliceVol, now, 0.05);
    }

    stopLineSingLoop() {
        this.stopWaterCutLoop();
        if (!this.lineSingLoop || !this.ctx) return;
        const loop = this.lineSingLoop;
        this.lineSingLoop = null;

        const now = this.ctx.currentTime;
        try {
            loop.toneGain.gain.setTargetAtTime(0.0001, now, 0.04);
            loop.sliceGain.gain.setTargetAtTime(0.0001, now, 0.04);
            setTimeout(() => {
                try {
                    loop.osc1.stop();
                    loop.osc2.stop();
                    loop.lfo.stop();
                    loop.noiseSrc.stop();
                    loop.osc1.disconnect();
                    loop.osc2.disconnect();
                    loop.lfo.disconnect();
                    loop.noiseSrc.disconnect();
                } catch (e) {}
            }, 180);
        } catch (e) {}
    }

    // Âm thanh kẻng/chuông báo RUNG của Chủ Hồ ("KENG! KENG! KENG!")
    playRungBell() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        [0, 0.22, 0.44].forEach((offset) => {
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc1.type = 'sine';
            osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(1180, now + offset);
            osc2.frequency.setValueAtTime(2375, now + offset);

            gain.gain.setValueAtTime(0.32, now + offset);
            gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.45);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(this.ctx.destination);
            osc1.start(now + offset);
            osc2.start(now + offset);
            osc1.stop(now + offset + 0.48);
            osc2.stop(now + offset + 0.48);
        });
    }

    // Âm thanh nâng cấp trang bị thành công
    playUpgradeSuccess() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const freqs = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
        freqs.forEach((f, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, now + idx * 0.07);
            gain.gain.setValueAtTime(0.24, now + idx * 0.07);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.28);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.07);
            osc.stop(now + idx * 0.07 + 0.3);
        });
    }

    // Tiếng cá nhảy Santo vọt khỏi mặt nước & đập mình rơi xuống mặt hồ
    playFishSantoSplash(isLanding = false) {
        if (!this.ctx || this.isMuted) return;
        if (!isLanding) {
            // Lúc vọt lên: tiếng rẽ nước vút lên + tiếng cước rít mạnh
            this.playWaterSplash(1.15);
            this.playLineSing(0.85, true);
        } else {
            // Lúc đập mình rơi xuống nước: tiếng "RẦM / BÕM" lớn tung bọt trắng xóa
            this.playWaterSplash(1.75);
        }
    }

    // Tiếng đứt cước / nổ thẻo
    playLineSnap() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);

        gain.gain.setValueAtTime(0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
    }

    // Tiếng vợt cá vào rọng / Chúc mừng bắt cá thành công
    playCatchFanfare() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;

        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.1);

            gain.gain.setValueAtTime(0.3, now + idx * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.35);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now + idx * 0.1);
            osc.stop(now + idx * 0.1 + 0.38);
        });
    }

    // Tiếng click nút UI
    playClick() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
    }

    // ===== TIẾNG CƯỚC XÉ NƯỚC LIÊN TỤC (dây trục cắt ngang mặt hồ khi cá chạy rẽ nước) =====
    startWaterCutLoop() {
        if (!this.ctx || this.isMuted || this.waterCutLoop) return;
        const len = this.ctx.sampleRate * 2;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        // Pink-ish noise (lọc bớt tần cao gắt) để nghe như tiếng "xèèè" của nước bị xé
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            b0 = 0.99765 * b0 + w * 0.0990460;
            b1 = 0.96300 * b1 + w * 0.2965164;
            b2 = 0.57000 * b2 + w * 1.0526913;
            d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;

        const band = this.ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 1400;
        band.Q.value = 0.9;

        // Dao động biên độ nhanh tạo cảm giác nước "lách tách" khi vây đuôi cá quẫy
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 9;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.0;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.0;

        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        src.connect(band);
        band.connect(gain);
        gain.connect(this.ctx.destination);
        src.start();
        lfo.start();

        this.waterCutLoop = { src, band, gain, lfo, lfoGain };
    }

    // speed: 0..1 tốc độ cá cắt ngang; splashy: 0..1 mức quẫy nước mặt
    updateWaterCutLoop(speed = 0, splashy = 0) {
        if (!this.ctx) return;
        if (this.isMuted) { this.stopWaterCutLoop(); return; }
        if (!this.waterCutLoop) this.startWaterCutLoop();
        const L = this.waterCutLoop;
        if (!L) return;
        const now = this.ctx.currentTime;
        const s = Math.max(0, Math.min(1, speed));
        const vol = 0.012 + s * 0.11 + splashy * 0.05;
        L.gain.gain.setTargetAtTime(vol, now, 0.08);
        L.lfoGain.gain.setTargetAtTime(vol * 0.55 * (0.4 + splashy), now, 0.08);
        L.band.frequency.setTargetAtTime(900 + s * 1800, now, 0.1);
        L.lfo.frequency.setTargetAtTime(6 + s * 10, now, 0.1);
    }

    stopWaterCutLoop() {
        const L = this.waterCutLoop;
        if (!L || !this.ctx) return;
        const now = this.ctx.currentTime;
        L.gain.gain.cancelScheduledValues(now);
        L.gain.gain.setTargetAtTime(0, now, 0.06);
        setTimeout(() => {
            try { L.src.stop(); L.lfo.stop(); } catch (e) { /* đã dừng */ }
        }, 300);
        this.waterCutLoop = null;
    }

    // ===== CÁ LẮC ĐẦU GIẬT CƯỚC: tiếng "phựt" của cước bật + tiếng tạt nước ngắn =====
    playHeadShake(strength = 1.0) {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const st = Math.max(0.3, Math.min(1.6, strength));

        // Tiếng cước bật căng (twang): sóng tam giác trượt tần nhanh
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1500 + Math.random() * 600, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.12);
        g.gain.setValueAtTime(0.06 * st, now);
        g.gain.exponentialRampToValueAtTime(0.0008, now + 0.14);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);

        // Tiếng đuôi cá tạt nước "bạch"
        const nLen = 0.18;
        const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * nLen), this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < buf.length; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.035));
        }
        const n = this.ctx.createBufferSource();
        n.buffer = buf;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 600 + Math.random() * 400;
        f.Q.value = 1.4;
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(0.22 * st, now);
        ng.gain.exponentialRampToValueAtTime(0.001, now + nLen);
        n.connect(f);
        f.connect(ng);
        ng.connect(this.ctx.destination);
        n.start(now);
    }
}

export const soundManager = new SoundManager();
