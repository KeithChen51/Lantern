-- CreateTable
CREATE TABLE `feedback_suggestions` (
    `id` VARCHAR(191) NOT NULL,
    `author_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(100) NOT NULL,
    `content` TEXT NOT NULL,
    `category` ENUM('platform', 'culture', 'knowledge', 'other') NOT NULL,
    `status` ENUM('pending', 'reviewing', 'accepted', 'in_progress', 'implemented', 'declined') NOT NULL DEFAULT 'pending',
    `related_suggestion_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `feedback_suggestions_created_at_id_idx`(`created_at`, `id`),
    INDEX `feedback_suggestions_category_status_created_at_idx`(`category`, `status`, `created_at`),
    INDEX `feedback_suggestions_status_created_at_idx`(`status`, `created_at`),
    INDEX `feedback_suggestions_author_id_created_at_idx`(`author_id`, `created_at`),
    INDEX `feedback_suggestions_related_suggestion_id_idx`(`related_suggestion_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feedback_likes` (
    `suggestion_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `feedback_likes_user_id_idx`(`user_id`),
    PRIMARY KEY (`suggestion_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feedback_comments` (
    `id` VARCHAR(191) NOT NULL,
    `suggestion_id` VARCHAR(191) NOT NULL,
    `author_id` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `reply_to_id` VARCHAR(191) NULL,
    `hidden_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `feedback_comments_suggestion_id_created_at_id_idx`(`suggestion_id`, `created_at`, `id`),
    INDEX `feedback_comments_author_id_idx`(`author_id`),
    INDEX `feedback_comments_reply_to_id_idx`(`reply_to_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feedback_events` (
    `id` VARCHAR(191) NOT NULL,
    `suggestion_id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NOT NULL,
    `from_status` ENUM('pending', 'reviewing', 'accepted', 'in_progress', 'implemented', 'declined') NOT NULL,
    `to_status` ENUM('pending', 'reviewing', 'accepted', 'in_progress', 'implemented', 'declined') NOT NULL,
    `note` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `feedback_events_suggestion_id_created_at_id_idx`(`suggestion_id`, `created_at`, `id`),
    INDEX `feedback_events_actor_id_idx`(`actor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feedback_notifications` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `suggestion_id` VARCHAR(191) NOT NULL,
    `message` VARCHAR(255) NOT NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `feedback_notifications_user_id_created_at_id_idx`(`user_id`, `created_at`, `id`),
    INDEX `feedback_notifications_user_id_read_at_idx`(`user_id`, `read_at`),
    INDEX `feedback_notifications_suggestion_id_idx`(`suggestion_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `feedback_suggestions` ADD CONSTRAINT `feedback_suggestions_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback_suggestions` ADD CONSTRAINT `feedback_suggestions_related_suggestion_id_fkey` FOREIGN KEY (`related_suggestion_id`) REFERENCES `feedback_suggestions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback_likes` ADD CONSTRAINT `feedback_likes_suggestion_id_fkey` FOREIGN KEY (`suggestion_id`) REFERENCES `feedback_suggestions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback_likes` ADD CONSTRAINT `feedback_likes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback_comments` ADD CONSTRAINT `feedback_comments_suggestion_id_fkey` FOREIGN KEY (`suggestion_id`) REFERENCES `feedback_suggestions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback_comments` ADD CONSTRAINT `feedback_comments_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback_comments` ADD CONSTRAINT `feedback_comments_reply_to_id_fkey` FOREIGN KEY (`reply_to_id`) REFERENCES `feedback_comments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback_events` ADD CONSTRAINT `feedback_events_suggestion_id_fkey` FOREIGN KEY (`suggestion_id`) REFERENCES `feedback_suggestions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback_events` ADD CONSTRAINT `feedback_events_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback_notifications` ADD CONSTRAINT `feedback_notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback_notifications` ADD CONSTRAINT `feedback_notifications_suggestion_id_fkey` FOREIGN KEY (`suggestion_id`) REFERENCES `feedback_suggestions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
