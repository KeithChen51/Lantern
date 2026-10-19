-- Guest sessions have a separate owner; preserve employee foreign keys and legacy rows.
ALTER TABLE `chat_sessions` ADD COLUMN `guest_id` VARCHAR(191) NULL;
CREATE INDEX `chat_sessions_guest_id_created_at_idx` ON `chat_sessions`(`guest_id`, `created_at`);
