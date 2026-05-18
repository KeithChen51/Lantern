-- CreateTable
CREATE TABLE `brands` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `brands_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `regions` (
    `id` VARCHAR(191) NOT NULL,
    `brand_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `regions_brand_id_code_key`(`brand_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dealers` (
    `id` VARCHAR(191) NOT NULL,
    `brand_id` VARCHAR(191) NOT NULL,
    `region_id` VARCHAR(191) NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `dealers_region_id_idx`(`region_id`),
    UNIQUE INDEX `dealers_brand_id_code_key`(`brand_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stores` (
    `id` VARCHAR(191) NOT NULL,
    `brand_id` VARCHAR(191) NOT NULL,
    `region_id` VARCHAR(191) NULL,
    `dealer_id` VARCHAR(191) NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `stores_brand_id_region_id_dealer_id_idx`(`brand_id`, `region_id`, `dealer_id`),
    UNIQUE INDEX `stores_brand_id_code_key`(`brand_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `mobile` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `employee_no` VARCHAR(191) NULL,
    `user_type` ENUM('internal_employee', 'dealer_user') NOT NULL,
    `primary_brand_id` VARCHAR(191) NULL,
    `primary_region_id` VARCHAR(191) NULL,
    `primary_dealer_id` VARCHAR(191) NULL,
    `primary_store_id` VARCHAR(191) NULL,
    `primary_role_name` VARCHAR(191) NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `users_primary_store_id_idx`(`primary_store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `identity_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `provider_user_id` VARCHAR(191) NOT NULL,
    `provider_union_id` VARCHAR(191) NULL,
    `raw_profile_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `identity_accounts_user_id_idx`(`user_id`),
    UNIQUE INDEX `identity_accounts_provider_provider_user_id_key`(`provider`, `provider_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_org_memberships` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `brand_id` VARCHAR(191) NULL,
    `region_id` VARCHAR(191) NULL,
    `dealer_id` VARCHAR(191) NULL,
    `store_id` VARCHAR(191) NULL,
    `role_name` VARCHAR(191) NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_org_memberships_user_id_idx`(`user_id`),
    INDEX `user_org_memberships_brand_id_region_id_dealer_id_store_id_idx`(`brand_id`, `region_id`, `dealer_id`, `store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `role` ENUM('normal_user', 'highest_admin') NOT NULL,
    `scope_type` ENUM('global', 'brand', 'region', 'dealer', 'store') NOT NULL,
    `scope_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_roles_user_id_idx`(`user_id`),
    INDEX `user_roles_role_scope_type_scope_id_idx`(`role`, `scope_type`, `scope_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_items` (
    `id` VARCHAR(191) NOT NULL,
    `content_type` ENUM('heart', 'mirror_case', 'action_case', 'norm_file', 'workshop_guide', 'training') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `summary` TEXT NULL,
    `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    `visibility_scope` ENUM('global', 'brand', 'region', 'dealer', 'store') NOT NULL DEFAULT 'global',
    `brand_id` VARCHAR(191) NULL,
    `region_id` VARCHAR(191) NULL,
    `dealer_id` VARCHAR(191) NULL,
    `store_id` VARCHAR(191) NULL,
    `source_type` ENUM('manual', 'import', 'workshop_publish') NOT NULL DEFAULT 'manual',
    `current_version_id` VARCHAR(191) NULL,
    `published_at` DATETIME(3) NULL,
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `content_items_content_type_status_visibility_scope_idx`(`content_type`, `status`, `visibility_scope`),
    INDEX `content_items_brand_id_region_id_dealer_id_store_id_idx`(`brand_id`, `region_id`, `dealer_id`, `store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_versions` (
    `id` VARCHAR(191) NOT NULL,
    `content_item_id` VARCHAR(191) NOT NULL,
    `version_no` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body_markdown` LONGTEXT NOT NULL,
    `body_json` JSON NULL,
    `change_note` TEXT NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `content_versions_content_item_id_version_no_key`(`content_item_id`, `version_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workshop_submissions` (
    `id` VARCHAR(191) NOT NULL,
    `submitter_id` VARCHAR(191) NOT NULL,
    `brand_id` VARCHAR(191) NULL,
    `region_id` VARCHAR(191) NULL,
    `dealer_id` VARCHAR(191) NULL,
    `store_id` VARCHAR(191) NULL,
    `role_name` VARCHAR(191) NOT NULL,
    `service_scenario` VARCHAR(191) NULL,
    `principle_ref` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `do_text` TEXT NOT NULL,
    `how_text` TEXT NULL,
    `dont_text` TEXT NOT NULL,
    `status` ENUM('draft', 'submitted', 'ai_rejected', 'pending_admin_review', 'admin_rejected', 'published', 'withdrawn') NOT NULL DEFAULT 'draft',
    `ai_review_result_json` JSON NULL,
    `submitted_at` DATETIME(3) NULL,
    `last_reviewed_at` DATETIME(3) NULL,
    `published_guide_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workshop_submissions_status_submitted_at_idx`(`status`, `submitted_at`),
    INDEX `workshop_submissions_brand_id_region_id_dealer_id_store_id_idx`(`brand_id`, `region_id`, `dealer_id`, `store_id`),
    INDEX `workshop_submissions_submitter_id_idx`(`submitter_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workshop_review_events` (
    `id` VARCHAR(191) NOT NULL,
    `submission_id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NULL,
    `event_type` ENUM('submit', 'ai_pass', 'ai_reject', 'admin_reject', 'admin_edit', 'admin_publish', 'withdraw') NOT NULL,
    `from_status` ENUM('draft', 'submitted', 'ai_rejected', 'pending_admin_review', 'admin_rejected', 'published', 'withdrawn') NULL,
    `to_status` ENUM('draft', 'submitted', 'ai_rejected', 'pending_admin_review', 'admin_rejected', 'published', 'withdrawn') NULL,
    `comment` TEXT NULL,
    `snapshot_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workshop_review_events_submission_id_created_at_idx`(`submission_id`, `created_at`),
    INDEX `workshop_review_events_actor_id_idx`(`actor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `published_guides` (
    `id` VARCHAR(191) NOT NULL,
    `source_submission_id` VARCHAR(191) NOT NULL,
    `content_item_id` VARCHAR(191) NULL,
    `brand_id` VARCHAR(191) NULL,
    `region_id` VARCHAR(191) NULL,
    `dealer_id` VARCHAR(191) NULL,
    `store_id` VARCHAR(191) NULL,
    `role_name` VARCHAR(191) NOT NULL,
    `service_scenario` VARCHAR(191) NULL,
    `principle_ref` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `do_text` TEXT NOT NULL,
    `how_text` TEXT NULL,
    `dont_text` TEXT NOT NULL,
    `published_by` VARCHAR(191) NULL,
    `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `published_guides_source_submission_id_key`(`source_submission_id`),
    UNIQUE INDEX `published_guides_content_item_id_key`(`content_item_id`),
    INDEX `published_guides_role_name_service_scenario_idx`(`role_name`, `service_scenario`),
    INDEX `published_guides_brand_id_region_id_dealer_id_store_id_idx`(`brand_id`, `region_id`, `dealer_id`, `store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contribution_stats` (
    `id` VARCHAR(191) NOT NULL,
    `brand_id` VARCHAR(191) NULL,
    `region_id` VARCHAR(191) NULL,
    `dealer_id` VARCHAR(191) NULL,
    `store_id` VARCHAR(191) NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `published_count` INTEGER NOT NULL DEFAULT 0,
    `submitted_count` INTEGER NOT NULL DEFAULT 0,
    `latest_published_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `contribution_stats_brand_id_region_id_dealer_id_store_id_pub_idx`(`brand_id`, `region_id`, `dealer_id`, `store_id`, `published_count`),
    INDEX `contribution_stats_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_documents` (
    `id` VARCHAR(191) NOT NULL,
    `source_type` ENUM('content_item', 'file', 'published_guide', 'manual') NOT NULL,
    `source_id` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `visibility_scope` ENUM('global', 'brand', 'region', 'dealer', 'store') NOT NULL DEFAULT 'global',
    `brand_id` VARCHAR(191) NULL,
    `region_id` VARCHAR(191) NULL,
    `dealer_id` VARCHAR(191) NULL,
    `store_id` VARCHAR(191) NULL,
    `status` ENUM('active', 'archived') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_documents_source_type_source_id_idx`(`source_type`, `source_id`),
    INDEX `knowledge_documents_brand_id_region_id_dealer_id_store_id_idx`(`brand_id`, `region_id`, `dealer_id`, `store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `knowledge_chunks` (
    `id` VARCHAR(191) NOT NULL,
    `knowledge_document_id` VARCHAR(191) NOT NULL,
    `chunk_no` INTEGER NOT NULL,
    `heading` VARCHAR(191) NULL,
    `content_text` LONGTEXT NOT NULL,
    `vector_provider` ENUM('bailian', 'internal_vector', 'qdrant', 'pgvector', 'keyword') NULL,
    `external_vector_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `knowledge_chunks_external_vector_id_idx`(`external_vector_id`),
    UNIQUE INDEX `knowledge_chunks_knowledge_document_id_chunk_no_key`(`knowledge_document_id`, `chunk_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `regions` ADD CONSTRAINT `regions_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dealers` ADD CONSTRAINT `dealers_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dealers` ADD CONSTRAINT `dealers_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stores` ADD CONSTRAINT `stores_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stores` ADD CONSTRAINT `stores_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stores` ADD CONSTRAINT `stores_dealer_id_fkey` FOREIGN KEY (`dealer_id`) REFERENCES `dealers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_primary_brand_id_fkey` FOREIGN KEY (`primary_brand_id`) REFERENCES `brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_primary_region_id_fkey` FOREIGN KEY (`primary_region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_primary_dealer_id_fkey` FOREIGN KEY (`primary_dealer_id`) REFERENCES `dealers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_primary_store_id_fkey` FOREIGN KEY (`primary_store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `identity_accounts` ADD CONSTRAINT `identity_accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_org_memberships` ADD CONSTRAINT `user_org_memberships_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_org_memberships` ADD CONSTRAINT `user_org_memberships_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_org_memberships` ADD CONSTRAINT `user_org_memberships_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_org_memberships` ADD CONSTRAINT `user_org_memberships_dealer_id_fkey` FOREIGN KEY (`dealer_id`) REFERENCES `dealers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_org_memberships` ADD CONSTRAINT `user_org_memberships_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_dealer_id_fkey` FOREIGN KEY (`dealer_id`) REFERENCES `dealers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_current_version_id_fkey` FOREIGN KEY (`current_version_id`) REFERENCES `content_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_versions` ADD CONSTRAINT `content_versions_content_item_id_fkey` FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workshop_submissions` ADD CONSTRAINT `workshop_submissions_submitter_id_fkey` FOREIGN KEY (`submitter_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workshop_submissions` ADD CONSTRAINT `workshop_submissions_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workshop_submissions` ADD CONSTRAINT `workshop_submissions_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workshop_submissions` ADD CONSTRAINT `workshop_submissions_dealer_id_fkey` FOREIGN KEY (`dealer_id`) REFERENCES `dealers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workshop_submissions` ADD CONSTRAINT `workshop_submissions_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workshop_review_events` ADD CONSTRAINT `workshop_review_events_submission_id_fkey` FOREIGN KEY (`submission_id`) REFERENCES `workshop_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workshop_review_events` ADD CONSTRAINT `workshop_review_events_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `published_guides` ADD CONSTRAINT `published_guides_source_submission_id_fkey` FOREIGN KEY (`source_submission_id`) REFERENCES `workshop_submissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `published_guides` ADD CONSTRAINT `published_guides_content_item_id_fkey` FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `published_guides` ADD CONSTRAINT `published_guides_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `published_guides` ADD CONSTRAINT `published_guides_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `published_guides` ADD CONSTRAINT `published_guides_dealer_id_fkey` FOREIGN KEY (`dealer_id`) REFERENCES `dealers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `published_guides` ADD CONSTRAINT `published_guides_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `published_guides` ADD CONSTRAINT `published_guides_published_by_fkey` FOREIGN KEY (`published_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contribution_stats` ADD CONSTRAINT `contribution_stats_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contribution_stats` ADD CONSTRAINT `contribution_stats_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contribution_stats` ADD CONSTRAINT `contribution_stats_dealer_id_fkey` FOREIGN KEY (`dealer_id`) REFERENCES `dealers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contribution_stats` ADD CONSTRAINT `contribution_stats_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contribution_stats` ADD CONSTRAINT `contribution_stats_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_documents` ADD CONSTRAINT `knowledge_documents_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_documents` ADD CONSTRAINT `knowledge_documents_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_documents` ADD CONSTRAINT `knowledge_documents_dealer_id_fkey` FOREIGN KEY (`dealer_id`) REFERENCES `dealers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_documents` ADD CONSTRAINT `knowledge_documents_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `knowledge_chunks` ADD CONSTRAINT `knowledge_chunks_knowledge_document_id_fkey` FOREIGN KEY (`knowledge_document_id`) REFERENCES `knowledge_documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

