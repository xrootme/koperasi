export default {
  apps: [
    {
      name: "koperasi-bot",
      script: "index.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "300M",
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: 10000,
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
