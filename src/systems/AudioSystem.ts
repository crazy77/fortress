import type { TankStyle } from "../objects/TankDefs";

/** Web Audio API 기반 프로시저럴 사운드 (에셋 불필요) */
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

	/** 탱크 타입별 발사음 */
	playFire(style: TankStyle = "cannon"): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		switch (style) {
			case "cannon": {
				// 클래식: 둔탁한 포격
				const osc = ctx.createOscillator();
				osc.type = "sawtooth";
				osc.frequency.setValueAtTime(250, now);
				osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
				const gain = ctx.createGain();
				gain.gain.setValueAtTime(0.3, now);
				gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
				osc.connect(gain).connect(ctx.destination);
				osc.start(now);
				osc.stop(now + 0.15);
				this.playNoiseBurst(ctx, now, 0.05, 0.2);
				break;
			}
			case "heavy": {
				// 중전차: 깊은 포격 + 긴 여운
				const osc = ctx.createOscillator();
				osc.type = "sawtooth";
				osc.frequency.setValueAtTime(150, now);
				osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
				const gain = ctx.createGain();
				gain.gain.setValueAtTime(0.4, now);
				gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
				osc.connect(gain).connect(ctx.destination);
				osc.start(now);
				osc.stop(now + 0.25);
				this.playNoiseBurst(ctx, now, 0.08, 0.3);
				break;
			}
			case "missile": {
				// 미사일: 쉬익 소리 + 점화
				const osc = ctx.createOscillator();
				osc.type = "sine";
				osc.frequency.setValueAtTime(400, now);
				osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
				osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);
				const gain = ctx.createGain();
				gain.gain.setValueAtTime(0.15, now);
				gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
				gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
				osc.connect(gain).connect(ctx.destination);
				osc.start(now);
				osc.stop(now + 0.3);
				break;
			}
			case "laser": {
				// 레이저: 전자음 zap
				const osc = ctx.createOscillator();
				osc.type = "square";
				osc.frequency.setValueAtTime(1200, now);
				osc.frequency.exponentialRampToValueAtTime(300, now + 0.12);
				const gain = ctx.createGain();
				gain.gain.setValueAtTime(0.15, now);
				gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
				osc.connect(gain).connect(ctx.destination);
				osc.start(now);
				osc.stop(now + 0.12);

				// 고주파 하모닉
				const osc2 = ctx.createOscillator();
				osc2.type = "sine";
				osc2.frequency.setValueAtTime(2400, now);
				osc2.frequency.exponentialRampToValueAtTime(600, now + 0.08);
				const g2 = ctx.createGain();
				g2.gain.setValueAtTime(0.08, now);
				g2.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
				osc2.connect(g2).connect(ctx.destination);
				osc2.start(now);
				osc2.stop(now + 0.08);
				break;
			}
			case "hover": {
				// 호버: 플라즈마 발사
				const osc = ctx.createOscillator();
				osc.type = "triangle";
				osc.frequency.setValueAtTime(600, now);
				osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
				const gain = ctx.createGain();
				gain.gain.setValueAtTime(0.2, now);
				gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
				osc.connect(gain).connect(ctx.destination);
				osc.start(now);
				osc.stop(now + 0.1);
				this.playNoiseBurst(ctx, now, 0.03, 0.1);
				break;
			}
			case "catapult": {
				// 카타펄트: 나무 삐걱 + 투석
				const osc = ctx.createOscillator();
				osc.type = "sawtooth";
				osc.frequency.setValueAtTime(120, now);
				osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);
				const gain = ctx.createGain();
				gain.gain.setValueAtTime(0.25, now);
				gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
				osc.connect(gain).connect(ctx.destination);
				osc.start(now);
				osc.stop(now + 0.2);

				// 투석 소리
				this.playNoiseBurst(ctx, now + 0.05, 0.06, 0.15);
				break;
			}
		}
	}

	/** 탱크 타입별 포탄 비행음 */
	playWhistle(speed: number, style: TankStyle = "cannon"): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		let freq: number;
		let waveType: OscillatorType = "sine";
		let volume = 0.06;

		switch (style) {
			case "laser":
				freq = 800 + speed * 30;
				waveType = "square";
				volume = 0.03;
				break;
			case "missile":
				freq = 300 + speed * 15;
				waveType = "sawtooth";
				volume = 0.04;
				break;
			case "hover":
				freq = 500 + speed * 20;
				waveType = "triangle";
				volume = 0.04;
				break;
			default:
				freq = Math.min(600, Math.max(200, 200 + speed * 20));
				break;
		}

		const osc = ctx.createOscillator();
		osc.type = waveType;
		osc.frequency.setValueAtTime(Math.min(1200, freq), now);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(volume, now);
		gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
		osc.connect(gain).connect(ctx.destination);
		osc.start(now);
		osc.stop(now + 0.05);
	}

	/** 폭발음: 화이트 노이즈 + 로우패스 감쇠 */
	playExplosion(intensity = 1.0): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;
		const duration = 0.3 + intensity * 0.2;

		const bufferSize = ctx.sampleRate * duration;
		const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			data[i] = Math.random() * 2 - 1;
		}

		const noise = ctx.createBufferSource();
		noise.buffer = buffer;

		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.setValueAtTime(600 + intensity * 300, now);
		filter.frequency.exponentialRampToValueAtTime(80, now + duration);

		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.3 + intensity * 0.15, now);
		gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

		noise.connect(filter).connect(gain).connect(ctx.destination);
		noise.start(now);
		noise.stop(now + duration);
	}

	/** 피격음: 짧은 금속 클랭 */
	playHit(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		const osc = ctx.createOscillator();
		osc.type = "square";
		osc.frequency.setValueAtTime(600, now);
		osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.15, now);
		gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
		osc.connect(gain).connect(ctx.destination);
		osc.start(now);
		osc.stop(now + 0.08);
	}

	/** 탱크 이동 소리 (캐터필러/호버) */
	playMove(style: TankStyle = "cannon"): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		if (style === "hover") {
			// 호버: 고주파 윙윙
			const osc = ctx.createOscillator();
			osc.type = "sine";
			osc.frequency.setValueAtTime(200, now);
			const gain = ctx.createGain();
			gain.gain.setValueAtTime(0.04, now);
			gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
			osc.connect(gain).connect(ctx.destination);
			osc.start(now);
			osc.stop(now + 0.04);
		} else {
			// 일반: 저주파 캐터필러
			const osc = ctx.createOscillator();
			osc.type = "triangle";
			osc.frequency.setValueAtTime(50 + Math.random() * 20, now);
			const gain = ctx.createGain();
			gain.gain.setValueAtTime(0.05, now);
			gain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
			osc.connect(gain).connect(ctx.destination);
			osc.start(now);
			osc.stop(now + 0.03);
		}
	}

	/** 파워업 수집 소리 */
	playPickup(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		// 상승하는 2음계 딩
		const osc1 = ctx.createOscillator();
		osc1.type = "sine";
		osc1.frequency.setValueAtTime(523, now); // C5
		const g1 = ctx.createGain();
		g1.gain.setValueAtTime(0.12, now);
		g1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
		osc1.connect(g1).connect(ctx.destination);
		osc1.start(now);
		osc1.stop(now + 0.1);

		const osc2 = ctx.createOscillator();
		osc2.type = "sine";
		osc2.frequency.setValueAtTime(659, now + 0.08); // E5
		const g2 = ctx.createGain();
		g2.gain.setValueAtTime(0.12, now + 0.08);
		g2.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
		osc2.connect(g2).connect(ctx.destination);
		osc2.start(now + 0.08);
		osc2.stop(now + 0.2);
	}

	/** 타이머 틱 (잔여 5초부터 매 초) */
	playTick(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		const osc = ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.setValueAtTime(1000, now);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.08, now);
		gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
		osc.connect(gain).connect(ctx.destination);
		osc.start(now);
		osc.stop(now + 0.06);
	}

	/** 턴 전환 비프 */
	playTurnBeep(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		const osc = ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.setValueAtTime(880, now);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.1, now);
		gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
		osc.connect(gain).connect(ctx.destination);
		osc.start(now);
		osc.stop(now + 0.12);
	}

	/** 턴 스킵 소리 */
	playSkip(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		const osc = ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.setValueAtTime(440, now);
		osc.frequency.exponentialRampToValueAtTime(220, now + 0.1);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.08, now);
		gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
		osc.connect(gain).connect(ctx.destination);
		osc.start(now);
		osc.stop(now + 0.1);
	}

	/** 바운스 소리 */
	playBounce(): void {
		const ctx = this.getCtx();
		if (!ctx) return;
		const now = ctx.currentTime;

		const osc = ctx.createOscillator();
		osc.type = "triangle";
		osc.frequency.setValueAtTime(300, now);
		osc.frequency.exponentialRampToValueAtTime(500, now + 0.05);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.1, now);
		gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
		osc.connect(gain).connect(ctx.destination);
		osc.start(now);
		osc.stop(now + 0.08);
	}

	private playNoiseBurst(
		ctx: AudioContext,
		time: number,
		duration: number,
		volume: number,
	): void {
		const bufferSize = ctx.sampleRate * duration;
		const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			data[i] = Math.random() * 2 - 1;
		}
		const noise = ctx.createBufferSource();
		noise.buffer = buffer;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(volume, time);
		gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
		noise.connect(gain).connect(ctx.destination);
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
