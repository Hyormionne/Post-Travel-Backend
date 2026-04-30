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

## Rules

**Swagger:** Every DTO field must have `@ApiProperty({ example: ... })`. Every controller method must have `@ApiOperation`, `@ApiResponse` with `schema: { example: ... }`, and the controller class must have `@ApiTags`.

**Auth:** All endpoints are JWT-protected by default. Add `@Public()` to opt out. Never remove the global `JwtAuthGuard`.

**Tests:** Do not use the NestJS testing module for unit tests. Instantiate classes directly with `jest.Mocked<Partial<T>>` dependencies.

**Prisma:** Import types from `generated/prisma/client`, not `@prisma/client`. Run `pnpm prisma:generate` after any schema change.
