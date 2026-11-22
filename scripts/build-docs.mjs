import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const docsDir = path.join(rootDir, 'docs');
const threeSrcDir = path.join(rootDir, 'node_modules', 'three');
const threeDestDir = path.join(docsDir, 'vendor', 'three');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDirRecursive(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function collectThreeDependencies() {
  const entryFiles = [
    path.join(threeSrcDir, 'build', 'three.module.js'),
    path.join(threeSrcDir, 'examples', 'jsm', 'environments', 'RoomEnvironment.js'),
    path.join(threeSrcDir, 'examples', 'jsm', 'postprocessing', 'EffectComposer.js'),
    path.join(threeSrcDir, 'examples', 'jsm', 'postprocessing', 'RenderPass.js'),
    path.join(threeSrcDir, 'examples', 'jsm', 'postprocessing', 'UnrealBloomPass.js'),
    path.join(threeSrcDir, 'examples', 'jsm', 'postprocessing', 'OutputPass.js'),
  ];

  // Also scan public/js/*.js for any future 'three/addons/...' imports
  const jsDir = path.join(publicDir, 'js');
  if (fs.existsSync(jsDir)) {
    for (const file of fs.readdirSync(jsDir)) {
      if (!file.endsWith('.js')) continue;
      const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
      for (const m of src.matchAll(/from\s+['"]three\/addons\/([^'"]+)['"]/g)) {
        entryFiles.push(path.join(threeSrcDir, 'examples', 'jsm', m[1]));
      }
    }
  }

  const seen = new Set();
  const queue = [...entryFiles];
  while (queue.length > 0) {
    const filePath = path.resolve(queue.shift());
    if (seen.has(filePath) || !fs.existsSync(filePath)) continue;
    seen.add(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    for (const m of content.matchAll(/(?:from|import)\s+['"](\.[^'"]+)['"]/g)) {
      const resolved = path.resolve(path.dirname(filePath), m[1]);
      queue.push(resolved);
    }
  }

  return [...seen];
}

// Rebuild docs/ cleanly
fs.rmSync(docsDir, { recursive: true, force: true });
ensureDir(docsDir);

// 1. Copy public/ assets and rewrite root-relative paths to relative ./ paths for GitHub Pages subpath hosting
copyDirRecursive(path.join(publicDir, 'js'), path.join(docsDir, 'js'));

const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8')
  .replaceAll('"/vendor/three/', '"./vendor/three/')
  .replaceAll("'/js/", "'./js/")
  .replaceAll('"/js/', '"./js/');
fs.writeFileSync(path.join(docsDir, 'index.html'), indexHtml, 'utf8');

// 2. Copy required Three.js ES module files (zero runtime dependency on node_modules or Express)
const threeFiles = collectThreeDependencies();
for (const absFile of threeFiles) {
  const rel = path.relative(threeSrcDir, absFile);
  const destFile = path.join(threeDestDir, rel);
  ensureDir(path.dirname(destFile));
  fs.copyFileSync(absFile, destFile);
}

// 3. Disable Jekyll processing on GitHub Pages
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '', 'utf8');

console.log(`Built static GitHub Pages site in docs/ (${threeFiles.length} Three.js module files bundled).`);
