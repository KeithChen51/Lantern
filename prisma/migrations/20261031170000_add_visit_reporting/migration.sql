CREATE TABLE `analytics_page_views` (
  `event_id` VARCHAR(36) NOT NULL,
  `actor_kind` VARCHAR(12) NOT NULL,
  `subject_id` VARCHAR(191) NOT NULL,
  `organization` VARCHAR(1000) NULL,
  `module` VARCHAR(32) NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`event_id`),
  INDEX `analytics_pv_time_actor_idx` (`occurred_at`, `actor_kind`, `subject_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE `analytics_visit_days` (
  `day` DATE NOT NULL,
  `module` VARCHAR(32) NOT NULL,
  `views` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`day`, `module`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE `analytics_person_audits` (
  `id` VARCHAR(36) NOT NULL,
  `operator_id` VARCHAR(191) NOT NULL,
  `approval_ref` VARCHAR(128) NOT NULL,
  `purpose` VARCHAR(256) NOT NULL,
  `start_day` DATE NOT NULL,
  `end_day` DATE NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `result_rows` SMALLINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `analytics_person_audit_time_idx` (`created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
