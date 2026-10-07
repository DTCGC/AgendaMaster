module.exports = {
  apps: [
    {
      name: 'AgendaMaster',
      // Next's own entry point, not `npm run start`: through npm, PM2 only
      // sees npm, and next-server's output (every console.log/error, i.e. all
      // server-side errors) went to PM2's daemon log (/root/.pm2/pm2.log)
      // instead of this app's logs. Run directly, `pm2 logs AgendaMaster`
      // shows it.
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      instances: 'max',
      exec_mode: 'cluster',
      // Timestamp every line, and keep one log pair however many instances run.
      time: true,
      merge_logs: true,
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
