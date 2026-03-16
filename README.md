# WebGL Shader Starter

Drop-in boilerplate for running fullscreen GLSL fragment shaders in the browser — Shadertoy-style.

## Files

| File            | Purpose                                      |
|-----------------|----------------------------------------------|
| `index.html`    | Canvas + script loader                       |
| `fragment.glsl` | **Your shader lives here** — edit this       |
| `shader.js`     | WebGL boilerplate (quad, uniforms, loop)     |

## Available Uniforms

| Uniform       | Type    | Description                              |
|---------------|---------|------------------------------------------|
| `iTime`       | float   | Seconds since page load                  |
| `iResolution` | vec2    | Canvas size in pixels                    |
| `iMouse`      | vec2    | Mouse position (Y-axis flipped)          |
| `iFrame`      | int     | Frame counter                            |

## Running Locally

Because `shader.js` uses `fetch()` to load `fragment.glsl`, you need a local HTTP server.
Opening `index.html` directly as a file:// URL will fail.

**Option A — Python (built-in, no install needed):**
```bash
cd shader-starter
python3 -m http.server 8000
# open http://localhost:8000
```

**Option B — Node (if you have it):**
```bash
npx serve .
```

**Option C — VS Code:**
Install the "Live Server" extension, right-click `index.html` → "Open with Live Server".

## Converting a Shadertoy Shader

1. Copy the Shadertoy GLSL into `fragment.glsl`
2. Replace the function signature:
   ```glsl
   // Shadertoy                              → Raw WebGL
   void mainImage(out vec4 fragColor,         void main() {
                  in vec2 fragCoord) {
     fragColor = ...;                           gl_FragColor = ...;
     // fragCoord                               // gl_FragCoord.xy
   }
   ```
3. The uniforms (`iTime`, `iResolution`, `iMouse`) are already wired up and declared at the top of `fragment.glsl`.

## Deploying

- **GitHub Pages**: Push the folder to a repo, enable Pages in Settings → Pages
- **Netlify**: Drag and drop the folder at netlify.com/drop
- **Vercel**: `vercel --prod` from the folder (requires Vercel CLI)
