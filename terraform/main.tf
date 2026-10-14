# ==============================================================================
# Cloudflare Workers KV Namespace for Persistent Student Task Storage
# ==============================================================================
resource "cloudflare_workers_kv_namespace" "task_store" {
  account_id = var.cloudflare_account_id
  title      = "${var.project_name}-${var.environment}-kv"
}

# ==============================================================================
# Cloudflare Worker Script with KV Namespace Binding
# ==============================================================================
resource "cloudflare_workers_script" "task_worker" {
  account_id         = var.cloudflare_account_id
  name               = "${var.project_name}-${var.environment}-worker"
  content            = file("${path.module}/../application/worker.js")
  module             = true
  compatibility_date = "2024-09-23"

  # Binding the KV namespace so worker.js can access env.STUDENT_TASKS_KV
  kv_namespace_binding {
    name         = "STUDENT_TASKS_KV"
    namespace_id = cloudflare_workers_kv_namespace.task_store.id
  }

  # Environment metadata binding
  plain_text_binding {
    name = "ENVIRONMENT"
    text = var.environment
  }
}

