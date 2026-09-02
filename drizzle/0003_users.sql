CREATE TABLE `users` (
	`sub` text PRIMARY KEY NOT NULL,
	`email` text,
	`email_verified` integer DEFAULT false NOT NULL,
	`name` text,
	`picture` text,
	`roles` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`last_login_at` text NOT NULL
);
