-- Additive only: existing users, identities and knowledge storage are preserved.
CREATE TABLE `access_records` (
    `id` VARCHAR(120) NOT NULL,
    `kind` VARCHAR(30) NOT NULL,
    `subjectId` VARCHAR(200) NOT NULL,
    `parentId` VARCHAR(120) NULL,
    `payload` JSON NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `access_records_kind_subjectId_idx`(`kind`, `subjectId`),
    INDEX `access_records_parentId_idx`(`parentId`),
    INDEX `access_records_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- Published version snapshots retain metadata independently of mutable drafts.
ALTER TABLE `hub_versions` ADD COLUMN `metadata` JSON NULL;
