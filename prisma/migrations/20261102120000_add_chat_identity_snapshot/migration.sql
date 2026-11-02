-- New conversations retain only explicitly trusted identity display fields.
-- Existing rows remain NULL so their current profile is never presented as
-- identity information captured at the time of the conversation.
ALTER TABLE `chat_sessions` ADD COLUMN `identity_snapshot_json` JSON NULL;
