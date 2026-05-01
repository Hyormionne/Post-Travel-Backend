# Post-Travel-Backend

AI 여행 사진 정리 &amp; 여행 블로그 작성 모바일앱

Backend (NestJS 11 + Prisma 7 + PostgreSQL 16 + Redis 8).

### 1. 사전 요구

- Node.js 22 LTS, pnpm 10.x
- Docker Desktop (Compose V2)

### 2. 셋업

```bash
cp .env.example .env
# JWT_ACCESS_SECRET / JWT_REFRESH_SECRET 을 `openssl rand -hex 32` 결과로 교체
# GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 은 Google Cloud Console에서 발급

pnpm install
docker compose up -d postgres redis minio
pnpm prisma migrate dev
pnpm prisma:seed       # 개발용 dev@example.com / password1234 유저 생성
pnpm start:dev
```

### 3. 주요 스크립트

| 명령                 | 용도                  |
| -------------------- | --------------------- |
| `pnpm start:dev`     | 개발 서버 (핫 리로드) |
| `pnpm test`          | 유닛 테스트           |
| `pnpm test:e2e`      | e2e 테스트            |
| `pnpm lint`          | ESLint 자동 수정      |
| `pnpm typecheck`     | `tsc --noEmit`        |
| `pnpm prisma:studio` | Prisma Studio GUI     |

### 4. 아키텍처

```mermaid
graph TB
    subgraph Client["클라이언트 (React Native)"]
        APP[Mobile App]
    end

    subgraph Backend["NestJS Backend · Port 3000"]
        direction TB
        subgraph Guards
            JWTGuard["JwtAuthGuard (전역)"]
            MemberGuard[RoomMemberGuard]
            OwnerGuard[RoomOwnerGuard]
        end

        subgraph Modules["Feature Modules"]
            AuthMod["AuthModule · /auth"]
            RoomsMod["RoomsModule · /rooms"]
            PhotosMod["PhotosModule · /photos"]
            ClustersMod["ClustersModule · /clusters"]
        end

        PrismaService[PrismaService]
        RedisService[RedisService]
        S3Service[S3Service]
    end

    subgraph External["외부 서비스"]
        Google[Google OAuth API]
        S3[("S3 / MinIO")]
        PG[("PostgreSQL 16")]
        Redis[("Redis 8")]
    end

    APP -->|"JWT Bearer"| JWTGuard
    JWTGuard --> Modules
    MemberGuard -->|멤버 검증| PrismaService
    OwnerGuard -->|OWNER 검증| PrismaService

    AuthMod -->|refresh token 저장/검증| RedisService
    AuthMod -->|idToken 검증| Google
    PhotosMod -->|Presigned PUT URL 생성| S3Service
    PhotosMod -->|업로드 완료 후| ClustersMod

    PrismaService --> PG
    RedisService --> Redis
    S3Service --> S3

    APP -. "사진 직접 업로드 (Presigned PUT)" .-> S3
```

**사진 업로드 플로우**

```mermaid
sequenceDiagram
    participant App as Mobile App
    participant API as NestJS API
    participant S3 as S3 / MinIO
    participant DB as PostgreSQL

    App->>API: POST /photos/presigned-urls {roomId, files[]}
    API-->>App: [{photoId, original.url, thumbnail.url}]

    App->>S3: PUT presigned-url (원본)
    App->>S3: PUT presigned-url (썸네일)

    App->>API: POST /photos/complete {roomId, photos[]}
    API->>DB: photo.createMany()
    API->>API: 시간+GPS 클러스터링 재계산
    API->>DB: clusters upsert
    API-->>App: [Photo + presigned GET URLs (24h)]
```

### 5. 주요 엔드포인트

- `GET /health` — DB + Redis 상태
- `POST /auth/signup` / `POST /auth/login` / `POST /auth/refresh` / `POST /auth/logout`
- `GET /auth/google` / `GET /auth/google/callback`
- Swagger UI: http://localhost:3000/docs
