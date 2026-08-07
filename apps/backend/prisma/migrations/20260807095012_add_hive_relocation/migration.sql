-- CreateEnum
CREATE TYPE "RelocationReason" AS ENUM ('FORAGE', 'OVERWINTERING', 'OTHER');

-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'RELOCATION';

-- CreateTable
CREATE TABLE "RelocationAction" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "fromApiaryId" TEXT,
    "toApiaryId" TEXT,
    "fromApiaryName" TEXT,
    "toApiaryName" TEXT,
    "reason" "RelocationReason",
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "RelocationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RelocationAction_actionId_key" ON "RelocationAction"("actionId");

-- CreateIndex
CREATE INDEX "RelocationAction_fromApiaryId_idx" ON "RelocationAction"("fromApiaryId");

-- CreateIndex
CREATE INDEX "RelocationAction_toApiaryId_idx" ON "RelocationAction"("toApiaryId");

-- CreateIndex
CREATE INDEX "RelocationAction_appliedAt_idx" ON "RelocationAction"("appliedAt");

-- AddForeignKey
ALTER TABLE "RelocationAction" ADD CONSTRAINT "RelocationAction_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;
