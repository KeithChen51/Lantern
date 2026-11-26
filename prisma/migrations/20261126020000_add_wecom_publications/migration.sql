-- CreateTable
CREATE TABLE `wecom_publication_drafts` (
    `id` VARCHAR(64) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `digest` TEXT NOT NULL,
    `author` VARCHAR(100) NULL,
    `sourceUrl` TEXT NULL,
    `checksum` VARCHAR(64) NOT NULL,
    `actor` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wecom_publication_tasks` (
    `id` VARCHAR(64) NOT NULL,
    `draftId` VARCHAR(64) NOT NULL,
    `scheduledAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `actor` JSON NOT NULL,

    INDEX `wecom_publication_tasks_scheduledAt_idx`(`scheduledAt`),
    INDEX `wecom_publication_tasks_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wecom_publication_deliveries` (
    `id` VARCHAR(64) NOT NULL,
    `taskId` VARCHAR(64) NOT NULL,
    `channel` VARCHAR(20) NOT NULL,
    `audience` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `attemptedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `messageId` VARCHAR(2048) NULL,
    `errorCode` VARCHAR(120) NULL,
    `errorMessage` TEXT NULL,
    `issues` JSON NULL,
    `leaseToken` VARCHAR(64) NULL,
    `leaseUntil` DATETIME(3) NULL,

    INDEX `wecom_publication_deliveries_status_leaseUntil_idx`(`status`, `leaseUntil`),
    UNIQUE INDEX `wecom_publication_deliveries_taskId_channel_key`(`taskId`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wecom_publication_attempts` (
    `id` VARCHAR(64) NOT NULL,
    `deliveryId` VARCHAR(64) NOT NULL,
    `number` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `finishedAt` DATETIME(3) NULL,
    `outcome` JSON NULL,

    UNIQUE INDEX `wecom_publication_attempts_deliveryId_number_key`(`deliveryId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wecom_publication_requests` (
    `id` VARCHAR(64) NOT NULL,
    `checksum` VARCHAR(64) NOT NULL,
    `taskId` VARCHAR(64) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wecom_publication_audits` (
    `id` VARCHAR(64) NOT NULL,
    `taskId` VARCHAR(64) NULL,
    `action` VARCHAR(40) NOT NULL,
    `actor` JSON NOT NULL,
    `detail` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `wecom_publication_audits_taskId_createdAt_idx`(`taskId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wecom_publication_tasks` ADD CONSTRAINT `wecom_publication_tasks_draftId_fkey` FOREIGN KEY (`draftId`) REFERENCES `wecom_publication_drafts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wecom_publication_deliveries` ADD CONSTRAINT `wecom_publication_deliveries_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `wecom_publication_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wecom_publication_attempts` ADD CONSTRAINT `wecom_publication_attempts_deliveryId_fkey` FOREIGN KEY (`deliveryId`) REFERENCES `wecom_publication_deliveries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
