# Phaser 3.90 Technical Preview 2

Welcome to Phaser 3.90 Technical Preview 2. This preview is an early insight into upcoming improvements to Phaser 3. This is not production-ready code. Many features are missing or broken. All features are subject to change. Basically, experiment with this, but don't rely on it!

## Summary

- Added support for lights.
- Changed render strategy from instancing to indexed elements.
- Added support for configuring `RenderNode` instances.

## What Should Work

The following GameObjects should work properly.

- `Image`
- `Sprite`
- `Text`
- `Video`

The `Layer` may work, although it hasn't been fully tested yet.

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

_New in TP2:_ Mobile detection and shader optimization is in place.

## What Shouldn't Work Yet

Most other game objects will probably cause the game to freeze.

Dynamic textures will cause the game to freeze.

Masks are not supported on cameras or game objects.

FX are not supported on cameras or game objects.

## Differences

Some things work differently, due to the shift to a different rendering strategy.

### Game Object Components

The `Pipeline` component has been removed from the updated game objects. It has been replaced with a `RenderNode` component.

### Render Nodes

The following nodes from TP1 have been removed:

- `ImageQuadrangulateBatch`
- `GetSBRQuadMatrices`
- `BatchTexturedTintedRawQuads`
- `Batch`

The following nodes have been added:

- `BatchHandler`
- `GameObjectBatcher`
- `LightBatcher`
- `LightBatchHandler`
- `QuadBatchHandler`

These names themselves will probably change. We're still figuring out where functionality needs to sit.

### Lights

Light can be set on the updated game objects, using the game object method `setRenderNode('LightBatcher')`. This differs from the method used in versions 3.80 and earlier, `setPipeline('Light2D')`.  This is also not final and will probably change to something more convenient. Lights should behave exactly as they do in v3.80.1.

## What's Going On Here

This release represents a lot of work on adaptable, performant rendering. While it only adds Lights to the supported feature set, there's a lot happening under the hood to make it faster, everywhere.

### Shifting from Instances to Indexes

TP1 used instanced rendering for greater efficiency. Unfortunately, technical limitations eventually made it impractical, so we shifted to indexed rendering instead.

Instanced rendering has a problem with batched rendering. We want to upload a single vertex buffer for instances, then render a series of offset chunks of that buffer. Each chunk uses a different set of textures, allowing us to render many different textured sprites efficiently. But the widely available WebGL extension that provides instanced rendering cannot offset the instanced data. There is another extension which provides this ability, but it isn't widely available. Any solution to the problem winds up introducing many more WebGL calls, which brings performance down to unacceptable levels.

So we went back to something more like the 3.80 solution. However, instead of drawing arrays, we draw elements. This means we tell WebGL to render a list of vertex IDs, instead of sending the vertices in one big list. This allows us to repeat vertex IDs. So instead of uploading 6 vertices to define 2 triangles to define 1 quad, we can upload 4 vertices and reuse them.

Our index list looks like [0, 0, 1, 2, 3, 3... ]. In sequence, it looks like [ 0, 0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7... ]. We are giving 6 indices per quad, but there are only 4 vertex IDs. The first and last IDs are repeated. This is drawn using a topology called `TRIANGLE_STRIP`, which takes every possible consecutive triplet: [ 0, 0, 1 ], [ 0, 1, 2 ] etc. It's very useful for connected triangles. Now, this might seem like a bad idea for quads, which are supposed to be unconnected. However, the repeated IDs form so-called 'degenerate triangles': when two vertices are the same, the triangle has no area, and therefore WebGL doesn't draw it. It's like a ghost triangle linking quads together.

Compared to v3.80, this means we're processing only 2/3 the data. (6 vertices to 4.) Under artificial circumstances, this actually translates to a 50% frame rate increase! That requires quads the size of individual pixels, so the vertex shader part of rendering is dominant, so it's not a realistic scenario. However, even less intense games will benefit from the smaller buffer sizes that must be transferred to the GPU.

