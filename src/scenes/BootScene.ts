import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
	constructor() {
		super("BootScene");
	}

	preload(): void {
		const { width, height } = this.scale;
		const bar = this.add.rectangle(width / 2, height / 2, 300, 20, 0x333333);
		const fill = this.add.rectangle(
			width / 2 - 148,
			height / 2,
			0,
			16,
			0x00ff00,
		);
		fill.setOrigin(0, 0.5);

		this.load.on("progress", (v: number) => {
			fill.width = 296 * v;
		});

		this.load.on("complete", () => {
			bar.destroy();
			fill.destroy();
		});

		// 에셋이 없으므로 바로 다음 씬으로 이동
	}

	create(): void {
		this.scene.start("TitleScene");
	}
}
