import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
for (const name of ['tuongtaccheo', 'facebook'])
  await build({
    entryPoints: [`src/content/${name}.ts`],
    outfile: `dist/${name}.js`,
    bundle: true,
    format: 'iife',
    target: 'chrome120',
    minify: true,
  });

// Use Vietnam build time as the display version, independent of the build machine timezone.
const parts = Object.fromEntries(
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date())
    .map(({ type, value }) => [type, value]),
);
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
manifest.version = [
  parts.year,
  Number(parts.month + parts.day),
  Number(parts.hour + parts.minute),
  Number(parts.second),
].join('.');
manifest.version_name = `${parts.hour}:${parts.minute} · ${parts.day}/${parts.month}/${parts.year}`;
await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`CrossEngage ${manifest.version_name} — version ${manifest.version}`);
