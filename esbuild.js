// @ts-check
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/host/extension.ts'],
  outfile: 'out/extension.js',
  bundle: true,
  sourcemap: true,
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ['src/webview/main.ts'],
  outfile: 'out/webview/main.js',
  bundle: true,
  sourcemap: true,
  format: 'iife',
  platform: 'browser',
};

async function main() {
  // Always copy CSS to out/webview/
  fs.mkdirSync('out/webview', { recursive: true });
  if (fs.existsSync('src/webview/styles.css')) {
    fs.copyFileSync('src/webview/styles.css', 'out/webview/styles.css');
  }

  if (watch) {
    const [ctx1, ctx2] = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(webviewConfig),
    ]);
    await Promise.all([ctx1.watch(), ctx2.watch()]);
    console.log('[esbuild] Watching for changes...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
    ]);
    console.log('[esbuild] Build complete');
  }
}

main().catch(err => {
  console.error('[esbuild] Build failed:', err);
  process.exit(1);
});
