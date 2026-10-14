module.exports = {
  apps: [
    {
      name: 'cs2-api',
      script: 'index.js',
      cwd: __dirname,
      max_memory_restart: '500M',
      time: true,
    },
    {
      name: 'cs2-worker',
      script: 'worker.js',
      cwd: __dirname,
      kill_timeout: 30000,
      max_memory_restart: '2G',
      time: true,
    },
  ],
};
