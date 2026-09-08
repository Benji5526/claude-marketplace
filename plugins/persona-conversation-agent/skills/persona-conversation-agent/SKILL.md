---
name: persona-conversation-agent
description: Design and build a persona-driven customer conversation agent — a chatbot that classifies each incoming message's intent, remembers customer details across turns and even across separate sessions, stays in character via a written persona with explicit guardrails, and generates replies grounded in that memory. Use this whenever the user wants to build a customer-service bot, DM/chat assistant, or "AI [role]" character (consultant, support agent, concierge, etc.) that needs to remember who it's talking to and behave consistently — before wiring up any real messaging platform (Instagram/Slack/Discord/etc.), build and test the core agent behind a simple mock channel (CLI or basic web chat) first.
---

# 페르소나 기반 대화 에이전트 설계

"AI 상담원/컨시어지/캐릭터"류 챗봇 — 의도를 분류하고, 고객 정보를 대화 너머까지 기억하고, 정해진 페르소나를 일관되게 유지하며 답하는 에이전트를 만드는 패턴. 실제 DM 채널(Instagram 등) 연동은 뒤로 미루고, 이 에이전트 자체부터 먼저 검증한다.

## 언제 쓰는가

- "AI 상담원/컨시어지/비서/캐릭터를 만들어줘" 같은 요청
- 고객/사용자별로 정보를 기억해야 하는 챗봇 (여행 상담, 쇼핑 도우미, 예약 비서 등)
- 실제 메시징 플랫폼(Instagram/X/카카오톡 등) 연동 이전에 핵심 로직부터 검증하고 싶을 때

## 레이어 분리: 추출 → 메모리 → 답변

세 가지 역할을 분리한다. 섞으면 프롬프트가 비대해지고, 무료/저가 API의 요청 한도도 더 빨리 소진된다.

1. **추출 (Extract)** — 이번 메시지에서 "의도"와 "고객이 명시적으로 말한 정보"를 하나의 구조화 출력 호출로 뽑는다. 언급 안 된 필드는 반드시 `null` — 절대 추측해서 채우지 않는다. (`free-tier-llm-app` 스킬 참고: 이 두 가지를 별도 호출로 나누면 요청 수만 늘어난다.)
2. **메모리 (Memory)** — 순수 DB 계층. LLM을 호출하지 않는다. 추출된 값 중 **기존에 없는 필드만** 채운다 (`existing.field ?? extracted.field`) — 한 번 알아낸 정보를 나중 메시지가 비웠다고 지우지 않는다.
3. **답변 (Reply)** — 페르소나 + "지금까지 알고 있는 고객 정보" + 최근 대화 이력을 시스템 프롬프트에 넣고 자유 형식 답변을 생성한다. 구조화 출력이 아니라 자유 텍스트이므로 별도 호출로 남긴다.

```
사용자 메시지
   │
   ▼
extractAgent.extractMessage()   ── 구조화 출력 1회 (intent + 고객 정보)
   │
   ├─▶ memoryService.applyExtractedMemory()   ── DB 병합, LLM 호출 없음
   │
   ▼
replyAgent.generateReply()      ── 페르소나 + 메모리 + 이력 반영, 자유 텍스트
```

## 페르소나 문서와 코드를 분리하되 동기화한다

페르소나(이름, 성격, 말투, 절대 하지 말아야 할 것)는 `persona-<이름>.md` 같은 설계 문서로 먼저 글로 정리하고, 실제 시스템 프롬프트로 쓸 "MASTER PERSONA PROMPT" 블록을 그 문서 안에 코드 블록으로 포함시킨다. 코드 쪽(`replyAgent.js` 등)에는 그 블록을 그대로 복사해 상수로 두고, 주석으로 "이 문서와 동일하게 유지할 것"이라고 못박는다 — 둘이 따로 놀기 시작하면 어느 쪽이 진짜인지 알 수 없어진다.

페르소나에는 캐릭터성(성격, 말투)뿐 아니라 **반드시 "절대 하지 말아야 할 것" 섹션을 넣는다**:

- 확실하지 않은 정보(가격, 재고, 일정 등)를 지어내지 않는다 — 모르면 "담당자가 확인 후 안내"라고 답하게 한다.
- 되돌리기 어려운 행동(예약, 결제, 계정 변경)은 이 에이전트가 직접 처리하지 않고 사람에게 넘긴다.
- AI냐고 직접 물으면 정직하게 답한다 — 사람인 척하지 않는다.
- 아직 구현 안 된 기능(예: 사진/영상 전송)을 요청받으면, 없다고 솔직히 말하고 대안(담당자 연결 등)을 제시한다.

이런 가드레일은 실제로 LLM이 지킨다 — 예를 들어 가격을 물었을 때 "정확한 가격은 담당자가 확인해드리겠다"고 답하는 식으로, 페르소나 문서에 적어둔 규칙이 그대로 응답에 반영되는지 확인할 수 있다.

## 메모리는 "다음 세션에서도" 검증한다

같은 대화 세션 안에서 기억하는 건 쉽다. 진짜 확인해야 할 건 **완전히 새 프로세스로 다시 실행해도** 이전에 알아낸 고객 정보가 남아있는지다 (DB에 저장했으니 당연히 되어야 하지만, 실제로 확인 전엔 모른다). CLI 채널이라면:

```bash
# 턴 1: 새 프로세스
echo "여행지, 날짜, 인원 언급" | node cli.js chat 고객이름

# 턴 2: 또 다른 새 프로세스, 같은 고객이름
echo "가격 물어보기" | node cli.js chat 고객이름
# → 답변에 턴 1에서 준 정보가 자연스럽게 반영되는지 확인
```

이게 실제로 "다음날 다시 물어봐도 기억한다"는 제품 시나리오를 검증하는 방법이다.

## 실제 채널 연동은 나중으로 미룬다

Instagram/X/카카오톡 같은 실제 메시징 플랫폼 연동은 API 조사·인증·정책 확인이 필요한 별개의 작업이다. 먼저 이 에이전트(추출→메모리→답변)를 CLI나 간단한 웹 채팅으로 감싸서 완성하고 검증한 다음, 플랫폼 어댑터를 그 위에 얇게 얹는 순서로 간다 — 코어 로직과 플랫폼 코드를 분리해두면, 나중에 플랫폼을 추가/교체해도 코어를 다시 짤 필요가 없다.
