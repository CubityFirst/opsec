CREATE TABLE `ask_usage` (
	`sub` text NOT NULL,
	`day` text NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`sub`, `day`)
);
