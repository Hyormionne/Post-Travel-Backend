# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm start:dev
pnpm test --testPathPattern=<file>
pnpm typecheck
pnpm prisma:generate   # always run after schema changes (includes ESM patch)
```

## Rules

**Swagger:** Every DTO field must have `@ApiProperty({ example: ... })`. Every controller method must have `@ApiOperation`, `@ApiResponse` with `schema: { example: ... }`, and the controller class must have `@ApiTags`.

**Auth:** All endpoints are JWT-protected by default. Add `@Public()` to opt out. Never remove the global `JwtAuthGuard`.

**Tests:** Do not use the NestJS testing module for unit tests. Instantiate classes directly with `jest.Mocked<Partial<T>>` dependencies.

**Prisma:** Import types from `generated/prisma/client`, not `@prisma/client`. Run `pnpm prisma:generate` after any schema change.
