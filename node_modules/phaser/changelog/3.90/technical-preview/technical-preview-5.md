# Phaser Beam Technical Preview 5

Welcome to Phaser Beam Technical Preview 5. This preview is an insight into upcoming advances in Phaser and its WebGL renderer.

This version is all about framebuffers. We've revised DynamicTexture to be easier to use and more performant. We've also removed FX and BitmapMask, combining them into the new Filters system.

> This is not production-ready code. A few features are missing or broken. All features are subject to change. Basically, experiment with this, but don't rely on it!

## What Should Work

Most game objects should work by now, except as noted below.

## What Shouldn't Work Yet

- The following FX are not yet available as filters:
  - Barrel Distortion
  - Bloom
  - Circle Outline
  - Color Matrix
  - Glow
  - Gradient
  - Shine
  - Shadow
  - Vignette
  - Wipe / Reveal
- Mesh and Plane objects are not supported.
- Shader won't work (and will crash).
- Lighting within framebuffers may be displaced.

## What's New in TP5

Technical Preview 5 implements systems that rely on framebuffers. This includes `DynamicTexture` (and `RenderTexture` which relies on it), and the Filter system (including the `RenderFilters` GameObject and `FilterList` component).

These systems have changed a lot from Phaser 3, and several systems are removed. In particular, `FX` and `BitmapMask` have been removed, becoming part of the Filter system.

### Recognizing Framebuffers

A framebuffer is a WebGL concept. It encapsulates a set of buffers, including textures which WebGL can render to. You can think of it as a separate camera which can draw different things, which can then be used as textures.

Because a framebuffer is a separate drawing context, rendering must start over every time we target a new framebuffer. We can't batch draw calls together. While an individual framebuffer switch is not very expensive, several hundred of them are. Thus, it's important to recognize how many framebuffers you might be using in your game, to avoid performance issues.

The `RenderFilters` object, and any camera, might use one or more framebuffers. Typically, every filter they use adds a framebuffer switch. Some filters, such as Blur, use more. The `RenderTexture` object (or a `DynamicTexture`) uses one framebuffer, plus anything used when it renders.

We've tried to make it obvious when you're using framebuffers by making these objects top-level citizens of the scene.

### DynamicTexture

The `DynamicTexture` is a texture which can be drawn to at runtime.

In Phaser 3, the drawing commands were very manual. You had to understand batching to use them efficiently. But in Phaser Beam, drawing commands are automatically batched, simplifying use.

This is possible by introducing the command `DynamicTexture.render()`. All drawing commands now enter a buffer. Calling `render()` executes that buffer. Remember to call this new command after drawing.

The remaining drawing commands are as follows:

- `clear`: clear the entire texture.
- `fill`: fill a rectangle, or the entire texture, with a color.
- `stamp`: draw a texture to the screen, ignoring camera transforms. (Uses a `Stamp` object.)
- `draw`: draw a texture or game object to the texture.
- `erase`: like `draw` but erases a hole into the texture instead.
- `repeat`: repeats a texture or frame. (Uses a `TileSprite` object.)

Note that the `draw` command has changed assumptions slightly. All objects default to a central origin, instead of a top-left.

We have removed these drawing commands, which are now unnecessary:

- `drawFrame`
- `beginDraw`
- `batchDraw`
- `batchDrawFrame`
- `endDraw`

#### RenderTexture

The `RenderTexture` object is a GameObject which uses its own `DynamicTexture`. It has all the same changes.

### Filters

Filters are a new category which encompasses the old FX and BitmapMask. They are used for post-processing effects and other compositing tasks.

Filters are available on the Camera. They are also surfaced in the new `RenderFilters` object. In either case, they are available via a `FilterList` component, accessed via `camera.filters.internal` or `camera.filters.external`.

Filters operate in either "internal" or "external" mode, which describes the coordinate system they use. Understanding the difference is important.

#### FilterList

The `FilterList` component manages filters. They can be added, managed, and removed here.

This component is very similar to the old `FX` component. However, it is not available on all GameObjects; it is only on the Camera (and `RenderFilters` which aliases a Camera).

FilterList maintains a list of Controllers. These control parameters of a specific filter. Each Controller has individual padding for each side (this was a single object-wide value in FX). By default, padding is 0 on all sides. You can set it via `setPaddingOverride(left, top, right, bottom)`. Some Controllers can automatically set padding to suit the shader's requirements; activate this via `setPaddingOverride(null)`.

#### Internal vs External

FilterLists come in pairs: internal and external. These have different characteristics. The internal filters render first, followed by the external.

