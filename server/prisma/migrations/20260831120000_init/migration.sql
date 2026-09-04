-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('NETEASE', 'QQ', 'KUGOU');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('G1', 'G2', 'G3');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PLAYED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DayKind" AS ENUM ('SCHOOL', 'OFF', 'EXAM_NO_BROADCAST');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER', 'REVIEWER');

-- CreateTable
CREATE TABLE "SongRequest" (
    "id" TEXT NOT NULL,
    "queryCode" VARCHAR(6) NOT NULL,
    "source" "Source" NOT NULL,
    "platformId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "durationMs" INTEGER NOT NULL,
    "coverUrl" TEXT,
    "grade" "Grade",
    "classNo" INTEGER,
    "requesterName" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "flaggedWords" TEXT[],
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "submitIp" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "SongRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "playDate" DATE NOT NULL,
    "slotId" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastSlot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "maxCount" INTEGER,
    "maxMs" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BroadcastSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarDay" (
    "date" DATE NOT NULL,
    "kind" "DayKind" NOT NULL,
    "note" TEXT,

    CONSTRAINT "CalendarDay_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'REVIEWER',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeConfig" (
    "grade" "Grade" NOT NULL,
    "classCount" INTEGER NOT NULL,

    CONSTRAINT "GradeConfig_pkey" PRIMARY KEY ("grade")
);

-- CreateTable
CREATE TABLE "BannedWord" (
    "word" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BannedWord_pkey" PRIMARY KEY ("word")
);

-- CreateTable
CREATE TABLE "SourceCredential" (
    "source" "Source" NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "note" TEXT,

    CONSTRAINT "SourceCredential_pkey" PRIMARY KEY ("source")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "SongRequest_queryCode_key" ON "SongRequest"("queryCode");

-- CreateIndex
CREATE INDEX "SongRequest_status_createdAt_idx" ON "SongRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SongRequest_grade_classNo_requesterName_createdAt_idx" ON "SongRequest"("grade", "classNo", "requesterName", "createdAt");

-- CreateIndex
CREATE INDEX "SongRequest_submitIp_createdAt_idx" ON "SongRequest"("submitIp", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_requestId_key" ON "Schedule"("requestId");

-- CreateIndex
CREATE INDEX "Schedule_playDate_idx" ON "Schedule"("playDate");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_playDate_slotId_orderNo_key" ON "Schedule"("playDate", "slotId", "orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastSlot_name_key" ON "BroadcastSlot"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "SongRequest" ADD CONSTRAINT "SongRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SongRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "BroadcastSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
