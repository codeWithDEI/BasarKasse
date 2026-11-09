ALTER TABLE `operations` ADD `request_hash` text;--> statement-breakpoint
ALTER TABLE `operations` ADD `outcome` text DEFAULT 'committed' NOT NULL;