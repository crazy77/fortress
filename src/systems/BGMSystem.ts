/**
 * 프로시저럴 배경 음악 시스템 — Web Audio API 기반
 * 에셋 없이 분위기 있는 음악을 실시간 생성합니다.
 */

type BGMMode = "title" | "gameplay" | "intense" | "victory" | "defeat" | "silent";

// 코드 진행 (음 높이 배열)
const SCALES = {
	minor: [0, 2, 3, 5, 7, 8, 10], // natural minor
	pentatonic: [0, 3, 5, 7, 10],
};

const CHORD_PROGRESSIONS = {
	title: [
		[0, 3, 7],     // i
		[5, 8, 0],     // iv
		[3, 7, 10],    // III
		[7, 10, 2],    // v
	],
	gameplay: [
		[0, 3, 7],     // i
		[7, 10, 2],    // v
		[5, 8, 0],     // iv
		[3, 7, 10],    // III
	],
	intense: [
		[0, 3, 7],
		[0, 3, 6],     // dim
		[5, 8, 0],
		[7, 11, 2],    // V (harmonic minor)
	],
	victory: [
		[0, 4, 7],     // I (major!)
		[5, 9, 0],     // IV
		[7, 11, 2],    // V
		[0, 4, 7],     // I
	],
	defeat: [
		[0, 3, 7],
		[5, 8, 0],
		[3, 6, 10],
		[0, 3, 7],
	],
};

export class BGMSystem {
	private ctx: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private currentMode: BGMMode = "silent";
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private chordIndex = 0;
	private beatCount = 0;
	private baseNote = 48; // C3 in MIDI
	private muted = false;
	private activeOscillators: OscillatorNode[] = [];

	private getCtx(): AudioContext | null {
		if (this.muted) return null;
		if (!this.ctx) {
			this.ctx = new AudioContext();
			this.masterGain = this.ctx.createGain();
			this.masterGain.gain.value = 0.12;
			this.masterGain.connect(this.ctx.destination);
		}
		if (this.ctx.state === "suspended") {
			this.ctx.resume();
		}
		return this.ctx;
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
		if (muted) {
			this.stop();
		}
	}

	isMuted(): boolean {
		return this.muted;
	}

	private midiToFreq(midi: number): number {
		return 440 * 2 ** ((midi - 69) / 12);
	}

	start(mode: BGMMode): void {
		if (mode === "silent" || mode === this.currentMode) return;
		this.stop();
		this.currentMode = mode;
		this.chordIndex = 0;
		this.beatCount = 0;

		const bpm = mode === "intense" ? 140 : mode === "title" ? 80 : mode === "victory" ? 120 : mode === "defeat" ? 60 : 100;
		const beatMs = (60 / bpm) * 1000;

		// 즉시 첫 비트 재생
		this.playBeat();

		this.intervalId = setInterval(() => {
			this.playBeat();
		}, beatMs);
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		// fade out active oscillators
		for (const osc of this.activeOscillators) {
			try { osc.stop(); } catch { /* already stopped */ }
		}
		this.activeOscillators = [];
		this.currentMode = "silent";
	}

	private playBeat(): void {
		const ctx = this.getCtx();
		if (!ctx || !this.masterGain) return;

		const mode = this.currentMode;
		if (mode === "silent") return;

		const progression = CHORD_PROGRESSIONS[mode as keyof typeof CHORD_PROGRESSIONS] ?? CHORD_PROGRESSIONS.gameplay;
		const beatsPerChord = mode === "intense" ? 2 : 4;

		if (this.beatCount % beatsPerChord === 0) {
			this.chordIndex = (this.chordIndex + 1) % progression.length;
		}

		const chord = progression[this.chordIndex];
		const now = ctx.currentTime;

		// Pad (sustained chord tones)
		if (this.beatCount % beatsPerChord === 0) {
			this.playPad(ctx, now, chord, mode);
		}

		// Bass on beats 0 and 2
		if (this.beatCount % 2 === 0) {
			this.playBass(ctx, now, chord[0], mode);
		}

		// Melody (probabilistic)
		if (mode !== "defeat" && Math.random() < 0.6) {
			this.playMelodyNote(ctx, now, mode);
		}

		// Percussion (subtle)
		if (mode === "gameplay" || mode === "intense") {
			this.playPercussion(ctx, now, mode);
		}

		this.beatCount++;
	}

