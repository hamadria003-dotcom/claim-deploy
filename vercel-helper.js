// 한글 컴퓨터 이름 우회 — os.hostname()을 영문으로 패치
const os = require('os');
const _origHostname = os.hostname;
os.hostname = function () { return 'OFFICE-PC'; };

// npx 캐시에서 vercel CLI 경로를 찾아 실행
const { execSync, spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

// npx가 설치한 vercel 바이너리 경로를 찾는다
let vercelPath;
try {
    // npx 캐시 경로에서 vercel을 찾는다
    const result = execSync('cmd /c "where npx"', { encoding: 'utf-8' }).trim();
    const npxDir = path.dirname(result.split('\n')[0].trim());
    vercelPath = path.join(npxDir, 'vercel.cmd');
} catch (e) {
    vercelPath = 'npx';
}

// 환경변수로 hostname 패치는 안 먹히므로 Node.js -r 플래그로 preload
const preloadScript = path.join(__dirname, '_hostname_patch.js');
const fs = require('fs');
fs.writeFileSync(preloadScript, `const os = require('os'); const _h = os.hostname; os.hostname = () => 'OFFICE-PC';`);

const cmd = `npx vercel ${args.join(' ')}`;
const result = spawnSync('cmd', ['/c', cmd], {
    stdio: 'inherit',
    cwd: __dirname,
    env: {
        ...process.env,
        NODE_OPTIONS: `--require "${preloadScript}"`,
        COMPUTERNAME: 'OFFICE-PC'
    }
});

// 정리
try { fs.unlinkSync(preloadScript); } catch (e) { }

process.exit(result.status || 0);
