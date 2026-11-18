const $ = (s) => document.querySelector(s);
let state,
  room,
  events,
  busy = false,
  pending;
const labels = { skip: "⊘", reverse: "↔", wild: "W" };
function error(e) {
  $("#error").textContent = e?.message || "";
}
async function api(path, data) {
  const r = await fetch("/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error);
  return b;
}
function card(c, button = false) {
  let el = document.createElement(button ? "button" : "div");
  el.className = "card " + c.color;
  el.textContent = labels[c.value] || c.value;
  el.setAttribute("aria-label", c.color + " " + c.value);
  return el;
}
function render(s) {
  if (state && s.revision < state.revision) return;
  state = s;
  $("#welcome").hidden = true;
  $("#game").hidden = false;
  $("#roomcode").textContent = room;
  $("#players").replaceChildren(
    ...s.players.map((p) => {
      let e = document.createElement("div");
      e.className =
        "player" + (s.turn === p.id && s.phase === "playing" ? " current" : "");
      let n = document.createElement("strong");
      n.textContent = p.name + (p.id === s.you ? " (you)" : "");
      let t = document.createElement("small");
      t.textContent =
        (p.connected ? "Online" : "Offline") +
        " · " +
        p.count +
        " cards" +
        (p.id === s.host ? " · Host" : "");
      e.append(n, t);
      return e;
    }),
  );
  let me = s.turn === s.you;
  $("#status").textContent =
    s.phase === "lobby"
      ? "Waiting for friends · " + s.players.length + "/4 seats"
      : s.phase === "finished"
        ? s.players.find((p) => p.id === s.winner).name + " wins!"
        : me
          ? "Your turn. Make your move."
          : s.players.find((p) => p.id === s.turn).name + "’s turn";
  $("#pile").replaceChildren(...(s.top ? [card(s.top)] : []));
  $("#activecolor").textContent = s.color
    ? "Active color: " +
      s.color +
      " · " +
      (s.direction === 1 ? "Clockwise" : "Counterclockwise")
    : "Share the code to invite friends.";
  $("#start").hidden = s.phase === "playing" || s.host !== s.you;
  $("#start").disabled = s.players.length < 2 || busy;
  $("#start").textContent =
    s.phase === "finished" ? "Play again" : "Deal the cards";
  $("#draw").hidden = $("#pass").hidden = s.phase !== "playing";
  $("#draw").disabled = !me || !!s.drawn || busy;
  $("#pass").disabled = !me || !s.drawn || busy;
  $("#handcount").textContent = "(" + s.hand.length + ")";
  $("#hand").replaceChildren(
    ...s.hand.map((c) => {
      let el = card(c, true);
      el.disabled = busy || !s.playable.includes(c.id);
      el.onclick = () => {
        if (c.color === "wild") {
          pending = c.id;
          $("#colors").showModal();
        } else move({ type: "play", card: c.id });
      };
      return el;
    }),
  );
  $("#log").replaceChildren(
    ...s.log.map((x) => {
      let li = document.createElement("li");
      li.textContent = x;
      return li;
    }),
  );
}
function connect() {
  events?.close();
  events = new EventSource("/events?room=" + room);
  events.onmessage = (e) => {
    render(JSON.parse(e.data));
    $("#connection").textContent = "● Connected · Live table";
  };
  events.onerror = () => {
    $("#connection").textContent = "Reconnecting… your seat is saved";
  };
}
async function enter(type) {
  if (busy) return;
  busy = true;
  error();
  try {
    let b = await api(type, { name: $("#name").value, room: $("#code").value });
    room = b.room;
    sessionStorage.setItem("uno-room", room);
    history.replaceState(null, "", "?room=" + room);
    state = null;
    render(b.state);
    connect();
  } catch (e) {
    error(e);
  } finally {
    busy = false;
    if (state) render(state);
  }
}
async function move(a) {
  if (busy || !state) return;
  busy = true;
  render(state);
  error();
  try {
    let b = await api("action", {
      ...a,
      room,
      revision: state.revision,
      uno: $("#uno").checked,
    });
    render(b.state);
    if (a.type === "play") $("#uno").checked = false;
  } catch (e) {
    error(e);
    try {
      render((await api("state", { room })).state);
    } catch {}
  } finally {
    busy = false;
    render(state);
  }
}
$("#joinform").onsubmit = (e) => {
  e.preventDefault();
  enter("create");
};
$("#join").onclick = () => enter("join");
$("#start").onclick = () => move({ type: "start" });
$("#draw").onclick = () => move({ type: "draw" });
$("#pass").onclick = () => move({ type: "pass" });
$("#copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    $("#copy").textContent = "Invite link copied";
  } catch {
    error(Error("Share this address: " + location.href));
  }
};
for (const color of ["red", "yellow", "green", "blue"]) {
  let b = document.createElement("button");
  b.className = color;
  b.textContent = color;
  b.onclick = () => {
    $("#colors").close();
    move({ type: "play", card: pending, color });
  };
  $("#colorchoices").append(b);
}
$("#cancelcolor").onclick = () => $("#colors").close();
setInterval(() => {
  $("#timer").textContent =
    state?.phase === "playing"
      ? Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000)) +
        "s remaining"
      : "";
}, 250);
const invite = new URLSearchParams(location.search).get("room");
$("#code").value = invite || "";
let saved = invite || sessionStorage.getItem("uno-room");
if (saved) {
  try {
    let b = await api("state", { room: saved });
    room = saved;
    render(b.state);
    connect();
  } catch {}
}
