"""Read the merge-sort examples and generate a standalone browser animation."""

import argparse
import json
import re
from pathlib import Path


def read_examples(source):
    # Each example's starting array appears immediately before its Divide section.
    examples = re.findall(
        r"\[\s*-?\d+(?:\s*,\s*-?\d+)*\s*\](?![^\r\n]*\[)"
        r"(?=[^\r\n]*\r?\n(?:[ \t]*\r?\n)*[ \t]*Divide:)",
        source,
        flags=re.IGNORECASE,
    )
    if not examples:
        raise ValueError("Expected an integer array above a Divide: heading.")
    return [[int(value) for value in re.findall(r"-?\d+", example)]
            for example in examples]


def trace(values):
    order = list(range(len(values)))
    cuts = set()
    frames = []

    def record(message, active=()):
        frames.append(dict(message=message, order=order.copy(),
                           cuts=sorted(cuts), active=list(active)))

    def sort(start, end):
        if end - start == 1:
            item = order[start]
            record(f"{values[item]} is already sorted.", [item])
            return

        # The document puts the extra item on the left for odd lengths.
        middle = start + (end - start + 1) // 2
        cuts.add(middle)
        record("Split this group into two halves.", order[start:end])
        sort(start, middle)
        sort(middle, end)
        cuts.remove(middle)

        left = order[start:middle]
        right = order[middle:end]
        i = j = 0
        while i < len(left) or j < len(right):
            comparing = i < len(left) and j < len(right)
            if comparing:
                first, second = left[i], right[j]
                record(f"Compare {values[first]} and {values[second]}.", [first, second])
            dest = start + i + j
            if j == len(right) or (comparing and values[left[i]] <= values[right[j]]):
                item = left[i]
                i += 1
            else:
                item = right[j]
                j += 1
            order.remove(item)
            order.insert(dest, item)
            action = "Place" if comparing else "Copy remaining"
            record(f"{action} {values[item]} into position {dest + 1}.", [item])

        merged = [values[item] for item in order[start:end]]
        record(f"Merged {merged}.", order[start:end])

    record(f"Start with {values}.")
    sort(0, len(values))
    record(f"Sorted: {[values[item] for item in order]}.")
    return dict(values=values, frames=frames)


HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Merge sort visualizer</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: clamp(16px, 5vw, 64px); background: #f2f5fa;
    color: #172139; font: 16px system-ui, sans-serif; }
  main { max-width: 760px; margin: auto; background: #fff; padding: clamp(16px, 4vw, 40px);
    border: 1px solid #dbe2ee; border-radius: 20px; }
  h1 { margin: 0 0 20px; font-size: clamp(28px, 5vw, 42px); }
  .plot { position: relative; height: 250px; margin: 22px 0 12px;
    border-bottom: 2px solid #dbe2ee; background: #f7f9fc; border-radius: 12px 12px 0 0; }
  .bar { position: absolute; bottom: 0; display: grid; place-items: center;
    min-height: 30px; border-radius: 8px 8px 0 0; background: #264da3; color: white;
    font-weight: 700; transition: left 350ms ease, background-color 200ms ease; }
  .bar.active { background: #a64217; }
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  button, select { font: inherit; padding: 8px 12px; border: 1px solid #a5b4ce;
    border-radius: 8px; background: #fff; color: inherit; max-width: 100%; }
  button:not(:disabled), select { cursor: pointer; }
  button:disabled { color: #667287; }
  #play { background: #264da3; color: white; border-color: #264da3; }
  #step { margin-inline-start: auto; font-variant-numeric: tabular-nums; }
  #status { min-height: 3em; }
  @media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
</style>
</head>
<body>
<main>
  <h1>Merge sort visualizer</h1>
  <label for="example">Example</label>
  <select id="example"></select>
  <div class="plot" id="plot" aria-hidden="true"></div>
  <p id="status" aria-live="polite"></p>
  <div class="controls">
    <button id="play" type="button">Play</button>
    <button id="back" type="button">Previous</button>
    <button id="next" type="button">Next</button>
    <button id="reset" type="button">Reset</button>
    <span id="step"></span>
  </div>
</main>
<script>
const examples = __EXAMPLES__;
const select = document.getElementById("example");
const plot = document.getElementById("plot");
const status = document.getElementById("status");
const play = document.getElementById("play");
const back = document.getElementById("back");
const next = document.getElementById("next");
const step = document.getElementById("step");
let example, bars, index, timer;

examples.forEach(({ values }, i) => {
  select.add(new Option("[" + values.join(", ") + "]", i));
});

function loadExample() {
  pause();
  example = examples[Number(select.value)];
  index = 0;
  const min = Math.min(0, ...example.values);
  const span = Math.max(...example.values) - min || 1;
  bars = example.values.map(value => {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.textContent = value;
    bar.style.height = (15 + 73 * (value - min) / span) + "%";
    return bar;
  });
  plot.replaceChildren(...bars);
  render();
}

function render() {
  const frame = example.frames[index];
  const gap = Math.min(3, 20 / example.values.length);
  const slot = (100 - gap * frame.cuts.length) / example.values.length;
  frame.order.forEach((item, position) => {
    const bar = bars[item];
    const precedingCuts = frame.cuts.filter(cut => cut <= position).length;
    bar.style.left = (position * slot + precedingCuts * gap + slot * 0.07) + "%";
    bar.style.width = (slot * 0.86) + "%";
    bar.classList.toggle("active", frame.active.includes(item));
  });
  status.textContent = frame.message;
  step.textContent = (index + 1) + " / " + example.frames.length;
  back.disabled = index === 0;
  next.disabled = index === example.frames.length - 1;
}

function pause() {
  clearInterval(timer);
  timer = undefined;
  play.textContent = "Play";
}

function seek(position) {
  pause();
  index = position;
  render();
}

play.onclick = () => {
  if (timer !== undefined) {
    pause();
    return;
  }
  if (next.disabled) seek(0);
  play.textContent = "Pause";
  timer = setInterval(() => {
    index += 1;
    render();
    if (next.disabled) pause();
  }, 900);
};
back.onclick = () => seek(index - 1);
next.onclick = () => seek(index + 1);
document.getElementById("reset").onclick = () => seek(0);
select.onchange = loadExample;
loadExample();
</script>
</body>
</html>
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path,
                        default=Path(__file__).with_name("algorithm.md"))
    parser.add_argument("-o", "--output", type=Path, default=Path("merge_sort.html"))
    args = parser.parse_args()
    try:
        examples = read_examples(args.source.read_text(encoding="utf-8-sig"))
        if args.output.resolve() == args.source.resolve():
            raise ValueError("Choose an output path different from the Markdown source.")
        data = json.dumps([trace(values) for values in examples])
        args.output.write_text(HTML.replace("__EXAMPLES__", data), encoding="utf-8")
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    print(f"Open {args.output.resolve()} in your browser.")


if __name__ == "__main__":
    main()
