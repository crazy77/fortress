# Phaser 3.90 Technical Preview 3

Welcome to Phaser 3.90 Technical Preview 3. This preview is an early insight into upcoming improvements to Phaser 3. This is not production-ready code. Many features are missing or broken. All features are subject to change. Basically, experiment with this, but don't rely on it!

## Summary

- Nearly all GameObjects now work.
- Several GameObjects work better than before.
- Lights are enhanced, with a simple activation method, 3D positioning and optional self-shadowing illumination.
- GameObjects have a customizable collection of RenderNodes.

## What Should Work

Most GameObjects should work.

The following properties on those objects should also work:

- Transform (position, rotation, scale, flip etc)
- Tint
- Blend modes
- Changing text

The Camera should work, including the following properties:

- Transform (where the camera is on screen)
- Scroll and zoom (where the camera is pointing in the game world)
- Background color
- Fade effect
- Flash effect

## What Shouldn't Work Yet

The following game objects will probably cause the game to crash:

- `RenderTexture`
- `Shader`
- `Mesh`
- `Plane`

Masks are not supported on cameras or game objects.

FX are not supported on cameras or game objects.

## Differences

A lot has changed between TP releases. We'll summarize the bits to keep an eye on.

### Game Object Components

The `Pipeline` component has been removed from updated game objects. It has been replaced by `RenderNode`. In addition, objects which support lighting have a `Lighting` component.

#### The RenderNode Component

The `RenderNode` component is designed for configurability. It has two maps of RenderNodes taken from the renderer:

- `defaultRenderNodes` for the default GameObject type
- `customRenderNodes`, which are empty by default and are used over the defaults if present

Each map lists nodes by role, e.g. 'Texturer', 'BatchHandler' etc. This means they can be swapped out to configure object behavior.

#### The Lighting Component

The `Lighting` component appears on those objects which can be illuminated. Previously, this was surfaced by calling `gameObject.setPipeline('Light2D')`, and hoping that it worked properly. Now, compatible objects can run `gameObject.setLighting(true)`, which will set up the necessary RenderNodes automatically. Incompatible objects just don't offer the option.

We've had a few methods for activating illumination, but this one is sufficiently generic that it should stick, even if we make major changes to the renderer.

### Render Nodes

There are a lot of RenderNodes now. More than 30. Until we write a final guide, it's easier to look at the source code to see them all. However, the population is settling down, so it looks like they're doing the right thing.

### Lights

Lights do _not_ work the same as they did in v3.80. We found an issue: basically, the resolution controlled the effective Z-depth of a light, and thus the relief it illuminated.

So we added explicit Z coordinates to lights. You can use `light.z`, `light.zNormal`, `light.setZ()` and `light.setZNormal` to control them. The 'zNormal' value is based on the light radius, and produces good results between 0 and 0.5. If the light moves too far away from the surface, it will no longer illuminate it.

Lights also support **self-shadowing** illumination. This is a separate shader, but it doesn't require any extra textures. The easiest way to activate it is game-wide: set `config.render.selfShadow: true` when creating a game. Self-shadowing is an approximation, which guesses at surface concavity by reading the colors of your textures. You can configure it like this:

```js
var node = game.renderer.renderNodes.getNode('BatchHandlerQuadLightShadow');
node.diffuseFlatThreshold = 0.5; // Values should be between 0 and 1, default 1/3
node.penumbra = 0.1; // Values should be above 0, default 0.5
```

### Graphics and Shapes

Flat geometry got some enhancements.

`Graphics` objects now support detail overrides. If points on a path are within a certain distance of each other, they are skipped, greatly improving performance in scenes with a lot of curved detail. This value can be set in the game config (`game.config.render.pathDetailThreshold = 1`), or on an individual game object (`gameObject.pathDetailThreshold = -1`). If it is negative on the object, it is taken from the game config. If it is 0, no points will be skipped. A value of 1 pixel is default. Higher values might be visible to the eye, depending on curvature. Values of 4 or 8 are often good.

`Shape` objects do not support detail overrides, as they pre-compute geometry for efficiency.

However, the `Grid` shape was changed to better expose its features. It now uses the same `fillColor` and `strokeColor` (and alpha) properties as other shapes. In addition, it has the properties `altFillColor`, `altFillAlpha`, `cellPadding`, `strokeOutside`, and `strokeOutsideIncomplete` for controlling alternating grid cells, and the gaps and strokes around them. Cell padding was previously locked to 1px, and stroke was not rendered around the outside of the grid.

### TileSprite

The TileSprite object had a lot of technical limitations. We lifted them, making it a lot cooler.

TileSprite now supports all kinds of textures, including frames from texture atlases and compressed textures, because we stopped using WebGL texture settings to get the tiling effect. It even supports displaying animations, via the new `tileSprite.anim` object.

With this freedom, we also added a `tileRotation` property, so a TileSprite is more flexible than ever.

To enable this, we had to use a new shader, so TileSprite no longer batches with other objects. This shouldn't be an issue unless you're using hundreds of TileSprites. Try to keep them adjacent in the display list to take advantage of their own batcher.

## Future Steps

This is the third Technical Preview. In the last one, we said we were getting the foundation ready for more features. Hopefully you agree that we delivered on that, with improved lighting and upgraded game objects across the board.

We'll put out more in coming weeks. Our objectives now focus on post-processing: masks, FX, and the fancy game objects like `Shader` and `RenderTexture` which control their own appearance. This is the last set of upgrades before the new renderer is feature-complete.

We're closing in on the finish line, and we're excited about what we're making!
