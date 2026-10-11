/** PM2: API de Inventario Willy. Arranque: pm2 start ecosystem.config.cjs && pm2 save */
module.exports = {
  apps: [
    {
      name: "inventariowilly-api",
      cwd: "/home/ubuntu/apps/inventariowilly/apps/api",
      script: "dist/src/server.js",
      node_args: "--env-file=/home/ubuntu/apps/inventariowilly/.env",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 2000,
      kill_timeout: 8000,
      wait_ready: false,
      listen_timeout: 10000,
      max_memory_restart: "400M",
      env: { NODE_ENV: "production", TZ: "America/Bogota" },
      out_file: "/home/ubuntu/apps/inventariowilly/logs/api.out.log",
      error_file: "/home/ubuntu/apps/inventariowilly/logs/api.err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      time: true,
    },
  ],
};
