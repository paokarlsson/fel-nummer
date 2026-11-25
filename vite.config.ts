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

/** Content Security Policy läggs bara in i bygget (Vites utvecklingsserver behöver inline-stilar). */
function csp(): Plugin {
  const policy =
    "default-src 'self'; connect-src 'self' https://api.anthropic.com; img-src 'self' data: blob:; style-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'";
  return {
    name: 'fel-nummer-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig({
  base: '/fel-nummer/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [serviceWorker(), csp()],
  build: { target: 'es2022', sourcemap: false },
});
