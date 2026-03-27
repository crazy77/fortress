import type { TankStyle } from "../objects/TankDefs";

/**
 * ═══ 사운드 디자인 철학 ═══
 *
 * 캐논 "듬직한 병사": 따뜻하고 묵직한 포격음. 중저음 sawtooth + 짧은 노이즈 버스트.
 * 호버 "날렵한 요정": 가볍고 영롱한 에너지음. 고음 sine 비브라토 + 상승 글리산도.
 * 중전차 "무뚝뚝한 거인": 지축을 흔드는 초저음. 극저주파 + 긴 노이즈 + 잔향.
 * 미사일 "냉정한 저격수": 날카로운 제트 점화. 상승 sine + 화이트 노이즈 러시.
 * 레이저 "신비한 마법사": 충전→방출. 상승 square 차지업 + 고주파 zap 해제.
 * 카타펄트 "장난꾸러기 투석기": 유기적 나무소리. 삐걱 크릭 + 휘이익 + 쿵.
 */

export class AudioSystem {
	private ctx: AudioContext | null = null;
	private muted = false;

	private getCtx(): AudioContext | null {
		if (this.muted) return null;
		if (!this.ctx) {
			this.ctx = new AudioContext();
		}
		if (this.ctx.state === "suspended") {
			this.ctx.resume();
		}
		return this.ctx;
	}

	toggleMute(): boolean {
		this.muted = !this.muted;
		return this.muted;
	}

	isMuted(): boolean {
		return this.muted;
	}

	// ═══════════════════════════════════════════
	//  발사음 — 캐릭터별 고유 사운드
	// ═══════════════════════════════════════════

