# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm start:dev
pnpm test --testPathPatterns=<file>         # unit tests (src/ only, *.spec.ts)
pnpm test:e2e --testPathPatterns=<file>     # e2e tests (test/ dir, *.e2e-spec.ts)
pnpm typecheck
pnpm prisma:generate   # always run after schema changes (includes ESM patch)
```

**Jest 주의:** `--testPathPattern` (단수)는 deprecated. 반드시 `--testPathPatterns` (복수) 사용.
E2E 테스트는 `test/` 디렉토리에 있으며 `pnpm test`로는 찾지 못함. 반드시 `pnpm test:e2e` 사용.

## Before Committing

반드시 아래 명령을 순서대로 실행하고 전부 통과한 뒤 커밋할 것:

```bash
pnpm lint:check   # prettier + eslint (CI와 동일한 체크)
pnpm typecheck
pnpm test         # unit tests
pnpm test:e2e     # e2e tests
```

lint:check 실패 시 `pnpm lint` (자동 수정) 후 재확인.

**서비스 메서드 이름을 바꿀 때**: 해당 서비스를 mock하는 모든 파일을 반드시 함께 수정할 것.
- unit test mock: `src/**/*.spec.ts`
- e2e test mock: `test/**/*.e2e-spec.ts`
- 검색: `grep -rn "메서드명" src/ test/`

## Rules

**Swagger:** Every DTO field must have `@ApiProperty({ example: ... })`. Every controller method must have `@ApiOperation`, `@ApiResponse` with `schema: { example: ... }`, and the controller class must have `@ApiTags`.

**Auth:** All endpoints are JWT-protected by default. Add `@Public()` to opt out. Never remove the global `JwtAuthGuard`.

**Tests:** Do not use the NestJS testing module for unit tests. Instantiate classes directly with `jest.Mocked<Partial<T>>` dependencies.

**Prisma:** Import types from `generated/prisma/client`, not `@prisma/client`. Run `pnpm prisma:generate` after any schema change.
