import { build } from 'esbuild';
for (const name of ['tuongtaccheo', 'facebook'])
  await build({
    entryPoints: [`src/content/${name}.ts`],
    outfile: `dist/${name}.js`,
    bundle: true,
    format: 'iife',
    target: 'chrome120',
    minify: true,
  });
