---
name: free-tier-llm-app
description: Build or debug an app that calls an LLM API on a free tier or a provider without a bundled reference skill (Gemini, Groq, OpenRouter, etc.) — verify the current SDK shape against live docs instead of guessing, add an automatic mock mode so the app's logic can be built and demoed without spending quota, and consolidate multiple structured-extraction calls into one to survive tight rate limits. Use this whenever the user has no API key yet, hits a 429/quota error, says "I only have a free tier", asks for a free LLM alternative, or is integrating a provider this session has no dedicated skill for.
---

# 무료 티어 / 비주력 LLM 프로바이더로 앱 만들기

Claude API처럼 전용 스킬(`claude-api`)이 있는 프로바이더는 그 스킬이 API 모양을 보장해준다. 하지만 사용자가 무료 티어를 원해서 Gemini·Groq·OpenRouter 같은 다른 프로바이더로 가면, 그런 안전망이 없다. 이 스킬은 그 공백을 메운다.

## 1. 낯선 프로바이더 SDK는 추측하지 말고 WebFetch로 확인한다

LLM API는 몇 달 단위로 바뀐다. 학습 데이터에 있는 기억(예: 예전 방식의 `generateContent`)이 지금도 맞다는 보장이 없다. 코드를 쓰기 전에 공식 문서를 WebFetch로 최소 1~2번 확인한다:

1. 패키지 이름과 설치 명령 (`npm install @google/genai` 같은 것)
2. 클라이언트 초기화 코드
3. 기본 텍스트 생성 호출의 정확한 메서드/파라미터 이름
4. 구조화된(JSON) 출력을 받는 방법 — 스키마를 어떤 형태로 넘기는지
5. 멀티턴 대화를 어떻게 표현하는지 (문자열 하나로 합칠지, 배열 형태를 쓸지)

**모호하면 더 단순하고 확실한 쪽으로 설계를 바꾼다.** 예를 들어 멀티턴 이력을 프로바이더 고유의 "step" 배열 형식으로 표현하는 방법이 문서에서 명확히 확인 안 되면, 그 형식에 기대지 말고 그냥 대화 이력을 하나의 텍스트 문자열로 직렬화해서 매 요청에 새로 넣는 방식(stateless)으로 간다. 덜 세련되지만 검증된 만큼만 확신할 수 있는 코드가 된다.

## 2. API 키가 없거나 준비 안 됐을 때: 자동 목(mock) 모드

사용자가 아직 키가 없거나("무료 티어부터 알아볼게"), 요금이 걱정되거나, 그냥 로직만 먼저 검증하고 싶을 때가 흔하다. 매번 "지금은 API 없이 하고 싶다"는 말을 다시 듣지 않으려면, 처음부터 이렇게 설계한다:

- LLM을 호출하는 각 함수 맨 앞에서 관련 env 변수(`GEMINI_API_KEY` 등)가 있는지 확인한다.
- 없으면 규칙 기반(정규식/키워드 매칭 등)의 목 구현으로 대체한다. 실제 정확도는 낮아도 되고, 목적은 DB 저장·상태 누적·CLI 흐름 같은 "로직이 맞물려 돌아가는지"를 확인하는 것이다.
- 목 응답에는 `[MOCK - ...]` 같은 표시를 넣어서, 실제 LLM 응답과 절대 혼동되지 않게 한다.
- 키가 채워지는 순간 코드 수정 없이 자동으로 실제 호출로 전환되어야 한다 — 별도의 `--mock` 플래그나 빌드 스텝을 요구하지 않는다.

```js
async function classifyIntent(message) {
  if (!process.env.GEMINI_API_KEY) {
    return mockClassifyIntent(message); // 규칙 기반, LLM 호출 없음
  }
  // 실제 API 호출...
}
```

이렇게 해두면 "API 사용 없이 하고 싶다"는 요청에도 아키텍처를 다시 짤 필요가 없다.

## 3. 무료 티어 요청 한도는 생각보다 빡빡하다 — 호출을 합친다

무료 티어는 분당 요청 수(RPM)가 한 자릿수인 경우가 흔하다. 사용자 메시지 하나를 처리하는 데 LLM을 여러 번 부르는 구조(의도 분석 1회 + 정보 추출 1회 + 답변 생성 1회 등)라면, 대화 2~3턴 만에 429(rate limit) 에러를 만난다.

**해결책**: 서로 다른 목적의 호출이라도, 둘 다 "구조화된 정보 추출"이라면 하나의 요청·하나의 스키마로 합칠 수 있는지 먼저 검토한다.

```js
// 나쁨: 호출 2번 (의도 분석 + 메모리 추출)
const intent = await classifyIntent(message);
const memory = await extractMemory(message);

// 좋음: 호출 1번, 스키마에 두 목적의 필드를 모두 포함
const extracted = await extractAll(message); // { intent, destination, travel_date, ... }
```

답변 생성(자유 형식 텍스트)은 보통 별개 호출로 남겨둔다 — 구조화 출력과 자유 텍스트 생성을 억지로 하나의 요청에 합치려 하면 오히려 품질이 떨어진다. 합칠 수 있는 건 "같은 종류의 구조화 추출 작업들"이지, 성격이 다른 호출들이 아니다.

## 검증 방법

1. `.env`에 키를 비워두고(또는 명령 실행 시 `GEMINI_API_KEY=` 로 강제 오버라이드) 목 모드가 실제로 걸리는지 먼저 확인한다.
2. 별도 프로세스로 같은 사용자 ID를 대상으로 여러 턴을 실행해, DB 기반 메모리가 프로세스를 넘어 이어지는지 확인한다 (진짜 "다음 세션에서도 기억하는지"를 검증하는 가장 현실적인 방법).
3. 키를 채운 뒤 실제 호출로 1~2턴을 확인한다. 429가 뜨면 호출 횟수부터 의심한다 — 재시도 로직보다 호출 통합이 먼저다.
