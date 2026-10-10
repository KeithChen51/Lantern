-- Track the deletion batch that placed a folder or resource in the recycle bin.
ALTER TABLE `hub_folders` ADD COLUMN `trashBatchId` VARCHAR(120) NULL;
ALTER TABLE `hub_resource_locations` ADD COLUMN `trashBatchId` VARCHAR(120) NULL;