Internal filters operate in texture space. They are "inside" the camera; they have the same size as the camera, and the same axis. They're good for effects which cover a single object. When using a `RenderFilters`, this is often smaller than the screen, so it is more efficient. In general, you should prefer to use internal filters.

External filters operate "outside" the camera. This often means they fill the game screen. They're good for full-screen effects.

If you're familiar with PreFX and PostFX in Phaser 3, internal and external filters are similar. However, internal filters match the orientation of their target, unlike PreFX. This is an intentional change, for greater consistency and rendering flexibility.

#### RenderFilters

The `RenderFilters` object is a new addition. It replaces the `FX` component on game objects. It now operates more like a Layer or Container, wrapping the game object that you want to affect.

RenderFilters contains an internal Camera, which does all the heavy lifting with filters. The RenderFilters object is mainly concerned with focusing on its child.

The object can have a single child. This can be any game object. It can be a Container or Layer, so it can contain many grandchildren. When the child is added, it is removed from the scene's DisplayList.

The internal Camera is focused on the child when the child is added. This sets the size of the RenderFilters, and the framebuffers it uses. In most cases, this is sufficient. However, when the child can grow or change (such as with a `ParticleEmitter`), its size must be updated.

You can resize the camera to the precise size of the child. However, this is not recommended, because a rapidly changing size can force repeated framebuffer resizing, which is a major performance drain. Resize the camera via `RenderFilters.focusOnChild()`, or enable automatic resizing by setting `RenderFilters.autoFocus = true`.

Prefer to set the camera's focus to the final state you need. Use `RenderFilters.focus(x, y, width, height)` to position the child at `x, y` within a framebuffer of size `width, height`. This avoids constant resizing.

You can also manipulate the internal camera directly, or even transform the child. If the child is reacting to physics, this might happen automatically. Set `autofocus = true` to continually update the camera to keep a transforming child in view - this should not have performance implications unless the child is changing size.

In general, most objects should just work when added to a `RenderFilters`. It's only in special cases that you need the extra commands.

#### Filters

The actual Filters work just like the prior FX. They are drawn to a framebuffer with a specific shader in one or more passes.

Not all Filters have been implemented yet (see What Shouldn't Work Yet above).

However, there are two new Filters available: Mask and Sampler. We have also updated Displacement.

##### Mask Filter

The Mask Filter takes the place of separate masks in the Beam renderer. It unifies the former BitmapMask and GeometryMask.

> `GeometryMask` is still available in the Canvas Renderer, so it has not been completely removed.

Add a mask via `RenderFilters.filters.internal.addMask(maskSource)`, where `maskSource` is a texture or game object. Simple as that!

However, by becoming a filter, masks gain a lot of new tricks. You can add several masks to the same object. You can add masks in between other filters, so for example you can blur the edges of a mask after it's applied.

Most importantly, you can use internal masks. Because filters on the internal list run in texture space, a mask on this list follows the object it is filtering. This was not previously possible; all masks operated in screen space (which is still how external masks work).

Many of the choices made around the Beam renderer were made in support of internal masks. We're pretty happy with the result.

##### Sampler Filter

The Sampler Filter doesn't render anything. It acts just like the `snapshot` commands in `DynamicTexture`, allowing you to capture some, all, or a single pixel, of the current state of the filters. In other words, it captures whatever input it receives, and passes it on to other filters. You can extract the state of _some_ filters, but not others.

Add a sampler via `RenderFilters.filters.internal.addSampler((sample) => {}, region)`, where `region` is a Rectangle, a Vector2Like, or `null` to sample the entire framebuffer.

This can be a performance-taxing task, as it must read pixels from the GPU. If you want to use the output as a texture in your game, don't use a sampler; just render in stages, using a RenderTexture to make the output of filters available for further processing. It's mostly useful for probing pixels to gather information.

##### Displacement Filter

The existing Displacement Filter warps an image based on an input texture. Displacement FX used the red channel of the input texture. The Filter version now uses red and green to displace X and Y, so you can use normal maps to get more complex displacement.

## Future Steps

We're closing in on the goal now. Is this the final Technical Preview? Only time will tell.

While TP5 is being tested, we'll be completing the last few pieces. Missing Filters, adding Shader support, integrating the latest changes from the main Phaser branch, updating examples, etc.

Soon.

## Thank You

Thanks for checking out Phaser Beam Technical Preview 5. Do let us know what you think! While it's not finished quite yet, it's almost entirely complete. It should be a good way to figure out how all the new toys work. We hope you have fun!
