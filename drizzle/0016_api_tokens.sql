CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`sub` text NOT NULL,
	`name` text NOT NULL,
	`scope` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_tokens_sub_idx` ON `api_tokens` (`sub`);