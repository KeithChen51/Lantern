-- CreateTable
CREATE TABLE `hub_resources` (
    `id` VARCHAR(120) NOT NULL,
    `type` VARCHAR(30) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `summary` TEXT NOT NULL,
    `tags` JSON NOT NULL,
    `source` TEXT NOT NULL,
    `businessScope` TEXT NOT NULL,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `publishedVersionId` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hub_resources_type_archived_idx`(`type`, `archived`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `hub_versions` (
    `id` VARCHAR(120) NOT NULL,
    `resourceId` VARCHAR(120) NOT NULL,
    `number` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `markdown` LONGTEXT NOT NULL,
    `checksum` VARCHAR(64) NOT NULL,
    `changeNote` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `validity` VARCHAR(30) NOT NULL,
    `effectiveFrom` DATETIME(3) NULL,
    `effectiveTo` DATETIME(3) NULL,
    `files` JSON NOT NULL,
    `citations` JSON NOT NULL,

    UNIQUE INDEX `hub_versions_resourceId_number_key`(`resourceId`, `number`),
    UNIQUE INDEX `hub_versions_resourceId_checksum_key`(`resourceId`, `checksum`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `hub_relations` (
    `id` VARCHAR(64) NOT NULL,
    `fromVersionId` VARCHAR(120) NOT NULL,
    `toVersionId` VARCHAR(120) NOT NULL,
    `kind` VARCHAR(30) NOT NULL,

    INDEX `hub_relations_fromVersionId_idx`(`fromVersionId`),
    INDEX `hub_relations_toVersionId_idx`(`toVersionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `hub_interactions` (
    `id` VARCHAR(120) NOT NULL,
    `source` VARCHAR(120) NOT NULL,
    `externalId` VARCHAR(120) NOT NULL,
    `checksum` VARCHAR(64) NOT NULL,
    `scope` VARCHAR(30) NOT NULL,
    `consentAt` DATETIME(3) NOT NULL,
    `purpose` TEXT NOT NULL,
    `messages` JSON NOT NULL,
    `resourceVersions` JSON NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hub_interactions_source_externalId_key`(`source`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `hub_provenance` (
    `versionId` VARCHAR(120) NOT NULL,
    `interactionId` VARCHAR(120) NOT NULL,
    `messageIds` JSON NOT NULL,

    PRIMARY KEY (`versionId`, `interactionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `hub_audits` (
    `id` VARCHAR(120) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `targetId` VARCHAR(120) NOT NULL,
    `detail` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `hub_audits_targetId_createdAt_idx`(`targetId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `hub_versions` ADD CONSTRAINT `hub_versions_resourceId_fkey` FOREIGN KEY (`resourceId`) REFERENCES `hub_resources`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hub_relations` ADD CONSTRAINT `hub_relations_fromVersionId_fkey` FOREIGN KEY (`fromVersionId`) REFERENCES `hub_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hub_relations` ADD CONSTRAINT `hub_relations_toVersionId_fkey` FOREIGN KEY (`toVersionId`) REFERENCES `hub_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hub_provenance` ADD CONSTRAINT `hub_provenance_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `hub_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hub_provenance` ADD CONSTRAINT `hub_provenance_interactionId_fkey` FOREIGN KEY (`interactionId`) REFERENCES `hub_interactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
