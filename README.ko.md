# Ludoweft

[English](README.md) · **한국어**

![Ludoweft: 게임 파일에서 어댑터, JSONL 워크스페이스, 에이전트 번역·검수, 검증을 거쳐 재빌드까지](.github/social-preview.png)

[![CI](https://github.com/zeikar/ludoweft/actions/workflows/ci.yml/badge.svg)](https://github.com/zeikar/ludoweft/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)
[![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange.svg)](#)

**코딩 에이전트에게 게임 현지화를 맡기세요.**

Ludoweft는 모딩 가능한 게임 리소스를 추출하고, 번역하고, 검증하고, 다시 빌드하는 에이전트 네이티브 파이프라인입니다. 코딩 에이전트에게 결정적으로 동작하는 CLI와 안정적인 JSONL 워크스페이스를 제공하고, 게임 포맷 처리는 어댑터에 맡깁니다.

이 저장소는 Codex와 Claude Code 양쪽에 설치 가능한 플러그인이기도 합니다. 어느 쪽 플러그인이든 동일한 오케스트레이션 스킬과 CLI를 함께 배포하므로, 게임 프로젝트 쪽에는 매니페스트와 비공개 리소스, 번역 워크스페이스만 있으면 됩니다.

> 상태: pre-alpha. 코어 계약과 합성 어댑터, 첫 FreeMote info-PSB 어댑터는 동작하지만 어댑터 API는 아직 바뀔 수 있습니다.

## 왜 만들었나

현지화 도구는 보통 리소스 편집 아니면 기계 번역 중 한쪽에만 집중합니다. Ludoweft는 그 사이의 엔지니어링 루프 전체를 연결합니다.

```text
게임 파일 -> 어댑터 -> JSONL -> 에이전트 번역/검수 -> 검증 -> 재빌드
```

CLI는 모델 제공자를 직접 호출하지 않습니다. Codex, Claude 또는 호환되는 다른 에이전트가 워크플로를 주도하면서 번역을 겹치지 않는 배치로 나눌 수 있고, Ludoweft는 결정적인 파일 조작과 품질 게이트를 담당합니다.

## 범위

초기 범위는 리소스를 추출하고 다시 빌드할 수 있는, 텍스트 비중이 큰 PC 게임 — 비주얼 노벨, 어드벤처 게임, 그 밖의 스크립트 중심 타이틀 — 의 파일 기반 현지화 패치입니다. 번역된 텍스트만 배포하는 커뮤니티 번역 패치, 이를테면 한글패치 제작에 적합합니다. 런타임 텍스트 후킹, OCR 번역, 모든 엔진에 대한 범용 지원은 초기 범위 밖입니다.

Ludoweft는 상용 게임 에셋, 추출된 텍스트, 아카이브 키, 재배포할 수 없는 서드파티 도구를 결코 포함하지 않습니다.

## 빠른 시작

요구 사항: Node.js 20 이상.

```sh
npm test
npm run demo
```

데모는 `examples/demo` 아래의 합성 JSON 데이터를 사용하며 추출, JSONL 내보내기, 검증, 번역 적용, 빌드, 검수 확인까지 전 과정을 실행합니다.

## Codex 플러그인으로 설치

GitHub 저장소를 Codex 마켓플레이스로 추가한 뒤 Ludoweft를 설치합니다.

```sh
codex plugin marketplace add zeikar/ludoweft
codex plugin add ludoweft@ludoweft
```

설치 후에는 새 Codex 스레드를 시작해야 번들된 스킬이 인식됩니다. 현지화 프로젝트를 열고 Codex에게 `ludoweft.project.json`을 inspect하도록 요청하면, 스킬이 플러그인에 포함된 CLI를 직접 실행하므로 `npm link`나 전역 설치가 필요 없습니다.

pre-alpha 개발 기간 동안 `main`의 변경을 따라가려면 다음과 같이 합니다.

```sh
codex plugin marketplace upgrade ludoweft
codex plugin add ludoweft@ludoweft
```

플러그인 계약이 안정화되면 지금의 유동적인 `main` 참조는 릴리스 태그와 버전 고정으로 대체될 예정입니다.

## Claude Code 플러그인으로 설치

저장소를 마켓플레이스로 추가한 뒤 Ludoweft를 설치합니다.

```sh
claude plugin marketplace add zeikar/ludoweft
claude plugin install ludoweft@ludoweft
```

번들된 스킬이 인식되도록 Claude Code를 재시작하세요. 현지화 프로젝트를 열고 Claude에게 `ludoweft.project.json`을 inspect하도록 요청하면, 스킬이 `$CLAUDE_PLUGIN_ROOT`에서 번들 CLI를 실행하므로 전역 설치나 `npm link`가 필요 없습니다.

## CLI 사용법

각 단계를 개별적으로 실행할 수 있습니다.

```sh
node ./bin/ludoweft.mjs inspect --project ./examples/demo/ludoweft.project.json
node ./bin/ludoweft.mjs extract --project ./examples/demo/ludoweft.project.json
node ./bin/ludoweft.mjs export --project ./examples/demo/ludoweft.project.json
node ./bin/ludoweft.mjs validate --project ./examples/demo/ludoweft.project.json
node ./bin/ludoweft.mjs apply --project ./examples/demo/ludoweft.project.json
node ./bin/ludoweft.mjs build --project ./examples/demo/ludoweft.project.json
node ./bin/ludoweft.mjs verify --project ./examples/demo/ludoweft.project.json
```

어댑터와 언어 방향을 정한 뒤 어댑터 중립적인 프로젝트 뼈대를 생성합니다.

```sh
node ./bin/ludoweft.mjs init --adapter demo-json --source-language en --reference-language ja --target-language ko
```

`init`은 의도적으로 어댑터 중립적인 코어 매니페스트만 작성합니다. `inspect`가 성공하려면 선택한 어댑터의 프로젝트별 프로필을 먼저 추가해야 합니다. `demo-json`은
[`examples/demo/ludoweft.project.json`](examples/demo/ludoweft.project.json)을 설정 참고 자료로 사용하세요.
`freemote-info-psb`는 비공개 `adapterConfig`와 `paths.freeMote` 값을 직접 채워야 하며,
아카이브 세부 정보나 키, 로컬 도구 경로를 추측해서는 안 됩니다.

기존의 별도 `ja`/`en`/`ko` JSONL 트리를 변환한 뒤 새로 내보낸 결과와 대조할 수 있습니다.

```sh
node ./bin/ludoweft.mjs import-jsonl --format ja-en-ko-v1 --input ./legacy --output ./translations --dry-run
```

비어 있지 않은 상태로 가져온 번역문은 의도적으로 `draft`로 표시됩니다. 검수와 검증을 거친 뒤
승인된 행만 `translated` 또는 `reviewed`로 올린 다음 빌드하세요.

`npm link` 이후에는 동일한 명령을 `ludoweft`로 실행할 수 있습니다.

## 프로젝트 매니페스트

각 비공개 현지화 프로젝트는 자체 `ludoweft.project.json` 파일을 가집니다.

```json
{
  "schemaVersion": 1,
  "id": "my-game-ko",
  "adapter": "my-engine",
  "languages": {
    "source": "ja",
    "reference": "en",
    "target": "ko"
  },
  "paths": {
    "source": "./game-data",
    "work": "./.ludoweft/work",
    "translations": "./translations",
    "output": "./dist"
  },
  "localConfig": "./ludoweft.local.json"
}
```

설치 경로, 키, 토큰을 비롯한 머신 로컬 값은 git에서 무시되는 `ludoweft.local.json`에 두어야 하며, 공개 매니페스트에는 절대 넣지 않습니다.

## 번역 워크스페이스

한 줄에 JSON 객체 하나를 두면 diff가 작게 유지되고, 여러 에이전트가 거대한 문서를 통째로 다시 쓰지 않고도 서로 다른 파일에서 작업할 수 있습니다.

```json
{"id":"dialogue:intro","source":"Welcome, {player}!","reference":"","target":"{player}님, 어서 오세요!","sourceHash":"...","protectedTokens":["{player}"],"status":"reviewed"}
```

안정적인 ID와 원문 해시가 업스트림 변경을 감지합니다. `export`가 원문이 바뀐 세그먼트를 발견하면 재사용을 위해 기존 번역은 남겨두되 해당 세그먼트를 `stale`로 표시하고 `previousSource`를 기록하며, 수정되기 전까지 `apply`가 빌드를 거부합니다. 업스트림에서 원문 항목이 사라진 세그먼트는 삭제되지 않고 `orphaned`가 되므로, 항목을 제거하는 패치가 검수를 마친 작업물을 파괴하는 일이 없습니다.

빌드에 반영되는 것은 `translated`와 `reviewed` 세그먼트뿐입니다. 보호 토큰은 apply 시점에 어댑터가 지정한 `source` 또는 `reference` 슬롯에서 명명된 토큰 프로필에 따라 다시 계산되므로, 워크스페이스의 `protectedTokens`, `protectedTokenSource`, `protectedTokenProfile`을 편집해도 검사를 우회할 수 없습니다. 비교는 양방향으로 이루어져 번역문이 빠뜨린 플레이스홀더뿐 아니라 없던 것을 만들어낸 경우도 거부됩니다. 내장 `mages` 프로필은 리소스가 이를 사용하도록 설정한 경우 엔진의 `%C`, `%p` 및 이스케이프된 `%%C` 제어 문자도 함께 보호합니다.

`apply`, `build`, `verify`는 모두 현재 원본과 워크스페이스로부터 기대되는 리소스를 다시 도출하므로, 이전 실행이 남긴 산출물이 그대로 빌드되거나 검수 통과 처리되는 일이 없습니다.

스키마는 [`schemas/`](schemas/)에 있습니다. 아키텍처와 어댑터 경계는 [`docs/architecture.md`](docs/architecture.md)에, 에이전트 측 역할과 데이터 경계는 [`docs/agent-workflow.md`](docs/agent-workflow.md)에 정리되어 있습니다.

## FreeMote info-PSB 어댑터

`freemote-info-psb`는 별도로 설치한 FreeMote 도구를 통해 짝을 이루는 `*_info.psb.m`과 `*_body.bin` 아카이브를 지원합니다. `mages-scenario`(MAGES 엔진 시나리오 스크립트), `localized-string-array`(각 말단에 언어당 문자열 하나), `per-language-document`(언어당 하위 문서 하나를 통째로 두며, 언어별로 정렬 순서가 다를 경우 인덱스 테이블로 짝을 맞춤) 콘텐츠 핸들러와 제한된 `appendUnique`, `merge` JSON 변형을 제공합니다. 아카이브 이름, 키, 언어 슬롯, 파일 허용 목록, 게임별 변형은 비공개 프로젝트에 남습니다. 공개 어댑터에는 게임 에셋이나 키가 전혀 포함되지 않으며, FreeMote를 암묵적으로 내려받지도 않습니다.

## 플러그인과 에이전트 스킬

하나의 스킬이 양쪽 호스트를 모두 지원합니다. `skills/ludoweft-localize`는 안전한 오케스트레이션 워크플로를 기술하고, 호스트가 제공하는 루트에서 번들 CLI를 찾아내며, 모델의 판단과 리소스 조작을 분리해서 유지합니다.

| 호스트 | 플러그인 매니페스트 | 마켓플레이스 매니페스트 |
|---|---|---|
| Codex | `.codex-plugin/plugin.json` | `.agents/plugins/marketplace.json` |
| Claude Code | `.claude-plugin/plugin.json` | `.claude-plugin/marketplace.json` |

이 스킬은 `skills/ludoweft-localize/references/engines/` 아래에 엔진별 참고 문서도 함께 담고 있습니다. 한 엔진의 여러 타이틀에 공통으로 적용되는 마크업, 폰트 페이스, 태그 형식을 다루며, 새 엔진에 대한 문서는 pull request로 환영합니다. 두 호스트 모두 저장소 전체를 설치하고 `skills/<name>/SKILL.md` 경로에서 스킬을 찾으므로 매니페스트에 별도의 컴포넌트 경로를 선언하지 않습니다. 코어 CLI는 에이전트 중립적으로 유지됩니다. 다른 코딩 에이전트용으로 패키징하더라도 동일한 `src/`, 스키마, 어댑터, 워크플로 계약을 그대로 재사용하며 게임 프로젝트 데이터에는 손대지 않습니다.

## 로드맵

- 독립적으로 테스트되는 콘텐츠 핸들러 추가 및 외부 어댑터 로딩 지원.
- 트랜잭션 방식의 설치·복원 기능 추가.
- 용어집, 스타일 가이드, 배치, 검수 메타데이터를 워크스페이스 스키마로 모델링. 작성 지침 자체는 이미 스킬에 포함되어 있습니다.
- 에이전트 워크플로 평가와 재현 가능한 픽스처 추가.
- 적절한 패키지 채널을 통한 안정 버전 플러그인·CLI 릴리스 배포.

## 라이선스

MIT