	playFire(style: TankStyle = "cannon"): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		switch (style) {
			case "cannon": {
				// "듬직한 병사" — 따뜻한 중저음 포격 + 메탈릭 링
				const osc = ctx.createOscillator();
				osc.type = "sawtooth";
				osc.frequency.setValueAtTime(220, now);
				osc.frequency.exponentialRampToValueAtTime(70, now + 0.18);
				const gain = ctx.createGain();
				gain.gain.setValueAtTime(0.28, now);
				gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
				osc.connect(gain).connect(ctx.destination);
				osc.start(now);
				osc.stop(now + 0.18);
				// 서브베이스 펀치
				const sub = ctx.createOscillator();
				sub.type = "sine";
				sub.frequency.setValueAtTime(80, now);
				sub.frequency.exponentialRampToValueAtTime(30, now + 0.12);
				const subGain = ctx.createGain();
				subGain.gain.setValueAtTime(0.2, now);
				subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
				sub.connect(subGain).connect(ctx.destination);
				sub.start(now);
				sub.stop(now + 0.12);
				// 노이즈 파열
				this.playNoiseBurst(ctx, now, 0.06, 0.18);
				break;
			}
			case "heavy": {
				// "무뚝뚝한 거인" — 지축을 흔드는 초저음 + 긴 잔향
				// 초저음 서브베이스
				const sub = ctx.createOscillator();
				sub.type = "sine";
				sub.frequency.setValueAtTime(50, now);
				sub.frequency.exponentialRampToValueAtTime(20, now + 0.35);
				const subGain = ctx.createGain();
				subGain.gain.setValueAtTime(0.35, now);
				subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
				sub.connect(subGain).connect(ctx.destination);
				sub.start(now);
				sub.stop(now + 0.35);
				// 중음 포격
				const mid = ctx.createOscillator();
				mid.type = "sawtooth";
				mid.frequency.setValueAtTime(120, now);
				mid.frequency.exponentialRampToValueAtTime(35, now + 0.3);
				const midGain = ctx.createGain();
				midGain.gain.setValueAtTime(0.3, now);
				midGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
				mid.connect(midGain).connect(ctx.destination);
				mid.start(now);
				mid.stop(now + 0.3);
				// 무거운 노이즈 (오래 지속)
				this.playFilteredNoise(ctx, now, 0.15, 0.35, 400, 60);
				break;
			}
			case "missile": {
				// "냉정한 저격수" — 점화 쉬익 + 제트 러시
				// 점화 클릭
				const click = ctx.createOscillator();
				click.type = "square";
				click.frequency.setValueAtTime(1500, now);
				const clickGain = ctx.createGain();
				clickGain.gain.setValueAtTime(0.08, now);
				clickGain.gain.exponentialRampToValueAtTime(0.01, now + 0.02);
				click.connect(clickGain).connect(ctx.destination);
				click.start(now);
				click.stop(now + 0.02);
				// 제트 점화 (상승 주파수)
				const jet = ctx.createOscillator();
				jet.type = "sine";
				jet.frequency.setValueAtTime(300, now + 0.02);
				jet.frequency.exponentialRampToValueAtTime(900, now + 0.15);
				jet.frequency.exponentialRampToValueAtTime(400, now + 0.35);
				const jetGain = ctx.createGain();
				jetGain.gain.setValueAtTime(0.01, now);
				jetGain.gain.linearRampToValueAtTime(0.2, now + 0.08);
				jetGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
				jet.connect(jetGain).connect(ctx.destination);
				jet.start(now);
				jet.stop(now + 0.35);
				// 고압 노이즈 (제트 배기)
				this.playFilteredNoise(ctx, now + 0.02, 0.12, 0.25, 2000, 400);
				break;
			}
			case "laser": {
				// "신비한 마법사" — 충전 차지업 + 고주파 zap 해제
				// 차지업 (상승 피치)
				const charge = ctx.createOscillator();
				charge.type = "sine";
				charge.frequency.setValueAtTime(200, now);
				charge.frequency.exponentialRampToValueAtTime(1800, now + 0.1);
				const chargeGain = ctx.createGain();
				chargeGain.gain.setValueAtTime(0.06, now);
				chargeGain.gain.linearRampToValueAtTime(0.12, now + 0.08);
				chargeGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
				charge.connect(chargeGain).connect(ctx.destination);
				charge.start(now);
				charge.stop(now + 0.12);
				// 메인 빔 zap
				const beam = ctx.createOscillator();
				beam.type = "square";
				beam.frequency.setValueAtTime(1400, now + 0.08);
				beam.frequency.exponentialRampToValueAtTime(400, now + 0.2);
				const beamGain = ctx.createGain();
				beamGain.gain.setValueAtTime(0.14, now + 0.08);
				beamGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
				beam.connect(beamGain).connect(ctx.destination);
				beam.start(now + 0.08);
				beam.stop(now + 0.2);
				// 크리스탈 하모닉 (높은 옥타브)
				const harmonic = ctx.createOscillator();
				harmonic.type = "sine";
				harmonic.frequency.setValueAtTime(2800, now + 0.08);
				harmonic.frequency.exponentialRampToValueAtTime(800, now + 0.15);
				const hGain = ctx.createGain();
				hGain.gain.setValueAtTime(0.06, now + 0.08);
				hGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
				harmonic.connect(hGain).connect(ctx.destination);
				harmonic.start(now + 0.08);
				harmonic.stop(now + 0.15);
				break;
			}
			case "hover": {
				// "날렵한 요정" — 영롱한 플라즈마 에너지 발사
				// 에너지 축적 (짧은 상승)
				const buildup = ctx.createOscillator();
				buildup.type = "sine";
				buildup.frequency.setValueAtTime(400, now);
				buildup.frequency.exponentialRampToValueAtTime(800, now + 0.04);
				const buildGain = ctx.createGain();
				buildGain.gain.setValueAtTime(0.08, now);
				buildGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
				buildup.connect(buildGain).connect(ctx.destination);
				buildup.start(now);
				buildup.stop(now + 0.05);
				// 메인 발사 (triangle — 부드러운 에너지감)
				const main = ctx.createOscillator();
				main.type = "triangle";
				main.frequency.setValueAtTime(700, now + 0.03);
				main.frequency.exponentialRampToValueAtTime(180, now + 0.13);
				const mainGain = ctx.createGain();
				mainGain.gain.setValueAtTime(0.18, now + 0.03);
				mainGain.gain.exponentialRampToValueAtTime(0.01, now + 0.13);
				main.connect(mainGain).connect(ctx.destination);
				main.start(now + 0.03);
				main.stop(now + 0.13);
				// 반짝이는 고음 (요정 느낌)
				const sparkle = ctx.createOscillator();
				sparkle.type = "sine";
				sparkle.frequency.setValueAtTime(1200, now + 0.03);
				sparkle.frequency.exponentialRampToValueAtTime(600, now + 0.08);
				const spkGain = ctx.createGain();
				spkGain.gain.setValueAtTime(0.05, now + 0.03);
				spkGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
				sparkle.connect(spkGain).connect(ctx.destination);
				sparkle.start(now + 0.03);
				sparkle.stop(now + 0.08);
				this.playNoiseBurst(ctx, now + 0.02, 0.03, 0.08);
				break;
			}
			case "catapult": {
				// "장난꾸러기 투석기" — 나무 삐걱 + 밧줄 팽팽 + 투석 통!
				// 나무 삐걱 (크릭)
				const creak = ctx.createOscillator();
				creak.type = "sawtooth";
				creak.frequency.setValueAtTime(100, now);
				creak.frequency.linearRampToValueAtTime(140, now + 0.05);
				creak.frequency.linearRampToValueAtTime(90, now + 0.1);
				const creakGain = ctx.createGain();
				creakGain.gain.setValueAtTime(0.15, now);
				creakGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
				creak.connect(creakGain).connect(ctx.destination);
				creak.start(now);
				creak.stop(now + 0.12);
				// 투석 임팩트 (나무 + 돌)
				const thump = ctx.createOscillator();
				thump.type = "sine";
				thump.frequency.setValueAtTime(150, now + 0.08);
				thump.frequency.exponentialRampToValueAtTime(50, now + 0.2);
				const thumpGain = ctx.createGain();
				thumpGain.gain.setValueAtTime(0.25, now + 0.08);
				thumpGain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
				thump.connect(thumpGain).connect(ctx.destination);
				thump.start(now + 0.08);
				thump.stop(now + 0.22);
				// 돌 날아가는 노이즈
				this.playNoiseBurst(ctx, now + 0.08, 0.08, 0.15);
				break;
			}
		}
	}

	// ═══════════════════════════════════════════
	//  비행음 — 캐릭터별 고유 궤적 사운드
	// ═══════════════════════════════════════════

	playWhistle(speed: number, style: TankStyle = "cannon"): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		let freq: number;
		let waveType: OscillatorType = "sine";
		let volume = 0.05;
		let duration = 0.05;

		switch (style) {
			case "cannon":
				// 클래식 포탄 휘파람
				freq = Math.min(500, Math.max(200, 200 + speed * 18));
				volume = 0.05;
				break;
			case "heavy":
				// 무거운 저음 윙윙
				freq = Math.min(250, Math.max(80, 80 + speed * 8));
				waveType = "sawtooth";
				volume = 0.04;
				duration = 0.06;
				break;
			case "missile":
				// 제트 엔진 지속음
				freq = 350 + speed * 12;
				waveType = "sawtooth";
				volume = 0.04;
				duration = 0.04;
				break;
			case "laser":
				// 고주파 에너지 험
				freq = 900 + speed * 25;
				waveType = "square";
				volume = 0.025;
				duration = 0.04;
				break;
			case "hover":
				// 영롱한 에너지 통과음
				freq = 550 + speed * 18;
				waveType = "triangle";
				volume = 0.035;
				break;
			case "catapult":
				// 바위 날아가는 바람소리
				freq = Math.min(350, 150 + speed * 10);
				volume = 0.04;
				duration = 0.06;
				break;
			default:
				freq = 300 + speed * 15;
				break;
		}

		const osc = ctx.createOscillator();
		osc.type = waveType;
		osc.frequency.setValueAtTime(Math.min(1200, freq), now);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(volume, now);
		gain.gain.exponentialRampToValueAtTime(0.005, now + duration);
		osc.connect(gain).connect(ctx.destination);
		osc.start(now);
		osc.stop(now + duration);
	}

	// ═══════════════════════════════════════════
	//  폭발음 — 강도 + 스타일별 차별화
	// ═══════════════════════════════════════════

	playExplosion(intensity = 1.0, style: TankStyle = "cannon"): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		// 기본 폭발 (노이즈 + 로우패스)
		const baseDuration = 0.25 + intensity * 0.25;
		const bufferSize = Math.round(ctx.sampleRate * baseDuration);
		const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			data[i] = Math.random() * 2 - 1;
		}
		const noise = ctx.createBufferSource();
		noise.buffer = buffer;
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";

		// 스타일별 필터 특성
		switch (style) {
			case "heavy":
				// 극저음, 긴 잔향
				filter.frequency.setValueAtTime(400, now);
				filter.frequency.exponentialRampToValueAtTime(40, now + baseDuration);
				break;
			case "laser":
				// 높고 날카로운 크랙
				filter.frequency.setValueAtTime(2000, now);
				filter.frequency.exponentialRampToValueAtTime(200, now + baseDuration * 0.6);
				break;
			case "hover":
				// 중고음 에너지 파열
				filter.frequency.setValueAtTime(1200, now);
				filter.frequency.exponentialRampToValueAtTime(100, now + baseDuration);
				break;
			case "catapult":
				// 둔탁한 임팩트
				filter.frequency.setValueAtTime(500, now);
				filter.frequency.exponentialRampToValueAtTime(50, now + baseDuration);
				break;
			default:
				filter.frequency.setValueAtTime(600 + intensity * 300, now);
				filter.frequency.exponentialRampToValueAtTime(60, now + baseDuration);
		}

		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.25 + intensity * 0.15, now);
		gain.gain.exponentialRampToValueAtTime(0.01, now + baseDuration);
		noise.connect(filter).connect(gain).connect(ctx.destination);
		noise.start(now);
		noise.stop(now + baseDuration);

		// 서브베이스 펀치 (물리적 충격감)
		const sub = ctx.createOscillator();
		sub.type = "sine";
		const subFreq = style === "heavy" ? 30 : style === "catapult" ? 40 : 50;
		sub.frequency.setValueAtTime(subFreq + intensity * 20, now);
		sub.frequency.exponentialRampToValueAtTime(15, now + 0.15);
		const subGain = ctx.createGain();
		subGain.gain.setValueAtTime(0.2 + intensity * 0.1, now);
		subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
		sub.connect(subGain).connect(ctx.destination);
		sub.start(now);
		sub.stop(now + 0.15);
	}

	// ═══════════════════════════════════════════
	//  피격음 — 캐릭터별 반응
	// ═══════════════════════════════════════════

	playHit(style: TankStyle = "cannon"): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		switch (style) {
			case "heavy":
				// 무거운 금속 쿵
				this.playTone(ctx, now, "square", 200, 80, 0.12, 0.12);
				this.playTone(ctx, now, "sine", 60, 30, 0.1, 0.08);
				break;
			case "laser":
				// 에너지 쉴드 크랙
				this.playTone(ctx, now, "square", 800, 200, 0.08, 0.1);
				this.playTone(ctx, now, "sine", 1600, 400, 0.04, 0.06);
				break;
			case "hover":
				// 가벼운 에너지 충돌
				this.playTone(ctx, now, "triangle", 700, 300, 0.06, 0.1);
				break;
			case "catapult":
				// 나무 충격음
				this.playTone(ctx, now, "sawtooth", 300, 80, 0.04, 0.1);
				this.playNoiseBurst(ctx, now, 0.03, 0.08);
				break;
			default:
				// 금속 클랭
				this.playTone(ctx, now, "square", 600, 200, 0.12, 0.08);
				break;
		}
	}

	// ═══════════════════════════════════════════
	//  이동음 — 캐릭터별 엔진/구동음
	// ═══════════════════════════════════════════

	playMove(style: TankStyle = "cannon"): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		switch (style) {
			case "cannon":
				// 경쾌한 캐터필러 클릭
				this.playTone(ctx, now, "triangle", 55 + Math.random() * 15, 40, 0.04, 0.04);
				break;
			case "hover":
				// 부드러운 호버 험
				this.playTone(ctx, now, "sine", 180 + Math.random() * 20, 160, 0.03, 0.05);
				break;
			case "heavy":
				// 묵직한 엔진 + 무한궤도 덜컹
				this.playTone(ctx, now, "sawtooth", 35 + Math.random() * 10, 25, 0.05, 0.04);
				this.playNoiseBurst(ctx, now, 0.02, 0.03);
				break;
			case "missile":
				// 부드러운 캐터필러
				this.playTone(ctx, now, "triangle", 65 + Math.random() * 10, 50, 0.035, 0.03);
				break;
			case "laser":
				// 전기 모터 윙윙
				this.playTone(ctx, now, "sine", 120 + Math.random() * 10, 100, 0.025, 0.04);
				break;
			case "catapult":
				// 나무 바퀴 삐걱
				this.playTone(ctx, now, "sawtooth", 70 + Math.random() * 30, 50, 0.04, 0.035);
				break;
		}
	}

	// ═══════════════════════════════════════════
	//  특수 무기 사운드
	// ═══════════════════════════════════════════

	/** 나팔름 화염 지속음 */
	playNapalm(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;
		// 불타는 크래클링
		this.playFilteredNoise(ctx, now, 0.15, 0.4, 3000, 500);
		// 화염 저음
		this.playTone(ctx, now, "sawtooth", 150, 60, 0.08, 0.3);
	}

	/** 드릴 관통음 */
	playDrill(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;
		// 드릴 회전 (빠른 펄스)
		const drill = ctx.createOscillator();
		drill.type = "sawtooth";
		drill.frequency.setValueAtTime(200, now);
		drill.frequency.linearRampToValueAtTime(400, now + 0.1);
		drill.frequency.linearRampToValueAtTime(200, now + 0.2);
		drill.frequency.linearRampToValueAtTime(500, now + 0.3);
		const drillGain = ctx.createGain();
		drillGain.gain.setValueAtTime(0.1, now);
		drillGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
		drill.connect(drillGain).connect(ctx.destination);
		drill.start(now);
		drill.stop(now + 0.35);
		// 파편 노이즈
		this.playFilteredNoise(ctx, now, 0.12, 0.2, 1500, 300);
	}

	/** 탱크 파괴/사망 */
	playDeath(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;
		// 무거운 폭발
		this.playFilteredNoise(ctx, now, 0.2, 0.5, 500, 30);
		// 금속 분쇄
		this.playTone(ctx, now, "sawtooth", 300, 50, 0.15, 0.3);
		this.playTone(ctx, now + 0.1, "square", 150, 30, 0.1, 0.25);
		// 서브베이스
		this.playTone(ctx, now, "sine", 40, 15, 0.2, 0.3);
	}

	/** 승리 팡파르 */
	playVictory(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;
		// C-E-G-C (메이저 코드 상승)
		const notes = [523, 659, 784, 1047]; // C5-E5-G5-C6
		for (let i = 0; i < notes.length; i++) {
			const t = now + i * 0.12;
			this.playTone(ctx, t, "sine", notes[i], notes[i], 0.12, 0.2);
			this.playTone(ctx, t, "triangle", notes[i] * 0.5, notes[i] * 0.5, 0.06, 0.2);
		}
	}

	// ═══════════════════════════════════════════
	//  UI 사운드
	// ═══════════════════════════════════════════

	playPickup(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;
		this.playTone(ctx, now, "sine", 523, 523, 0.1, 0.1);
		this.playTone(ctx, now + 0.08, "sine", 659, 659, 0.1, 0.12);
		this.playTone(ctx, now + 0.16, "sine", 784, 784, 0.08, 0.14);
	}

	playTick(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		this.playTone(ctx, ctx.currentTime, "sine", 1000, 1000, 0.07, 0.05);
	}

	playTurnBeep(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;
		this.playTone(ctx, now, "sine", 660, 660, 0.08, 0.08);
		this.playTone(ctx, now + 0.06, "sine", 880, 880, 0.08, 0.1);
	}

	playSkip(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		this.playTone(ctx, ctx.currentTime, "sine", 440, 220, 0.07, 0.1);
	}

	playBounce(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;
		this.playTone(ctx, now, "triangle", 300, 600, 0.1, 0.06);
		this.playTone(ctx, now, "sine", 800, 400, 0.05, 0.04);
	}

	// ═══════════════════════════════════════════
	//  헬퍼 메서드
	// ═══════════════════════════════════════════

	private playTone(
		ctx: AudioContext,
		time: number,
		type: OscillatorType,
		freqStart: number,
		freqEnd: number,
		volume: number,
		duration: number,
	): void {
		const osc = ctx.createOscillator();
		osc.type = type;
		osc.frequency.setValueAtTime(freqStart, time);
		if (freqEnd !== freqStart) {
			osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), time + duration);
		}
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(volume, time);
		gain.gain.exponentialRampToValueAtTime(0.005, time + duration);
		osc.connect(gain).connect(ctx.destination);
		osc.start(time);
		osc.stop(time + duration);
	}

	private playNoiseBurst(
		ctx: AudioContext,
		time: number,
		duration: number,
		volume: number,
	): void {
		const bufferSize = Math.round(ctx.sampleRate * duration);
		const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			data[i] = Math.random() * 2 - 1;
		}
		const noise = ctx.createBufferSource();
		noise.buffer = buffer;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(volume, time);
		gain.gain.exponentialRampToValueAtTime(0.005, time + duration);
		noise.connect(gain).connect(ctx.destination);
		noise.start(time);
		noise.stop(time + duration);
	}

	/** 필터드 노이즈 — 주파수 감쇠하는 노이즈 */
	private playFilteredNoise(
		ctx: AudioContext,
		time: number,
		volume: number,
		duration: number,
		freqStart: number,
		freqEnd: number,
	): void {
		const bufferSize = Math.round(ctx.sampleRate * duration);
		const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			data[i] = Math.random() * 2 - 1;
		}
		const noise = ctx.createBufferSource();
		noise.buffer = buffer;
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.setValueAtTime(freqStart, time);
		filter.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), time + duration);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(volume, time);
		gain.gain.exponentialRampToValueAtTime(0.005, time + duration);
		noise.connect(filter).connect(gain).connect(ctx.destination);
		noise.start(time);
		noise.stop(time + duration);
	}
}

/** 진동 피드백 유틸 */
export function vibrate(pattern: number | number[]): void {
	if (navigator.vibrate) {
		navigator.vibrate(pattern);
	}
}
