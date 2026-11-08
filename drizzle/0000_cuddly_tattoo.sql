CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`staff_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`commission` integer NOT NULL,
	`seller_min` integer NOT NULL,
	`seller_max` integer NOT NULL,
	`till_count` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`last_op` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `movements` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`till_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`staff_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`till_id`) REFERENCES `till_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`action` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`seller` integer NOT NULL,
	`gross` integer NOT NULL,
	`commission` integer NOT NULL,
	`net` integer NOT NULL,
	`till_id` text NOT NULL,
	`staff_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`till_id`) REFERENCES `till_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payout_seller_event` ON `payouts` (`event_id`,`seller`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`till_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`staff_name` text NOT NULL,
	`number` integer NOT NULL,
	`items` text NOT NULL,
	`total` integer NOT NULL,
	`received` integer NOT NULL,
	`created_at` text NOT NULL,
	`voided_at` text,
	`voided_by` text,
	`void_reason` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`till_id`) REFERENCES `till_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`pin_hash` text NOT NULL,
	`disabled` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `till_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`number` integer NOT NULL,
	`opening` integer NOT NULL,
	`opened_at` text NOT NULL,
	`opened_by` text NOT NULL,
	`closed_at` text,
	`closed_by` text,
	`counted` integer,
	`expected` integer,
	`note` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
