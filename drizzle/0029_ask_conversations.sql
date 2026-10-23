CREATE TABLE `ask_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`sub` text NOT NULL,
	`title` text NOT NULL,
	`turns` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ask_conversations_sub_updated_idx` ON `ask_conversations` (`sub`,`updated_at`);