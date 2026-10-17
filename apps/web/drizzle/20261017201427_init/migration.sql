CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digests" (
	"id" text PRIMARY KEY,
	"member_id" text NOT NULL,
	"date" text NOT NULL,
	"markdown" text NOT NULL,
	"comment_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"task_id" text,
	"member_id" text,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"code" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"created_by_member_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_member_id" text
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"display_name" text NOT NULL,
	"github_login" text,
	"role" text DEFAULT 'member' NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"off_hours_start" text DEFAULT '19:00' NOT NULL,
	"off_hours_end" text DEFAULT '08:00' NOT NULL,
	"before_reset_minutes" integer DEFAULT 120 NOT NULL,
	"reserve_pct" integer DEFAULT 10 NOT NULL,
	"windows_saved_at" timestamp with time zone,
	"sharing_enabled" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"max_concurrent" integer DEFAULT 1 NOT NULL,
	"routine_fire_url_enc" text,
	"routine_token_enc" text,
	"routine_hint" text,
	"routine_configured_at" timestamp with time zone,
	"routine_test_at" timestamp with time zone,
	"used_pct_5h" real,
	"resets_5h_at" timestamp with time zone,
	"used_pct_week" real,
	"resets_week_at" timestamp with time zone,
	"usage_source" text,
	"usage_updated_at" timestamp with time zone,
	"test_window_until" timestamp with time zone,
	"window_notice_for" timestamp with time zone,
	"digest_issue_number" integer,
	"last_digest_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY,
	"member_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"url" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_tasks" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"creator_member_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"likely_files" jsonb DEFAULT '[]' NOT NULL,
	"done_check" text,
	"size" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"target_pr_number" integer,
	"cron" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"issue_number" integer NOT NULL,
	"issue_url" text,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"likely_files" jsonb DEFAULT '[]' NOT NULL,
	"done_check" text,
	"size" text,
	"target_pr_number" integer,
	"priority" text DEFAULT 'normal' NOT NULL,
	"requester_member_id" text NOT NULL,
	"assignee_member_id" text,
	"status" text NOT NULL,
	"status_reason" text,
	"blocked_by_task_id" text,
	"blocked_on_files" jsonb,
	"run_kind" text,
	"window_kind" text,
	"shared" boolean DEFAULT false NOT NULL,
	"requester_used_pct_at_dispatch" real,
	"branch" text,
	"session_url" text,
	"result_pr_number" integer,
	"result_pr_url" text,
	"result_comment_url" text,
	"result" jsonb,
	"status_comment_id" bigint,
	"status_comment_hash" text,
	"recurring_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"est_tokens" integer DEFAULT 0 NOT NULL,
	"cost_pct" real DEFAULT 0 NOT NULL,
	"run_now" boolean DEFAULT false NOT NULL,
	"triage_now" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triaged_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usage_tokens" (
	"id" text PRIMARY KEY,
	"member_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"github_login" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"github_installation_id" bigint,
	"repo_owner" text,
	"repo_name" text,
	"default_branch" text,
	"labels_created_at" timestamp with time zone,
	"demo_mode" boolean DEFAULT false NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"clock_offset_minutes" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "digests_member_date_uq" ON "digests" ("member_id","date");--> statement-breakpoint
CREATE INDEX "events_workspace_created_idx" ON "events" ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "events_task_idx" ON "events" ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_workspace_user_uq" ON "members" ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "members" ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_member_idx" ON "notifications" ("member_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" ("member_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "recurring_workspace_idx" ON "recurring_tasks" ("workspace_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_workspace_issue_uq" ON "tasks" ("workspace_id","issue_number");--> statement-breakpoint
CREATE INDEX "tasks_workspace_status_idx" ON "tasks" ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "usage_tokens_member_idx" ON "usage_tokens" ("member_id");--> statement-breakpoint
CREATE INDEX "workspaces_installation_idx" ON "workspaces" ("github_installation_id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "digests" ADD CONSTRAINT "digests_member_id_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_member_id_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_creator_member_id_members_id_fkey" FOREIGN KEY ("creator_member_id") REFERENCES "members"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_requester_member_id_members_id_fkey" FOREIGN KEY ("requester_member_id") REFERENCES "members"("id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_member_id_members_id_fkey" FOREIGN KEY ("assignee_member_id") REFERENCES "members"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "usage_tokens" ADD CONSTRAINT "usage_tokens_member_id_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE;