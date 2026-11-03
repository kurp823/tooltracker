'use strict'
// Same handler as /inspections, served on a second route. POST /api/inspections
// answers an empty 200 and saves nothing; this tells us whether the path or the
// handler is at fault.
module.exports = require('../inspection/index.js')
