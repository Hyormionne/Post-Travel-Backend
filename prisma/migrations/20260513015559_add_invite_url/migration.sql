-- AlterTable
ALTER TABLE "travel_rooms" ADD COLUMN "invite_url" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "travel_rooms_invite_url_key" ON "travel_rooms"("invite_url");
