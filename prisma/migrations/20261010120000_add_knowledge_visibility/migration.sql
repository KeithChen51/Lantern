ALTER TABLE `hub_resources` ADD COLUMN `visibility` VARCHAR(20) NOT NULL DEFAULT 'public';
-- Existing imported cases have no recorded audience. Conservatively classify
-- them as internal; future updates preserve the explicit maintained value.
UPDATE `hub_resources` SET `visibility` = 'internal' WHERE `type` = 'case';
