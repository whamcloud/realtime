//
// Copyright (c) 2018 DDN. All rights reserved.
// Use of this source code is governed by a MIT-style
// license that can be found in the LICENSE file.

"use strict";

const createIo = require("socket.io");
const socketRouter = require("./socket-router");
const requestValidator = require("./request-validator");
const serializeError = require("./serialize-error");
const eventWildcard = require("./event-wildcard");
const conf = require("./conf");
const obj = require("intel-obj");

// Don't limit to pool to 5 in node 0.10.x
const https = require("https");
const http = require("http");
https.globalAgent.maxSockets = http.globalAgent.maxSockets = Infinity;

const qs = require("querystring");
const url = require("url");

process.on('unhandledRejection', error => {
  console.error(error);
  process.exit(1);
});

const io = createIo();
io.use(eventWildcard);
io.attach(conf.REALTIME_PORT, { wsEngine: "uws" });

const isMessage = /message(\d+)/;

io.on("connection", function(socket) {
  console.log(`socket connected: ${socket.id}`);

  socket.on("*", function onData(data, ack) {
    const matches = isMessage.exec(data.eventName);

    if (!matches) return;

    handleRequest(data, socket, ack, matches[1]);
  });

  socket.on("error", function onError(err) {
    console.error(`socket error: ${err}`);
  });
});

function handleRequest(data, socket, ack, id) {
  try {
    const errors = requestValidator(data);

    if (errors.length) throw new Error(errors);

    const options = data.options || {};
    const method = typeof options.method !== "string" ? "get" : options.method;

    const parsedUrl = url.parse(data.path);
    const qsObj = { qs: qs.parse(parsedUrl.query) };

    socketRouter.go(
      parsedUrl.pathname,
      {
        verb: method,
        data: obj.merge({}, options, qsObj),
        messageName: data.eventName,
        endName: "end" + id
      },
      {
        socket: socket,
        ack: ack
      }
    );
  } catch (error) {
    error.statusCode = 400;
    const err = serializeError(error);

    if (ack) ack(err);
    else socket.emit(data.eventName, err);
  }
}

const shutdown = () => {
  io.close();
};

module.exports = shutdown;
