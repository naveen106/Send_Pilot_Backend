ALTER TABLE `users` ADD COLUMN `resetToken` VARCHAR(191) NULL;
ALTER TABLE `users` ADD COLUMN `resetTokenExpiry` DATETIME(3) NULL;
ALTER TABLE `users` ADD UNIQUE INDEX `users_resetToken_key`(`resetToken`);
