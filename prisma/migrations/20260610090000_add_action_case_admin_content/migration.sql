ALTER TABLE `content_items`
    ADD COLUMN `slug` VARCHAR(191) NULL,
    ADD COLUMN `published_version_id` VARCHAR(191) NULL,
    ADD COLUMN `published_slug` VARCHAR(191) NULL,
    ADD COLUMN `metadata_json` JSON NULL;

CREATE UNIQUE INDEX `content_items_content_type_slug_key` ON `content_items`(`content_type`, `slug`);
CREATE UNIQUE INDEX `content_items_content_type_published_slug_key` ON `content_items`(`content_type`, `published_slug`);

CREATE INDEX `content_items_published_version_id_idx` ON `content_items`(`published_version_id`);

ALTER TABLE `content_items`
    ADD CONSTRAINT `content_items_published_version_id_fkey`
    FOREIGN KEY (`published_version_id`) REFERENCES `content_versions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
