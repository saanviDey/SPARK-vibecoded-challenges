import http from "node:http";
import { readFile } from "node:fs/promises";
import { randomInt } from "node:crypto";
import { create, player, action, view, timeout } from "./engine.mjs";
const rooms = new Map(),
  streams = new Map(),
  limits = new Map();
const PORT = Number(process.env.PORT || 3000),
  HOST = process.env.HOST || "0.0.0.0";
function broadcast(code) {
  const g = rooms.get(code);
  g.revision++;
  g.log = g.log.slice(-30);
  for (const p of g.players) {
    for (const res of streams.get(p.token) || [])
      res.write("data: " + JSON.stringify(view(g, p)) + "\n\n");
  }
}
function auth(code, token) {
  const g = rooms.get(code);
  const p = g?.players.find((p) => p.token === token);
  if (!p) throw Error("Session not found. Join the room again.");
  return [g, p];
}
function json(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) throw Error("Request too large.");
  }
  return JSON.parse(raw || "{}");
}
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    if (
      req.headers.origin &&
      req.headers.origin !== "http://" + req.headers.host &&
      req.headers.origin !== "https://" + req.headers.host
    )
      return json(res, { error: "Origin not allowed." }, 403);
    if (u.pathname === "/events" && req.method === "GET") {
      const code = u.searchParams.get("room");
      const token = req.headers.cookie
        ?.split("; ")
        .find((x) => x.startsWith("uno_" + code + "="))
        ?.split("=")[1];
      const [g, p] = auth(code, token);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      let set = streams.get(token) || new Set();
      if (set.size >= 4) {
        res.end();
        return;
      }
      streams.set(token, set);
      set.add(res);
      p.connected = true;
      broadcast(code);
      req.on("close", () => {
        set.delete(res);
        if (!set.size) {
          p.connected = false;
          broadcast(code);
        }
      });
      return;
    }
    if (u.pathname.startsWith("/api/") && req.method === "POST") {
      const ip = req.socket.remoteAddress;
      let l = limits.get(ip) || { at: Date.now(), n: 0 };
      if (Date.now() - l.at > 10000) l = { at: Date.now(), n: 0 };
      limits.set(ip, l);
      if (++l.n > 100) return json(res, { error: "Please slow down." }, 429);
      const b = await body(req);
      let code = String(b.room || "").toUpperCase();
      let g, p;
      if (u.pathname === "/api/create" || u.pathname === "/api/join") {
        const name = String(b.name || "")
          .trim()
          .slice(0, 20);
        if (!name) throw Error("Enter a player name.");
        if (u.pathname === "/api/create") {
          if (rooms.size >= 1000) throw Error("Server is full. Try later.");
          do {
            code = Array.from(
              { length: 6 },
              () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)],
            ).join("");
          } while (rooms.has(code));
          g = create(name);
          g.created = Date.now();
          rooms.set(code, g);
          p = g.players[0];
        } else {
          g = rooms.get(code);
          if (!g) throw Error("Room not found. Check the code.");
          if (g.phase !== "lobby")
            throw Error("This round has already started.");
          if (g.players.length >= 4) throw Error("Room is full.");
          p = player(name);
          g.players.push(p);
          g.log.push(name + " joined.");
        }
        res.setHeader(
          "Set-Cookie",
          "uno_" +
            code +
            "=" +
            p.token +
            "; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400" +
            (req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""),
        );
        broadcast(code);
        return json(res, { room: code, state: view(g, p) });
      }
      const token = req.headers.cookie
        ?.split("; ")
        .find((x) => x.startsWith("uno_" + code + "="))
        ?.split("=")[1];
      [g, p] = auth(code, token);
      if (u.pathname === "/api/state")
        return json(res, { room: code, state: view(g, p) });
      if (u.pathname !== "/api/action")
        return json(res, { error: "Not found." }, 404);
      if (b.revision !== g.revision)
        return json(res, { error: "Game changed. Try your move again." }, 409);
      action(g, p, b);
      broadcast(code);
      return json(res, { state: view(g, p) });
    }
    if (req.method !== "GET") return json(res, { error: "Not found." }, 404);
    const files = {
      "/": ["index.html", "text/html"],
      "/app.js": ["app.js", "text/javascript"],
      "/style.css": ["style.css", "text/css"],
    };
    const f = files[u.pathname];
    if (!f) return json(res, { error: "Not found." }, 404);
    res.writeHead(200, {
      "Content-Type": f[1],
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    });
    res.end(await readFile(new URL("./public/" + f[0], import.meta.url)));
  } catch (e) {
    if (!res.headersSent) json(res, { error: e.message }, 400);
    else res.end();
  }
});
setInterval(() => {
  for (const [code, g] of rooms) {
    if (timeout(g)) broadcast(code);
    for (const p of g.players)
      for (const res of streams.get(p.token) || [])
        res.write(": heartbeat\n\n");
    if (
      !g.players.some((p) => p.connected) &&
      Date.now() - g.created > 86400000
    ) {
      rooms.delete(code);
      for (const p of g.players) streams.delete(p.token);
    }
  }
  for (const [ip, l] of limits)
    if (Date.now() - l.at > 60000) limits.delete(ip);
}, 1000).unref();
server.listen(PORT, HOST, () =>
  console.log(
    "UNO server listening on http://localhost:" + server.address().port,
  ),
);
