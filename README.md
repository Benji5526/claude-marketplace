# claude-marketplace

Claude Code용 개인 플러그인 마켓플레이스.

## 등록 방법

Claude Code 세션에서:

```
/plugin marketplace add Benji5526/claude-marketplace
/plugin install mcp-cli-from-rest-app@byjun-plugins
/plugin install plugin-marketplace-setup@byjun-plugins
/plugin install free-tier-llm-app@byjun-plugins
/plugin install persona-conversation-agent@byjun-plugins
```

(마켓플레이스 이름은 저장소 이름과 다른 `byjun-plugins`입니다 — `claude-marketplace`라는 이름 자체는 공식 마켓플레이스 사칭으로 오인되어 등록이 거부됩니다.)

## 포함된 플러그인

- **mcp-cli-from-rest-app** — 기존 REST/Express 앱을 MCP stdio 서버 + 터미널 CLI로 전환하는 스킬. 서비스 로직 추출, MCP 도구 등록, CLI 진입점 추가, Windows 네이티브 모듈/stdout 로그/이 앱의 MCP 설정 위치 관련 함정을 다룸.
- **plugin-marketplace-setup** — 이 저장소 자체를 만들 때 쓴 방법을 담은 스킬. marketplace.json/plugin.json 구조, "claude"가 들어간 마켓플레이스 이름이 거부되는 함정, GitHub 공개, SSH/HTTPS 등록 차이를 다룸.
- **free-tier-llm-app** — 무료 티어/비주력 LLM 프로바이더(Gemini 등)로 앱을 만들 때의 패턴. 낯선 SDK는 WebFetch로 검증, API 키 유무에 따른 자동 목(mock) 모드, 무료 티어 요청 한도를 위한 호출 통합을 다룸.
- **persona-conversation-agent** — 페르소나 기반 대화 에이전트(AI 상담원/컨시어지 등) 설계 패턴. 추출(의도+메모리)/메모리(순수 DB)/답변(페르소나) 레이어 분리, 페르소나 문서-코드 동기화와 가드레일, 프로세스 재시작 후에도 메모리가 이어지는지 검증하는 방법을 다룸.
