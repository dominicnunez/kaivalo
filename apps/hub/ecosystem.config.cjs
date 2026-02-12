module.exports = {
  apps: [{
    name: 'kaivalo-hub',
    script: 'build/index.js',
    env: {
      PORT: 3100,
      HOST: '127.0.0.1',
      NODE_ENV: 'production'
    }
  }]
};
