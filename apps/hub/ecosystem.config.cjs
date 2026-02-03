module.exports = {
  apps: [{
    name: 'kaivalo-hub',
    script: 'build/index.js',
    env: {
      PORT: 3100,
      NODE_ENV: 'production'
    }
  }]
};
