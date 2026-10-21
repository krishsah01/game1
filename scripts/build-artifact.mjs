// Composes a single self-contained HTML fragment (no <html>/<head>/<body>) from a
// static Vite build, for hosts that wrap the page in their own document skeleton.
//   VITE_TRANSPORT=inprocess VITE_INLINE_ASSETS=1 npx vite build --base ./ --outDir dist-artifact
//   node scripts/build-artifact.mjs dist-artifact
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist-artifact';
const assets = join(dir, 'assets');
const files = readdirSync(assets);
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
if (!js) throw new Error('no JS bundle found');
const html = `<title>Milsim Concept Lab</title>
<meta name="description" content="Side-scroller milsim concept demonstrator: fixed perpendicular 3D view, head-origin visibility, cover states, recon intel and depth-sway aiming (in-process GraphQL demo).">
<style>
:root { color-scheme: dark; }
${css}
</style>
<div id="root"></div>
<script type="module">
${js.replace(/<\/script>/g, '<\\/script>')}
</script>
`;
writeFileSync(join(dir, 'artifact.html'), html);
const size = statSync(join(dir, 'artifact.html')).size;
console.log(`wrote ${join(dir, 'artifact.html')} (${(size / 1024 / 1024).toFixed(2)} MB)`);
