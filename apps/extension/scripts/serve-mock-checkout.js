// Serves src/test/mock-checkout.html over plain HTTP for manual/extension QA —
// load-unpack the extension, seed a merchant with domain "localhost" (see
// apps/backend for the seed script used during Phase 3 verification), then visit
// http://localhost:8081/mock-checkout.html in the same Chrome profile.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8081;
const filePath = path.join(__dirname, '..', 'src', 'test', 'mock-checkout.html');

http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(filePath));
  })
  .listen(PORT, () => console.log(`Mock checkout page: http://localhost:${PORT}/mock-checkout.html`));
