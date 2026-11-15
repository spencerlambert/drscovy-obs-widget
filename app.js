const GRAPHQL_URL = "https://api.drscovy.com/graphql";
const POLL_MS = 15 * 1000;
const CLAIM_WINDOW_MS = 5 * 60 * 1000;
const RANK_WINDOW_MS = 4 * 60 * 60 * 1000;
const RANK_LIMIT = 7;

const RAID_LIMIT = 7;

const GET_RECENT_RAIDS = `
  query RecentRaids {
    raids(orderBy: CREATED_AT_DESC, first: ${RAID_LIMIT}) {
      nodes {
        id
        createdAt
        streamer
      }
    }
  }
`;

const TOKEN_RANK = `
  mutation TokenRank($startAt: Datetime!, $endAt: Datetime!, $outOf: Int!) {
    tokenRank(input: { startAt: $startAt, endAt: $endAt, outOf: $outOf }) {
      results {
        name
        tokens
      }
    }
  }
`;

let raids = [];
let tickTimer = null;

async function graphql(query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.errors?.[0]?.message || `HTTP ${res.status}`);
  }
  if (body.errors?.length) {
    const err = new Error(body.errors.map((e) => e.message).join("; "));
    err.graphql = body;
    throw err;
  }
  return body.data;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatWhen(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function remainingMs(closesAt) {
  if (!closesAt) return 0;
  return Math.max(0, closesAt - Date.now());
}

function claimLabel(closesAt) {
  const left = remainingMs(closesAt);
  if (left <= 0) return { text: "CLOSED", open: false };
  const totalSec = Math.ceil(left / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return { text: `OPEN ${minutes}:${pad2(seconds)}`, open: true };
}

function setStatus(message) {
  const el = document.getElementById("status");
  if (!message) {
    el.hidden = true;
    el.classList.remove("error");
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.classList.add("error");
  el.textContent = message;
}

function renderVault() {
  const list = document.getElementById("raids");
  list.replaceChildren();

  if (!raids.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No raids yet";
    list.append(empty);
    return;
  }

  raids.forEach((raid) => {
    const li = document.createElement("li");
    const when = document.createElement("span");
    when.className = "when";
    when.textContent = formatWhen(raid.createdAt);
    const streamer = document.createElement("span");
    streamer.className = "streamer";
    streamer.textContent = raid.streamer;
    const claim = document.createElement("span");
    const status = claimLabel(raid.closesAt);
    claim.className = status.open ? "claim open" : "claim closed";
    claim.textContent = status.text;
    li.append(when, streamer, claim);
    list.append(li);
  });
}

function renderEarners(rows) {
  const list = document.getElementById("earners");
  list.replaceChildren();
  if (!rows?.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No earners in the last 4 hours";
    list.append(empty);
    return;
  }
  rows.forEach((row, i) => {
    const li = document.createElement("li");
    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = `${i + 1}`;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = row.name;
    const tokens = document.createElement("span");
    tokens.className = "tokens";
    tokens.textContent = String(row.tokens);
    li.append(rank, name, tokens);
    list.append(li);
  });
}

function closesAtFromResult(row, createdAt) {
  const created = new Date(createdAt).getTime();
  if (row) {
    const ms =
      (Number(row.minutesUntilClose) || 0) * 60 * 1000 +
      (Number(row.secondsUntilClose) || 0) * 1000;
    return ms > 0 ? Date.now() + ms : created;
  }
  return created + CLAIM_WINDOW_MS;
}

function raidClosesInMutation(ids) {
  const decls = ids.map((_, i) => `$id${i}: UUID!`).join(", ");
  const fields = ids
    .map(
      (_, i) => `
      r${i}: raidClosesIn(input: { twitchRaidId: $id${i} }) {
        results {
          minutesUntilClose
          secondsUntilClose
        }
      }`
    )
    .join("");
  return `mutation RaidClosesIn(${decls}) { ${fields} }`;
}

async function fetchRaidClosesAt(nodes) {
  if (!nodes.length) return [];
  const variables = {};
  nodes.forEach((raid, i) => {
    variables[`id${i}`] = raid.id;
  });
  try {
    const data = await graphql(raidClosesInMutation(nodes.map((r) => r.id)), variables);
    return nodes.map((raid, i) => ({
      ...raid,
      closesAt: closesAtFromResult(data[`r${i}`]?.results?.[0], raid.createdAt),
    }));
  } catch (err) {
    console.warn("[raidClosesIn]", err.message);
    return nodes.map((raid) => ({
      ...raid,
      closesAt: new Date(raid.createdAt).getTime() + CLAIM_WINDOW_MS,
    }));
  }
}

async function fetchTokenRank() {
  const endAt = new Date();
  const startAt = new Date(endAt.getTime() - RANK_WINDOW_MS);
  const data = await graphql(TOKEN_RANK, {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    outOf: RANK_LIMIT,
  });
  return data.tokenRank?.results || [];
}

async function refresh() {
  try {
    const [raidData, rankRows] = await Promise.all([
      graphql(GET_RECENT_RAIDS),
      fetchTokenRank(),
    ]);

    const nodes = raidData.raids?.nodes || [];
    raids = await fetchRaidClosesAt(nodes);
    renderEarners(rankRows);

    renderVault();
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Could not reach api.drscovy.com");
  }
}

function startTicks() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(renderVault, 250);
}

async function main() {
  renderEarners([]);
  startTicks();
  await refresh();
  setInterval(refresh, POLL_MS);
}

main();
