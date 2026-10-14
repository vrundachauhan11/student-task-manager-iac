variable "cloudflare_api_token" {
  type        = string
  description = "Cloudflare API Token with permissions for Workers Scripts and Workers KV Storage"
  sensitive   = true
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare Account ID where resources will be provisioned"
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare Zone ID (optional; unused for default workers.dev deployments)"
  default     = ""
}

variable "project_name" {
  type        = string
  description = "Project name prefix for resources"
  default     = "student-task-manager"
}

variable "environment" {
  type        = string
  description = "Deployment environment name (e.g. dev, staging, prod)"
  default     = "dev"
}
