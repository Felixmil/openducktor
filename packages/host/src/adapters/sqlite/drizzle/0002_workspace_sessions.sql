CREATE TABLE `workspace_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`runtime_kind` text NOT NULL,
	`external_session_id` text NOT NULL,
	`execution_target_json` text NOT NULL,
	`role_snapshot_json` text,
	`selected_model_json` text,
	`generated_title` text,
	`manual_title` text,
	`created_at_ms` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	`archived_at_ms` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_sessions_runtime_identity` ON `workspace_sessions` (`runtime_kind`,`external_session_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_sessions_active_updated` ON `workspace_sessions` (`archived_at_ms`,`updated_at_ms`);