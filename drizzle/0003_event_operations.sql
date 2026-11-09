CREATE TABLE `instance_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`epoch` text DEFAULT 'initial' NOT NULL,
	`writes_paused` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_event_created` ON `audit` (`event_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `movements_event_till` ON `movements` (`event_id`,`till_id`);--> statement-breakpoint
CREATE INDEX `payouts_event_till` ON `payouts` (`event_id`,`till_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sale_event_number` ON `sales` (`event_id`,`number`);--> statement-breakpoint
CREATE INDEX `sales_event_till_active` ON `sales` (`event_id`,`till_id`,`voided_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `open_till_event_number` ON `till_sessions` (`event_id`,`number`) WHERE "till_sessions"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX `tills_event` ON `till_sessions` (`event_id`);
--> statement-breakpoint
INSERT INTO instance_state(id,epoch,writes_paused) VALUES(1,'initial',0);
