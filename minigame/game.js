'use strict';
const createCore = require('./core');
const createRuntime = require('./runtime');
createRuntime(wx, { requestAnimationFrame, cancelAnimationFrame }, createCore).start();
