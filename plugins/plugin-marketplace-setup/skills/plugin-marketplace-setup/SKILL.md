---
name: plugin-marketplace-setup
description: Create a personal Claude Code plugin marketplace repo from scratch and publish it to GitHub so plugins/skills can be installed with `/plugin marketplace add` from any machine. Use this whenever the user wants to package a skill or set of skills as an installable plugin, start their own plugin marketplace, publish a marketplace to GitHub, or debug why `/plugin marketplace add` rejects a name or fails to clone. Also load this when a marketplace add fails with "impersonates an official Anthropic/Claude marketplace" or when troubleshooting SSH vs HTTPS for marketplace/plugin git sources.
---

# 개인 Claude Code 플러그인 마켓플레이스 만들기

기존 스킬을 다른 사람(또는 다른 컴퓨터의 나 자신)이 `/plugin marketplace add`로 바로 설치할 수 있게 저장소 하나로 패키징하는 작업.

## 저장소 구조

```
<repo-root>/
  .claude-plugin/
    marketplace.json          # 마켓플레이스 자체의 매니페스트
  plugins/
    <plugin-name>/
      .claude-plugin/
        plugin.json            # 플러그인 매니페스트
      skills/
        <skill-name>/
          SKILL.md
          scripts/ ...          # 선택
```

한 저장소에 여러 플러그인을 담을 수 있다 — `plugins/` 아래에 폴더만 추가하고 `marketplace.json`의 `plugins` 배열에 항목을 하나 더 넣으면 된다.

## marketplace.json

```json
{
  "$schema": "https://code.claude.com/schemas/marketplace.json",
  "name": "<마켓플레이스 이름>",
  "owner": { "name": "<본인 이름>" },
  "plugins": [
    {
      "name": "<plugin-name>",
      "source": "./plugins/<plugin-name>",
      "description": "..."
    }
  ]
}
```

## plugin.json (각 플러그인 폴더 안)

```json
{
  "name": "<plugin-name>",
  "version": "1.0.0",
  "description": "...",
  "author": { "name": "..." }
}
```

`skills/` 디렉터리는 별도 설정 없이 기본으로 스캔된다 — 플러그인 루트 아래 `skills/<name>/SKILL.md`만 있으면 인식된다.

## 흔한 함정: 마켓플레이스 이름에 "claude"를 쓰면 거부된다

`marketplace.json`의 `name` 필드에 `claude`가 들어간 이름(예: `claude-marketplace`)을 쓰면, 등록 시 이런 에러가 난다:

```
Invalid schema: ... name: Marketplace name impersonates an official Anthropic/Claude marketplace
```

저장소 이름 자체는 `claude`가 들어가도 상관없다 — 문제는 오직 `marketplace.json`의 `name` 필드다. 이 필드만 공식 마켓플레이스처럼 보이지 않는 이름(예: 본인 계정명 기반 `<username>-plugins`)으로 바꾸면 통과한다.

## GitHub에 공개하기

```bash
git init
git add .
git commit -m "..."
gh repo create <repo-name> --public --source=. --remote=origin --push
```

`gh auth status`로 먼저 로그인 상태를 확인한다. Private으로 하려면 `--public`을 `--private`으로.

## 등록/설치 (검증 방법)

```
claude plugin marketplace add <owner>/<repo>        # GitHub, SSH로 clone
claude plugin marketplace add https://github.com/<owner>/<repo>.git   # GitHub, HTTPS로 clone
claude plugin marketplace add <로컬 경로>            # 로컬 디렉터리 (자기 컴퓨터에서 테스트용)
claude plugin install <plugin-name>@<marketplace-name>
claude plugin marketplace list     # 등록된 마켓플레이스와 소스 확인
claude plugin list                 # 설치된 플러그인과 활성화 여부 확인
```

**SSH vs HTTPS**: `owner/repo` 축약형은 기본적으로 SSH로 클론을 시도한다. SSH 키가 설정 안 된 컴퓨터(다른 사람 컴퓨터, 새로 세팅한 환경 등)에서는 이게 막힌다. 저장소가 공개(public)라면 `https://github.com/<owner>/<repo>.git` 형태의 전체 URL을 쓰면 인증 없이 바로 클론되므로, "다른 컴퓨터에서도 되는지" 확인할 때는 이 방식으로 먼저 테스트하는 게 안전하다.

**로컬 경로로 먼저 검증**: GitHub에 올리기 전에 로컬 디렉터리 경로로 `marketplace add`/`plugin install`을 한 번 해보면, 매니페스트 스키마 오류(이름 문제 등)를 미리 잡을 수 있다. 다만 로컬 경로 등록은 그 컴퓨터에서만 유효하므로, 최종적으로 "다른 컴퓨터에서도 되는지"는 반드시 GitHub 소스로 다시 테스트한다 (마켓플레이스를 한 번 remove하고 owner/repo 또는 https URL로 다시 add).

## 업데이트 흐름

로컬 파일을 고치고 GitHub에 push한 뒤, 이미 등록된 마켓플레이스에 반영하려면:

```
claude plugin marketplace update <marketplace-name>
claude plugin install <plugin-name>@<marketplace-name>   # 필요시 재설치
```
