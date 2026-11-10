CREATE TABLE `pool_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`till_id` text,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`staff_id` text NOT NULL,
	`staff_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`till_id`) REFERENCES `till_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "pool_entry_source" CHECK(("pool_entries"."kind" = 'till' AND "pool_entries"."till_id" IS NOT NULL AND "pool_entries"."amount" >= 0) OR ("pool_entries"."kind" = 'movement' AND "pool_entries"."till_id" IS NULL AND "pool_entries"."amount" <> 0))
);
--> statement-breakpoint
CREATE INDEX `pool_entries_event` ON `pool_entries` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pool_till_once` ON `pool_entries` (`till_id`) WHERE "pool_entries"."till_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`seller` integer NOT NULL,
	`gross` integer NOT NULL,
	`commission` integer NOT NULL,
	`net` integer NOT NULL,
	`rounding` integer DEFAULT 0 NOT NULL,
	`funding` text DEFAULT 'till' NOT NULL,
	`till_id` text,
	`staff_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`till_id`) REFERENCES `till_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payout_accounting" CHECK("__new_payouts"."gross" = "__new_payouts"."commission" + "__new_payouts"."rounding" + "__new_payouts"."net" AND "__new_payouts"."net" >= 0 AND "__new_payouts"."commission" >= 0 AND "__new_payouts"."rounding" BETWEEN 0 AND 9),
	CONSTRAINT "payout_funding" CHECK(("__new_payouts"."funding" = 'pool' AND "__new_payouts"."till_id" IS NULL) OR ("__new_payouts"."funding" = 'till' AND "__new_payouts"."till_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_payouts`("id", "event_id", "seller", "gross", "commission", "net", "rounding", "funding", "till_id", "staff_name", "created_at") SELECT "id", "event_id", "seller", "gross", "commission", "net", 0, 'till', "till_id", "staff_name", "created_at" FROM `payouts`;--> statement-breakpoint
DROP TABLE `payouts`;--> statement-breakpoint
ALTER TABLE `__new_payouts` RENAME TO `payouts`;--> statement-breakpoint
CREATE UNIQUE INDEX `payout_seller_event` ON `payouts` (`event_id`,`seller`);--> statement-breakpoint
CREATE INDEX `payouts_event_till` ON `payouts` (`event_id`,`till_id`);--> statement-breakpoint
ALTER TABLE `events` ADD `settlement_mode` text DEFAULT 'till' NOT NULL;--> statement-breakpoint
ALTER TABLE `staff` ADD `event_id` text REFERENCES events(id);--> statement-breakpoint
ALTER TABLE `staff` ADD `till_number` integer;--> statement-breakpoint
ALTER TABLE `staff` ADD `pin_cipher` text;--> statement-breakpoint
ALTER TABLE `staff` ADD `auth_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `staff_event` ON `staff` (`event_id`);
--> statement-breakpoint
UPDATE staff SET event_id='demo-fruehjahr',till_number=1 WHERE id='demo-kasse' AND role='cashier' AND EXISTS(SELECT 1 FROM events WHERE id='demo-fruehjahr');
--> statement-breakpoint
DELETE FROM sessions WHERE staff_id IN (SELECT id FROM staff WHERE role='cashier');
