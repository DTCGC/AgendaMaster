module.exports = {
  apps: [
    {
      name: 'AgendaMaster',
      script: 'npm',
      args: 'run start',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      exp_backoff_restart_delay: 100,
      max_memory_restart: '1G',
    },
  ],
};
