"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 8766;
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;

function contentType(filePath) {
  switch (path.extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function serveStatic(req, res, pathname) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  rel = decodeURIComponent(rel).replace(/\0/g, "");
  if (rel.includes("..")) {
    res.writeHead(400).end("Bad path");
    return;
  }
  if (rel === "/server.js" || rel === "/package.json") {
    res.writeHead(404).end("Not found");
    return;
  }
  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(400).end("Bad path");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET") {
    serveStatic(req, res, url.pathname);
    return;
  }
  res.writeHead(405).end("Method not allowed");
});

server.listen(PORT, HOST, () => {
  console.log(`Dr Scovy OBS widget at http://${HOST}:${PORT}/`);
});
