import Phaser from "phaser";
import { CONFIG } from "./config";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { TitleScene } from "./scenes/TitleScene";
import { UIScene } from "./scenes/UIScene";

const game = new Phaser.Game({
	type: Phaser.AUTO,
	width: CONFIG.VIEW_WIDTH,
	height: CONFIG.WORLD_HEIGHT,
	parent: document.body,
	backgroundColor: "#87CEEB",
	scale: {
		mode: Phaser.Scale.FIT,
		autoCenter: Phaser.Scale.CENTER_BOTH,
	},
	scene: [BootScene, TitleScene, GameScene, UIScene],
});

export default game;
