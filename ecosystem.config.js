module.exports = {
  apps : [{
    name: 'multiplayer-chess-game',
    script: 'index.js',
    exec_mode: 'cluster',
    instances: 4,
    wait_ready: true
  }]
};
