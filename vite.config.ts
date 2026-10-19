import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two builds from one source:
//   default        → dist/: the site the worker serves (scripts and styles as files, so
//                    the CSP can be script-src 'self' with no inline code)
//   --mode offline → dist-offline/index.html: one self-contained file that works from
//                    file://; scripts/finalize-offline.mjs adds its CSP and copies it
//                    into dist/ as the "use offline" download.
export default defineConfig(({ mode }) => {
  const offline = mode === 'offline';
  return {
    plugins: [preact(), ...(offline ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    define: { __OFFLINE__: JSON.stringify(offline) },
    publicDir: offline ? false : 'public',
    build: {
      outDir: offline ? 'dist-offline' : 'dist',
      emptyOutDir: true,
      target: 'es2022',
      // The preload polyfill fetch()es modules; everything is in one chunk anyway,
      // and connect-src 'none' would block it.
      modulePreload: { polyfill: false },
      assetsInlineLimit: offline ? Number.MAX_SAFE_INTEGER : 0,
      reportCompressedSize: true,
    },
  };
});
