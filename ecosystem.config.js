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
        PORT: 3000,
        // Meeting dates are computed in local time (6:45 PM Friday) and the
        // Droplet's crontab runs on Pacific time; pin it so neither depends
        // on the host's timezone setting.
        TZ: 'America/Vancouver'
      },
      exp_backoff_restart_delay: 100,
      max_memory_restart: '1G',
    },
  ],
};
