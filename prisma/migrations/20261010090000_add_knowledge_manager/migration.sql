-- CreateTable
CREATE TABLE `hub_folders` (
    `id` VARCHAR(120) NOT NULL,
    `name` VARCHAR(240) NOT NULL,
    `parentId` VARCHAR(120) NULL,
    `deleted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hub_folders_parentId_deleted_idx`(`parentId`, `deleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `hub_resource_locations` (
    `resourceId` VARCHAR(120) NOT NULL,
    `folderId` VARCHAR(120) NULL,
    `name` VARCHAR(240) NOT NULL,
    `archivedBeforeTrash` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hub_resource_locations_folderId_name_idx`(`folderId`, `name`),
    PRIMARY KEY (`resourceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `hub_folders` ADD CONSTRAINT `hub_folders_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `hub_folders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hub_resource_locations` ADD CONSTRAINT `hub_resource_locations_resourceId_fkey` FOREIGN KEY (`resourceId`) REFERENCES `hub_resources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hub_resource_locations` ADD CONSTRAINT `hub_resource_locations_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `hub_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