It was a pity to leave instanced rendering behind, but we want to make the most performant renderer we can, for the widest range of devices possible. And I think we're doing a good job of that.

### Big Batches

We changed the maximum batch size from 4,096 to 16,384 quads. There are several reasons for this.

First, it's more efficient to send larger amounts of data to buffers on the GPU. From testing on a variety of devices, we reach a 'sweet spot' once we're sending around 32 KB of data per call. More calls with smaller amounts of data are increasingly inefficient, while fewer calls with more data don't get any more efficient. 16K quads will generally be comfortably into the sweet spot.

Second, fewer WebGL calls are better. Bigger batches mean we need fewer calls, so that's just good.

Third, 16K quads is a natural boundary on the device. Because we're using indexed rendering, every vertex needs a unique index. The indices are 16-bit unsigned integers, which have 65,536 possible values. A quad uses 4 unique vertices, thus 4 unique indices. So we can describe 16,384 possible unique quads. (There is a widely supported extension that gives 32-bit indices, giving up to 4.3 billion possible indices. But we don't need that much data. Most devices don't have that much memory, and would take minutes to upload the data for a single frame. The 16-bit barrier is good enough!)

### Configurable Render Nodes

We renamed and reorganized several RenderNodes to support configurability. Nobody wants to rewrite the nodes from the ground up for every variant. Most of the functionality is repeated.

We also want to be able to change how RenderNodes behave at runtime. This is useful for changing game options for performance or quality.

So there are now several levels of configurability.

- Set default GameObjectBatcher node.
- Set per-object GameObjectBatcher node.
- Set BatchHandler node on GameObjectBatcher.
- Advise texture unit count on GameObjectBatcher.
- Create new nodes with custom names, shaders, attribute layouts, behaviors, etc, based on extant nodes.

Each game object has a reference to a GameObjectBatcher node. This is usually the system default `'GameObjectBatcher'`, but it can be redirected per object, e.g. `setRenderNode('LightBatcher')`. This is how we set objects to react to lights.

The GameObjectBatcher node has a reference to a BatchHandler node. The batcher sends data to the handler, which adds it to a batch, and when the batch is full or we start drawing something else, it draws the contents of that batch. You can swap out the whole handler node, changing rendering behavior across the whole game at once. This could be useful for switching to a new shader without having to reboot the game.

The node manager can dispatch an event advising a specific texture unit count. This causes default BatchHandler nodes to recompile their shaders, which for a single shader is unnoticeably quick. This is useful for switching between Single and Multi texture batching strategies. On desktops and most devices, Multi is most efficient: it binds all texture units, allowing for bigger batches and more efficient rendering. But on some devices, Single is most efficient: using just 1 texture unit is much faster. This is a useful option for allowing users to tweak performance to their device's specifics.

Finally, you can create new nodes. This is quite complicated, and will probably change as we use it ourselves to make new nodes for other parts of the renderer. Right now, we have a couple of examples:

- `LightBatcher` is a reconfigured and extended `GameObjectBatcher`.
- `LightBatchHandler` is a reconfigured and extended `QuadBatchHandler`, which itself extends `BatchHandler`.

So how do you assign a new shader to an object? Well, give it a new batcher node, and point the batcher node at a batch handler with the new shader. Check out `LightBatcher` and `LightBatchHandler` in the source code for an example.

## Future Steps

This is the second Technical Preview. We'll put out more in coming weeks. As you can see, we're really making sure that everything works perfectly, and is optimized for all users, so the foundations are really important.

Hopefully, with these foundations set, we can get more features working in the next TP.

There are several features which we intend to change going forward. Activating Lights on an object should be simpler, and not rely on knowing the name of a RenderNode which may change in the future.

But in general, we're going to get more game objects rendering, sometimes better than before. It'll be worth the wait.
