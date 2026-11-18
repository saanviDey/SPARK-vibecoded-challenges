import { randomInt, randomUUID } from "node:crypto";
export const colors = ["red", "yellow", "green", "blue"];
export function deck() {
  let d = [];
  for (const color of colors) {
    d.push({ color, value: "0" });
    for (const value of [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "skip",
      "reverse",
      "+2",
    ])
      for (let n = 0; n < 2; n++) d.push({ color, value });
  }
  for (let n = 0; n < 4; n++)
    for (const value of ["wild", "+4"]) d.push({ color: "wild", value });
  return shuffle(d.map((c) => ({ ...c, id: randomUUID() })));
}
function shuffle(d) {
  for (let i = d.length - 1; i > 0; i--) {
    let j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
export function create(name) {
  return {
    phase: "lobby",
    players: [player(name)],
    host: 0,
    turn: 0,
    direction: 1,
    revision: 0,
    log: ["Room created."],
    deadline: 0,
  };
}
export function player(name) {
  return {
    id: randomUUID(),
    token: randomUUID(),
    name,
    hand: [],
    connected: false,
  };
}
export function draw(g, p, n) {
  for (let i = 0; i < n; i++) {
    if (!g.deck.length) {
      let top = g.discard.pop();
      g.deck = shuffle(g.discard);
      g.discard = [top];
    }
    if (g.deck.length) p.hand.push(g.deck.pop());
  }
}
function next(g, n = 1) {
  g.turn = (g.turn + g.direction * n + g.players.length * n) % g.players.length;
  g.drawn = null;
  g.deadline = Date.now() + 60000;
}
export function legal(g, p, c) {
  let top = g.discard.at(-1);
  return c.color === "wild"
    ? c.value !== "+4" || !p.hand.some((x) => x.color === g.color)
    : c.color === g.color || c.value === top.value;
}
export function start(g) {
  g.deck = deck();
  g.discard = [];
  g.direction = 1;
  g.turn = 0;
  g.winner = null;
  g.drawn = null;
  g.phase = "playing";
  for (const p of g.players) {
    p.hand = [];
    draw(g, p, 7);
  }
  let i = g.deck.findIndex((c) => /^\d$/.test(c.value));
  g.discard.push(g.deck.splice(i, 1)[0]);
  g.color = g.discard[0].color;
  g.deadline = Date.now() + 60000;
  g.log = ["Round started. " + g.players[0].name + " goes first."];
}
export function action(g, p, a) {
  let ix = g.players.indexOf(p);
  if (a.type === "start") {
    if (ix !== g.host) throw Error("Only the host can start.");
    if (g.phase === "playing") throw Error("Round already started.");
    if (g.players.length < 2) throw Error("At least two players are needed.");
    start(g);
    return;
  }
  if (g.phase !== "playing" || ix !== g.turn)
    throw Error("It is not your turn.");
  if (a.type === "draw") {
    if (g.drawn) throw Error("You already drew. Play that card or pass.");
    draw(g, p, 1);
    g.drawn = p.hand.at(-1)?.id || "empty";
    g.log.push(p.name + " drew a card.");
    return;
  }
  if (a.type === "pass") {
    if (!g.drawn) throw Error("Draw a card before passing.");
    next(g);
    return;
  }
  if (a.type !== "play") throw Error("Unknown action.");
  let c = p.hand.find((c) => c.id === a.card);
  if (!c) throw Error("Card not in your hand.");
  if (g.drawn && g.drawn !== c.id)
    throw Error("You can only play the card you just drew.");
  if (!legal(g, p, c)) throw Error("Match the active color or symbol.");
  if (c.color === "wild" && !colors.includes(a.color))
    throw Error("Choose a color.");
  p.hand = p.hand.filter((x) => x !== c);
  g.discard.push(c);
  g.color = c.color === "wild" ? a.color : c.color;
  g.log.push(p.name + " played " + c.value + " (" + g.color + ").");
  if (p.hand.length === 1) {
    if (a.uno) g.log.push(p.name + " called UNO!");
    else {
      draw(g, p, 2);
      g.log.push(p.name + " forgot UNO and drew two.");
    }
  }
  let steps = 1;
  if (c.value === "reverse") {
    g.direction *= -1;
    if (g.players.length === 2) steps = 2;
  }
  if (c.value === "skip") steps = 2;
  if (c.value === "+2" || c.value === "+4") {
    let victim =
      g.players[(g.turn + g.direction + g.players.length) % g.players.length];
    draw(g, victim, c.value === "+2" ? 2 : 4);
    steps = 2;
  }
  if (p.hand.length === 0) {
    g.phase = "finished";
    g.winner = p.id;
    g.deadline = 0;
    g.log.push(p.name + " won the round!");
  } else next(g, steps);
}
export function view(g, p) {
  return {
    phase: g.phase,
    revision: g.revision,
    players: g.players.map((x) => ({
      id: x.id,
      name: x.name,
      count: x.hand.length,
      connected: x.connected,
    })),
    you: p.id,
    host: g.players[g.host].id,
    turn: g.players[g.turn].id,
    direction: g.direction,
    hand: p.hand,
    top: g.discard?.at(-1),
    color: g.color,
    drawn: g.drawn,
    deadline: g.deadline,
    winner: g.winner,
    log: g.log.slice(-8),
    playable:
      g.phase === "playing" && g.players[g.turn] === p
        ? p.hand
            .filter((c) => (!g.drawn || g.drawn === c.id) && legal(g, p, c))
            .map((c) => c.id)
        : [],
  };
}
export function timeout(g) {
  if (g.phase === "playing" && Date.now() > g.deadline) {
    let p = g.players[g.turn];
    if (!g.drawn) draw(g, p, 1);
    g.log.push(p.name + " timed out; turn passed.");
    next(g);
    return true;
  }
  return false;
}
