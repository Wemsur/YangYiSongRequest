CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'REVIEWER',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BroadcastSlot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "maxCount" INTEGER,
    "maxMs" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "BroadcastSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SongRequest" (
    "id" TEXT NOT NULL,
    "queryCode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "durationMs" INTEGER NOT NULL,
    "coverUrl" TEXT,
    "grade" TEXT,
    "classNo" INTEGER,
    "requesterName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "flaggedWords" TEXT NOT NULL DEFAULT '[]',
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "submitIp" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    CONSTRAINT "SongRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "playDate" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarDay" (
    "date" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    CONSTRAINT "CalendarDay_pkey" PRIMARY KEY ("date")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GradeConfig" (
    "grade" TEXT NOT NULL,
    "classCount" INTEGER NOT NULL,
    CONSTRAINT "GradeConfig_pkey" PRIMARY KEY ("grade")
);

CREATE TABLE "BannedWord" (
    "word" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BannedWord_pkey" PRIMARY KEY ("word")
);

CREATE TABLE "SourceCredential" (
    "source" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "note" TEXT,
    CONSTRAINT "SourceCredential_pkey" PRIMARY KEY ("source")
);

CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");
CREATE UNIQUE INDEX "BroadcastSlot_name_key" ON "BroadcastSlot"("name");
CREATE UNIQUE INDEX "SongRequest_queryCode_key" ON "SongRequest"("queryCode");
CREATE INDEX "SongRequest_status_createdAt_idx" ON "SongRequest"("status", "createdAt");
CREATE INDEX "SongRequest_grade_classNo_requesterName_createdAt_idx" ON "SongRequest"("grade", "classNo", "requesterName", "createdAt");
CREATE INDEX "SongRequest_submitIp_createdAt_idx" ON "SongRequest"("submitIp", "createdAt");
CREATE UNIQUE INDEX "Schedule_requestId_key" ON "Schedule"("requestId");
CREATE INDEX "Schedule_playDate_idx" ON "Schedule"("playDate");
CREATE UNIQUE INDEX "Schedule_playDate_slotId_orderNo_key" ON "Schedule"("playDate", "slotId", "orderNo");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

ALTER TABLE "SongRequest" ADD CONSTRAINT "SongRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SongRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "BroadcastSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
