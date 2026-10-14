output "kv_namespace_id" {
  description = "Unique ID of the Cloudflare Workers KV namespace"
  value       = cloudflare_workers_kv_namespace.task_store.id
}

output "kv_namespace_title" {
  description = "Title of the Cloudflare Workers KV namespace"
  value       = cloudflare_workers_kv_namespace.task_store.title
}

output "worker_name" {
  description = "Name of the Cloudflare Worker script"
  value       = cloudflare_workers_script.task_worker.name
}

output "worker_binding_name" {
  description = "KV binding variable name accessible inside the Worker code"
  value       = "STUDENT_TASKS_KV"
}

output "environment" {
  description = "Target deployment environment"
  value       = var.environment
}
