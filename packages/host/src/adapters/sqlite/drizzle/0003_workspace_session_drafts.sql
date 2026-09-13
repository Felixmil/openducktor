PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workspace_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`runtime_kind` text NOT NULL,
	`external_session_id` text,
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
INSERT INTO `__new_workspace_sessions`("id", "runtime_kind", "external_session_id", "execution_target_json", "role_snapshot_json", "selected_model_json", "generated_title", "manual_title", "created_at_ms", "updated_at_ms", "archived_at_ms") SELECT "id", "runtime_kind", "external_session_id", "execution_target_json", "role_snapshot_json", "selected_model_json", "generated_title", "manual_title", "created_at_ms", "updated_at_ms", "archived_at_ms" FROM `workspace_sessions`;--> statement-breakpoint
DROP TABLE `workspace_sessions`;--> statement-breakpoint
ALTER TABLE `__new_workspace_sessions` RENAME TO `workspace_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspace_sessions_runtime_identity` ON `workspace_sessions` (`runtime_kind`,`external_session_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_sessions_active_updated` ON `workspace_sessions` (`archived_at_ms`,`updated_at_ms`);