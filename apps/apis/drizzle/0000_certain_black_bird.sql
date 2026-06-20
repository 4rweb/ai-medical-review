CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessao_id" text NOT NULL,
	"evento" text NOT NULL,
	"nivel_original" text,
	"nivel_final" text,
	"regras_acionadas" jsonb,
	"detalhe" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "triage_queue" (
	"sessao_id" text PRIMARY KEY NOT NULL,
	"color" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"sintoma_principal" text NOT NULL,
	"nome_mascarado" text NOT NULL,
	"idade" integer NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"sessao" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
