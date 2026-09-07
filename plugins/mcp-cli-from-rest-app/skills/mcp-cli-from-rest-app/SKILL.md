---
name: mcp-cli-from-rest-app
description: Convert an existing local Express/REST-style app (with a DB layer like better-sqlite3/sqlite3) into an MCP (Model Context Protocol) stdio server and/or a thin terminal CLI, reusing the app's existing business logic instead of rewriting it. Use this whenever the user asks to turn an app into an MCP server, expose an app's functionality as MCP tools, add a terminal command on top of an existing web app, or let Claude call an app's functions directly — even if they just say "MCP로 바꿔줘" or "터미널 명령으로 만들어줘" without naming MCP explicitly. Also load this when debugging a Windows npm install that fails on a native module (node-gyp/Python errors), an MCP stdio server that a client won't connect to, or when registering an MCP server for this Claude desktop app (config lives in ~/.claude.json, not claude_desktop_config.json).
---

# REST 앱 → MCP 서버 / CLI 전환

기존 Express(또는 비슷한) REST API 앱의 핵심 로직은 그대로 두고, MCP 도구와 터미널 CLI라는 두 가지 새 진입점을 얇게 얹는 작업. 앱을 다시 설계하지 않는다 — 이미 있는 쿼리와 검증 로직을 옮겨 담을 뿐이다.

## 언제 쓰는가

- "이 앱을 MCP 서버로 만들어줘 / 대체해줘"
- "터미널에서 쓸 명령을 만들어줘" (기존 웹앱 로직 재사용)
- Windows에서 `npm install`이 `node-gyp`/Python 에러로 실패
- MCP 서버를 붙였는데 클라이언트가 연결을 못 하거나 도구 목록이 안 보임
- 이 Claude 데스크톱 앱에 MCP 서버를 등록해야 함

## 핵심 원칙: 로직과 진입점을 분리한다

REST 라우터 핸들러는 보통 두 가지가 섞여 있다 — (1) SQL/검증/조합 로직, (2) `req`/`res`를 다루는 배관 코드. MCP 서버든 CLI든, 이 배관 코드만 새로 짜고 로직은 그대로 옮긴다.

1. **서비스 모듈 추출** — `services/<name>Service.js`(또는 기존 구조에 맞는 이름)를 만들어 라우터에 있던 순수 함수를 이식한다. 각 함수는 일반 JS 값을 받고 반환하며, `req`/`res`/`Error` 상태 코드를 모른다. 예: `listTodos(filters)`, `addTodo(data)`(실패 시 `throw`), `updateTodo(id, patch)`(없으면 `null` 반환), `deleteTodo(id)`(성공 여부 `boolean` 반환).
   - 기존 DB 연결 모듈(`db.js` 등)은 그대로 재사용 — 스키마를 다시 만들지 않는다.
   - 라우터 파일은 그대로 두거나(웹앱을 유지하는 경우) 삭제한다(완전히 대체하는 경우) — 사용자에게 확인.

2. **MCP 서버** — `@modelcontextprotocol/sdk`의 `McpServer` + `StdioServerTransport`로 새 진입점(`mcp-server.js`)을 만든다. 기존 REST 엔드포인트 하나당 도구 하나씩, 최대한 1:1로 대응시킨다. `zod`로 입력 스키마를 선언하고, 서비스 함수를 호출한 뒤 결과를 `{ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }`로 감싼다. 서비스 함수가 실패(예외/`null`)를 반환하면 `{ content: [...], isError: true }`로 변환한다.
   ```js
   const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
   const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
   const { z } = require('zod');
   const svc = require('./services/xxxService');

   const server = new McpServer({ name: 'my-app-mcp', version: '1.0.0' });
   server.tool('list_items', '설명', { q: z.string().optional() }, async ({ q }) => ({
     content: [{ type: 'text', text: JSON.stringify(svc.listItems({ q }), null, 2) }],
   }));
   server.connect(new StdioServerTransport());
   ```

3. **CLI** — 같은 서비스 모듈을 호출하는 얇은 `cli.js`를 만든다. 인자가 4~5개 서브커맨드 정도로 단순하면 별도 파싱 라이브러리 없이 `process.argv`를 직접 파싱해도 충분하다. `package.json`에 `"bin": { "<명령어>": "./cli.js" }`를 추가하고 `#!/usr/bin/env node` 셔뱅을 넣으면, 그 폴더에서 `npm link` 한 번으로 아무 디렉터리에서나 전역 명령으로 쓸 수 있다. 출력은 JSON이 아니라 사람이 읽기 좋은 텍스트로 포맷한다.

MCP 서버와 CLI는 서비스 모듈을 공유하므로, 한쪽을 만들고 나서 다른 쪽을 추가할 때 서비스 로직을 다시 건드릴 필요가 없다 — 진입점 파일만 새로 쓰면 된다.

## 흔한 함정

### 1. Windows에서 네이티브 모듈 재설치가 실패한다

`node_modules`를 복사하지 않고 새 폴더에서 `npm install`을 돌리면, `better-sqlite3` 같은 네이티브 애드온이 소스 빌드를 시도하다가 Python/Visual Studio 빌드 도구가 없어서 `node-gyp` 에러로 실패한다.

**해결**: 원본 폴더의 `node_modules`를 그대로 복사해서 재사용하고, 그 다음에 새 의존성(`@modelcontextprotocol/sdk`, `zod` 등)만 `npm install <패키지>`로 추가한다 — 이미 빌드된 네이티브 모듈은 건드리지 않는다. 기존 의존성을 제거할 때도(`npm uninstall`) 네이티브 모듈 재빌드를 유발할 수 있으니, 의심되면 `package.json`을 직접 편집하고 `npm install --package-lock-only`로 락파일만 갱신하는 편이 안전하다.
   - 주의: 새로 추가한 패키지(`@modelcontextprotocol/sdk`)가 내부적으로 옛 의존성(예: `express`)을 전이 의존성으로 쓸 수 있다 — `node_modules`에서 무심코 지우면 그 패키지가 깨진다. 지우기 전에 어디서 쓰는지 확인.

### 2. stdout에 로그 한 줄만 섞여도 MCP stdio가 깨진다

MCP stdio 트랜스포트는 stdout을 JSON-RPC 메시지 전용으로 취급한다. `dotenv`(v17+ 기본 동작 등) 같은 라이브러리가 시작할 때 안내 로그를 stdout에 찍으면, 실제 MCP 클라이언트는 그 줄을 JSON으로 파싱하려다 실패하거나 프로토콜이 깨진다.

**해결**: 불필요하면 해당 의존성을 아예 제거한다(`dotenv`처럼 안 쓰는 설정이면). 꼭 필요하면 조용히 만드는 옵션을 쓴다 (`dotenv`는 `config({ quiet: true })`). 일반적으로: MCP 서버 진입점에서는 `console.log`/라이브러리의 기본 stdout 출력을 전부 의심하고, 로그가 필요하면 `console.error`(stderr)로 보낸다.

### 3. `claude_desktop_config.json`에 등록해도 아무 효과가 없다

이 Claude 데스크톱 앱(Code 탭)은 MCP 서버 설정을 `%APPDATA%\Claude\claude_desktop_config.json`에서 읽지 않는다 — 그 파일은 이 앱 자체의 UI 설정(`coworkUserFilesPath`, `preferences.*`, `epitaxyPrefs` 등)만 담고 있다. 실제 MCP 서버 설정은 `C:\Users\<user>\.claude.json`의 `projects["<프로젝트 절대경로>"].mcpServers` 아래에 있다.

**해결**:
```json
"projects": {
  "D:/Git": {
    "mcpServers": {
      "todo-app": { "command": "node", "args": ["C:\\path\\to\\mcp-server.js"] },
      "some-http-server": { "type": "http", "url": "https://..." }
    }
  }
}
```
- 프로젝트 경로 키는 현재 작업 디렉터리와 정확히 일치해야 한다(대소문자·슬래시 방향 포함, 이미 있는 다른 프로젝트 항목의 키 형식을 그대로 따라 하면 안전).
- 이 파일은 수천 줄일 수 있으므로 전체를 다시 쓰지 말고, 해당 프로젝트 블록만 고유한 주변 컨텍스트로 골라 `Edit`으로 수정한다.
- 수정 후 `node -e "JSON.parse(require('fs').readFileSync('<path>','utf8'))"` 등으로 JSON 유효성을 반드시 확인한다 — 이 파일이 깨지면 앱 전체의 프로젝트 설정에 영향을 줄 수 있다.
- 이미 실행 중인 세션은 설정을 바로 반영하지 못할 수 있다. 앱 재시작 또는 새 세션이 필요.

## 검증 방법 (브라우저로 확인할 수 없을 때)

MCP stdio 서버와 CLI는 웹 화면이 없으므로, 아래 두 단계로 확인한다.

1. **서비스 모듈 직접 호출** — `require('./services/xxxService')`로 각 함수를 순서대로 호출해(add → list → update → 존재하지 않는 id로 update/delete → 에러 케이스) 리팩터링이 기존 동작과 같은지 확인한다.
2. **실제 JSON-RPC 핸드셰이크** — `mcp-server.js`를 자식 프로세스로 띄우고 `initialize` → `notifications/initialized` → `tools/list` → `tools/call`을 stdin으로 보내 응답을 stdout에서 읽는다. `scripts/test_mcp_stdio.js`가 이 패턴의 재사용 가능한 템플릿이다 — 대상 파일 경로와 부를 도구/인자만 바꿔서 쓰면 된다. 이 단계에서 stdout에 JSON이 아닌 줄이 섞여 나오면(함정 #2) 바로 드러난다.
3. 등록까지 끝났다면 `claude mcp list`로 서버가 `✔ Connected`인지 확인한다 (이 데스크톱 앱 기준).

작업 중 만든 임시 데이터(테스트용 항목/태그 등)는 실제 DB 파일에 남으므로, 검증이 끝나면 지워서 원래 데이터 상태로 되돌린다.
