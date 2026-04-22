-- CreateEnum
CREATE TYPE "RoomRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "BlogVisibility" AS ENUM ('PRIVATE', 'ROOM', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ClusterType" AS ENUM ('TIME_GPS', 'VLM_SCENE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('VLM_ANALYZE', 'LLM_BLOG_DRAFT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "nickname" TEXT NOT NULL,
    "profile_image_url" TEXT,
    "google_sub" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_rooms" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "invite_token" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_members" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "RoomRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "s3_key" TEXT NOT NULL,
    "thumbnail_key" TEXT,
    "file_size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "taken_at" TIMESTAMP(3),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "scene_label" TEXT,
    "ai_caption" TEXT,
    "ai_keywords" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clusters" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "scene_label" TEXT,
    "day_number" INTEGER,
    "cluster_type" "ClusterType" NOT NULL DEFAULT 'TIME_GPS',
    "thumbnail_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cluster_photos" (
    "id" UUID NOT NULL,
    "cluster_id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,

    CONSTRAINT "cluster_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blogs" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" "BlogVisibility" NOT NULL DEFAULT 'ROOM',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_photos" (
    "id" UUID NOT NULL,
    "blog_id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "order_idx" INTEGER NOT NULL,

    CONSTRAINT "blog_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "job_type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "done_count" INTEGER NOT NULL DEFAULT 0,
    "error_msg" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "travel_rooms_invite_token_key" ON "travel_rooms"("invite_token");

-- CreateIndex
CREATE UNIQUE INDEX "room_members_room_id_user_id_key" ON "room_members"("room_id", "user_id");

-- CreateIndex
CREATE INDEX "photos_room_id_taken_at_idx" ON "photos"("room_id", "taken_at");

-- CreateIndex
CREATE UNIQUE INDEX "cluster_photos_cluster_id_photo_id_key" ON "cluster_photos"("cluster_id", "photo_id");

-- CreateIndex
CREATE UNIQUE INDEX "blog_photos_blog_id_photo_id_key" ON "blog_photos"("blog_id", "photo_id");

-- CreateIndex
CREATE INDEX "processing_jobs_room_id_status_idx" ON "processing_jobs"("room_id", "status");

-- AddForeignKey
ALTER TABLE "travel_rooms" ADD CONSTRAINT "travel_rooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "travel_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "travel_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "travel_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cluster_photos" ADD CONSTRAINT "cluster_photos_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cluster_photos" ADD CONSTRAINT "cluster_photos_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blogs" ADD CONSTRAINT "blogs_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "travel_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blogs" ADD CONSTRAINT "blogs_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_photos" ADD CONSTRAINT "blog_photos_blog_id_fkey" FOREIGN KEY ("blog_id") REFERENCES "blogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_photos" ADD CONSTRAINT "blog_photos_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "travel_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
