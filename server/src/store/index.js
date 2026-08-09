const store = process.env.MONGODB_URI ? require("./mongoStore") : require("./memoryStore");

module.exports = store;
