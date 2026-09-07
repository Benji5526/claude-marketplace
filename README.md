# claude-marketplace

Claude Code용 개인 플러그인 마켓플레이스.

## 등록 방법

Claude Code 세션에서:

```
/plugin marketplace add <이 저장소 경로 또는 git URL>
/plugin install mcp-cli-from-rest-app@claude-marketplace
```

## 포함된 플러그인

- **mcp-cli-from-rest-app** — 기존 REST/Express 앱을 MCP stdio 서버 + 터미널 CLI로 전환하는 스킬. 서비스 로직 추출, MCP 도구 등록, CLI 진입점 추가, Windows 네이티브 모듈/stdout 로그/이 앱의 MCP 설정 위치 관련 함정을 다룸.
