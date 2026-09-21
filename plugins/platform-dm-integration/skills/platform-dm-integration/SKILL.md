---
name: platform-dm-integration
description: Decide which messaging platform can actually deliver an automated DM feature, and wire it correctly. Use this BEFORE writing an adapter whenever the user wants to auto-reply to, read, forward, translate, or triage direct messages on Instagram, Telegram, Discord, or any other platform — including phrasings like "봇으로 내 DM 답장해줘", "make a bot that replies to my Instagram DMs", or "자동응답 만들어줘". The central trap is that a bot account is NOT your account: on most platforms a bot can only receive messages addressed to itself, so an adapter built on the wrong assumption is unusable no matter how good the code is. Also load this when debugging an Instagram webhook that never fires despite a correct-looking setup, a "message sent outside of allowed window" error, a bot that answers its own messages, duplicated inbound messages, or a DM that fails on length despite looking short.
---

# 플랫폼 DM 자동화 — 붙기 전에 확인할 것

DM 자동화에서 가장 비싼 실수는 코드가 아니라 **채널 선택**이다. 코어 로직은 어느 플랫폼이든 같지만,
"내 계정에 온 DM을 대신 처리한다"가 애초에 가능한 플랫폼은 많지 않다. 어댑터를 짜기 전에 이걸 먼저 정한다.

## 1. 봇 계정 ≠ 내 계정

이게 이 스킬의 핵심이다. 사용자가 "봇으로 내 DM에 답장"이라고 말할 때, 대부분의 플랫폼에서 그건
**두 가지 다른 일**이다.

| 플랫폼 | 내 계정에 온 DM을 받을 수 있나 | 방법 | 리스크 |
|---|---|---|---|
| **Instagram** | **가능 (공식)** | Instagram API with Instagram Login + `messages` 웹훅 | 낮음 |
| **Telegram** | 봇으론 불가 / userbot이면 가능 | Bot API는 **별도 봇 계정**이고 상대가 `/start`를 눌러야 함. 개인 계정 DM은 MTProto userbot(Telethon/Pyrogram) | userbot은 공식 Client API라 허용되나 스팸 신고 시 제한 |
| **Discord** | **사실상 불가** | 봇은 **상호 서버가 있어야** DM 수신 가능. 셀프봇은 ToS 명시적 금지 → 계정 정지 | 개인 DM 목적으론 배제 |

**먼저 물어볼 것**: "봇에게 말 거는 사람들"을 상대하는 건가, "당신 계정에 DM 보내는 사람들"을 상대하는 건가.
후자인데 Telegram/Discord 봇으로 시작하면 다 만들고 나서 못 쓴다.

**권장 조합**: 실운영은 Instagram, **Telegram 봇은 배선 검증용 테스트베드**. Telegram은 심사가 없어
30초면 붙으므로, Instagram 앱 심사를 기다리는 동안 어댑터 추상화가 제대로 됐는지 먼저 증명할 수 있다.

## 2. Instagram — 조용히 실패하는 것들

공식 경로가 있지만 설정 항목이 많고, **틀렸을 때 에러가 아니라 침묵으로 나타나는 것들**이 있다.

- [ ] 계정이 **비즈니스 또는 크리에이터**인가 (개인 계정은 API 대상이 아님)
- [ ] 계정 설정에서 **메시지 접근 허용(Allow access to messages)** 이 켜져 있는가
      → **꺼져 있으면 웹훅이 에러 없이 그냥 안 온다.** 가장 많이 시간을 먹는 항목
- [ ] Meta 앱을 **Instagram API with Instagram Login** 으로 만들었는가 (Facebook 페이지 연결 불필요)
- [ ] 권한: `instagram_business_basic`, `instagram_business_manage_messages`
- [ ] 웹훅에서 `messages` 필드를 구독했는가
- [ ] 본인 계정은 개발자/테스터 역할로 **앱 심사 없이** 테스트 가능. 타인 계정까지면 App Review
- [ ] 로컬 개발이면 공개 HTTPS가 필요 → `cloudflared tunnel --url http://localhost:PORT`

**아웃바운드 제약**:

- **24시간 윈도우** — 상대의 마지막 메시지로부터 24시간 내에만 발송. `human_agent` 태그로 7일까지
  연장되나 Meta가 오남용을 단속한다. 사람이 실제로 응대하는 도구라면 정당한 사용
