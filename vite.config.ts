import { defineConfig, type Plugin } from 'vite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Bygger service workern med en lista över alla filer som ska precachas. */
function serviceWorker(): Plugin {
  return {
    name: 'fel-nummer-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = new Set<string>(['./']);
      for (const name of Object.keys(bundle)) if (!name.endsWith('.map')) files.add(name);
      for (const p of walk('public')) files.add(relative('public', p).split('\\').join('/'));
      const template = readFileSync('src/pwa/sw.js', 'utf8');
      const source = template
        .replace('__VERSION__', pkg.version)
        .replace('__ASSETS__', JSON.stringify([...files].sort()));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: '/fel-nummer/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [serviceWorker()],
  build: { target: 'es2022', sourcemap: false },
});
