# AI 여행 사진 클러스터링 서비스 — 백엔드 설계 명세

- **작성일**: 2026-04-20
- **대상**: Main Backend (NestJS)
- **범위 외**: 프론트엔드, GPU 서버 (AI/ML 팀 담당)

---

## 1. 프로젝트 개요

여행 중 촬영한 수많은 사진을 AI로 자동 정리(클러스터링)하고 블로그 초안을 생성해주는 서비스의 **Main Backend**.

- 유저 관리, DB CRUD, 실시간 소켓 통신, S3 관리 담당
- VLM/LLM 추론은 별도 GPU 서버에서 수행 (AI팀 담당, 본 문서 범위 외)
- 배포 담당: 본인 (CI/CD 구성 포함)

---

## 2. 데모 스코프 정의

### 포함 기능
- 이메일/비밀번호 + Google OAuth 회원가입/로그인
- Travel Room 생성/초대 (토큰 기반, 만료 없음)
- 사진 업로드 (S3 Presigned POST), 메타데이터 저장
- EXIF 기반 기본 클러스터링 (시간/GPS)
- GPU 서버 비동기 호출 → VLM 결과 수신 (BullMQ + Webhook)
- 블로그 작성/편집/발행 (PRIVATE, ROOM 공개 범위)
- Socket.IO 실시간 이벤트 (업로드, AI 진행률, 클러스터/블로그 변경)
- **HTTPS** (Caddy + Let's Encrypt 자동 갱신) — Google OAuth 요건 충족

### 제외 기능 (데모 범위 밖)
- 전체 공개 (PUBLIC) 블로그 + 지도 뷰 — 스키마엔 예약, API 미구현
- 장소 정보 제공 (Reverse Geocoding / 외부 장소 API)
- AI 추천 조합 (사진 자동 선정)
- 인물 기반 그룹화 (얼굴 인식)
- 동시 편집 (Google Docs 수준 CRDT/OT)
- 커스텀 도메인 구매 (Cloudflare / Route 53 후속 결정)

---

## 3. 기술 스택

| 계층 | 선택 | 비고 |
|---|---|---|
| 런타임 | Node.js 22 LTS | Node 20은 2026-04-30 EOL |
| 프레임워크 | NestJS 11 | 최신 major (11.1.19) |
| ORM | Prisma 7 | `schema.prisma` 단일 소스, Prisma Next는 사용 X |
| DB | PostgreSQL 16 (AWS RDS db.t3.micro) | 프리티어 |
| 캐시/큐 | Redis 8 (EC2 내부 Docker) | EC2에 같이 띄움 |
| 작업 큐 | BullMQ 5 | 재시도/진행률/백오프 |
| 실시간 | Socket.IO 4.8 | Room 네임스페이스 |
| 스토리지 | AWS S3 | Presigned URL |
| 인증 | Passport (local + google-oauth20 + jwt) | |
| 비밀번호 해싱 | bcrypt 6.x | |
| API 문서 | @nestjs/swagger | 자동 생성 |
| 밸리데이션 | class-validator + class-transformer | |
| 로깅 | nestjs-pino → stdout | |
| 테스트 | Jest | 최소 단위 테스트 |
| CI/CD | GitHub Actions → ECR → EC2 | |
| 컨테이너 | Docker + docker-compose | |

---

## 4. 전체 아키텍처

```
┌─────────────────────┐                  ┌─────────────────────┐
│   Client (Web)      │                  │   AWS S3            │
│   - EXIF 추출       │─── Presigned ───▶│   - 원본 사진       │
│   - 썸네일 생성     │      URL         │   - 썸네일          │
└─────────┬───────────┘                  └─────────────────────┘
          │                                        ▲
          │ REST API + Socket.IO                   │
          ▼                                        │
┌─────────────────────────────────────────┐        │
│  NestJS Backend (EC2 t2.micro)          │        │
│  ┌─────────────────────────────────┐    │        │
│  │ HTTP Module                     │    │        │
│  │  - Auth / User / Room / Photo   │    │        │
│  │  - Cluster / Blog               │    │        │
│  │  - Presigned URL 발급           │◀───┼────────┘
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ Socket.IO Gateway               │    │
│  │  - Room namespace / JWT auth    │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ BullMQ Worker                   │    │
│  │  - GPU 작업 큐                   │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ Webhook Receiver                │    │
│  │  - GPU 콜백 수신                │    │
│  └─────────────────────────────────┘    │
└────┬────────────────┬─────────────┬─────┘
     │                │             │
     ▼                ▼             ▼
┌─────────┐    ┌──────────┐   ┌──────────────┐
│ Postgres│    │  Redis   │   │ GPU Server   │
│  (RDS)  │    │(EC2내부) │   │ (외부)       │
└─────────┘    └──────────┘   └──────────────┘
```

### 핵심 원칙
- **Backend 1 인스턴스**로 충분 (데모 규모)
- **무거운 일은 전부 위임**: 업로드→S3 직접, AI→GPU 서버, EXIF/썸네일→클라이언트
- **비동기는 전부 BullMQ**: GPU 호출, 콜백 처리
- **Socket.IO는 브로드캐스트 전용**: 비즈니스 로직은 REST API에만

---

## 5. 프로젝트 구조

```
프로젝트 루트/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/                   # @nestjs/config 로더
│   ├── common/                   # guards, decorators, filters, pipes
│   ├── prisma/                   # PrismaModule, PrismaService
│   │
│   ├── modules/
│   │   ├── auth/                 # 회원가입/로그인/OAuth/JWT
│   │   ├── users/
│   │   ├── rooms/                # Travel Room + 초대
│   │   ├── photos/               # 업로드 Presigned URL + 메타
│   │   ├── clusters/             # 시간/GPS 클러스터링
│   │   ├── blogs/                # 블로그 CRUD + 발행
│   │   ├── gpu-jobs/             # BullMQ + Webhook
│   │   └── realtime/             # Socket.IO Gateway
│   │
│   └── health/
│
├── test/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── tsconfig.json
└── package.json
```

### 모듈 의존성
```
auth ──▶ users
rooms ──▶ users
photos ──▶ rooms, users
clusters ──▶ photos, rooms
blogs ──▶ rooms, photos, users
gpu-jobs ──▶ photos, clusters, realtime
realtime ──▶ auth, rooms
```

- 순환 의존 금지 (필요 시 EventEmitter)
- `realtime`은 emit 전용 (비즈니스 로직 X)

---

## 6. 데이터 모델 (Prisma Schema)

```prisma
enum RoomRole {
  OWNER
  MEMBER
}

enum BlogVisibility {
  PRIVATE
  ROOM
  PUBLIC    // 미구현, 예약
}

enum ClusterType {
  TIME_GPS      // EXIF 기반
  VLM_SCENE     // AI 장면 분석
}

enum JobStatus {
  PENDING
  RUNNING
  SUCCESS
  FAILED
}

enum JobType {
  VLM_ANALYZE
  LLM_BLOG_DRAFT
}

model User {
  id               String        @id @default(uuid()) @db.Uuid
  email            String        @unique
  password         String?       // 소셜 가입은 null
  nickname         String
  profileImageUrl  String?       @map("profile_image_url")
  googleSub        String?       @unique @map("google_sub")
  createdAt        DateTime      @default(now()) @map("created_at")

  ownedRooms       TravelRoom[]  @relation("owner")
  memberships      RoomMember[]
  uploadedPhotos   Photo[]
  authoredBlogs    Blog[]

  @@map("users")
}

model TravelRoom {
  id           String          @id @default(uuid()) @db.Uuid
  title        String
  inviteToken  String          @unique @map("invite_token")
  createdBy    String          @map("created_by") @db.Uuid
  createdAt    DateTime        @default(now()) @map("created_at")

  owner        User            @relation("owner", fields: [createdBy], references: [id])
  members      RoomMember[]
  photos       Photo[]
  clusters     Cluster[]
  blogs        Blog[]
  jobs         ProcessingJob[]

  @@map("travel_rooms")
}

model RoomMember {
  id        String      @id @default(uuid()) @db.Uuid
  roomId    String      @map("room_id") @db.Uuid
  userId    String      @map("user_id") @db.Uuid
  role      RoomRole    @default(MEMBER)
  joinedAt  DateTime    @default(now()) @map("joined_at")

  room      TravelRoom  @relation(fields: [roomId], references: [id], onDelete: Cascade)
  user      User        @relation(fields: [userId], references: [id])

  @@unique([roomId, userId])
  @@map("room_members")
}

model Photo {
  id             String          @id @default(uuid()) @db.Uuid
  roomId         String          @map("room_id") @db.Uuid
  uploadedBy     String          @map("uploaded_by") @db.Uuid
  s3Key          String          @map("s3_key")
  thumbnailKey   String?         @map("thumbnail_key")
  fileSize       Int             @map("file_size")
  width          Int?
  height         Int?
  takenAt        DateTime?       @map("taken_at")
  lat            Float?
  lng            Float?
  sceneLabel     String?         @map("scene_label")
  aiCaption      String?         @map("ai_caption")
  aiKeywords     String[]        @map("ai_keywords")
  createdAt      DateTime        @default(now()) @map("created_at")

  room           TravelRoom      @relation(fields: [roomId], references: [id], onDelete: Cascade)
  uploader       User            @relation(fields: [uploadedBy], references: [id])
  clusterPhotos  ClusterPhoto[]
  blogPhotos     BlogPhoto[]

  @@index([roomId, takenAt])
  @@map("photos")
}

model Cluster {
  id            String         @id @default(uuid()) @db.Uuid
  roomId        String         @map("room_id") @db.Uuid
  title         String
  summary       String?        // VLM_SCENE 타입 클러스터의 AI 요약 (예: "바다를 따라 걷던 오후")
  sceneLabel    String?        @map("scene_label")  // VLM_SCENE 대표 장면 라벨 (food / landscape / indoor 등)
  dayNumber     Int?           @map("day_number")
  clusterType   ClusterType    @default(TIME_GPS) @map("cluster_type")
  thumbnailKey  String?        @map("thumbnail_key")
  createdAt     DateTime       @default(now()) @map("created_at")

  room          TravelRoom     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  clusterPhotos ClusterPhoto[]

  @@map("clusters")
}

model ClusterPhoto {
  id         String   @id @default(uuid()) @db.Uuid
  clusterId  String   @map("cluster_id") @db.Uuid
  photoId    String   @map("photo_id") @db.Uuid

  cluster    Cluster  @relation(fields: [clusterId], references: [id], onDelete: Cascade)
  photo      Photo    @relation(fields: [photoId], references: [id], onDelete: Cascade)

  @@unique([clusterId, photoId])
  @@map("cluster_photos")
}

model Blog {
  id           String         @id @default(uuid()) @db.Uuid
  roomId       String         @map("room_id") @db.Uuid
  authorId     String         @map("author_id") @db.Uuid
  title        String
  content      String         @db.Text
  visibility   BlogVisibility @default(ROOM)
  publishedAt  DateTime?      @map("published_at")
  createdAt    DateTime       @default(now()) @map("created_at")
  updatedAt    DateTime       @updatedAt @map("updated_at")

  room         TravelRoom     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  author       User           @relation(fields: [authorId], references: [id])
  blogPhotos   BlogPhoto[]

  @@map("blogs")
}

model BlogPhoto {
  id        String  @id @default(uuid()) @db.Uuid
  blogId    String  @map("blog_id") @db.Uuid
  photoId   String  @map("photo_id") @db.Uuid
  orderIdx  Int     @map("order_idx")

  blog      Blog    @relation(fields: [blogId], references: [id], onDelete: Cascade)
  photo     Photo   @relation(fields: [photoId], references: [id])

  @@unique([blogId, photoId])
  @@map("blog_photos")
}

model ProcessingJob {
  id          String      @id @default(uuid()) @db.Uuid
  roomId      String      @map("room_id") @db.Uuid
  jobType     JobType     @map("job_type")
  status      JobStatus   @default(PENDING)
  totalCount  Int         @default(0) @map("total_count")
  doneCount   Int         @default(0) @map("done_count")
  errorMsg    String?     @map("error_msg")
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")

  room        TravelRoom  @relation(fields: [roomId], references: [id], onDelete: Cascade)

  @@index([roomId, status])
  @@map("processing_jobs")
}
```

### 설계 결정 요약

| 결정 | 이유 |
|---|---|
| `s3_key`만 저장 (full URL X) | 버킷/리전 변경 시 마이그레이션 불필요 |
| AI 결과(`aiCaption`, `aiKeywords`, `sceneLabel`)를 Photo에 직접 저장 | 1:1 관계, 별도 테이블 불필요 |
| `ProcessingJob` 별도 테이블 | 진행률, 실시간 이벤트, 실패 재시도 UI 위해 필요 |
| `@@index([roomId, takenAt])` | 타임라인 쿼리 성능 |
| `onDelete: Cascade` | Travel Room 삭제 시 하위 데이터 정리 |
| `visibility` enum에 PUBLIC 남김 | 미래 확장 시 마이그레이션 불필요 |

---

## 7. 주요 플로우

### 7.1 Travel Room 생성 + 초대

1. 방장: `POST /rooms { title }` → `inviteToken = randomUUID` 생성, `RoomMember(OWNER)` 추가, 반환
2. 친구: `GET /rooms/join/:token` (JWT 필수) → `RoomMember(MEMBER)` 추가
3. Socket.IO emit: `room:member_joined` to `travel_room:{roomId}`

### 7.2 사진 업로드 (Presigned URL)

1. Client: EXIF/썸네일 추출 (클라이언트 사이드, `exifr` / `browser-image-compression`)
   - **지원 포맷**: JPEG, PNG, WebP (데모 기본 지원)
   - **HEIC (iPhone)**: 브라우저 디코딩 불가(Safari 제외). `heic2any`로 JPEG 변환 후 업로드. EXIF는 `exifr`이 HEIC에서도 추출 가능.
2. Client → Backend: `POST /photos/presigned-urls { roomId, files: [{name, size, contentType}, ...] }`
3. Backend: S3 Presigned POST 정책 발급 (원본 + 썸네일) → `[{photoId, postUrl, fields, key}, ...]` 반환
   - **Content-Length 강제**: 정책에 `["content-length-range", 0, MAX_PHOTO_BYTES]` 포함 (원본 20MB, 썸네일 500KB 등 별도 상한). 정책 초과 시 S3가 업로드 자체를 거부.
   - **Content-Type 화이트리스트**: `image/jpeg`, `image/png`, `image/webp`로 제한 (`starts-with` 조건).
   - 프리사인 TTL: 5분 (`S3_PRESIGNED_EXPIRES`)
4. Client: S3에 병렬 POST 업로드
5. Client → Backend: `POST /photos/complete { roomId, photos: [{photoId, s3Key, thumbKey, fileSize, width, height, takenAt, lat, lng}, ...] }`
6. Backend:
   - `Photo.createMany`
   - **기본 클러스터링 실행** (EXIF 시간/GPS로 "1일차 점심" 등 Cluster 생성) — 동기 처리
   - **VLM job을 BullMQ에 enqueue** (비동기)
   - Socket.IO emit: `photo:uploaded`, `cluster:created`
7. 응답 즉시 반환 (AI 처리는 기다리지 않음)

> **주의**: `PUT` Presigned URL은 서명 시 바디 제약을 강제하기 어렵기 때문에 Presigned **POST** 정책을 사용한다(Content-Length/Type 제약이 정책 레벨에서 강제됨).

### 7.3 AI 처리 (BullMQ + GPU Webhook)

1. BullMQ Worker: job 꺼냄 → `ProcessingJob.status = RUNNING`
2. Worker → GPU Server: `POST /vlm/analyze { jobId, photoUrls[], callbackUrl }`
3. GPU Server: 처리 후 → `POST /internal/jobs/{jobId}/callback { results: [...] }`
4. Backend:
   - `Photo.update` (aiCaption, sceneLabel, keywords 등)
   - 필요 시 `Cluster.create` (VLM_SCENE 타입)
   - `ProcessingJob.doneCount++`
   - Socket.IO emit: `photo:processing_progress`, `cluster:created`
5. 실패 시: BullMQ 자동 3회 재시도 (exponential backoff) → 최종 실패 시 `status=FAILED` + 에러 이벤트

### 7.4 블로그 작성/편집/발행

1. `POST /blogs { roomId, title, content, photoIds, visibility }` → Blog + BlogPhoto 생성 (draft 상태)
2. `PATCH /blogs/:id` (자동 저장, 디바운싱) → Blog update → Socket.IO `blog:updated` (ROOM 공개 시)
3. `POST /blogs/:id/publish` → `publishedAt = now()` → Socket.IO `blog:published`

---

## 8. 인증/인가

### 8.1 인증 방식

- **이메일/비밀번호**
  - `POST /auth/signup { email, password, nickname }` → bcrypt(cost=10)
  - `POST /auth/login { email, password }` → JWT 발급
- **Google OAuth**
  - `GET /auth/google` → Google 리다이렉트
  - `GET /auth/google/callback` → `User.upsert(googleSub)` → JWT 발급
  - Google OAuth는 HTTPS 요건 → 11.x Caddy 리버스 프록시로 해결

### 8.2 JWT 전략

| 항목 | 값 |
|---|---|
| 알고리즘 | HS256 |
| Access Token 만료 | 1시간 |
| Refresh Token 만료 | 14일 (HttpOnly Cookie) |
| 저장 | Access=메모리, Refresh=Cookie |
| 로그아웃 | Refresh를 Redis blacklist (TTL=14d) |

### 8.3 Guard 스택

| Guard | 역할 |
|---|---|
| `JwtAuthGuard` | 전역 적용, `@Public()`으로 예외 |
| `RoomMemberGuard` | URL의 `roomId`로 `RoomMember` 확인 → 비멤버 403 |
| `RoomOwnerGuard` | OWNER만 허용 (방 삭제/토큰 재발급) |
| `BlogAccessGuard` | PRIVATE=작성자, ROOM=방 멤버 |
| `WsJwtGuard` | Socket.IO 핸드셰이크 JWT 검증 |
| `InternalAuthGuard` | GPU Webhook용 `X-Internal-Token` 검증 |

### 8.4 인가 매트릭스

| 작업 | 비로그인 | 로그인 | 방 멤버 | OWNER | 블로그 작성자 |
|---|:-:|:-:|:-:|:-:|:-:|
| 회원가입/로그인 | ✅ | - | - | - | - |
| 방 생성 | ❌ | ✅ | - | - | - |
| 방 상세/사진/클러스터 조회 | ❌ | ❌ | ✅ | - | - |
| 사진 업로드/삭제 | ❌ | ❌ | ✅ | - | - |
| 블로그 편집 | ❌ | ❌ | ❌ | - | ✅ |
| 블로그 조회 (PRIVATE) | ❌ | ❌ | ❌ | - | ✅ |
| 블로그 조회 (ROOM) | ❌ | ❌ | ✅ | - | - |
| 방 삭제/토큰 재발급 | ❌ | ❌ | ❌ | ✅ | - |

---

## 9. Socket.IO 이벤트

**네임스페이스**: `travel_room:{roomId}` (서버가 emit, 클라이언트는 구독만)

| 이벤트 | 설명 |
|---|---|
| `room:member_joined` | 새 멤버 합류 |
| `photo:uploaded` | 새 사진 업로드 완료 |
| `photo:processing_progress` | AI 처리 진행률 ("23/100") |
| `cluster:created` | 클러스터 생성 (기본 또는 VLM) |
| `cluster:updated` | 클러스터 이름/사진 변경 |
| `blog:updated` | 블로그 내용 수정 (ROOM 공개 시) |
| `blog:published` | 발행 완료 |

**원칙**: 클라이언트 → 서버 emit 없음. 상태 변경은 전부 REST API.

---

## 10. GPU 서버 연동 (AI팀과의 계약)

| 항목 | 내용 |
|---|---|
| 엔드포인트 | `POST /vlm/analyze`, `POST /llm/generate-blog` |
| 요청 포맷 | `{ job_id, photo_urls[], callback_url }` (JSON) |
| 인증 | `X-Internal-Token` 공유 시크릿 |
| 결과 반환 | Webhook → `POST /internal/jobs/{jobId}/callback` |
| 에러 처리 | 500 응답 시 BullMQ가 3회 재시도 (exponential backoff) |
| 타임아웃 | 작업당 5분 |

---

## 11. 배포 구조

### 11.1 AWS 리소스

```
           EC2 t2.micro (Ubuntu 24.04, 퍼블릭 IP)
           ┌───────────────────────────────────┐
           │  Docker Compose                    │
           │   ├── caddy (80, 443)  ← TLS 종단   │
           │   ├── nestjs-backend (3000, 내부)   │
           │   └── redis:8-alpine (6379, 내부)   │
           └──────────┬────────────────────────┘
                      │
     ┌────────────────┼─────────────────┐
     ▼                ▼                 ▼
  ┌──────┐       ┌──────┐          ┌──────────┐
  │ RDS  │       │  S3  │          │GPU Server│
  └──────┘       └──────┘          └──────────┘
```

- 접속: `https://<domain-or-ec2-hostname>` (Caddy가 80→443 리다이렉트)
- Backend 1개 인스턴스 (스케일 아웃 고려 X)
- Redis는 EC2 내부 Docker로 동거
- Caddy는 Backend와 같은 compose 네트워크, Backend 포트는 외부 비노출

### 11.2 보안 그룹

| 리소스 | 인바운드 |
|---|---|
| EC2 | 80 (0.0.0.0/0), 443 (0.0.0.0/0), 22 (내 IP만) |
| RDS | 5432 (EC2 SG만) |
| S3 | Public read 없음, Presigned URL만 |

> Backend(3000)는 외부 미노출. Caddy가 443에서 TLS 종단 후 compose 내부 네트워크로 프록시.

### 11.2.1 HTTPS (Caddy + Let's Encrypt)

```
# Caddyfile (EC2 호스트에서 bind-mount)
api.example.com {
    encode zstd gzip
    reverse_proxy nestjs-backend:3000
}
```

- Caddy가 Let's Encrypt ACME로 인증서 자동 발급/갱신 (컨테이너 재기동 무관, 영속 볼륨 `caddy_data`)
- 도메인 없이 시작하려면 DuckDNS/nip.io 등 무료 DDNS로 서브도메인 발급 후 Caddy에 지정
- t2.micro에서 Caddy + Node + Redis 동시 가동 문제없음 (Caddy 메모리 ~30MB)
- Google OAuth 콜백 URL: `https://<domain>/auth/google/callback`

### 11.3 CI/CD (GitHub Actions)

```
main 브랜치 push
  ↓
① Lint + TypeScript check (tsc --noEmit)
② Jest 단위 테스트
③ Docker build → ECR push (tag: commit SHA + latest)
④ SSH → EC2:
    docker compose pull
    docker compose up -d --no-deps backend
    docker compose exec backend pnpm prisma migrate deploy
```

- PR → ①② 만 (배포 X)
- main merge → ①~④ 전체

### 11.4 환경변수

```bash
# Database
DATABASE_URL=postgresql://user:pass@rds-host:5432/travelblog

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<다른 랜덤>
JWT_ACCESS_EXPIRES=1h
JWT_REFRESH_EXPIRES=14d

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://<domain>/auth/google/callback

# AWS S3
AWS_REGION=ap-northeast-2
S3_BUCKET=travelblog-prod
S3_PRESIGNED_EXPIRES=300
S3_MAX_PHOTO_BYTES=20971520      # 원본 20MB
S3_MAX_THUMB_BYTES=512000        # 썸네일 500KB

# HTTPS / 도메인
PUBLIC_DOMAIN=api.example.com    # Caddy가 ACME 인증서 발급할 도메인

# GPU Server
GPU_SERVER_URL=https://gpu.example.com
GPU_INTERNAL_TOKEN=<shared secret>

# Backend
PORT=3000
FRONTEND_URL=<프론트 URL>
NODE_ENV=production
```

프로덕션 민감값은 **AWS Systems Manager Parameter Store** 또는 **Secrets Manager** 사용 권장.
S3 접근은 EC2 IAM Role 사용 권장 (키 대신).

### 11.5 로컬 개발 (`docker-compose.yml`)

- `postgres:16`, `redis:8-alpine`, `minio/minio` (S3 에뮬레이션)
- Backend 자체는 로컬에서 `pnpm start:dev`로 직접 실행 (핫 리로드)

### 11.6 로깅/모니터링

| 항목 | 도구 |
|---|---|
| 앱 로그 | `nestjs-pino` → stdout → Docker logs |
| 에러 추적 | Sentry (Free tier 5K events/월) |
| 인프라 | AWS CloudWatch 기본 메트릭 |
| 알람 | CloudWatch Alarm (CPU > 80%) |
| 헬스체크 | `GET /health` (DB + Redis ping) |

### 11.7 월 예상 비용

| 항목 | 비용 |
|---|---|
| EC2 / RDS / S3 | $0 (프리티어, 12개월) |
| Route 53 / 도메인 | $0 (제외) |
| CloudWatch | $0 |
| **합계** | **$0/월** (초과 트래픽 없을 시) |

---

## 12. 후보 기능 (현재 미구현, 추후 확장)

| 기능 | 구현 방식 |
|---|---|
| 전체 공개 (PUBLIC) 블로그 | API 밸리데이션 풀기 — 스키마 변경 불필요 |
| 공개 블로그 지도 뷰 | `GET /map/blogs` 엔드포인트 추가 |
| 장소 정보 제공 | Kakao 로컬 API Reverse Geocoding + Redis 캐싱 |
| 커스텀 도메인 | Cloudflare 무료 플랜 / Route 53 (HTTPS는 이미 Caddy로 적용됨) |

---

## 13. 변경 용이성 (확장 포인트)

- **EXIF 추출 위치 변경**: 클라이언트 → 백엔드 → GPU 서버 어느 쪽으로든 전환 가능. DB 스키마 `taken_at/lat/lng` 필드 그대로 유지. `POST /photos/:id/metadata` backfill API 준비.
- **PUBLIC 블로그 활성화**: 스키마에 이미 enum 존재, API 밸리데이션만 풀면 됨.
- **스케일 아웃**: Socket.IO Redis 어댑터 추가 → 여러 백엔드 인스턴스 지원.