	private playPad(ctx: AudioContext, time: number, chord: number[], mode: BGMMode): void {
		const volume = mode === "title" ? 0.08 : mode === "intense" ? 0.06 : 0.05;
		const duration = mode === "intense" ? 0.8 : 1.6;

		for (const note of chord) {
			const freq = this.midiToFreq(this.baseNote + note);
			const osc = ctx.createOscillator();
			osc.type = mode === "title" ? "sine" : "triangle";
			osc.frequency.setValueAtTime(freq, time);

			const gain = ctx.createGain();
			gain.gain.setValueAtTime(0, time);
			gain.gain.linearRampToValueAtTime(volume, time + 0.1);
			gain.gain.linearRampToValueAtTime(volume * 0.7, time + duration * 0.8);
			gain.gain.linearRampToValueAtTime(0, time + duration);

			osc.connect(gain).connect(this.masterGain!);
			osc.start(time);
			osc.stop(time + duration);
			this.activeOscillators.push(osc);
			osc.onended = () => {
				this.activeOscillators = this.activeOscillators.filter((o) => o !== osc);
			};
		}
	}

	private playBass(ctx: AudioContext, time: number, rootNote: number, mode: BGMMode): void {
		const freq = this.midiToFreq(this.baseNote - 12 + rootNote);
		const osc = ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.setValueAtTime(freq, time);

		const volume = mode === "intense" ? 0.1 : 0.07;
		const duration = mode === "intense" ? 0.3 : 0.5;

		const gain = ctx.createGain();
		gain.gain.setValueAtTime(volume, time);
		gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

		osc.connect(gain).connect(this.masterGain!);
		osc.start(time);
		osc.stop(time + duration);
		this.activeOscillators.push(osc);
		osc.onended = () => {
			this.activeOscillators = this.activeOscillators.filter((o) => o !== osc);
		};
	}

	private playMelodyNote(ctx: AudioContext, time: number, mode: BGMMode): void {
		const scale = mode === "victory" ? [0, 4, 7, 11, 12] : SCALES.pentatonic;
		const noteIdx = Math.floor(Math.random() * scale.length);
		const octaveOffset = mode === "victory" ? 24 : 12;
		const freq = this.midiToFreq(this.baseNote + octaveOffset + scale[noteIdx]);

		const osc = ctx.createOscillator();
		osc.type = mode === "intense" ? "square" : "sine";
		osc.frequency.setValueAtTime(freq, time);

		const volume = mode === "intense" ? 0.04 : 0.06;
		const duration = 0.15 + Math.random() * 0.2;

		const gain = ctx.createGain();
		gain.gain.setValueAtTime(volume, time);
		gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

		osc.connect(gain).connect(this.masterGain!);
		osc.start(time);
		osc.stop(time + duration);
		this.activeOscillators.push(osc);
		osc.onended = () => {
			this.activeOscillators = this.activeOscillators.filter((o) => o !== osc);
		};
	}

	private playPercussion(ctx: AudioContext, time: number, mode: BGMMode): void {
		// Kick on beats 0, 2
		if (this.beatCount % 2 === 0) {
			const osc = ctx.createOscillator();
			osc.type = "sine";
			osc.frequency.setValueAtTime(120, time);
			osc.frequency.exponentialRampToValueAtTime(30, time + 0.08);
			const gain = ctx.createGain();
			gain.gain.setValueAtTime(mode === "intense" ? 0.12 : 0.06, time);
			gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
			osc.connect(gain).connect(this.masterGain!);
			osc.start(time);
			osc.stop(time + 0.1);
		}

		// Hi-hat on every beat
		const bufferSize = ctx.sampleRate * 0.03;
		const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			data[i] = Math.random() * 2 - 1;
		}
		const noise = ctx.createBufferSource();
		noise.buffer = buffer;
		const hpf = ctx.createBiquadFilter();
		hpf.type = "highpass";
		hpf.frequency.value = 8000;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.02, time);
		gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
		noise.connect(hpf).connect(gain).connect(this.masterGain!);
		noise.start(time);
		noise.stop(time + 0.03);
	}

	destroy(): void {
		this.stop();
		if (this.ctx) {
			this.ctx.close();
			this.ctx = null;
		}
	}
}

// Singleton
let _bgm: BGMSystem | null = null;
export function getBGM(): BGMSystem {
	if (!_bgm) _bgm = new BGMSystem();
	return _bgm;
}
