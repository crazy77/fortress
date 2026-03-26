# Phaser 3.90 Technical Preview 1

Welcome to Phaser 3.90 Technical Preview 1. This preview is an early insight into upcoming improvements to Phaser 3. This is not production-ready code. Many features are missing or broken. All features are subject to change. Basically, experiment with this, but don't rely on it!

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

In addition, the Camera should work, including the following properties:

- Transform (where the camera is on screen)
- Scroll and zoom (where the camera is pointing in the game world)
- Background color
- Fade effect
- Flash effect

## What Shouldn't Work Yet

Most other game objects will probably cause the game to freeze.

Dynamic textures will cause the game to freeze.

Masks are not supported on cameras or game objects.

FX are not supported on cameras or game objects.

Performance on mobile might be lower than expected, as we haven't yet implemented any special handling for mobile GPU conditions. But we want to see how it works.

## What's Going On Here

The Phaser 3 render system is fast and capable. However, it has to keep track of a lot of different things, and it was getting harder and harder to add new things to the code base. When we found that we couldn't stack masks and FX together reliably, we decided we needed to fix things.

So we're taking the time to make the renderer simpler and more robust under the hood. We're reusing all the pieces we can, because they work. But we're breaking them up into smaller, more specific tools, which are easier to understand and fix.

### Step One: We're All About Quads

The first step is actually saying what Phaser 3 does. And that's simple: it renders independent quads. Sure, sometimes it renders other things, like meshes and ropes. But most of what it does is put lots of quads on screen. A 3D engine creates shapes out of large collections of triangles, but Phaser creates quadrangles with textures on them. It's a different kind of challenge.

We've upgraded our core shader to render quads more efficiently. This uses a WebGL extension for drawing instances; we believe this is universally supported, but that's what the Technical Preview is here to test. Instanced quads compute just 2/3 as many vertexes, use just 1/5 the vertex buffer memory, and take some pressure off the CPU for calculating transforms.

The shader is tightly coupled to its vertex buffers using VAOs (Vertex Array Objects), another WebGL extension with (hopefully) universal support. This means we can set up the shaders once, and leave them to work.

### Step Two: WebGL State Management

The second step is taking firm control over WebGL with state management. If you peer into the technical depths of the current render system, you'll see many repeated calls and unnecessary operations. Most of these are there just in case the WebGL state has been set to something we don't want. State management tracks every element of WebGL state, and stores it. We can now avoid unnecessary and repeated commands.

State management is the logical extension of the WebGLWrappers introduced in Phaser 3.80. These stored information about various WebGL resources, so they could be recreated if the WebGL context was lost (say, due to the browser unloading a tab).

So far, state management has dramatically simplified debug in development. Hopefully it also helps performance, because it's not sending as many commands to the GPU. Frequently, less than half as many commands are necessary. We still have to actually send vertex data and wait for the GPU to draw, though! It's not going to double frame rates overnight.

### Step Three: DrawingContext

The third step is being explicit about drawing context. To do this, we created a class called `DrawingContext`, responsible for describing a particular render state in every relevant detail.

This includes things such as the current camera, target WebGL framebuffer, blend mode, WebGL scissor settings, and more. There are a lot of drawing options in WebGL - no wonder we were starting to lose track of them all! So we put them in one place. Together with state management, it's easy to simply assert what state WebGL should be in, and efficiently enter that state.

The drawing context was designed to eliminate programming errors. If we overlook a single WebGL state parameter, we might create a bug with no obvious error message, and that's hard to trace. So we just don't overlook any parameters; they're all automated in the drawing context.

### Step Four: The Render Tree

The fourth step is adding structure to the Phaser 3 render flow. We've chosen to interpret it as a tree graph. This means it has a hierarchy of nodes.

In this case, that's literal. We've broken down some of the former Pipeline architecture, and turned individual functions into individual `RenderNode` objects. You might think this makes for a lot of render nodes, but we've found that we could simplify the logic quite a lot along the way.

In fact, after fixing some long-standing problems, we were able to put _all_ the currently working GameObjects through the same render node. This is possible because they're all independent quads. To the render system, they all behave exactly the same way. You see how Step One is important? Once we actually realized we were all about quads, a lot of things got simpler.

The render nodes form a tree. We pass a DrawingContext in at the root, and each node can clone and modify it, then pass it to any number of other nodes. This branching structure helps us understand exactly how our render system is working in complex scenes. It's easy to say which nodes are operating in which drawing context, which prevents accidental WebGL state leakage.

Now, technically there's no render tree in memory. Phaser renders game objects one by one, going down the list of objects a Camera can see. The nodes are singletons: there's only ever one of each. But the connection of methods calling other methods forms an implicit tree, and that's what we use to describe the state of the renderer.

In fact, we've added debug tools to show us exactly what it's doing. You can use them yourself! Run `game.renderer.renderNodes.setDebug(true)` (where `game` is a reference to your game) to capture the render tree for a single frame, then run `console.log(game.renderer.renderNodes.debugToString())` to log out a human-readable version of the nodes used in that frame. It might look something like this:

```
[Render Tree Root]
  Camera
    ListCompositor
      ImageQuadrangulateBatch
        GetSBRQuadMatrices
      BatchTexturedTintedRawQuads
      ImageQuadrangulateBatch
        GetSBRQuadMatrices
    BatchTexturedTintedRawQuads
```

These probably aren't the final names of the render nodes, and the nodes themselves might change during development. Remember, none of this is final. But it is pretty exciting!

## Future Steps

In the short-term future, we'll be putting out more Technical Preview builds as we complete more and more of the renderer. These previews help us make sure we're not making any terrible mistakes! We try to make everything work perfectly, but there are always surprises. We'd be very thankful for any feedback.

There are probably going to be some changes to the Phaser API around rendering in 3.90, but we're working to ensure that these alterations are minimal and only as necessary. Most of the changes will be internal. If you're working on something that affects the renderer, such as shaders, you might need to change a few things, but we'll be more explicit about that when we've finalized the changes.

While we aren't focusing on performance for the final release of 3.90, we do anticipate some improvements due to the new approach. We certainly don't want to release something that runs slower. And we think it's got the potential to be measurably quicker.

A major part of this work is fixing mask and FX compatibility. In fact, we aim to add some new FX which _are_ masks. This only works if everything fits together perfectly, but as you have seen, we're working hard to make the renderer super robust and futureproof.

## Thanks

Thank you for checking out Phaser 3.90 Technical Preview 1! We look forward to hearing from you, and to releasing a shiny new renderer, supporting exciting new developments for years to come.
