/**
 * Cloudflare Worker: Serverless Student Task Management API
 * 
 * Interacts with Cloudflare Workers KV (bound as env.STUDENT_TASKS_KV)
 * to store, retrieve, update, and delete student academic tasks.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // Handle CORS preflight options request
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    try {
      // Health check endpoint
      if (pathname === "/api/health" && method === "GET") {
        return new Response(
          JSON.stringify({
            status: "healthy",
            service: "student-task-manager",
            environment: env.ENVIRONMENT || "development",
            timestamp: new Date().toISOString(),
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      // 1. GET /api/tasks -> Retrieve all student tasks
      if (pathname === "/api/tasks" && method === "GET") {
        if (!env.STUDENT_TASKS_KV) {
          return new Response(
            JSON.stringify({
              error: "Workers KV binding 'STUDENT_TASKS_KV' is not configured.",
            }),
            { status: 500, headers: CORS_HEADERS }
          );
        }

        const taskList = await env.STUDENT_TASKS_KV.list({ prefix: "task:" });
        const tasks = [];

        for (const key of taskList.keys) {
          const taskData = await env.STUDENT_TASKS_KV.get(key.name, { type: "json" });
          if (taskData) {
            tasks.push(taskData);
          }
        }

        // Sort tasks by due date ascending
        tasks.sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));

        return new Response(JSON.stringify(tasks), {
          status: 200,
          headers: CORS_HEADERS,
        });
      }

      // 2. POST /api/tasks -> Create a new task
      if (pathname === "/api/tasks" && method === "POST") {
        if (!env.STUDENT_TASKS_KV) {
          return new Response(
            JSON.stringify({ error: "Workers KV binding not configured." }),
            { status: 500, headers: CORS_HEADERS }
          );
        }

        const body = await request.json();
        if (!body.title || !body.title.trim()) {
          return new Response(
            JSON.stringify({ error: "Task title is required." }),
            { status: 400, headers: CORS_HEADERS }
          );
        }

        const taskId = `task:${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const newTask = {
          id: taskId,
          title: body.title.trim(),
          description: body.description ? body.description.trim() : "",
          course: body.course ? body.course.trim() : "General",
          dueDate: body.dueDate || null,
          priority: body.priority || "Medium", // Low, Medium, High
          status: body.status || "Pending",     // Pending, In Progress, Completed
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await env.STUDENT_TASKS_KV.put(taskId, JSON.stringify(newTask));

        return new Response(JSON.stringify(newTask), {
          status: 201,
          headers: CORS_HEADERS,
        });
      }

      // 3. PUT /api/tasks/:id -> Update an existing task
      if (pathname.startsWith("/api/tasks/") && method === "PUT") {
        if (!env.STUDENT_TASKS_KV) {
          return new Response(
            JSON.stringify({ error: "Workers KV binding not configured." }),
            { status: 500, headers: CORS_HEADERS }
          );
        }

        const taskId = decodeURIComponent(pathname.replace("/api/tasks/", ""));
        const existingRaw = await env.STUDENT_TASKS_KV.get(taskId);

        if (!existingRaw) {
          return new Response(
            JSON.stringify({ error: `Task not found with ID: ${taskId}` }),
            { status: 404, headers: CORS_HEADERS }
          );
        }

        const existing = JSON.parse(existingRaw);
        const updates = await request.json();

        const updatedTask = {
          ...existing,
          title: updates.title !== undefined ? updates.title.trim() : existing.title,
          description: updates.description !== undefined ? updates.description.trim() : existing.description,
          course: updates.course !== undefined ? updates.course.trim() : existing.course,
          dueDate: updates.dueDate !== undefined ? updates.dueDate : existing.dueDate,
          priority: updates.priority || existing.priority,
          status: updates.status || existing.status,
          updatedAt: new Date().toISOString(),
        };

        await env.STUDENT_TASKS_KV.put(taskId, JSON.stringify(updatedTask));

        return new Response(JSON.stringify(updatedTask), {
          status: 200,
          headers: CORS_HEADERS,
        });
      }

      // 4. DELETE /api/tasks/:id -> Delete a task
      if (pathname.startsWith("/api/tasks/") && method === "DELETE") {
        if (!env.STUDENT_TASKS_KV) {
          return new Response(
            JSON.stringify({ error: "Workers KV binding not configured." }),
            { status: 500, headers: CORS_HEADERS }
          );
        }

        const taskId = decodeURIComponent(pathname.replace("/api/tasks/", ""));
        await env.STUDENT_TASKS_KV.delete(taskId);

        return new Response(
          JSON.stringify({ message: "Task deleted successfully.", id: taskId }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      // Default fallback / route not found
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "Student Task Manager API endpoint not recognized.",
          endpoints: [
            "GET  /api/health",
            "GET  /api/tasks",
            "POST /api/tasks",
            "PUT  /api/tasks/:id",
            "DELETE /api/tasks/:id",
          ],
        }),
        { status: 404, headers: CORS_HEADERS }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Internal Server Error", details: err.message }),
        { status: 500, headers: CORS_HEADERS }
      );
    }
  },
};
