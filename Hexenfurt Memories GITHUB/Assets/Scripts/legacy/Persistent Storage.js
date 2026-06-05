//@input string[] loreIds {"label":"Lore IDs"}
// (Optional) You can still override at runtime via global.persistentStorage.registerLoreIds([...])

var self = {};
global.persistentStorage = self;

// --- Store handle ---
var store = global.persistentStorageSystem && global.persistentStorageSystem.store;
if (!store) {
    print("WARNING: PersistentStorageSystem.store not available. Using volatile fallback.");
    var _mem = {};
    store = {
        getInt: function(k){ return _mem[k] | 0; },
        putInt: function(k,v){ _mem[k] = (v|0); },
        getFloat: function(k){ return typeof _mem[k] === "number" ? _mem[k] : 0.0; },
        putFloat: function(k,v){ _mem[k] = +v || 0.0; },
        getString: function(k){ return _mem[k] || ""; },
        putString: function(k,v){ _mem[k] = String(v); }
    };
}
script.store = store; // compatibility with prior sample code

// --- Keys & schema ---
var PS_PREFIX = "er_";
var KEY_LORE_SEEN = PS_PREFIX + "lore_seen_v1";   // JSON array of seen lore ids
var KEY_STATS_PREFIX = PS_PREFIX + "stat_";       // per-stat key prefix
var KEY_FIRST_GAME_PLAYED = PS_PREFIX + "first_game_played"; // int flag 0/1

// --- Stats schema ---
var STATS_SCHEMA = {
    vasesBroken: "int",
    bookstacksToppled: "int",
    doorsOpened: "int",
    puzzlesSolved: "int",
    fastestEscape: "float",
    notesCollected: "int",
    keysFound: "int",
    roundPlayed: "int",
    safesCracked: "int"
};

// --- Lore master list (from string array input or empty) ---
var LORE_IDS = Array.isArray(script.loreIds) ? script.loreIds.slice() : [];

// --- Internal cache for seen lore ---
var loreSeenSet = loadLoreSeenSet();

// ---------- Utils ----------
function getStatKey(name){ return KEY_STATS_PREFIX + name; }
function getStatType(name){ return STATS_SCHEMA[name]; }

// ---------- Lore persistence ----------
function loadLoreSeenSet() {
    var raw = store.getString(KEY_LORE_SEEN);
    if (!raw) { return {}; }
    try {
        var arr = JSON.parse(raw);
        var out = {};
        for (var i = 0; i < arr.length; i++) { out[arr[i]] = true; }
        return out;
    } catch (e) {
        print("PersistentStorage: Failed to parse lore seen JSON, resetting.");
        return {};
    }
}
function saveLoreSeenSet() {
    var list = Object.keys(loreSeenSet);
    store.putString(KEY_LORE_SEEN, JSON.stringify(list));
}

// ---------- Stats API ----------
self.getStat = function(name) {
    var t = getStatType(name);
    if (!t) { print("Unknown stat: " + name); return null; }
    var key = getStatKey(name);
    if (t === "int")   { return store.getInt(key); }
    if (t === "float") { return store.getFloat(key); }
    return null;
};

self.setStat = function(name, value) {
    var t = getStatType(name);
    if (!t) { print("Unknown stat: " + name); return; }
    var key = getStatKey(name);
    if (t === "int")   { store.putInt(key, Math.floor(+value || 0)); }
    if (t === "float") { store.putFloat(key, +value || 0.0); }
};

self.increaseStat = function(name, amount) {
    var t = getStatType(name);
    if (!t) { print("Unknown stat: " + name); return null; }
    var delta = (amount === undefined) ? 1 : +amount;
    if (isNaN(delta)) { delta = 0; }

    var key = getStatKey(name);
    var cur = (t === "int") ? store.getInt(key) : store.getFloat(key);
    if (typeof cur !== "number") { cur = 0; }

    var next = cur + delta;
    if (t === "int") { next = Math.floor(next); }

    if (t === "int")   { store.putInt(key, next); }
    if (t === "float") { store.putFloat(key, next); }
    return next;
};

// Lower-is-better timer helper
self.updateFastestEscapeIfBetter = function(seconds) {
    var key = getStatKey("fastestEscape");
    var cur = store.getFloat(key);
    if (cur <= 0 || (seconds > 0 && seconds < cur)) {
        store.putFloat(key, seconds);
        return seconds;
    }
    return cur;
};

self.getAllStats = function() {
    var out = {};
    for (var k in STATS_SCHEMA) {
        out[k] = self.getStat(k);
    }
    return out;
};

// ---------- First-game flag ----------
self.hasPlayedFirstGame = function() {
    return store.getInt(KEY_FIRST_GAME_PLAYED) === 1;
};

self.markFirstGamePlayed = function() {
    store.putInt(KEY_FIRST_GAME_PLAYED, 1);
};

// ---------- Lore API ----------
self.registerLoreIds = function(list) {
    if (Array.isArray(list) && list.length) {
        LORE_IDS = list.slice();
    }
};

self.addLoreSeen = function(loreId) {
    if (!loreId) { return false; }
    if (!loreSeenSet[loreId]) {
        loreSeenSet[loreId] = true;
        saveLoreSeenSet();
        return true; // newly added
    }
    return false; // already seen
};

self.hasSeenLore = function(loreId) {
    return !!loreSeenSet[loreId];
};

self.getSeenLoreList = function() {
    return Object.keys(loreSeenSet);
};

self.checkLoreItemsNotSeen = function() {
    var notSeen = [];
    for (var i = 0; i < LORE_IDS.length; i++) {
        var id = LORE_IDS[i];
        if (!loreSeenSet[id]) {
            notSeen.push(id);
        }
    }
    return notSeen;
};

// ---------- Maintenance helpers (optional) ----------
self.resetAllLore = function() {
    loreSeenSet = {};
    saveLoreSeenSet();
};

self.resetStats = function() {
    for (var k in STATS_SCHEMA) {
        self.setStat(k, 0);
    }
};

// (Optional) touch keys on init if needed
(function initDefaults(){
    // No explicit writes needed—Lens getters default to 0/0.0.
})();

// self.resetStats();
// self.resetAllLore();
// store.putInt(KEY_FIRST_GAME_PLAYED, 0);

// self.addLoreSeen("witch_note_1");
// self.addLoreSeen("witch_note_2");