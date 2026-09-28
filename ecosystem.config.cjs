// pm2 process definition. Start with: pm2 start ecosystem.config.cjs
//
// -H 127.0.0.1 is deliberate and must stay: `next start` otherwise binds 0.0.0.0,
// which on a host without a firewall exposes the app directly, bypassing the
// reverse proxy that terminates TLS. (`HOSTNAME=` is ignored by `next start`;
// the flag is the only way to set the bind address.)
module.exports = {
  apps: [
    {
      name: "mhf-aid",
      cwd: __dirname,
      script: "./node_modules/next/dist/bin/next",
      args: "start -p 3100 -H 127.0.0.1",
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1G",
    },
  ],
};
