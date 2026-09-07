// MCP stdio 서버 스모크 테스트 템플릿.
// 사용법: 아래 CONFIG만 바꿔서 `node test_mcp_stdio.js` 실행.
// 자식 프로세스로 서버를 띄우고 실제 JSON-RPC(initialize -> tools/list -> tools/call)를
// stdin/stdout으로 주고받아, stdout에 JSON이 아닌 줄이 섞이지 않는지까지 함께 확인한다.

const { spawn } = require('child_process');

const CONFIG = {
  command: 'node',
  args: ['mcp-server.js'],
  cwd: process.cwd(), // 서버 파일이 있는 폴더로 바꿀 것
  // tools/call로 실제 호출해볼 도구 목록. name과 arguments만 도구에 맞게 수정.
  calls: [
    // { name: 'add_todo', arguments: { title: '스모크 테스트' } },
  ],
};

const child = spawn(CONFIG.command, CONFIG.args, {
  cwd: CONFIG.cwd,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
const responses = [];

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      responses.push(JSON.parse(line));
    } catch (e) {
      // stdout에 JSON-RPC가 아닌 줄이 있으면 여기 걸린다 (dotenv 로그 등 함정 #2 참고).
      console.log('[경고: JSON이 아닌 stdout 줄]', line);
    }
  }
});

child.stderr.on('data', (chunk) => {
  console.log('[stderr]', chunk.toString());
});

function send(msg) {
  child.stdin.write(JSON.stringify(msg) + '\n');
}

function waitFor(id, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const iv = setInterval(() => {
      const found = responses.find((r) => r.id === id);
      if (found) {
        clearInterval(iv);
        resolve(found);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(iv);
        reject(new Error('timeout waiting for id ' + id));
      }
    }, 50);
  });
}

async function main() {
  let nextId = 1;

  send({
    jsonrpc: '2.0',
    id: nextId,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '0.0.1' },
    },
  });
  const initRes = await waitFor(nextId++);
  console.log('initialize ->', JSON.stringify(initRes.result?.serverInfo));

  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  send({ jsonrpc: '2.0', id: nextId, method: 'tools/list', params: {} });
  const toolsRes = await waitFor(nextId++);
  console.log('tools ->', toolsRes.result.tools.map((t) => t.name));

  for (const call of CONFIG.calls) {
    send({ jsonrpc: '2.0', id: nextId, method: 'tools/call', params: call });
    const res = await waitFor(nextId++);
    console.log(`${call.name} ->`, JSON.stringify(res.result));
  }

  child.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error('TEST FAILED:', e);
  child.kill();
  process.exit(1);
});