- **콜드 DM 불가** — 상대가 먼저 말을 걸어야 스레드가 열린다. 아웃바운드 캠페인은 공식 API로 불가능
- 그룹 메시지 미지원

> 권한명·엔드포인트 버전은 Meta가 자주 바꾼다. 착수 시점에 developers.facebook.com 원문으로 재확인할 것.

## 3. 웹훅에서 실제로 물리는 것들

문서만 읽어서는 안 걸리고, 붙이면 바로 걸린다.

**`is_echo` — 내가 보낸 메시지가 웹훅으로 되돌아온다.** 안 거르면 자기 답장에 다시 답장한다.
Instagram은 `message.is_echo`, Messenger 계열 공통이다.

**ack를 먼저, 처리는 나중.** Meta는 빠른 200을 못 받으면 재시도한다. 핸들러 안에서 LLM 호출 같은
수 초짜리 작업을 `await` 하면 재시도가 쌓인다. 200을 먼저 응답하고 그 뒤에 처리한다.

**재시도는 같은 message id로 온다.** dedup하지 않으면 스레드에 같은 메시지가 여러 번 들어간다.
메모리 Set으로도 재시도 구간은 막히지만, 재시작을 넘기려면 DB에 저장해야 한다.

**서명은 raw body로 검증한다.** `X-Hub-Signature-256`은 원본 바이트의 HMAC이다. JSON으로 파싱한 뒤
다시 직렬화하면 공백·키 순서가 달라져 절대 안 맞는다. body 파서보다 먼저 raw를 잡아둘 것.

**길이 제한이 글자가 아니라 바이트인 경우.** Instagram 메시지는 1000 **바이트**다. 한국어·일본어는
글자당 약 3바이트라 **한글 334자에서 걸린다** — 글자 수 감각으로는 한참 여유인데 거절된다.
`Buffer.byteLength(text, 'utf8')` 로 재고, 거절할 땐 바이트 수를 같이 알려준다.

## 4. 어댑터 설계 — 인바운드만 추상화하면 절반이다

**인바운드**: 어댑터가 `{channel, channelUid, text}` 로 정규화해서 코어에 넘긴다. 코어는 플랫폼을
모른다. 여기까지는 대부분 자연스럽게 나온다.

**아웃바운드가 빠지기 쉽다.** 코어가 답변을 만들어도 *어디로 보낼지*가 없으면 실제 채널에 못 붙인다.
CLI 목 채널로 개발하면 "출력이 곧 배달"이라 이 구멍이 안 보인다. 채널별 배달 레지스트리를 따로 두고,
**코어가 그걸 import하지 않게** 한다 — 껍데기(서버/CLI/어댑터)가 채널을 찾아 넘긴다.

```
registerTransport(channel, (uid, text, context) => ...)
deliver(channel, uid, text, context) -> { delivered, reason? }
```

`context`에 `lastInboundAt` 같은 걸 실어 보내면 24시간 윈도우 같은 **채널 고유 규칙을 채널 안에서**
판단할 수 있다. 코어는 여전히 모른다.

**배달을 기록보다 먼저 한다.** 채널이 거절했는데 "보냄"으로 기록되면, 도착하지 않은 메시지가 스레드에
남는다. 에러보다 나쁘다. 그리고 거절 이유를 그대로 사용자에게 보여준다 — "안 보내졌습니다"만으로는
고칠 수가 없다.

## 5. 검증 순서 — 싼 것부터

1. **스텁 채널** — 존재하지 않는 채널명에 스텁 트랜스포트를 등록하고 왕복을 돌린다.
   토큰도 네트워크도 필요 없이 어댑터 seam이 맞는지 증명된다
2. **Telegram 봇** — @BotFather, 심사 없음. 실채널에서 코어를 안 고치고 붙는지 확인
3. **Instagram** — 2절 체크리스트. 여기서부터 심사와 대기가 붙는다

웹훅은 토큰 없이도 **직접 서명해서** 로컬 서버에 때려볼 수 있다. 핸드셰이크·서명 거부·`is_echo` 필터·
재시도 중복까지 전부 검증 가능하다. 실제 계정 연결 전에 여기까지 끝내두면 심사 후 헤맬 일이 준다.
