# Phaser 3.90 Technical Preview 4

Welcome to Phaser Beam Technical Preview 4. This preview is an insight into upcoming advances in Phaser and its WebGL renderer.

In this release, we've added Tilemap support - and a host of rendering quality improvements, so your games can look better than ever before. A lot has also changed under the hood, to facilitate more flexibility and power in the shader system.

> This is not production-ready code. Many features are missing or broken. All features are subject to change. Basically, experiment with this, but don't rely on it!

## What Should Work

Most game objects should work by now, except as noted below.

## What Shouldn't Work Yet

- Dynamic textures of any sort.
- Masks and FX which affect objects after they render.
- Mesh and Plane objects are not supported.

## What's New in TP4

Technical Preview 4 brings Tilemaps into the new renderer, but with significant improvements. They now support animation and improved filtering. This is supported by a new shader composition system.

Most obviously, tile layers can now be created as `TilemapGPULayer`, a special accelerated layer.

### TilemapGPULayer

This new variety of tile layer offers improved rendering speed and quality, at the cost of lower flexibility.

To create this variety, you should use the `Tilemap.createLayer(layerID, tileset, x, y, gpu)` method, and set the new `gpu` parameter to `true`. You can also use a variable, if you want to enable or disable GPU tiles globally (such as on a device that has poor shader performance).

The new tile layer encodes tiles into a texture, and draws the entire layer as a single quad. This can be extremely fast: it doesn't have to compute individual tiles as quads. On a desktop, this can be 5 or 50 times faster than the non-GPU version.

Some mobile devices may not be as fast as the non-GPU version. We encourage you to test for performance. Nevertheless, it may still be worth using the GPU layer, because it transfers work to the GPU, freeing up the main JavaScript thread for more performance elsewhere.

The GPU layer doesn't automatically update when you edit the tile data. It gains its performance by keeping data on the GPU and not updating it every frame. You can still update it manually when necessary, via `layer.generateLayerDataTexture()`. If you need tiles that change every frame, use a non-GPU layer.

### Tile Animation Support

Phaser can already read animation data from Tiled format tile data. TP4 now plays those animations.

This happens automatically. Animations are driven by a new `ElapseTimer` component on tile layers, which updates as part of the game loop. This timer can be manipulated or extended, should you need it.

### Improved Filtering

This is the big one. We spent a long time on filtering, and it extends far beyond tiles. This preview introduces the Smooth Pixel Art option, bleed clamping for tiles, and perfect border filtering for `TilemapGPULayer`.

#### Smooth Pixel Art

Enable `render.smoothPixelArt` in the game config to use the Smooth Pixel Art option. You can also set `smoothPixelArt` on a `Texture` to override the game setting.

Previously, `render.pixelArt` made pixel art crisp by using NEAREST texture filtering and disabling anti-aliasing.

Smooth Pixel Art uses a different technique to achieve crisp pixel art with anti-aliasing. Pixels still appear square when scaled up, but aliasing is eliminated. This improves scaling and rotation. We can't say it's _always_ better, because we don't know what you need for your game, but we reckon it's pretty great!

A big thanks to @flay in our Discord for pointing out this technique!

#### Bleed Clamping

Bleed clamping eliminates bleeding on the borders of tiles. This problem occurs when LINEAR texture filtering tries to blend border texels with data from outside the tile frame.

This is always on for `TilemapLayer`, so tiles will never sample from outside their frame.

Note that this creates a sharp edge on tiles. For pixel art, this shouldn't be a problem. For tiles that you want to be smoother, consider using `TilemapGPULayer` for reasons to follow.

#### Perfect Border Filtering

The new `TilemapGPULayer` has perfect borders between tiles. The tiles blend into each other with no apparent seam, due to a custom multisampling solution in the shader. Even if two tiles are on opposite sides of the tile atlas, the shader will blend their edges properly.

This option activates automatically when the tileset texture doesn't have NEAREST texture filtering.

### Shader Composition

The new shader composition system empowers shader templating in a new way. This greatly improves flexibility when designing shaders.

Previously, we had been deploying ultra-specific shaders. The problem was, there were just too many variants. Were we rendering an Image, or a TileSprite, or a Shape? Did it have Lighting, and if so, did it have Self-Shadowing? Did it need the Smooth Pixel Art option? Did we auto-detect a mobile device and alter the number of textures in a batch? Etc, etc. We could potentially have dozens of shaders, all repeating the same set of algorithms. And when code starts to repeat, it's a sign that something needs to change.

So we've made a new, more powerful shader composition system. I won't go into full detail because it's complicated, subject to change, and unnecessary for all but a few users. But I'll touch on the highlights.

This system generates specific shader variants based on configuration. This can be efficiently checked and assembled, generating and compiling new shader programs at the moment they're needed for rendering. A shader may take several milliseconds to compile, so when game performance is critical it's a good idea to 'pretouch' shaders - create a throw-away object with the shader at the start of the game, avoiding performance hiccups later on.

The new system is _idiomatic_. That is, it tries to use as much valid GLSL code as possible. That means leveraging the GLSL preprocessor. We can set feature flags, turn parts of the shader on and off based on those flags, and insert entire new chunks of code into template locations. Being idiomatic means that all the template code is valid in code editors, unlike previous attempts at templating.

As a templating system, we can define additions to shaders. We use this extensively, for example to enable lighting for different types of object. This can be quite fine-grained. For example, an Image uses a normal map texture for lighting, while a Shape is naturally flat. So they have different additions for determining the 'normal' vector. But they use the same addition for computing lights, processing that vector, and creating the lighting effect.

This results in somewhat fragmented code, but the end result is always visible in the WebGL Debug mode provided by Spector. This is a button in the Labs, or you can invoke `game.renderer.captureFrame(false, true)` in your own code if using a debug build. It shows all the WebGL calls and relevant state during the render pass of the current frame. Shader program usage is highlighted; click and examine the code there.

This system will probably be surfaced as a new, more powerful Shader object, suited for any kind of extension.

## Future Steps

We've upgraded most of the rendering system at this point! A full release is on the horizon. We want to get this out there, but we also want it to be as good as it can possibly be, so we're not cutting corners.

Remaining work comes under the 'compositing' heading. Dynamic textures, framebuffers of all kinds, FX and masks all need to be updated and integrated with the new system.

After that, we need to do a lot of housekeeping. Eliminate dead code (there's a lot). Check all the examples. Integrate changes from other code branches. Just get everything tidy for release.

## Thank You

Thanks for checking out Phaser Beam Technical Preview 4. We hope you find it illuminating, and we look forward to hearing about your experiences.
