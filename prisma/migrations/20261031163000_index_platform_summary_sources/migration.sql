-- Read-only aggregates must be able to scan by event time instead of reading
-- the entire message or credential history. No event or content is copied.
CREATE INDEX `access_records_summary_window_idx` ON `access_records`(`kind`, `createdAt`);
CREATE INDEX `chat_messages_summary_window_idx` ON `chat_messages`(`role`, `created_at`, `session_id`);
CREATE INDEX `hub_audits_summary_time_idx` ON `hub_audits`(`createdAt`);
