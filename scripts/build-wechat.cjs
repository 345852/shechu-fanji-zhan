// Rebuild from the shared game sources; no network, dependencies, credentials or web assets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const value = key => { const i = args.indexOf(key); if (i < 0) return ''; if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error('Missing value: ' + key); return args[i + 1]; };
const appid = value('--appid');
if (appid && !/^wx[0-9a-f]{16}$/i.test(appid)) throw Error('请填写真实的小游戏 AppID（wx + 16 位字符），不要填写 AppSecret。');
const out = path.resolve(value('--out') || path.join(root, 'dist/wechat-minigame'));
if (out === root || out === path.dirname(root)) throw Error('请使用独立输出目录');
fs.mkdirSync(out, { recursive: true });
const files = ['data', 'audio', 'input', 'renderer', 'entities', 'game'];
const source = files.map(name => fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8')).join('\n');
const core = `'use strict';\nmodule.exports = function createCore(env) {\nconst { window, document, performance, requestAnimationFrame } = env;\n${source}\nreturn window;\n};\n`;
fs.writeFileSync(path.join(out, 'core.js'), core);
for (const file of ['game.js', 'runtime.js', 'game.json']) fs.copyFileSync(path.join(root, 'minigame', file), path.join(out, file));
fs.writeFileSync(path.join(out, 'project.config.json'), JSON.stringify({
  description: '社畜反击战 · 微信小游戏', compileType: 'game', appid,
  projectname: 'shechu-fanji-zhan', miniprogramRoot: './',
  setting: { urlCheck: true, es6: true, enhance: true, minified: true, uploadWithSourceMap: true },
  packOptions: { ignore: [{ type: 'file', value: 'build-info.json' }] }
}, null, 2) + '\n');
const manifest = { appidConfigured: !!appid, sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), files: {} };
for (const file of ['core.js', 'game.js', 'runtime.js', 'game.json', 'project.config.json']) {
  const bytes = fs.readFileSync(path.join(out, file));
  manifest.files[file] = { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ directory: out, bytes: Object.values(manifest.files).reduce((sum, file) => sum + file.bytes, 0), appidConfigured: !!appid }));
if (!appid) console.log('尚未绑定 AppID：可准备导入，但不能上传/提审。使用 --appid wx… 重新构建。');
